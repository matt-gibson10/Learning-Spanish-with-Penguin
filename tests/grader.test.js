/* Grader tests. Run by opening tests/grader.html in a browser (or `python tests/run_grader_tests.py`,
 * which uses headless Edge/Chrome). Uses a small fixture lexicon so results don't depend on content files. */
(function () {
  "use strict";
  const V = [
    { id: "v_casa", es: "casa", en: "house, home", pos: "noun", gender: "f", article: "la", plural: "casas" },
    { id: "v_gato", es: "gato", en: "cat", pos: "noun", gender: "m", article: "el", plural: "gatos" },
    { id: "v_mesa", es: "mesa", en: "table", pos: "noun", gender: "f", article: "la", plural: "mesas" },
    { id: "v_taco", es: "taco", en: "taco", pos: "noun", gender: "m", article: "el", plural: "tacos" },
    { id: "v_agua", es: "agua", en: "water", pos: "noun", gender: "f", article: "el", plural: "aguas" },
    { id: "v_cafe", es: "café", en: "coffee", pos: "noun", gender: "m", article: "el", plural: "cafés" },
    { id: "v_cuenta", es: "cuenta", en: "the bill", pos: "noun", gender: "f", article: "la", plural: "cuentas" },
    { id: "v_ano", es: "año", en: "year", pos: "noun", gender: "m", article: "el", plural: "años" },
    { id: "v_bano", es: "baño", en: "bathroom", pos: "noun", gender: "m", article: "el", plural: "baños" },
    { id: "v_hotel", es: "hotel", en: "hotel", pos: "noun", gender: "m", article: "el", plural: "hoteles" },
    { id: "v_bonito", es: "bonito", en: "pretty", pos: "adj", fem: "bonita", plural: "bonitos" },
    { id: "v_negro", es: "negro", en: "black", pos: "adj", fem: "negra", plural: "negros" },
    { id: "v_grande", es: "grande", en: "big", pos: "adj", fem: "grande", plural: "grandes" },
    { id: "v_tres", es: "tres", en: "three", pos: "num" },
    { id: "v_favor", es: "favor", en: "favour", pos: "noun", gender: "m", article: "el", plural: "favores" },
    { id: "v_ingles", es: "inglés", en: "English", pos: "noun", gender: "m", article: "el" },
    { id: "v_hablar", es: "hablar", en: "to speak", pos: "verb", conj: {
      pres: ["hablo", "hablas", "habla", "hablamos", "hablan"], pret: ["hablé", "hablaste", "habló", "hablamos", "hablaron"],
      imp: ["hablaba", "hablabas", "hablaba", "hablábamos", "hablaban"], fut: ["hablaré", "hablarás", "hablará", "hablaremos", "hablarán"],
      subj: ["hable", "hables", "hable", "hablemos", "hablen"], cmd: { tu: "habla", usted: "hable" }, ger: "hablando", part: "hablado" } },
    { id: "v_gustar", es: "gustar", en: "to like (to please)", pos: "verb", conj: {
      pres: ["gusto", "gustas", "gusta", "gustamos", "gustan"], ger: "gustando", part: "gustado" } },
    { id: "v_querer", es: "querer", en: "to want", pos: "verb", conj: {
      pres: ["quiero", "quieres", "quiere", "queremos", "quieren"], pret: ["quise", "quisiste", "quiso", "quisimos", "quisieron"],
      ger: "queriendo", part: "querido" } },
    { id: "v_comer", es: "comer", en: "to eat", pos: "verb", conj: {
      pres: ["como", "comes", "come", "comemos", "comen"], pret: ["comí", "comiste", "comió", "comimos", "comieron"],
      ger: "comiendo", part: "comido" } },
    { id: "v_ir", es: "ir", en: "to go", pos: "verb", conj: {
      pres: ["voy", "vas", "va", "vamos", "van"], pret: ["fui", "fuiste", "fue", "fuimos", "fueron"], ger: "yendo", part: "ido" } },
    { id: "v_ser", es: "ser", en: "to be", pos: "verb", conj: {
      pres: ["soy", "eres", "es", "somos", "son"], pret: ["fui", "fuiste", "fue", "fuimos", "fueron"], ger: "siendo", part: "sido" } },
    { id: "v_estar", es: "estar", en: "to be (location, state)", pos: "verb", conj: {
      pres: ["estoy", "estás", "está", "estamos", "están"], ger: "estando", part: "estado" } },
    { id: "v_tener", es: "tener", en: "to have", pos: "verb", conj: {
      pres: ["tengo", "tienes", "tiene", "tenemos", "tienen"], ger: "teniendo", part: "tenido" } },
    { id: "v_gracias", es: "gracias", en: "thank you", pos: "interj" },
    { id: "v_donde", es: "dónde", en: "where", pos: "adv" },
    { id: "v_por", es: "por", en: "for, by", pos: "prep" },
    { id: "v_pero", es: "pero", en: "but", pos: "conj" },
    { id: "v_perro", es: "perro", en: "dog", pos: "noun", gender: "m", article: "el", plural: "perros" },
  ];
  const G = window.Grader;
  const lex = G.buildLexicon(V, []);
  const O = { lexicon: lex };
  const results = [];
  function test(name, fn) {
    try { const r = fn(); results.push({ name, ok: true, info: r || "" }); }
    catch (e) { results.push({ name, ok: false, info: e.message }); }
  }
  function expect(cond, msg) { if (!cond) throw new Error(msg); }
  const notesText = (r) => r.notes.map((n) => n.html.replace(/<[^>]+>/g, "")).join(" | ");
  const show = (r) => `${r.outcome} ${r.score} :: ${notesText(r)} :: ${r.tokens.map((t) => t.text + "/" + t.mark).join(" ")}`;

  test("accent-only difference → good + accent note", () => {
    const r = G.gradeAnswer("donde esta el bano", ["¿Dónde está el baño?"], O);
    expect(r.outcome === "good", show(r));
    expect(r.notes.some((n) => n.kind === "accent" && /está/.test(n.html)), "no accent note: " + show(r));
    return show(r);
  });
  test("punctuation/case/¿¡ ignored → good with no notes", () => {
    const r = G.gradeAnswer("  DONDE ESTÁ el BAÑO ", ["¿Dónde está el baño?"], O);
    expect(r.outcome === "good" && r.score > 0.9, show(r));
    return show(r);
  });
  test("one-letter typo → good + typo note", () => {
    const r = G.gradeAnswer("grasias", ["gracias"], O);
    expect(r.outcome === "good", show(r));
    expect(r.notes.some((n) => n.kind === "typo"), "no typo note: " + show(r));
    return show(r);
  });
  test("transposed letters (gracais) → good", () => {
    const r = G.gradeAnswer("muchas gracais", ["muchas gracias"], O);
    expect(r.outcome === "good", show(r));
    return show(r);
  });
  test("'el casa' (item) → remembered, gender grammar note", () => {
    const r = G.gradeAnswer("el casa", ["la casa"], O);
    expect(r.outcome === "good", show(r));
    expect(r.tokens[0].mark === "grammar", "el not marked grammar: " + show(r));
    expect(/feminine/.test(notesText(r)) && /la casa/.test(notesText(r)), "no gender explanation: " + show(r));
    return show(r);
  });
  test("'el casa' (free text) → gender note", () => {
    const r = G.gradeFree("Vivo en el casa", { targets: ["casa"] }, O);
    expect(/feminine/.test(notesText(r)), show(r));
    return show(r);
  });
  test("'la casas' → number note", () => {
    const r = G.gradeAnswer("la casas", ["las casas"], O);
    expect(r.outcome === "good", show(r));
    expect(/plural/.test(notesText(r)) && /las casas/.test(notesText(r)), show(r));
    const f = G.gradeFree("la casas son bonitas", {}, O);
    expect(/plural/.test(notesText(f)), "free: " + show(f));
    return show(r) + "  ||  " + show(f);
  });
  test("'hablas' vs 'habla' → person note (tú vs usted)", () => {
    const r = G.gradeAnswer("¿Hablas inglés?", ["¿Habla inglés?"], O);
    expect(r.outcome === "good", show(r));
    const t = notesText(r);
    expect(/hablas/.test(t) && /\(tú\)/.test(t) && /habla /.test(t) && /usted/.test(t), show(r));
    return show(r);
  });
  test("adjective agreement 'la casa bonito' → note", () => {
    const r = G.gradeAnswer("la casa bonito", ["la casa bonita"], O);
    expect(r.outcome === "good" && /feminine/.test(notesText(r)), show(r));
    const f = G.gradeFree("La casa es muy bonito.", {}, O);
    expect(/bonita/.test(notesText(f)), "free: " + show(f));
    return show(r) + "  ||  " + show(f);
  });
  test("missing content word → close", () => {
    const r = G.gradeAnswer("quiero un por favor", ["quiero un café por favor"], O);
    expect(r.outcome === "close", show(r));
    expect(r.tokens.some((t) => t.mark === "missing" && /café/.test(t.text)), "café not marked missing: " + show(r));
    return show(r);
  });
  test("missing article only → still good, with reminder", () => {
    const r = G.gradeAnswer("quiero café por favor", ["quiero un café por favor"], O);
    expect(r.outcome === "good", show(r));
    return show(r);
  });
  test("nonsense → miss", () => {
    const r = G.gradeAnswer("xyz blorp", ["¿Dónde está el baño?"], O);
    expect(r.outcome === "miss", show(r));
    const r2 = G.gradeAnswer("perro", ["gracias"], O);
    expect(r2.outcome === "miss", show(r2));
    return show(r);
  });
  test("empty answer → miss", () => {
    const r = G.gradeAnswer("", ["gracias"], O);
    expect(r.outcome === "miss", show(r));
  });
  test("'yo gusto tacos' → me gustan note", () => {
    const r = G.gradeFree("Yo gusto tacos", { targets: ["tacos"] }, O);
    expect(/me gustan/.test(notesText(r)), show(r));
    const r2 = G.gradeAnswer("yo gusto los tacos", ["me gustan los tacos"], O);
    expect(/me gustan/.test(notesText(r2)), "item: " + show(r2));
    return show(r) + "  ||  " + show(r2);
  });
  test("'tres taco' → plural note, still good", () => {
    const r = G.gradeFree("Quiero tres taco al pastor y una coca por favor", { targets: ["tres", "tacos", "pastor"] }, O);
    expect(/tres tacos/.test(notesText(r)), show(r));
    const r2 = G.gradeFree("Quiero dos cervezas", {}, O);
    expect(!/plural/.test(notesText(r2)), "no false flag: " + show(r2));
    return show(r);
  });
  test("'soy 30 años' → tener note", () => {
    const r = G.gradeFree("Soy 30 años", {}, O);
    expect(/tengo 30 años/.test(notesText(r)), show(r));
    return show(r);
  });
  test("'es en' location → estar note", () => {
    const r = G.gradeFree("El hotel es en el centro", {}, O);
    expect(/estar/.test(notesText(r)) && /está en/.test(notesText(r)), show(r));
    return show(r);
  });
  test("'voy comer' → ir a + infinitive note", () => {
    const r = G.gradeFree("Mañana voy comer tacos", {}, O);
    expect(/voy a comer/.test(notesText(r)), show(r));
    return show(r);
  });
  test("subject pronoun – verb person ('yo quiere') → note", () => {
    const r = G.gradeFree("Yo quiere tres tacos", {}, O);
    expect(/quiero/.test(notesText(r)), show(r));
    const ok = G.gradeFree("Yo quiero tres tacos", {}, O);
    expect(!ok.notes.length, "false positive: " + show(ok));
    return show(r);
  });
  test("prompt targets with typos counted (lemma-aware)", () => {
    const r = G.gradeFree("Kiero tres tacos al pastr y una coca por favr", { targets: ["quiero", "tres", "tacos", "pastor", "por favor"] }, O);
    expect(r.targets.hit.length === 5, "hit " + r.targets.hit.join(",") + " / " + show(r));
    expect(r.outcome === "good", show(r));
    const r2 = G.gradeFree("Quiere un taco", { targets: ["querer", "tres", "tacos", "pastor"] }, O);
    expect(r2.targets.hit.includes("querer") && r2.targets.hit.includes("tacos"), "lemma: " + r2.targets.hit.join(","));
    expect(r2.outcome === "close", show(r2));
    return show(r) + "  ||  " + show(r2);
  });
  test("correct free text → no false grammar notes", () => {
    const r = G.gradeFree("Me gustan los tacos. La casa es bonita. El agua está fría. Tengo 30 años. Voy a comer.", {}, O);
    expect(!r.notes.some((n) => n.kind === "grammar"), show(r));
    return show(r);
  });
  test("'el agua' accepted (feminine noun with el)", () => {
    const r = G.gradeFree("Quiero el agua", {}, O);
    expect(!r.notes.length, show(r));
  });
  test("English recognition: 'house' for 'house, home'; 'the bill' vs 'bill'", () => {
    const r = G.gradeAnswer("house", ["house, home"], { lang: "en" });
    expect(r.outcome === "good", show(r));
    const r2 = G.gradeAnswer("bill", ["the bill"], { lang: "en" });
    expect(r2.outcome === "good", show(r2));
    const r3 = G.gradeAnswer("speak", ["to speak (talk)"], { lang: "en" });
    expect(r3.outcome === "good", show(r3));
  });
  test("digits accepted for number words", () => {
    const r = G.gradeAnswer("3 tacos", ["tres tacos"], O);
    expect(r.outcome === "good", show(r));
  });
  test("different tense → right verb, tense note", () => {
    const r = G.gradeAnswer("hablé inglés", ["hablo inglés"], O);
    expect(r.outcome === "good" && /tense/.test(notesText(r)), show(r));
    return show(r);
  });
  test("similar real word typed (perro for pero) → typo with warning", () => {
    const r = G.gradeAnswer("perro", ["pero"], O);
    expect(r.outcome === "good" && /different word/.test(notesText(r)), show(r));
    return show(r);
  });

  test("'yo llamo Matt' -> me llamo note; partial phrase target counts", () => {
    const r = G.gradeFree("Hola, yo llamo Matt", { targets: ["hola", "me llamo"] }, O);
    expect(/me llamo Matt/i.test(notesText(r)), show(r));
    expect(r.targets.hit.length === 2 && r.outcome === "good", "partial target not counted: " + show(r));
    const ok = G.gradeFree("Me llamo Matt", { targets: ["me llamo"] }, O);
    expect(!ok.notes.length, "false positive: " + show(ok));
    return show(r);
  });

  window.__graderResults = results;
  window.__renderGraderResults = function () {
  const results = window.__graderResults;
  const pass = results.filter((r) => r.ok).length;
  const out = document.getElementById("out");
  if (out) {
    out.innerHTML = `<h2 id="summary">${pass}/${results.length} passed</h2>` + results.map((r) =>
      `<div class="${r.ok ? "pass" : "fail"}"><b>${r.ok ? "PASS" : "FAIL"}</b> ${r.name}<br><small>${String(r.info).replace(/</g, "&lt;")}</small></div>`).join("");
    document.title = `grader ${pass}/${results.length}`;
  }
  };
  if (!window.__deferRender) window.__renderGraderResults();
})();
