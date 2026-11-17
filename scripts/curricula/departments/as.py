"""Applied Social Sciences (AS): Social Innovation (Master), Social Work (Bachelor).

Special cases are checked against the programme brochures (PDFs linked on each programme page, version 2026/08).
"""

DEPARTMENT = dict(id="as", name="Applied Social Sciences", missing=[])


# ---------- Social Innovation Master ----------
# Brochure: "Ab dem dritten Semester belegen Sie zwei der angeführten Schwerpunkte" – one course per focus area in
# semester 3 and one open lecture + practice class per focus area in semester 4.
SI_FOCUS = {"health": "Public Health and Social Health", "democracy": "Democracy Development",
            "recognition": "Social Inequality and Recognition",
            "sustainability": "Sustainability and Socio-ecological Transformation"}
SI_COURSES = {"SOZM3SGSIL": "health", "SOZM3NFBIL": "democracy", "SOZM3IAEIL": "recognition", "SOZM3PGNIL": "sustainability",
              "SOZM4FOH": "health", "SOZM4QDI": "democracy", "SOZM4SFR": "recognition", "SOZM4ASM": "sustainability"}

def si_m(c):
    f = SI_COURSES.get(c["code"]) or SI_COURSES.get(c["code"][:8])
    if not f:
        return None
    s = c["semester"]
    return {"group": dict(id=f"focus-{s}", label="Focus areas", choose=2, sync="focus",
                          note="Choose two of the four focus areas in semester 3 and keep them in semester 4.",
                          option=f, optionLabel=SI_FOCUS[f])}


# ---------- Social Work Bachelor ----------
SW_FOCUS = {"social-space": "Social Inequality and Social Space", "childhood": "Childhood, Youth and Family",
            "digital": "Digital Social Work"}

def sw_b(c):
    m = c["module"].lower()
    for k, n in SW_FOCUS.items():
        if m.startswith("focus area: ") and m.endswith(n.lower()):
            return {"track": {"focus": k}}
    if m.startswith("advanced study of professional methodologies"):
        return {"group": dict(id=f"methods-{c['semester']}", label="Elective subject: methods")}
    return None


PROGRAMMES = [
    dict(id="si-m", slug="social-innovation-master", name="Social Innovation", degree="Master", mode="Part-time",
         language="German", semesters=4, classify=si_m,
         brochure=dict(url="/fileadmin/fhs_daten/studiengaenge/soza/documents/soza_Masterfolder.pdf", version="2026/08"),
         tracks=[],
         notes=[dict(semester=None, text="From semester 3 you take two of four focus areas. Each focus area has one course in semester 3 and an open lecture with a practice class (taught in English) in semester 4. The page does not name the focus areas; the names are translated from the brochure (version 2026/08).")]),
    dict(id="sw-b", slug="social-work-bachelor", url="/en/study/as/social-work-bachelor/curriculum/full-time",
         name="Social Work", degree="Bachelor", mode="Full-time and part-time", language="German", semesters=6,
         classify=sw_b,
         brochure=dict(url="/fileadmin/fhs_daten/studiengaenge/soza/documents/soza_Bachelorfolder.pdf", version="2026/08"),
         tracks=[dict(key="focus", label="Focus area", fromSemester=5, options=[dict(id=k, name=v) for k, v in SW_FOCUS.items()])],
         notes=[dict(semester=None, text="The curriculum page links a full-time and a part-time page; both list exactly the same courses (shown here). The brochure (version 2026/08) shows the part-time plan and says the full-time plan differs between semesters; it also lists “Concepts of Social Policy” in semester 5 and “Crisis Intervention and Psychological Trauma” in semester 6, the curriculum page the other way round (3 ECTS each)."),
                dict(semester=5, text="On the curriculum page the four method electives (creative, media-related, biography-related, body-related) and the compulsory course “Methods of social work” all have the course code SOBB5HOMUE; here the electives are numbered SOBB5HOMUE-2 to -5."),
                dict(semester=6, text="“Reflection on Practice” has the same course code SOBB5PRXRC in semesters 5 and 6 on the curriculum page; here the semester 6 course is SOBB5PRXRC-2.")]),
]
