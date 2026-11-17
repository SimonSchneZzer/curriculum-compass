# CT Study Planner

An unofficial, tailored view of the curricula of the **Creative Technologies** department at FH Salzburg.
Pick a programme in the navigation, choose your major (and specialisation, where there is one), and see what you
take each semester, the SWS and ECTS totals, and the content and learning outcomes of every course.

**Live:** https://simonschnezzer.github.io/ct-study-planner/

| Programme | Degree | Choices |
|---|---|---|
| Code and Interactive Systems | Bachelor | Major (from semester 3) + specialisation Interaction Design / AI Engineering |
| MultiMediaArt | Bachelor | Two pre-specialisations in semester 2, one major from semester 3, one elective per semester |
| Code and Interactive Systems | Master (part-time) | Major from semester 1, electives in semesters 2 and 3 |
| Human-Computer Interaction | Joint Master with PLUS | No major; 12 ECTS of free electives from both universities |
| MultiMediaArt | Master | Specialisation from semester 1, free electives in semesters 2 and 3 |
| Realtime Art & Visual Effects | Master | Alignment course in semester 1, electives in semesters 2 and 3 |

Links can point to a programme and selection, e.g. `#/mma-m/film` or `#/cis-b/game/ai`.

## Data

`data/index.json` lists the programmes and the shared legend. Every programme has its own file, e.g.
[`data/mma-m.json`](data/mma-m.json). The field `dataAsOf` shows when the data was taken from the FH Salzburg
curriculum pages; the site displays this date at the top.

- `tracks`: choices that hold for the whole programme (major, specialisation). A course with
  `"track": {"major": "film"}` only applies to that major.
- `groups`: choices made per semester ("choose one of …"). `choose` says how many options to pick; an option can
  be a bundle of several courses. `linkedTrack` means your own track is one of the picks (MultiMediaArt Bachelor
  pre-specialisation). `onlyFor` limits a group to one track. A group without options is a slot that the
  curriculum page does not list (Human-Computer Interaction electives); its ECTS come from the brochure.
- `notes`: special cases and known problems in the source data, with their source.
- `kind` of a course: `compulsory`, `elective`, `thesis` or `internship`.

### Special cases

- **MultiMediaArt Master, Producing:** no Master Project of its own; Producing students join one of the three
  project types. Source: programme brochure (version 2026/03).
- **MultiMediaArt Bachelor, semester 4:** the curriculum page lists 7 ECTS for the Communication Design kickoff
  (1 ECTS in the other majors) and 15 ECTS for the Animation major; the brochure says 14 ECTS. The site shows
  the page's values with a warning.
- **Human-Computer Interaction:** joint programme with Paris Lodron University Salzburg (PLUS). The course types
  KO, UV and VP are PLUS types that the curriculum page does not explain.
- **Realtime Art & Visual Effects:** the electives in semesters 2 and 3 are open; the page only lists Virtual Production.
- Two typos in MultiMediaArt Master course titles were fixed. Course codes are kept as published.

### Updating the data

```sh
python3 scripts/update_data.py
```

This downloads all curriculum pages, rewrites `data/*.json` with today's date and prints the ECTS per semester
for every track combination. Every semester should come out at 30; check anything else against the brochure.

## Run locally

```sh
python3 -m http.server 8000
```

Then open http://localhost:8000. No build step, no dependencies: plain HTML, CSS and JavaScript, published with
GitHub Pages from `main`.
