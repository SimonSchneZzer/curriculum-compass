"use strict";

/* Curriculum Compass — plain JS, no build step. All URLs are relative, so it runs on any static host.
   Design "Atlas": the page shows names and short facts; everything else lives in tooltips. */

const STORE_KEY = "curriculum-compass";
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const canHover = window.matchMedia("(hover: hover)").matches;

let index;          // data/index.json
let prog;           // the programme shown
let sel = {};       // chosen track options, e.g. { major: "film", minor: "ai" }
let picks = {};     // picked elective options: { groupId or sync: [optionId, …] }
const cache = {};

const $ = (s, el = document) => el.querySelector(s);
const fmt = (n) => (Math.round(n * 10) / 10).toLocaleString("en", { maximumFractionDigits: 1 });
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const season = (s) => (s % 2 ? "Winter" : "Summer");
const wait = (ms) => new Promise((r) => setTimeout(r, reduceMotion ? 0 : ms));

// Counts a number from its old to its new value once (no jump); text = value => string.
function countTo(el, value, text) {
  if (!el) return;
  const from = parseFloat(el.dataset.v ?? "NaN");
  el.dataset.v = value;
  if (reduceMotion || isNaN(from) || from === value) { el.textContent = text(value); return; }
  const start = performance.now(), dur = 550;
  const step = (now) => {
    const p = Math.min(1, (now - start) / dur), e = 1 - Math.pow(1 - p, 3);
    el.textContent = text(p < 1 ? Math.round((from + (value - from) * e) * 10) / 10 : value);
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/* ---------- Icons (inline stroke SVG) ---------- */

const ICON_PATHS = {
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5"/><circle cx="17.5" cy="9" r="2.5"/><path d="M17 14.5c2.4.2 4 1.8 4.5 4.5"/>',
  briefcase: '<rect x="3" y="7" width="18" height="13" rx="2.5"/><path d="M8.5 7V5.5A1.5 1.5 0 0 1 10 4h4a1.5 1.5 0 0 1 1.5 1.5V7"/><path d="M3 12.5h18"/>',
  sparkles: '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>',
  leaf: '<path d="M5 19c0-8 5-13 15-14-1 10-6 15-14 15"/><path d="M5 19l7-7"/>',
  heart: '<path d="M20.5 8.5c0 5.5-8.5 11-8.5 11s-8.5-5.5-8.5-11A4.5 4.5 0 0 1 12 6a4.5 4.5 0 0 1 8.5 2.5z"/><path d="M6.5 12h3l1.5-2.5 2 5 1.5-2.5h3"/>',
  chip: '<rect x="6" y="6" width="12" height="12" rx="2"/><rect x="9.5" y="9.5" width="5" height="5" rx="1"/><path d="M9 2.5V6M15 2.5V6M9 18v3.5M15 18v3.5M2.5 9H6M2.5 15H6M18 9h3.5M18 15h3.5"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
  bookmark: '<path d="M19 21l-7-4.5L5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>',
  cloudOff: '<path d="M3 3l18 18"/><path d="M8.5 6.2A6 6 0 0 1 17.7 10h.3a4 4 0 0 1 2.2 7.3M17 19H7a5 5 0 0 1-1.5-9.8"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.5v.01"/>',
  alert: '<path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17v.01"/>',
  star: '<path d="M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.4 6.7 19.4l1.2-6L3.4 9.3l6-.7z"/>',
  check: '<path d="M5 12.5l4 4L19 7"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  note: '<path d="M9 18V6l11-2v12"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>',
  pen: '<path d="M12 19l7-7 3 3-7 7z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18z"/><circle cx="11" cy="11" r="2"/>',
  camera: '<rect x="2.5" y="6" width="14" height="12" rx="2"/><path d="M16.5 10.5l5-3v9l-5-3z"/>',
  trend: '<path d="M3 17l5-5 4 4 8-8"/><path d="M15 8h5v5"/>',
  play: '<circle cx="12" cy="12" r="9"/><path d="M10 8.5l5.5 3.5-5.5 3.5z"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.8 3 2.8 15 0 18M12 3c-2.8 3-2.8 15 0 18"/>',
  gamepad: '<rect x="2.5" y="7" width="19" height="11" rx="5.5"/><path d="M7.5 10.5v4M5.5 12.5h4M15.5 11.5v.01M18 13.5v.01"/>',
  brain: '<path d="M9 4.5a3 3 0 0 0-3 3 3 3 0 0 0-2 5.2A3.5 3.5 0 0 0 9 18.5V4.5zM15 4.5a3 3 0 0 1 3 3 3 3 0 0 1 2 5.2 3.5 3.5 0 0 1-5 5.8V4.5z"/>',
  cursor: '<path d="M5 3l14 7-6 2-2 6z"/><path d="M13 12l5 5"/>',
  shield: '<path d="M12 3l7.5 3v5.5c0 4.5-3.2 8-7.5 9.5-4.3-1.5-7.5-5-7.5-9.5V6z"/><path d="M9 12l2 2 4-4"/>',
  building: '<rect x="4" y="3" width="12" height="18" rx="1.5"/><path d="M16 9h4v12h-4M8 7h4M8 11h4M8 15h4"/>',
  cog: '<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="6.5"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/>',
  chat: '<path d="M4 5h16v11H9l-5 4z"/><path d="M8 10h8"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  compass: '<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>',
};
const icon = (name) => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${ICON_PATHS[name] || ICON_PATHS.compass}</svg>`;

const DEPT_ICONS = { as: "users", bt: "briefcase", ct: "sparkles", ed: "leaf", gw: "heart", it: "chip" };

// A fitting icon for a track option from its name.
const TRACK_ICONS = [
  [/audio|sound|music/i, "note"], [/film|cinema/i, "camera"], [/animation/i, "play"],
  [/web|mobile|internet/i, "globe"], [/game/i, "gamepad"], [/\bai\b|artificial|intelligence|machine|data/i, "brain"],
  [/interaction|hci|experience/i, "cursor"], [/security|privacy/i, "shield"],
  [/communication design|design|furniture|interior|typograph/i, "pen"],
  [/timber|wood|construction|building|existing/i, "building"], [/urban|city|cities/i, "globe"],
  [/system|engineering|process|operations|supply/i, "cog"], [/sustain|green|circular|eco|forest/i, "leaf"],
  [/health|care|nurs|psych|geriat|child|youth|family|acute|patient/i, "heart"], [/social|inequal|space|people/i, "users"],
  [/italian|spanish|german|french|language/i, "chat"], [/financ|value|people management|business|market/i, "chart"],
  [/produc|management|entrepreneur/i, "trend"],
];
const trackIcon = (name) => (TRACK_ICONS.find(([re]) => re.test(name)) || [null, "compass"])[1];

/* ---------- Local storage: everything the viewer chooses ---------- */

function readStore() {
  try {
    const st = JSON.parse(localStorage.getItem(STORE_KEY));
    if (st) return st;
    const old = JSON.parse(localStorage.getItem("ct-study-planner"));
    return old ? { last: old.last, sel: old.sel || {} } : {};
  } catch { return {}; }
}
const store = readStore();
["sel", "picks", "scroll"].forEach((k) => { store[k] = store[k] || {}; });

let saveTimer;
function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch { /* storage unavailable */ }
  }, 150);
}
function remember() {
  store.last = prog.id;
  store.sel[prog.id] = sel;
  store.picks[prog.id] = picks;
  persist();
}

/* ---------- URL: #/<programme>/<track option>/<track option> ---------- */

const allProgrammes = () => index.departments.flatMap((d) => d.programmes.map((p) => ({ ...p, dept: d })));
const findProgramme = (id) => allProgrammes().find((p) => p.id === id);

function readHash() {
  const parts = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  if (!parts.length) return null;
  if (parts.length === 1 && !findProgramme(parts[0])) return { id: "mma-m", opts: parts }; // old #film links
  return { id: parts[0], opts: parts.slice(1) };
}
function writeHash() {
  history.replaceState(null, "", "#/" + [prog.id, ...prog.tracks.map((t) => sel[t.key])].join("/"));
}

/* ---------- Boot ---------- */

async function init() {
  $("#menu-btn").innerHTML = icon("menu");
  $(".search-icon").outerHTML = icon("search");
  $("#prog-info").innerHTML = icon("info");
  try {
    index = await (await fetch("data/index.json")).json();
  } catch {
    $("#title").textContent = "Could not load the curriculum data.";
    return;
  }
  buildSide();
  buildSearch();
  initTips();

  const h = readHash();
  const id = h && findProgramme(h.id) ? h.id : findProgramme(store.last) ? store.last : "mma-m";
  await openProgramme(id, h && h.id === id ? h.opts : null, false);

  window.addEventListener("hashchange", async () => {
    const hh = readHash();
    if (!hh || !findProgramme(hh.id)) return;
    if (hh.id !== prog.id) await openProgramme(hh.id, hh.opts, true);
    else applyOpts(hh.opts);
  });
  window.addEventListener("scroll", () => {
    if (!prog) return;
    store.scroll[prog.id] = Math.round(window.scrollY);
    persist();
  }, { passive: true });

  $("#menu-btn").addEventListener("click", () => toggleSide(!document.body.classList.contains("side-open")));
  $("#scrim").addEventListener("click", () => toggleSide(false));

  const setOnline = () => {
    const off = !navigator.onLine;
    document.body.classList.toggle("is-offline", off);
    const btn = $("#saved");
    const had = btn.innerHTML;
    btn.innerHTML = icon(off ? "cloudOff" : "bookmark");
    if (had && !reduceMotion) { btn.classList.remove("pop"); void btn.offsetWidth; btn.classList.add("pop"); }
  };
  window.addEventListener("online", setOnline);
  window.addEventListener("offline", setOnline);
  setOnline();
  registerOffline();
}

function registerOffline() {
  if (!("serviceWorker" in navigator) || location.protocol === "file:") return;
  navigator.serviceWorker.register("sw.js").then(() => navigator.serviceWorker.ready).then((reg) => {
    const urls = allProgrammes().map((p) => new URL(p.file, location.href).href);
    reg.active && reg.active.postMessage({ type: "precache", urls });
  }).catch(() => { /* offline mode not available here */ });
}

async function getProgramme(id) {
  if (!cache[id]) cache[id] = await (await fetch(findProgramme(id).file)).json();
  return cache[id];
}

async function openProgramme(id, opts, animate) {
  const data = await getProgramme(id);
  const page = $("#page");
  hideTip(true);
  if (animate && !reduceMotion) {
    page.classList.remove("in");
    page.classList.add("out");
    await wait(180);
  }
  prog = data;
  const stored = store.sel[id] || {};
  sel = {};
  prog.tracks.forEach((t, i) => {
    const ids = t.options.map((o) => o.id);
    const fromUrl = opts && opts[i];
    sel[t.key] = ids.includes(fromUrl) ? fromUrl : ids.includes(stored[t.key]) ? stored[t.key] : ids[0];
  });
  picks = { ...(store.picks[id] || {}) };

  buildHeader();
  buildPickers();
  $("#overview").innerHTML = "";
  buildSemesters();
  render(false);
  updateSide();
  writeHash();
  remember();
  toggleSide(false);

  if (animate) {
    page.classList.remove("out");
    if (!reduceMotion) { void page.offsetWidth; page.classList.add("in"); }
  }
  window.scrollTo({ top: store.scroll[id] || 0, behavior: "auto" });
}

function applyOpts(opts) {
  let changed = false;
  prog.tracks.forEach((t, i) => {
    if (opts[i] && t.options.some((o) => o.id === opts[i]) && sel[t.key] !== opts[i]) { sel[t.key] = opts[i]; changed = true; }
  });
  if (changed) { render(true); remember(); }
}

/* ---------- Sidebar: departments with their programmes ---------- */

const degreeShort = (d) => (d.startsWith("Bachelor Professional") ? "BPr" : d.startsWith("Bachelor") ? "BA" : d.startsWith("Joint") ? "Joint MA" : "MA");

function buildSide() {
  $("#side").innerHTML = index.departments.map((d) => `
    <div class="dept" data-dept="${d.id}" style="--fg: var(--${d.id}-fg)">
      <button class="dept-btn" type="button" aria-expanded="false">
        <span class="dept-ico" style="background: var(--${d.id}-bg); color: var(--${d.id}-fg)">${icon(DEPT_ICONS[d.id])}</span>
        <span>${esc(d.name)}</span>
      </button>
      <div class="dept-list"><div><ul>
        ${sideList(d.programmes)}
        ${(d.missing || []).length ? `<li class="list-head">Not included</li>` + d.missing.map((m) => `<li class="missing" data-tip="text" data-text="${esc(m.reason)}" tabindex="0">${esc(m.name)}</li>`).join("") : ""}
      </ul></div></div>
    </div>`).join("");
  $("#side").addEventListener("click", (e) => {
    const btn = e.target.closest(".dept-btn");
    if (btn) {
      const dept = btn.parentElement;
      const open = !dept.classList.contains("open");
      document.querySelectorAll(".dept.open").forEach((d) => { if (d !== dept) setDept(d, false); });
      setDept(dept, open);
      return;
    }
    const link = e.target.closest(".prog-link");
    if (link) {
      e.preventDefault();
      if (link.dataset.id !== prog.id) openProgramme(link.dataset.id, null, true);
      else toggleSide(false);
    }
  });
}

// Bachelor first, then Master; alphabetical inside; variants of one programme (BA/BPr, full-/part-time,
// English/German) right under each other.
const DEGREE_RANK = (d) => (d.startsWith("Bachelor Professional") ? 1 : d.startsWith("Bachelor") ? 0 : d.startsWith("Joint") ? 3 : 2);
function sideList(list) {
  const sorted = [...list].sort((a, b) => a.name.localeCompare(b.name) || DEGREE_RANK(a.degree) - DEGREE_RANK(b.degree)
    || (a.mode === "Full-time" ? 0 : 1) - (b.mode === "Full-time" ? 0 : 1) || a.language.localeCompare(b.language));
  const variant = (p, group) => {
    const twins = group.filter((q) => q.name === p.name && q.degree === p.degree);
    if (twins.length < 2) return "";
    if (twins.some((q) => q.mode !== p.mode)) return p.mode;
    return p.language;
  };
  return [["Bachelor", (p) => p.degree.startsWith("Bachelor")], ["Master", (p) => !p.degree.startsWith("Bachelor")]].map(([label, test]) => {
    const group = sorted.filter(test);
    if (!group.length) return "";
    return `<li class="list-head">${label}</li>` + group.map((p) => {
      const v = variant(p, group);
      return `<li><a class="prog-link" href="#/${p.id}" data-id="${p.id}" data-tip="prog"><span>${esc(p.name)}${v ? `<em>${esc(v)}</em>` : ""}</span><small>${degreeShort(p.degree)}</small></a></li>`;
    }).join("");
  }).join("");
}

function setDept(el, open) {
  el.classList.toggle("open", open);
  $(".dept-btn", el).setAttribute("aria-expanded", String(open));
}

function updateSide() {
  document.querySelectorAll(".dept").forEach((d) => setDept(d, d.dataset.dept === prog.department));
  document.querySelectorAll(".prog-link").forEach((a) => {
    if (a.dataset.id === prog.id) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
  });
}

function toggleSide(open) {
  document.body.classList.toggle("side-open", open);
  $("#menu-btn").setAttribute("aria-expanded", String(open));
}

/* ---------- Search ---------- */

let results = [], active = 0;

function buildSearch() {
  const input = $("#search"), box = $("#search-results");
  const close = () => { box.classList.remove("open"); input.setAttribute("aria-expanded", "false"); };
  const go = (p) => { input.value = ""; close(); input.blur(); if (p.id !== prog.id) openProgramme(p.id, null, true); };
  input.addEventListener("input", () => {
    const q = input.value.trim();
    if (!q) { close(); return; }
    const words = q.toLowerCase().split(/\s+/);
    results = allProgrammes().filter((p) => words.every((w) => `${p.name} ${p.degree} ${p.mode} ${p.language} ${p.dept.name}`.toLowerCase().includes(w))).slice(0, 8);
    active = 0;
    box.innerHTML = results.length ? results.map((p, i) => `
      <button class="result" type="button" role="option" aria-selected="${i === 0}" data-i="${i}">
        <span class="dept-ico" style="background: var(--${p.dept.id}-bg); color: var(--${p.dept.id}-fg)">${icon(DEPT_ICONS[p.dept.id])}</span>
        <span><b>${highlight(p.name, words.length === 1 ? q : "")}</b><small>${esc(p.degree)} · ${esc(p.mode)} · ${esc(p.dept.name)}</small></span>
      </button>`).join("") : `<p class="result-empty">No programme matches “${esc(q)}”.</p>`;
    if (!box.classList.contains("open") && !reduceMotion) box.querySelectorAll(".result").forEach((r, i) => { r.style.setProperty("--i", i); r.classList.add("enter"); });
    box.classList.add("open");
    input.setAttribute("aria-expanded", "true");
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { input.value = ""; close(); return; }
    if (!results.length || !box.classList.contains("open")) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      active = (active + (e.key === "ArrowDown" ? 1 : -1) + results.length) % results.length;
      box.querySelectorAll(".result").forEach((r, i) => r.setAttribute("aria-selected", String(i === active)));
    }
    if (e.key === "Enter") { e.preventDefault(); go(results[active]); }
  });
  box.addEventListener("click", (e) => { const r = e.target.closest(".result"); if (r) go(results[+r.dataset.i]); });
  document.addEventListener("click", (e) => { if (!e.target.closest("#search-box")) close(); });
}

function highlight(text, q) {
  const i = q ? text.toLowerCase().indexOf(q.toLowerCase()) : -1;
  if (i < 0) return esc(text);
  return esc(text.slice(0, i)) + "<mark>" + esc(text.slice(i, i + q.length)) + "</mark>" + esc(text.slice(i + q.length));
}

/* ---------- Header and pickers ---------- */

const deptName = () => index.departments.find((d) => d.id === prog.department).name;

function buildHeader() {
  $("#title").textContent = prog.name;
  $("#subtitle").textContent = `${prog.degree} · ${deptName()}`;
  document.title = `${prog.name} (${prog.degree}) · Curriculum Compass`;
  const b = prog.source.brochure;
  $("#source").innerHTML = `Source: <a href="${esc(prog.source.curriculum)}">curriculum page</a>` +
    (b ? ` and <a href="${esc(b.url)}">programme brochure</a> (version ${esc(b.version)})` : "") + ` of FH Salzburg · data as of ${prettyDate(prog.dataAsOf)}.`;
  $("#json-link").href = `data/${prog.id}.json`;
}

const prettyDate = (d) => new Date(d + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

function renderNotes() {
  const notes = prog.notes.filter((n) => !n.semester && matches(n.onlyFor));
  const slot = $("#notes-slot");
  const html = notes.length
    ? `<button class="note-pill" type="button" data-tip="notes">${icon("info")}${notes.length === 1 ? "1 note about this programme" : `${notes.length} notes about this programme`}</button>`
    : "";
  if (slot.dataset.html === html) return;
  slot.dataset.html = html;
  const old = $(".note-pill", slot);
  const show = () => {
    slot.innerHTML = html;
    slot.classList.toggle("open", Boolean(html));
    const pill = $(".note-pill", slot);
    if (pill && !reduceMotion) pill.classList.add("enter");
  };
  if (old && !reduceMotion) { old.classList.add("leave"); setTimeout(show, 160); } else show();
}

function buildPickers() {
  $("#pickers").innerHTML = prog.tracks.map((t, i) => `
    <section class="picker ${i ? "minor" : ""}" aria-label="${esc(t.label)}">
      <h2 class="picker-label">Your ${esc(t.label.toLowerCase())}${t.fromSemester > 1 ? ` <small>· from semester ${t.fromSemester}</small>` : ""}</h2>
      <div class="pills" role="radiogroup" aria-label="${esc(t.label)}" data-key="${t.key}">
        ${t.options.map((o) => `<button class="pill" type="button" role="radio" data-id="${o.id}">${icon(trackIcon(o.name))}${esc(o.name)}</button>`).join("")}
      </div>
    </section>`).join("");
  document.querySelectorAll(".pills").forEach((group) => {
    const key = group.dataset.key;
    group.addEventListener("click", (e) => { const b = e.target.closest(".pill"); if (b) selectTrack(key, b.dataset.id); });
    group.addEventListener("keydown", (e) => {
      const keys = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
      if (!(e.key in keys)) return;
      e.preventDefault();
      const ids = [...group.querySelectorAll(".pill")].map((b) => b.dataset.id);
      const next = ids[(ids.indexOf(sel[key]) + keys[e.key] + ids.length) % ids.length];
      selectTrack(key, next);
      group.querySelector(`[data-id="${next}"]`).focus();
    });
  });
}

function selectTrack(key, id) {
  if (sel[key] === id) return;
  sel[key] = id;
  writeHash();
  remember();
  render(true);
}

/* ---------- Data helpers ---------- */

const byCode = (code) => prog.courses.find((c) => c.code === code);
const sum = (list, key) => list.reduce((a, c) => a + c[key], 0);
const matches = (cond) => !cond || Object.entries(cond).every(([k, v]) => (Array.isArray(v) ? v.includes(sel[k]) : sel[k] === v));
const trackOf = (key) => prog.tracks.find((t) => t.key === key);
const optionName = (key) => trackOf(key).options.find((o) => o.id === sel[key]).name;
const groupsIn = (s) => prog.groups.filter((g) => g.semester === s && matches(g.onlyFor));
const optionTotal = (o, key) => sum(o.courses.map(byCode), key);
const pickKey = (g) => g.sync || g.id;
const isTrackGroup = (g) => Boolean(g.onlyFor || g.linkedTrack);
const groupColor = (g) => (g.compulsory ? "core" : isTrackGroup(g) ? "spec" : "elec");
const isBudget = (g) => g.budget != null && g.options.length > 0;
const ownOption = (g) => g.linkedTrack && g.options.find((o) => o.track && o.track[g.linkedTrack] === sel[g.linkedTrack]);

function pickedOptions(g) {
  const own = ownOption(g);
  const ids = (picks[pickKey(g)] || []).filter((id) => g.options.some((o) => o.id === id) && (!own || id !== own.id));
  const chosen = ids.map((id) => g.options.find((o) => o.id === id));
  if (g.budget != null) return chosen;
  return own ? [own, ...chosen].slice(0, g.choose) : chosen.slice(0, g.choose);
}
const pickedEcts = (g) => pickedOptions(g).reduce((a, o) => a + optionTotal(o, "ects"), 0);
const isFull = (g) => (isBudget(g) ? pickedEcts(g) >= g.budget - 0.01 : pickedOptions(g).length >= g.choose);

// ECTS/SWS a group adds: the picks, and for choices still open the largest remaining option.
function groupTotal(g, key) {
  if (!g.options.length) return g[key] || 0;
  if (isBudget(g)) return key === "ects" ? g.budget : g.budgetSws ?? pickedOptions(g).reduce((a, o) => a + optionTotal(o, key), 0);
  const picked = pickedOptions(g);
  const rest = g.options.filter((o) => !picked.includes(o)).map((o) => optionTotal(o, key)).sort((a, b) => b - a);
  return picked.reduce((a, o) => a + optionTotal(o, key), 0) + rest.slice(0, g.choose - picked.length).reduce((a, b) => a + b, 0);
}

function semesterParts(s) {
  const inSem = prog.courses.filter((c) => c.semester === s && !c.group);
  return {
    core: inSem.filter((c) => !c.track),
    tracks: prog.tracks.map((t) => ({ track: t, courses: inSem.filter((c) => c.track && c.track[t.key] && matches(c.track)) })),
    groups: groupsIn(s),
  };
}

function totals(s) {
  const p = semesterParts(s);
  const t = { core: sum(p.core, "ects"), spec: 0, minor: 0, elec: 0, sws: sum(p.core, "sws") };
  p.tracks.forEach(({ courses }, i) => { t[i ? "minor" : "spec"] += sum(courses, "ects"); t.sws += sum(courses, "sws"); });
  p.groups.forEach((g) => { t[groupColor(g)] = (t[groupColor(g)] || 0) + groupTotal(g, "ects"); t.sws += groupTotal(g, "sws"); });
  t.ects = t.core + t.spec + t.minor + t.elec;
  return t;
}

const semesters = () => Array.from({ length: prog.semesters }, (_, i) => i + 1);
const perSemester = () => prog.ectsTotal / prog.semesters;

/* ---------- Render ---------- */

function render(animate) {
  document.querySelectorAll(".pills").forEach((g) => g.querySelectorAll(".pill").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.id === sel[g.dataset.key]))));
  renderNotes();
  renderOverview();
  semesters().forEach((s) => renderSlot(s, animate));
}

const RING = 94.25; // circumference of r = 15

function renderOverview() {
  const box = $("#overview");
  const first = !box.children.length;
  box.style.setProperty("--n", prog.semesters);
  box.classList.toggle("many", prog.semesters > 4);
  semesters().forEach((s, i) => {
    const t = totals(s);
    if (first) {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "sem-card" + (reduceMotion ? "" : " enter");
      card.style.setProperty("--i", i);
      card.dataset.sem = s;
      card.dataset.tip = "semester";
      const seg = (k) => `<circle class="seg ${k}" cx="18" cy="18" r="15" fill="none" stroke-width="5" transform="rotate(-90 18 18)" stroke-dasharray="0 ${RING}"/>`;
      card.innerHTML = `<svg class="ring" viewBox="0 0 36 36" aria-hidden="true"><circle class="track" cx="18" cy="18" r="15" fill="none" stroke-width="5"/>
        ${["core", "spec", "minor", "elec"].map(seg).join("")}</svg>
        <span><small>Semester ${s}</small><b></b></span>`;
      card.addEventListener("click", () => document.getElementById("sem-" + s).scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth" }));
      box.appendChild(card);
    }
    const card = box.querySelector(`[data-sem="${s}"]`);
    // Same split as the tooltip: everyone, track(s), electives — each a segment with a small gap.
    let start = 0;
    ["core", "spec", "minor", "elec"].forEach((k) => {
      const len = (t[k] || 0) / (t.ects || 1) * RING;
      const el = $(`.seg.${k}`, card);
      el.setAttribute("stroke-dasharray", `${Math.max(0, len - 1.2).toFixed(2)} ${RING}`);
      el.setAttribute("stroke-dashoffset", (-start).toFixed(2));
      el.style.opacity = len > 0.5 ? "1" : "0";
      start += len;
    });
    countTo($("b", card), t.ects, (v) => `${fmt(v)} ECTS`);
    card.classList.toggle("off", Math.abs(t.ects - perSemester()) > 0.01);
    const head = $(`#sem-${s} .sum`);
    countTo(head && $(".sum-v", head), t.ects, (v) => `${fmt(v)} ECTS`);
  });

  const choosable = semesters().flatMap(groupsIn).filter((g) => g.options.length);
  const need = choosable.reduce((a, g) => a + (isBudget(g) ? 1 : g.choose - (ownOption(g) ? 1 : 0)), 0);
  const have = choosable.reduce((a, g) => a + (isBudget(g) ? (isFull(g) ? 1 : 0) : pickedOptions(g).length - (ownOption(g) ? 1 : 0)), 0);
  const info = $("#picks-info");
  if (!need) { info.innerHTML = ""; return; }
  if (!$(".have", info)) {
    info.innerHTML = `${icon("star")}<span data-tip="text" data-text="Totals use your picks. Choices you have not made yet count with the largest option." tabindex="0"><span class="have"></span> of <span class="need"></span> electives picked</span>`;
  }
  countTo($(".have", info), have, (v) => String(Math.round(v)));
  $(".need", info).textContent = need;
}

function buildSemesters() {
  $("#semesters").innerHTML = semesters().map((s) => {
    const warns = prog.notes.filter((n) => n.semester === s);
    return `<section class="semester" id="sem-${s}" aria-labelledby="sem-${s}-t">
      <div class="sem-head">
        <h2 id="sem-${s}-t">Semester ${s}</h2>
        <button class="sum" type="button" data-tip="semester" data-sem="${s}"><span class="sum-v"></span>${warns.length ? `<span class="warn-ico" data-tip="semnote" data-sem="${s}" aria-label="Note">${icon("alert")}</span>` : ""}</button>
      </div>
      <div class="slot"></div>
    </section>`;
  }).join("");
  if (!$("#semesters").dataset.bound) {
    $("#semesters").dataset.bound = "1";
    $("#semesters").addEventListener("click", onSemesterClick);
  }
}

function onSemesterClick(e) {
  const opt = e.target.closest(".opt");
  if (opt && !opt.disabled) { togglePick(opt.dataset.group, opt.dataset.opt); return; }
  const clear = e.target.closest(".clear");
  if (clear) {
    const g = prog.groups.find((x) => x.id === clear.dataset.group);
    picks[pickKey(g)] = [];
    afterPick(g);
  }
}

function slotHtml(s) {
  const p = semesterParts(s);
  let html = "";
  p.tracks.forEach(({ track, courses }, i) => {
    if (!courses.length) return;
    const cls = i ? "minor" : "spec";
    html += `<div class="group"><h3 class="group-head ${cls}">${icon(trackIcon(optionName(track.key)))}${esc(optionName(track.key))}</h3>
      <div class="rows">${courses.map((c) => rowHtml(c, cls)).join("")}</div></div>`;
  });
  const slotsCore = p.groups.filter((g) => !g.options.length && g.compulsory);
  if (p.core.length || slotsCore.length) {
    html += `<div class="group"><h3 class="group-head">${icon("users")}Everyone</h3>
      <div class="rows">${p.core.map((c) => rowHtml(c, "core")).join("")}</div>
      ${slotsCore.length ? `<div class="cards" style="margin-top:8px">${slotsCore.map(slotCardHtml).join("")}</div>` : ""}</div>`;
  }
  p.groups.filter((g) => !(g.compulsory && !g.options.length)).forEach((g) => { html += groupHtml(g); });
  return html;
}

function rowHtml(c, cls) {
  return `<div class="row ${cls}">
    <i class="stripe"></i>
    <button class="row-title" type="button" data-tip="course" data-code="${esc(c.code)}">${esc(c.title)}</button>
    <span class="chip" tabindex="0" data-tip="type" data-type="${esc(c.type)}">${esc(c.type)}</span>
    <span class="num sws" tabindex="0" data-tip="sws" data-v="${c.sws}">${fmt(c.sws)} SWS</span>
    <span class="num assess" tabindex="0" data-tip="assess" data-v="${esc(c.assessment)}">${c.assessment === "final" ? "Exam" : "Cont."}</span>
    <span class="num ects" tabindex="0" data-tip="ects" data-v="${c.ects}">${fmt(c.ects)} ECTS</span>
  </div>`;
}

function ruleText(g) {
  if (!g.options.length) return "";
  if (isBudget(g)) return `pick courses worth ${fmt(g.budget)} ECTS`;
  if (g.linkedTrack) return `yours plus ${g.choose - 1 === 1 ? "one more" : g.choose - 1 + " more"}`;
  return `pick ${g.choose === 1 ? "one" : g.choose}`;
}

function groupHtml(g) {
  const color = groupColor(g);
  const picked = pickedOptions(g);
  const own = ownOption(g);
  const head = `<h3 class="group-head ${color === "spec" ? "spec" : "elec"}">${icon(color === "spec" ? "compass" : "star")}${esc(g.label)}
    ${ruleText(g) ? `<span class="rule">· ${ruleText(g)}</span>` : ""}
    ${g.note ? `<button class="hint" type="button" data-tip="group" data-group="${g.id}" aria-label="About this choice">${icon("info")}</button>` : ""}
    ${g.options.length ? `<button class="clear ${picked.length - (own ? 1 : 0) > 0 ? "show" : ""}" type="button" data-group="${g.id}">Clear</button>` : ""}</h3>`;
  if (!g.options.length) return `<div class="group">${head}<div class="cards">${slotCardHtml(g)}</div></div>`;
  const opts = own ? [own, ...g.options.filter((o) => o !== own)] : g.options;
  const multi = g.choose > 1 || isBudget(g);
  return `<div class="group ${color === "spec" ? "spec-choice" : ""} ${isFull(g) ? "full" : ""}" data-group="${g.id}">${head}
    <div class="cards" role="group" aria-label="${esc(g.label)}">${opts.map((o) => {
      const on = picked.includes(o);
      const n = o.courses.length;
      return `<button class="opt ${multi ? "multi" : ""}" type="button" role="checkbox" aria-checked="${on}" ${own === o ? "disabled" : ""}
          data-group="${g.id}" data-opt="${esc(o.id)}" data-tip="option">
        <span class="box">${icon("check")}</span>
        <span class="lbl">${esc(o.label)}${own === o ? `<span class="tag">Your major</span>` : ""}${n > 1 ? `<small>${n} courses</small>` : ""}</span>
        <span class="e">${fmt(optionTotal(o, "ects"))} ECTS</span>
      </button>`;
    }).join("")}</div></div>`;
}

function slotCardHtml(g) {
  return `<div class="slot-card" tabindex="0" data-tip="group" data-group="${g.id}"><span class="lbl">${esc(g.label)}</span><span class="e">${fmt(g.ects)} ECTS</span></div>`;
}

function renderSlot(s, animate) {
  const slot = $(`#sem-${s} .slot`);
  const html = slotHtml(s);
  if (slot.dataset.html === html) return;
  slot.dataset.html = html;
  if (!animate || reduceMotion) { slot.innerHTML = html; return; }

  // Old rows slide away, the slot glides to its new height, new rows slide in.
  const PARTS = ".row, .opt, .slot-card, .group-head";
  const old = slot.querySelectorAll(PARTS);
  old.forEach((r) => r.classList.add("leave"));
  setTimeout(() => {
    const from = slot.offsetHeight;
    slot.innerHTML = html;
    const to = slot.scrollHeight;
    slot.classList.add("sizing");
    slot.style.height = from + "px";
    void slot.offsetHeight;
    slot.style.height = to + "px";
    slot.addEventListener("transitionend", function done(ev) {
      if (ev.propertyName !== "height") return;
      slot.style.height = "";
      slot.classList.remove("sizing");
      slot.removeEventListener("transitionend", done);
    });
    slot.querySelectorAll(PARTS).forEach((r, i) => { r.style.setProperty("--i", Math.min(i, 12)); r.classList.add("enter"); });
  }, old.length ? 160 : 0);
}

/* ---------- Picking electives ---------- */

function togglePick(gid, oid) {
  const g = prog.groups.find((x) => x.id === gid);
  const own = ownOption(g);
  if (own && own.id === oid) return;
  const slots = g.choose - (own ? 1 : 0);
  let list = (picks[pickKey(g)] || []).filter((id) => id !== (own && own.id));
  if (list.includes(oid)) list = list.filter((id) => id !== oid);
  else if (isBudget(g)) {
    list.push(oid);
    const ects = (ids) => ids.reduce((a, id) => a + optionTotal(g.options.find((o) => o.id === id), "ects"), 0);
    while (list.length > 1 && ects(list) > g.budget + 0.01) list.shift(); // the oldest pick makes room
  } else {
    list.push(oid);
    while (list.length > slots) list.shift(); // the oldest pick makes room
  }
  picks[pickKey(g)] = list;
  afterPick(g);
}

// Updates picked states in place (groups that share a choice too) and the totals.
function afterPick(first) {
  prog.groups.filter((g) => pickKey(g) === pickKey(first)).forEach((g) => {
    const el = document.querySelector(`.group[data-group="${g.id}"]`);
    if (!el) return;
    const picked = pickedOptions(g).map((o) => o.id);
    el.classList.toggle("full", isFull(g));
    el.querySelectorAll(".opt").forEach((o) => o.setAttribute("aria-checked", String(picked.includes(o.dataset.opt))));
    const clear = $(".clear", el);
    if (clear) clear.classList.toggle("show", picked.length - (ownOption(g) ? 1 : 0) > 0);
  });
  remember();
  renderOverview();
}

/* ---------- Tooltips: one shared element, content built on demand ---------- */

const tip = () => $("#tip");
let tipFor = null, showTimer = null, hideTimer = null, warm = false;

function tipContent(el) {
  const d = el.dataset, L = index.legend;
  switch (d.tip) {
    case "course": {
      const c = byCode(d.code);
      const text = c.content.length > 260 ? c.content.slice(0, 260).replace(/\s+\S*$/, "") + "…" : c.content;
      return `<b class="t-title">${esc(c.title)}</b>${text ? `<span class="t-muted">${esc(text)}</span>` : ""}
        <span class="t-meta">${esc(c.module)} · ${esc(c.sourceCode || c.code)} · ${esc(c.language)}</span>`;
    }
    case "type": return { small: true, html: esc(L.types[d.type] || "Course type not explained by the source") };
    case "sws": return { small: true, html: `${fmt(d.v * 14)} contact hours over the semester` };
    case "assess": return { small: true, html: esc(L.assessment[d.v] || d.v) };
    case "ects": return { small: true, html: `About ${fmt(d.v * 25)} hours of work` };
    case "programme": {
      const b = prog.source.brochure;
      return `<b class="t-title">${esc(prog.degree)} · ${esc(deptName())}</b>
        <span class="t-muted">${esc(prog.mode)} · taught in ${esc(prog.language)} · ${prog.semesters} semesters · ${prog.ectsTotal} ECTS</span>
        <span class="t-meta">Data as of ${prettyDate(prog.dataAsOf)} · source: FH Salzburg curriculum page${b ? ` and brochure (version ${esc(b.version)})` : ""}</span>`;
    }
    case "semester": {
      const s = +d.sem, t = totals(s);
      const line = (color, label, v) => (v ? `<span class="t-line"><span><i style="background:${color}"></i>${esc(label)}</span><span>${fmt(v)} ECTS</span></span>` : "");
      return `<b class="t-title">Semester ${s} · ${season(s)} term · ${fmt(t.sws)} SWS</b>
        ${line("var(--core)", "Everyone", t.core)}
        ${prog.tracks.map((tr, i) => line(i ? "var(--minor)" : "var(--accent)", optionName(tr.key), i ? t.minor : t.spec)).join("")}
        ${line("var(--elec)", "Electives", t.elec)}`;
    }
    case "notes": return prog.notes.filter((n) => !n.semester && matches(n.onlyFor)).map((n) => `<p>${esc(n.text)}</p>`).join("");
    case "semnote": return prog.notes.filter((n) => n.semester === +d.sem).map((n) => `<p>${esc(n.text)}</p>`).join("");
    case "group": { const g = prog.groups.find((x) => x.id === d.group); return `<b class="t-title">${esc(g.label)}</b><span class="t-muted">${esc(g.note || "")}</span>`; }
    case "option": {
      const g = prog.groups.find((x) => x.id === d.group);
      const o = g.options.find((x) => x.id === d.opt);
      const cs = o.courses.map(byCode);
      if (cs.length === 1) {
        const c = cs[0];
        const text = c.content.length > 220 ? c.content.slice(0, 220).replace(/\s+\S*$/, "") + "…" : c.content;
        return `<b class="t-title">${esc(c.title)}</b><span class="t-meta" style="margin:0 0 6px">${esc(L.types[c.type] || c.type)} · ${fmt(c.sws)} SWS · ${esc(L.assessment[c.assessment] || c.assessment)}</span>${text ? `<span class="t-muted">${esc(text)}</span>` : ""}`;
      }
      return `<b class="t-title">${esc(o.label)}</b><ul>${cs.map((c) => `<li>${esc(c.title)} · ${fmt(c.ects)} ECTS</li>`).join("")}</ul>`;
    }
    case "saved": return navigator.onLine
      ? "Your programme, specialisation and picked electives are saved in this browser. The app also works offline."
      : "You are offline. Showing the saved copy of the data.";
    case "prog": { const p = findProgramme(d.id); return { small: true, html: `${esc(p.degree)} · ${esc(p.mode)} · ${esc(p.language)} · ${p.semesters} semesters` }; }
    case "text": return esc(d.text);
  }
  return "";
}

function showTip(el) {
  clearTimeout(hideTimer);
  const t = tip();
  let content;
  try { content = tipContent(el); } catch { content = ""; } // e.g. an element of the programme that is just being replaced
  const small = typeof content === "object" && content.small;
  if (typeof content === "object") content = content.html;
  if (!content) return;
  t.innerHTML = content;
  t.className = "tip" + (small ? " small" : "");
  tipFor = el;
  el.setAttribute("aria-describedby", "tip");

  const sheet = !canHover && window.matchMedia("(max-width: 900px)").matches;
  if (sheet) {
    t.classList.add("sheet");
  } else {
    const r = el.getBoundingClientRect();
    const w = t.offsetWidth, h = t.offsetHeight;
    const top = parseInt(getComputedStyle(document.documentElement).getPropertyValue("--top"), 10) || 64;
    const above = r.top - h - 12 > top + 4;
    const anchorX = r.left + Math.min(r.width / 2, 120);
    const left = Math.max(12, Math.min(window.innerWidth - w - 12, anchorX - w / 2));
    t.style.left = left + "px";
    t.style.top = (above ? r.top - h - 10 : r.bottom + 10) + "px";
    t.style.setProperty("--ax", Math.max(16, Math.min(w - 16, anchorX - left)) + "px");
    t.classList.add(above ? "above" : "below");
  }
  void t.offsetWidth;
  t.classList.add("show");
  warm = true;
}

function hideTip(now) {
  clearTimeout(showTimer);
  const t = tip();
  if (!t) return;
  const go = () => {
    t.classList.remove("show");
    if (tipFor) tipFor.removeAttribute("aria-describedby");
    tipFor = null;
    setTimeout(() => { if (!tipFor) warm = false; }, 300);
  };
  if (now) go(); else hideTimer = setTimeout(go, 80);
}

function initTips() {
  document.addEventListener("pointerover", (e) => {
    if (e.pointerType === "touch") return;
    const el = e.target.closest("[data-tip]");
    if (!el || el === tipFor) return;
    clearTimeout(showTimer);
    // Only after resting on an element; while one is already open, the next follows a little faster.
    showTimer = setTimeout(() => showTip(el), warm ? 250 : 650);
  });
  document.addEventListener("pointerout", (e) => {
    if (e.pointerType === "touch") return;
    const el = e.target.closest("[data-tip]");
    if (!el || (e.relatedTarget && el.contains(e.relatedTarget))) return;
    clearTimeout(showTimer);
    if (el === tipFor) hideTip(false);
  });
  document.addEventListener("focusin", (e) => {
    const el = e.target.closest("[data-tip]");
    if (el && el.matches(":focus-visible")) showTip(el);
  });
  document.addEventListener("focusout", (e) => { if (e.target.closest("[data-tip]") === tipFor) hideTip(false); });
  // Touch: tap shows the tooltip as a card at the bottom; tapping again or elsewhere closes it.
  document.addEventListener("click", (e) => {
    if (canHover) return;
    const el = e.target.closest("[data-tip]");
    if (!el) { hideTip(true); return; }
    if (el === tipFor) { hideTip(true); return; }
    showTip(el);
  });
  window.addEventListener("scroll", () => { if (tipFor && canHover) hideTip(true); }, { passive: true });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") hideTip(true); });
}

init();
