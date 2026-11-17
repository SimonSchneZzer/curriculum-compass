"""Downloads the curriculum pages of FH Salzburg programmes and writes data/*.json for Curriculum Compass.

usage:
  python3 scripts/update_data.py                 all departments
  python3 scripts/update_data.py --only bt it    only these departments (index.json is always rewritten)
  python3 scripts/update_data.py --cache DIR     reuse downloaded pages from DIR (default: a new temp dir)

dataAsOf is set to today. Check the printed ECTS totals afterwards: lines marked "<-- check" do not add up
to 30 ECTS per semester and need a look at the programme brochure.
"""
import argparse, collections, datetime, importlib, json, os, pkgutil, re, sys, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from curricula import core  # noqa: E402
from curricula import departments as dept_pkg  # noqa: E402

ROOT = os.path.dirname(HERE)
OUT = os.path.join(ROOT, "data")


def load_departments():
    mods = [importlib.import_module(f"curricula.departments.{m.name}") for m in pkgutil.iter_modules(dept_pkg.__path__)]
    return sorted(mods, key=lambda m: m.DEPARTMENT["name"])


SMALL_WORDS = {"and", "in", "of", "the", "for", "&", "-"}


def aliases(meta, d):
    """Short names people search for: initials (CIS, HCI), our id (mma) and FH's own code prefix (MMA, CDE)."""
    words = [w for w in re.split(r"[\s/]+", meta["name"]) if w and w.lower() not in SMALL_WORDS]
    out = {"".join(w[0] for w in words if w[0].isalnum()).upper(), meta["id"].split("-")[0].upper()}
    prefixes = collections.Counter(re.match(r"[A-Z]+", c.get("sourceCode", c["code"])).group(0) for c in d["courses"]
                                   if re.match(r"[A-Z]+", c.get("sourceCode", c["code"])))
    if prefixes:
        p = prefixes.most_common(1)[0][0]
        out.add(p[:-1] if p[-1] in "BM" and len(p) > 3 else p)
    return sorted(a for a in out if len(a) >= 2)


def search_rows(d):
    """One compact row per course for the search across all programmes: [programme, code, title, semester, track]."""
    names = {(t["key"], o["id"]): o["name"] for t in d["tracks"] for o in t["options"]}
    rows = []
    for c in d["courses"]:
        track = ""
        if c["track"]:
            k, v = next(iter(c["track"].items()))
            track = ", ".join(names.get((k, x), x) for x in (v if isinstance(v, list) else [v]))
        rows.append([d["id"], c["code"], c["title"], c["semester"], track])
    return rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", nargs="*", help="department ids to rebuild")
    ap.add_argument("--cache", help="directory for downloaded pages")
    args = ap.parse_args()
    cache = args.cache or tempfile.mkdtemp(prefix="curricula-")
    os.makedirs(cache, exist_ok=True)
    as_of = datetime.date.today().isoformat()

    index = dict(institution="Salzburg University of Applied Sciences (FH Salzburg)", dataAsOf=as_of,
                 legend=dict(core.LEGEND, types=dict(core.LEGEND["types"], **core.TYPE_NOTES)), departments=[])
    problems = []
    ids = set()
    search = []
    for mod in load_departments():
        dept = mod.DEPARTMENT
        entry = dict(id=dept["id"], name=dept["name"], programmes=[], missing=dept.get("missing", []))
        index["legend"]["types"].update(getattr(mod, "TYPE_NOTES", {}))
        for meta in mod.PROGRAMMES:
            if meta["id"] in ids:
                raise SystemExit(f"duplicate programme id {meta['id']}")
            ids.add(meta["id"])
            path = os.path.join(OUT, f"{meta['id']}.json")
            if args.only is None or dept["id"] in args.only:
                d = core.build(dept, meta, cache, as_of)
                core.write_json(path, d)
                problems += [(meta["id"], sel, t) for sel, t in core.check(d)]
            else:
                d = json.load(open(path, encoding="utf-8"))
            entry["programmes"].append(dict(id=meta["id"], name=meta["name"], degree=meta["degree"], mode=meta["mode"],
                                            language=meta["language"], semesters=meta["semesters"],
                                            aliases=aliases(meta, d), file=f"data/{meta['id']}.json"))
            search += search_rows(d)
        index["departments"].append(entry)
    core.write_json(os.path.join(OUT, "index.json"), index)
    with open(os.path.join(OUT, "search.json"), "w", encoding="utf-8") as f:
        json.dump(search, f, ensure_ascii=False, separators=(",", ":"))
        f.write("\n")
    if problems:
        print(f"\n{len(problems)} track combination(s) do not add up to 30 ECTS per semester (see '<-- check').")


if __name__ == "__main__":
    main()
