/* Progress state: one object saved to localStorage on every change and synced to /api/state when the server is
 * reachable (merged by last-modified). Also the spaced-repetition scheduler (SM-2 style). Exposes window.Store. */
(function () {
  "use strict";
  const KEY = "spanish-penguin.state.v1";
  const MIN = 60 * 1000, DAY = 24 * 60 * MIN;

  function fresh() {
    return {
      v: 1, updated: 0,
      learned: {},          // itemId -> first learned (ms)
      cards: {},            // itemId -> {ef, ivl (days), reps, lapses, due (ms), last (ms), seen}
      lessons: {},          // lessonId -> {step, done (ms)}
      grammar: {},          // unitId -> {done (ms), best}
      sounds: {},           // ruleId -> done (ms)
      prompts: {},          // promptId -> {best, outcome, at}
      stories: {},          // storyId -> {done (ms)}
      drafts: {},           // storyId -> {beats: [], all: "", mode}; "p:" + promptId -> text
      readings: {},         // readingId -> {idx, marks: {i: got|partly|missed}, notes: {i: text}, done, at, runs}
      days: {},             // "YYYY-MM-DD" -> {reviews, new, steps}
      streak: { count: 0, last: "" },
      lastReview: 0,
      settings: { voice: "", rates: { careful: 0.9, slow: 0.65, natural: 1.25 }, newPerDay: 20, showEnglish: true, autoplay: true },
    };
  }

  function load() {
    let s = null;
    try { s = JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) { s = null; }
    const base = fresh();
    if (!s || typeof s !== "object") return base;
    for (const k of Object.keys(base)) if (s[k] === undefined) s[k] = base[k];
    s.settings = Object.assign(base.settings, s.settings || {});
    s.settings.rates = Object.assign({}, fresh().settings.rates, s.settings.rates || {});
    return s;
  }

  const Store = (window.Store = { state: load(), online: false, coach: false, listeners: [] });

  // ------------------------------------------------------------------ persistence + sync
  let pushTimer = null;
  function persist() {
    try { localStorage.setItem(KEY, JSON.stringify(Store.state)); } catch (e) { /* storage full / private mode */ }
  }
  Store.save = function () {
    Store.state.updated = Date.now();
    persist();
    Store.listeners.forEach((f) => { try { f(); } catch (e) { console.error(e); } });
    if (Store.online) { clearTimeout(pushTimer); pushTimer = setTimeout(push, 800); }
  };
  Store.onChange = (f) => Store.listeners.push(f);

  function push() {
    fetch("api/state", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ state: Store.state }) })
      .catch(() => { Store.online = false; });
  }

  /** Merge two states: maps are unioned (newest entry wins), settings/streak from the newer blob. */
  function merge(a, b) {
    const newer = (a.updated || 0) >= (b.updated || 0) ? a : b;
    const older = newer === a ? b : a;
    const out = JSON.parse(JSON.stringify(newer));
    const mapKeys = ["learned", "cards", "lessons", "grammar", "sounds", "prompts", "stories", "drafts", "days", "readings"];
    const stamp = (x) => (x == null ? 0 : typeof x === "number" ? x : (x.last || x.done || x.at || x.updated || 0));
    for (const k of mapKeys) {
      const o = older[k] || {};
      out[k] = out[k] || {};
      for (const [id, val] of Object.entries(o)) {
        if (!(id in out[k])) out[k][id] = val;
        else if (k === "lessons") {
          const n = out[k][id];
          out[k][id] = { step: Math.max(n.step || 0, val.step || 0), done: n.done || val.done };
        } else if (k === "days") {
          const n = out[k][id];
          out[k][id] = { reviews: Math.max(n.reviews || 0, val.reviews || 0), new: Math.max(n.new || 0, val.new || 0), steps: Math.max(n.steps || 0, val.steps || 0) };
        } else if (stamp(val) > stamp(out[k][id])) out[k][id] = val;
      }
    }
    out.lastReview = Math.max(a.lastReview || 0, b.lastReview || 0);
    if ((older.streak && older.streak.last || "") > (out.streak && out.streak.last || "")) out.streak = older.streak;
    out.updated = Math.max(a.updated || 0, b.updated || 0);
    return out;
  }
  Store.merge = merge;

  /** Probe the server (only when served over http). Resolves {online, coach}. */
  Store.connect = async function () {
    if (!/^https?:/.test(location.protocol)) return { online: false, coach: false };
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 2000);
    try {
      const h = await fetch("api/health", { signal: ctl.signal, cache: "no-store" }).then((r) => (r.ok ? r.json() : null));
      clearTimeout(t);
      if (!h || !h.ok) return { online: false, coach: false };
      Store.online = true;
      Store.coach = !!h.coach;
      const remote = await fetch("api/state", { cache: "no-store" }).then((r) => r.json()).catch(() => null);
      if (remote && remote.state && typeof remote.state === "object") {
        const merged = merge(Store.state, remote.state);
        const changed = JSON.stringify(merged) !== JSON.stringify(Store.state);
        Store.state = Object.assign(fresh(), merged);
        Store.state.settings = Object.assign(fresh().settings, merged.settings || {});
        persist();
        if (changed) Store.listeners.forEach((f) => { try { f(); } catch (e) { /* ignore */ } });
      }
      push();
      return { online: true, coach: Store.coach };
    } catch (e) {
      clearTimeout(t);
      return { online: false, coach: false };
    }
  };

  Store.exportJSON = () => JSON.stringify(Store.state, null, 2);
  Store.importJSON = function (text, replace) {
    const s = JSON.parse(text);
    if (!s || typeof s !== "object" || !s.cards) throw new Error("That file doesn't look like a progress export.");
    Store.state = replace ? Object.assign(fresh(), s) : merge(Store.state, s);
    Store.save();
  };
  Store.reset = function () {
    const settings = Store.state.settings;
    Store.state = fresh();
    Store.state.settings = settings;
    Store.save();
  };

  // ------------------------------------------------------------------ activity / streak
  function today() { return window.App.dayKey(); }
  Store.day = function () {
    const k = today();
    if (!Store.state.days[k]) Store.state.days[k] = { reviews: 0, new: 0, steps: 0 };
    return Store.state.days[k];
  };
  Store.touchStreak = function () {
    const st = Store.state.streak, t = today();
    if (st.last === t) return false;
    const y = new Date(); y.setDate(y.getDate() - 1);
    st.count = st.last === window.App.dayKey(y) ? (st.count || 0) + 1 : 1;
    st.last = t;
    return true;
  };
  Store.streak = function () {
    const st = Store.state.streak, t = today();
    const y = new Date(); y.setDate(y.getDate() - 1);
    return st.last === t || st.last === window.App.dayKey(y) ? st.count || 0 : 0;
  };

  // ------------------------------------------------------------------ learning + SRS (SM-2 style)
  Store.isLearned = (id) => !!Store.state.learned[id];
  Store.learn = function (ids, opts) {
    opts = opts || {};
    const now = Date.now();
    let n = 0;
    for (const id of ids) {
      if (!Store.state.learned[id]) { Store.state.learned[id] = now; n++; }
      if (!Store.state.cards[id]) {
        Store.state.cards[id] = { ef: 2.5, ivl: 0, reps: 0, lapses: 0, due: now + (opts.dueNow ? 0 : 6 * 60 * MIN), last: now, seen: 0 };
      }
    }
    if (n) { Store.day().new += n; Store.touchStreak(); }
    Store.save();
    return n;
  };
  Store.unlearn = function (id) { delete Store.state.learned[id]; delete Store.state.cards[id]; Store.save(); };

  const RATING = { again: 0, hard: 1, good: 2, easy: 3 };
  /** Schedule a card after a review. rating: again | hard | good | easy. Returns next interval text. */
  Store.rate = function (id, rating, opts) {
    opts = opts || {};
    const now = Date.now();
    const c = Store.state.cards[id] || { ef: 2.5, ivl: 0, reps: 0, lapses: 0, due: now, last: now, seen: 0 };
    const q = RATING[rating] ?? 2;
    c.seen = (c.seen || 0) + 1;
    if (q === 0) {
      c.lapses = (c.lapses || 0) + (c.reps > 0 ? 1 : 0);
      c.reps = 0;
      c.ivl = 0;
      c.ef = Math.max(1.3, c.ef - 0.2);
      c.due = now + 10 * MIN;
    } else {
      if (q === 1) c.ef = Math.max(1.3, c.ef - 0.15);
      if (q === 3) c.ef = Math.min(3.0, c.ef + 0.15);
      let ivl;
      if (c.reps === 0) ivl = q === 1 ? 0.5 : q === 2 ? 1 : 3;
      else if (c.reps === 1) ivl = q === 1 ? 2 : q === 2 ? 3 : 6;
      else ivl = Math.max(1, c.ivl * (q === 1 ? 1.2 : q === 2 ? c.ef : c.ef * 1.3));
      c.reps += 1;
      c.ivl = Math.round(ivl * 10) / 10;
      c.due = now + c.ivl * DAY;
    }
    c.last = now;
    Store.state.cards[id] = c;
    if (!opts.practice) {
      Store.day().reviews += 1;
      Store.state.lastReview = now;
    }
    if (!Store.state.learned[id]) Store.state.learned[id] = now;
    Store.touchStreak();
    Store.save();
    return Store.describeIvl(c);
  };
  Store.describeIvl = function (c) {
    const ms = c.due - Date.now();
    if (ms < 60 * MIN) return `${Math.max(1, Math.round(ms / MIN))} min`;
    if (ms < DAY) return `${Math.round(ms / (60 * MIN))} h`;
    const d = Math.round(ms / DAY);
    return d === 1 ? "1 day" : `${d} days`;
  };
  Store.preview = function (id, rating) {   // what interval a rating would give, without saving
    const saved = JSON.stringify(Store.state.cards[id] || null);
    const st = JSON.stringify(Store.state.days), lr = Store.state.lastReview, sk = JSON.stringify(Store.state.streak), le = Store.state.learned[id];
    const realSave = Store.save; Store.save = () => {};
    let txt;
    try { txt = Store.rate(id, rating); } finally {
      Store.save = realSave;
      if (saved === "null") delete Store.state.cards[id]; else Store.state.cards[id] = JSON.parse(saved);
      Store.state.days = JSON.parse(st); Store.state.lastReview = lr; Store.state.streak = JSON.parse(sk);
      if (!le) delete Store.state.learned[id];
    }
    return txt;
  };
  Store.dueCards = function (at) {
    const t = at || Date.now();
    return Object.entries(Store.state.cards)
      .filter(([id, c]) => c.due <= t && window.App.item(id))
      .sort((a, b) => a[1].due - b[1].due)
      .map(([id]) => id);
  };
  Store.dueSoon = function () {   // due within the next 12 h
    return Store.dueCards(Date.now() + 12 * 60 * MIN).length;
  };
  /** Outcome of the grader -> suggested rating. */
  Store.suggest = function (res) {
    if (!res) return "good";
    if (res.outcome === "miss") return "again";
    if (res.outcome === "close") return "hard";
    const slips = (res.notes || []).filter((n) => n.kind === "grammar" || n.kind === "typo").length;
    return slips ? "good" : (res.score >= 0.99 ? "easy" : "good");
  };

  // ------------------------------------------------------------------ lessons
  Store.lessonState = (id) => Store.state.lessons[id] || { step: 0, done: 0 };
  Store.setStep = function (id, step, total) {
    const l = Store.state.lessons[id] || { step: 0, done: 0 };
    l.step = Math.max(l.step || 0, step);
    if (total && step >= total && !l.done) l.done = Date.now();
    Store.state.lessons[id] = l;
    Store.day().steps += 1;
    Store.touchStreak();
    Store.save();
  };
  Store.nextLesson = function () {
    const all = window.App.lessons();
    return all.find((l) => !Store.lessonState(l.id).done) || null;
  };
  Store.knownCount = function () {
    return Object.keys(Store.state.learned).filter((id) => window.App.item(id)).length;
  };
  Store.isGrammarDone = (gid) => !!(Store.state.grammar[gid] && Store.state.grammar[gid].done);
})();
