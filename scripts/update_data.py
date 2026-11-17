"""Downloads the curriculum pages of FH Salzburg programmes and writes data/*.json for Curriculum Compass.

usage:
  python3 scripts/update_data.py                 all departments
  python3 scripts/update_data.py --only bt it    only these departments (index.json is always rewritten)
  python3 scripts/update_data.py --cache DIR     reuse downloaded pages from DIR (default: a new temp dir)

dataAsOf is set to today. Check the printed ECTS totals afterwards: lines marked "<-- check" do not add up
to 30 ECTS per semester and need a look at the programme brochure.
"""
import argparse, datetime, importlib, os, pkgutil, sys, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from curricula import core  # noqa: E402
from curricula import departments as dept_pkg  # noqa: E402

ROOT = os.path.dirname(HERE)
OUT = os.path.join(ROOT, "data")


def load_departments():
    mods = [importlib.import_module(f"curricula.departments.{m.name}") for m in pkgutil.iter_modules(dept_pkg.__path__)]
    return sorted(mods, key=lambda m: m.DEPARTMENT["name"])


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
            entry["programmes"].append(dict(id=meta["id"], name=meta["name"], degree=meta["degree"], mode=meta["mode"],
                                            language=meta["language"], semesters=meta["semesters"],
                                            file=f"data/{meta['id']}.json"))
        index["departments"].append(entry)
    core.write_json(os.path.join(OUT, "index.json"), index)
    if problems:
        print(f"\n{len(problems)} track combination(s) do not add up to 30 ECTS per semester (see '<-- check').")


if __name__ == "__main__":
    main()
