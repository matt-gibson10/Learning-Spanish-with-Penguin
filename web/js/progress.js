/* Progress page (#/progress) and the monthly check-up (#/progress/checkup), plus Rating.homeCard() for Home.
 * Reads Store.state.rating (built by rating.js). Charts are inline SVG, no libraries. docs/RATING.md section 5. */
(function () {
  "use strict";
  const App = (window.App = window.App || {});
  App.pages = App.pages || {};
  const DAY = 86400000;
  const NS = "http://www.w3.org/2000/svg";
  const SK = ["vocab", "listening", "production", "grammar", "reading", "conversation"];
  const SK_LABEL = { vocab: "Vocabulary", listening: "Listening", production: "Speaking & writing", grammar: "Grammar", reading: "Reading", conversation: "Conversation" };
  const SK_SHORT = { vocab: "Vocab", listening: "Listen", production: "Speak/write", grammar: "Grammar", reading: "Reading", conversation: "Chat" };
  const SK_ICON = { vocab: "📖", listening: "👂", production: "✍️", grammar: "🧩", reading: "📚", conversation: "🗨️" };
  const LADDER_TOP = 2600;
  const CAP_REASON = "This course's vocabulary stops at about 3,000 words, its grammar at the past tenses and a first taste of the subjunctive (no future, conditional or perfect tenses), its readings at about 270 words, and its conversation partner is a patient penguin. Nothing here is hard enough to tell a 1400 from a 2000, so the number stops where the evidence stops.";

  const h = (...a) => App.h(...a);
  const R = () => window.Rating;
  const S = () => window.Store && window.Store.state;
  function svg(tag, attrs, ...kids) {
    const el = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === "text") el.textContent = v; else el.setAttribute(k, v);
    }
    kids.flat().forEach((k) => { if (k != null && k !== false) el.appendChild(typeof k === "string" ? document.createTextNode(k) : k); });
    return el;
  }
  const fmtN = (n) => Math.round(n).toLocaleString("en-US");
  const signed = (n) => (n > 0 ? "+" : n < 0 ? "−" : "±") + Math.abs(Math.round(n));
  function fmtDay(key, withYear) {
    if (!key) return "";
    const [y, m, d] = key.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("en-GB", withYear ? { day: "numeric", month: "short", year: "numeric" } : { day: "numeric", month: "short" });
  }
  const nWords = () => ((window.COURSE && window.COURSE.vocab) || []).length || 3022;
  const todayKey = () => R().dayKey(Date.now());

  /** Make sure the engine and the rating exist (works when the app-start hooks have not landed yet). */
  function ready() {
    const Rt = R(), st = S();
    if (!Rt || !st) return false;
    if (!Rt.ready) Rt.init(window.COURSE);
    if (!st.rating) { Rt.bootstrap(st, window.COURSE); try { window.Store.save(); } catch (e) { /* ignore */ } }
    return true;
  }
  function view() {
    const Rt = R(), rt = S().rating, now = Date.now();
    const disp = Rt.withIdle(rt, now);
    const prov = Rt.provisional(disp);
    const overall = Rt.overall(rt);
    const band = Rt.band(overall);
    const coreU = (disp.skills.vocab.u + disp.skills.listening.u + disp.skills.production.u) / 3;
    const rusty = ["vocab", "listening", "production"].some((s) => disp.skills[s].u > Rt.C.U_PROV && rt.skills[s].u <= Rt.C.U_PROV);
    const keys = Object.keys(rt.days).sort();
    const tk = todayKey();
    const before = (k) => { let e = null; for (const x of keys) { if (x < k) e = rt.days[x]; } return e; };
    const atOrBefore = (k) => { let e = null; for (const x of keys) { if (x <= k) e = rt.days[x]; } return e; };
    const prevDay = before(tk);
    const weekAgo = atOrBefore(Rt.addDays(tk, -7)) || (keys.length ? rt.days[keys[0]] : null);
    return { Rt, rt, disp, prov, overall, band, coreU, rusty, keys, tk,
      dToday: prevDay ? overall - prevDay.r : null, dWeek: weekAgo && weekAgo !== rt.days[tk] ? overall - weekAgo.r : null,
      limiter: rt.skills.listening.r <= rt.skills.production.r ? "listening" : "production" };
  }

  // ------------------------------------------------------------------ Home card
  function homeCard() {
    if (!ready()) return h("span");
    const v = view();
    const pv = v.prov.provisional;
    const nextLo = v.band.next && v.band.next <= v.Rt.C.CAP_OVERALL ? v.band.next : null;
    const frac = nextLo ? Math.max(0, Math.min(1, (v.overall - v.band.lo) / (nextLo - v.band.lo))) : 1;
    const card = h("section.card.pr-home", { "aria-label": "Your rating" },
      h("div.pr-home-top",
        h("div.pr-home-num", { class: pv ? "provisional" : "" }, String(v.overall), pv ? h("span.pr-q", { title: "provisional" }, "?") : null),
        h("div.pr-home-text",
          h("p.pr-home-band", h("strong", v.band.name), " ", h("span.tag", v.band.cefr)),
          h("p.pr-home-sub", pv ? `Provisional · about ${v.prov.answersLeft} more answers to settle` : `± ${v.Rt.errorBar(v.coreU)}` + (v.rusty ? " · rusty: the next answers count more" : "")),
          v.dToday != null ? h("p.pr-home-delta", { class: v.dToday > 0 ? "up" : v.dToday < 0 ? "down" : "" }, `${signed(v.dToday)} today`) :
            (v.rt.days[v.tk] && v.rt.days[v.tk].n ? h("p.pr-home-delta", "First day on the board") : null))),
      h("div.pr-home-next",
        h("div.pr-mini-bar", { role: "img", "aria-label": nextLo ? `${Math.round(frac * 100)}% of the way to ${nextLo}` : "at the course cap" },
          h("div.fill", { class: "bd-" + v.band.index, style: { width: (frac * 100).toFixed(1) + "%" } })),
        h("small.muted", nextLo ? `${nextLo - v.overall} to ${v.Rt.band(nextLo).name} (${nextLo})` : "Measured up to 1400")),
      h("a.btn.btn-secondary.btn-sm.pr-home-link", { href: "#/progress" }, "Progress & rating →"));
    const news = (v.rt.news || []).filter((id) => /^band-|-(turista|viajero|platicador|independiente)$/.test(id));
    if (news.length) card.appendChild(h("p.pr-home-news", "🏆 New band reached: ", h("a", { href: "#/progress" }, "see it")));
    return card;
  }

  // ------------------------------------------------------------------ Progress page
  App.pages.progress = function (main, params) {
    document.title = "Progress · Learning Spanish with Penguin";
    if (params && params[0] === "checkup") return checkupPage(main);
    const page = h("div.page.pr-page");
    main.appendChild(page);
    if (!ready()) { page.appendChild(h("p.muted", "The rating engine (js/rating.js) is not loaded.")); return; }
    if (R().suspended) R().suspended = false;
    const v = view();
    page.appendChild(h("h1.page-title", "Progress"));
    celebrate(page, v);
    page.appendChild(hero(v));
    page.appendChild(skillsSection(v));
    const hist = h("section.card.pr-section.pr-history");
    page.appendChild(hist);
    historySection(hist, v);
    page.appendChild(wordsSection(v));
    const act = h("section.card.pr-section.pr-activity");
    page.appendChild(act);
    activitySection(act, v);
    page.appendChild(forecastSection(v));
    page.appendChild(badgesSection(v));
    page.appendChild(checkupCard(v));
    page.appendChild(aboutSection(v));
    const onResize = App.debounce ? App.debounce(() => {
      if (!page.isConnected) { window.removeEventListener("resize", onResize); return; }
      historySection(hist, view()); activitySection(act, view());
    }, 150) : null;
    if (onResize) window.addEventListener("resize", onResize);
  };

  function celebrate(page, v) {
    const news = v.rt.news || [];
    if (!news.length) return;
    const info = news.map((id) => [id, v.Rt.badgeInfo(id)]).filter((x) => x[1]);
    const bands = info.filter(([id, b]) => b.band).sort((a, b) => (/^band-/.test(a[0]) ? 1 : 0) - (/^band-/.test(b[0]) ? 1 : 0));   // overall band last = shown
    const top = bands.length ? bands[bands.length - 1][1] : info.length ? info[info.length - 1][1] : null;
    if (top) {
      const msg = bands.length ? `<strong>¡Felicidades! ${App.esc(top.title)}.</strong><br>${App.esc(top.sub)} and held it for three active days. ` +
        `Badges are never taken away, so that one is yours.` :
        `<strong>¡Bien! New badge: ${App.esc(top.title)}.</strong><br>${App.esc(top.sub)}.`;
      page.appendChild(h("div.pr-cheer", App.coach(bands.length ? "cheer" : "proud", msg)));
    }
    v.rt.news = [];
    try { window.Store.save(); } catch (e) { /* ignore */ }
  }

  // ---------- 1. hero
  function hero(v) {
    const pv = v.prov.provisional;
    const sec = h("section.card.card-hero.pr-hero", { "aria-label": "Your rating" });
    const deltas = h("div.pr-deltas",
      deltaStat(v.dToday, "today"), deltaStat(v.dWeek, "this week"),
      h("div.pr-delta", h("span.num", v.rt.peak && v.rt.peak.day ? String(v.rt.peak.r) : "—"),
        h("span.label", v.rt.peak && v.rt.peak.day ? `peak, ${fmtDay(v.rt.peak.day)}` : "peak (once settled)")));
    const left = h("div.pr-hero-main",
      h("p.pr-eyebrow", "Penguin Rating"),
      h("div.pr-big", { class: pv ? "provisional" : "" }, h("span.pr-num", String(v.overall)), pv ? h("span.pr-q", { "aria-label": "provisional" }, "?") : null),
      h("p.pr-bandline", h("span.pr-bandchip", { class: "bd-" + v.band.index }, v.band.name), " ", h("span.tag", v.band.cefr),
        h("span.muted.pr-range", ` ${v.band.lo}–${Number.isFinite(v.band.hi) ? v.band.hi : "∞"}`)),
      h("p.pr-prov", pv ? h("span", h("strong", "Provisional"), ` · about ${v.prov.answersLeft} more answers to settle (lesson quick checks count a quarter each).`) :
        h("span", h("strong", `± ${v.Rt.errorBar(v.coreU)}`), v.rusty ? " · rusty after a break: the next few answers count more." : " · settled. Swings under 25 a day are noise.")),
      deltas,
      h("p.pr-what", bandWhat(v.band.id)));
    sec.append(left, ladder(v));
    return sec;
  }
  function deltaStat(d, label) {
    return h("div.pr-delta", { class: d > 0 ? "up" : d < 0 ? "down" : "" }, h("span.num", d == null ? "—" : signed(d)), h("span.label", label));
  }
  function bandWhat(id) {
    return {
      primeras: "Greet, thank, count, recognise a few dozen words and set phrases. Chess: just learned how the pieces move.",
      turista: "Order food, ask prices and directions, introduce yourself. Chess: knows the rules, still hangs pieces.",
      viajero: "Get through a trip with patient people; first past-tense sentences. Chess: stopped hanging the queen.",
      platicador: "Hold a real, slow conversation on familiar topics. Chess: a casual player with a couple of openings.",
      independiente: "Handle most travel situations unaided, explain opinions and plans. Chess: a steady club player.",
      fluido: "Talk with natives without strain, follow TV and news.", avanzado: "Really speaks.", maestro: "Understands practically everything.", nativo: "Talks about anything.",
    }[id] || "";
  }

  // the slim ladder: every band from 100 to 2600, you, the 1400 cap, and where adult natives sit
  function ladder(v) {
    const Rt = v.Rt, B = Rt.C.BANDS;
    const W = 300, rowH = 27, top = 14, H = top + rowH * B.length + 8;
    const yOf = (r) => {
      r = Math.max(100, Math.min(LADDER_TOP, r));
      let i = 0; for (let j = 0; j < B.length; j++) if (r >= B[j].lo) i = j;
      const lo = B[i].lo, hi = B[i + 1] ? B[i + 1].lo : LADDER_TOP;
      const frac = (r - lo) / (hi - lo);
      return top + rowH * (B.length - i) - frac * rowH;
    };
    const barX = 4, barW = 196;
    const g = svg("svg", { viewBox: `0 0 ${W} ${H}`, class: "pr-ladder-svg", role: "img",
      "aria-label": `Rating ladder from 100 to 2600. You are at ${v.overall}, ${v.band.name}. The course measures up to 1400. Adult native speakers sit around 2300 to 2600.` });
    B.forEach((b, i) => {
      const y0 = top + rowH * (B.length - 1 - i);
      const reached = v.overall >= b.lo;
      g.appendChild(svg("rect", { x: barX, y: y0 + 1, width: barW, height: rowH - 2, rx: 6, class: `bd-${i}${reached ? " reached" : ""}${i === v.band.index ? " current" : ""}` }));
      g.appendChild(svg("text", { x: barX + 8, y: y0 + rowH / 2 + 4, class: "pr-l-name" + (i === v.band.index ? " cur" : "") }, b.name));
      g.appendChild(svg("text", { x: barX + barW - 6, y: y0 + rowH / 2 + 4, class: "pr-l-lo", "text-anchor": "end" }, `${b.lo}${i === B.length - 1 ? "+" : ""} · ${b.cefr}`));
    });
    // adult natives bracket 2300-2600
    const ny0 = yOf(2600), ny1 = yOf(2300);
    g.appendChild(svg("path", { d: `M${barX + barW + 6} ${ny0 + 1}h6v${ny1 - ny0 - 2}h-6`, class: "pr-l-bracket" }));
    g.appendChild(svg("text", { x: barX + barW + 16, y: (ny0 + ny1) / 2 - 2, class: "pr-l-note" }, "adult"));
    g.appendChild(svg("text", { x: barX + barW + 16, y: (ny0 + ny1) / 2 + 10, class: "pr-l-note" }, "natives"));
    // cap 1400
    const cy = yOf(1400);
    g.appendChild(svg("line", { x1: barX, x2: barX + barW + 4, y1: cy, y2: cy, class: "pr-l-cap" }));
    g.appendChild(svg("text", { x: barX + barW + 10, y: cy + 4, class: "pr-l-capt" }, "cap 1400"));
    // you
    const yy = yOf(v.overall);
    g.appendChild(svg("line", { x1: barX, x2: barX + barW, y1: yy, y2: yy, class: "pr-l-you" }));
    g.appendChild(svg("circle", { cx: barX + barW, cy: yy, r: 4.5, class: "pr-l-youdot" }));
    const ly = Math.abs(yy - cy) < 14 ? yy + 14 : yy + 4;
    g.appendChild(svg("text", { x: barX + barW + 10, y: Math.min(H - 4, ly), class: "pr-l-yout" }, `you ${v.overall}`));
    const reason = h("p.pr-cap-reason", { hidden: true, id: "pr-cap-reason" }, h("strong", "Measured up to 1400. "), CAP_REASON);
    const btn = h("button.btn.btn-ghost.btn-sm.pr-cap-btn", { type: "button", "aria-expanded": "false", "aria-controls": "pr-cap-reason",
      onclick: () => { const open = reason.hidden; reason.hidden = !open; btn.setAttribute("aria-expanded", String(open)); } }, "Why does it stop at 1400? ⓘ");
    return h("div.pr-ladder", g, h("p.pr-ladder-note.muted", "Adult natives are the grandmasters: 2300–2600, on vocabulary alone."), btn, reason);
  }

  // ---------- 2. sub-ratings
  function skillsSection(v) {
    const Rt = v.Rt;
    const sec = h("section.pr-section.pr-skills", { "aria-labelledby": "pr-skills-h" },
      h("h2.section-title#pr-skills-h", "Six ratings"),
      h("p.muted.pr-sub", "Like chess time controls: each skill has its own number. The overall is their weighted mean, pulled toward the weaker of Listening and Speaking."));
    const grid = h("div.pr-skill-grid");
    const next = window.Store && window.Store.nextLesson ? window.Store.nextLesson() : null;
    const ACT = {
      vocab: [next ? `#/lesson/${next.id}` : "#/review", next ? "Learn new words" : "Review words"],
      listening: ["#/sounds", "Train your ear"],
      production: ["#/speak", "Answer a Speak prompt"],
      grammar: ["#/grammar", "Drill grammar"],
      reading: ["#/read", "Read a story"],
      conversation: ["#/chat", "Chat with Penguin"],
    };
    const weekKey = Rt.addDays(v.tk, -7);
    let ref = null; for (const k of v.keys) if (k <= weekKey) ref = v.rt.days[k];
    if (!ref && v.keys.length) ref = v.rt.days[v.keys[0]];
    SK.forEach((s, i) => {
      const sk = v.rt.skills[s], dsk = v.disp.skills[s];
      const rated = sk.n > 0 || s === "listening" || s === "production";
      const pv = dsk.u > Rt.C.U_PROV;
      const trend = ref && ref.s && rated ? Math.round(sk.r) - ref.s[i] : 0;
      const lim = s === v.limiter;
      const frac = (x) => ((Math.max(100, Math.min(1600, x)) - 100) / 1500 * 100).toFixed(1) + "%";
      const eb = Rt.errorBar(dsk.u);
      const tile = h("div.pr-skill", { class: (lim ? "limiter " : "") + (rated ? "" : "unrated") },
        h("div.pr-skill-head", h("span.pr-skill-ic", { "aria-hidden": "true" }, SK_ICON[s]), h("span.pr-skill-name", SK_LABEL[s]),
          rated ? h("span.pr-trend", { class: trend > 0 ? "up" : trend < 0 ? "down" : "", title: "change over 7 days" },
            trend > 0 ? `▲ ${trend}` : trend < 0 ? `▼ ${-trend}` : "▬") : null),
        h("div.pr-skill-num", rated && sk.n > 0 ? [String(Math.round(sk.r)), pv ? h("span.pr-q", "?") : null] : rated ? [String(Math.round(sk.r)), h("span.pr-q", "?")] : h("span.pr-unrated", "unrated")),
        h("div.pr-skill-bar", { role: "img", "aria-label": rated ? `${SK_LABEL[s]} ${Math.round(sk.r)} plus or minus ${eb} on a 100 to 1600 scale` : `${SK_LABEL[s]} unrated` },
          rated ? [h("div.pr-whisker", { style: { left: frac(sk.r - eb), width: `calc(${frac(sk.r + eb)} - ${frac(sk.r - eb)})` } }),
            h("div.pr-skill-fill", { class: "sk-" + s, style: { width: frac(sk.r) } })] : null),
        h("p.pr-skill-band", rated ? `${Rt.band(sk.r).name} · ± ${eb}` : "No scored answers yet"),
        lim ? h("p.pr-limiter", "Weakest link: this one is holding your overall back") : null,
        h("a.btn.btn-sm", { class: lim ? "btn-primary" : "btn-secondary", href: ACT[s][0] }, ACT[s][1] + " →"));
      grid.appendChild(tile);
    });
    sec.appendChild(grid);
    return sec;
  }

  // ---------- 3. history chart
  const histState = { range: 30, on: {} };
  function historySection(sec, v) {
    sec.innerHTML = "";
    const Rt = v.Rt;
    sec.appendChild(h("div.pr-sec-head", h("h2.section-title", "Rating history"),
      h("div.pr-seg", { role: "group", "aria-label": "range" }, [[30, "30 days"], [90, "90 days"], [0, "All"]].map(([n, l]) =>
        h("button.btn.btn-sm", { type: "button", class: histState.range === n ? "btn-primary" : "btn-ghost", "aria-pressed": String(histState.range === n),
          onclick: () => { histState.range = n; historySection(sec, view()); } }, l)))));
    const toggles = h("div.pr-toggles", { role: "group", "aria-label": "show sub-ratings" }, h("span.muted", "Add a line: "),
      SK.map((s) => h("button.chip.pr-tog", { type: "button", class: "sk-" + s + (histState.on[s] ? " on" : ""), "aria-pressed": String(!!histState.on[s]),
        onclick: () => { histState.on[s] = !histState.on[s]; historySection(sec, view()); } }, SK_SHORT[s])));
    sec.appendChild(toggles);
    const box = h("div.pr-chart");
    sec.appendChild(box);
    const keys = v.keys;
    if (!keys.length) { box.appendChild(h("p.muted", "Your history starts with your first answer.")); return; }
    const end = v.tk > keys[keys.length - 1] ? v.tk : keys[keys.length - 1];
    let start = histState.range ? Rt.addDays(end, -(histState.range - 1)) : keys[0];
    if (!histState.range && Rt.dayDiff(start, end) < 6) start = Rt.addDays(end, -6);
    const nDays = Rt.dayDiff(start, end) + 1;
    const pts = keys.filter((k) => k >= start && k <= end).map((k) => ({ k, x: Rt.dayDiff(start, k), e: v.rt.days[k] }));
    const width = Math.max(280, Math.min(860, box.clientWidth || sec.clientWidth - 40 || 600));
    const height = width < 420 ? 220 : 260;
    const padL = 34, padR = width < 420 ? 8 : 92, padT = 10, padB = 24;
    const vals = [];
    pts.forEach((p) => { vals.push(p.e.r); SK.forEach((s, i) => { if (histState.on[s] && p.e.s) vals.push(p.e.s[i]); }); });
    const maxV = Math.max(...vals, 100);
    const minV = Math.min(...vals, 1600);
    const yHi = Math.min(1600, Math.max(600, Math.ceil((maxV + 80) / 100) * 100));
    const yLo = Math.max(100, Math.min(300, Math.floor((minV - 80) / 100) * 100));
    const X = (x) => padL + (nDays <= 1 ? (width - padL - padR) / 2 : x / (nDays - 1) * (width - padL - padR));
    const Y = (r) => padT + (1 - (r - yLo) / (yHi - yLo)) * (height - padT - padB);
    const last = pts[pts.length - 1];
    const g = svg("svg", { viewBox: `0 0 ${width} ${height}`, width, height, class: "pr-chart-svg", role: "img",
      "aria-label": `Overall rating by day from ${fmtDay(start)} to ${fmtDay(end)}: ${pts.length} active days, latest ${last ? last.e.r : "none"}. A table follows.` });
    // band stripes + labels
    Rt.C.BANDS.forEach((b, i) => {
      const lo = Math.max(yLo, b.lo), hi = Math.min(yHi, Rt.C.BANDS[i + 1] ? Rt.C.BANDS[i + 1].lo : 2600);
      if (hi <= lo) return;
      g.appendChild(svg("rect", { x: padL, width: width - padL - padR, y: Y(hi), height: Y(lo) - Y(hi), class: `bd-${i} stripe` }));
      if (Y(lo) - Y(hi) >= 13) {
        g.appendChild(svg("text", { x: width < 420 ? width - padR - 4 : width - padR + 6, y: Y(hi) + 12, class: "pr-c-band", "text-anchor": width < 420 ? "end" : "start" }, b.name));
      }
      if (b.lo >= yLo && b.lo <= yHi) {
        g.appendChild(svg("line", { x1: padL, x2: width - padR, y1: Y(b.lo), y2: Y(b.lo), class: "pr-c-grid" }));
        g.appendChild(svg("text", { x: padL - 4, y: Y(b.lo) + 4, class: "pr-c-ax", "text-anchor": "end" }, String(b.lo)));
      }
    });
    if (yHi >= 1400) {
      g.appendChild(svg("line", { x1: padL, x2: width - padR, y1: Y(1400), y2: Y(1400), class: "pr-c-cap" },
        svg("title", { text: "Measured up to 1400. " + CAP_REASON })));
      g.appendChild(svg("text", { x: padL + 4, y: Y(1400) - 4, class: "pr-c-capt" }, "measured up to here"));
    }
    // x labels: start, middle, end
    [[0, start], [Math.floor((nDays - 1) / 2), Rt.addDays(start, Math.floor((nDays - 1) / 2))], [nDays - 1, end]].forEach(([x, k], j) => {
      if (j === 1 && nDays < 5) return;
      g.appendChild(svg("text", { x: X(x), y: height - 6, class: "pr-c-ax", "text-anchor": j === 0 ? "start" : j === 2 ? "end" : "middle" }, fmtDay(k)));
    });
    // sub-rating lines
    SK.forEach((s, i) => {
      if (!histState.on[s]) return;
      const d = pts.filter((p) => p.e.s).map((p, j) => `${j ? "L" : "M"}${X(p.x).toFixed(1)} ${Y(p.e.s[i]).toFixed(1)}`).join(" ");
      if (d) g.appendChild(svg("path", { d, class: "pr-c-sub sk-" + s }));
    });
    // overall: solid when settled, dashed while provisional
    for (let j = 1; j < pts.length; j++) {
      const a = pts[j - 1], b = pts[j];
      g.appendChild(svg("line", { x1: X(a.x), y1: Y(a.e.r), x2: X(b.x), y2: Y(b.e.r), class: "pr-c-line" + (a.e.pv || b.e.pv ? " prov" : "") }));
    }
    pts.forEach((p, j) => {
      if (pts.length > 40 && j !== pts.length - 1) return;
      g.appendChild(svg("circle", { cx: X(p.x), cy: Y(p.e.r), r: j === pts.length - 1 ? 4.5 : 2.6, class: "pr-c-dot" + (p.e.pv ? " prov" : "") },
        svg("title", { text: `${fmtDay(p.k)}: ${p.e.r}${p.e.pv ? " (provisional)" : ""}, ${p.e.n || 0} answers` })));
    });
    // check-up markers
    (v.rt.checkups || []).forEach((c) => {
      if (c.day < start || c.day > end) return;
      const e = v.rt.days[c.day]; const x = X(Rt.dayDiff(start, c.day)), y = Y(e ? e.r : yLo + 40);
      g.appendChild(svg("path", { d: `M${x} ${y - 9}l6 6 -6 6 -6 -6z`, class: "pr-c-check" }, svg("title", { text: `Check-up ${fmtDay(c.day)}${c.counted ? "" : " (practice)"}` })));
    });
    box.appendChild(g);
    box.appendChild(h("p.pr-legend.muted", h("span.pr-lk", h("span.pr-key.solid"), " settled"), h("span.pr-lk", h("span.pr-key.dash"), " provisional"), h("span.pr-lk", h("span.pr-key.diamond"), " check-up")));
    // text alternative
    const rows = pts.slice(-30).reverse();
    sec.appendChild(h("details.pr-table",
      h("summary", `Show as a table (${rows.length} day${rows.length === 1 ? "" : "s"})`),
      h("div.table-wrap", h("table",
        h("thead", h("tr", h("th", "Day"), h("th", "Overall"), SK.map((s) => h("th", SK_SHORT[s])), h("th", "Answers"))),
        h("tbody", rows.map((p) => h("tr", h("td", fmtDay(p.k)), h("td", `${p.e.r}${p.e.pv ? "?" : ""}`), SK.map((s, i) => h("td", p.e.s ? String(p.e.s[i]) : "")), h("td", String(p.e.n || 0)))))))));
  }

  // ---------- 4. words
  function wordsSection(v) {
    const Rt = v.Rt, st = S();
    const IX = Rt.index;
    const tiers = [1, 2, 3, 4, 5, 6].map(() => ({ known: 0, learning: 0, total: 0 }));
    let wKnown = 0, pKnown = 0, wTot = 0, pTot = 0;
    Object.values(IX.items).forEach((it) => {
      const t = tiers[Math.max(1, Math.min(6, it.tier || 1)) - 1];
      const c = st.cards[it.id];
      const isWord = IX.wordIds ? IX.wordIds.has(it.id) : it.cat !== "chunk";
      t.total++; if (isWord) wTot++; else pTot++;
      if (Rt.known(c)) { t.known++; if (isWord) wKnown++; else pKnown++; } else if (c || st.learned[it.id]) t.learning++;
    });
    const sec = h("section.card.pr-section.pr-words", { "aria-labelledby": "pr-words-h" },
      h("h2.section-title#pr-words-h", "Words"),
      h("p.pr-headline", h("strong", fmtN(wKnown)), ` of ${fmtN(wTot)} words · `, h("strong", fmtN(pKnown)), ` of ${fmtN(pTot)} phrases known`),
      h("p.muted.pr-sub", "Known = survived at least one scheduled review since its last miss. Learning = started but not yet proven."));
    const cu = (v.rt.checkups || []).slice(-1)[0];
    const snap = v.rt.days[v.tk] || {};
    if (cu && snap.vs != null) sec.appendChild(h("p.pr-vs", "Estimated vocabulary ≈ ", h("strong", fmtN(snap.vs)), ` (check-up ${fmtDay(cu.day)}, plus words known since)`));
    const list = h("div.pr-tiers");
    tiers.forEach((t, i) => {
      const k = t.total ? t.known / t.total * 100 : 0, l = t.total ? t.learning / t.total * 100 : 0;
      list.appendChild(h("div.pr-tier",
        h("span.pr-tier-name", `Tier ${i + 1}`),
        h("div.pr-stack", { role: "img", "aria-label": `Tier ${i + 1}: ${t.known} known, ${t.learning} learning, ${t.total - t.known - t.learning} not started` },
          h("div.k", { style: { width: k.toFixed(2) + "%" } }), h("div.l", { style: { width: l.toFixed(2) + "%" } })),
        h("span.pr-tier-n", `${t.known}/${t.total}`)));
    });
    sec.appendChild(list);
    sec.appendChild(h("p.pr-legend.muted", h("span.pr-lk", h("span.pr-sw.k"), " known"), h("span.pr-lk", h("span.pr-sw.l"), " learning"), h("span.pr-lk", h("span.pr-sw.n"), " not started"), h("span", "· tier 1 = the 500 most frequent words")));
    // small line of total known by day
    const keys = v.keys.slice(-90);
    const series = keys.map((k) => (v.rt.days[k].kn || []).reduce((a, b) => a + b, 0));
    if (series.length >= 2) {
      const W = 300, H = 56, mx = Math.max(...series, 1);
      const d = series.map((y, i) => `${i ? "L" : "M"}${(i / (series.length - 1) * (W - 8) + 4).toFixed(1)} ${(H - 6 - y / mx * (H - 16)).toFixed(1)}`).join(" ");
      sec.appendChild(h("div.pr-spark", svg("svg", { viewBox: `0 0 ${W} ${H}`, class: "pr-spark-svg", role: "img", "aria-label": `Items known by day: from ${series[0]} to ${series[series.length - 1]}` },
        svg("path", { d: d + ` L${W - 4} ${H - 6} L4 ${H - 6} Z`, class: "pr-spark-area" }), svg("path", { d, class: "pr-spark-line" })),
        h("small.muted", `Items known by day: ${series[0]} → ${series[series.length - 1]} (target: all ${fmtN(wTot)} words)`)));
    }
    return sec;
  }

  // ---------- 5. activity
  function activitySection(sec, v) {
    sec.innerHTML = "";
    const Rt = v.Rt, days = v.rt.days;
    sec.appendChild(h("h2.section-title", "Activity"));
    const streak = Rt.streakInfo(days, v.tk);
    let wN = 0, wOk = 0, wMs = 0, mN = 0, mOk = 0;
    v.keys.forEach((k) => {
      const e = days[k], dd = Rt.dayDiff(k, v.tk);
      if (dd >= 0 && dd < 7) { wN += e.n || 0; wOk += e.ok || 0; wMs += e.ms || 0; }
      if (dd >= 0 && dd < 30) { mN += e.n || 0; mOk += e.ok || 0; }
    });
    sec.appendChild(h("div.stat-row.pr-stats",
      stat(streak.current, "day streak", "good"), stat(streak.longest, "longest streak"),
      stat(fmtN(wN), "answers this week", "accent"), stat(wN ? Math.round(wOk / wN * 100) + "%" : "—", "right this week"),
      stat(Math.round(wMs / 60000), "minutes this week", "marigold"), stat(mN ? Math.round(mOk / mN * 100) + "%" : "—", "right, 30 days")));
    const box = h("div.pr-heat");
    sec.appendChild(box);
    const width = Math.max(260, box.clientWidth || 300);
    const cell = 13, gap = 3, labW = 22;
    const weeks = Math.max(8, Math.min(26, Math.floor((width - labW) / (cell + gap))));
    const t = new Date(); t.setHours(12, 0, 0, 0);
    const dow = (t.getDay() + 6) % 7;                      // Monday = 0
    const startKey = Rt.addDays(v.tk, -(dow + 7 * (weeks - 1)));
    const H = 7 * (cell + gap) + 16;
    const g = svg("svg", { viewBox: `0 0 ${labW + weeks * (cell + gap)} ${H}`, width: labW + weeks * (cell + gap), height: H, class: "pr-heat-svg", role: "img",
      "aria-label": `Answers per day over the last ${weeks} weeks. Current streak ${streak.current} days.` });
    ["M", "", "W", "", "F", "", "S"].forEach((l, i) => { if (l) g.appendChild(svg("text", { x: 0, y: 16 + i * (cell + gap) + 10, class: "pr-c-ax" }, l)); });
    let lastMonth = "";
    for (let w = 0; w < weeks; w++) {
      for (let d = 0; d < 7; d++) {
        const k = Rt.addDays(startKey, w * 7 + d);
        if (k > v.tk) continue;
        const n = days[k] ? days[k].n || 0 : 0;
        const lvl = n === 0 ? 0 : n <= 20 ? 1 : n <= 50 ? 2 : n <= 100 ? 3 : 4;
        g.appendChild(svg("rect", { x: labW + w * (cell + gap), y: 16 + d * (cell + gap), width: cell, height: cell, rx: 3, class: "hm-" + lvl + (k === v.tk ? " today" : "") },
          svg("title", { text: `${fmtDay(k)}: ${n} answer${n === 1 ? "" : "s"}` })));
        if (d === 0) {
          const mo = fmtDay(k).split(" ")[1];
          if (mo !== lastMonth && Number(k.slice(8)) <= 7) { g.appendChild(svg("text", { x: labW + w * (cell + gap), y: 10, class: "pr-c-ax" }, mo)); lastMonth = mo; }
        }
      }
    }
    box.appendChild(g);
    box.appendChild(h("p.pr-legend.muted", "Less ", [0, 1, 2, 3, 4].map((i) => h("span.pr-hm-key", { class: "hm-" + i })), " More · answers per day"));
  }
  function stat(num, label, cls) { return h("div.stat", { class: cls || "" }, h("span.num", String(num)), h("span.label", label)); }

  // ---------- 6. forecast
  function forecastSection(v) {
    const Rt = v.Rt;
    const sec = h("section.card.pr-section.pr-forecast", h("h2.section-title", "Forecast"));
    const nextLo = v.band.next;
    const f = nextLo && nextLo <= Rt.C.CAP_OVERALL && !v.prov.provisional ? Rt.forecast(v.rt.days, nextLo, v.tk) : null;
    if (f) {
      const nb = Rt.band(nextLo);
      sec.appendChild(h("p.pr-fc", f.beyond ? `At your pace over the last four weeks (${signed(f.perDay)} a day) ${nb.name} (${nextLo}) is more than a year away. Small steady days add up.` :
        [`At your pace over the last four weeks (+${f.perDay.toFixed(1)} a day) you reach `, h("strong", `${nextLo} · ${nb.name}`), ` around `, h("strong", fmtDay(f.date, true)),
          f.hi ? ` (between ${fmtDay(f.lo)} and ${fmtDay(f.hi)}).` : ` (from ${fmtDay(f.lo)}; the slow end is too uncertain to call).`]));
    } else {
      let why = "A forecast appears once your rating has settled and you have at least 7 settled days in the last four weeks with a real upward trend.";
      if (!nextLo || nextLo > Rt.C.CAP_OVERALL) why = "You are at the course's measuring cap: there is no next band this app can honestly measure.";
      sec.appendChild(h("p.muted", why));
    }
    sec.appendChild(h("p.pr-fsi.muted", "Only the next band is forecast: each band needs about twice the words of the one before. FSI budgets 600–750 class hours for Spanish to reach professional level (about 1800–2000 here)."));
    return sec;
  }

  // ---------- 7. badges
  function badgesSection(v) {
    const Rt = v.Rt, b = v.rt.badges || {};
    const sec = h("section.pr-section.pr-badges", { "aria-labelledby": "pr-badges-h" }, h("h2.section-title#pr-badges-h", "Badges"));
    const ids = Object.keys(b).sort((x, y) => (b[y] < b[x] ? -1 : b[y] > b[x] ? 1 : 0));
    const grid = h("div.pr-badge-grid");
    const hiBand = Rt.C.BANDS.slice().reverse().find((x) => b["band-" + x.id]);
    sec.appendChild(h("p.muted.pr-sub", `Current band: ${v.band.name} · highest band held: ${hiBand ? hiBand.name : "Primeras palabras"}. Band badges need a settled rating held for three active days, and are never taken away.`));
    ids.forEach((id) => { const i = Rt.badgeInfo(id); if (i) grid.appendChild(badge(i, fmtDay(b[id]), true)); });
    // next up
    const nb = Rt.C.BANDS.find((x, i) => i > 0 && !b["band-" + x.id]);
    const kw = Rt.knownWordCount(S());
    const nw = Rt.C.WORD_BADGES.find((n) => !b["words-" + n]);
    const ns = Rt.C.STREAK_BADGES.find((n) => !b["streak-" + n]);
    const next = [];
    if (nb && nb.lo <= Rt.C.CAP_OVERALL) next.push(badge({ icon: "♛", title: nb.name, sub: `Overall ${nb.lo}, settled, 3 active days` }, `${Math.max(0, nb.lo - v.overall)} to go`, false));
    if (nw) next.push(badge({ icon: "📖", title: `${fmtN(nw)} words`, sub: "known" }, `${fmtN(Math.max(0, nw - kw))} to go`, false));
    if (ns) next.push(badge({ icon: "🔥", title: `${ns}-day streak`, sub: "answer every day" }, `${Math.max(0, ns - Rt.streakInfo(v.rt.days, v.tk).current)} to go`, false));
    if (!b.giant) next.push(badge({ icon: "⚔️", title: "Matagigantes", sub: "Beat an item rated 300+ above you, a day after" }, "", false));
    if (!b.checkup1) next.push(badge({ icon: "🩺", title: "Chequeo", sub: "Take the 5-minute check-up" }, "", false));
    if (!ids.length) grid.appendChild(h("p.muted", "No badges yet: your first ones are close."));
    sec.appendChild(grid);
    if (next.length) { sec.appendChild(h("h3.pr-next-h", "Next up")); sec.appendChild(h("div.pr-badge-grid.next", next)); }
    return sec;
  }
  function badge(i, when, earned) {
    return h("div.pr-badge", { class: earned ? "earned" : "locked" }, h("span.pr-badge-ic", { "aria-hidden": "true" }, i.icon),
      h("span.pr-badge-t", h("strong", i.title), h("small", i.sub), when ? h("small.pr-badge-when", when) : null));
  }

  // ---------- 8. check-up card
  function checkupCard(v) {
    const Rt = v.Rt, list = v.rt.checkups || [];
    const last = list[list.length - 1];
    const sec = h("section.card.pr-section.pr-checkup-card", h("h2.section-title", "Monthly check-up"));
    if (last) {
      const age = Rt.dayDiff(last.day, v.tk);
      sec.appendChild(h("p", `Last check-up ${fmtDay(last.day, true)}${last.counted ? "" : " (practice)"}: about `, h("strong", fmtN(last.size[0])), ` of the course's ${fmtN(nWords())} words.`));
      if (age > 30) sec.appendChild(h("p.pr-nudge", `It's been ${age} days. A fresh check-up keeps the number honest.`));
      else if (!Rt.checkup.counts(v.rt, Date.now())) sec.appendChild(h("p.muted", "Taken again within 7 days it runs as practice and doesn't change your rating."));
    } else sec.appendChild(h("p", "Thirty quick items, about five minutes. It samples words across the whole course, including ones you haven't learned yet, to estimate your vocabulary directly and recalibrate the rating."));
    sec.appendChild(h("a.btn.btn-primary", { href: "#/progress/checkup" }, "Take the 5-minute check-up →"));
    return sec;
  }

  // ---------- 9. about + reset
  function aboutSection() {
    return h("section.card.pr-section.pr-about",
      h("h2.section-title", "What this number is and isn't"),
      h("p", h("strong", "Your rating is an estimate of how much Spanish you have shown this app you can use"), ", on a chess-style scale where 100 is a first lesson, 2000 is someone who really speaks, and an educated native speaker is around 2500. It goes up when you get things right that you were not expected to, especially a day or more after learning them, and down when you miss things you should have had."),
      h("p", "It is not a certificate. It sees typed and tapped answers, not your accent, your speed, or how you do with a fast-talking taquero. Its difficulty ratings come from word frequency and course order, not from testing thousands of learners. It is capped at 1400 because nothing in this course is hard enough to prove more. Swings of 20–30 points in a day are noise; the line over weeks is the signal. Take the 5-minute check-up once a month to keep it honest."),
      h("details.pr-reset", h("summary", "Details and reset"),
        h("p.muted", "Every scored answer is a game against an item rated on the same scale. Items are rated where they are mastered (90% expected), lesson quick checks count a quarter, answers a day later count in full, and repeating the same exercise on the same day counts nothing. Uncertainty shrinks with answers and grows again after a break."),
        h("button.btn.btn-ghost.btn-sm", { type: "button", onclick: () => {
          if (!window.confirm("Reset your rating? History, peak, badges and check-ups are deleted, and the rating is rebuilt from your saved lesson progress, as on first run. Your lessons and review cards are not touched.")) return;
          S().rating = null;
          R().bootstrap(S(), window.COURSE);
          window.Store.save();
          App.toast && App.toast("Rating rebuilt from your saved progress.");
          App.render ? App.render() : location.reload();
        } }, "Reset rating…")));
  }

  // ------------------------------------------------------------------ check-up (#/progress/checkup)
  const SEQ = (() => { const a = []; for (let i = 0; i < 7; i++) a.push("V", "V", "L", "P"); a.push("L", "P"); return a; })();   // 14 V, 8 L, 8 P
  const STRAND = { V: { label: "See it → meaning", type: "recognise-choice", skill: "vocab", k: 4 },
    L: { label: "Hear it → meaning", type: "listen-meaning", skill: "listening", k: 4 },
    P: { label: "English → type the Spanish", type: "produce-type", skill: "production", k: 0 } };

  function checkupPage(main) {
    const page = h("div.page.pr-page.pr-checkup");
    main.appendChild(page);
    if (!ready()) { page.appendChild(h("p.muted", "The rating engine (js/rating.js) is not loaded.")); return; }
    const Rt = R(), rt = S().rating;
    page.appendChild(h("p.crumbs", h("a", { href: "#/progress" }, "Progress"), " › Check-up"));
    page.appendChild(h("h1.page-title", "5-minute check-up"));
    const counted = Rt.checkup.counts(rt, Date.now());
    const lastCounted = (rt.checkups || []).filter((c) => c.counted).slice(-1)[0];
    const intro = h("section.card.card-hero.pr-cu-intro",
      App.coach("thinking", "<strong>Thirty quick items, about five minutes.</strong><br>Words from the whole course, easy and hard, so the app can measure your vocabulary directly."),
      h("ul.pr-cu-list",
        h("li", h("strong", "14 × see a word"), ", pick its meaning; ", h("strong", "8 × hear a word"), " (no text), pick its meaning; ", h("strong", "8 × see English"), ", type the Spanish."),
        h("li", h("strong", "Some words you haven't learned yet"), ", including in the typing items. That's the point of a placement test: it finds what you know from anywhere."),
        h("li", "Every item has ", h("strong", "Not sure 🤷"), ". Use it freely: it costs nothing beyond a wrong answer, and it's better than guessing."),
        h("li", "Right answers send the next item up a frequency band, misses send it down. Your review schedule is not touched.")),
      h("p.pr-cu-count", { class: counted ? "" : "practice" }, counted ? (lastCounted || !["vocab", "listening", "production"].some((k) => rt.skills[k].n < Rt.C.CHECKUP.PLACEMENT_N) ?
        "This one counts: it moves Vocabulary, Listening and Speaking & writing halfway toward what it measures." :
        "Your first check-up counts as a placement: skills with little evidence so far are set straight to what it measures.") :
        `Practice check-up: your last counted one was ${fmtDay(lastCounted.day)}, and they count at most once every 7 days. You'll still see your estimate.`),
      h("div.btn-row", h("button.btn.btn-primary.btn-big", { type: "button", onclick: () => run(page) }, "Start →"), h("a.btn.btn-secondary", { href: "#/progress" }, "Not now")));
    page.appendChild(intro);
    App.pageEnter = () => run(page);
    page.appendChild(historyOfCheckups(rt));
  }

  function historyOfCheckups(rt) {
    const list = (rt.checkups || []).slice().reverse();
    if (!list.length) return h("span");
    return h("section.card.pr-section", h("h2.section-title", "Past check-ups"),
      h("div.table-wrap", h("table.pr-cu-table",
        h("thead", h("tr", h("th", "Date"), h("th", "Words (see)"), h("th", "Hear"), h("th", "Type"), h("th", "Vocab"), h("th", "Counted"))),
        h("tbody", list.map((c) => h("tr", h("td", fmtDay(c.day, true)), h("td", `≈ ${fmtN(c.size[0])}`), h("td", `≈ ${fmtN(c.size[1])}`), h("td", `≈ ${fmtN(c.size[2])}`),
          h("td", `${c.before[0]} → ${c.after[0]}`), h("td", c.counted ? (c.placement && c.placement[0] ? "placement" : "yes") : "practice")))))));
  }

  function pickWord(band, used, avoid) {
    const IX = R().index, pool = IX.vocabByPos || [];
    const HI = R().C.CHECKUP.BAND_HI;
    for (let off = 0; off < 9; off++) {
      for (const b of off ? [band + off, band - off] : [band]) {
        if (b < 0 || b > 8) continue;
        const lo = b ? HI[b - 1] : 0, hi = Math.min(HI[b], pool.length);
        const cands = pool.slice(lo, hi).filter((it) => !used.has(it.id) && it.en && it.es);
        const fresh = cands.filter((it) => !avoid(it.id));
        const list = fresh.length ? fresh : cands;
        if (list.length) return { it: list[Math.floor(Math.random() * list.length)], band: b };
      }
    }
    return null;
  }

  function run(page) {
    const Rt = R(), st = S(), now = Date.now();
    const C = Rt.C.CHECKUP;
    page.innerHTML = "";
    page.appendChild(h("p.crumbs", h("a", { href: "#/progress" }, "Progress"), " › Check-up"));
    const bar = h("div.progress-bar", h("div.fill", { style: { width: "0%" } }));
    const info = h("p.ex-counter");
    const host = h("div.pr-cu-host");
    page.append(bar, info, host);
    Rt.suspended = true;                                      // check-up answers are scored here, not by the per-answer update
    // "Not sure" in App.exercise bumps the card's unsure counter; the check-up leaves cards alone
    const Sto = window.Store, origUnsure = Sto.noteUnsure;
    if (typeof origUnsure === "function") Sto.noteUnsure = function () {};
    const restore = () => { Rt.suspended = false; if (origUnsure) Sto.noteUnsure = origUnsure; };
    const stop = () => { if (!page.isConnected) { restore(); window.removeEventListener("hashchange", stop); } };
    window.addEventListener("hashchange", stop);
    const cur = { V: Rt.checkup.start(st.rating, "V"), L: Rt.checkup.start(st.rating, "L"), P: Rt.checkup.start(st.rating, "P") };
    const obs = { V: {}, L: {}, P: {} };
    const used = new Set(), missed = [];
    const at = st.rating.at || {};
    const avoid = (id) => { const c = st.cards[id]; return (c && c.last && now - c.last < C.AVOID_MS) || (at[id] && now - at[id] < C.AVOID_MS); };
    let i = 0;
    function next() {
      host.innerHTML = "";
      bar.firstChild.style.width = (i / SEQ.length * 100).toFixed(1) + "%";
      if (i >= SEQ.length) return finish();
      const strand = SEQ[i];
      const pk = pickWord(cur[strand], used, avoid);
      if (!pk) return finish();
      used.add(pk.it.id);
      const band = pk.band;
      info.textContent = `${i + 1} / ${SEQ.length} · ${STRAND[strand].label}`;
      let ex;
      try { ex = App.makeExercise(pk.it, STRAND[strand].type); } catch (e) { console.error(e); i++; return next(); }
      if (!ex) { i++; return next(); }
      ex.checkup = true; ex.noRating = true;
      if (strand === "P" && !(st.learned && st.learned[pk.it.id])) ex.help = h("p.muted.pr-cu-new", "Maybe not learned yet: Not sure 🤷 is fine.");
      const el = App.exercise(ex, {
        nextLabel: i + 1 >= SEQ.length ? "See my results →" : "Next →",
        onDone: (res) => {
          const o = res && res.outcome || "miss";
          const b = (obs[strand][band] = obs[strand][band] || { n: 0, c: 0, x: 0 });
          b.n++;
          if (o === "good") b.c++; else if (o === "close") b.c += 0.5; else if (o === "miss") b.x++;
          if (o !== "good") missed.push(pk.it.id);
          cur[strand] = Rt.checkup.next(cur[strand], o);
          i++;
          next();
        },
      });
      host.appendChild(el);
    }
    function finish() {
      bar.firstChild.style.width = "100%";
      info.textContent = "";
      const result = {};
      ["V", "L", "P"].forEach((s) => { result[s] = Rt.checkup.estimate(obs[s], Rt.checkup.prior(st, s), STRAND[s].k); });
      const before = Rt.overall(st.rating);
      const entry = Rt.checkup.apply(st, result, Date.now());
      restore();
      try { window.Store.save(); } catch (e) { /* ignore */ }
      results(page, entry, result, before, Array.from(new Set(missed)));
    }
    next();
  }

  function results(page, entry, result, before, missed) {
    const Rt = R(), st = S();
    page.innerHTML = "";
    page.appendChild(h("p.crumbs", h("a", { href: "#/progress" }, "Progress"), " › Check-up"));
    page.appendChild(h("h1.page-title", "Check-up results"));
    const V = result.V, lo = Math.max(0, V.size - V.se), hi = Math.min(nWords(), V.size + V.se);
    const after = Rt.overall(st.rating);
    page.appendChild(h("section.card.card-hero.pr-cu-res",
      App.coach("proud", `<strong>You know at least about ${fmtN(V.size)} of the course's ${fmtN(nWords())} words</strong> (likely ${fmtN(lo)}–${fmtN(hi)}).<br>` +
        `That's about the vocabulary of a ${App.esc(Rt.band(Math.round(Rt.vocabToRating(V.size))).name)} (${Math.round(Rt.vocabToRating(V.size))}). The course stops at rank 6,000, so it can only say "at least".`),
      h("div.table-wrap", h("table.pr-cu-table",
        h("thead", h("tr", h("th", "Strand"), h("th", "Estimate"), h("th", "Test rating"), h("th", "Your rating"))),
        h("tbody", [["V", "vocab", "See it → meaning"], ["L", "listening", "Hear it → meaning"], ["P", "production", "Type the Spanish"]].map(([s, sk, label], i) =>
          h("tr", h("td", h("strong", SK_LABEL[sk]), h("br"), h("small.muted", label)), h("td", `≈ ${fmtN(result[s].size)} ± ${fmtN(result[s].se)} words`), h("td", String(entry.t[i])),
            h("td", entry.counted ? h("span", `${entry.before[i]} → `, h("strong", String(entry.after[i])), entry.placement[i] ? h("small.muted", " (placement)") : null) : h("span.muted", `${entry.before[i]} (practice, not counted)`))))))),
      h("p.pr-cu-overall", entry.counted ? ["Overall: ", h("strong", `${before} → ${after}`), after !== before ? ` (${signed(after - before)})` : ""] : "Practice check-up: your rating is unchanged.")));
    const toAdd = missed.filter((id) => !(st.learned && st.learned[id]));
    if (missed.length) {
      const sec = h("section.card.pr-section", h("h2.section-title", "Words to look at"),
        h("p", missed.map((id) => App.item(id)).filter(Boolean).map((it, j) => h("span.chip.pr-miss-chip", { lang: "es" }, App.withArticle ? App.withArticle(it) : it.es, h("small", " " + (App.shortEn ? App.shortEn(it.en) : it.en))))));
      if (toAdd.length && window.Store && typeof window.Store.learn === "function") {
        const btn = h("button.btn.btn-secondary", { type: "button", onclick: () => {
          window.Store.learn(toAdd); btn.disabled = true; btn.textContent = `Added ${toAdd.length} to review ✓`;
          if (App.updateBadge) App.updateBadge();
        } }, `+ review: add ${toAdd.length} new word${toAdd.length === 1 ? "" : "s"}`);
        sec.appendChild(btn);
      }
      page.appendChild(sec);
    }
    page.appendChild(h("div.btn-row", h("a.btn.btn-primary.btn-big", { href: "#/progress" }, "Back to Progress →")));
    App.pageEnter = () => { location.hash = "#/progress"; };
    page.appendChild(historyOfCheckups(st.rating));
  }

  // ------------------------------------------------------------------ export
  function attach() { if (window.Rating) window.Rating.homeCard = homeCard; }
  attach();
  if (!window.Rating && typeof document !== "undefined") document.addEventListener("DOMContentLoaded", attach);
  App.progressHomeCard = homeCard;
})();
