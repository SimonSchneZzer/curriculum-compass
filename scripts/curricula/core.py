"""Shared logic: download a curriculum page, parse it, turn it into the app's data model, check ECTS totals.

A department module (scripts/curricula/departments/<id>.py) defines DEPARTMENT and PROGRAMMES. Each programme
has a `classify(course)` function that returns None (compulsory for everyone) or a dict with:

  track       {"major": "film"}                   course only applies to that track option
              {"major": ["a", "b"]}               course belongs to several track options
  group       dict(id, label, choose=1, note=None, open=False, onlyFor=None, linkedTrack=None,
                   option=<id>, optionLabel=<label>, optionTrack=<track>)
              the course is one option (or part of a bundled option) of a per-semester choice
  extraGroups [dict(id, label, note, onlyFor)]   the course is *also* an option of another group

A group may set budget=<ECTS> (and budgetSws) instead of choose: "pick courses worth this many ECTS".
Programme meta may set url=<curriculum page> when it is not /en/study/<dept>/<slug>/curriculum (German pages work too).

Only courses whose kind is "elective" can be put into a group; compulsory courses stay compulsory.
"""
import html, itertools, json, os, re, urllib.request

BASE = "https://www.fh-salzburg.ac.at"
USER_AGENT = "curriculum-compass-data-script"

KIND = {"Compulsory": "compulsory", "Elective": "elective", "Project": "compulsory",
        "Bachelor thesis": "thesis", "Diploma/master thesis": "thesis",
        "Internship (N)": "internship", "Internship (S)": "internship",
        # German pages
        "Pflicht": "compulsory", "Wahlpflicht": "elective", "Projekt": "compulsory",
        "Bachelorarbeit": "thesis", "Diplom/Masterarbeit": "thesis"}
ASSESS = {"final": "final", "immanent": "continuous", "abschließend": "final"}

# Some programmes only have a German curriculum page; same HTML, German labels.
GERMAN_LABELS = {"Studienjahr": "Academic year", "Lehrveranstaltungsnummer": "Course code", "Typ": "Type", "Art": "Kind",
                 "Unterrichtssprache": "Language of instruction", "ECTS-Punkte": "ECTS Credits",
                 "Prüfungscharakter": "Examination character", "_Lehrveranstaltungsinhalte": "_Lecture content",
                 "_Lernergebnis": "_Learning Outcomes", "_Übergeordnetes Modul": "_Superior module"}
LANGUAGES = {"Deutsch": "German", "Englisch": "English", "Italienisch": "Italian", "Spanisch": "Spanish"}


def kind_of(k):
    if k in KIND:
        return KIND[k]
    if k.lower().startswith(("internship", "praktikum", "berufspraktikum")):
        return "internship"
    raise KeyError(f"unknown course kind {k!r}")

LEGEND = dict(
    sws="Weekly contact hours over 14 weeks (SWS 2 = 28 contact hours for the whole course).",
    ects="Workload in ECTS credits; 1 ECTS credit is about 25 hours of work.",
    semester="Odd semesters run in winter (mid-September to end of January), even semesters in summer (mid-February to end of June).",
    assessment={"final": "Assessed at the end of the course (exam).", "continuous": "Assessed continuously during the course."},
    types={"BP": "Bachelor final exam", "DP": "Master final exam", "MP": "Master final exam",
           "IL": "Lecture with integrated project work", "IT": "Individual training / phases", "LB": "Lab session",
           "PS": "Pro-seminar", "PT": "Project", "RC": "Course with integrated reflective practice", "RE": "Revision course",
           "SE": "Seminar", "TU": "Tutorial", "UB": "Practice session", "VO": "Lecture"},
)
# Types that some pages use without explaining them. Departments may add their own via TYPE_NOTES.
TYPE_NOTES = {"EX": "Not defined in the source legend",
              **{t: "Course type of Paris Lodron University Salzburg; not explained on the curriculum page" for t in ("KO", "UV", "VP")}}


# ---------- download + parse ----------

def page_url(dept, meta):
    """The curriculum page: meta["url"] (absolute or site path) if the programme has an unusual one."""
    url = meta.get("url")
    if url:
        return url if url.startswith("http") else BASE + url
    return f"{BASE}/en/study/{dept}/{meta['slug']}/curriculum"


def download(dept, meta, cache_dir):
    slug = meta["slug"]
    suffix = "" if not meta.get("url") else "_" + re.sub(r"[^a-z0-9]+", "-", meta["url"].lower())[-60:]
    path = os.path.join(cache_dir, f"{dept}_{slug}{suffix}.html")
    if not os.path.exists(path):
        req = urllib.request.Request(page_url(dept, meta), headers={"User-Agent": USER_AGENT})
        with urllib.request.urlopen(req) as r, open(path, "wb") as f:
            f.write(r.read())
    return path


def _txt(s):
    return html.unescape(re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", s))).strip()


def parse(path):
    """Returns one dict per course block of the page (table fields + '_<h4 heading>' texts)."""
    t = open(path, encoding="utf-8").read()
    t = t[t.rfind("TYPO3SEARCH_begin"):t.rfind("TYPO3SEARCH_end")]
    out = []
    for m in re.finditer(r'<div class="card-body content-area"><h3>(.*?)</h3>(.*?)(?=<div class="card"><div class="card-header"|<h2>|$)', t, re.S):
        body = m.group(2)
        fields = {_txt(a): _txt(b) for a, b in re.findall(r"<th>(.*?)</th><td>(.*?)</td>", body, re.S)}
        texts = {"_" + _txt(a).rstrip(":"): _txt(b) for a, b in re.findall(r"<h4>(.*?)</h4>\s*<p>(.*?)</p>", body, re.S)}
        row = dict(title=_txt(m.group(1)), **fields, **texts)
        out.append({GERMAN_LABELS.get(k, k): v for k, v in row.items()})
    return out


# ---------- build ----------

def num(s):
    v = float(s.replace(",", "."))
    return int(v) if v == int(v) else v


def clean(s):
    return (s or "").replace("¿", "’").strip()


def base_course(c, fix_titles):
    title = clean(fix_titles.get(c["title"], c["title"]))
    return dict(code=c["Course code"], title=title, semester=int(c["Semester"]), type=c["Type"],
                kind=kind_of(c["Kind"]), sws=num(c["SWS"]), ects=num(c["ECTS Credits"]),
                language=LANGUAGES.get(c["Language of instruction"], c["Language of instruction"]),
                assessment=ASSESS.get(c["Examination character"], c["Examination character"]),
                module=clean(c.get("_Superior module")), content=clean(c.get("_Lecture content")),
                learningOutcome=clean(c.get("_Learning Outcomes")), track=None, group=None)


def _new_group(g, semester):
    out = dict(id=g["id"], semester=semester, label=g["label"], choose=g.get("choose", 1), note=g.get("note"),
               open=g.get("open", False), onlyFor=g.get("onlyFor"), linkedTrack=g.get("linkedTrack"), options=[])
    # budget: pick courses worth this many ECTS in total (instead of a number of options), budgetSws: their SWS
    # sync: groups in different semesters that share it also share the picks (same choice, e.g. two specialisations)
    for k in ("budget", "budgetSws", "sync"):
        if g.get(k) is not None:
            out[k] = g[k]
    return out


def build(dept, meta, cache_dir, as_of):
    raw = parse(download(dept["id"], meta, cache_dir))
    if not raw:
        raise RuntimeError(f"{meta['id']}: no courses found on {page_url(dept['id'], meta)}")
    classify = meta.get("classify") or (lambda c: None)
    courses, groups = [], {}
    seen = set()
    for r in raw:
        c = base_course(r, meta.get("fixTitles", {}))
        # Some pages give two different courses the same code; keep the code unique in our data.
        if c["code"] in seen:
            c["sourceCode"] = c["code"]
            n = 2
            while f"{c['sourceCode']}-{n}" in seen:
                n += 1
            c["code"] = f"{c['sourceCode']}-{n}"
        seen.add(c["code"])
        res = classify(c) or {}
        if c["kind"] != "elective":
            res.pop("group", None)  # compulsory courses inside an elective module stay compulsory
        c["track"] = res.get("track")
        if "group" in res:
            g = res["group"]
            groups.setdefault(g["id"], _new_group(g, c["semester"]))
            opt_id = g.get("option", c["code"])
            opt = next((o for o in groups[g["id"]]["options"] if o["id"] == opt_id), None)
            if not opt:
                opt = dict(id=opt_id, label=g.get("optionLabel", c["title"]), courses=[])
                if g.get("optionTrack"):
                    opt["track"] = g["optionTrack"]
                groups[g["id"]]["options"].append(opt)
            opt["courses"].append(c["code"])
            c["group"] = g["id"]
        for extra in res.get("extraGroups", []):
            groups.setdefault(extra["id"], _new_group(extra, c["semester"]))
            groups[extra["id"]]["options"].append(dict(id=c["code"], label=c["title"], courses=[c["code"]]))
        courses.append(c)
    add_extra_options(meta, groups, courses)
    for g in meta.get("extraSlots", []):
        # Something the page does not list (free electives, courses at a partner university): ECTS/SWS only.
        # compulsory=True marks courses everyone takes (shown and counted with the compulsory courses).
        groups[g["id"]] = dict(dict(choose=1, open=True, onlyFor=None, linkedTrack=None, options=[]), **g)
    tracks = [dict(key=t["key"], label=t["label"], fromSemester=t.get("fromSemester", 1), options=t["options"])
              for t in meta.get("tracks", [])]
    brochure = meta.get("brochure")
    return dict(
        id=meta["id"], department=dept["id"], name=meta["name"], degree=meta["degree"], mode=meta["mode"],
        language=meta["language"], semesters=meta["semesters"], ectsTotal=meta.get("ectsTotal", meta["semesters"] * 30),
        dataAsOf=as_of,
        source=dict(curriculum=page_url(dept["id"], meta),
                    brochure=dict(url=BASE + brochure["url"], version=brochure["version"]) if brochure else None),
        tracks=tracks, notes=meta.get("notes", []), groups=list(groups.values()), courses=courses)


def add_extra_options(meta, groups, courses):
    """Options the page does not list (e.g. joining a project of another programme). Each copies ECTS, SWS, type and
    assessment from the group's first option and gets the area as last part of the label, so series across semesters
    still match ("Master Project - Development - CDE GAME"). Marked virtual=True; the note says where it comes from."""
    for x in meta.get("extraOptions", []):
        g = groups.get(x["group"])
        if not g or not g["options"] or any(o["id"].endswith("-" + x["id"]) for o in g["options"]):
            continue
        ref = next(c for c in courses if c["code"] == g["options"][0]["courses"][0])
        code = f"{ref['code']}-{x['id']}"
        title = ref["title"].rsplit(" - ", 1)[0] + " - " + x["area"] if " - " in ref["title"] else f"{ref['title']} - {x['area']}"
        courses.append(dict(ref, code=code, title=title, content=x["note"], learningOutcome="", virtual=True, sourceCode=None))
        g["options"].append(dict(id=code, label=title, courses=[code]))


# ---------- check ----------

def semester_totals(d, sel):
    by = {c["code"]: c for c in d["courses"]}
    out = []
    for s in range(1, d["semesters"] + 1):
        tot = 0
        for c in d["courses"]:
            if c["semester"] == s and not c["group"] and (c["track"] is None or all(
                    sel.get(k) in v if isinstance(v, list) else sel.get(k) == v for k, v in c["track"].items())):
                tot += c["ects"]
        for g in d["groups"]:
            if g["semester"] != s or (g.get("onlyFor") and any(sel.get(k) != v for k, v in g["onlyFor"].items())):
                continue
            if not g["options"]:
                tot += g.get("ects", 0)
                continue
            if g.get("budget") is not None:
                tot += g["budget"]
                continue
            vals = sorted((sum(by[x]["ects"] for x in o["courses"]) for o in g["options"]), reverse=True)
            tot += sum(vals[: g["choose"]])
        out.append(round(tot, 1))
    return out


def check(d):
    """Prints ECTS per semester for every track combination; returns the combinations that miss 30 per semester."""
    combos = [dict(zip([t["key"] for t in d["tracks"]], vals))
              for vals in itertools.product(*[[o["id"] for o in t["options"]] for t in d["tracks"]])]
    per_sem = d["ectsTotal"] / d["semesters"]
    bad = []
    print(f"{d['id']:10s} {len(d['courses']):4d} courses, {len(d['groups']):2d} groups")
    for sel in combos:
        t = semester_totals(d, sel)
        flag = "" if all(abs(x - per_sem) < 0.01 for x in t) else "   <-- check"
        if flag:
            bad.append((sel, t))
        print(f"    {sel or '(no tracks)'} {t}{flag}")
    return bad


def write_json(path, data):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")
