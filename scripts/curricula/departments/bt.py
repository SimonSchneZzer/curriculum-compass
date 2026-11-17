"""Business and Tourism (BT): Business Management (Bachelor, Master), Innovation & Management in Tourism (Bachelor,
Master), Management & Entrepreneurship (Bachelor), Retail & Technology (Master).

Special cases are checked against the programme brochures (PDFs linked on each programme page).
"""
import re

DEPARTMENT = dict(id="bt", name="Business and Tourism", missing=[])


# ---------- Business Management Bachelor ----------
BM_B_SPECS = {"fa": "Finance & Accounting", "hr": "Human Resource Management",
              "lo": "Logistics & Operations Management", "mr": "Marketing & Relationship Management"}

def bm_spec(module):
    for k, n in BM_B_SPECS.items():
        if n.split(" & ")[0].split()[0] in module:
            return k
    return None

def bm_b(c):
    m = c["module"]
    s = c["semester"]
    if re.match(r"s?pecials?ization ", m.lower()):  # the part-time page has a typo "pecialSization"
        k = bm_spec(m)
        return {"group": dict(id=f"specialisation-{s}", label="Specialisations", choose=2, sync="specialisation",
                              note="Choose two of the four specialisations in semester 4 and keep them in the following semesters.",
                              option=k, optionLabel=BM_B_SPECS[k])}
    if m.startswith("Specialized Business Communications"):
        return {"group": dict(id=f"business-communications-{s}", label="Specialized Business Communications",
                              note="One course (in English). The curriculum page does not say whether it has to match one of your specialisations.")}
    return None


# ---------- Business Management Master ----------
BM_M_SPECS = {"finance": "Financial Management", "people": "People Management",
              "value-creation": "Management of Sustainable Value Creation"}

def bm_m(c):
    for k, n in BM_M_SPECS.items():
        if c["module"].startswith(n + " "):
            return {"track": {"specialisation": k}}
    return None


# ---------- Innovation & Management in Tourism Bachelor (English- and German-taught) ----------
IMT_LANGS = {"german": "German", "italian": "Italian", "spanish": "Spanish"}
IMT_LANG_WORDS = {"german": "german", "italian": "italian", "italienisch": "italian", "spanish": "spanish", "spanisch": "spanish"}

def imt_b(c):
    m = c["module"].lower()
    s = c["semester"]
    if "language" in m or "fremdsprache" in m:
        return {"track": {"language": next(v for k, v in IMT_LANG_WORDS.items() if k in m)}}
    if m.startswith(("qualitative ", "quantitative ")):
        return {"group": dict(id=f"bachelor-seminar-{s}", label="Elective bachelor seminar")}
    if "management 3" in m and c["kind"] == "elective":  # Tourism Management 3 / Tourismusmanagement 3
        return {"group": dict(id=f"tourism-management-{s}", label="Elective tourism management")}
    return None


# ---------- Innovation & Management in Tourism Master ----------
def imt_m(c):
    if c["module"] == "Mandatory Elective":
        return {"group": dict(id=f"elective-{c['semester']}", label="Tourism management elective")}
    return None


PROGRAMMES = [
    dict(id="bm-b", slug="business-management-bachelor", name="Business Management", degree="Bachelor",
         mode="Full-time", language="German", semesters=6, classify=bm_b,
         brochure=dict(url="/fileadmin/fhs_daten/studiengaenge/bwi/documents/bwi_Bachelorfolder.pdf", version="2026/11"),
         tracks=[],
         notes=[dict(semester=None, text="From semester 4 you choose two of the four specialisations (source: programme page, “students will choose two of the following four specialisations”). The part-time variant (bm-pt-b) has its own curriculum page with a different semester plan."),
                dict(semester=None, text="The brochure (version 2026/11) already shows the new curriculum starting in winter semester 2027/28, with four different specialisations of which you choose one. These data show the current curriculum from the curriculum page.")]),
    dict(id="bm-pt-b", slug="business-management-bachelor", url="/en/study/bt/business-management-bachelor/curriculum/part-time",
         name="Business Management", degree="Bachelor", mode="Part-time", language="German", semesters=6, classify=bm_b,
         brochure=dict(url="/fileadmin/fhs_daten/studiengaenge/bwi/documents/bwi_Bachelorfolder.pdf", version="2026/11"),
         tracks=[],
         notes=[dict(semester=None, text="From semester 4 you choose two of the four specialisations (source: programme page, “students will choose two of the following four specialisations”). In the part-time variant they run over semesters 4 to 6; the work placement is split over semesters 4 to 6."),
                dict(semester=None, text="The brochure (version 2026/11) already shows the new curriculum starting in winter semester 2027/28, with four different specialisations of which you choose one. These data show the current curriculum from the curriculum page.")]),
    dict(id="bm-m", slug="business-management-master", name="Business Management", degree="Master",
         mode="Part-time", language="German", semesters=4, classify=bm_m,
         brochure=dict(url="/fileadmin/fhs_daten/studiengaenge/bwi/documents/BWI_Masterfolder.pdf", version="2026/08"),
         tracks=[dict(key="specialisation", label="Specialisation", fromSemester=2,
                      options=[dict(id=k, name=v) for k, v in BM_M_SPECS.items()])],
         notes=[dict(semester=1, text="Students without the required prior knowledge take a bridge course “Accounting & Financial Statement Analysis” (3 ECTS, 2 SWS) in semester 1. It is not listed on the curriculum page. Source: brochure (version 2026/08).")]),
    dict(id="imt-b", slug="innovation-management-in-tourism-bachelor", name="Innovation & Management in Tourism",
         degree="Bachelor", mode="Part-time", language="English", semesters=6, classify=imt_b,
         brochure=dict(url="/fileadmin/fhs_daten/studiengaenge/imt/documents/IMT-EN_BA_Infobrochure.pdf", version="2026/08"),
         tracks=[dict(key="language", label="Foreign language", fromSemester=3,
                      options=[dict(id=k, name=v) for k, v in IMT_LANGS.items()])],
         notes=[dict(semester=None, text="You choose one foreign language (German, Italian or Spanish) and take it from semester 3 to 6. If enough students register, it is offered at beginner and advanced level. Source: brochure (version 2026/08).")]),
    dict(id="imt-de-b", slug="innovation-management-in-tourism-bachelor-1",
         url="/studium/bt/innovation-management-im-tourismus-bachelor/curriculum", name="Innovation & Management in Tourism",
         degree="Bachelor", mode="Part-time", language="German", semesters=6, classify=imt_b,
         brochure=dict(url="/fileadmin/fhs_daten/studiengaenge/imt/documents/IMT-DE_BA_Folder.pdf", version="2026/08"),
         tracks=[dict(key="language", label="Foreign language", fromSemester=3,
                      options=[dict(id=k, name=IMT_LANGS[k]) for k in ("italian", "spanish")])],
         notes=[dict(semester=None, text="German-taught variant of the bachelor’s programme. Its English curriculum page does not exist, so the data come from the German curriculum page; course titles are partly German."),
                dict(semester=None, text="You choose Italian or Spanish as a foreign language and take it from semester 3 to 6. If enough students register, it is offered at beginner and advanced level. Source: brochure (version 2026/08).")]),
    dict(id="imt-m", slug="innovation-management-in-tourism-master", name="Innovation & Management in Tourism",
         degree="Master", mode="Part-time", language="English", semesters=4, classify=imt_m,
         brochure=dict(url="/fileadmin/fhs_daten/studiengaenge/imt/documents/IMT_Master_Infobrochure_EN.pdf", version="2026/08"),
         tracks=[],
         notes=[dict(semester=None, text="The brochure (version 2026/08) also lists free electives (e.g. Managerial Economics, Finance Tutorial, German 1–3, Food and Tourism 1–2). They are not on the curriculum page and not part of the 30 ECTS per semester.")]),
    dict(id="me-b", slug="management-entrepreneurship-bachelor", name="Management & Entrepreneurship", degree="Bachelor",
         mode="Part-time", language="German", semesters=6,
         brochure=dict(url="/fileadmin/fhs_daten/studiengaenge/kmu/documents/KMU_BA_Folder.pdf", version="2026/08"),
         tracks=[], notes=[]),
    dict(id="rt-m", slug="retail-technology-master", name="Retail & Technology", degree="Master", mode="Part-time",
         language="German", semesters=4,
         brochure=dict(url="/fileadmin/fhs_daten/studiengaenge/ret/documents/RET_Master_Infobroschuere.pdf", version="2026/08"),
         tracks=[], notes=[]),
]
