/* Shared helpers: DOM, markdown, course index, penguin fallback. Defines window.App (namespace for all engine scripts). */
(function () {
  "use strict";
  const App = (window.App = window.App || {});

  // ------------------------------------------------------------------ DOM / text
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  App.esc = esc;
  App.$ = (sel, root) => (root || document).querySelector(sel);
  App.$$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  /** h("div.card.card-hero", {onclick}, child...) -> Element. Strings are text; use {html: "..."} for markup. */
  App.h = function h(tag, attrs, ...kids) {
    const m = String(tag).match(/^([a-z0-9-]+)?((?:[.#][\w-]+)*)$/i) || [];
    const el = document.createElement(m[1] || "div");
    (m[2] || "").replace(/([.#])([\w-]+)/g, (_, t, v) => { if (t === ".") el.classList.add(v); else el.id = v; });
    if (attrs && (typeof attrs !== "object" || attrs instanceof Node || Array.isArray(attrs))) { kids.unshift(attrs); attrs = null; }
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === "html") el.innerHTML = v;
      else if (k === "text") el.textContent = v;
      else if (k === "class") el.className += (el.className ? " " : "") + v;
      else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
      else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
      else if (v === true) el.setAttribute(k, "");
      else el.setAttribute(k, v);
    }
    const add = (k) => {
      if (k == null || k === false) return;
      if (Array.isArray(k)) k.forEach(add);
      else if (k instanceof Node) el.appendChild(k);
      else el.appendChild(document.createTextNode(String(k)));
    };
    kids.forEach(add);
    return el;
  };
  App.shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  App.pick = (a) => a[Math.floor(Math.random() * a.length)];
  App.fold = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  App.dayKey = (d) => { d = d || new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
  App.debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

  App.toast = function (msg, ms) {
    App.$$(".toast:not(.static)").forEach((x) => x.remove());
    const t = App.h("div.toast", { role: "status", html: msg });
    document.body.appendChild(t);
    setTimeout(() => { t.classList.add("hide"); setTimeout(() => t.remove(), 300); }, ms || 2600);
  };

  // ------------------------------------------------------------------ tiny markdown (bold, italic, code, lists, tables, headings)
  function inline(s) {
    return esc(s)
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[^*\w])\*([^*\n]+)\*(?!\w)/g, "$1<em>$2</em>")
      .replace(/(^|\W)_([^_\n]+)_(?!\w)/g, "$1<em>$2</em>");
  }
  App.inline = inline;
  App.md = function (src) {
    const lines = String(src || "").replace(/\r/g, "").split("\n");
    let out = "", i = 0;
    while (i < lines.length) {
      const l = lines[i];
      if (!l.trim()) { i++; continue; }
      let m;
      if ((m = l.match(/^(#{1,4})\s+(.*)/))) { const n = Math.min(6, m[1].length + 2); out += `<h${n}>${inline(m[2])}</h${n}>`; i++; continue; }
      if (/^\s*\|/.test(l)) {
        const rows = [];
        while (i < lines.length && /^\s*\|/.test(lines[i])) rows.push(lines[i++]);
        const cells = (r) => r.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
        let head = null, body = rows;
        if (rows.length > 1 && /^[\s|:-]+$/.test(rows[1])) { head = cells(rows[0]); body = rows.slice(2); }
        out += "<div class=\"table-wrap\"><table>" + (head ? "<thead><tr>" + head.map((c) => `<th>${inline(c)}</th>`).join("") + "</tr></thead>" : "") +
          "<tbody>" + body.map((r) => "<tr>" + cells(r).map((c) => `<td>${inline(c)}</td>`).join("") + "</tr>").join("") + "</tbody></table></div>";
        continue;
      }
      if (/^\s*([-*•]|\d+[.)])\s+/.test(l)) {
        const ordered = /^\s*\d/.test(l);
        const items = [];
        while (i < lines.length && /^\s*([-*•]|\d+[.)])\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*([-*•]|\d+[.)])\s+/, ""));
        out += `<${ordered ? "ol" : "ul"}>` + items.map((x) => `<li>${inline(x)}</li>`).join("") + `</${ordered ? "ol" : "ul"}>`;
        continue;
      }
      if (/^>\s?/.test(l)) {
        const q = [];
        while (i < lines.length && /^>\s?/.test(lines[i])) q.push(lines[i++].replace(/^>\s?/, ""));
        out += `<blockquote>${inline(q.join(" "))}</blockquote>`;
        continue;
      }
      const para = [];
      while (i < lines.length && lines[i].trim() && !/^\s*(\||#{1,4}\s|[-*•]\s|\d+[.)]\s|>)/.test(lines[i])) para.push(lines[i++]);
      if (!para.length) para.push(lines[i++]);
      out += `<p>${inline(para.join(" "))}</p>`;
    }
    return out;
  };

  // ------------------------------------------------------------------ course index
  const C = (window.COURSE = window.COURSE || { meta: {}, vocab: [], chunks: [], sounds: [], grammar: [], prompts: [], stories: [], about: [], units: [] });
  ["vocab", "chunks", "sounds", "grammar", "prompts", "stories", "readings", "chatTopics", "about", "units"].forEach((k) => { if (!Array.isArray(C[k])) C[k] = []; });
  const items = new Map();
  C.vocab.forEach((v) => items.set(v.id, Object.assign(v, { cat: "word" })));
  C.chunks.forEach((c) => items.set(c.id, Object.assign(c, { cat: "chunk" })));
  App.course = C;
  App.item = (id) => items.get(id);
  App.allItems = () => Array.from(items.values());
  App.sound = (id) => C.sounds.find((s) => s.id === id);
  App.grammar = (id) => C.grammar.find((g) => g.id === id);
  App.prompt = (id) => C.prompts.find((p) => p.id === id);
  App.story = (id) => C.stories.find((s) => s.id === id);
  App.lessons = () => C.units.flatMap((u) => u.lessons.map((l) => Object.assign(l, { unit: u })));
  App.lesson = (id) => App.lessons().find((l) => l.id === id);
  App.TRIP = new Date((C.meta && C.meta.trip ? C.meta.trip : "2026-10-30") + "T00:00:00");

  /** Display form of an item: nouns with their article ("la casa"). */
  App.withArticle = function (it) {
    if (!it || it.cat !== "word" || it.pos !== "noun" || !it.article) return it ? it.es : "";
    if (it.article === "el/la") return "el/la " + it.es;
    return it.article + " " + it.es;
  };
  App.gloss = (it) => (it ? it.en : "");
  /** Gender chip; the theme adds the m / f / m-f badge, the chip itself shows a word form (default "la casa"). */
  App.genderChip = function (it, text) {
    if (!it || it.pos !== "noun" || !it.gender) return null;
    return App.h("span.chip", { class: it.gender, title: { m: "masculine", f: "feminine", mf: "either gender (el/la)" }[it.gender], lang: "es" }, text || App.withArticle(it));
  };
  /** <p class="word-big"><span class="article">la</span>casa</p> */
  App.wordBig = function (it) {
    const p = App.h("p.word-big", { lang: "es" });
    if (it && it.cat === "word" && it.pos === "noun" && it.article) p.appendChild(App.h("span.article", it.article));
    p.appendChild(document.createTextNode(it ? it.es : ""));
    return p;
  };

  // ------------------------------------------------------------------ penguin (design agent's window.Penguin, or a plain fallback)
  const FALLBACK_LINES = {
    good: ["¡Muy bien!", "¡Eso!", "¡Perfecto!", "¡Excelente!", "¡Así se dice!", "¡Órale, qué bien!"],
    close: ["¡Casi! Look at the marked bits.", "So close — just a small slip.", "Good memory! Tiny fix below.", "¡Ya mero! Almost there."],
    unsure: ["No pasa nada — here it is. Have a look and it'll come back in a bit.", "Good call to ask! Here's the answer — we'll see it again soon.",
      "Not sure is fine. Take a peek, say it once, and on we go.", "¡Tranquilo! Here's the word — it'll stick next time."],
    miss: ["No pasa nada — have a look and try the next one.", "Tricky one! It'll come back around soon.", "That's how we learn. ¡Ánimo!"],
    streak: ["¡Racha! You're on a roll.", "Look at you go!", "¡Imparable!"],
    done: ["¡Listo! Lesson done.", "¡Terminamos! Great work.", "¡Bien hecho! On to the next one."],
    welcome: ["¡Hola! Ready for a little Spanish?", "¡Qué onda! Let's learn something useful today.", "¡Bienvenido! Mexico is waiting."],
  };
  function fallbackSvg(mood, size) {
    size = size || 120;
    const eye = mood === "sleepy" ? '<path d="M41 52q4 3 8 0M61 52q4 3 8 0" stroke="#1d2433" stroke-width="2.5" fill="none" stroke-linecap="round"/>' :
      '<circle cx="45" cy="52" r="3.6" fill="#1d2433"/><circle cx="65" cy="52" r="3.6" fill="#1d2433"/>';
    const mouth = mood === "oops" ? '<path d="M50 66q5 -4 10 0" stroke="#e08a1e" stroke-width="3" fill="none" stroke-linecap="round"/>' :
      '<path d="M48 62l7 6 7-6z" fill="#f2a33a"/>';
    return `<svg class="penguin-fallback" viewBox="0 0 110 120" width="${size}" height="${size}" role="img" aria-label="penguin (${mood})">
      <ellipse cx="55" cy="112" rx="30" ry="5" fill="rgba(0,0,0,.08)"/>
      <ellipse cx="55" cy="75" rx="32" ry="38" fill="#26314a"/>
      <ellipse cx="55" cy="82" rx="22" ry="28" fill="#fdfaf3"/>
      <ellipse cx="55" cy="54" rx="21" ry="17" fill="#fdfaf3"/>
      ${eye}${mouth}
      <ellipse cx="55" cy="33" rx="46" ry="9" fill="#e9b949" stroke="#b9862a" stroke-width="2"/>
      <path d="M38 33q2-20 17-21q15 1 17 21z" fill="#e9b949" stroke="#b9862a" stroke-width="2"/>
      <path d="M38 30h34" stroke="#d1495b" stroke-width="4"/>
      <ellipse cx="41" cy="109" rx="9" ry="4" fill="#f2a33a"/><ellipse cx="69" cy="109" rx="9" ry="4" fill="#f2a33a"/>
    </svg>`;
  }
  const FallbackPenguin = {
    name: "Penguin",
    moods: ["happy", "talking", "thinking", "cheer", "oops", "proud", "sleepy", "wave"],
    svg: fallbackSvg,
    coach(el, mood, html) {
      if (!el) return;
      el.innerHTML = `<div class="penguin-coach"><div class="penguin">${fallbackSvg(mood, 84)}</div><div class="speech-bubble">${html}</div></div>`;
    },
    lines: FALLBACK_LINES,
  };
  App.penguin = () => (window.Penguin && typeof window.Penguin.coach === "function" ? window.Penguin : FallbackPenguin);
  App.penguinName = () => App.penguin().name || "Penguin";
  App.line = function (kind) {
    const P = window.Penguin;
    if (P && typeof P.line === "function" && P.lines && Array.isArray(P.lines[kind]) && P.lines[kind].length) { try { const l = P.line(kind); if (l) return String(l).replace(/<[^>]+>/g, ""); } catch (e) { /* fall through */ } }
    const arr = (P && P.lines && Array.isArray(P.lines[kind]) && P.lines[kind].length) ? P.lines[kind] : FALLBACK_LINES[kind] || FALLBACK_LINES.good;
    return App.pick(arr);
  };
  /** Render the penguin coach into a fresh element and return it. */
  App.coach = function (mood, html, opts) {
    const box = App.h("div.coach-slot");
    try { App.penguin().coach(box, mood, html, opts); } catch (e) { FallbackPenguin.coach(box, mood, html); }
    return box;
  };
  App.penguinSvg = function (mood, size) {
    try { return App.penguin().svg(mood, size); } catch (e) { return fallbackSvg(mood, size); }
  };
})();
