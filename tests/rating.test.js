/* Penguin Rating tests: the 32 contract tests of docs/RATING.md section 6.5, then extras for the exTypes added by
 * the review, the penguin:answer -> update path and the farming / dedupe guards.
 * Run: open tests/rating.html in a browser, or `python tests/run_rating_tests.py` (headless Edge/Chrome). */
(function () {
  "use strict";
  const R = window.Rating;
  const results = (window.__ratingResults = []);
  const HOUR = 3600000, MIN = 60000, DAY = 86400000;
  const T0 = new Date(2026, 10, 2, 12, 0, 0).getTime();       // local noon

  function test(name, fn) {
    try { const info = fn(); results.push({ name, ok: true, info: info || "" }); }
    catch (e) { results.push({ name, ok: false, info: e && e.message ? e.message : String(e) }); }
  }
  function near(got, want, tol, what) {
    if (typeof got !== "number" || !isFinite(got) || Math.abs(got - want) > tol) throw new Error(`${what || "value"}: got ${got}, want ${want} (±${tol})`);
  }
  function eq(got, want, what) {
    if (JSON.stringify(got) !== JSON.stringify(want)) throw new Error(`${what || "value"}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
  }
  function ok(c, what) { if (!c) throw new Error(what || "assertion failed"); }
  function freshState() { return { cards: {}, learned: {}, recog: {}, grammar: {}, prompts: {}, readings: {}, stories: {}, rating: R.fresh() }; }
  function setSkill(st, skill, o) { st.rating.skills[skill] = Object.assign({ r: 100, u: 1, n: 1, last: T0 - HOUR }, o); }
  const ID = (d, k, x) => R.itemDifficulty(d, x);

  R.init(window.COURSE);

  // ------------------------------------------------------------------ contract tests (6.5)
  test("01 base(p)", () => {
    near(R.base(1), 117.8, 0.05, "base(1)"); near(R.base(3), 124.9, 0.05, "base(3)");
    near(R.base(187), 522.1, 0.05, "base(187)"); near(R.base(3022), 1532.2, 0.05, "base(3022)");
  });
  test("02 Gracias by exType", () => {
    const it = { p: 3, es: "Gracias" };
    eq(["recognise-choice", "listen-meaning", "produce-choice", "produce-type"].map((x) => R.itemDifficulty(it, x)), [125, 175, 275, 375]);
  });
  test("03 Me gustaría ___ produce-type", () => eq(R.itemDifficulty({ p: 187, es: "Me gustaría ___" }, "produce-type"), 802));
  test("04 ¿Qué onda? natural speed", () => {
    const it = { p: 144, es: "¿Qué onda?" };
    eq([R.itemDifficulty(it, "listen-natural-meaning"), R.itemDifficulty(it, "listen-natural")], [582, 787]);
  });
  test("05 casa by exType", () => {
    const it = { p: 134, es: "casa" };
    eq(["recognise-choice", "gender", "cloze", "produce-type"].map((x) => R.itemDifficulty(it, x)), [440, 590, 640, 690]);
  });
  test("06 grammar drills", () => {
    eq([R.itemDifficulty({ kind: "grammar", order: 2 }, "grammar-choice"), R.itemDifficulty({ kind: "grammar", order: 27 }, "grammar-fill"),
      R.itemDifficulty({ kind: "grammar", order: 32 }, "grammar-translate")], [194, 844, 1054]);
  });
  test("07 prompt, story, reading, chat, sound", () => {
    eq([R.itemDifficulty({ kind: "prompt", order: 6, words: 7 }, "prompt"),
      R.itemDifficulty({ kind: "story", order: 27 }, "story-beat"), R.itemDifficulty({ kind: "story", order: 27 }, "story-all"),
      R.itemDifficulty({ kind: "reading", tier: 1, words: 10 }, "read-sentence"), R.itemDifficulty({ kind: "chat", level: 2 }, "chat-turn"),
      R.itemDifficulty({ kind: "sound", idx: 0 }, "sound-pick"), R.itemDifficulty({ kind: "sound", idx: 0, words: 2 }, "sound-type")],
    [467, 969, 1044, 334, 925, 280, 510]);
  });
  test("08 expected()", () => {
    near(R.expected(500, 500, 0), 0.9, 1e-5); near(R.expected(500, 900, 0), 0.47368, 1e-5); near(R.expected(500, 500, 4), 0.925, 1e-5);
    near(R.expected(100, 500, 4), 0.60526, 1e-5); near(R.expected(900, 500, 0), 0.98901, 1e-5); near(R.expected(300, 500, 2), 0.87, 1e-5);
  });
  test("09 kFactor()", () => eq([R.kFactor(1), R.kFactor(0.5), R.kFactor(0.25), R.kFactor(0)], [40, 24, 16, 8]));
  test("10 first answer on a fresh rating", () => {
    const s = freshState();
    const r = R.update(s, { ts: T0, exType: "recognise-choice", item: { id: "v_x", p: 3 }, outcome: "good", nChoices: 4, ctx: "delayed" });
    near(r.E, 0.91471, 1e-5, "E"); near(r.delta, 3.41, 0.05, "delta"); near(s.rating.skills.vocab.r, 103.4, 0.05, "r");
    near(s.rating.skills.vocab.u, 0.975, 0.001, "u"); near(s.rating.skills.vocab.n, 1, 1e-9, "n"); near(s.rating.off.v_x, -1.0, 0.05, "off");
  });
  test("11 production miss, d given", () => {
    const s = freshState(); setSkill(s, "production", { r: 500, u: 0.5 });
    const r = R.update(s, { ts: T0, exType: "produce-type", d: 500, key: "k11", outcome: "miss", ctx: "delayed" });
    near(r.E, 0.9, 1e-5, "E"); near(r.K, 24, 1e-9, "K"); near(r.delta, -21.6, 0.05, "delta");
    near(s.rating.skills.production.r, 478.4, 0.05, "r"); near(s.rating.skills.production.u, 0.475, 0.001, "u");
  });
  test("12 production miss on an item", () => {
    const s = freshState(); setSkill(s, "production", { r: 500, u: 0.5 });
    const r = R.update(s, { ts: T0, exType: "produce-type", item: { id: "v_y", p: 173, es: "casa" }, outcome: "miss", ctx: "delayed" });
    eq(r.d, 752, "d"); near(r.E, 0.67844, 1e-5, "E"); near(s.rating.skills.production.r, 483.7, 0.05, "r"); near(s.rating.off.v_y, 8.1, 0.05, "off");
  });
  test("13 Not sure on multiple choice", () => {
    const s = freshState(); setSkill(s, "vocab", { r: 500, u: 0.25 });
    const r = R.update(s, { ts: T0, exType: "recognise-choice", d: 500, key: "k13", outcome: "unsure", nChoices: 4, ctx: "delayed" });
    near(r.S, 0.25, 1e-9, "S"); near(r.w, 0.75, 1e-9, "w"); near(r.E, 0.925, 1e-5, "E"); near(r.delta, -8.1, 0.05, "delta");
    near(s.rating.skills.vocab.r, 491.9, 0.05, "r"); near(s.rating.skills.vocab.u, 0.23125, 0.001, "u");
  });
  test("14 close, session", () => {
    const s = freshState(); setSkill(s, "production", { r: 600, u: 0.5 });
    const r = R.update(s, { ts: T0, exType: "produce-type", d: 700, key: "k14", outcome: "close", score: 0.62, ctx: "session" });
    near(r.E, 0.83501, 1e-5, "E"); near(r.w, 0.6, 1e-9, "w"); near(r.delta, -3.10, 0.05, "delta"); near(s.rating.skills.production.r, 596.9, 0.05, "r");
  });
  test("15 easy item gives nothing", () => {
    const s = freshState(); setSkill(s, "vocab", { r: 900, u: 0.1 });
    const r = R.update(s, { ts: T0, exType: "recognise-choice", d: 450, key: "k15", outcome: "good", nChoices: 4, ctx: "delayed" });
    eq(r.counted, false, "counted"); near(s.rating.skills.vocab.r, 900, 1e-9, "r"); near(s.rating.skills.vocab.u, 0.1, 1e-9, "u");
  });
  test("16 miss on an easy item counts in full", () => {
    const s = freshState(); setSkill(s, "vocab", { r: 900, u: 0.1 });
    const r = R.update(s, { ts: T0, exType: "recognise-choice", d: 450, key: "k16", outcome: "miss", nChoices: 4, ctx: "delayed" });
    near(r.E, 0.99380, 1e-5, "E"); near(r.K, 11.2, 1e-9, "K"); near(r.delta, -11.13, 0.05, "delta"); near(s.rating.skills.vocab.r, 888.9, 0.05, "r");
  });
  test("17 same-day guards and retries", () => {
    const s = freshState(); setSkill(s, "vocab", { r: 300, u: 0.5 }); setSkill(s, "listening", { r: 300, u: 0.5 });
    const it = { id: "v_z", p: 200 };
    const a = R.update(s, { ts: T0, exType: "recognise-choice", item: it, outcome: "good", nChoices: 4, ctx: "delayed" });
    eq(a.d, 540, "(a) d"); near(s.rating.skills.vocab.r, 305.5, 0.05, "(a) vocab");
    const b = R.update(s, { ts: T0 + MIN, exType: "recognise-choice", item: it, outcome: "good", nChoices: 4, ctx: "delayed" });
    near(b.w, 0, 1e-9, "(b) w"); near(s.rating.skills.vocab.r, 305.5, 0.05, "(b) vocab");
    const c = R.update(s, { ts: T0 + 2 * MIN, exType: "listen-meaning", item: it, outcome: "good", nChoices: 4, ctx: "delayed" });
    near(c.w, 0.25, 1e-9, "(c) w"); near(s.rating.skills.listening.r, 301.7, 0.05, "(c) listening");
    const vBefore = s.rating.skills.vocab.r;
    const d = R.update(s, { ts: T0 + 3 * MIN, exType: "produce-choice", item: it, outcome: "miss", nChoices: 4, ctx: "delayed", retry: true });
    near(d.w, 0, 1e-9, "(d) w"); near(s.rating.skills.vocab.r, vBefore, 1e-9, "(d) vocab");
    near(s.rating.off.v_z, -3.6, 0.05, "off"); eq(s.rating.today.seen.v_z.length, 3, "seen entries");
  });
  test("18 idle days raise uncertainty", () => {
    const s = freshState(); setSkill(s, "listening", { r: 640, u: 0.1, last: T0 - 20 * DAY - 5000 });
    const r = R.update(s, { ts: T0, exType: "listen-meaning", d: 600, key: "k18", outcome: "good", nChoices: 4, ctx: "delayed" });
    near(r.K, 31.47, 0.01, "K (u before 0.7333)"); near((r.K - 8) / 32, 0.7333, 0.001, "u before");
    near(s.rating.skills.listening.r, 641.9, 0.05, "r"); near(s.rating.skills.listening.u, 0.7083, 0.001, "u after");
  });
  test("19 self-rated flash card, hard", () => {
    const s = freshState(); setSkill(s, "listening", { r: 400, u: 0.4 });
    const r = R.update(s, { ts: T0, exType: "hear-flash", d: 400, key: "k19", outcome: "close", score: 0.6, ctx: "delayed" });
    near(r.w, 0.5, 1e-9, "w"); near(r.K, 20.8, 1e-9, "K"); near(r.delta, -3.12, 0.05, "delta"); near(s.rating.skills.listening.r, 396.9, 0.05, "r");
  });
  test("20 prompt with a grammar slip", () => {
    const s = freshState(); setSkill(s, "production", { r: 450, u: 0.6 });
    const r = R.update(s, { ts: T0, exType: "prompt", item: { kind: "prompt", order: 6, words: 7 }, key: "p_t", outcome: "good", slip: true, ctx: "delayed" });
    near(r.S, 0.9, 1e-9, "S"); near(r.E, 0.89084, 1e-5, "E"); near(s.rating.skills.production.r, 450.2, 0.05, "r"); eq(s.rating.freeN, 1, "freeN");
  });
  test("21 chat turn", () => {
    const s = freshState(); setSkill(s, "conversation", { r: 500, u: 1, last: 0 });
    const r = R.update(s, { ts: T0, exType: "chat-turn", item: { kind: "chat", level: 1 }, key: null, outcome: "score", score: 0.7, ctx: "session" });
    near(r.E, 0.73999, 1e-5, "E"); near(s.rating.skills.conversation.r, 499.0, 0.05, "r");
  });
  test("22 reading sentence, partly", () => {
    const s = freshState(); setSkill(s, "reading", { r: 300, u: 1, last: 0 });
    const r = R.update(s, { ts: T0, exType: "read-sentence", item: { kind: "reading", tier: 1, words: 10 }, key: "rd#0", outcome: "close", score: 0.5, ctx: "delayed" });
    near(r.w, 0.5, 1e-9, "w"); near(r.E, 0.88095, 1e-5, "E"); near(s.rating.skills.reading.r, 292.4, 0.05, "r");
  });
  test("23 grammar choice, session", () => {
    const s = freshState(); setSkill(s, "grammar", { r: 300, u: 0.8 });
    const r = R.update(s, { ts: T0, exType: "grammar-choice", item: { kind: "grammar", order: 2 }, key: "g#1", outcome: "good", nChoices: 2, ctx: "session" });
    near(r.E, 0.97154, 1e-5, "E"); near(s.rating.skills.grammar.r, 300.6, 0.05, "r");
  });
  test("24 overall: weighted mean pulled to the weaker of L and P", () => {
    const rt = R.fresh();
    Object.assign(rt.skills.vocab, { r: 600, n: 5 }); Object.assign(rt.skills.listening, { r: 640, n: 5 });
    Object.assign(rt.skills.production, { r: 310, n: 5 }); Object.assign(rt.skills.grammar, { r: 500, n: 5 });
    eq(R.overall(rt), 460);
  });
  test("25 overall: gate and cap", () => {
    const all = (r, freeN) => { const rt = R.fresh(); R.C.SKILLS.forEach((s) => Object.assign(rt.skills[s], { r, n: 3 })); rt.freeN = freeN; return R.overall(rt); };
    eq([R.overall(R.fresh()), all(1000, 5), all(1000, 20), all(1600, 50)], [100, 899, 1000, 1400]);
  });
  test("26 bands", () => {
    eq([R.band(100).id, R.band(599).id, R.band(600).id, R.band(1400).id, R.band(2500).id, R.band(650).next],
      ["primeras", "turista", "viajero", "independiente", "nativo", 900]);
  });
  test("27 vocabulary rule both ways", () => {
    eq([Math.round(R.vocabToRating(1000)), Math.round(R.vocabToRating(3022)), Math.round(R.vocabToRating(42000)),
      Math.round(R.ratingToVocab(1500)), Math.round(R.ratingToVocab(900))], [934, 1382, 2509, 4001, 915]);
  });
  test("28 provisional countdown", () => {
    const rt = R.fresh();
    const a = R.provisional(rt).answersLeft;
    rt.skills.vocab.u = 0.5; rt.skills.listening.u = 0.3; rt.skills.production.u = 0.2;
    eq([a, R.provisional(rt).answersLeft], [90, 12]);
  });
  test("29 check-up estimate (worked example)", () => {
    const e = R.checkup.estimate({ 0: { n: 2, c: 2, x: 0 }, 1: { n: 3, c: 3, x: 0 }, 2: { n: 4, c: 3, x: 1 }, 3: { n: 3, c: 1, x: 1 }, 4: { n: 2, c: 0, x: 1 } },
      [0.9, 0.72, 0.2, 0, 0, 0, 0, 0, 0], 4);
    [0.95, 0.888, 0.511, 0.133, 0, 0, 0, 0, 0].forEach((p, i) => near(e.p[i], p, 0.001, "p" + i));
    eq(e.size, 391, "size"); eq(e.se, 67, "se"); eq(Math.round(R.vocabToRating(e.size)), 593, "rating");
  });
  test("30 forecast", () => {
    const days = {}; const start = R.dayKey(T0);
    for (let i = 0; i < 10; i++) days[R.addDays(start, i)] = { r: 300 + 5 * i, pv: 0 };
    const f = R.forecast(days, 600, R.addDays(start, 9));
    near(f.perDay, 5, 0.01, "perDay"); eq(f.days, 51, "days");
  });
  test("31 pos() on the real course", () => {
    const got = [R.pos(3), R.pos(188), R.pos(1000), R.pos(6000)];
    eq(got[3], window.COURSE.vocab.length, "pos(6000) = every course word");
    // the contract's 3 / 187 / 787 / 3022 are for the 3,022-word course; they move by a word or two when the content changes
    eq(got.map((x, i) => Math.abs(x - [3, 187, 787, 3022][i]) <= 2), [true, true, true, true], "within 2 of the contract values " + JSON.stringify(got));
    return JSON.stringify(got);
  });
  test("32 bootstrap from the first two lessons", () => {
    // the 22 items of u01l01 + u01l02 when RATING.md was written (also exactly the owner's saved progress); the content
    // agent's starter path has since changed lesson 2, so the list is pinned here rather than read from the lessons
    const ids = ["c_hola_buenos_dias", "v_ir", "c_por_favor", "v_si_2", "c_gracias", "v_aqui", "c_muchas_gracias", "v_llegar", "v_el", "v_la", "v_de",
      "c_de_nada", "v_donde", "c_buenas_tardes", "v_seguir", "c_buenas_noches", "v_venir", "c_mande", "v_favor", "v_que", "v_y", "v_a"];
    ok(ids.every((id) => window.App.item(id)), "all 22 items still in the course");
    const s = { learned: {}, recog: {}, cards: {}, grammar: { g_pronunciation: { best: 0.75, done: T0 } }, prompts: {}, readings: {}, rating: null };
    ids.forEach((id, i) => { s.learned[id] = T0 - DAY + i * 1000; s.recog[id] = 2; s.cards[id] = { ef: 2.5, ivl: 0, reps: 0, lapses: 0, due: T0, last: T0, seen: 0, ok: 1 }; });
    R.bootstrap(s, window.COURSE);
    const k = s.rating.skills;
    // exact contract values hold for the 3,022-word course RATING.md was written against (52/52 with git HEAD's course.js);
    // when the content changes ranks or teaching units they drift by a point or so, so the tolerance widens then
    const docCourse = window.COURSE.vocab.length === 3022, tol = docCourse ? 0.1 : 3;
    near(k.vocab.r, 128.0, tol, "vocab"); near(k.listening.r, 202.5, tol, "listening"); near(k.grammar.r, 100.0, 0.1, "grammar");
    ["production", "reading", "conversation"].forEach((x) => near(k[x].r, 100, 0.1, x));
    near(R.overall(s.rating), 129, docCourse ? 0 : 2, "overall");
    R.C.SKILLS.forEach((x) => ok(k[x].u >= 0.5, x + " u >= 0.5"));
    return `vocab ${k.vocab.r}, listening ${k.listening.r}, overall ${R.overall(s.rating)}` + (docCourse ? "" : ` (course has ${window.COURSE.vocab.length} words, not 3,022: tolerance ±3)`);
  });

  // ------------------------------------------------------------------ extras: exTypes added by the review
  test("X01 produce-recall: production +250 + length, hints cap S", () => {
    eq(R.itemDifficulty({ p: 3, es: "Gracias" }, "produce-recall"), 375); eq(R.skillOf("produce-recall"), "production");
    eq(R.itemDifficulty({ p: 187, es: "Me gustaría ___" }, "produce-recall"), 802);
    eq([0, 1, 2, 3, 4].map((h) => R.score({ exType: "produce-recall", outcome: "good", hintsUsed: h }).S), [1, 0.8, 0.6, 0.4, 0.4]);
    eq(R.score({ exType: "produce-recall", outcome: "close", score: 0.7, hintsUsed: 2 }).S, 0.6, "close capped too");
  });
  test("X02 dictation: listening +200 + sentence length, slow caps S at 0.7", () => {
    eq(R.itemDifficulty({ p: 134, es: "casa", ex_es: "Mi casa es tu casa." }, "dictation"), 760); eq(R.skillOf("dictation"), "listening");
    eq(R.itemDifficulty({ p: 134, es: "casa", ex_es: "Mi casa." }, "dictation"), 670);
    eq(R.score({ exType: "dictation", outcome: "good", slowUsed: true }).S, 0.7); eq(R.score({ exType: "dictation", outcome: "good" }).S, 1);
  });
  test("X03 cloze-choice, conj-hear, conj-produce", () => {
    const it = { p: 134, es: "casa" };
    eq([R.itemDifficulty(it, "cloze-choice"), R.itemDifficulty(it, "conj-hear"), R.itemDifficulty(it, "conj-produce")], [540, 540, 665]);
    eq([R.skillOf("cloze-choice"), R.skillOf("conj-hear"), R.skillOf("conj-produce")], ["vocab", "listening", "grammar"]);
  });
  test("X04 personal phrases: say-try, mine-produce, mine-hear", () => {
    const six = { id: "my_1", es: "Quiero ir a la playa mañana" };
    const long = { id: "my_2", es: "uno dos tres cuatro cinco seis siete ocho nueve diez once doce trece catorce quince dieciséis" };
    eq([R.itemDifficulty(six, "say-try"), R.itemDifficulty(six, "mine-produce"), R.itemDifficulty(long, "say-try"), R.itemDifficulty(six, "mine-hear")],
      [660, 660, 950, 500]);
    eq([R.skillOf("say-try"), R.skillOf("mine-produce"), R.skillOf("mine-hear")], ["production", "production", "listening"]);
    const s = freshState();
    R.update(s, { ts: T0, exType: "say-try", item: six, outcome: "good", ctx: "fresh" });
    eq(s.rating.off.my_1, undefined, "no personal offset for phrases without a rank"); eq(s.rating.freeN, 0, "not free production");
  });
  test("X05 aliases: read-mark, build, sound drills", () => {
    eq([R.skillOf("read-mark"), R.skillOf("build"), R.skillOf("sound-pick"), R.skillOf("sound-type")], ["reading", "production", "listening", "listening"]);
    eq(R.itemDifficulty({ kind: "reading", tier: 1, words: 10 }, "read-mark"), 334);
    eq(R.itemDifficulty({ p: 134, es: "casa" }, "build"), 615);
  });
  test("X06 unknown exTypes are not scored", () => {
    eq(R.skillOf("mystery-type"), null);
    const s = freshState(); eq(R.update(s, { ts: T0, exType: "mystery-type", d: 300, key: "k", outcome: "good" }), null);
    eq(s.rating.today.n, 0, "today untouched");
  });
  test("X07 tierCap: a rare word taught in a tier-1 unit is capped at rank 500", () => {
    const it = window.COURSE.vocab.find((v) => v.rank > 1500 && R.index.unitTier[v.id] === 1);
    if (!it) return "no such word in the current course (skipped)";
    eq(R.itemDifficulty(it, "recognise-choice"), Math.round(R.base(R.pos(500))), it.id);
  });

  // ------------------------------------------------------------------ extras: the event path
  const realStore = window.Store;
  function withStore(state, fn) {
    let saves = 0;
    window.Store = { state, save() { saves++; } };
    try { return fn(() => saves); } finally { window.Store = realStore; }
  }
  const fire = (detail) => window.dispatchEvent(new CustomEvent("penguin:answer", { detail }));
  const gracias = () => window.App.item("c_gracias");

  test("X08 penguin:answer -> update -> Store.save", () => {
    const s = freshState();
    s.cards.c_gracias = { ef: 2.5, ivl: 1, reps: 1, lapses: 0, due: T0, last: T0 - 2 * DAY, seen: 1 };
    return withStore(s, (saves) => {
      fire({ itemId: "c_gracias", itemKind: "chunk", exType: "recognise-choice", mode: "choice", nChoices: 4, outcome: "good", score: 1, context: "review", ts: T0 });
      ok(s.rating.skills.vocab.r > 100, "vocab moved"); eq(saves(), 1, "saved once");
      eq(s.rating.at.c_gracias, T0, "last-answer mirror"); eq(s.rating.today.n, 1, "today.n");
      ok(s.rating.days[R.dayKey(T0)], "day snapshot written");
      return `vocab ${s.rating.skills.vocab.r}`;
    });
  });
  test("X09 ctx is independent of Store.rate ordering", () => {
    const s = freshState();
    // Store.rate already ran for this answer (card.last == ts), but we answered 5 min ago -> fresh
    s.cards.c_gracias = { ef: 2.5, ivl: 1, reps: 1, lapses: 0, due: T0, last: T0, seen: 2 };
    s.rating.at.c_gracias = T0 - 5 * MIN;
    const e1 = R.eventFromDetail(s, { itemId: "c_gracias", itemKind: "chunk", exType: "listen-meaning", mode: "choice", nChoices: 4, outcome: "good", ts: T0 });
    eq(e1.ctx, "fresh", "rate-before-event");
    // the event fires first: card.last is the previous review 2 days ago -> delayed
    const s2 = freshState(); s2.cards.c_gracias = { ef: 2.5, ivl: 1, reps: 1, lapses: 0, due: T0, last: T0 - 2 * DAY, seen: 2 };
    eq(R.eventFromDetail(s2, { itemId: "c_gracias", exType: "listen-meaning", mode: "choice", outcome: "good", ts: T0 }).ctx, "delayed", "event-before-rate");
    // Store.rate ran first and there is no mirror: falls back to delayed, not fresh
    const s3 = freshState(); s3.cards.c_gracias = { ef: 2.5, ivl: 1, reps: 1, lapses: 0, due: T0, last: T0, seen: 2 };
    eq(R.eventFromDetail(s3, { itemId: "c_gracias", exType: "listen-meaning", mode: "choice", outcome: "good", ts: T0 }).ctx, "delayed", "no mirror");
    // lesson quick check right after learning -> fresh; 3 h later -> session
    const s4 = freshState(); s4.learned.c_gracias = T0 - 2 * MIN; s4.cards.c_gracias = { ef: 2.5, ivl: 0, reps: 0, due: T0, last: T0 - 2 * MIN };
    eq(R.eventFromDetail(s4, { itemId: "c_gracias", exType: "recognise-choice", mode: "choice", outcome: "good", ts: T0, context: "lesson" }).ctx, "fresh", "lesson");
    eq(R.eventFromDetail(s4, { itemId: "c_gracias", exType: "recognise-choice", mode: "choice", outcome: "good", ts: T0 + 3 * HOUR }).ctx, "session", "3 h later");
  });
  test("X10 duplicate dispatch of the same answer is ignored", () => {
    const s = freshState();
    return withStore(s, (saves) => {
      const d = { itemId: "c_gracias", itemKind: "chunk", exType: "recognise-choice", mode: "choice", nChoices: 4, outcome: "good", ts: T0 + 7 };
      fire(d); fire(Object.assign({}, d));
      eq(s.rating.today.n, 1, "counted once"); eq(saves(), 1, "saved once");
    });
  });
  test("X11 farming: same exType twice a day scores 0, five keys max, retries 0", () => {
    const s = freshState();
    return withStore(s, () => {
      const base = { itemId: "c_gracias", itemKind: "chunk", mode: "choice", nChoices: 4, outcome: "good" };
      const a = R.handle(Object.assign({}, base, { exType: "recognise-choice", ts: T0 + 100 }));
      const b = R.handle(Object.assign({}, base, { exType: "recognise-choice", ts: T0 + 200 }));
      ok(a.w > 0, "first counts"); eq(b.w, 0, "second same exType");
      const types = ["listen-meaning", "listen-choice", "produce-choice", "cloze-choice", "listen-natural-meaning"];
      const ws = types.map((x, i) => R.handle(Object.assign({}, base, { exType: x, ts: T0 + 300 + i })).w);
      eq(ws.map((w) => w > 0), [true, true, true, true, false], "6th exType on one item");
      ok(ws.slice(0, 4).every((w) => w === 0.25), "later exTypes forced to fresh");
      const r = R.handle({ itemId: "v_aqui", itemKind: "word", exType: "recognise-choice", mode: "choice", nChoices: 4, outcome: "good", retry: true, ts: T0 + 900 });
      eq(r.w, 0, "retry"); eq(r.counted, false, "retry not counted");
    });
  });
  test("X12 grammar drill in a lesson -> session, key unit#index", () => {
    const s = freshState();
    const g = window.COURSE.grammar.find((x) => x.id === "g_ser");
    const e = R.eventFromDetail(s, { itemKind: "grammar", refId: "g_ser", refIndex: 3, exType: "grammar-fill", mode: "type", outcome: "good", context: "lesson", ts: T0 });
    eq([e.ctx, e.key, R.itemDifficulty(e.item, e.exType)], ["session", "g_ser#3", 150 + 22 * g.order + 100]);
    s.grammar.g_ser = { done: T0 - 3 * DAY, best: 0.9 };
    eq(R.eventFromDetail(s, { itemKind: "grammar", refId: "g_ser", refIndex: 3, exType: "grammar-fill", mode: "type", outcome: "good", context: "grammar", ts: T0 }).ctx, "delayed", "grammar page, later day");
  });
  test("X13 chat turn: level, slip -> 0.7, freeN", () => {
    const s = freshState();
    return withStore(s, () => {
      const r = R.handle({ itemKind: "chat", exType: "chat-turn", mode: "free", outcome: "good", slip: true, level: 2, context: "chat", ts: T0 + 11 });
      eq([r.d, r.S, s.rating.freeN], [925, 0.7, 1]);
      const r2 = R.handle({ itemKind: "chat", exType: "chat-turn", mode: "free", outcome: "good", score: 0.4, level: 1, context: "chat", ts: T0 + 12 });
      eq(r2.S, 0.4, "explicit score wins");
    });
  });
  test("X14 flash cards: the SRS button is the outcome", () => {
    const s = freshState();
    const d = { itemId: "c_gracias", exType: "hear-flash", mode: "flash", outcome: "good", ts: T0 };
    const hard = R.eventFromDetail(s, Object.assign({}, d, { srs: "hard" }));
    eq([hard.outcome, hard.score, R.eventFromDetail(s, Object.assign({}, d, { srs: "again" })).outcome, R.eventFromDetail(s, Object.assign({}, d, { srs: "easy" })).outcome],
      ["close", 0.6, "miss", "good"]);
    eq(R.eventFromDetail(s, Object.assign({}, d, { outcome: "unsure", srs: "again" })).outcome, "unsure", "Not sure stays Not sure");
  });
  test("X15 tolerant of missing fields", () => {
    const s = freshState();
    eq(R.eventFromDetail(s, { itemId: "c_gracias" }), null, "no outcome");
    eq(R.eventFromDetail(s, { itemId: "nope", exType: "recognise-choice", outcome: "good" }), null, "unknown item");
    const p = window.COURSE.prompts[0];
    const e = R.eventFromDetail(s, { itemKind: "prompt", refId: p.id, outcome: "close", score: 0.6 });
    eq([e.exType, e.ctx, e.key], ["prompt", "delayed", p.id]);
    s.prompts[p.id] = { best: 0.9, outcome: "good", at: T0 - 2 * DAY };
    eq(R.eventFromDetail(s, { itemKind: "prompt", refId: p.id, outcome: "good", ts: T0 }).ctx, "repeat", "done on an earlier day");
    const e2 = R.eventFromDetail(s, { itemId: "c_gracias", exType: "recognise-choice", outcome: "good", mode: "choice" });
    eq(e2.nChoices, 4, "choice default k = 4");
  });
  test("X16 story beat / reading descriptors", () => {
    const s = freshState(); const st = window.COURSE.stories[0]; const rd = window.COURSE.readings[0];
    const b = R.eventFromDetail(s, { itemKind: "story", refId: st.id, refIndex: 2, exType: "story-beat", outcome: "good", ts: T0 });
    eq([b.key, R.itemDifficulty(b.item, "story-beat")], [st.id + "#2", 150 + 22 * (window.COURSE.grammar.find((g) => g.id === st.after_grammar) || { order: 0 }).order + 225]);
    const r = R.eventFromDetail(s, { itemKind: "reading", refId: rd.id, refIndex: 1, exType: "read-mark", mode: "flash", outcome: "close", ts: T0 });
    eq([r.exType, r.key, r.score], ["read-sentence", rd.id + "#1", 0.5]);
  });
  test("X17 check-up: staircase and applying a placement", () => {
    const C = R.checkup;
    eq([C.bandOf(1), C.bandOf(125), C.bandOf(126), C.bandOf(3022), C.start(R.fresh(), "V"), C.start(R.fresh(), "P")], [0, 0, 1, 8, 0, 0]);
    eq([C.next(3, "good"), C.next(3, "close"), C.next(3, "miss"), C.next(0, "unsure"), C.next(8, "good")], [4, 3, 2, 0, 8]);
    const s = freshState();
    const e = C.apply(s, { V: { size: 391, se: 67 }, L: { size: 200, se: 50 }, P: { size: 60, se: 30 } }, T0);
    ok(e.counted, "counted"); near(s.rating.skills.vocab.r, 593, 0.6, "placement sets vocab"); ok(s.rating.skills.vocab.u <= 0.5, "u <= 0.5");
    const v = s.rating.skills.vocab.r;
    const e2 = C.apply(s, { V: { size: 1000, se: 67 }, L: { size: 200, se: 50 }, P: { size: 60, se: 30 } }, T0 + 3 * DAY);
    eq(e2.counted, false, "within 7 days: practice"); near(s.rating.skills.vocab.r, v, 1e-9, "unchanged");
    const e3 = C.apply(s, { V: { size: 1000, se: 67 }, L: { size: 200, se: 50 }, P: { size: 60, se: 30 } }, T0 + 8 * DAY);
    ok(e3.counted, "after 7 days counts"); near(s.rating.skills.vocab.r, v + 0.5 * (Math.round(R.vocabToRating(1000)) - v), 0.06, "lambda 0.5");
  });
  test("X18 bootstrap is idempotent; forecast needs 7 days and a real slope", () => {
    const s = { learned: { c_gracias: T0 }, recog: { c_gracias: 1 }, cards: {}, rating: null };
    const a = R.bootstrap(s, window.COURSE); const snap = JSON.stringify(a);
    R.bootstrap(s, window.COURSE); eq(JSON.stringify(s.rating), snap, "unchanged");
    const days = {}; const k0 = R.dayKey(T0);
    for (let i = 0; i < 6; i++) days[R.addDays(k0, i)] = { r: 300 + 5 * i, pv: 0 };
    eq(R.forecast(days, 600, R.addDays(k0, 5)), null, "6 days");
    for (let i = 0; i < 10; i++) days[R.addDays(k0, i)] = { r: 300 + 0.1 * i, pv: 0 };
    eq(R.forecast(days, 600, R.addDays(k0, 9)), null, "flat");
  });
  test("X19 snapshot: known items by tier, mature, provisional", () => {
    const s = freshState();
    s.cards.c_gracias = { reps: 2, ivl: 25 }; s.cards.v_casa = { reps: 1, ivl: 1 }; s.cards.v_ir = { reps: 0, ivl: 0 };
    const sn = R.snapshot(s, R.dayKey(T0));
    eq([sn.kn.reduce((a, b) => a + b, 0), sn.mat, sn.pv, sn.r], [2, 1, 1, 100]);
  });
  test("X20 band badge needs three settled active days; Matagigantes", () => {
    const s = freshState();
    ["vocab", "listening", "production"].forEach((x) => setSkill(s, x, { r: 400, u: 0.1, n: 50, last: T0 - HOUR }));
    s.rating.freeN = 0;
    for (let i = 0; i < 3; i++) R.update(s, { ts: T0 + i * DAY, exType: "recognise-choice", d: 450, key: "b" + i, outcome: "good", nChoices: 4, ctx: "delayed" });
    ok(s.rating.badges["band-turista"], "Turista after 3 days: " + JSON.stringify(Object.keys(s.rating.badges)));
    const s2 = freshState(); setSkill(s2, "vocab", { r: 300, u: 0.5 });
    const r = R.update(s2, { ts: T0, exType: "recognise-choice", d: 650, key: "g", outcome: "good", nChoices: 4, ctx: "delayed" });
    ok(r.newBadges.includes("giant") && s2.rating.badges.giant, "giant-killer");
  });

  window.__renderRatingResults = function () {
    const pass = results.filter((r) => r.ok).length;
    const out = document.getElementById("out");
    const esc = (x) => String(x).replace(/&/g, "&amp;").replace(/</g, "&lt;");
    if (out) {
      out.innerHTML = `<h2 id="summary">${pass}/${results.length} passed</h2>` + results.map((r) =>
        `<div class="${r.ok ? "pass" : "fail"}"><b>${r.ok ? "PASS" : "FAIL"}</b> ${esc(r.name)}<br><small>${esc(r.info)}</small></div>`).join("");
      document.title = `rating ${pass}/${results.length}`;
    }
  };
  window.__renderRatingResults();
})();
