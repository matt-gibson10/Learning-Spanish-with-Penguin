/* Regression checks of the grader against the real course data (web/data/course.js): correct content must not be
 * flagged. Runs after grader.test.js; appends its results to the same list. */
(function () {
  "use strict";
  const C = window.COURSE;
  const G = window.Grader;
  const results = window.__graderResults || [];
  function test(name, fn) {
    try { const r = fn(); results.push({ name, ok: true, info: r || "" }); }
    catch (e) { results.push({ name, ok: false, info: e.message }); }
  }
  if (!C || !(C.vocab || []).length) { results.push({ name: "content checks (course.js not built)", ok: true, info: "skipped" }); return; }
  G.resetLexicon();
  const strip = (h) => h.replace(/<[^>]+>/g, "");
  test("every grammar drill answer grades as good with no notes", () => {
    let n = 0; const bad = [];
    for (const g of C.grammar) for (const d of g.drills) { n++; const r = G.gradeAnswer(d.answer, [d.answer].concat(d.alts || [])); if (r.outcome !== "good" || r.notes.length) bad.push(g.id + ": " + d.answer); }
    if (bad.length) throw new Error(bad.slice(0, 5).join(" | "));
    return `${n} drills`;
  });
  test("every prompt model answer is 'good' with no grammar notes", () => {
    let n = 0; const bad = [];
    for (const p of C.prompts) for (const m of p.models || []) {
      n++; const r = G.gradeFree(m, { targets: p.targets, models: p.models });
      if (r.outcome !== "good" || r.notes.some((x) => x.kind === "grammar")) bad.push(m + " :: " + r.notes.map((x) => strip(x.html)).join(" / "));
    }
    if (bad.length) throw new Error(bad.slice(0, 5).join(" | "));
    return `${n} model answers`;
  });
  test("example sentences: < 0.5% flagged as grammar slips", () => {
    let n = 0; const bad = [];
    for (const v of C.vocab.concat(C.chunks)) if (v.ex_es) { n++; const r = G.gradeFree(v.ex_es, {}); if (r.notes.some((x) => x.kind === "grammar")) bad.push(v.ex_es); }
    if (bad.length > n * 0.005) throw new Error(`${bad.length}/${n}: ` + bad.slice(0, 6).join(" | "));
    return `${bad.length}/${n} flagged: ${bad.join(" | ")}`;
  });
  test("learner slips still caught on the real lexicon", () => {
    const probes = [["la casa es bonito", "bonita"], ["el casa", "la casa"], ["tú habla inglés", "hablas"], ["yo quiere un café", "quiero"],
      ["unos cervezas", "unas cervezas"], ["el baño es en el segundo piso", "estar"], ["yo gusto los tacos", "me gustan"], ["soy 30 años", "tengo"]];
    const miss = probes.filter(([t, want]) => !G.gradeFree(t, {}).notes.some((x) => strip(x.html).includes(want)));
    if (miss.length) throw new Error(miss.map((m) => m[0]).join(" | "));
    return `${probes.length} probes`;
  });
  window.__graderResults = results;
})();
