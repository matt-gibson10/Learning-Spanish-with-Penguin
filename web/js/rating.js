/* Penguin Rating: a chess-style Spanish rating (docs/RATING.md, contract in section 6).
 * window.Rating = pure model functions + init / bootstrap / record, and a listener for the engine's
 * "penguin:answer" CustomEvent (one per answered exercise) that turns each answer into a rating update.
 * Plain JS, no dependencies. Safe to load before or after store.js / util.js: everything that touches
 * Store, App or the DOM is looked up lazily and guarded. */
(function () {
  "use strict";
  if (window.Rating && window.Rating.__loaded) return;      // loaded twice: keep the first listener only
  const DAY_MS = 86400000;

  // ------------------------------------------------------------------ constants (section 6.2 + implementation notes)
  const C = {
    START: 100, FLOOR: 100, CAP_SKILL: 1600, CAP_OVERALL: 1400,
    GATE_B1: 899, GATE_FREE_N: 20,
    PAR_ODDS: 9, SCALE: 400,
    BASE_P0: 120, BASE_C: 1965,
    VOCAB_C: 2115,
    TIER_RANK_CAP: [500, 1000, 1500, 2000, 2500, Infinity],
    LEN_PER_WORD: 30, LEN_MAX: 120,
    K_MIN: 8, K_MAX: 40, N_SETTLE: 40, IDLE_DAYS: 30, IDLE_FREE: 1, U_PROV: 0.25,
    CTX: { fresh: 0.25, session: 0.6, delayed: 1.0, repeat: 0.5 },
    FRESH_MS: 20 * 60 * 1000, SESSION_MS: 20 * 60 * 60 * 1000,
    SELF_W: 0.5, UNSURE_W: 0.75, MAX_PER_KEY_DAY: 5,
    FARM_MARGIN: 400,
    K_ITEM: 12, OFF_MAX: 100,
    S_SLIP: 0.9, S_CLOSE_MIN: 0.5, S_CLOSE_MAX: 0.7, S_FLASH_HARD: 0.6, S_PARTLY: 0.5,
    CHAT_S: { clean: 1.0, corrected: 0.7, mixed: 0.4, english: 0 }, CHAT_MIN_WORDS: 3,
    SKILLS: ["vocab", "listening", "production", "grammar", "reading", "conversation"],
    WEIGHTS: { vocab: 0.20, listening: 0.25, production: 0.25, grammar: 0.10, reading: 0.10, conversation: 0.10 },
    MEAN_SHARE: 0.75,
    EX: {                                        // exType -> [skill, offset, addLength, selfRated, lengthField?]
      "recognise-choice":       ["vocab", 0, false, false],
      "recognise-flash":        ["vocab", 25, false, true],
      "produce-choice":         ["vocab", 150, false, false],
      "listen-choice":          ["listening", 25, false, false],
      "listen-meaning":         ["listening", 50, false, false],
      "hear-flash":             ["listening", 75, false, true],
      "listen-natural-meaning": ["listening", 125, false, false],
      "listen-type":            ["listening", 200, true, false],
      "listen-natural":         ["listening", 300, true, false],
      "gender":                 ["grammar", 150, false, false],
      "tiles":                  ["production", 175, false, false],
      "cloze":                  ["production", 200, false, false],
      "produce-type":           ["production", 250, true, false],
      "build-type":             ["production", 250, true, false, "ex_es"],
      // added by the review (implementation notes in RATING.md)
      "produce-recall":         ["production", 250, true, false],
      "dictation":              ["listening", 200, true, false, "ex_es"],
      "cloze-choice":           ["vocab", 100, false, false],
      "conj-hear":              ["listening", 100, false, false],
      "conj-produce":           ["grammar", 225, false, false],
    },
    // personal phrases (no frequency rank): d = base + per * words, at most max
    FREE_EX: {
      "say-try":      { skill: "production", base: 450, per: 35, max: 950 },
      "mine-produce": { skill: "production", base: 450, per: 35, max: 950 },
      "mine-hear":    { skill: "listening",  base: 350, per: 25, max: Infinity },
    },
    ALIAS: { "read-mark": "read-sentence", "build": "tiles", "hear_pick": "sound-pick", "hear_type": "sound-type",
      "sound-hear_pick": "sound-pick", "sound-hear_type": "sound-type", "grammar-text": "grammar-fill" },
    RECALL_HINT_CAP: [1, 0.8, 0.6, 0.4],       // produce-recall: S capped by hints used (0, 1, 2, 3+)
    DICTATION_SLOW_CAP: 0.7,
    G_BASE: 150, G_STEP: 22,
    GRAMMAR_OFF: { "grammar-choice": 0, "grammar-fill": 100, "grammar-transform": 150, "grammar-translate": 200 },
    SOUND_PICK: 280, SOUND_TYPE: 480, SOUND_STEP: 15,
    PROMPT_OFF: 175, PROMPT_LEN: 5, PROMPT_LEN_FROM: 5, PROMPT_LEN_MAX: 75,
    STORY_BEAT_OFF: 225, STORY_ALL_OFF: 300,
    READ_BASE: 150, READ_TIER: 200, READ_LEN: 8, READ_LEN_FROM: 12, READ_LEN_MIN: -50, READ_LEN_MAX: 80,
    CHAT_D: [700, 925, 1150],
    BANDS: [
      { lo: 100,  id: "primeras",      name: "Primeras palabras", cefr: "pre-A1" },
      { lo: 300,  id: "turista",       name: "Turista",           cefr: "A1" },
      { lo: 600,  id: "viajero",       name: "Viajero",           cefr: "A2" },
      { lo: 900,  id: "platicador",    name: "Platicador",        cefr: "B1" },
      { lo: 1200, id: "independiente", name: "Independiente",     cefr: "B1+" },
      { lo: 1500, id: "fluido",        name: "Fluido",            cefr: "B2" },
      { lo: 1800, id: "avanzado",      name: "Avanzado",          cefr: "C1" },
      { lo: 2100, id: "maestro",       name: "Maestro",           cefr: "C2" },
      { lo: 2400, id: "nativo",        name: "Nativo",            cefr: "native" },
    ],
    CHECKUP: { V: 14, L: 8, P: 8, OFFSET: { V: 0, L: 50, P: 250 }, PRIOR_N: 2, PRIOR_KNOWN: 0.9, PRIOR_P_SHARE: 0.5,
      BAND_HI: [125, 250, 500, 750, 1000, 1500, 2000, 2500, Infinity], AVOID_MS: 72 * 3600 * 1000,
      LAMBDA: 0.5, PLACEMENT_N: 40, U_AFTER: 0.25, U_AFTER_PLACEMENT: 0.5, MIN_GAP_DAYS: 7 },
    FORECAST: { WINDOW_DAYS: 28, MIN_DAYS: 7, MIN_SLOPE: 0.2, MAX_DAYS: 365 },
    ERR_BASE: 40, ERR_U: 160,
    WORD_BADGES: [100, 250, 500, 1000, 2000, 3022],
    STREAK_BADGES: [7, 30, 100],
    GIANT_MARGIN: 300,
    JUST_SET_MS: 3000,      // a card.last within 3 s of the answer was just written by Store.rate for this answer
  };

  const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
  const round1 = (x) => Math.round(x * 10) / 10;
  const pad = (n) => String(n).padStart(2, "0");
  function dayKey(ts) {
    const d = new Date(ts);
    if (window.App && typeof window.App.dayKey === "function") return window.App.dayKey(d);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
  function dayStart(ts) { const d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime(); }
  function addDays(key, n) {               // "YYYY-MM-DD" + n calendar days (local)
    const [y, m, d] = key.split("-").map(Number);
    const dt = new Date(y, m - 1, d + n, 12);
    return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
  }
  function dayDiff(a, b) {                 // b - a in calendar days
    const [y1, m1, d1] = a.split("-").map(Number), [y2, m2, d2] = b.split("-").map(Number);
    return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / DAY_MS);
  }

  // ------------------------------------------------------------------ index (init)
  const IX = { ready: false, ranks: [], unitTier: {}, itemTier: {}, gOrder: {}, soundIdx: {}, course: null, items: {} };

  function init(course) {
    course = course || window.COURSE || {};
    IX.course = course;
    const vocab = Array.isArray(course.vocab) ? course.vocab : [];
    const chunks = Array.isArray(course.chunks) ? course.chunks : [];
    IX.ranks = vocab.map((v) => +v.rank || 0).sort((a, b) => a - b);
    IX.items = {}; IX.itemTier = {}; IX.wordIds = new Set(vocab.map((v) => v.id));
    vocab.concat(chunks).forEach((it) => { IX.items[it.id] = it; IX.itemTier[it.id] = it.tier || 1; });
    IX.unitTier = {};
    (course.units || []).forEach((u) => (u.lessons || []).forEach((l) => (l.steps || []).forEach((st) => {
      if (st.type === "learn") (st.items || []).forEach((id) => { if (!(id in IX.unitTier)) IX.unitTier[id] = u.tier || 1; });
    })));
    IX.gOrder = {};
    (course.grammar || []).forEach((g) => { IX.gOrder[g.id] = g.order || 0; });
    IX.soundIdx = {};
    (course.sounds || []).forEach((s, i) => { IX.soundIdx[s.id] = i; });
    IX.vocabByPos = vocab.slice().sort((a, b) => (a.rank - b.rank) || (a.id < b.id ? -1 : 1));
    IX.ready = true;
    return Rating;
  }
  function ensureInit() { if (!IX.ready) init(window.COURSE); }

  // ------------------------------------------------------------------ pure model
  function pos(rank) {
    ensureInit();
    const a = IX.ranks;
    let lo = 0, hi = a.length;                     // count of ranks <= rank
    while (lo < hi) { const mid = (lo + hi) >> 1; if (a[mid] <= rank) lo = mid + 1; else hi = mid; }
    return Math.max(1, lo);
  }
  const base = (p) => 1000 * Math.log10(p + C.BASE_P0) - C.BASE_C;
  const vocabToRating = (V) => 1000 * Math.log10(V + 120) - C.VOCAB_C;
  const ratingToVocab = (r) => Math.pow(10, (r + C.VOCAB_C) / 1000) - 120;
  function words(text) {
    return String(text || "").replace(/_{3,}/g, " ").split(/\s+/).filter((t) => /\p{L}/u.test(t)).length;
  }
  const G = (order) => C.G_BASE + C.G_STEP * (order || 0);
  const lenBonus = (n) => Math.min(C.LEN_MAX, C.LEN_PER_WORD * Math.max(0, n - 1));

  const DESC_KINDS = new Set(["grammar", "sound", "prompt", "story", "reading", "chat"]);   // chunks have their own .kind
  const isDesc = (item) => !!item && DESC_KINDS.has(item.kind);
  function isCourseItem(item) { return !!item && !isDesc(item) && (item.p != null || item.rank != null); }

  function itemDifficulty(item, exType) {
    item = item || {};
    exType = C.ALIAS[exType] || exType;
    const k = isDesc(item) ? item.kind : "";
    if (k === "grammar") return Math.round(G(item.order) + (C.GRAMMAR_OFF[exType] || 0));
    if (k === "sound") {
      const b = (exType === "sound-type" ? C.SOUND_TYPE : C.SOUND_PICK) + C.SOUND_STEP * (item.idx || 0);
      return Math.round(b + (exType === "sound-type" ? lenBonus(item.words || 0) : 0));
    }
    if (k === "prompt") return Math.round(G(item.order) + C.PROMPT_OFF + clamp(C.PROMPT_LEN * ((item.words || 0) - C.PROMPT_LEN_FROM), 0, C.PROMPT_LEN_MAX));
    if (k === "story") return Math.round(G(item.order) + (exType === "story-all" ? C.STORY_ALL_OFF : C.STORY_BEAT_OFF));
    if (k === "reading") return Math.round(C.READ_BASE + C.READ_TIER * (item.tier || 1) + clamp(C.READ_LEN * ((item.words || 0) - C.READ_LEN_FROM), C.READ_LEN_MIN, C.READ_LEN_MAX));
    if (k === "chat") return C.CHAT_D[clamp((item.level || 1) - 1, 0, 2)];
    const free = C.FREE_EX[exType];
    if (free || (!isCourseItem(item) && C.EX[exType])) {
      // personal phrase (no rank): its own formula; course exTypes on such items map by skill
      const f = free || (C.EX[exType][0] === "listening" ? C.FREE_EX["mine-hear"] : C.FREE_EX["say-try"]);
      return Math.round(Math.min(f.max, f.base + f.per * words(item.es || item.text)));
    }
    const ex = C.EX[exType];
    if (!ex) return NaN;
    let p = item.p;
    if (p == null) {
      ensureInit();
      const t = IX.unitTier[item.id];
      const cap = t ? C.TIER_RANK_CAP[clamp(t, 1, 6) - 1] : Infinity;
      p = pos(Math.min(+item.rank || 0, cap));
    }
    const field = ex[4] || "es";
    const len = ex[2] ? lenBonus(words(item[field] || item.es)) : 0;
    return Math.round(base(p) + ex[1] + len);
  }

  function skillOf(exType) {
    exType = C.ALIAS[exType] || exType;
    if (C.EX[exType]) return C.EX[exType][0];
    if (C.FREE_EX[exType]) return C.FREE_EX[exType].skill;
    if (/^grammar-/.test(exType)) return "grammar";
    if (/^sound-/.test(exType)) return "listening";
    if (exType === "prompt" || /^story-/.test(exType)) return "production";
    if (exType === "read-sentence") return "reading";
    if (exType === "chat-turn") return "conversation";
    return null;
  }
  const FREE_TYPES = new Set(["prompt", "story-beat", "story-all", "chat-turn"]);

  function expected(r, d, nChoices) {
    const s = C.PAR_ODDS / (C.PAR_ODDS + Math.pow(10, (d - r) / C.SCALE));
    const g = nChoices >= 2 ? 1 / nChoices : 0;
    return g + (1 - g) * s;
  }
  const kFactor = (u) => C.K_MIN + (C.K_MAX - C.K_MIN) * u;

  function score(ev) {
    const k = ev.nChoices || 0;
    let S = 0, mul = 1;
    switch (ev.outcome) {
      case "good": S = ev.slip ? C.S_SLIP : 1; break;
      case "close": S = clamp(Number.isFinite(+ev.score) && ev.score != null ? +ev.score : 0.6, C.S_CLOSE_MIN, C.S_CLOSE_MAX); break;
      case "unsure": S = k >= 2 ? 1 / k : 0; mul = C.UNSURE_W; break;
      case "score": S = clamp(+ev.score || 0, 0, 1); break;
      default: S = 0;                                     // miss
    }
    const ex = C.ALIAS[ev.exType] || ev.exType;
    if (ex === "produce-recall" && ev.hintsUsed > 0) S = Math.min(S, C.RECALL_HINT_CAP[Math.min(3, ev.hintsUsed)]);
    if (ex === "dictation" && ev.slowUsed) S = Math.min(S, C.DICTATION_SLOW_CAP);
    if (ev.capS != null) S = Math.min(S, ev.capS);
    return { S, mul };
  }

  function ctxFor(state, itemId, ts) {
    const c = state && state.cards && state.cards[itemId];
    const last = c ? c.last : 0;
    if (!last) return "delayed";
    if (ts - last < C.FRESH_MS) return "fresh";
    if (ts - last < C.SESSION_MS) return "session";
    return "delayed";
  }

  function freshRating() {
    const skills = {};
    C.SKILLS.forEach((s) => { skills[s] = { r: C.START, u: 1, n: 0, last: 0 }; });
    return { v: 1, skills, freeN: 0, off: {}, today: { day: "", seen: {}, n: 0, ok: 0, ms: 0, lastTs: 0 }, days: {},
      peak: { r: C.START, day: "" }, badges: {}, checkups: [], boot: 0, at: {}, first: {}, news: [] };
  }
  function ensureShape(rt) {
    const f = freshRating();
    for (const k of Object.keys(f)) if (rt[k] == null) rt[k] = f[k];
    C.SKILLS.forEach((s) => { if (!rt.skills[s]) rt.skills[s] = f.skills[s]; });
    if (!rt.today.seen) rt.today.seen = {};
    return rt;
  }

  function overall(rt) {
    if (!rt || !rt.skills) return C.START;
    let sw = 0, sum = 0;
    C.SKILLS.forEach((s) => {
      const sk = rt.skills[s] || { r: C.START, n: 0 };
      if (sk.n > 0 || s === "listening" || s === "production") { sw += C.WEIGHTS[s]; sum += C.WEIGHTS[s] * sk.r; }
    });
    const M = sw ? sum / sw : C.START;
    const L = rt.skills.listening ? rt.skills.listening.r : C.START, P = rt.skills.production ? rt.skills.production.r : C.START;
    let o = C.MEAN_SHARE * M + (1 - C.MEAN_SHARE) * Math.min(L, P);
    if ((rt.freeN || 0) < C.GATE_FREE_N) o = Math.min(o, C.GATE_B1);
    return clamp(Math.round(o), C.FLOOR, C.CAP_OVERALL);
  }

  function provisional(rt) {
    const skills = {};
    C.SKILLS.forEach((s) => { skills[s] = !rt || !rt.skills[s] || rt.skills[s].u > C.U_PROV; });
    const core = ["vocab", "listening", "production"];
    const answersLeft = core.reduce((a, s) => a + Math.ceil(Math.max(0, ((rt && rt.skills[s]) ? rt.skills[s].u : 1) - C.U_PROV) * C.N_SETTLE - 1e-9), 0);
    return { provisional: core.some((s) => skills[s]), answersLeft, skills };
  }
  const errorBar = (u) => Math.round(C.ERR_BASE + C.ERR_U * u);
  function band(r) {
    let i = 0;
    for (let j = 0; j < C.BANDS.length; j++) if (r >= C.BANDS[j].lo) i = j;
    const b = C.BANDS[i], nx = C.BANDS[i + 1];
    return { index: i, id: b.id, name: b.name, cefr: b.cefr, lo: b.lo, hi: nx ? nx.lo - 1 : Infinity, next: nx ? nx.lo : null };
  }
  const known = (card) => !!card && card.reps >= 1 && card.ivl >= 1;

  /** Same rating with each skill's u raised by the idle rule as of `now` (for display: "rusty"). */
  function withIdle(rt, now) {
    const out = JSON.parse(JSON.stringify(rt));
    C.SKILLS.forEach((s) => {
      const sk = out.skills[s];
      if (sk && sk.last) { const idle = Math.floor((now - sk.last) / DAY_MS); if (idle >= 2) sk.u = Math.min(1, sk.u + (idle - C.IDLE_FREE) / C.IDLE_DAYS); }
    });
    return out;
  }

  function knownWordCount(state) {
    ensureInit();
    let n = 0;
    const cards = (state && state.cards) || {};
    for (const id in cards) if (IX.wordIds.has(id) && known(cards[id])) n++;
    return n;
  }

  function snapshot(state, day) {
    const rt = state.rating;
    const pv = provisional(rt).provisional ? 1 : 0;
    const stored = (rt.days && rt.days[day]) || {};
    const isToday = rt.today && rt.today.day === day;
    const kn = [0, 0, 0, 0, 0, 0];
    let mat = 0;
    ensureInit();
    const cards = state.cards || {};
    for (const id in cards) {
      if (!IX.items[id]) continue;
      const c = cards[id];
      if (!known(c)) continue;
      kn[clamp((IX.itemTier[id] || 1), 1, 6) - 1]++;
      if (c.ivl >= 21) mat++;
    }
    let vs = null;
    const cu = (rt.checkups || []).slice(-1)[0];
    if (cu && cu.size) vs = Math.round(cu.size[0] + Math.max(0, knownWordCount(state) - (cu.kn0 || 0)));
    return {
      r: overall(rt), s: C.SKILLS.map((s) => Math.round(rt.skills[s].r)), pv,
      n: isToday ? rt.today.n : (stored.n || 0), ok: isToday ? rt.today.ok : (stored.ok || 0), ms: isToday ? rt.today.ms : (stored.ms || 0),
      kn, mat, vs,
    };
  }

  function forecast(days, target, today) {
    const F = C.FORECAST;
    const keys = Object.keys(days || {}).sort();
    if (!keys.length) return null;
    today = today || keys[keys.length - 1];
    const pts = [];
    keys.forEach((k) => {
      const dd = dayDiff(k, today);
      if (dd < 0 || dd >= F.WINDOW_DAYS) return;
      const e = days[k];
      if (!e || e.pv) return;
      pts.push([-dd, e.r]);
    });
    if (pts.length < F.MIN_DAYS) return null;
    const n = pts.length, mx = pts.reduce((a, p) => a + p[0], 0) / n, my = pts.reduce((a, p) => a + p[1], 0) / n;
    let sxx = 0, sxy = 0;
    pts.forEach(([x, y]) => { sxx += (x - mx) * (x - mx); sxy += (x - mx) * (y - my); });
    if (!sxx) return null;
    const slope = sxy / sxx, icpt = my - slope * mx;
    let sse = 0;
    pts.forEach(([x, y]) => { const e = y - (icpt + slope * x); sse += e * e; });
    const se = n > 2 ? Math.sqrt(sse / (n - 2) / sxx) : 0;
    if (slope < F.MIN_SLOPE) return null;
    const lastX = pts.reduce((a, p) => Math.max(a, p[0]), -Infinity);
    const from = icpt + slope * lastX;                    // fitted value on the latest included day
    const need = (s) => Math.max(1, Math.round((target - from) / s - (0 - lastX)));
    const dN = need(slope);
    const lo = need(slope + se), hi = slope - se >= F.MIN_SLOPE ? need(slope - se) : Infinity;
    return { days: dN, date: addDays(today, dN), lo: addDays(today, lo), hi: Number.isFinite(hi) ? addDays(today, hi) : null,
      perDay: Math.round(slope * 100) / 100, beyond: dN > F.MAX_DAYS, se };
  }

  // ------------------------------------------------------------------ update
  function update(state, ev) {
    if (!state.rating) state.rating = freshRating();
    const rt = ensureShape(state.rating);
    const exType = C.ALIAS[ev.exType] || ev.exType;
    const skill = skillOf(exType);
    if (!skill) return null;
    const sk = rt.skills[skill];
    const item = ev.item || {};
    const d = ev.d != null ? ev.d : itemDifficulty(item, exType);
    if (!Number.isFinite(d)) return null;
    const hasOff = isCourseItem(item) && item.id;
    let off = hasOff ? (rt.off[item.id] || 0) : 0;
    const dEff = d + off;
    const e2 = Object.assign({}, ev, { exType });
    const { S, mul } = score(e2);
    let selfRated = ev.selfRated != null ? !!ev.selfRated : !!(C.EX[exType] && C.EX[exType][3]);
    if (exType === "read-sentence") selfRated = true;
    const ctx = ev.ctx || "delayed";
    const selfMul = selfRated ? C.SELF_W : 1;
    let w = (ev.w != null ? ev.w : C.CTX[ctx]) * selfMul * mul;
    const ts = ev.ts || 0;
    const day = dayKey(ts);
    const key = ev.key !== undefined ? ev.key : (item.id || null);
    const overallBefore = overall(rt);

    // 2. day guard
    if (!ev.boot) {
      if (rt.today.day !== day) {
        rt.today = { day, seen: {}, n: 0, ok: 0, ms: 0, lastTs: 0 };
        pruneAt(rt, ts);
      }
      const seen = key ? (rt.today.seen[key] || []) : [];
      if (ev.retry || seen.includes(exType) || seen.length >= C.MAX_PER_KEY_DAY) w = 0;
      else if (seen.length) w = C.CTX.fresh * selfMul * mul;
      if (key && !seen.includes(exType)) rt.today.seen[key] = seen.concat([exType]);
      rt.today.n += 1;
      if (ev.outcome === "good") rt.today.ok += 1;
      if (rt.today.lastTs) rt.today.ms += Math.max(0, Math.min(ts - rt.today.lastTs, 120000));
      rt.today.lastTs = ts;
      // 3. idle
      if (sk.last) { const idle = Math.floor((ts - sk.last) / DAY_MS); if (idle >= 2) sk.u = Math.min(1, sk.u + (idle - C.IDLE_FREE) / C.IDLE_DAYS); }
    }
    // 4-6
    const nC = ev.nChoices || 0;
    const E = expected(sk.r, dEff, nC);
    const K = kFactor(sk.u);
    const before = sk.r;
    const counted = w > 0 && !(sk.r - dEff >= C.FARM_MARGIN && S >= E);
    let delta = 0;
    if (counted) {
      delta = K * w * (S - E);
      sk.r = round1(clamp(sk.r + delta, C.FLOOR, C.CAP_SKILL));
      sk.u = Math.max(0, sk.u - w / C.N_SETTLE);
      sk.n = Math.round((sk.n + w) * 10000) / 10000;
      if (hasOff) {
        off = round1(clamp(off - C.K_ITEM * w * (S - E), -C.OFF_MAX, C.OFF_MAX));
        if (off) rt.off[item.id] = off; else delete rt.off[item.id];
      }
      if (FREE_TYPES.has(exType)) rt.freeN += 1;
    }
    // 7
    sk.last = Math.max(sk.last || 0, ts);
    const overallAfter = overall(rt);
    const res = { skill, d, dEff, E, S, w, K, delta, before, after: sk.r, counted, overallBefore, overallAfter, ctx, day, newBadges: [] };
    // 8. snapshot + peak + badges
    if (!ev.boot) {
      rt.days[day] = snapshot(state, day);
      const snap = rt.days[day];
      if (!snap.pv && snap.r > rt.peak.r) rt.peak = { r: snap.r, day };
      if (counted && S >= 1 && ctx === "delayed" && dEff - before >= C.GIANT_MARGIN) award(rt, "giant", day, res.newBadges);
      if (counted && exType === "chat-turn") award(rt, "chat1", day, res.newBadges);
      if (counted && exType === "story-all") award(rt, "story1", day, res.newBadges);
      evalBadges(state, day, res.newBadges);
    }
    return res;
  }

  function pruneAt(rt, ts) {
    if (!rt.at) return;
    for (const k in rt.at) if (ts - rt.at[k] > C.SESSION_MS + DAY_MS) delete rt.at[k];
  }

  // ------------------------------------------------------------------ badges
  function award(rt, id, day, out) {
    if (rt.badges[id]) return false;
    rt.badges[id] = day;
    if (!rt.news) rt.news = [];
    rt.news.push(id);
    if (out) out.push(id);
    return true;
  }
  function badgeInfo(id) {
    let m;
    if ((m = id.match(/^band-(\w+)$/))) { const b = C.BANDS.find((x) => x.id === m[1]); return b ? { icon: "♛", title: b.name, sub: `Overall reached ${b.lo}`, band: b } : null; }
    if ((m = id.match(/^(vocab|listening|production|grammar|reading|conversation)-(\w+)$/))) {
      const b = C.BANDS.find((x) => x.id === m[2]); return b ? { icon: "♞", title: `${SKILL_LABEL[m[1]]}: ${b.name}`, sub: `${SKILL_LABEL[m[1]]} reached ${b.lo}`, band: b } : null;
    }
    if ((m = id.match(/^words-(\d+)$/))) return { icon: "📖", title: `${Number(m[1]).toLocaleString("en-US")} words`, sub: "known (survived a review)" };
    if ((m = id.match(/^streak-(\d+)$/))) return { icon: "🔥", title: `${m[1]}-day streak`, sub: "answered every day" };
    return { giant: { icon: "⚔️", title: "Matagigantes", sub: "Beat an item rated 300+ above you, a day later" },
      chat1: { icon: "🗨️", title: "Primera charla", sub: "First scored chat turn" },
      story1: { icon: "✍️", title: "Cuentacuentos", sub: "First story written" },
      read1: { icon: "📚", title: "Lector", sub: "First reading finished" },
      peak: { icon: "⛰️", title: "Nuevo récord", sub: "First settled peak rating" },
      checkup1: { icon: "🩺", title: "Chequeo", sub: "First check-up" } }[id] || null;
  }
  const SKILL_LABEL = { vocab: "Vocabulary", listening: "Listening", production: "Speaking & writing", grammar: "Grammar", reading: "Reading", conversation: "Conversation" };

  function evalBadges(state, day, out) {
    const rt = state.rating;
    const keys = Object.keys(rt.days).sort().filter((k) => k <= day);
    const last3 = keys.slice(-3).map((k) => rt.days[k]);
    if (last3.length === 3 && last3.every((e) => !e.pv)) {
      const minR = Math.min(...last3.map((e) => e.r));
      C.BANDS.forEach((b, i) => { if (i > 0 && minR >= b.lo) award(rt, "band-" + b.id, day, out); });
      const prov = provisional(rt).skills;
      C.SKILLS.forEach((s, si) => {
        if (prov[s]) return;
        const m = Math.min(...last3.map((e) => (e.s ? e.s[si] : 0)));
        C.BANDS.forEach((b, i) => { if (i > 0 && m >= b.lo) award(rt, `${s}-${b.id}`, day, out); });
      });
    }
    const kw = knownWordCount(state);
    C.WORD_BADGES.forEach((n) => { if (kw >= Math.min(n, IX.wordIds ? IX.wordIds.size || n : n)) award(rt, "words-" + n, day, out); });   // "all the course's words" when it has fewer than 3,022
    const st = streakInfo(rt.days, day);
    C.STREAK_BADGES.forEach((n) => { if (st.current >= n) award(rt, "streak-" + n, day, out); });
    if (rt.peak && rt.peak.day) award(rt, "peak", rt.peak.day, out);
    if (Object.values(state.readings || {}).some((r) => r && r.done)) award(rt, "read1", day, out);
    if (Object.values(state.stories || {}).some((r) => r && r.done)) award(rt, "story1", day, out);
  }

  function streakInfo(days, today) {
    const keys = Object.keys(days || {}).filter((k) => (days[k].n || 0) > 0).sort();
    let longest = 0, run = 0, prev = null;
    keys.forEach((k) => { run = prev && dayDiff(prev, k) === 1 ? run + 1 : 1; longest = Math.max(longest, run); prev = k; });
    let current = 0;
    if (keys.length) {
      const lastK = keys[keys.length - 1];
      const gap = today ? dayDiff(lastK, today) : 0;
      if (gap <= 1) { current = 1; for (let i = keys.length - 1; i > 0 && dayDiff(keys[i - 1], keys[i]) === 1; i--) current++; }
    }
    return { current, longest };
  }

  // ------------------------------------------------------------------ bootstrap (section 4.1)
  function bootstrap(state, course) {
    if (!state || state.rating) return state ? state.rating : null;
    if (course && course !== IX.course) init(course); else ensureInit();
    const rt = (state.rating = freshRating());
    const now = Date.now();
    const ev = (o) => update(state, Object.assign({ boot: true }, o));
    const learned = state.learned || {}, cards = state.cards || {}, recog = state.recog || {};
    const ids = Object.keys(learned).filter((id) => IX.items[id])
      .sort((a, b) => (learned[a] - learned[b]) || (a < b ? -1 : a > b ? 1 : 0));
    ids.forEach((id) => {
      const it = IX.items[id], ts = learned[id] || now, c = cards[id] || {};
      for (let i = 0; i < Math.min(4, recog[id] || 0); i++)
        ev({ ts, exType: i % 2 ? "listen-meaning" : "recognise-choice", item: it, outcome: "good", nChoices: 4, ctx: "fresh" });
      const cyc = ["hear-flash", "listen-meaning", "recognise-flash"];
      for (let i = 0; i < Math.min(6, c.ok || 0); i++) {
        const x = cyc[i % 3];
        ev({ ts, exType: x, item: it, outcome: "good", nChoices: x === "listen-meaning" ? 4 : 0, ctx: "delayed" });
      }
      for (let i = 0; i < Math.min(3, c.lapses || 0); i++) ev({ ts, exType: "hear-flash", item: it, outcome: "miss", nChoices: 0, ctx: "delayed" });
      for (let i = 0; i < Math.min(3, c.unsure || 0); i++) ev({ ts, exType: "recognise-choice", item: it, outcome: "unsure", nChoices: 4, ctx: "session" });
    });
    const gr = state.grammar || {};
    (IX.course.grammar || []).slice().sort((a, b) => (a.order || 0) - (b.order || 0)).forEach((g) => {
      const e = gr[g.id];
      if (!e || e.best == null || !Number.isFinite(+e.best)) return;
      ev({ ts: e.done || now, exType: "grammar-fill", item: { kind: "grammar", order: g.order || 0 }, outcome: "score", score: +e.best, w: 4, key: g.id });
      rt.first["g:" + g.id] = e.done ? dayKey(e.done) : undefined;
    });
    const pr = state.prompts || {};
    (IX.course.prompts || []).forEach((p) => {
      const e = pr[p.id];
      if (!e || !e.outcome) return;
      const outcome = ["good", "close", "miss", "unsure"].includes(e.outcome) ? e.outcome : "good";
      ev({ ts: e.at || now, exType: "prompt", item: promptDesc(p), outcome, score: e.best, key: p.id });
      if (e.at) rt.first["p:" + p.id] = dayKey(e.at);
    });
    const rd = state.readings || {};
    (IX.course.readings || []).forEach((r) => {
      const e = rd[r.id];
      if (!e || !e.marks) return;
      (r.sentences || []).forEach((s, i) => {
        const m = e.marks[i];
        if (!m) return;
        const outcome = { got: "good", partly: "close", missed: "miss", unsure: "unsure" }[m];
        if (!outcome) return;
        ev({ ts: e.at || now, exType: "read-sentence", item: { kind: "reading", tier: r.tier || 1, words: words(s.es) }, outcome, score: C.S_PARTLY, key: `${r.id}#${i}` });
      });
    });
    C.SKILLS.forEach((s) => { rt.skills[s].u = Math.max(0.5, rt.skills[s].u); rt.skills[s].last = 0; });
    rt.boot = now;
    const day = dayKey(now);
    rt.days[day] = snapshot(state, day);
    evalBadges(state, day, []);
    rt.news = [];                                       // nothing to celebrate from a replay
    return rt;
  }

  // ------------------------------------------------------------------ descriptors from the course
  function promptDesc(p) { return { kind: "prompt", order: p ? (IX.gOrder[p.after_grammar] || 0) : 0, words: p ? words((p.models || [])[0]) : 0, id: p && p.id }; }
  function findIn(list, id) { return (list || []).find((x) => x.id === id); }

  // ------------------------------------------------------------------ check-up (section 5.3)
  const checkup = {
    bandOf(p) { const B = C.CHECKUP.BAND_HI; for (let i = 0; i < B.length; i++) if (p <= B[i]) return i; return B.length - 1; },
    start(rt, strand) {
      const skill = { V: "vocab", L: "listening", P: "production" }[strand];
      const r = rt && rt.skills && rt.skills[skill] ? rt.skills[skill].r : C.START;
      const nv = (IX.vocabByPos && IX.vocabByPos.length) || 3022;
      return checkup.bandOf(clamp(Math.round(ratingToVocab(r - C.CHECKUP.OFFSET[strand])), 1, nv));
    },
    next(b, outcome) { return clamp(b + (outcome === "good" ? 1 : outcome === "close" ? 0 : -1), 0, 8); },
    bandWidths() {
      const nv = (IX.vocabByPos && IX.vocabByPos.length) || 3022;
      const B = C.CHECKUP.BAND_HI;
      return B.map((hi, i) => Math.max(0, Math.min(hi, nv) - (i ? B[i - 1] : 0)));
    },
    estimate(obs, prior, k) {
      const W = checkup.bandWidths();
      const p = [];
      let size = 0, v = 0;
      for (let b = 0; b < 9; b++) {
        const o = (obs && obs[b]) || { n: 0, c: 0, x: 0 };
        const cp = k >= 2 ? Math.max(0, o.c - o.x / (k - 1)) : o.c;
        const pb = clamp((cp + C.CHECKUP.PRIOR_N * (prior[b] || 0)) / ((o.n || 0) + C.CHECKUP.PRIOR_N), 0, 1);
        p.push(Math.round(pb * 1000) / 1000);
        size += W[b] * pb;
        v += W[b] * W[b] * pb * (1 - pb) / ((o.n || 0) + C.CHECKUP.PRIOR_N);
      }
      return { size: Math.round(size), se: Math.round(Math.sqrt(v)), p };
    },
    /** Prior per band from the review deck: 0.9 x share of known course words (half for P). */
    prior(state, strand) {
      ensureInit();
      const out = [0, 0, 0, 0, 0, 0, 0, 0, 0], tot = [0, 0, 0, 0, 0, 0, 0, 0, 0];
      (IX.vocabByPos || []).forEach((v, i) => { const b = checkup.bandOf(i + 1); tot[b]++; if (known((state.cards || {})[v.id])) out[b]++; });
      return out.map((n, b) => (tot[b] ? C.CHECKUP.PRIOR_KNOWN * n / tot[b] : 0) * (strand === "P" ? C.CHECKUP.PRIOR_P_SHARE : 1));
    },
    /** Is a check-up taken at ts counted? (at most one counted check-up per 7 days) */
    counts(rt, ts) {
      const day = dayKey(ts);
      return !(rt.checkups || []).some((c) => c.counted && dayDiff(c.day, day) < C.CHECKUP.MIN_GAP_DAYS);
    },
    apply(state, result, ts) {
      if (!state.rating) state.rating = freshRating();
      const rt = ensureShape(state.rating);
      const day = dayKey(ts);
      const counted = checkup.counts(rt, ts);
      const firstEver = !(rt.checkups || []).some((c) => c.counted);
      const map = { V: "vocab", L: "listening", P: "production" };
      const entry = { day, ts, counted, size: [], se: [], t: [], before: [], after: [], kn0: knownWordCount(state), placement: [] };
      ["V", "L", "P"].forEach((st) => {
        const sk = rt.skills[map[st]], res = result[st] || { size: 0, se: 0 };
        const T = Math.round(vocabToRating(res.size) + C.CHECKUP.OFFSET[st]);
        entry.size.push(res.size); entry.se.push(res.se); entry.t.push(T); entry.before.push(Math.round(sk.r));
        const placement = firstEver && sk.n < C.CHECKUP.PLACEMENT_N;
        entry.placement.push(placement ? 1 : 0);
        if (counted) {
          const lam = placement ? 1.0 : C.CHECKUP.LAMBDA;
          sk.r = round1(clamp(sk.r + lam * (T - sk.r), C.FLOOR, C.CAP_SKILL));
          sk.u = Math.min(sk.u, placement ? C.CHECKUP.U_AFTER_PLACEMENT : C.CHECKUP.U_AFTER);
          sk.last = Math.max(sk.last || 0, ts);
        }
        entry.after.push(Math.round(sk.r));
      });
      entry.overallBefore = rt.days[day] ? rt.days[day].r : null;
      rt.checkups.push(entry);
      if (rt.checkups.length > 24) rt.checkups = rt.checkups.slice(-24);
      if (rt.today.day !== day) rt.today = { day, seen: {}, n: 0, ok: 0, ms: 0, lastTs: 0 };
      rt.days[day] = snapshot(state, day);
      const snap = rt.days[day];
      if (!snap.pv && snap.r > rt.peak.r) rt.peak = { r: snap.r, day };
      award(rt, "checkup1", day, []);
      evalBadges(state, day, []);
      return entry;
    },
  };

  // ------------------------------------------------------------------ the event listener: penguin:answer -> update
  const KIND_DEFAULT_EX = { prompt: "prompt", reading: "read-sentence", chat: "chat-turn", say: "say-try" };
  const debugged = new Set();
  let lastSig = "";

  function st() { return window.Store && window.Store.state; }

  function normExType(d) {
    let x = C.ALIAS[d.exType] || d.exType || KIND_DEFAULT_EX[d.itemKind] || "";
    if (x === "grammar") x = d.mode === "choice" ? "grammar-choice" : "grammar-fill";
    if (x === "sound") x = d.mode === "choice" ? "sound-pick" : "sound-type";
    if (x === "story") x = d.refIndex != null ? "story-beat" : "story-all";
    if (x === "reading") x = "read-sentence";
    if (x === "chat") x = "chat-turn";
    return x;
  }

  function lastOf(state, id, ts) {
    const rt = state.rating || {};
    const cand = [];
    if (rt.at && rt.at[id]) cand.push(rt.at[id]);
    const c = state.cards && state.cards[id];
    if (c && c.last && ts - c.last > C.JUST_SET_MS) cand.push(c.last);
    const l = state.learned && state.learned[id];
    if (l && ts - l > C.JUST_SET_MS) cand.push(l);
    const ph = state.phrases && state.phrases[id];
    if (ph && ph.ts && ts - ph.ts > 0) cand.push(ph.ts);
    const prior = cand.filter((t) => t < ts);
    return prior.length ? Math.max(...prior) : 0;
  }
  function ctxFromLast(last, ts) {
    if (!last) return "delayed";
    if (ts - last < C.FRESH_MS) return "fresh";
    if (ts - last < C.SESSION_MS) return "session";
    return "delayed";
  }
  /** Earlier-day completion of a unit / prompt / story / reading -> "repeat" (or delayed for grammar/sounds). */
  function firstDay(state, tag, id, stamp) {
    const rt = state.rating || {};
    const days = [];
    if (rt.first && rt.first[tag + id]) days.push(rt.first[tag + id]);
    if (stamp) days.push(dayKey(stamp));
    return days.length ? days.sort()[0] : "";
  }

  /** Build the contract's event from a penguin:answer detail. Returns null when it cannot be scored. */
  function eventFromDetail(state, d) {
    ensureInit();
    const exType = normExType(d);
    const skill = skillOf(exType);
    if (!skill) {
      if (!debugged.has(exType)) { debugged.add(exType); console.debug("[Rating] unscored exType ignored:", exType || "(none)", d); }
      return null;
    }
    const ts = Number.isFinite(+d.ts) && +d.ts > 0 ? +d.ts : Date.now();
    const today = dayKey(ts);
    const course = IX.course || {};
    const kind = d.itemKind || "";
    let outcome = ["good", "close", "miss", "unsure"].includes(d.outcome) ? d.outcome : null;
    if (!outcome) return null;
    let nChoices = Number.isFinite(+d.nChoices) && d.nChoices != null ? +d.nChoices : (d.mode === "choice" ? 4 : 0);
    if (d.mode && d.mode !== "choice") nChoices = 0;
    const ev = { ts, exType, outcome, score: d.score, slip: !!d.slip, nChoices, retry: !!d.retry, hintsUsed: +d.hintsUsed || 0, slowUsed: !!d.slowUsed };
    let ctx = "delayed", key, item, mirrorTag = null, mirrorId = null;

    if (/^grammar-/.test(exType) && exType !== "gender") {
      let gid = d.refId, idx = d.refIndex;
      if (!gid && typeof d.itemId === "string") { const m = d.itemId.match(/^(g_[^#]+)(?:#(\d+))?$/); if (m) { gid = m[1]; if (idx == null && m[2]) idx = +m[2]; } }
      const g = findIn(course.grammar, gid);
      if (!g) return null;
      item = { kind: "grammar", order: g.order || 0 };
      key = `${g.id}#${idx != null ? idx : ""}`;
      const gs = state.grammar && state.grammar[g.id];
      const fd = firstDay(state, "g:", g.id, gs && gs.done);
      ctx = d.context === "lesson" || !fd || fd >= today ? "session" : "delayed";
      mirrorTag = "g:"; mirrorId = g.id;
    } else if (/^sound-/.test(exType)) {
      let rid = d.refId, idx = d.refIndex;
      if (!rid && typeof d.itemId === "string") { const m = d.itemId.match(/^(s_[^#]+)(?:#(\d+))?$/); if (m) { rid = m[1]; if (idx == null && m[2]) idx = +m[2]; } }
      const i = IX.soundIdx[rid];
      if (i == null) return null;
      const drill = ((course.sounds[i] || {}).drills || [])[idx] || {};
      item = { kind: "sound", idx: i, words: words(drill.answer || d.answer || "") || 1 };
      key = `${rid}#${idx != null ? idx : ""}`;
      const sd = state.sounds && state.sounds[rid];
      const fd = firstDay(state, "s:", rid, typeof sd === "number" ? sd : null);
      ctx = d.context === "lesson" || !fd || fd >= today ? "session" : "delayed";
      mirrorTag = "s:"; mirrorId = rid;
    } else if (exType === "prompt") {
      const pid = d.refId || d.itemId;
      const p = findIn(course.prompts, pid);
      if (!p) return null;
      item = promptDesc(p);
      key = p.id;
      const ps = state.prompts && state.prompts[p.id];
      const fd = firstDay(state, "p:", p.id, ps && ps.at && ps.at < dayStart(ts) ? ps.at : null);
      ctx = fd && fd < today ? "repeat" : "delayed";
      mirrorTag = "p:"; mirrorId = p.id;
    } else if (exType === "story-beat" || exType === "story-all") {
      const sid = d.refId || (typeof d.itemId === "string" ? d.itemId.split("#")[0] : "");
      const s = findIn(course.stories, sid);
      if (!s) return null;
      item = { kind: "story", order: IX.gOrder[s.after_grammar] || 0 };
      key = exType === "story-beat" ? `${s.id}#${d.refIndex != null ? d.refIndex : ""}` : s.id;
      const ss = state.stories && state.stories[s.id];
      const fd = firstDay(state, "st:", s.id, ss && ss.done && ss.done < dayStart(ts) ? ss.done : null);
      ctx = fd && fd < today ? "repeat" : "delayed";
      mirrorTag = "st:"; mirrorId = s.id;
    } else if (exType === "read-sentence") {
      const rid = d.refId || (typeof d.itemId === "string" ? d.itemId.split("#")[0] : "");
      const r = findIn(course.readings, rid);
      if (!r) return null;
      const idx = d.refIndex != null ? d.refIndex : 0;
      const sent = (r.sentences || [])[idx] || {};
      item = { kind: "reading", tier: r.tier || 1, words: words(sent.es) };
      key = `${r.id}#${idx}`;
      const rs = state.readings && state.readings[r.id];
      const fd = firstDay(state, "r:", r.id, null);
      ctx = (rs && rs.runs >= 1) || (fd && fd < today) ? "repeat" : "delayed";
      if (outcome === "close" && d.score == null) ev.score = C.S_PARTLY;
      mirrorTag = "r:"; mirrorId = r.id;
    } else if (exType === "chat-turn") {
      if (d.words != null && d.words < C.CHAT_MIN_WORDS) return null;
      const lvl = clamp(+(d.level || (state.settings && state.settings.chatLevel) || 1) || 1, 1, 3);
      item = { kind: "chat", level: lvl };
      key = null;
      let S = Number.isFinite(+d.score) && d.score != null ? clamp(+d.score, 0, 1)
        : { good: d.slip ? C.CHAT_S.corrected : C.CHAT_S.clean, close: C.CHAT_S.corrected, miss: C.CHAT_S.english, unsure: 0 }[outcome];
      if (outcome === "good" && d.slip) S = Math.min(S, C.CHAT_S.corrected);
      ev.outcome = "score"; ev.score = S;
      ctx = "delayed";
    } else {
      // words, phrases, personal phrases
      const id = d.itemId;
      item = (window.App && typeof window.App.item === "function" && window.App.item(id)) || IX.items[id] || null;
      if (!item && d.text) item = { id, es: d.text };
      if (!item) return null;
      if (!isCourseItem(item) && !C.FREE_EX[exType] && !C.EX[exType]) return null;
      key = id;
      ctx = ctxFromLast(lastOf(state, id, ts), ts);
    }
    // flash cards: the learner's SRS button is the outcome (unless they said Not sure)
    if (d.mode === "flash" && d.srs && outcome !== "unsure") {
      ev.outcome = { again: "miss", hard: "close", good: "good", easy: "good" }[d.srs] || ev.outcome;
      if (ev.outcome === "close") ev.score = C.S_FLASH_HARD;
    }
    ev.item = item; ev.key = key; ev.ctx = ctx;
    ev._mirror = mirrorTag ? [mirrorTag, mirrorId] : null;
    return ev;
  }

  function handleDetail(d, opts) {
    opts = opts || {};
    const state = st();
    if (!state || !d) return null;
    if (Rating.suspended && !opts.force) return null;        // the check-up runs its own scoring
    const sig = [d.itemId, d.refId, d.refIndex, d.exType, d.outcome, d.ts].join("|");
    if (d.ts && sig === lastSig) return null;                  // the same answer dispatched twice
    lastSig = sig;
    if (!state.rating) bootstrap(state, window.COURSE);
    ensureShape(state.rating);
    const ev = eventFromDetail(state, d);
    if (!ev) return null;
    const res = update(state, ev);
    if (!res) return null;
    const rt = state.rating;
    if (ev.item && ev.item.id && ev.key === ev.item.id) rt.at[ev.item.id] = ev.ts;
    if (ev._mirror) { const k = ev._mirror[0] + ev._mirror[1]; if (!rt.first[k] || rt.first[k] > res.day) rt.first[k] = res.day; }
    try { if (window.Store && typeof window.Store.save === "function") window.Store.save(); } catch (e) { console.error(e); }
    try { window.dispatchEvent(new CustomEvent("penguin:rating", { detail: res })); } catch (e) { /* old browser */ }
    if (res.newBadges.length && !opts.quiet) celebrateToast(res.newBadges);
    return res;
  }

  function celebrateToast(ids) {
    const App = window.App;
    if (!App || typeof App.toast !== "function") return;
    const band = ids.map((id) => badgeInfo(id)).filter((b) => b && b.band).pop();
    const any = band || badgeInfo(ids[ids.length - 1]);
    if (!any) return;
    try { App.toast(`${any.icon} <strong>${App.esc ? App.esc(any.title) : any.title}</strong>, new badge! <a href="#/progress">See progress</a>`, 4000); } catch (e) { /* ignore */ }
  }

  /** Convenience from contract 6.4: build the event from an App.exercise spec + its result. */
  function record(ex, res, extra) {
    ex = ex || {}; res = res || {}; extra = extra || {};
    const it = ex.item || {};
    const slip = res.outcome === "good" && (res.notes || []).some((n) => n.kind === "grammar");
    return handleDetail(Object.assign({
      itemId: ex.id || it.id, itemKind: it.cat || ex.itemKind || "word", refId: ex.refId || null, refIndex: ex.refIndex != null ? ex.refIndex : null,
      exType: ex.exType, mode: ex.mode, nChoices: ex.mode === "choice" ? (ex.options || []).length : 0,
      outcome: res.outcome, score: res.score, slip, retry: !!ex.retry, ts: Date.now(),
    }, extra));
  }

  if (typeof window.addEventListener === "function") {
    window.addEventListener("penguin:answer", (e) => {
      try { handleDetail(e && e.detail); } catch (err) { console.error("[Rating]", err); }
    });
  }

  const Rating = (window.Rating = {
    C, init, pos, base, vocabToRating, ratingToVocab, words, itemDifficulty, skillOf, expected, kFactor, score, ctxFor,
    update, overall, provisional, errorBar, band, known, snapshot, forecast, bootstrap, record, checkup,
    // helpers used by the Progress page and tests
    fresh: freshRating, withIdle, streakInfo, badgeInfo, knownWordCount, dayKey, addDays, dayDiff, SKILL_LABEL,
    eventFromDetail, handle: handleDetail, index: IX, suspended: false, __loaded: true,
    get ready() { return IX.ready; },
  });
})();
