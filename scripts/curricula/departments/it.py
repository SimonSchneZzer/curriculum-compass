"""Information Technologies and Digitalisation (IT): AI for Sustainable Technologies, Applied AI in Healthcare,
Applied Image and Signal Processing, Business Informatics & Digital Transformation, Cyber Security,
Industrial Informatics & Robotics, IT Management & Consulting.

Special cases are checked against the programme brochures (PDFs linked on each programme page).
"""

DEPARTMENT = dict(
    id="it", name="Information Technologies and Digitalisation",
    missing=[
        dict(name="Information Technologies (Bachelor)",
             url="https://www.fh-salzburg.ac.at/en/study/it/information-technologies-bachelor",
             reason="New programme (formerly Information Technology & Systems Management). No curriculum page with a course list "
                    "exists yet, neither in English nor in German; only the info flyer."),
    ],
)


# ---------- AI for Sustainable Technologies Master ----------
def aist_m(c):
    if c["module"].endswith("_Elective Course in Computer Science"):
        return {"group": dict(id=f"elective-{c['semester']}", label="Elective")}
    return None


# ---------- Applied Image and Signal Processing Joint Master ----------
AISP_SUAS_ELECTIVES = {"AISM3NLPIL": "nlp", "AISM3ANLIL": "nlp", "AISM3RILIL": "rl", "AISM3ARLIL": "rl"}

def aisp_m(c):
    opt = AISP_SUAS_ELECTIVES.get(c["code"])
    if opt:
        return {"group": dict(id="elective-suas", label="Elective course at FH Salzburg",
                              note="The lecture and its applied part belong together.",
                              option=opt, optionLabel={"nlp": "Natural Language Processing", "rl": "Reinforcement Learning"}[opt])}
    return None


AISP_PLUS = "Paris Lodron University Salzburg (PLUS)"
AISP_SLOTS = [
    dict(id="plus-compulsory-1", semester=1, label="Compulsory courses at PLUS", compulsory=True, ects=12, sws=9, open=False,
         note="Imaging Beyond Consumer Cameras 4 ECTS, Image Processing and Imaging 4 ECTS, Natural Computation 4 ECTS. "
              f"Taught at {AISP_PLUS}; not listed on the curriculum page, ECTS from the brochure."),
    dict(id="plus-compulsory-2", semester=2, label="Compulsory courses at PLUS", compulsory=True, ects=16, sws=11, open=False,
         note="Audio Processing 5 ECTS, Media Data Formats 4 ECTS, Fourier Analysis, Filter Banks & Wavelets 7 ECTS. "
              f"Taught at {AISP_PLUS}; not listed on the curriculum page, ECTS from the brochure."),
    dict(id="plus-compulsory-3", semester=3, label="Compulsory courses at PLUS", compulsory=True, ects=13, sws=8, open=False,
         note="Geometric Modelling 5 ECTS, Computer Vision 5 ECTS, Master Seminar 1 3 ECTS. "
              f"Taught at {AISP_PLUS}; not listed on the curriculum page, ECTS from the brochure."),
    dict(id="elective-plus", semester=3, label="Elective course at PLUS", ects=5, sws=3,
         note="Choose one of Medical Imaging, Biometric Systems, Media Security, Computational Geometry, Advanced Machine Learning. "
              f"Taught at {AISP_PLUS}; not listed on the curriculum page, ECTS from the brochure."),
    *[dict(id=f"free-electives-{s}", semester=s, label="Free electives", ects=3, sws=2,
           note="Choose qualified lectures at FH Salzburg or PLUS (a third course from the elective lists is recommended). "
                "Not listed on the curriculum page; ECTS from the brochure, which also says the 6 ECTS can be split between semesters 3 and 4.")
      for s in (3, 4)],
]


# ---------- Business Informatics & Digital Transformation Bachelor ----------
def bidt_b(c):
    if c["module"].startswith("Specialisation "):
        return {"group": dict(id=f"specialisation-{c['semester']}", label="Specialisation elective", budget=5, budgetSws=4,
                              note="Choose courses worth 5 ECTS in total: one 5-ECTS course or two 2.5-ECTS courses.")}
    return None


# ---------- Industrial Informatics & Robotics Master (German curriculum page) ----------
def iir_m(c):
    if c["module"].endswith("WAHLFACH Informatik"):
        return {"group": dict(id=f"elective-{c['semester']}", label="Elective",
                              note="Big Data Engineering or Industrial Image Processing (brochure: “Big Data Engineering oder Industrielle Bildverarbeitung”).")}
    return None


GERMAN_PAGE_NOTE = ("This programme has no English curriculum page; the data comes from the German page, so course titles and "
                    "descriptions are in German.")


# ---------- IT Management & Consulting Master ----------
ITMC_TRACKS = {"ai": "New Technologies for Applied Artificial Intelligence", "security": "Networking, Security & Privacy",
               "operations": "Digital Transformation in Operations & Supply Chain Management"}

def itmc_m(c):
    m = c["module"]
    for tid, n in ITMC_TRACKS.items():
        if m == f"SP: {n}":
            return {"track": {"specialisation": tid}}
    return None


PROGRAMMES = [
    dict(id="bidt-b", slug="business-informatics-and-digital-transformation-bachelor",
         name="Business Informatics & Digital Transformation", degree="Bachelor", mode="Full-time", language="German",
         semesters=6, classify=bidt_b,
         brochure=dict(url="/fileadmin/fhs_daten/studiengaenge/win/documents/win_Bachelorfolder.pdf", version="2026/08"),
         tracks=[],
         notes=[dict(semester=s, text="The specialisation electives (“Wahlpflichtfächer”) are worth 5 ECTS (4 SWS) in semesters 4 and 5; "
                                      "the courses on offer are worth 2.5 or 5 ECTS. Source: the programme brochure (version 2026/08), which says "
                                      "you specialise in one or two of the offered areas. The ECTS totals here assume 5 ECTS per semester.")
                for s in (4, 5)]),
    dict(id="aist-m", slug="ai-for-sustainable-technologies-master", name="AI for Sustainable Technologies", degree="Master",
         mode="Part-time", language="German and English", semesters=4, classify=aist_m,
         brochure=dict(url="/fileadmin/fhs_daten/studiengaenge/ait/documents/AIT_Masterfolder.pdf", version="2026/08"),
         tracks=[], notes=[]),
    dict(id="aisp-m", slug="applied-image-and-signal-processing-joint-master", name="Applied Image and Signal Processing",
         degree="Joint Master", mode="Full-time", language="English", semesters=4, classify=aisp_m,
         brochure=dict(url="/fileadmin/fhs_daten/studiengaenge/ais/documents/ais_Masterfolder.pdf", version="2026/03"),
         tracks=[],
         notes=[dict(semester=None, text="Joint programme of FH Salzburg and Paris Lodron University Salzburg (PLUS). The curriculum page only "
                                         "lists the courses taught at FH Salzburg; the courses at PLUS, the PLUS elective and the free electives "
                                         "(52 ECTS in total) are shown as placeholders with ECTS and SWS from the programme brochure (version 2026/03). "
                                         "Master Seminar 1 is taught at PLUS according to the module description (AIS-MA_Module_description_from2021.pdf)."),
                dict(semester=2, text="The brochure (version 2026/03) lists a 5-ECTS FH Salzburg course “Computer Vision” in semester 2; "
                                      "the curriculum page and the module description list “Digital Signal Processing 2” (5 ECTS) there instead.")],
         extraSlots=AISP_SLOTS),
    dict(id="aih-m", slug="applied-ai-in-healthcare-joint-master", name="Applied AI in Healthcare", degree="Joint Master",
         url="/en/study/it/applied-ai-in-healthcare-joint-master/programme-structure-curriculum",
         mode="Part-time", language="English", semesters=4,
         brochure=dict(url="/fileadmin/fhs_daten/studiengaenge/aih-m/documents/AIH_Applied-AI-in-Healthcare_Master_Brochure.pdf",
                       version="2026/08"),
         tracks=[],
         notes=[dict(semester=None, text="Joint programme of FH Salzburg and Paracelsus Medical Private University (PMU). Degree: Master of "
                                         "Science (Continuing Education), MSc (CE). Source: the programme brochure (version 2026/08).")]),
    dict(id="cs-m", slug="cyber-security-master", name="Cyber Security", degree="Master",
         url="/studium/it/cyber-security-master/curriculum",
         mode="Part-time", language="German and English", semesters=4,
         brochure=dict(url="/fileadmin/fhs_daten/studiengaenge/cys/documents/cys_Masterfolder.pdf", version="2026/08"),
         tracks=[], notes=[dict(semester=None, text=GERMAN_PAGE_NOTE)]),
    dict(id="iir-m", slug="industrial-informatics-robotics-master", name="Industrial Informatics & Robotics", degree="Master",
         url="/studium/it/industrial-informatics-robotics-master/curriculum",
         mode="Part-time", language="German and English", semesters=4, classify=iir_m,
         brochure=dict(url="/fileadmin/fhs_daten/studiengaenge/iir/documents/IIR_Masterfolder.pdf", version="2026/08"),
         tracks=[], notes=[dict(semester=None, text=GERMAN_PAGE_NOTE)]),
    dict(id="itmc-m", slug="it-management-consulting-master", name="IT Management & Consulting", degree="Master",
         mode="Full-time", language="German", semesters=4, classify=itmc_m,
         brochure=dict(url="/fileadmin/fhs_daten/studiengaenge/bin/documents/imc_Master_IT-Management-and-Consulting_Folder.pdf",
                       version="2026/08"),
         tracks=[dict(key="specialisation", label="Specialisation", fromSemester=3,
                      options=[dict(id=k, name=v) for k, v in ITMC_TRACKS.items()])],
         notes=[dict(semester=1, text="The curriculum page lists “Programming with Python” (3 ECTS) in semester 1; the brochure (version 2026/08) "
                                      "lists “Analytics & Knowledge Discovery” (3 ECTS) in its place.")]),
]
