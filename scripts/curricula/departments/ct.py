"""Creative Technologies (CT): MultiMediaArt, Code and Interactive Systems, Human-Computer Interaction, Realtime Art & VFX.

Special cases are checked against the programme brochures (PDFs linked on each programme page).
"""
import re

DEPARTMENT = dict(id="ct", name="Creative Technologies")

FIX_TITLES = {
    "Master Project - Development - Presentationion": "Master Project - Development - Presentation",
    "Interactive Audio Environnements & Interfaces 1": "Interactive Audio Environments & Interfaces 1",
}


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
         brochure=dict(url="/fileadmin/fhs_daten/studiengaenge/mmt/documents/CDE-BA_web.pdf", version="2026/08"),
         tracks=[dict(key="major", label="Major", fromSemester=3, options=[dict(id="web", name="Future Web & Mobile"), dict(id="game", name="Game & Immersive Tech")]),
                 dict(key="minor", label="Specialisation", fromSemester=3, options=[dict(id="ixd", name="Interaction Design"), dict(id="ai", name="AI Engineering")])],
         notes=[]),
    dict(id="mma-b", slug="multimediaart-bachelor", name="MultiMediaArt", degree="Bachelor", mode="Full-time",
         language="German", semesters=6, classify=mma_b,
         brochure=dict(url="/fileadmin/fhs_daten/studiengaenge/mma/documents/mma_Bachelorfolder.pdf", version="2026/08"),
         tracks=[dict(key="major", label="Major", fromSemester=2, options=[dict(id=k, name=v) for k, v in MMA_B_TRACKS.items()])],
         notes=[dict(semester=4, text="The curriculum page lists 7 ECTS for “MultiMediaProject 3 & Bachelorarbeit Kickoff – Communication Design” (1 ECTS in the other majors) and 15 ECTS for the Animation major. The brochure (version 2026/08) says 14 ECTS for every major in semester 4, so these totals are probably off on the source page.")]),
    dict(id="cis-m", slug="code-and-interactive-systems-master", name="Code and Interactive Systems", degree="Master",
         mode="Part-time", language="English", semesters=4, classify=cis_m,
         brochure=dict(url="/fileadmin/fhs_daten/studiengaenge/mmt/documents/CDE-MA_web.pdf", version="2026/03"),
         tracks=[dict(key="major", label="Major", fromSemester=1, options=[dict(id="game", name="Game & Simulation Engineering"), dict(id="web", name="Web Engineering")])],
         notes=[]),
    dict(id="hci-m", slug="human-computer-interaction-joint-master", name="Human-Computer Interaction", degree="Joint Master",
         mode="Full-time", language="English", semesters=4, classify=hci_m,
         brochure=dict(url="/fileadmin/fhs_daten/studiengaenge/hci/documents/hci_Masterfolder.pdf", version="2026/03"),
         tracks=[], notes=[dict(semester=None, text="Joint programme of FH Salzburg and Paris Lodron University Salzburg (PLUS). Some courses are taught at PLUS. The elective courses (12 ECTS in total) can be chosen from both universities, or replaced by an internship; they are not listed on the curriculum page.")],
         extraSlots=[dict(id=f"free-electives-{s}", semester=s, label="Elective courses", ects=e, sws=sw,
                            note="Choose from both universities (FH Salzburg and PLUS), or do an internship. Not listed on the curriculum page; ECTS from the brochure.")
                       for s, e, sw in [(1, 4, 2), (2, 2, 2), (3, 6, 4)]]),
    dict(id="mma-m", slug="multimediaart-master", name="MultiMediaArt", degree="Master", mode="Full-time",
         language="English", semesters=4, classify=mma_m, fixTitles=FIX_TITLES,
         brochure=dict(url="/fileadmin/fhs_daten/studiengaenge/mma/documents/mma_Masterfolder.pdf", version="2026/03"),
         tracks=[dict(key="major", label="Specialisation", fromSemester=1, options=[dict(id=k, name=v) for k, v in MMA_M_TRACKS.items()])],
         notes=[dict(semester=None, onlyFor={"major": "producing"}, text="Producing has no Master Project of its own. Producing students join a Master Project of one of the three project types (Audiovisual Environments, Communication Design, Film) in a role such as producer. Source: the programme brochure (version 2026/03) lists the Master Project for all majors and 30 ECTS per semester.")]),
    dict(id="rave-m", slug="realtime-art-visual-effects-master", name="Realtime Art & Visual Effects", degree="Master",
         mode="Full-time", language="English", semesters=4, classify=rave_m,
         brochure=dict(url="/fileadmin/fhs_daten/studiengaenge/rve/documents/RVE_Masterfolder.pdf", version="2026/03"),
         tracks=[], notes=[]),
]
