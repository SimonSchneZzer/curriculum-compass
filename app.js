"use strict";

const STORE_KEY = "ct-study-planner";
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

let index;          // data/index.json
let prog;           // the programme shown
let sel = {};       // selected track options, e.g. { major: "film", minor: "ai" }
const cache = {};

const $ = (s) => document.querySelector(s);
const fmt = (n) => (Math.round(n * 10) / 10).toLocaleString("en", { maximumFractionDigits: 1 });
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const season = (s) => (s % 2 ? "Winter" : "Summer");
const wait = (ms) => new Promise((r) => setTimeout(r, reduceMotion ? 0 : ms));

/* ---------- Storage (per-viewer convenience only) ---------- */

function loadStore() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch { return {}; }
}
function saveStore() {
  try {
    const st = loadStore();
    st.last = prog.id;
    st.sel = { ...(st.sel || {}), [prog.id]: sel };
    localStorage.setItem(STORE_KEY, JSON.stringify(st));
  } catch { /* storage unavailable */ }
}

/* ---------- URL: #/<programme>/<track option>/<track option> ---------- */

function readHash() {
  const parts = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  if (!parts.length) return null;
  // Links from the first version used #film, #audio … for the MultiMediaArt master.
  if (parts.length === 1 && !index.programmes.some((p) => p.id === parts[0])) return { id: "mma-m", opts: parts };
  return { id: parts[0], opts: parts.slice(1) };
}
function writeHash() {
  const opts = prog.tracks.map((t) => sel[t.key]);
  history.replaceState(null, "", "#/" + [prog.id, ...opts].join("/"));
}

/* ---------- Boot ---------- */

async function init() {
  try {
    index = await (await fetch("data/index.json")).json();
  } catch {
    $("#asof").textContent = "Could not load the curriculum data.";
    return;
  }
  buildMenu();
  const h = readHash();
  const st = loadStore();
  const id = h && index.programmes.some((p) => p.id === h.id) ? h.id : st.last || "mma-m";
  await openProgramme(id, h && h.id === id ? h.opts : null, false);

  window.addEventListener("hashchange", async () => {
    const hh = readHash();
    if (!hh) return;
    if (hh.id !== prog.id) await openProgramme(hh.id, hh.opts, true);
    else applyOpts(hh.opts, true);
  });
  window.addEventListener("resize", () => document.querySelectorAll(".segmented").forEach(moveThumb));
}

async function getProgramme(id) {
  if (!cache[id]) {
    const meta = index.programmes.find((p) => p.id === id);
    cache[id] = await (await fetch(meta.file)).json();
  }
  return cache[id];
}

async function openProgramme(id, opts, animate) {
  const data = await getProgramme(id);
  const page = $("#page");
  if (animate && !reduceMotion) {
    page.classList.remove("in");
    page.classList.add("out");
    await wait(180);
  }
  prog = data;
  const stored = (loadStore().sel || {})[id] || {};
  sel = {};
  prog.tracks.forEach((t, i) => {
    const ids = t.options.map((o) => o.id);
    const fromUrl = opts && opts[i];
    sel[t.key] = ids.includes(fromUrl) ? fromUrl : ids.includes(stored[t.key]) ? stored[t.key] : ids[0];
  });

  buildHeader();
  buildPickers();
  buildLegend();
  $("#overview").innerHTML = "";
  buildSemesters();
  render(false);
  updateMenu();
  writeHash();
  saveStore();

  if (animate) {
    page.classList.remove("out");
    if (!reduceMotion) { void page.offsetWidth; page.classList.add("in"); }
    window.scrollTo({ top: 0, behavior: "auto" });
  }
}

function applyOpts(opts, animate) {
  let changed = false;
  prog.tracks.forEach((t, i) => {
    if (opts[i] && t.options.some((o) => o.id === opts[i]) && sel[t.key] !== opts[i]) { sel[t.key] = opts[i]; changed = true; }
  });
  if (changed) { render(animate); saveStore(); }
}

/* ---------- Navigation menu ---------- */

function buildMenu() {
  const menu = $("#menu");
  const groups = [["Bachelor", (p) => p.degree === "Bachelor"], ["Master", (p) => p.degree !== "Bachelor"]];
  let i = 0;
  menu.innerHTML = groups.map(([label, test]) => `
    <div class="menu-group" role="group" aria-label="${label}">
      <h3>${label}</h3>
      ${index.programmes.filter(test).map((p) => `
        <button class="menu-item" type="button" role="menuitem" data-id="${p.id}" style="--i:${i++}">
          <b><i></i>${esc(p.name)}</b>
          <span>${p.degree.startsWith("Joint") ? "Joint degree · " : ""}${esc(p.mode)} · ${esc(p.language)} · ${p.semesters} semesters</span>
        </button>`).join("")}
    </div>`).join("");

  const sw = $("#switcher");
  sw.addEventListener("click", () => toggleMenu(sw.getAttribute("aria-expanded") !== "true"));
  $("#scrim").addEventListener("click", () => toggleMenu(false));
  menu.addEventListener("click", (e) => {
    const item = e.target.closest(".menu-item");
    if (!item) return;
    toggleMenu(false);
    if (item.dataset.id !== prog.id) openProgramme(item.dataset.id, null, true);
  });
  document.addEventListener("keydown", (e) => {
    if (sw.getAttribute("aria-expanded") !== "true") return;
    const items = [...menu.querySelectorAll(".menu-item")];
    const at = items.indexOf(document.activeElement);
    if (e.key === "Escape") { toggleMenu(false); sw.focus(); }
    else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const next = (at + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
      items[next].focus();
    }
  });
}

function toggleMenu(open) {
  const menu = $("#menu");
  $("#switcher").setAttribute("aria-expanded", String(open));
  $("#scrim").classList.toggle("show", open);
  if (open) {
    // Restart the item entrance animation each time the menu opens.
    menu.classList.remove("open");
    void menu.offsetWidth;
    menu.classList.add("open");
    const current = menu.querySelector('[aria-current="true"]') || menu.querySelector(".menu-item");
    setTimeout(() => current.focus({ preventScroll: true }), 50);
  } else {
    menu.classList.remove("open");
  }
}

function updateMenu() {
  document.querySelectorAll(".menu-item").forEach((m) => m.setAttribute("aria-current", String(m.dataset.id === prog.id)));
  $("#switcher-degree").textContent = prog.degree;
  $("#switcher-name").textContent = prog.name;
  document.title = `${prog.name} (${prog.degree}) · CT Study Planner`;
}

/* ---------- Header, pickers, legend ---------- */

function buildHeader() {
  $("#title").textContent = prog.name;
  $("#eyebrow").textContent = `${prog.degree} · Creative Technologies · FH Salzburg`;
  $("#chips").innerHTML = [prog.mode, `Taught in ${prog.language}`, `${prog.semesters} semesters`, `${prog.ectsTotal} ECTS`]
    .map((c) => `<li>${esc(c)}</li>`).join("");
  const date = new Date(prog.dataAsOf + "T12:00:00");
  const pretty = date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  $("#asof").innerHTML = `Data as of <strong><time datetime="${prog.dataAsOf}">${pretty}</time></strong>`;
  const b = prog.source.brochure;
  $("#source").innerHTML = `Source: <a href="${esc(prog.source.curriculum)}">curriculum page</a> and <a href="${esc(b.url)}">programme brochure</a> (version ${esc(b.version)}) of FH Salzburg.`;
  $("#json-link").href = `data/${prog.id}.json`;
}

function buildPickers() {
  const box = $("#pickers");
  box.innerHTML = prog.tracks.map((t, i) => `
    <section class="picker ${i ? "minor" : ""}" aria-label="${esc(t.label)}">
      <h2 class="label" id="picker-${t.key}">Your ${esc(t.label.toLowerCase())}${t.fromSemester > 1 ? ` <small>· from semester ${t.fromSemester}</small>` : ""}</h2>
      <div class="segmented ${t.options.length > 3 ? "four" : ""}" role="radiogroup" aria-labelledby="picker-${t.key}" data-key="${t.key}">
        <span class="thumb" aria-hidden="true"></span>
        ${t.options.map((o) => `<button type="button" role="radio" data-id="${o.id}">${esc(o.name)}</button>`).join("")}
      </div>
    </section>`).join("");
  box.querySelectorAll(".segmented").forEach((seg) => {
    const key = seg.dataset.key;
    seg.addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (b) selectTrack(key, b.dataset.id);
    });
    seg.addEventListener("keydown", (e) => {
      const keys = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
      if (!(e.key in keys)) return;
      e.preventDefault();
      const ids = [...seg.querySelectorAll("button")].map((b) => b.dataset.id);
      const next = ids[(ids.indexOf(sel[key]) + keys[e.key] + ids.length) % ids.length];
      selectTrack(key, next);
      seg.querySelector(`button[data-id="${next}"]`).focus();
    });
    // Place the thumb without a glide on first paint.
    const thumb = seg.querySelector(".thumb");
    thumb.style.transition = "none";
    moveThumb(seg);
    void thumb.offsetWidth;
    thumb.style.transition = "";
  });
}

function selectTrack(key, id) {
  if (sel[key] === id) return;
  sel[key] = id;
  writeHash();
  saveStore();
  render(true);
}

function moveThumb(seg) {
  const btn = seg.querySelector(`button[data-id="${sel[seg.dataset.key]}"]`) || seg.querySelector("button");
  const thumb = seg.querySelector(".thumb");
  thumb.style.width = btn.offsetWidth + "px";
  thumb.style.height = btn.offsetHeight + "px";
  thumb.style.transform = `translate(${btn.offsetLeft}px, ${btn.offsetTop}px)`;
}

function buildLegend() {
  const l = index.legend;
  const used = [...new Set(prog.courses.map((c) => c.type))].sort();
  const rows = [["SWS", l.sws], ["ECTS", l.ects], ["Semesters", l.semester], ...used.map((t) => [t, l.types[t] || "Not defined in the source legend"])];
  $("#legend").innerHTML = rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("");
}

/* ---------- Data helpers ---------- */

const byCode = (code) => prog.courses.find((c) => c.code === code);
const sum = (list, key) => list.reduce((a, c) => a + c[key], 0);
const matches = (cond) => !cond || Object.entries(cond).every(([k, v]) => sel[k] === v);
const trackOf = (key) => prog.tracks.find((t) => t.key === key);
const optionName = (key) => trackOf(key).options.find((o) => o.id === sel[key]).name;

function groupsIn(s) {
  return prog.groups.filter((g) => g.semester === s && matches(g.onlyFor));
}

function optionTotal(o, key) {
  return sum(o.courses.map(byCode), key);
}

// ECTS/SWS a group adds to the semester: the chosen number of options (or the fixed amount of an open slot).
function groupTotal(g, key) {
  if (!g.options.length) return g[key] || 0;
  if (g.linkedTrack) {
    const own = g.options.find((o) => o.track && o.track[g.linkedTrack] === sel[g.linkedTrack]);
    const others = g.options.filter((o) => o !== own).map((o) => optionTotal(o, key)).sort((a, b) => b - a);
    return (own ? optionTotal(own, key) : 0) + others.slice(0, g.choose - (own ? 1 : 0)).reduce((a, b) => a + b, 0);
  }
  const vals = g.options.map((o) => optionTotal(o, key)).sort((a, b) => b - a);
  return vals.slice(0, g.choose).reduce((a, b) => a + b, 0);
}

const isTrackGroup = (g) => Boolean(g.onlyFor || g.linkedTrack);

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
  p.tracks.forEach(({ track, courses }, i) => {
    t[i ? "minor" : "spec"] += sum(courses, "ects");
    t.sws += sum(courses, "sws");
  });
  p.groups.forEach((g) => {
    t[isTrackGroup(g) ? "spec" : "elec"] += groupTotal(g, "ects");
    t.sws += groupTotal(g, "sws");
  });
  t.ects = t.core + t.spec + t.minor + t.elec;
  return t;
}

const semesters = () => Array.from({ length: prog.semesters }, (_, i) => i + 1);

/* ---------- Render ---------- */

function render(animate) {
  document.querySelectorAll(".segmented").forEach((seg) => {
    seg.querySelectorAll("button").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.id === sel[seg.dataset.key])));
    moveThumb(seg);
  });
  renderNote();
  renderOverview(animate);
  semesters().forEach((s) => renderSlot(s, animate));
}

function renderNote() {
  const notes = prog.notes.filter((n) => !n.semester && matches(n.onlyFor));
  const note = $("#note");
  if (notes.length) {
    $("#note-text").innerHTML = notes.map((n) => `<p>${esc(n.text)}</p>`).join("");
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
      card.innerHTML = `<h3>Semester ${s}</h3><span class="season">${season(s)} term</span>
        <div class="figures"><div class="fig"><b data-k="ects">0</b><span>ECTS</span></div><div class="fig"><b data-k="sws">0</b><span>SWS</span></div></div>
        <div class="bar"><i class="core"></i><i class="spec"></i><i class="minor"></i><i class="elec"></i></div>`;
      card.addEventListener("click", () => document.getElementById("sem-" + s).scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth" }));
      if (!reduceMotion) { card.classList.add("enter"); card.style.setProperty("--i", i); }
      box.appendChild(card);
    }
    const card = box.querySelector(`[data-sem="${s}"]`);
    card.classList.toggle("off", Math.abs(t.ects - 30) > 0.01);
    setNumber(card.querySelector('[data-k="ects"]'), t.ects, true);
    setNumber(card.querySelector('[data-k="sws"]'), t.sws, true);
    ["core", "spec", "minor", "elec"].forEach((k) => { card.querySelector(".bar ." + k).style.flexGrow = t[k]; });
  });

  if (first) {
    const total = document.createElement("div");
    total.className = "card total";
    total.innerHTML = `<h3>Whole programme</h3><span class="season">${prog.semesters} semesters</span>
      <div class="figures"><div class="fig"><b data-k="ects">0</b><span>ECTS</span></div><div class="fig"><b data-k="sws">0</b><span>SWS</span></div></div>`;
    if (!reduceMotion) { total.classList.add("enter"); total.style.setProperty("--i", prog.semesters); }
    box.appendChild(total);
  }
  const total = box.querySelector(".total");
  setNumber(total.querySelector('[data-k="ects"]'), allEcts, true);
  setNumber(total.querySelector('[data-k="sws"]'), allSws, true);

  const key = [`<span><i class="dot core"></i>Everyone</span>`];
  prog.tracks.forEach((t, i) => key.push(`<span><i class="dot ${i ? "minor" : "spec"}"></i>Your ${esc(t.label.toLowerCase())}</span>`));
  if (prog.groups.some((g) => !isTrackGroup(g))) key.push(`<span><i class="dot elec"></i>Electives</span>`);
  $("#key").innerHTML = key.join("");
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
  root.innerHTML = "";
  semesters().forEach((s) => {
    const p = semesterParts(s);
    const warns = prog.notes.filter((n) => n.semester === s);
    const sec = document.createElement("section");
    sec.className = "semester";
    sec.id = "sem-" + s;
    sec.setAttribute("aria-labelledby", `sem-${s}-title`);
    sec.innerHTML = `<div class="semester-head"><h2 id="sem-${s}-title">Semester ${s}</h2><p data-k="sum"></p></div>
      ${warns.map((w) => `<p class="warn"><strong>Source data:</strong> ${esc(w.text)}</p>`).join("")}
      ${p.core.length ? `<div class="group"><h3><i class="dot core"></i>For everyone</h3><div class="list">${p.core.map((c) => courseHtml(c, "core")).join("")}</div></div>` : ""}
      <div class="slot"></div>`;
    root.appendChild(sec);
  });
  if (!root.dataset.bound) {
    root.dataset.bound = "1";
    root.addEventListener("click", (e) => {
      const btn = e.target.closest(".course > button");
      if (!btn) return;
      const open = btn.parentElement.classList.toggle("open");
      btn.setAttribute("aria-expanded", String(open));
    });
  }
}

function slotHtml(s) {
  const p = semesterParts(s);
  let html = "";
  p.tracks.forEach(({ track, courses }, i) => {
    if (!courses.length) return;
    const color = i ? "minor" : "spec";
    html += `<div class="group"><h3><i class="dot ${color}"></i>${esc(optionName(track.key))} <small>· your ${esc(track.label.toLowerCase())}</small></h3>
      <div class="list">${courses.map((c) => courseHtml(c, color)).join("")}</div></div>`;
  });
  p.groups.forEach((g) => {
    const color = isTrackGroup(g) ? "spec" : "elec";
    const ects = groupTotal(g, "ects");
    let rule;
    if (!g.options.length) rule = `${fmt(ects)} ECTS`;
    else if (g.linkedTrack) rule = `yours plus ${g.choose - 1 === 1 ? "one more" : g.choose - 1 + " more"}, ${fmt(ects)} ECTS`;
    else rule = `choose ${g.choose === 1 ? "one" : g.choose}${g.open ? "" : ` of ${g.options.length}`}, ${fmt(ects)} ECTS`;
    html += `<div class="group"><h3><i class="dot ${color}"></i>${esc(g.label)} <small>· ${rule}</small></h3>
      ${g.note ? `<p class="group-note">${esc(g.note)}</p>` : ""}
      <div class="list">${groupRows(g, color)}</div></div>`;
  });
  return html;
}

function groupRows(g, color) {
  if (!g.options.length) {
    return `<div class="placeholder"><span class="stripe" style="background:var(--${color})"></span>
      <span class="title">${esc(g.label)}</span><span class="meta sws">${fmt(g.sws || 0)} SWS</span><span class="meta">${fmt(g.ects)} ECTS</span></div>`;
  }
  let opts = g.options;
  if (g.linkedTrack) {
    const own = opts.find((o) => o.track && o.track[g.linkedTrack] === sel[g.linkedTrack]);
    opts = [own, ...opts.filter((o) => o !== own)];
  }
  const bundled = g.linkedTrack || opts.some((o) => o.courses.length > 1);
  return opts.map((o, i) => {
    const courses = o.courses.map(byCode);
    if (!bundled) return courseHtml(courses[0], color);
    const isOwn = g.linkedTrack && i === 0;
    return `<div class="subhead">${esc(o.label)} ${isOwn ? `<span class="tag">Your major</span>` : ""}<small>${fmt(optionTotal(o, "ects"))} ECTS</small></div>`
      + courses.map((c) => courseHtml(c, color)).join("");
  }).join("");
}

function renderSlot(s, animate) {
  const sec = document.getElementById("sem-" + s);
  const t = totals(s);
  sec.querySelector('[data-k="sum"]').textContent = `${season(s)} term · ${fmt(t.ects)} ECTS · ${fmt(t.sws)} SWS`;
  const slot = sec.querySelector(".slot");
  const html = slotHtml(s);
  if (slot.dataset.html === html) return;
  slot.dataset.html = html;

  if (!animate || reduceMotion) { slot.innerHTML = html; return; }

  // Old rows slide away, the slot glides to its new height, new rows slide in.
  const rows = slot.querySelectorAll(".course, .subhead, .placeholder, .group-note, h3");
  rows.forEach((r) => r.classList.add("leave"));
  setTimeout(() => {
    const from = slot.offsetHeight;
    slot.innerHTML = html;
    const to = slot.scrollHeight;
    slot.style.height = from + "px";
    void slot.offsetHeight;
    slot.style.height = to + "px";
    slot.addEventListener("transitionend", function done(ev) {
      if (ev.propertyName !== "height") return;
      slot.style.height = "";
      slot.removeEventListener("transitionend", done);
    });
    slot.querySelectorAll(".course, .subhead, .placeholder, .group-note, h3").forEach((r, i) => {
      r.style.setProperty("--i", Math.min(i, 12));
      r.classList.add("enter");
    });
  }, rows.length ? 160 : 0);
}

function courseHtml(c, color) {
  const typeName = index.legend.types[c.type] || c.type;
  const assess = index.legend.assessment[c.assessment] || c.assessment;
  const id = "d-" + c.code + "-" + color;
  return `<div class="course">
    <button type="button" aria-expanded="false" aria-controls="${id}">
      <span class="stripe" style="background:var(--${color})"></span>
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
      ${c.content ? `<h4>Content</h4><p>${esc(c.content)}</p>` : ""}
      ${c.learningOutcome ? `<h4>Learning outcome</h4><p>${esc(c.learningOutcome)}</p>` : ""}
    </div></div></div>
  </div>`;
}

init();
