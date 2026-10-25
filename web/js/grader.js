/* Lenient grader for Learning Spanish with Penguin (docs/CONTRACT.md "Grading philosophy").
 * Pure functions, no DOM. Exposes window.Grader (and module.exports when available).
 *
 *   Grader.buildLexicon(vocab)                      -> lexicon (form -> entries) from COURSE.vocab
 *   Grader.gradeAnswer(input, accepted, opts)       -> item grading against one or more accepted answers
 *   Grader.gradeFree(text, {targets, models}, opts) -> free text (prompts / stories): target coverage + rule checks
 *   Grader.normalize / fold / tokenize / levenshtein  (helpers)
 *
 * Result: {outcome: "good"|"close"|"miss", score: 0..1, tokens: [{text, mark, expected?, note?}],
 *          notes: [{kind, html}], expected, coverage?, targets?}
 * marks: ok | typo | accent | grammar | missing | extra | wrong
 */
(function (root) {
  "use strict";

  // ------------------------------------------------------------------ text helpers
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const em = (s) => "<em>" + esc(s) + "</em>";

  function fold(s) {             // lowercase + strip diacritics (á→a, ñ→n, ü→u)
    return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  }
  function normalize(s) {        // case, ¿¡ and punctuation, whitespace (keeps accents)
    return String(s || "").toLowerCase()
      .replace(/[’'`´]/g, "")
      .replace(/[¿¡?!.,;:"“”«»()\[\]{}…\-–—_/\\*]+/g, " ")
      .replace(/\s+/g, " ").trim();
  }
  function tokenize(s) {
    const str = String(s || "").replace(/[’'`´]/g, "");
    const re = /[\p{L}\p{N}]+/gu;
    const out = [];
    let m, prevEnd = 0;
    while ((m = re.exec(str))) {
      if (out.length) out[out.length - 1].brk = /[.,;:!?¿¡…—–()"“”«»\[\]]/.test(str.slice(prevEnd, m.index));
      const n = m[0].toLowerCase();
      out.push({ raw: m[0], n, f: fold(n), cap: /^\p{Lu}/u.test(m[0]), brk: false });
      prevEnd = m.index + m[0].length;
    }
    if (out.length) out[out.length - 1].brk = true;
    return out;
  }
  function levenshtein(a, b) {   // optimal string alignment (adjacent transposition = 1)
    a = String(a); b = String(b);
    const m = a.length, n = b.length;
    if (!m) return n; if (!n) return m;
    const d = [];
    for (let i = 0; i <= m; i++) { d[i] = [i]; }
    for (let j = 0; j <= n; j++) d[0][j] = j;
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        const c = a[i - 1] === b[j - 1] ? 0 : 1;
        let v = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + c);
        if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, d[i - 2][j - 2] + 1);
        d[i][j] = v;
      }
    }
    return d[m][n];
  }
  function typoTol(word) {       // ≤1 for words ≤5 letters, ≤2 for longer; 1–2 letter words must be exact
    const L = word.length;
    return L <= 2 ? 0 : L <= 5 ? 1 : 2;
  }
  function isTypo(u, e) { return u !== e && levenshtein(u, e) <= typoTol(e); }

  // ------------------------------------------------------------------ built-in function words
  const PERSONS = ["1s", "2s", "3s", "1p", "3p"];
  const PERSON_LABEL = { "1s": "yo", "2s": "tú", "3s": "usted/él/ella", "1p": "nosotros", "3p": "ustedes/ellos",
    inf: "infinitive", ger: "-ando/-iendo form", part: "past participle", cmd: "command" };
  const TENSE_LABEL = { pres: "present", pret: "preterite past", imp: "imperfect past", fut: "future",
    subj: "subjunctive", cmd: "command", inf: "infinitive", ger: "gerund", part: "participle" };
  // [form, family, gender, number]
  const DETS = [
    ["el", "el", "m", "s"], ["la", "el", "f", "s"], ["los", "el", "m", "p"], ["las", "el", "f", "p"],
    ["un", "un", "m", "s"], ["una", "un", "f", "s"], ["unos", "un", "m", "p"], ["unas", "un", "f", "p"],
    ["este", "este", "m", "s"], ["esta", "este", "f", "s"], ["estos", "este", "m", "p"], ["estas", "este", "f", "p"],
    ["ese", "ese", "m", "s"], ["esa", "ese", "f", "s"], ["esos", "ese", "m", "p"], ["esas", "ese", "f", "p"],
    ["aquel", "aquel", "m", "s"], ["aquella", "aquel", "f", "s"], ["aquellos", "aquel", "m", "p"], ["aquellas", "aquel", "f", "p"],
    ["mi", "mi", "mf", "s"], ["mis", "mi", "mf", "p"], ["tu", "tu", "mf", "s"], ["tus", "tu", "mf", "p"],
    ["su", "su", "mf", "s"], ["sus", "su", "mf", "p"],
    ["nuestro", "nuestro", "m", "s"], ["nuestra", "nuestro", "f", "s"], ["nuestros", "nuestro", "m", "p"], ["nuestras", "nuestro", "f", "p"],
    ["mucho", "mucho", "m", "s"], ["mucha", "mucho", "f", "s"], ["muchos", "mucho", "m", "p"], ["muchas", "mucho", "f", "p"],
    ["otro", "otro", "m", "s"], ["otra", "otro", "f", "s"], ["otros", "otro", "m", "p"], ["otras", "otro", "f", "p"],
    ["poco", "poco", "m", "s"], ["poca", "poco", "f", "s"], ["pocos", "poco", "m", "p"], ["pocas", "poco", "f", "p"],
    ["todo", "todo", "m", "s"], ["toda", "todo", "f", "s"], ["todos", "todo", "m", "p"], ["todas", "todo", "f", "p"],
    ["algún", "alguno", "m", "s"], ["alguna", "alguno", "f", "s"], ["algunos", "alguno", "m", "p"], ["algunas", "alguno", "f", "p"],
    ["ningún", "ninguno", "m", "s"], ["ninguna", "ninguno", "f", "s"],
    ["cuánto", "cuánto", "m", "s"], ["cuánta", "cuánto", "f", "s"], ["cuántos", "cuánto", "m", "p"], ["cuántas", "cuánto", "f", "p"],
    ["del", "el", "m", "s"], ["al", "el", "m", "s"],
  ];
  // Determiners that can also be pronouns are only checked when followed by a noun.
  const SUBJ = { yo: "1s", "tú": "2s", "él": "3s", ella: "3s", usted: "3s", nosotros: "1p", nosotras: "1p",
    ellos: "3p", ellas: "3p", ustedes: "3p" };
  const FUNCTION_WORDS = new Set(("el la los las un una unos unas lo de del a al en y e o u que por para con sin " +
    "the a an to of and").split(" "));
  const EN_STOP = new Set("the a an to of".split(" "));
  const CLITICS = new Set("me te se lo la le nos les los las no ya también tambien siempre nunca".split(" "));
  const NUMWORDS = { cero: 0, uno: 1, un: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8,
    nueve: 9, diez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17,
    dieciocho: 18, diecinueve: 19, veinte: 20, veintiuno: 21, veintidos: 22, treinta: 30, cuarenta: 40, cincuenta: 50,
    sesenta: 60, setenta: 70, ochenta: 80, noventa: 90, cien: 100, ciento: 100 };
  const SER = new Set(["soy", "eres", "es", "somos", "son"]);
  const COPULA = new Set(["es", "son", "era", "eran", "está", "están", "esta", "estan", "estaba", "estaban", "fue", "parece", "se ve"]);
  const INTENS = new Set(["muy", "tan", "bien", "más", "mas", "bastante", "super", "súper", "medio", "un poco", "algo"]);

  // ------------------------------------------------------------------ lexicon
  function derivePlural(w) {
    if (!w) return w;
    if (/[aeiouáéó]$/.test(w)) return w + "s";
    if (/z$/.test(w)) return w.slice(0, -1) + "ces";
    if (/[íú]$/.test(w)) return w + "es";
    // drop written accent on -ón/-és/-án endings when adding a syllable (inglés → ingleses)
    return w.replace(/ó(n)$/, "o$1").replace(/é(s)$/, "e$1").replace(/á(n)$/, "a$1") + "es";
  }

  function buildLexicon(vocab, chunks) {
    const forms = new Map();      // folded form -> [entry]
    const lemmas = new Map();     // lemma id -> {id, es, en, pos, gender, article, forms: [entries]}
    const add = (form, e) => {
      if (!form || typeof form !== "string") return;
      const n = normalize(form);
      if (!n || n.includes(" ")) {
        // multi-word forms (e.g. reflexive "me llamo") are indexed by their last word
        if (!n) return;
      }
      const key = fold(n.includes(" ") ? n.split(" ").pop() : n);
      const entry = Object.assign({ form: n.includes(" ") ? n.split(" ").pop() : n }, e);
      if (!forms.has(key)) forms.set(key, []);
      const list = forms.get(key);
      if (!list.some((x) => x.lemma === entry.lemma && x.form === entry.form && x.person === entry.person &&
          x.tense === entry.tense && x.gender === entry.gender && x.number === entry.number && x.pos === entry.pos)) list.push(entry);
      if (lemmas.has(entry.lemma)) lemmas.get(entry.lemma).forms.push(entry);
    };
    for (const [form, fam, g, num] of DETS) {
      if (!lemmas.has("det_" + fam)) lemmas.set("det_" + fam, { id: "det_" + fam, es: fam, pos: "det", forms: [] });
      add(form, { lemma: "det_" + fam, pos: "det", gender: g, number: num });
    }
    for (const [p, per] of Object.entries(SUBJ)) {
      if (!lemmas.has("pron_" + p)) lemmas.set("pron_" + p, { id: "pron_" + p, es: p, pos: "pron", forms: [] });
      add(p, { lemma: "pron_" + p, pos: "pron", person: per, subject: true });
    }
    for (const v of vocab || []) {
      if (!v || !v.id || !v.es) continue;
      const L = { id: v.id, es: v.es, en: v.en, pos: v.pos, gender: v.gender, article: v.article, forms: [] };
      lemmas.set(v.id, L);
      const base = { lemma: v.id, pos: v.pos };
      if (v.pos === "noun") {
        add(v.es, Object.assign({}, base, { gender: v.gender || "m", number: "s", article: v.article }));
        if (v.plural && v.plural !== v.es) add(v.plural, Object.assign({}, base, { gender: v.gender || "m", number: "p" }));
        else if (v.plural === v.es) add(v.es, Object.assign({}, base, { gender: v.gender || "m", number: "p" }));
      } else if (v.pos === "adj" || (v.pos === "det" && (v.fem || v.plural))) {
        const fem = v.fem || null;
        const inv = !fem || fem === v.es;
        if (inv && v.fem === undefined && !v.plural) {
          add(v.es, Object.assign({}, base, { gender: "mf", number: "s" }));
        } else {
          add(v.es, Object.assign({}, base, { gender: inv ? "mf" : "m", number: "s" }));
          const mp = v.plural || derivePlural(v.es);
          add(mp, Object.assign({}, base, { gender: inv ? "mf" : "m", number: "p" }));
          if (!inv) {
            add(fem, Object.assign({}, base, { gender: "f", number: "s" }));
            add(derivePlural(fem), Object.assign({}, base, { gender: "f", number: "p" }));
          }
        }
      } else if (v.pos === "verb") {
        const inf = v.es.replace(/se$/, (m) => (/(ar|er|ir)se$/.test(v.es) ? "" : m));
        add(v.es, Object.assign({}, base, { person: "inf", tense: "inf" }));
        if (inf !== v.es) add(inf, Object.assign({}, base, { person: "inf", tense: "inf" }));
        const c = v.conj || {};
        for (const t of ["pres", "pret", "imp", "fut", "subj", "cond"]) {
          if (!Array.isArray(c[t])) continue;
          c[t].forEach((f, i) => add(f, Object.assign({}, base, { person: PERSONS[i], tense: t })));
        }
        if (c.cmd && typeof c.cmd === "object") {
          if (c.cmd.tu) add(c.cmd.tu, Object.assign({}, base, { person: "2s", tense: "cmd" }));
          if (c.cmd.usted) add(c.cmd.usted, Object.assign({}, base, { person: "3s", tense: "cmd" }));
          if (c.cmd.ustedes) add(c.cmd.ustedes, Object.assign({}, base, { person: "3p", tense: "cmd" }));
        }
        if (c.ger) add(c.ger, Object.assign({}, base, { person: "ger", tense: "ger" }));
        if (c.part) add(c.part, Object.assign({}, base, { person: "part", tense: "part" }));
      } else {
        add(v.es, Object.assign({}, base));
        if (v.plural) add(v.plural, Object.assign({}, base, { number: "p" }));
        if (v.fem) add(v.fem, Object.assign({}, base, { gender: "f" }));
      }
    }
    for (const c of chunks || []) {
      if (c && c.id && c.es) lemmas.set(c.id, { id: c.id, es: c.es, en: c.en, pos: "chunk", forms: [] });
    }
    return { forms, lemmas };
  }

  let _defaultLex = null;
  function defaultLexicon() {
    if (_defaultLex) return _defaultLex;
    const C = (typeof window !== "undefined" && window.COURSE) || null;
    _defaultLex = buildLexicon(C ? C.vocab : [], C ? C.chunks : []);
    return _defaultLex;
  }
  const look = (lex, w) => (lex && lex.forms.get(fold(w))) || [];
  const lemmaOf = (lex, id) => lex && lex.lemmas.get(id);

  // ------------------------------------------------------------------ word comparison
  // compare user word u against expected word e -> {mark, cost, credit, note?}
  function compareWords(u, e, lex, ctx) {
    if (u.n === e.n) return { mark: "ok", cost: 0, credit: 1 };
    if (/^\d+$/.test(u.n) && NUMWORDS[e.f] === +u.n) return { mark: "ok", cost: 0, credit: 1 };
    if (/^\d+$/.test(e.n) && NUMWORDS[u.f] === +e.n) return { mark: "ok", cost: 0, credit: 1 };
    if (u.f === e.f) return { mark: "accent", cost: 0.1, credit: 1, note: { kind: "accent", word: e.raw.toLowerCase() } };
    if (lex) {
      const gu = look(lex, u.f), ge = look(lex, e.f);
      for (const a of gu) for (const b of ge) {
        if (a.lemma === b.lemma && a.form !== b.form) {
          return { mark: "grammar", cost: 0.3, credit: 0.85, note: { kind: "grammar", u: a, e: b, uRaw: u.raw, eRaw: e.raw, ctx } };
        }
      }
      // typed a typo of another form of the expected lemma (e.g. "hablass" for "habla")
      if (ge.length) {
        const lem = lemmaOf(lex, ge[0].lemma);
        if (lem && u.f.length > 3) {
          for (const f of lem.forms) {
            if (fold(f.form) !== e.f && isTypo(u.f, fold(f.form)) && !isTypo(u.f, e.f)) {
              return { mark: "grammar", cost: 0.35, credit: 0.8, note: { kind: "grammar", u: f, e: ge[0], uRaw: u.raw, eRaw: e.raw, ctx } };
            }
          }
        }
      }
    }
    if (isTypo(u.f, e.f)) {
      const other = lex ? look(lex, u.f).filter((x) => !look(lex, e.f).some((y) => y.lemma === x.lemma)) : [];
      const otherL = other.length ? lemmaOf(lex, other[0].lemma) : null;
      return { mark: "typo", cost: 0.4, credit: 0.9,
        note: { kind: "typo", u: u.raw, e: e.raw, other: otherL && otherL.en ? { es: u.n, en: otherL.en } : null } };
    }
    return { mark: "wrong", cost: 1, credit: 0 };
  }

  // word-level alignment (DP) of user tokens to expected tokens
  function align(ut, et, lex) {
    const m = ut.length, n = et.length;
    const D = [], B = [], C = [];
    for (let i = 0; i <= m; i++) { D[i] = new Array(n + 1).fill(0); B[i] = new Array(n + 1).fill(null); C[i] = new Array(n + 1).fill(null); }
    for (let i = 1; i <= m; i++) { D[i][0] = i * 0.9; B[i][0] = "x"; }
    for (let j = 1; j <= n; j++) { D[0][j] = j; B[0][j] = "m"; }
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        const cmp = compareWords(ut[i - 1], et[j - 1], lex, { et, j: j - 1 });
        C[i][j] = cmp;
        const sub = D[i - 1][j - 1] + (cmp.mark === "wrong" ? 1.6 : cmp.cost);
        const del = D[i][j - 1] + 1;        // expected word missing
        const ins = D[i - 1][j] + 0.9;      // extra user word
        let best = sub, b = "s";
        if (del < best) { best = del; b = "m"; }
        if (ins < best) { best = ins; b = "x"; }
        D[i][j] = best; B[i][j] = b;
      }
    }
    const ops = [];
    let i = m, j = n;
    while (i > 0 || j > 0) {
      const b = B[i][j];
      if (b === "s") { ops.push({ op: "s", u: ut[i - 1], e: et[j - 1], cmp: C[i][j], j: j - 1 }); i--; j--; }
      else if (b === "m") { ops.push({ op: "m", e: et[j - 1], j: j - 1 }); j--; }
      else { ops.push({ op: "x", u: ut[i - 1] }); i--; }
    }
    return ops.reverse();
  }

  // ------------------------------------------------------------------ explanations
  function nounNear(lex, toks, j, dir) {
    // nearest noun after (dir=1) or before (dir=-1) index j in token list
    for (let k = j + dir, steps = 0; k >= 0 && k < toks.length && steps < 3; k += dir, steps++) {
      const ns = look(lex, toks[k].f).filter((x) => x.pos === "noun");
      if (ns.length) return { tok: toks[k], entry: ns[0] };
    }
    return null;
  }
  const GEN = { m: "masculine", f: "feminine" };
  const NUM = { s: "singular", p: "plural" };

  function explainGrammar(note, lex) {
    const { u, e, uRaw, eRaw, ctx } = note;
    const U = em(String(uRaw).toLowerCase()), E = em(String(eRaw).toLowerCase());
    if (u.person && e.person && (u.person !== e.person || u.tense !== e.tense) && (u.tense || e.tense)) {
      if (u.tense !== e.tense && u.person === e.person) {
        return `Right verb, different tense: you wrote ${U} (${TENSE_LABEL[u.tense] || u.tense}) — here it's ${E} (${TENSE_LABEL[e.tense] || e.tense}).`;
      }
      const lab = (x) => (x.tense === "inf" || x.tense === "ger" || x.tense === "part") ? PERSON_LABEL[x.person] :
        PERSON_LABEL[x.person] + (x.tense && x.tense !== "pres" ? ", " + (TENSE_LABEL[x.tense] || x.tense) : "");
      let subj = "";
      if (ctx && ctx.et) {
        for (const t of ctx.et) if (SUBJ[t.n] && SUBJ[t.n] === e.person) subj = t.n;
      }
      const eLab = subj ? subj : lab(e);
      return `Right verb, wrong person: you wrote ${U} (${lab(u)}) — here it's ${E} (${eLab}).`;
    }
    const pos = e.pos || u.pos;
    const gDiff = u.gender && e.gender && u.gender !== e.gender && u.gender !== "mf" && e.gender !== "mf";
    const nDiff = u.number && e.number && u.number !== e.number;
    if (pos === "det" && lex && ctx && ctx.et) {
      const nn = nounNear(lex, ctx.et, ctx.j, 1);
      if (nn) {
        const nw = em(nn.tok.n);
        if (nDiff && !gDiff) return `${nw} is ${NUM[nn.entry.number] || "plural"} → ${E} ${nw}.`;
        if (gDiff) return `${nw} is ${GEN[nn.entry.gender] || "feminine"}${nn.entry.number === "p" ? " plural" : ""} → ${E} ${nw}, not ${U}.`;
      }
      if (gDiff) return `Gender slip: ${E} (${GEN[e.gender]}), not ${U}.`;
      if (nDiff) return `Number slip: ${E} (${NUM[e.number]}), not ${U}.`;
    }
    if (pos === "adj" && lex && ctx && ctx.et) {
      const nn = nounNear(lex, ctx.et, ctx.j, -1) || nounNear(lex, ctx.et, ctx.j, 1);
      if (nn) {
        const nw = em(nn.tok.n);
        const what = [gDiff || nn.entry.gender ? GEN[nn.entry.gender] : "", nDiff || nn.entry.number === "p" ? NUM[nn.entry.number] : ""].filter(Boolean).join(" ");
        return `Adjectives match their noun: ${nw} is ${what || "like this"} → ${E}, not ${U}.`;
      }
      if (gDiff) return `Adjective ending: ${E} (${GEN[e.gender]}), not ${U}.`;
      if (nDiff) return `Adjective ending: ${E} (${NUM[e.number]}), not ${U}.`;
    }
    if (pos === "noun") {
      if (nDiff) return `Singular vs plural: here it's ${E} (${NUM[e.number]}), you wrote ${U}.`;
    }
    if (gDiff) return `Gender slip: ${E} (${GEN[e.gender]}), not ${U}.`;
    if (nDiff) return `Number slip: ${E} (${NUM[e.number]}), not ${U}.`;
    return `Right word, slightly different form: ${E} (you wrote ${U}).`;
  }

  function finishNotes(raw, lex) {
    const out = [], seen = new Set();
    const accents = [];
    for (const n of raw) {
      let html = null, kind = n.kind;
      if (n.kind === "accent") { if (!accents.includes(n.word)) accents.push(n.word); continue; }
      if (n.kind === "typo") {
        html = `Small typo: ${em(String(n.u).toLowerCase())} → ${em(String(n.e).toLowerCase())}.` +
          (n.other ? ` (Careful: ${em(n.other.es)} is a different word — “${esc(n.other.en)}”.)` : "");
      } else if (n.kind === "grammar" && !n.html) html = explainGrammar(n, lex);
      else html = n.html;
      if (html && !seen.has(html)) { seen.add(html); out.push({ kind, html }); }
    }
    if (accents.length) out.unshift({ kind: "accent", html: "Watch the accent" + (accents.length > 1 ? "s" : "") + ": " + accents.map(em).join(", ") + "." });
    return out;
  }

  // ------------------------------------------------------------------ rule checks on the learner's own text
  function ruleChecks(toks, lex) {
    const notes = [], marks = {};   // marks: token index -> "grammar"
    const flag = (i, html, key) => { marks[i] = "grammar"; notes.push({ kind: "grammar", html, key }); };
    const W = toks.map((t) => t.n);
    const isNum = (w) => /^\d+$/.test(w) || NUMWORDS[fold(w)] !== undefined;
    const accentOk = (w, x) => !/[áéíóúü]/.test(w) || /[áéíóúü]/.test(x.form) || x.form === w;
    const L = (k) => (k >= 0 && k < W.length ? look(lex, W[k]).filter((x) => accentOk(W[k], x)) : []);
    const brkBetween = (a, b) => toks.slice(a, b).some((t) => t.brk);
    const PREPS = new Set("de del a al en con por para sin sobre entre hacia hasta desde".split(" "));
    const EVENTS = /^(boda|fiesta|concierto|reunion|cumpleanos|clase|partido|misa|cita|junta|evento|elecciones|desfile|ceremonia|examen|show|funcion|cena|comida|desayuno|vuelo|posada|carrera|feria|festival|cumple|graduacion|velorio|entierro)$/;
    const TIMEWORDS = /^(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre|lunes|martes|miercoles|jueves|viernes|sabado|domingo|punto|total|efectivo|pesos|dolares|serio|realidad|general|defensa|broma|vivo|persona)$/;
    const verbEntries = (w) => look(lex, w).filter((x) => x.pos === "verb" && accentOk(w, x));

    for (let i = 0; i < toks.length; i++) {
      const w = W[i], f = toks[i].f, next = W[i + 1], next2 = W[i + 2];
      // --- common learner errors ---------------------------------------------
      if (w === "yo" && /^gust(o|a|an)$/.test(next || "")) {
        const obj = W.slice(i + 2).find((x) => look(lex, x).some((e) => e.pos === "noun")) || "";
        const pl = obj && look(lex, obj).some((e) => e.pos === "noun" && e.number === "p");
        const fix = pl ? "me gustan" : "me gusta";
        flag(i + 1, `Spanish says it the other way round: ${em(fix)} (“it pleases me”), not ${em("yo " + next)}.` +
          (obj ? ` → ${em(fix + " " + (look(lex, obj).some((e) => e.pos === "noun" && e.gender === "f") ? (pl ? "las " : "la ") : (pl ? "los " : "el ")) + obj)}` : ""), "gustar");
      }
      if (w === "llamo" && (i === 0 || !CLITICS.has(W[i - 1]) || W[i - 1] === "no") && next && !/^(a|al|por|para|de|en|un|una|el|la|ahora|mañana|luego)$/.test(next)) {
        flag(i, `To give your name: ${em("me llamo " + next)} (literally “I call myself”).`, "llamarse");
      }
      if (w === "yo" && next === "me" && /^gust/.test(next2 || "")) {
        flag(i, `With gustar you don't need ${em("yo")}: just ${em("me gusta…")} (or ${em("a mí me gusta…")} for emphasis).`, "gustar2");
      }
      if (i === 0 && w === "gusto" && next && !/^(en|conocer|de)/.test(next)) {
        flag(i, `To say you like something: ${em("me gusta")} / ${em("me gustan")} + the thing.`, "gustar");
      }
      if (SER.has(w) && next && isNum(next) && /^anos?$/.test(fold(next2 || ""))) {
        flag(i, `Age uses ${em("tener")}: ${em("tengo " + next + " años")} (literally “I have … years”).`, "age");
      }
      if (["estoy", "esta", "está"].includes(w) && next && isNum(next) && /^anos?$/.test(fold(next2 || ""))) {
        flag(i, `Age uses ${em("tener")}: ${em("tengo " + next + " años")}.`, "age");
      }
      if (SER.has(w) && next && /^(en|aqui|alli|ahi|alla|aca|cerca|lejos)$/.test(fold(next)) &&
          !/^(cuanto|cuanta|cuantos|cuantas|cuando|que|como)$/.test(fold(W[i - 1] || "")) && !TIMEWORDS.test(fold(next2 || "")) && !/^(manana|tarde|noche|madrugada|semana|ano|mes)$/.test(fold(W[i + 3] || "")) &&
          !W.slice(Math.max(0, i - 3), i).some((x) => EVENTS.test(fold(x))) && i > 0) {
        const est = { soy: "estoy", eres: "estás", es: "está", somos: "estamos", son: "están" }[w];
        flag(i, `For where something or someone is, use ${em("estar")}: ${em(est + " " + next + "…")}` +
          (fold(next) === "en" ? ` (Events are the exception: ${em("la fiesta es en mi casa")}.)` : ""), "location");
      }
      if (/^(voy|vas|va|vamos|van)$/.test(w) && next && next !== "a" && next !== "al") {
        const inf = verbEntries(next).some((x) => x.tense === "inf") || (/(ar|er|ir)$/.test(next) && !look(lex, next).some((x) => x.pos === "noun"));
        if (inf) flag(i, `${em("ir a")} + infinitive needs the ${em("a")}: ${em(w + " a " + next)}.`, "ira");
      }
      // --- number word + noun: "tres taco" → "tres tacos" -------------------------
      const count = /^\d+$/.test(w) ? +w : NUMWORDS[f];
      if (count > 1 && next && !toks[i].brk && !/^anos?$/.test(fold(next))) {
        const ns = L(i + 1).filter((x) => x.pos === "noun");
        if (ns.length && ns.every((x) => x.number === "s")) {
          const lem = lemmaOf(lex, ns[0].lemma);
          const pl = lem ? lem.forms.find((x) => x.number === "p" && x.pos === "noun") : null;
          if (pl && pl.form !== next) flag(i + 1, `More than one → plural: ${em(w + " " + pl.form)}, not ${em(w + " " + next)}.`, "numpl" + i);
        }
      }
      // --- determiner–noun agreement (built-in determiners only) ---------------
      const dets = L(i).filter((x) => x.pos === "det" && x.gender && String(x.lemma).startsWith("det_"));
      if (dets.length && next && !toks[i].brk) {
        let k = i + 1;
        // allow one adjective between (e.g. "una buena idea") when the next word isn't a noun
        let nouns = L(k).filter((x) => x.pos === "noun");
        if (!nouns.length && W[k + 1] && !toks[k].brk && L(k).some((x) => x.pos === "adj")) { k = i + 2; nouns = L(k).filter((x) => x.pos === "noun"); }
        const isVerb = L(k).some((x) => x.pos === "verb" && x.tense !== "inf");
        const ambiguous = (isVerb && ["la", "las", "los", "lo"].includes(w)) || (toks[k] && toks[k].cap && k > 0);
        if (nouns.length && !ambiguous) {
          const ok = dets.some((d) => nouns.some((nn) => agrees(d, nn, w)));
          if (!ok) {
            const nn = nouns[0], d = dets[0];
            const want = DETS.find((x) => x[1] === famOf(d, lex) && (x[2] === nn.gender || x[2] === "mf" || nn.gender === "mf") && x[3] === nn.number);
            const fix = elAgua(nn, lex, d) || (want ? want[0] : null);
            const gBad = d.gender !== "mf" && nn.gender !== "mf" && d.gender !== nn.gender;
            const why = gBad && d.number !== nn.number ? `${GEN[nn.gender]} and ${NUM[nn.number]}` : gBad ? GEN[nn.gender] : NUM[nn.number];
            if (fix) flag(i, `${em(W[k])} is ${why} → ${em(fix + " " + W[k])}, not ${em(w + " " + W[k])}.`, "det" + i);
          }
        }
      }
      // --- noun–adjective agreement (attributive, and "the X is …") ---------------
      const nounE = CLITICS.has(w) || SUBJ[w] ? [] : L(i).filter((x) => x.pos === "noun");
      const nounIsVerbToo = L(i).some((x) => x.pos === "verb" && x.tense !== "inf") && !(i > 0 && L(i - 1).some((x) => x.pos === "det"));
      if (nounE.length && next && !nounIsVerbToo && !(toks[i].cap && i > 0)) {
        let k = i + 1, copula = null;
        if (COPULA.has(W[k])) { copula = W[k]; k++; }
        if (INTENS.has(W[k])) k++;
        const adjAll = L(k);
        const adverbish = adjAll.some((x) => x.pos === "adv" || x.pos === "noun" || (x.pos === "verb" && x.tense !== "part")) ||
          /^(derecho|bien|mal|rapido|temprano|tarde|mejor|peor|solo|mismo|demasiado|claro|bastante|igual|recto|lento|alto|bajo|fuerte|junto|rico|padre|bonito)$/.test(fold(W[k] || "")) && !copula && false;
        const adjs = adverbish ? [] : adjAll.filter((x) => x.pos === "adj");
        const followedByNoun = L(k + 1).some((x) => x.pos === "noun") && !(toks[k] && toks[k].brk);
        const copNum = copula ? (/^(son|eran|estan|están|estaban)$/.test(copula) ? "p" : "s") : null;
        // subject noun for "X es …": must start its phrase (det in front, no preposition before it)
        const subjOk = !copula || (i > 0 && L(i - 1).some((x) => x.pos === "det") && !PREPS.has(W[i - 2] || ""));
        const advAfterNoun = /^(derecho|bien|mal|rapido|temprano|tarde|mejor|peor|solo|mismo|demasiado|claro|bastante|igual|recto|junto|rico|lento|fuerte)$/.test(fold(W[k] || "")) && !copula;
        if (adjs.length && !followedByNoun && subjOk && !advAfterNoun && !brkBetween(i, k)) {
          let ng = nounE.map((x) => ({ gender: x.gender, number: x.number }));
          if (copNum) ng = ng.filter((x) => x.number === copNum);
          // mf nouns take their gender from the determiner in front ("la estudiante")
          const prevDet = i > 0 ? L(i - 1).filter((x) => x.pos === "det" && x.gender && x.gender !== "mf") : [];
          if (prevDet.length) ng = ng.map((x) => (x.gender === "mf" ? { gender: prevDet[0].gender, number: x.number } : x));
          const ok = !ng.length || adjs.some((a) => ng.some((nn) =>
            (a.gender === "mf" || nn.gender === "mf" || a.gender === nn.gender) && (!a.number || a.number === nn.number)));
          if (!ok) {
            const nn = ng[0], lem = lemmaOf(lex, adjs[0].lemma);
            const right = lem ? lem.forms.find((x) => (x.gender === nn.gender || x.gender === "mf") && x.number === nn.number) : null;
            if (right) flag(k, `Adjectives match their noun: ${em(W[i])} is ${GEN[nn.gender] || ""}${nn.number === "p" ? " plural" : ""} → ${em(right.form)}, not ${em(W[k])}.`, "adj" + k);
          }
        }
      }
      // --- subject pronoun – verb person ----------------------------------------
      let per = SUBJ[w];
      if (w === "tu" && next && verbEntries(next).length && !look(lex, next).some((x) => x.pos === "noun")) per = "2s";
      if (per && next && (W[i - 1] === "y" || W[i - 1] === "e" || W[i + 1] === "y" || toks[i].brk)) per = null;
      if (per && next) {
        let k = i + 1;
        while (k < W.length && CLITICS.has(W[k]) && k < i + 4) k++;
        const vs = verbEntries(W[k] || "");
        if (vs.length && !/^gust/.test(W[k]) && !look(lex, W[k]).some((x) => x.pos === "noun" && !vs.length)) {
          const finite = vs.filter((x) => PERSONS.includes(x.person) && x.tense !== "cmd");
          const fits = finite.some((x) => x.person === per) || vs.some((x) => x.tense === "ger" || x.tense === "part") && k > i + 1;
          if (!fits) {
            const lem = lemmaOf(lex, vs[0].lemma);
            const want = vs.find((x) => PERSONS.includes(x.person)) || null;
            const tense = want ? want.tense : "pres";
            const right = lem ? lem.forms.find((x) => x.person === per && x.tense === (tense === "inf" ? "pres" : tense)) ||
              lem.forms.find((x) => x.person === per && x.tense === "pres") : null;
            if (vs.every((x) => x.tense === "inf")) {
              flag(k, `After ${em(w)}, conjugate the verb: ${em(w + " " + (right ? right.form : "…"))}, not the infinitive ${em(W[k])}.`, "pv" + k);
            } else if (finite.length) {
              flag(k, `Right verb, wrong person: ${em(W[k])} is (${PERSON_LABEL[finite[0].person]}) — with ${em(w)} it's ${em(right ? right.form : "…")}.`, "pv" + k);
            }
          }
        }
      }
    }
    return { notes, marks };
  }
  function famOf(d) { return String(d.lemma || "").replace(/^det_/, ""); }
  function elAgua(nn, lex, d) {   // feminine nouns that take "el" (el agua, un águila)
    const L = lemmaOf(lex, nn.lemma);
    if (L && L.article === "el" && nn.gender === "f" && nn.number === "s") {
      const fam = famOf(d);
      return fam === "el" ? "el" : fam === "un" ? "un" : null;
    }
    return null;
  }
  function agrees(d, nn, w) {
    if (nn.number && d.number && d.number !== nn.number) return false;
    if (d.gender === "mf" || nn.gender === "mf" || !nn.gender) return true;
    if (d.gender === nn.gender) return true;
    // el agua / un águila: masculine article form before a feminine noun that lists article "el"
    if (nn.gender === "f" && nn.article === "el" && (w === "el" || w === "un" || w === "del" || w === "al")) return true;
    return false;
  }

  // ------------------------------------------------------------------ item grading
  function weightOf(tok, lex, lang) {
    if (lang === "en") return EN_STOP.has(tok.f) ? 0.3 : 1;
    if (FUNCTION_WORDS.has(tok.f)) return 0.4;
    const es = look(lex, tok.f);
    if (es.length && es.every((x) => x.pos === "det" || x.pos === "prep" || x.pos === "conj")) return 0.4;
    return 1;
  }

  function gradeOne(input, answer, lex, lang) {
    const ut = tokenize(input), et = tokenize(answer);
    const ops = align(ut, et, lang === "en" ? null : lex);
    const tokens = [], rawNotes = [];
    let wTot = 0, wGot = 0, contentTot = 0, contentGot = 0, fnMissing = 0, extras = 0, grammar = 0, nTot = 0, nGot = 0;
    for (const o of ops) {
      if (o.op === "s") {
        const w = weightOf(o.e, lex, lang);
        wTot += w; wGot += w * o.cmp.credit;
        const credited = o.cmp.mark !== "wrong";
        nTot++; if (credited) nGot++;
        if (w >= 1) { contentTot++; if (credited) contentGot++; } else if (!credited) fnMissing++;
        if (o.cmp.mark === "grammar") grammar++;
        tokens.push({ text: o.u.raw, mark: o.cmp.mark, expected: o.cmp.mark === "ok" ? undefined : o.e.raw });
        if (o.cmp.note) rawNotes.push(o.cmp.note);
      } else if (o.op === "m") {
        const w = weightOf(o.e, lex, lang);
        wTot += w; nTot++;
        if (w >= 1) contentTot++; else fnMissing++;
        tokens.push({ text: o.e.raw, mark: "missing" });
      } else {
        extras++;
        tokens.push({ text: o.u.raw, mark: "extra" });
      }
    }
    let score = wTot ? wGot / wTot : 0;
    score = Math.max(0, score - 0.05 * Math.max(0, extras - 1));
    const share = contentTot ? contentGot / contentTot : (nTot ? nGot / nTot : 0);
    let outcome;
    if (!ut.length) outcome = "miss";
    else if (share >= 1 && fnMissing <= Math.max(1, Math.floor(et.length / 4)) && extras <= Math.max(1, Math.floor(et.length / 3))) outcome = "good";
    else if (share >= 0.5 && score >= 0.45) outcome = "close";
    else outcome = "miss";
    if (outcome !== "good") {
      const miss = tokens.filter((t) => t.mark === "missing" || t.mark === "wrong").map((t) => t.expected || t.text);
      if (miss.length && ut.length) rawNotes.push({ kind: "missing", html: `Missing or different: ${miss.map((m) => em(String(m).toLowerCase())).join(", ")}.` });
    }
    if (outcome === "good" && fnMissing > 0) {
      const miss = tokens.filter((t) => t.mark === "missing").map((t) => t.text);
      if (miss.length) rawNotes.push({ kind: "missing", html: `Don't forget ${miss.map((m) => em(m.toLowerCase())).join(", ")}.` });
    }
    return { outcome, score: Math.round(score * 100) / 100, tokens, rawNotes, expected: answer, grammar, ut };
  }

  const RANK = { good: 2, close: 1, miss: 0 };
  function gradeAnswer(input, accepted, opts) {
    opts = opts || {};
    const lang = opts.lang || "es";
    const lex = lang === "en" ? null : (opts.lexicon || defaultLexicon());
    let list = (Array.isArray(accepted) ? accepted : [accepted]).filter((x) => x != null && String(x).trim());
    if (lang === "en") list = expandEnglish(list);
    if (!list.length) return { outcome: "miss", score: 0, tokens: [], notes: [], expected: "" };
    let best = null;
    for (const a of list) {
      const r = gradeOne(input, a, lex, lang);
      if (!best || RANK[r.outcome] > RANK[best.outcome] || (RANK[r.outcome] === RANK[best.outcome] && r.score > best.score)) best = r;
    }
    let notes = best.rawNotes;
    if (lang !== "en" && lex) {
      const rc = ruleChecks(best.ut, lex);
      // keep only the "common learner error" checks that alignment can't explain
      for (const n of rc.notes) if (["gustar", "gustar2", "age", "location", "ira", "llamarse"].includes(n.key)) notes = notes.concat([n]);
    }
    const res = { outcome: best.outcome, score: best.score, tokens: best.tokens, notes: finishNotes(notes, lex), expected: best.expected };
    if (opts.lang === "en") res.expected = list[0];
    return res;
  }

  function expandEnglish(list) {   // "house, home" / "to speak (talk)" -> each alternative, minus leading to/the/a
    const out = [];
    for (const g of list) {
      for (let part of String(g).split(/[,;/]| or /)) {
        const clean = part.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
        if (!clean) continue;
        out.push(clean);
        const stripped = clean.replace(/^(to|the|a|an)\s+/i, "");
        if (stripped !== clean) out.push(stripped);
      }
      out.push(String(g).replace(/\([^)]*\)/g, " "));
    }
    return Array.from(new Set(out.filter(Boolean)));
  }

  // ------------------------------------------------------------------ free text (prompts, stories)
  function tokenMatches(u, t, lex) {      // -> mark or null; lemma-aware + typo tolerant
    if (u.n === t.n) return "ok";
    if (u.f === t.f) return "accent";
    if (/^\d+$/.test(u.n) && NUMWORDS[t.f] === +u.n) return "ok";
    if (lex) {
      const a = look(lex, u.f), b = look(lex, t.f);
      if (a.some((x) => b.some((y) => x.lemma === y.lemma))) return "grammar";
    }
    if (isTypo(u.f, t.f)) return "typo";
    return null;
  }

  function findTarget(ut, target, lex, used) {
    const tt = tokenize(target).filter((t) => !(t.n === "___"));
    if (!tt.length) return null;
    // content tokens of the target must appear in order with ≤2 gaps between them
    const core = tt.filter((t, i) => tt.length === 1 || !FUNCTION_WORDS.has(t.f) || i === 0 && tt.length <= 2);
    const want = core.length ? core : tt;
    for (let s = 0; s < ut.length; s++) {
      let k = s, hits = [], marks = [];
      for (const t of want) {
        let found = -1;
        for (let q = k; q < ut.length && q <= k + 2 + (hits.length ? 0 : ut.length); q++) {
          const m = tokenMatches(ut[q], t, lex);
          if (m && !used.has(q)) { found = q; marks.push(m); break; }
          if (hits.length && q >= k + 2) break;
        }
        if (found < 0) { hits = null; break; }
        hits.push(found); k = found + 1;
      }
      if (hits && hits.length) return { idx: hits, marks };
    }
    if (want.length > 1) {
      // lenient: the key (longest) word of a multi-word target is there -> counts, with a nudge about the rest
      const key = want.slice().sort((a, b) => b.f.length - a.f.length)[0];
      for (let q = 0; q < ut.length; q++) {
        const m = !used.has(q) && tokenMatches(ut[q], key, lex);
        if (m) return { idx: [q], marks: [m], partial: true };
      }
    }
    return null;
  }

  function gradeFree(text, spec, opts) {
    spec = spec || {}; opts = opts || {};
    const lex = opts.lexicon || defaultLexicon();
    const ut = tokenize(text);
    const tokens = ut.map((t) => ({ text: t.raw, mark: "ok" }));
    const rawNotes = [];
    const targets = (spec.targets || []).filter(Boolean);
    const used = new Set(), hit = [], missed = [];
    for (const tg of targets) {
      const r = findTarget(ut, tg, lex, used);
      if (r) {
        hit.push(tg);
        if (r.partial) rawNotes.push({ kind: "hint", html: `Nearly: the phrase is ${em(String(tg).replace(/___/g, "…"))}.` });
        r.idx.forEach((q, i) => {
          used.add(q);
          const m = r.marks[i];
          if (m === "typo") { tokens[q].mark = "typo"; rawNotes.push({ kind: "typo", u: ut[q].raw, e: tokenize(tg).find((t) => tokenMatches(ut[q], t, lex) === "typo")?.raw || tg }); }
          if (m === "accent") { tokens[q].mark = "accent"; const e = tokenize(tg).find((t) => t.f === ut[q].f); rawNotes.push({ kind: "accent", word: (e ? e.raw : tg).toLowerCase() }); }
        });
      } else missed.push(tg);
    }
    const rc = ruleChecks(ut, lex);
    for (const [i, m] of Object.entries(rc.marks)) tokens[i].mark = m;
    const notes = finishNotes(rawNotes.concat(rc.notes), lex);
    const coverage = targets.length ? hit.length / targets.length : (ut.length >= 3 ? 1 : ut.length / 3);
    let outcome = !ut.length ? "miss" : coverage >= 0.75 ? "good" : coverage >= 0.4 ? "close" : "miss";
    if (ut.length && ut.length < 2 && targets.length > 2) outcome = outcome === "good" ? "close" : outcome;
    // best matching model answer (for display)
    let bestModel = null, bestScore = -1, bestOutcome = "miss";
    for (const m of spec.models || []) {
      const r = gradeOne(text, m, lex, "es");
      if (r.score > bestScore) { bestScore = r.score; bestModel = m; }
      if (RANK[r.outcome] > RANK[bestOutcome]) bestOutcome = r.outcome;
    }
    if (ut.length && RANK[bestOutcome] > RANK[outcome]) outcome = bestOutcome;
    const score = Math.round((0.8 * coverage + 0.2 * Math.max(0, bestScore)) * 100) / 100;
    return { outcome, score, tokens, notes, coverage, targets: { hit, missed }, closestModel: bestModel, grammarSlips: rc.notes.length };
  }

  const Grader = { normalize, fold, tokenize, levenshtein, buildLexicon, gradeAnswer, gradeFree, ruleChecks,
    lookup(word, lex) { return look(lex || defaultLexicon(), word); },
    setLexicon(l) { _defaultLex = l; }, resetLexicon() { _defaultLex = null; }, PERSON_LABEL, TENSE_LABEL, derivePlural };
  root.Grader = Grader;
  if (typeof module !== "undefined" && module.exports) module.exports = Grader;
})(typeof window !== "undefined" ? window : globalThis);
