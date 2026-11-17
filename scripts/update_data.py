"""Downloads the curriculum pages of all Creative Technologies programmes at FH Salzburg and writes data/*.json.

usage: python3 scripts/update_data.py

dataAsOf is set to today. Check the printed ECTS totals afterwards: every semester should come out at 30.
"""
import sys, json, re, html, itertools, datetime, os, tempfile, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "data")
DL = tempfile.mkdtemp(prefix="ct-curricula-")
AS_OF = datetime.date.today().isoformat()
BASE = "https://www.fh-salzburg.ac.at"


# ---------- parsing the curriculum page ----------
def txt(s): return html.unescape(re.sub(r'\s+',' ',re.sub(r'<[^>]+>',' ',s))).strip()
def parse(path):
    t=open(path,encoding='utf-8').read()
    start=t.rfind('TYPO3SEARCH_begin'); end=t.rfind('TYPO3SEARCH_end'); t=t[start:end]
    # sections (h2) = curriculum variants
    out=[]; 
    pos=[(m.start(),'h2',txt(m.group(1))) for m in re.finditer(r'<h2>(.*?)</h2>',t,re.S)]
    pos+=[(m.start(),'c',m) for m in re.finditer(r'<div class="card-body content-area"><h3>(.*?)</h3>(.*?)(?=<div class="card"><div class="card-header"|<h2>|$)',t,re.S)]
    pos.sort(key=lambda x:x[0]); sec=None
    for _,k,v in pos:
        if k=='h2': sec=v; continue
        title=txt(v.group(1)); body=v.group(2)
        f={txt(a):txt(b) for a,b in re.findall(r'<th>(.*?)</th><td>(.*?)</td>',body,re.S)}
        h4={}
        for m in re.finditer(r'<h4>(.*?)</h4>\s*<p>(.*?)</p>',body,re.S): h4[txt(m.group(1)).rstrip(':')]=txt(m.group(2))
        out.append(dict(section=sec,title=title,**f,**{'_'+k:v for k,v in h4.items()}))
    return out


def num(s):
    v = float(s.replace(",", "."))
    return int(v) if v == int(v) else v

def clean(s):
    return (s or "").replace("¿", "’").strip()

FIX_TITLES = {
    "Master Project - Development - Presentationion": "Master Project - Development - Presentation",
    "Interactive Audio Environnements & Interfaces 1": "Interactive Audio Environments & Interfaces 1",
}
KIND = {"Compulsory": "compulsory", "Elective": "elective", "Bachelor thesis": "thesis",
        "Diploma/master thesis": "thesis", "Internship (N)": "internship"}
ASSESS = {"final": "final", "immanent": "continuous"}

LEGEND_TYPES = {"BP": "Bachelor final exam", "DP": "Master final exam", "MP": "Master final exam",
    "IL": "Lecture with integrated project work", "IT": "Individual training / phases", "LB": "Lab session",
    "PS": "Pro-seminar", "PT": "Project", "RC": "Course with integrated reflective practice", "RE": "Revision course",
    "SE": "Seminar", "TU": "Tutorial", "UB": "Practice session", "VO": "Lecture", "BA": "Bachelor thesis",
    "BE": "Professional internship", "EX": "Not defined in the source legend",
    **{t: "Course type of Paris Lodron University Salzburg; not explained on the curriculum page" for t in ("KO", "UV", "VP")}}


def base_course(c):
    title = clean(FIX_TITLES.get(c["title"], c["title"]))
    return dict(code=c["Course code"], title=title, semester=int(c["Semester"]), type=c["Type"],
                kind=KIND[c["Kind"]], sws=num(c["SWS"]), ects=num(c["ECTS Credits"]),
                language=c["Language of instruction"],
                assessment=ASSESS.get(c["Examination character"], c["Examination character"]),
                module=clean(c.get("_Superior module")), content=clean(c.get("_Lecture content")),
                learningOutcome=clean(c.get("_Learning Outcomes")), track=None, group=None)


def download(slug):
    url = f"{BASE}/en/study/ct/{slug}/curriculum"
    req = urllib.request.Request(url, headers={"User-Agent": "ct-study-planner"})
    path = f"{DL}/{slug}.html"
    with urllib.request.urlopen(req) as r, open(path, "wb") as f:
        f.write(r.read())
    return path


def build(meta, classify, groups_extra=()):
    raw = parse(download(meta["slug"]))
    courses, groups = [], {}
    for r in raw:
        c = base_course(r)
        res = classify(c) or {}
        if c["kind"] != "elective":
            res.pop("group", None)  # compulsory courses inside an elective module stay compulsory
        c["track"] = res.get("track")
        if "group" in res:
            g = res["group"]
            gid = g["id"]
            if gid not in groups:
                groups[gid] = dict(id=gid, semester=c["semester"], label=g["label"], choose=g.get("choose", 1),
                                   note=g.get("note"), open=g.get("open", False), onlyFor=g.get("onlyFor"),
                                   linkedTrack=g.get("linkedTrack"), options=[])
            opt_id = g.get("option", c["code"])
            opt = next((o for o in groups[gid]["options"] if o["id"] == opt_id), None)
            if not opt:
                opt = dict(id=opt_id, label=g.get("optionLabel", c["title"]), courses=[])
                if g.get("optionTrack"):
                    opt["track"] = g["optionTrack"]
                groups[gid]["options"].append(opt)
            opt["courses"].append(c["code"])
            c["group"] = gid
        courses.append(c)
        for extra in res.get("extraGroups", []):
            gid = extra["id"]
            if gid not in groups:
                groups[gid] = dict(id=gid, semester=c["semester"], label=extra["label"], choose=1, note=extra.get("note"),
                                   open=False, onlyFor=extra.get("onlyFor"), linkedTrack=None, options=[])
            groups[gid]["options"].append(dict(id=c["code"], label=c["title"], courses=[c["code"]]))
    for g in groups_extra:
        groups[g["id"]] = dict(dict(choose=1, open=True, onlyFor=None, linkedTrack=None, options=[]), **g)
    data = dict(
        id=meta["id"], name=meta["name"], degree=meta["degree"], mode=meta["mode"], language=meta["language"],
        semesters=meta["semesters"], ectsTotal=meta["semesters"] * 30, dataAsOf=AS_OF,
        source=dict(curriculum=f"{BASE}/en/study/ct/{meta['slug']}/curriculum",
                    brochure=dict(url=BASE + meta["brochure"], version=meta["brochureVersion"])),
        tracks=meta.get("tracks", []), notes=meta.get("notes", []),
        groups=list(groups.values()), courses=courses)
    return data


def suffix_track(module, names):
    for tid, n in names.items():
        if re.search(rf"(?:- |Focusing |Refinement |Professionalization ){re.escape(n)}$", module):
            return tid
    return None


# ---------- MultiMediaArt Master ----------
MMA_M_TRACKS = {"audio": "Audio", "communication-design": "Communication Design", "film": "Film", "producing": "Producing"}

def mma_m(c):
    m = c["module"]
    if m.startswith("Compulsory Electives 3"):
        return {"group": dict(id=f"free-elective-{c['semester']}", label="Free elective",
                              note="Open to all specialisations.")}
    t = suffix_track(m, MMA_M_TRACKS)
    if t:
        res = {"track": {"major": t}}
        if m.startswith("Compulsory Elective 1 -"):
            # Producing has no Master Project of its own and joins one of the three project types.
            res["extraGroups"] = [dict(id=f"producing-master-project-{c['semester']}", label="Master Project",
                                       note="Choose one project type.", onlyFor={"major": "producing"})]
        return res
    return None


# ---------- MultiMediaArt Bachelor ----------
MMA_B_TRACKS = {"animation": "Animation", "audio": "Audio", "communication-design": "Communication Design", "film": "Film"}

def mma_b(c):
    m = c["module"]
    s = c["semester"]
    if m.startswith("Major Pre-Specialisation - "):
        t = suffix_track(m, MMA_B_TRACKS)
        return {"group": dict(id="pre-specialisation", label="Pre-specialisation", choose=2, linkedTrack="major",
                              note="In semester 2 you take two of the four majors as a pre-specialisation; your major is one of them.",
                              option=t, optionLabel=MMA_B_TRACKS[t], optionTrack={"major": t})}
    if "Compulsory Elective Minor" in m or "Communication & Work Methods 2 - Compulsory Elective" in m or m.startswith("Elective module: Digitalisation"):
        return {"group": dict(id=f"elective-{s}", label="Elective")}
    t = suffix_track(m, MMA_B_TRACKS)
    if t:
        return {"track": {"major": t}}
    return None


# ---------- Code and Interactive Systems Bachelor ----------
def cis_b(c):
    m = c["module"]
    s = c["semester"]
    if m.startswith("Major: Future Web & Mobile"):
        return {"track": {"major": "web"}}
    if m.startswith("Major: Game & Immersive Tech"):
        return {"track": {"major": "game"}}
    if m.startswith("Minor: AI Engineering"):
        return {"track": {"minor": "ai"}}
    if m in ("Interaction Design 1", "Minor: Interaction Design 2"):
        return {"track": {"minor": "ixd"}}
    if m.startswith("Allgemeine Studien") or m.startswith("Transformative"):
        return {"group": dict(id=f"elective-{s}", label="Elective")}
    return None


# ---------- Code and Interactive Systems Master ----------
def cis_m(c):
    m = c["module"]
    s = c["semester"]
    if "Major - Game & Simulation Engineering" in m:
        return {"track": {"major": "game"}}
    if "Major - Web Engineering" in m:
        return {"track": {"major": "web"}}
    if m.startswith("Electives 2"):
        return {"group": dict(id=f"elective-{s}", label="Elective")}
    if m.startswith("Electives 3"):
        return {"group": dict(id=f"conference-{s}", label="Conference visit or elective course")}
    return None


# ---------- Realtime Art & Visual Effects Master ----------
def rave_m(c):
    m = c["module"]
    s = c["semester"]
    if m.startswith("elective 1"):
        return {"group": dict(id="alignment", label="Alignment course",
                              note="Choose one fundamentals course that fills the gap in your previous education.")}
    if m.startswith("elective 2"):
        return {"group": dict(id=f"elective-{s}", label="Elective", open=True,
                              note="The curriculum page lists Virtual Production; the brochure says you choose one elective from a wide range of subjects offered by the department.")}
    return None


def hci_m(c):
    return None


PROGRAMMES = [
    dict(id="cis-b", slug="code-and-interactive-systems-bachelor", name="Code and Interactive Systems", degree="Bachelor",
         mode="Full-time", language="German", semesters=6, classify=cis_b,
         brochure="/fileadmin/fhs_daten/studiengaenge/mmt/documents/CDE-BA_web.pdf", brochureVersion="2026/08",
         tracks=[dict(key="major", label="Major", from_semester=3, options=[dict(id="web", name="Future Web & Mobile"), dict(id="game", name="Game & Immersive Tech")]),
                 dict(key="minor", label="Specialisation", from_semester=3, options=[dict(id="ixd", name="Interaction Design"), dict(id="ai", name="AI Engineering")])],
         notes=[]),
    dict(id="mma-b", slug="multimediaart-bachelor", name="MultiMediaArt", degree="Bachelor", mode="Full-time",
         language="German", semesters=6, classify=mma_b,
         brochure="/fileadmin/fhs_daten/studiengaenge/mma/documents/mma_Bachelorfolder.pdf", brochureVersion="2026/08",
         tracks=[dict(key="major", label="Major", from_semester=2, options=[dict(id=k, name=v) for k, v in MMA_B_TRACKS.items()])],
         notes=[dict(semester=4, text="The curriculum page lists 7 ECTS for “MultiMediaProject 3 & Bachelorarbeit Kickoff – Communication Design” (1 ECTS in the other majors) and 15 ECTS for the Animation major. The brochure (version 2026/08) says 14 ECTS for every major in semester 4, so these totals are probably off on the source page.")]),
    dict(id="cis-m", slug="code-and-interactive-systems-master", name="Code and Interactive Systems", degree="Master",
         mode="Part-time", language="English", semesters=4, classify=cis_m,
         brochure="/fileadmin/fhs_daten/studiengaenge/mmt/documents/CDE-MA_web.pdf", brochureVersion="2026/03",
         tracks=[dict(key="major", label="Major", from_semester=1, options=[dict(id="game", name="Game & Simulation Engineering"), dict(id="web", name="Web Engineering")])],
         notes=[]),
    dict(id="hci-m", slug="human-computer-interaction-joint-master", name="Human-Computer Interaction", degree="Joint Master",
         mode="Full-time", language="English", semesters=4, classify=hci_m,
         brochure="/fileadmin/fhs_daten/studiengaenge/hci/documents/hci_Masterfolder.pdf", brochureVersion="2026/03",
         tracks=[], notes=[dict(semester=None, text="Joint programme of FH Salzburg and Paris Lodron University Salzburg (PLUS). Some courses are taught at PLUS. The elective courses (12 ECTS in total) can be chosen from both universities, or replaced by an internship; they are not listed on the curriculum page.")],
         extra_groups=[dict(id=f"free-electives-{s}", semester=s, label="Elective courses", ects=e, sws=sw,
                            note="Choose from both universities (FH Salzburg and PLUS), or do an internship. Not listed on the curriculum page; ECTS from the brochure.")
                       for s, e, sw in [(1, 4, 2), (2, 2, 2), (3, 6, 4)]]),
    dict(id="mma-m", slug="multimediaart-master", name="MultiMediaArt", degree="Master", mode="Full-time",
         language="English", semesters=4, classify=mma_m,
         brochure="/fileadmin/fhs_daten/studiengaenge/mma/documents/mma_Masterfolder.pdf", brochureVersion="2026/03",
         tracks=[dict(key="major", label="Specialisation", from_semester=1, options=[dict(id=k, name=v) for k, v in MMA_M_TRACKS.items()])],
         notes=[dict(semester=None, onlyFor={"major": "producing"}, text="Producing has no Master Project of its own. Producing students join a Master Project of one of the three project types (Audiovisual Environments, Communication Design, Film) in a role such as producer. Source: the programme brochure (version 2026/03) lists the Master Project for all majors and 30 ECTS per semester.")]),
    dict(id="rave-m", slug="realtime-art-visual-effects-master", name="Realtime Art & Visual Effects", degree="Master",
         mode="Full-time", language="English", semesters=4, classify=rave_m,
         brochure="/fileadmin/fhs_daten/studiengaenge/rve/documents/RVE_Masterfolder.pdf", brochureVersion="2026/03",
         tracks=[], notes=[]),
]

index = dict(department="Creative Technologies", institution="Salzburg University of Applied Sciences (FH Salzburg)",
             dataAsOf=AS_OF, programmes=[],
             legend=dict(
                 sws="Weekly contact hours over 14 weeks (SWS 2 = 28 contact hours for the whole course).",
                 ects="Workload in ECTS credits; 1 ECTS credit is about 25 hours of work.",
                 semester="Odd semesters run in winter (mid-September to end of January), even semesters in summer (mid-February to end of June).",
                 assessment={"final": "Assessed at the end of the course (exam).", "continuous": "Assessed continuously during the course."},
                 types=LEGEND_TYPES))

for p in PROGRAMMES:
    d = build(p, p["classify"], p.get("extra_groups", ()))
    for t in d["tracks"]:
        t["fromSemester"] = t.pop("from_semester")
    json.dump(d, open(f"{OUT}/{p['id']}.json", "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    open(f"{OUT}/{p['id']}.json", "a").write("\n")
    index["programmes"].append(dict(id=p["id"], name=p["name"], degree=p["degree"], mode=p["mode"],
                                    language=p["language"], semesters=p["semesters"], file=f"data/{p['id']}.json"))
json.dump(index, open(f"{OUT}/index.json", "w", encoding="utf-8"), ensure_ascii=False, indent=2)
open(f"{OUT}/index.json", "a").write("\n")


# ---------- check: ECTS per semester for every track combination ----------
def totals(d, sel):
    out = []
    for s in range(1, d["semesters"] + 1):
        tot = 0
        for c in d["courses"]:
            if c["semester"] != s or c["group"]:
                continue
            if c["track"] is None or all(sel.get(k) == v for k, v in c["track"].items()):
                tot += c["ects"]
        for g in d["groups"]:
            if g["semester"] != s:
                continue
            if g.get("onlyFor") and any(sel.get(k) != v for k, v in g["onlyFor"].items()):
                continue
            if not g["options"]:
                tot += g["ects"]
                continue
            by = {c["code"]: c for c in d["courses"]}
            vals = sorted((sum(by[x]["ects"] for x in o["courses"]) for o in g["options"]), reverse=True)
            tot += sum(vals[: g["choose"]])
        out.append(round(tot, 1))
    return out

for p in PROGRAMMES:
    d = json.load(open(f"{OUT}/{p['id']}.json"))
    combos = [dict(zip([t["key"] for t in d["tracks"]], vals)) for vals in itertools.product(*[[o["id"] for o in t["options"]] for t in d["tracks"]])]
    print(p["id"], len(d["courses"]), "courses,", len(d["groups"]), "groups")
    for sel in combos:
        print("   ", sel, totals(d, sel))
