#!/usr/bin/env python3
"""Curriculum Compass – "/" in the search asks an AI about the programme that is open.

A tiny HTTP service (Python standard library only). The static app posts to `api/ask` (relative to the app); nginx in
front of the app passes /api/ to this service. The API key never reaches the browser.

  POST /api/ask     {"programme": "cis-b", "question": "…", "lang": "en"|"de", "sel": {"major": "web", …}}
                    → 200 {"answer": "…"} · 400 bad input · 429 {"error": "limit"|"quota"} · 502/503 {"error": …}
  GET  /api/health  → {"ok": true, "configured": bool}

The model only gets this programme's data (from data/<id>.json of the app) and is told to answer from it alone.
Nothing is stored: questions are not logged, only status, size and usage.

Settings (environment, e.g. ~/compass/ai.env on the server – never commit the key):
  CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN   Workers AI (own free account; when the daily free allocation is used
                                                up, Cloudflare refuses → the app shows "busy for today")
  CLOUDFLARE_MODEL      default @cf/google/gemma-4-26b-a4b-it
  COMPASS_DATA          folder with <id>.json, default /site/data
  PORT                  default 8080
"""
from __future__ import annotations

import json
import os
import re
import threading
import time
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

DATA = Path(os.environ.get("COMPASS_DATA", "/site/data"))
ACCOUNT = os.environ.get("CLOUDFLARE_ACCOUNT_ID", "").strip()
TOKEN = os.environ.get("CLOUDFLARE_API_TOKEN", "").strip()
MODEL = os.environ.get("CLOUDFLARE_MODEL", "@cf/google/gemma-4-26b-a4b-it")
PORT = int(os.environ.get("PORT", "8080"))

MAX_BODY = 4096
MAX_QUESTION = 500
PER_IP = (8, 600)            # at most 8 questions per IP in 10 minutes
PER_DAY = 400                # and 400 a day in total (the free allocation runs out before that anyway)
CONTENT_CHARS = 120          # course content per course in the context (keeps every question cheap)

_lock = threading.Lock()
_hits: dict[str, list[float]] = {}
_day = {"date": "", "count": 0, "quota_until": 0.0}


def configured() -> bool:
    return bool(ACCOUNT and TOKEN)


# ---------- context: the open programme, compact ----------
def _num(v) -> str:
    return f"{float(v):g}"


def clean_totals(raw) -> list[dict]:
    """Semester totals the app computed for the viewer's picks (numbers only, at most 12 semesters)."""
    out = []
    for t in (raw if isinstance(raw, list) else [])[:12]:
        try:
            out.append({k: float(t[k]) for k in ("s", "ects", "sws", "hours")})
        except (TypeError, KeyError, ValueError):
            continue
    return out


def build_context(prog: dict, sel: dict | None, lang: str, totals: list[dict] | None = None) -> str:
    sel = sel or {}
    opt_name = {(t["key"], o["id"]): o.get("name") or o.get("label") or o["id"] for t in prog["tracks"] for o in t["options"]}
    lines = [f"Programme: {prog['name']} ({prog['degree']}), {prog.get('mode', '')}, taught in {prog.get('language', '')}, "
             f"{prog['semesters']} semesters, {_num(prog['ectsTotal'])} ECTS. Data as of {prog.get('dataAsOf', '?')}."]
    for t in prog["tracks"]:
        names = ", ".join(opt_name[(t["key"], o["id"])] for o in t["options"])
        picked = opt_name.get((t["key"], sel.get(t["key"])))
        lines.append(f"Choice '{t.get('label') or t['key']}': {names}." + (f" The viewer picked: {picked}." if picked else ""))
    if totals:
        lines.append("Semester totals for the viewer's current picks (computed by the app – use these, do not add up courses): "
                     + "; ".join(f"semester {t['s']:g}: {t['ects']:g} ECTS, {t['sws']:g} SWS, about {t['hours']:g} h of work" for t in totals) + ".")
    for n in prog.get("notes") or []:
        lines.append(f"Note{' (semester ' + str(n['semester']) + ')' if n.get('semester') else ''}: {n.get('text', '')}")
    groups = {g["id"]: g for g in prog.get("groups") or []}
    for s in range(1, int(prog["semesters"]) + 1):
        lines.append(f"\nSemester {s}:")
        for c in prog["courses"]:
            if str(c.get("semester")) != str(s) or c.get("group"):
                continue
            who = "everyone"
            if c.get("track"):
                names = []
                for k, v in c["track"].items():
                    for one in (v if isinstance(v, list) else [v]):
                        names.append(str(opt_name.get((k, one), one)))
                who = " / ".join(names) + " only"
            content = (c.get("content") or "").strip()
            if len(content) > CONTENT_CHARS:
                content = content[:CONTENT_CHARS].rsplit(" ", 1)[0] + "…"
            lines.append(f"- {c['title']} | {c.get('type', '')} | {_num(c.get('sws') or 0)} SWS | {_num(c.get('ects') or 0)} ECTS | "
                         f"{'final exam' if c.get('assessment') == 'final' else 'continuous assessment'} | {who}"
                         + (f" | {content}" if content else ""))
        for g in groups.values():
            if str(g.get("semester")) != str(s) or not g.get("options"):
                continue
            opts = "; ".join(o.get("label", o["id"]) for o in g["options"])
            lines.append(f"- Choice '{g.get('label', '')}': pick {g.get('choose', 1)} of: {opts}")
    return "\n".join(lines)


SYSTEM = """You are the assistant inside Curriculum Compass, an unofficial overview of the FH Salzburg curricula.
Answer questions about the one degree programme described in the data below – courses, semesters, ECTS, SWS,
workload, electives, majors/specialisations, assessment and allowed absence.
Rules:
- Use only the data below. If the answer is not in it, say so briefly and point to the official curriculum page or
  the study regulations. Never invent courses, numbers, dates or rules.
- The overview is unofficial; where it differs from the study regulations, the regulations apply.
- For totals per semester use the given "Semester totals" line; list only the courses that apply to the viewer's picks
  ("everyone" plus their own major/specialisation) unless they ask about another one.
- Useful facts: 1 ECTS ≈ 25 hours of work. 1 SWS = 14 lessons of 45 minutes per semester. Allowed absence at 75 %
  attendance = 25 % of the lessons, at 50 % = half (rounded down); which rule applies is set by the course.
- Keep it short: 1–4 sentences or a short list. Plain text, at most **bold** and "- " lists. No tables.
- Answer in {lang}. Politely decline anything unrelated to studying this programme.

DATA
{data}"""


# ---------- Workers AI ----------
class Quota(Exception):
    pass


def is_quota_error(status: int, body: str) -> bool:
    b = body.lower()
    return status == 429 or "4006" in b or "daily free allocation" in b or "neurons" in b and "used up" in b


def ask_model(system: str, question: str) -> tuple[str, dict]:
    body = json.dumps({"model": MODEL, "messages": [{"role": "system", "content": system}, {"role": "user", "content": question}],
                       "max_tokens": 450, "temperature": 0.3, "chat_template_kwargs": {"enable_thinking": False}}).encode()
    req = urllib.request.Request(f"https://api.cloudflare.com/client/v4/accounts/{ACCOUNT}/ai/v1/chat/completions", data=body,
                                 headers={"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=40) as r:
            d = json.load(r)
    except urllib.error.HTTPError as e:
        text = e.read().decode("utf-8", "replace")[:600]
        if is_quota_error(e.code, text):
            raise Quota(text)
        raise RuntimeError(f"HTTP {e.code}: {text[:200]}")
    answer = ((d.get("choices") or [{}])[0].get("message") or {}).get("content") or ""
    return answer.strip(), d.get("usage") or {}


# ---------- limits ----------
def allow(ip: str, now: float) -> str | None:
    with _lock:
        today = time.strftime("%Y-%m-%d", time.gmtime(now))
        if _day["date"] != today:
            _day.update(date=today, count=0)
        if now < _day["quota_until"]:
            return "quota"
        if _day["count"] >= PER_DAY:
            return "quota"
        n, window = PER_IP
        hits = [t for t in _hits.get(ip, []) if now - t < window]
        if len(hits) >= n:
            _hits[ip] = hits
            return "limit"
        hits.append(now)
        _hits[ip] = hits
        _day["count"] += 1
        if len(_hits) > 5000:                      # keep memory small
            for k in list(_hits)[:2500]:
                _hits.pop(k, None)
    return None


def next_utc_midnight(now: float) -> float:
    return (int(now) // 86400 + 1) * 86400


# ---------- HTTP ----------
class Handler(BaseHTTPRequestHandler):
    server_version = "compass-ask"
    sys_version = ""

    def log_message(self, fmt, *args):          # no request lines (they would contain nothing useful anyway)
        pass

    def send(self, status: int, obj: dict) -> None:
        raw = json.dumps(obj, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def do_GET(self):
        if self.path.rstrip("/") == "/api/health":
            return self.send(200, {"ok": True, "configured": configured()})
        self.send(404, {"error": "not found"})

    def do_POST(self):
        if self.path.rstrip("/") != "/api/ask":
            return self.send(404, {"error": "not found"})
        if not configured():
            return self.send(503, {"error": "off"})
        try:
            size = int(self.headers.get("Content-Length") or 0)
            if not 0 < size <= MAX_BODY:
                return self.send(400, {"error": "bad request"})
            req = json.loads(self.rfile.read(size))
            pid = str(req.get("programme", ""))
            question = " ".join(str(req.get("question", "")).split())[:MAX_QUESTION]
            lang = "German" if req.get("lang") == "de" else "English"
            sel = req.get("sel") if isinstance(req.get("sel"), dict) else {}
            totals = clean_totals(req.get("totals"))
            if not re.fullmatch(r"[a-z0-9-]{2,24}", pid) or len(question) < 2:
                return self.send(400, {"error": "bad request"})
            prog = json.loads((DATA / f"{pid}.json").read_text())
        except FileNotFoundError:
            return self.send(400, {"error": "unknown programme"})
        except Exception:
            return self.send(400, {"error": "bad request"})

        ip = (self.headers.get("X-Forwarded-For") or self.client_address[0]).split(",")[0].strip()
        now = time.time()
        blocked = allow(ip, now)
        if blocked:
            return self.send(429, {"error": blocked, "until": int(next_utc_midnight(now)) if blocked == "quota" else None})
        t0 = time.time()
        try:
            system = SYSTEM.replace("{lang}", lang).replace("{data}", build_context(prog, sel, lang, totals))
            answer, usage = ask_model(system, question)
        except Quota:
            with _lock:
                _day["quota_until"] = next_utc_midnight(now)
            print(f"ask {pid}: quota used up for today", flush=True)
            return self.send(429, {"error": "quota", "until": int(next_utc_midnight(now))})
        except Exception as e:
            print(f"ask {pid}: error {type(e).__name__}: {str(e)[:200]}", flush=True)
            return self.send(502, {"error": "upstream"})
        print(f"ask {pid}: ok {time.time() - t0:.1f} s · tokens {usage.get('prompt_tokens')}/{usage.get('completion_tokens')}", flush=True)
        if not answer:
            return self.send(502, {"error": "upstream"})
        self.send(200, {"answer": answer})


if __name__ == "__main__":
    print(f"compass-ask on :{PORT} · data {DATA} · {'configured' if configured() else 'NOT configured (no key)'}", flush=True)
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
