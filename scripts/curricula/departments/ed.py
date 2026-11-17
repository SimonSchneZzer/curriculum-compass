"""Design and Green Engineering (ED): Design & Product Management, Forest Products Technology & Timber Constructions,
Green Building, Green Engineering, Smart Buildings in Smart Cities, Timber Construction Professional.

Special cases are checked against the programme brochures (PDFs linked on each programme page).
"""
DEPARTMENT = dict(id="ed", name="Design and Green Engineering")


# ---------- Design & Product Management Bachelor ----------
DPM_TRACKS = {"furniture": "Furniture", "industrial": "Industrial Design", "interior": "Interior Design"}

def dpm_b(c):
    m = c["module"]
    for tid, n in DPM_TRACKS.items():
        if m.startswith(f"Specialization: {n} "):
            return {"track": {"major": tid}}
    return None


def dpm_m(c):
    return None


# ---------- Forest Products Technology & Timber Constructions Bachelor ----------
FPT_B_TRACKS = {"fpt": "Forest Products Technology", "fdia": "Furniture Design and Interior Architecture", "tc": "Timber Constructions"}

def fpt_b(c):
    m = c["module"]
    s = c["semester"]
    if m.startswith("Introduction to Wood Science"):
        return {"group": dict(id="elective-1", label="Elective")}
    if m.startswith("Main option: Timber Constructions 1_"):
        return {"group": dict(id="tc-elective-3", label="Timber Constructions elective", onlyFor={"major": "tc"},
                              note="Choose one. The brochure gives 11.5 ECTS for every specialisation in semester 3; Timber Constructions reaches that with one of these two courses.")}
    if m.startswith("Main option: ") and " / " in m:
        # Taught together for two specialisations: the course belongs to both.
        parts = m[len("Main option: "):].split(" / ")
        return {"track": {"major": [k for k, v in FPT_B_TRACKS.items() if any(p.strip().startswith(v) for p in parts)]}}
    if m.startswith("Main option: "):
        return {"track": {"major": next(k for k, v in FPT_B_TRACKS.items() if m[len("Main option: "):].startswith(v))}}
    if m.startswith("Professionalisation - Options"):
        # Brochure: study trip and free electives 6 ECTS (4 SWS); the study trip is 2 ECTS (2 SWS).
        return {"group": dict(id=f"free-elective-{s}", label="Free electives", open=True, budget=4, budgetSws=2,
                              note="Placeholder slots of 4, 2 and 1 ECTS. Subjects change every year; courses of other FH Salzburg programmes or approved universities can count too.")}
    return None


# ---------- Forest Products Technology & Timber Constructions Master ----------
# Free elective per semester, ECTS (SWS), from the brochure.
FPT_M_FREE = {1: (2, 2), 2: (5, 4), 3: (2, 2), 4: (4, 4)}

def fpt_m(c):
    m = c["module"]
    s = c["semester"]
    if m.startswith("Main option: Timber Constructions"):
        return {"track": {"major": "tc"}}
    if m.startswith("Main option: Wood technology"):
        return {"track": {"major": "wt"}}
    if m.startswith("Detailed Competences"):
        ects, sws = FPT_M_FREE[s]
        return {"group": dict(id=f"free-elective-{s}", label="Free elective", open=True, budget=ects, budgetSws=sws,
                              note="Placeholder slots: one larger course or several smaller ones. Subjects change every year.")}
    return None


# ---------- Green Building - Design & Engineering Bachelor ----------
def gbd_b(c):
    m = c["module"]
    if m.startswith("Constructions"):
        return {"track": {"major": "constructions"}}
    if m.startswith("Systems"):
        return {"track": {"major": "systems"}}
    if c["title"].startswith("Building Energy Certification"):
        return {"group": dict(id="certification-5", label="Building certification", choose=2,
                              note="Choose two of three (brochure: Wahlpflichtfach Gebäudezertifizierungen, 2 aus 3).")}
    return None


# ---------- Green Engineering Bachelor (German curriculum page) ----------
GE_TRACKS = {"process": "Sustainable Process Engineering", "circular": "Circular Economy"}

def ge_b(c):
    m = c["module"]
    s = c["semester"]
    if s in (3, 4) and c["kind"] == "elective":
        return {"group": dict(id=f"specialisation-module-{s}", label="Specialisation module", option=m, optionLabel=m,
                              note="Choose one module. The curriculum page does not say which module belongs to which specialisation.")}
    if m.startswith("Nachhaltige Technologien"):
        return {"track": {"major": "process"}}
    if m.startswith("Corporate Sustainability"):
        return {"track": {"major": "circular"}}
    return None


# ---------- Smart Buildings in Smart Cities Master ----------
def sbc_m(c):
    m = c["module"]
    if m.startswith("Specialisation Building in Existing Contexts"):
        return {"track": {"major": "existing"}}
    if m.startswith("Specialisation Urban Systems"):
        return {"track": {"major": "urban"}}
    return None


PROGRAMMES = [
    dict(id="dpm-b", slug="design-product-management-bachelor", name="Design & Product Management", degree="Bachelor",
         mode="Full-time", language="German", semesters=6, classify=dpm_b,
         brochure=dict(url="/fileadmin/fhs_daten/studiengaenge/dpm/documents/dpm_Bachelorfolder.pdf", version="2026/08"),
         tracks=[dict(key="major", label="Specialisation", fromSemester=3, options=[dict(id=k, name=v) for k, v in DPM_TRACKS.items()])],
         notes=[dict(semester=None, text="“Elective subject Communication Skills” (Kommunikationsportfolio) is a slot: from semester 3 you choose the subjects from a range of courses listed on the programme website. Source: brochure (version 2026/08)."),
                dict(semester=5, text="The curriculum page lists the “Extended Professional Internship” (13 ECTS) as compulsory. The brochure (version 2026/08) calls it an elective: an extended internship or a semester abroad.")]),
    dict(id="dpm-m", slug="design-product-management-master", name="Design & Product Management", degree="Master",
         mode="Full-time", language="German and English", semesters=4, classify=dpm_m,
         brochure=dict(url="/fileadmin/fhs_daten/studiengaenge/dpm/documents/dpm-DE_Masterfolder.pdf", version="2026/08"),
         tracks=[],
         notes=[dict(semester=None, text="The Professionalisation portfolio courses are slots: you choose the subjects from the courses on offer, e.g. rendering techniques, product management, materials & model making, circular policy, motion graphics, working with AI, photo design, social design, parametric design. Source: brochure (version 2026/08).")]),
    dict(id="fpt-b", slug="forest-products-technology-timber-constructions-bachelor", name="Forest Products Technology & Timber Constructions",
         degree="Bachelor", mode="Full-time", language="German", semesters=6, classify=fpt_b,
         fixTitles={"Elective Subject 2": "Elective Subject 1.2"},  # German page: Wahlpflichtfach 1.2 (2 ECTS)
         brochure=dict(url="/fileadmin/fhs_daten/studiengaenge/htb-htw/documents/htb_Bachelorfolder.pdf", version="2026/08"),
         tracks=[dict(key="major", label="Specialisation", fromSemester=3, options=[dict(id=k, name=v) for k, v in FPT_B_TRACKS.items()])],
         notes=[dict(semester=6, text="Free electives worth 4 ECTS: the brochure (version 2026/08) lists study trip and free electives with 6 ECTS, the study trip is 2 ECTS. The curriculum page uses the same course code (HTBB6WP2IL) for five elective slots; a suffix (-2, -3, …) is added here. “Elective Subject 2” is renamed “Elective Subject 1.2” as on the German page (Wahlpflichtfach 1.2).")]),
    dict(id="fpt-m", slug="forest-products-technology-timber-constructions-master", name="Forest Products Technology & Timber Constructions",
         degree="Master", mode="Full-time", language="German", semesters=4, classify=fpt_m,
         fixTitles={"Freies Wahlpflichtfach 2.2.1": "Detailed Competences 2.2.1"},
         brochure=dict(url="/fileadmin/fhs_daten/studiengaenge/htb-htw/documents/htb_Masterfolder.pdf", version="2026/08"),
         tracks=[dict(key="major", label="Specialisation", fromSemester=2, options=[dict(id="wt", name="Wood Technology"), dict(id="tc", name="Timber Constructions")])],
         notes=[dict(semester=None, text="The brochure (version 2026/08) lists one free elective per semester: 2, 5, 2 and 4 ECTS. The curriculum page shows it as placeholder slots (“Detailed Competences”) and reuses one course code per semester for all of them; a suffix (-2, -3, …) is added here.")]),
    dict(id="gbd-b", slug="green-building-design-engineering-bachelor", name="Green Building - Design & Engineering", degree="Bachelor",
         mode="Part-time", language="German", semesters=6, classify=gbd_b,
         brochure=dict(url="/fileadmin/fhs_daten/studiengaenge/smb-smc/documents/gbd_Bachelorfolder.pdf", version="2026/08"),
         tracks=[dict(key="major", label="Specialisation", fromSemester=4, options=[dict(id="systems", name="Systems"), dict(id="constructions", name="Constructions")])],
         notes=[dict(semester=None, text="“Work Placement or free Elective” (semesters 4 to 6, 18 ECTS in total): a work placement of 450 hours, or free electives instead. Source: brochure (version 2026/08).")]),
    dict(id="ge-b", slug="green-engineering-bachelor", url="/studium/ed/green-engineering-bachelor/curriculum",
         name="Green Engineering", degree="Bachelor", mode="Part-time", language="German", semesters=6, classify=ge_b,
         brochure=dict(url="/fileadmin/fhs_daten/studiengaenge/gen/documents/GEN-BA_Flyer_A4.pdf", version="2026/08"),
         tracks=[dict(key="major", label="Specialisation", fromSemester=3, options=[dict(id=k, name=v) for k, v in GE_TRACKS.items()])],
         notes=[dict(semester=None, text="Data from the German curriculum page, so course titles and descriptions are in German: the English curriculum page shows the courses of Forest Products Technology & Timber Constructions (Bachelor). The programme is subject to approval by the responsible committees (programme page). Specialisation names translated from the brochure (version 2026/08): Nachhaltige Verfahrenstechnik, Kreislaufwirtschaft."),
                dict(semester=None, text="The brochure (version 2026/08) says you choose your specialisation from semester 3, but the curriculum page does not link the modules of semesters 3 and 4 to a specialisation. They are shown as a choice of one module per semester.")]),
    dict(id="tcp-b", slug="timber-construction-bachelor-professional", url="/studium/ed/holzbau-professional-bachelor-professional/curriculum",
         name="Timber Construction Professional", degree="Bachelor Professional", mode="Part-time", language="German", semesters=6,
         brochure=dict(url="/fileadmin/fhs_daten/departments/green-engineering-design/documents/WiCamKu_BachelorProfes_Folder_A5_RZ_ANSICHT_1.pdf", version="not stated"),
         tracks=[],
         notes=[dict(semester=None, text="Degree: Bachelor Professional (BPr). University course (Holzbau Professional) run with Holztechnikum Kuchl, HTL Hallein and the Salzburg timber construction guild. The first two years include the preparatory course for the master carpenter qualification exam. Classes take place in Kuchl or at a partner institution depending on the module. Credit for previous education (e.g. a specialised HTL) can let you start in a higher semester. Data from the German curriculum page; the English one does not exist (404)."),
                dict(semester=1, text="The brochure (no version stated) gives 15 ECTS company practice and 5 ECTS Bautechnologie; the curriculum page gives 10 and 10. The page's values are used."),
                dict(semester=4, text="The brochure (no version stated) gives 15 ECTS company practice and 5 ECTS for the technical planning module; the curriculum page gives 10 and 10. The page's values are used.")]),
    dict(id="sbc-m", slug="smart-buildings-in-smart-cities-master", name="Smart Buildings in Smart Cities", degree="Master",
         mode="Part-time", language="German and English", semesters=4, classify=sbc_m,
         brochure=dict(url="/fileadmin/fhs_daten/studiengaenge/smb-smc/documents/smc_Masterfolder.pdf", version="2026/08"),
         tracks=[dict(key="major", label="Specialisation", fromSemester=2, options=[dict(id="existing", name="Building in Existing Contexts"), dict(id="urban", name="Urban Systems")])],
         notes=[dict(semester=None, text="Free electives (4, 4 and 6 ECTS in semesters 2 to 4) are slots; the subjects are not listed on the curriculum page.")]),
]
