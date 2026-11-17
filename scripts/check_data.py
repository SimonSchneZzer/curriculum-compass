"""Checks whether the FH Salzburg data changed, without touching the published data.

usage:
  python3 scripts/check_data.py [--state FILE] [--json FILE]

What it does:
  1. Runs update_data.py on a temporary copy of the repository and compares the new data/*.json with the published
     files (dataAsOf is ignored).
  2. Compares the programme links on the department pages with the programmes we know (new or removed programmes).
  3. Compares the programme brochures (PDFs) with the fingerprints saved in --state from the last run.

Prints a short summary. Exit code: 0 = nothing changed, 1 = something changed (review, then run update_data.py and
publish), 2 = the check itself failed (e.g. FH changed its page layout and a page can no longer be parsed).
--json writes the result as JSON (for notifications and the "checked …" date in the app).
"""
import argparse, datetime, hashlib, importlib, json, os, pkgutil, re, shutil, subprocess, sys, tempfile, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
from curricula import core  # noqa: E402
from curricula import departments as dept_pkg  # noqa: E402

# Links on department pages that are not programmes.
NOT_PROGRAMMES = {"specialisations"}


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": core.USER_AGENT})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()


def load(path):
    with open(path, encoding="utf-8") as f:
        d = json.load(f)
    d.pop("dataAsOf", None)
    return d


# ---------- 1. curricula ----------

def course_changes(old, new):
    """Short description of what changed in one programme, or None."""
    oc = {c["code"]: c for c in old["courses"]}
    nc = {c["code"]: c for c in new["courses"]}
    parts = []
    added = [nc[k] for k in nc if k not in oc]
    removed = [oc[k] for k in oc if k not in nc]
    if added:
        parts.append(f"{len(added)} course(s) added (" + ", ".join(f"{c['title']} S{c['semester']}" for c in added[:3])
                     + (", …" if len(added) > 3 else "") + ")")
    if removed:
        parts.append(f"{len(removed)} removed (" + ", ".join(f"{c['title']} S{c['semester']}" for c in removed[:3])
                     + (", …" if len(removed) > 3 else "") + ")")
    facts, texts = [], 0
    for k in oc.keys() & nc.keys():
        a, b = oc[k], nc[k]
        for field in ("ects", "sws", "semester"):
            if a.get(field) != b.get(field):
                facts.append(f"{b['title']}: {field.upper() if field != 'semester' else 'semester'} {a.get(field)} → {b.get(field)}")
        if any(a.get(f) != b.get(f) for f in ("title", "type", "kind", "language", "assessment", "module", "track", "group")):
            facts.append(f"{b['title']}: details changed")
        if a.get("content") != b.get("content") or a.get("learningOutcome") != b.get("learningOutcome"):
            texts += 1
    if facts:
        parts.append("; ".join(facts[:4]) + (f" (+{len(facts) - 4} more)" if len(facts) > 4 else ""))
    if texts:
        parts.append(f"descriptions of {texts} course(s) changed")
    rest = [k for k in old.keys() | new.keys() if k != "courses" and old.get(k) != new.get(k)]
    if rest:
        parts.append("changed: " + ", ".join(sorted(rest)))
    return "; ".join(parts) or None


def check_curricula(result):
    tmp = tempfile.mkdtemp(prefix="compass-check-")
    try:
        shutil.copytree(os.path.join(ROOT, "scripts"), os.path.join(tmp, "scripts"),
                        ignore=shutil.ignore_patterns("__pycache__"))
        shutil.copytree(os.path.join(ROOT, "data"), os.path.join(tmp, "data"))
        run = subprocess.run([sys.executable, os.path.join(tmp, "scripts", "update_data.py")],
                             capture_output=True, text=True)
        if run.returncode != 0:
            last = (run.stderr.strip().splitlines() or ["unknown error"])[-1]
            result["errors"].append(f"update_data.py failed: {last}")
            return
        pub, new = os.path.join(ROOT, "data"), os.path.join(tmp, "data")
        names = {}
        for d in json.load(open(os.path.join(ROOT, "data", "index.json"), encoding="utf-8"))["departments"]:
            for p in d["programmes"]:
                names[p["id"]] = f"{p['name']} {p['degree']}"
        files = sorted(f for f in set(os.listdir(pub)) | set(os.listdir(new))
                       if f.endswith(".json") and f not in ("index.json", "search.json", "checked.json"))
        for f in files:
            pid = f[:-5]
            label = names.get(pid, pid)
            if not os.path.exists(os.path.join(new, f)):
                result["changes"].append(f"{label}: no longer generated")
            elif not os.path.exists(os.path.join(pub, f)):
                result["changes"].append(f"{label}: new data file")
            else:
                what = course_changes(load(os.path.join(pub, f)), load(os.path.join(new, f)))
                if what:
                    result["changes"].append(f"{label}: {what}")
        if load(os.path.join(pub, "index.json")) != load(os.path.join(new, "index.json")) and not result["changes"]:
            result["changes"].append("index.json changed (programme list, names or legend)")
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


# ---------- 2. department pages ----------

def check_programme_lists(result):
    for m in pkgutil.iter_modules(dept_pkg.__path__):
        mod = importlib.import_module(f"curricula.departments.{m.name}")
        dept = mod.DEPARTMENT["id"]
        known = {p["slug"] for p in mod.PROGRAMMES}
        for p in mod.PROGRAMMES:
            hit = re.match(rf"/(?:en/study|studium)/{dept}/([a-z0-9-]+)", p.get("url", "") or "")
            if hit:
                known.add(hit.group(1))
        known |= {u.rstrip("/").split("/")[-1] for u in (x.get("url", "") for x in mod.DEPARTMENT.get("missing", [])) if u}
        try:
            page = fetch(f"{core.BASE}/en/study/{dept}").decode("utf-8", "replace")
        except Exception as e:  # noqa: BLE001
            result["errors"].append(f"department page {dept}: {e}")
            continue
        listed = set(re.findall(rf'href="(?:{re.escape(core.BASE)})?/en/study/{dept}/([a-z0-9-]+)/?"', page)) - NOT_PROGRAMMES
        if not listed:
            result["errors"].append(f"department page {dept}: no programme links found (layout changed?)")
            continue
        for slug in sorted(listed - known):
            result["changes"].append(f"{mod.DEPARTMENT['name']}: new programme on the department page: {slug}")
        for slug in sorted({p["slug"] for p in mod.PROGRAMMES} - listed):
            result["notices"].append(f"{mod.DEPARTMENT['name']}: {slug} is no longer linked on the department page")


# ---------- 3. brochures ----------

def check_brochures(result, state):
    seen = state.setdefault("brochures", {})
    for m in pkgutil.iter_modules(dept_pkg.__path__):
        mod = importlib.import_module(f"curricula.departments.{m.name}")
        for p in mod.PROGRAMMES:
            b = p.get("brochure")
            if not b:
                continue
            url = core.BASE + b["url"]
            try:
                digest = hashlib.sha256(fetch(url)).hexdigest()
            except Exception as e:  # noqa: BLE001
                result["changes"].append(f"{p['name']} {p['degree']}: brochure not reachable ({e})")
                continue
            old = seen.get(url)
            if old and old != digest:
                result["changes"].append(f"{p['name']} {p['degree']}: brochure changed (we use version {b['version']}), "
                                         "check the special cases")
            seen[url] = digest


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--state", help="file with the brochure fingerprints of the last run (created if missing)")
    ap.add_argument("--json", help="write the result as JSON to this file")
    args = ap.parse_args()

    state = {}
    if args.state and os.path.exists(args.state):
        state = json.load(open(args.state, encoding="utf-8"))
    first_brochure_run = not state.get("brochures")
    result = dict(checkedAt=datetime.date.today().isoformat(), changes=[], notices=[], errors=[])

    for step in (check_curricula, check_programme_lists, lambda r: check_brochures(r, state)):
        try:
            step(result)
        except Exception as e:  # noqa: BLE001
            result["errors"].append(f"{getattr(step, '__name__', 'brochures')}: {e}")

    if args.state:
        os.makedirs(os.path.dirname(os.path.abspath(args.state)), exist_ok=True)
        with open(args.state, "w", encoding="utf-8") as f:
            json.dump(state, f, indent=1)
    result["status"] = "failed" if result["errors"] else "changed" if result["changes"] else "unchanged"
    if args.json:
        with open(args.json, "w", encoding="utf-8") as f:
            json.dump(result, f, ensure_ascii=False, indent=1)

    print(f"Data check {result['checkedAt']}: {result['status']}")
    if first_brochure_run and args.state:
        print("(first run: brochure fingerprints saved, they are compared from the next run on)")
    for title, items in (("Errors", result["errors"]), ("Changes", result["changes"]), ("Notices", result["notices"])):
        if items:
            print(f"\n{title}:")
            for i in items:
                print(f"- {i}")
    sys.exit(2 if result["errors"] else 1 if result["changes"] else 0)


if __name__ == "__main__":
    main()
