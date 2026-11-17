"""Health Sciences (GW): Biomedical Sciences, Midwifery, Nursing, Occupational Therapy, Orthoptics, Physiotherapy,
Radiological Technology (Bachelor) and Midwifery Sciences (continuing-education Master).

Special cases are checked against the programme brochures (PDFs linked on each programme page, version 2026/08).
"""

DEPARTMENT = dict(id="gw", name="Health Sciences", missing=[
    dict(name="Child and Youth Care (academic course)",
         url="https://www.fh-salzburg.ac.at/en/study/gw/child-and-youth-care-academic-course",
         reason="Part-time continuing-education course (3 semesters, certificate “Academic expert in child and adolescent care”, not a degree programme). Its curriculum page lists no courses."),
    dict(name="Mental Health Nursing (academic course)",
         url="https://www.fh-salzburg.ac.at/en/study/gw/mental-health-nursing-academic-course",
         reason="Part-time continuing-education course (3 semesters, certificate “Academic expert in psychiatric nursing”, not a degree programme). Its curriculum page lists no courses."),
])

FIX_TITLES = {
    "Elective Sompulsory Subject: Specifics of working in a practice setting": "Elective Compulsory Subject: Specifics of working in a practice setting",
}


# ---------- Nursing Bachelor ----------
# The elective courses carry the specialisation in their code (GUKB1PA1IL = Acute care 1).
NUR_TRACKS = {"PA": ("acute", "Acute care"), "KJ": ("child-youth", "Child and youth care"),
              "EB": ("extramural", "Extramural care"), "GP": ("geriatric", "Geriatric care"),
              "GE": ("counselling", "Health counseling and patient education"), "PP": ("psychiatric", "Psychiatric care")}

def nur_b(c):
    if c["kind"] == "elective":
        return {"track": {"specialisation": NUR_TRACKS[c["code"][5:7]][0]}}
    return None


# ---------- Orthoptics Bachelor ----------
def orth_b(c):
    if c["kind"] == "elective" and c["module"] == "Professional Actions 2":
        setting = "hospital" if "hospital" in c["title"] else "practice"
        return {"group": dict(id=f"elective-{c['semester']}", label="Elective compulsory subject",
                              note="Choose one setting. Part of the module Professional Actions 2.",
                              option=setting, optionLabel=c["title"].split(": ", 1)[-1])}
    return None


PROGRAMMES = [
    dict(id="bms-b", slug="biomedical-sciences-bachelor", name="Biomedical Sciences", degree="Bachelor",
         mode="Full-time", language="German", semesters=6,
         brochure=dict(url="/fileadmin/fhs_daten/studiengaenge/bma/documents/bma_Bachelorfolder.pdf", version="2026/08"),
         tracks=[], notes=[]),
    dict(id="mw-b", slug="midwifery-bachelor", name="Midwifery", degree="Bachelor", mode="Full-time",
         language="German", semesters=6, brochure=None, tracks=[], notes=[]),
    dict(id="mws-m", slug="midwifery-sciences", name="Midwifery Sciences", degree="Master", mode="Part-time",
         language="German, English", semesters=4,
         brochure=dict(url="/fileadmin/fhs_daten/studiengaenge/heb/documents/HEB_MA.pdf", version="2026/08"),
         tracks=[], notes=[dict(semester=None, text="Continuing-education master’s programme (Hebammenwissenschaft – Salutophysiologie) for experienced midwives; degree Master of Science (Continuing Education), MSc (CE). Part-time: nine teaching weeks spread over the four semesters plus some online courses. Tuition € 12,000 for the whole programme. Source: programme page and brochure (version 2026/08).")]),
    dict(id="nur-b", slug="nursing-bachelor", name="Nursing", degree="Bachelor", mode="Full-time",
         language="German", semesters=6, classify=nur_b,
         brochure=dict(url="/fileadmin/fhs_daten/studiengaenge/guk/documents/guk_Bachelorfolder.pdf", version="2026/08"),
         tracks=[dict(key="specialisation", label="Specialisation", fromSemester=1,
                      options=[dict(id=i, name=n) for i, n in NUR_TRACKS.values()])],
         notes=[dict(semester=None, text="You choose one of six specialisations from semester 1 and take its elective course (1 ECTS) in semesters 1, 3 and 6. Source: brochure (version 2026/08), “Vertiefung (Wahlpflichtfächer)”.")]),
    dict(id="ot-b", slug="occupational-therapy-bachelor", name="Occupational Therapy", degree="Bachelor",
         mode="Full-time", language="German", semesters=6,
         brochure=dict(url="/fileadmin/fhs_daten/studiengaenge/eth/documents/eth_Bachelorfolder.pdf", version="2026/08"),
         tracks=[], notes=[]),
    dict(id="orth-b", slug="orthoptics-bachelor", name="Orthoptics", degree="Bachelor", mode="Full-time",
         language="German", semesters=6, classify=orth_b, fixTitles=FIX_TITLES,
         brochure=dict(url="/fileadmin/fhs_daten/studiengaenge/otk/documents/otk_Bachelorfolder.pdf", version="2026/08"),
         tracks=[], notes=[dict(semester=6, text="The curriculum page lists both elective subjects (hospital setting, practice setting) under the same course code OTKB6WPFIL. The brochure (version 2026/08) counts one “Wahlpflichtfach” in Professional Actions 2 (5.5 ECTS), so you take one of the two.")]),
    dict(id="phys-b", slug="physiotherapy-bachelor", name="Physiotherapy", degree="Bachelor", mode="Full-time",
         language="German", semesters=6,
         brochure=dict(url="/fileadmin/fhs_daten/studiengaenge/pth/documents/pth_Bachelorfolder.pdf", version="2026/08"),
         tracks=[], notes=[]),
    dict(id="rad-b", slug="radiological-technology-bachelor", name="Radiological Technology", degree="Bachelor",
         mode="Full-time", language="German", semesters=6,
         brochure=dict(url="/fileadmin/fhs_daten/studiengaenge/rat/documents/rat_Bachelorfolder.pdf", version="2026/08"),
         tracks=[], notes=[]),
]
