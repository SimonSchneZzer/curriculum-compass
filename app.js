"use strict";

const SEASON = { 1: "Winter", 2: "Summer", 3: "Winter", 4: "Summer" };
const STORE_KEY = "mma-specialisation";
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

let data;
let current;

const $ = (sel) => document.querySelector(sel);
const fmt = (n) => (Math.round(n * 10) / 10).toLocaleString("en", { maximumFractionDigits: 1 });
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function readStored() {
  try { return localStorage.getItem(STORE_KEY); } catch { return null; }
}
function store(id) {
  try { localStorage.setItem(STORE_KEY, id); } catch { /* storage unavailable */ }
}

async function init() {
  try {
    const res = await fetch("data/curriculum.json");
    data = await res.json();
  } catch {
    $("#asof").textContent = "Could not load the curriculum data.";
    return;
  }

  const date = new Date(data.dataAsOf + "T12:00:00");
  const pretty = date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  $("#asof").innerHTML = `Data as of <strong><time datetime="${data.dataAsOf}">${pretty}</time></strong>`;
  $("#source").textContent = data.source;

  const ids = data.specialisations.map((s) => s.id);
  const fromHash = location.hash.slice(1);
  current = ids.includes(fromHash) ? fromHash : ids.includes(readStored()) ? readStored() : ids[0];

  buildPicker();
  buildLegend();
  buildSemesters();
  render(false);

  window.addEventListener("hashchange", () => {
    const id = location.hash.slice(1);
    if (ids.includes(id) && id !== current) select(id);
  });
  window.addEventListener("resize", moveThumb);
}

/* ---------- Picker ---------- */

function buildPicker() {
  const seg = $("#segmented");
  data.specialisations.forEach((s) => {
    const b = document.createElement("button");
    b.type = "button";
    b.role = "radio";
    b.dataset.id = s.id;
    b.textContent = s.name;
    b.addEventListener("click", () => select(s.id));
    b.addEventListener("keydown", onPickerKey);
    seg.appendChild(b);
  });
}

function onPickerKey(e) {
  const keys = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
  if (!(e.key in keys)) return;
  e.preventDefault();
  const ids = data.specialisations.map((s) => s.id);
  const next = ids[(ids.indexOf(current) + keys[e.key] + ids.length) % ids.length];
  select(next);
  document.querySelector(`.segmented button[data-id="${next}"]`).focus();
}

function select(id) {
  if (id === current) return;
  current = id;
  store(id);
  history.replaceState(null, "", "#" + id);
  render(true);
}

function moveThumb() {
  const btn = document.querySelector(`.segmented button[data-id="${current}"]`);
  const thumb = $(".thumb");
  thumb.style.width = btn.offsetWidth + "px";
  thumb.style.transform = `translate(${btn.offsetLeft}px, ${btn.offsetTop - 4}px)`;
}

/* ---------- Data helpers ---------- */

function semesterParts(sem) {
  const inSem = data.courses.filter((c) => c.semester === sem);
  return {
    core: inSem.filter((c) => c.category === "compulsory" || c.category === "thesis"),
    spec: inSem.filter((c) => c.category === "specialisation" && c.specialisation === current),
    elec: inSem.filter((c) => c.category === "elective"),
  };
}

const sum = (list, key) => list.reduce((a, c) => a + c[key], 0);

function totals(sem) {
  const p = semesterParts(sem);
  // A free elective is a choice of one course, so only one counts towards the total.
  const elecEcts = p.elec.length ? Math.max(...p.elec.map((c) => c.ects)) : 0;
  const elecSws = p.elec.length ? Math.max(...p.elec.map((c) => c.sws)) : 0;
  return {
    core: sum(p.core, "ects"),
    spec: sum(p.spec, "ects"),
    elec: elecEcts,
    ects: sum(p.core, "ects") + sum(p.spec, "ects") + elecEcts,
    sws: sum(p.core, "sws") + sum(p.spec, "sws") + elecSws,
  };
}

const semesters = () => [...new Set(data.courses.map((c) => c.semester))].sort();

/* ---------- Render ---------- */

function render(animate) {
  document.querySelectorAll(".segmented button").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.id === current)));
  moveThumb();
  renderNote();
  renderOverview(animate);
  semesters().forEach((s) => renderSpecSlot(s, animate));
}

function renderNote() {
  const spec = data.specialisations.find((s) => s.id === current);
  const note = $("#note");
  if (spec.masterProject === null) {
    note.innerHTML = `<div><p class="note-text"><strong>Note:</strong> The published curriculum has no ${esc(spec.name)} version of the Master Project course, so the semester totals here come out below 30 ECTS. Ask the programme team how ${esc(spec.name)} students take part in Master Projects.</p></div>`;
    note.classList.add("show");
  } else {
    note.classList.remove("show");
  }
}

function renderOverview(animate) {
  const box = $("#overview");
  const first = !box.children.length;
  let allEcts = 0, allSws = 0;

  semesters().forEach((s, i) => {
    const t = totals(s);
    allEcts += t.ects;
    allSws += t.sws;
    if (first) {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "card";
      card.dataset.sem = s;
      card.innerHTML = `<h3>Semester ${s}</h3><span class="season">${SEASON[s] || ""} term</span>
        <div class="figures"><div class="fig"><b data-k="ects">0</b><span>ECTS</span></div><div class="fig"><b data-k="sws">0</b><span>SWS</span></div></div>
        <div class="bar"><i class="core"></i><i class="spec"></i><i class="elec"></i></div>`;
      card.addEventListener("click", () => document.getElementById("sem-" + s).scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth" }));
      box.appendChild(card);
    }
    const card = box.querySelector(`[data-sem="${s}"]`);
    setNumber(card.querySelector('[data-k="ects"]'), t.ects, animate || first);
    setNumber(card.querySelector('[data-k="sws"]'), t.sws, animate || first);
    card.querySelector(".bar .core").style.flexGrow = t.core;
    card.querySelector(".bar .spec").style.flexGrow = t.spec;
    card.querySelector(".bar .elec").style.flexGrow = t.elec;
    card.querySelector(".bar").title = `${fmt(t.core)} ECTS for everyone · ${fmt(t.spec)} ECTS specialisation · ${fmt(t.elec)} ECTS elective`;
    if (first && !reduceMotion) { card.classList.add("enter"); card.style.setProperty("--i", i); }
  });

  if (first) {
    const total = document.createElement("div");
    total.className = "card total";
    total.innerHTML = `<h3>Whole programme</h3><span class="season">4 semesters</span>
      <div class="figures"><div class="fig"><b data-k="ects">0</b><span>ECTS</span></div><div class="fig"><b data-k="sws">0</b><span>SWS</span></div></div>`;
    box.appendChild(total);
  }
  const total = box.querySelector(".total");
  setNumber(total.querySelector('[data-k="ects"]'), allEcts, true);
  setNumber(total.querySelector('[data-k="sws"]'), allSws, true);
}

// Counts from the old to the new value once, then stops.
function setNumber(el, value, animate) {
  const from = parseFloat(el.dataset.v || "0");
  el.dataset.v = value;
  if (!animate || reduceMotion || from === value) { el.textContent = fmt(value); return; }
  const start = performance.now(), dur = 600;
  const step = (now) => {
    const p = Math.min(1, (now - start) / dur);
    const e = 1 - Math.pow(1 - p, 3);
    el.textContent = fmt(from + (value - from) * e);
    if (p < 1) requestAnimationFrame(step); else el.textContent = fmt(value);
  };
  requestAnimationFrame(step);
}

function buildSemesters() {
  const root = $("#semesters");
  semesters().forEach((s) => {
    const p = semesterParts(s);
    const sec = document.createElement("section");
    sec.className = "semester";
    sec.id = "sem-" + s;
    sec.setAttribute("aria-labelledby", `sem-${s}-title`);
    let html = `<div class="semester-head"><h2 id="sem-${s}-title">Semester ${s}</h2><p data-k="sum"></p></div>`;
    html += `<div class="group"><h3><i class="dot core"></i>For all specialisations</h3><div class="list">${p.core.map(courseHtml).join("")}</div></div>`;
    html += `<div class="group spec-group"><h3><i class="dot spec"></i><span data-k="spec-title"></span></h3><div class="spec-slot"><div class="list" data-k="spec-list"></div></div></div>`;
    if (p.elec.length) {
      const e = p.elec[0];
      html += `<div class="group"><h3><i class="dot elec"></i>Free elective <small>· choose one, ${fmt(e.ects)} ECTS</small></h3><div class="list">${p.elec.map(courseHtml).join("")}</div></div>`;
    }
    sec.innerHTML = html;
    root.appendChild(sec);
  });
  root.addEventListener("click", (e) => {
    const btn = e.target.closest(".course > button");
    if (!btn) return;
    const course = btn.parentElement;
    const open = course.classList.toggle("open");
    btn.setAttribute("aria-expanded", String(open));
  });
}

function renderSpecSlot(s, animate) {
  const sec = document.getElementById("sem-" + s);
  const spec = data.specialisations.find((x) => x.id === current);
  const p = semesterParts(s);
  const t = totals(s);
  sec.querySelector('[data-k="sum"]').textContent = `${SEASON[s]} term · ${fmt(t.ects)} ECTS · ${fmt(t.sws)} SWS`;

  const slot = sec.querySelector(".spec-slot");
  const list = slot.querySelector('[data-k="spec-list"]');
  const title = sec.querySelector('[data-k="spec-title"]');
  const fill = () => {
    title.textContent = spec.name;
    list.innerHTML = p.spec.map(courseHtml).join("");
    list.style.display = p.spec.length ? "" : "none";
  };

  if (!animate || reduceMotion) { fill(); return; }

  // Old rows slide away, the slot glides to its new height, new rows slide in.
  const oldRows = [...list.children];
  oldRows.forEach((r) => r.classList.add("leave"));
  setTimeout(() => {
    const from = slot.offsetHeight;
    fill();
    const to = slot.scrollHeight;
    slot.style.height = from + "px";
    slot.offsetHeight; // commit the start height
    slot.style.height = to + "px";
    slot.addEventListener("transitionend", function done(ev) {
      if (ev.propertyName !== "height") return;
      slot.style.height = "";
      slot.removeEventListener("transitionend", done);
    });
    [...list.children].forEach((r, i) => { r.style.setProperty("--i", i); r.classList.add("enter"); });
  }, oldRows.length ? 160 : 0);
}

function courseHtml(c) {
  const stripe = c.category === "specialisation" ? "var(--spec)" : c.category === "elective" ? "var(--elec)" : "var(--core)";
  const typeName = data.legend.types[c.type] || c.type;
  const assess = data.legend.assessment[c.assessment] || c.assessment;
  const id = "d-" + c.code;
  return `<div class="course">
    <button type="button" aria-expanded="false" aria-controls="${id}">
      <span class="stripe" style="background:${stripe}"></span>
      <span class="title">${esc(c.title)}</span>
      <span class="type" title="${esc(typeName)}">${esc(c.type)}</span>
      <span class="meta sws">${fmt(c.sws)} SWS</span>
      <span class="meta">${fmt(c.ects)} ECTS</span>
      <svg class="chev" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </button>
    <div class="details" id="${id}"><div><div class="inner">
      <ul class="facts">
        <li><b>${esc(typeName)}</b></li>
        <li>${fmt(c.sws)} SWS · ${fmt(c.ects)} ECTS</li>
        <li>${esc(assess)}</li>
        <li>${esc(c.language)}</li>
        <li>Module: ${esc(c.module)}</li>
        <li>Code ${esc(c.code)}</li>
      </ul>
      <h4>Content</h4><p>${esc(c.content)}</p>
      <h4>Learning outcome</h4><p>${esc(c.learningOutcome)}</p>
    </div></div></div>
  </div>`;
}

function buildLegend() {
  const l = data.legend;
  const rows = [
    ["SWS", l.sws],
    ["ECTS", l.ects],
    ["Semesters", l.semester],
    ...Object.entries(l.types).map(([k, v]) => [k, v]),
  ];
  $("#legend").innerHTML = rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("");
}

init();
