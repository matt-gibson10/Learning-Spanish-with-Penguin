/* Think out loud (#/say): the learner speaks or types what he wants to say (English, attempted Spanish or a mix) and gets
 * it back as natural Mexican Spanish with a word-by-word (interlinear) breakdown, one sentence per request.
 * Backend: GET /api/chat/status?warm=1, POST /api/translate (docs/CONTRACT.md "Think out loud"). ?mocksay=1 in the URL
 * (or the hash) switches on canned contract-shaped answers for UI testing; ?mocksay=0 switches it off again.
 * Without a backend (no model / file://) it falls back to a rough offline word-by-word lookup from the course lexicon.
 * Every real translation is kept in Store.state.phrases ("My phrases"); ★ Practise turns one into a personal review card
 * (id "my_<hash>", resolved by App.item through App.phraseItem, reviewed via App.phraseExercise from pages.js). */
(function () {
  "use strict";
  const App = window.App, h = App.h, esc = App.esc;
  App.pages = App.pages || {};
  const TIMEOUT_MS = 120000, SILENCE_MS = 8000, MAX_WORDS = 25, AUTO_TRY_AFTER = 3, HISTORY_PAGE = 30;
  const EXAMPLES = ["I'd like a table for two", "Where is the bathroom?", "I don't understand, can you repeat that?"];

  // ------------------------------------------------------------------ state: My phrases
  function phrases() { return Store.state.phrases || (Store.state.phrases = {}); }
  function livePhrases() { return Object.values(phrases()).filter((p) => p && !p.deleted && p.es); }
  /** "my_" + FNV-1a hash of the folded Spanish (so the same sentence is kept once). */
  function phraseId(es) {
    const s = App.fold(es).replace(/[^\p{L}\p{N}]+/gu, " ").trim();
    let x = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 0x01000193) >>> 0; }
    return "my_" + x.toString(36);
  }
  App.phraseItem = function (id) {
    const p = (Store.state.phrases || {})[id];
    if (!p || p.deleted || !p.es) return undefined;
    return { id, es: p.es, en: p.en || p.input || "", cat: "mine", pos: "phrase", topic: "mine", pieces: p.pieces || [], tip: p.tip || "" };
  };
  function cleanPieces(pieces) {
    if (!Array.isArray(pieces)) return [];
    return pieces.filter((x) => x && typeof x.es === "string" && x.es.trim()).map((x) => ({ es: x.es.trim(), en: String(x.en || "").trim() }));
  }
  function savePhrase(input, res, lang) {
    const id = phraseId(res.es);
    const P = phrases();
    const prev = P[id] && !P[id].deleted ? P[id] : null;
    const now = Date.now();
    const p = Object.assign(prev || { id, attempts: [], outcome: null, practise: false }, {
      input, input_lang: res.input_lang || (lang === "es" ? "es" : "en"), en: res.en || input, es: res.es,
      pieces: cleanPieces(res.pieces), tip: res.tip || "", correction: res.correction || null, ts: now, updated: now,
    });
    let notes = [];
    if (p.input_lang !== "en" || lang === "es") { try { notes = App.graderNotes ? App.graderNotes(input, p.correction) : []; } catch (e) { notes = []; } }
    p.notes = notes;
    P[id] = p;
    Store.touchStreak();
    Store.save();
    return p;
  }
  function recordAttempt(p, text, outcome) {
    p.attempts = (p.attempts || []).concat([{ text, outcome, ts: Date.now() }]).slice(-10);
    p.outcome = outcome;
    p.updated = Date.now();
    Store.save();
  }
  function setPractise(p, on) {
    p.practise = !!on;
    p.updated = Date.now();
    if (on) Store.learn([p.id], { dueNow: true });
    else if (Store.state.cards[p.id] || Store.state.learned[p.id]) Store.unlearn(p.id);
    Store.save();
  }
  function deletePhrase(p) {
    if (Store.state.cards[p.id] || Store.state.learned[p.id]) Store.unlearn(p.id);
    phrases()[p.id] = { id: p.id, deleted: true, updated: Date.now() };   // tombstone, so a sync merge can't bring it back
    Store.save();
  }

  // ------------------------------------------------------------------ backend (real or mock)
  function mockOn() {
    const s = location.search + location.hash;
    try {
      if (/mocksay=1/.test(s)) sessionStorage.setItem("mocksay", "1");
      if (/mocksay=0/.test(s)) sessionStorage.removeItem("mocksay");
      return sessionStorage.getItem("mocksay") === "1";
    } catch (e) { return /mocksay=1/.test(s); }
  }
  async function sayStatus() {
    if (mockOn()) return { available: true, backend: "mock", note: "Mock mode (?mocksay=1): translations are canned." };
    if (!/^https?:/.test(location.protocol)) return { available: false, offline: true };
    const warm = (Store.state.settings.chatBackend || "") !== "claude";
    try {
      const r = await fetch(warm ? "api/chat/status?warm=1" : "api/chat/status", { cache: "no-store" });
      if (!r.ok) return { available: false, error: `status ${r.status}` };
      return await r.json();
    } catch (e) { return { available: false, offline: true }; }
  }
  async function translate(text, backend) {
    if (mockOn()) return mockTranslate(text);
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
    try {
      const r = await fetch("api/translate", {
        method: "POST", headers: { "Content-Type": "application/json" }, signal: ctl.signal,
        body: JSON.stringify({ text, backend: backend || null }),
      });
      let data = null;
      try { data = await r.json(); } catch (e) { data = null; }
      if (!r.ok) {
        const err = new Error((data && (data.error || (typeof data.detail === "string" && data.detail))) || `The server answered ${r.status}.`);
        err.setup = data && data.setup;
        err.status = r.status;
        throw err;
      }
      if (!data || !data.es) throw new Error("Penguin's answer came back empty.");
      return data;
    } catch (e) {
      if (e.name === "AbortError") throw new Error("Penguin took more than 2 minutes on that one.");
      throw e;
    } finally { clearTimeout(timer); }
  }

  let mockCalls = 0;
  const mockFailed = new Set();
  const MOCKS = [
    [/table for (two|2)/i, { input_lang: "en", en: "I'd like a table for two, please.", es: "Quisiera una mesa para dos, por favor.",
      pieces: [{ es: "Quisiera", en: "I'd like" }, { es: "una mesa", en: "a table" }, { es: "para dos,", en: "for two" }, { es: "por favor.", en: "please" }],
      tip: "Quisiera is the polite 'I'd like' — softer than quiero." }],
    [/bathroom|restroom|toilet/i, { input_lang: "en", en: "Where is the bathroom?", es: "¿Dónde está el baño?", pieces: [], tip: "" }],
    [/understand/i, { input_lang: "en", en: "I don't understand, can you repeat that?", es: "No entiendo, ¿me lo puede repetir?",
      pieces: [{ es: "No entiendo,", en: "I don't understand" }, { es: "¿me lo", en: "it to me" }, { es: "puede", en: "can you (usted)" }, { es: "repetir?", en: "repeat" }],
      tip: "Puede (usted) is the polite 'can you' for strangers." }],
    [/beach tomorrow/i, { input_lang: "en", en: "I want to go to the beach tomorrow, but I don't know how to get there.",
      es: "Quiero ir a la playa mañana, pero no sé cómo llegar.",
      pieces: [{ es: "Quiero", en: "I want" }, { es: "ir", en: "to go" }, { es: "a la playa", en: "to the beach" }, { es: "mañana,", en: "tomorrow" },
        { es: "pero", en: "but" }, { es: "no sé", en: "I don't know" }, { es: "cómo llegar.", en: "how to get there" }],
      tip: "Spanish drops 'I': quiero already means 'I want'." }],
    [/yo gusto/i, { input_lang: "es", en: "I like the beach.", es: "Me gusta la playa.",
      pieces: [{ es: "Me gusta", en: "I like (it pleases me)" }, { es: "la playa.", en: "the beach" }],
      tip: "", correction: { original: "yo gusto la playa", fixed: "me gusta la playa", why_en: "Gustar works backwards: 'me gusta' = it pleases me." } }],
  ];
  async function mockTranslate(text) {
    mockCalls++;
    await new Promise((r) => setTimeout(r, mockCalls === 1 ? 2500 : 1200));
    if (/\bsetup\b/i.test(text)) { const e = new Error("The local model isn't installed (mock)."); e.status = 503; e.setup = "py -3.13 scripts\\setup_chat_model.py"; throw e; }
    if (/\bfail\b/i.test(text) && !mockFailed.has(text)) { mockFailed.add(text); const e = new Error("Mock failure — press Try again."); e.status = 500; throw e; }
    for (const [re, res] of MOCKS) if (re.test(text)) return Object.assign({ backend: "mock", ms: 1200, correction: null }, JSON.parse(JSON.stringify(res)));
    if (looksSpanish(text)) {
      const es = capSentence(text);
      return { input_lang: "es", en: autoPieces(es).map((x) => x.en || "…").join(" "), es, pieces: [], tip: "", correction: null, backend: "mock", ms: 1200 };
    }
    const rough = roughFromEnglish(text).filter((x) => !x.unknown);
    const es = capSentence(rough.map((x) => x.es).join(" ") || "Hola");
    return { input_lang: "en", en: text, es, pieces: rough.length ? rough.map((x) => ({ es: x.es, en: x.en })) : [], tip: "(mock) a canned word-by-word answer.", correction: null, backend: "mock", ms: 1200 };
  }
  function capSentence(s) {
    s = String(s || "").trim();
    if (!s) return s;
    s = s[0].toUpperCase() + s.slice(1);
    return /[.!?…]$/.test(s) ? s : s + ".";
  }
  const EN_HINT = new Set("the a an i you is are am do does don't can want to of and but it my what where how".split(" "));
  function looksSpanish(text) {
    const toks = Grader.tokenize(text);
    if (!toks.length) return false;
    let es = 0, en = 0;
    toks.forEach((t) => { if (EN_HINT.has(t.n)) en++; else if (Grader.lookup(t.n).length) es++; });
    return es >= 2 && es > en * 2;
  }

  // ------------------------------------------------------------------ sentence splitting
  const wordCount = (s) => (String(s).trim().match(/\S+/g) || []).length;
  const CUT_BEFORE = new Set(["and", "but", "so", "because", "then", "y", "pero", "porque", "entonces"]);
  function chunkLong(sentence) {
    const words = sentence.split(/\s+/).filter(Boolean);
    if (words.length <= MAX_WORDS) return [sentence];
    const out = [];
    let rest = words;
    while (rest.length > MAX_WORDS) {
      const parts = Math.ceil(rest.length / MAX_WORDS);
      const target = Math.ceil(rest.length / parts);
      let cut = target;
      for (let d = 0; d <= 6; d++) {
        const cands = [target - d, target + d].filter((i) => i >= 8 && i <= MAX_WORDS && i < rest.length);
        const hit = cands.find((i) => /[,;:]$/.test(rest[i - 1]) || CUT_BEFORE.has(App.fold(rest[i]).replace(/[^a-z]/g, "")));
        if (hit) { cut = hit; break; }
      }
      out.push(rest.slice(0, cut).join(" "));
      rest = rest.slice(cut);
    }
    if (rest.length) out.push(rest.join(" "));
    return out;
  }
  /** Text -> sentences: newlines and . ! ? … boundaries, then ~25-word chunks for long unpunctuated runs. */
  function splitSentences(text) {
    const out = [];
    String(text || "").split(/\n+/).forEach((line) => {
      const l = line.replace(/\s+/g, " ").trim();
      if (!l) return;
      const parts = l.match(/[^.!?…]+(?:[.!?…]+["”’')\]]*|$)/g) || [l];
      parts.forEach((s) => {
        s = s.trim();
        if (!s || !/[\p{L}\p{N}]/u.test(s)) return;
        chunkLong(s).forEach((c) => out.push(c));
      });
    });
    return out;
  }
  App.splitSentences = splitSentences;

  // ------------------------------------------------------------------ lexicon: Spanish word -> gloss
  const PRON_EN = { "1s": "I", "2s": "you", "3s": "he/she", "1p": "we", "3p": "they" };
  const SMALL_EN = { el: "the", la: "the", los: "the", las: "the", lo: "it / the", un: "a", una: "a", unos: "some", unas: "some",
    yo: "I", "tú": "you", tu: "your", "él": "he", ella: "she", usted: "you (formal)", nosotros: "we", nosotras: "we", ellos: "they", ellas: "they",
    ustedes: "you all", me: "me / myself", te: "you", se: "him/her/self", nos: "us", le: "to him/her", les: "to them", de: "of / from", a: "to / at",
    en: "in / on", y: "and", que: "that", con: "with", por: "for / by", para: "for / to", no: "no / not", del: "of the", al: "to the" };
  const EN_BE = { "1s": "I am", "2s": "you are", "3s": "he/she is", "1p": "we are", "3p": "they are" };
  /** "want" + 1s pres -> "I want"; 3s -> "he/she wants"; past/future get a short marker. Rough, for glosses only. */
  function enVerb(base, person, tense) {
    const [head, ...rest] = base.split(" ");
    const tail = rest.length ? " " + rest.join(" ") : "";
    let v;
    if (head === "be") v = EN_BE[person] + tail;
    else if (head === "have" && person === "3s") v = "he/she has" + tail;
    else if (person === "3s") v = "he/she " + (/(s|sh|ch|x|z|o)$/.test(head) ? head + "es" : /[^aeiou]y$/.test(head) ? head.slice(0, -1) + "ies" : head + "s") + tail;
    else v = `${PRON_EN[person]} ${base}`;
    return v + (tense === "pret" || tense === "imp" ? " (past)" : tense === "fut" ? " (will)" : "");
  }
  /** Best course entry for one Spanish word form -> {it, en} (verbs get the person: "quiero" -> "I want"). */
  function wordGloss(word) {
    const core = String(word || "").replace(/[^\p{L}\p{N}]/gu, "");
    if (!core) return null;
    let entries = [];
    try { entries = Grader.lookup(core); } catch (e) { entries = []; }
    let best = null;
    for (const e of entries) {
      const it = App.item(e.lemma);
      if (it && (!best || (it.rank || 9999) < (best.it.rank || 9999))) best = { it, e };
    }
    if (!best) {
      const g = App.glossFor ? App.glossFor(core) : null;
      if (g) best = { it: g.it, e: {} };
    }
    const small = SMALL_EN[core.toLowerCase()];
    if (!best) return small ? { it: null, en: small } : null;
    const { it, e } = best;
    let en = App.shortEn(it.en);
    if (it.pos === "verb" && PRON_EN[e.person] && e.tense !== "subj" && e.tense !== "cmd") en = enVerb(en, e.person, e.tense);
    if (small && (it.rank || 9999) <= 60 && ["det", "prep", "conj", "pron"].includes(it.pos)) en = small;
    return { it, en };
  }
  let chunkIdx = null;
  function chunkIndex() {
    if (chunkIdx) return chunkIdx;
    chunkIdx = new Map();
    (App.course.chunks || []).forEach((c) => {
      if (!c.es || /___/.test(c.es)) return;
      const key = App.fold(c.es).replace(/[^\p{L}\p{N} ]/gu, " ").replace(/\s+/g, " ").trim();
      if (key.includes(" ") && !chunkIdx.has(key)) chunkIdx.set(key, App.item(c.id) || c);
    });
    return chunkIdx;
  }
  const coreFold = (w) => App.fold(w).replace(/[^\p{L}\p{N}]/gu, "");
  /** Spanish sentence -> pieces glossed from the course (known phrases first, then word by word). */
  function autoPieces(es) {
    const toks = String(es || "").split(/\s+/).filter(Boolean);
    const out = [];
    let i = 0;
    while (i < toks.length) {
      let matched = false;
      for (let L = Math.min(3, toks.length - i); L >= 2; L--) {
        if (L === toks.length && L > 2) continue;      // a whole-sentence phrase would hide the word-by-word view
        const key = toks.slice(i, i + L).map(coreFold).join(" ");
        const c = chunkIndex().get(key);
        if (c) { out.push({ es: toks.slice(i, i + L).join(" "), en: App.shortEn(c.en), auto: true }); i += L; matched = true; break; }
      }
      if (matched) continue;
      const g = wordGloss(toks[i]);
      out.push({ es: toks[i], en: g ? g.en : "", auto: true });
      i++;
    }
    return out;
  }

  // ------------------------------------------------------------------ offline: English -> Spanish reverse index (rough)
  let revIdx = null;
  function reverseIndex() {
    if (revIdx) return revIdx;
    revIdx = new Map();
    App.allItems().forEach((it) => {
      String(it.en || "").replace(/\([^)]*\)/g, "").split(/[,;/]/).forEach((sense, si) => {
        let k = sense.toLowerCase().replace(/[.!?¿¡"“”…]/g, "").replace(/’/g, "'").trim().replace(/^(to|the|a|an) /, "").trim();
        if (!k || /___/.test(k) || k.split(" ").length > 4) return;
        if (!revIdx.has(k)) revIdx.set(k, []);
        revIdx.get(k).push({ it, si });
      });
    });
    for (const [k, list] of revIdx) {
      const one = !k.includes(" ");
      list.sort((a, b) => (a.si > 0) - (b.si > 0) || (one ? (a.it.cat === "chunk") - (b.it.cat === "chunk") : 0) || (a.it.rank || 9999) - (b.it.rank || 9999));
    }
    return revIdx;
  }
  function expandContractions(s) {
    return s.toLowerCase().replace(/[’`´]/g, "'")
      .replace(/\bwon't\b/g, "will not").replace(/\bcan't\b/g, "can not").replace(/\bi'm\b/g, "i am")
      .replace(/n't\b/g, " not").replace(/'re\b/g, " are").replace(/'ll\b/g, " will").replace(/'d\b/g, " would")
      .replace(/'ve\b/g, " have").replace(/\b(it|that|what|where|who|how|there|he|she)'s\b/g, "$1 is").replace(/'s\b/g, "");
  }
  const EN_SKIP = new Set(["the", "a", "an", "to"]);
  const EN_AUX = new Set(["do", "does", "did"]);
  function stems(w) {
    const out = [];
    if (/ies$/.test(w)) out.push(w.replace(/ies$/, "y"));
    if (/es$/.test(w)) out.push(w.slice(0, -2));
    if (/s$/.test(w)) out.push(w.slice(0, -1));
    if (/ing$/.test(w)) { out.push(w.slice(0, -3), w.slice(0, -3) + "e"); if (/(.)\1ing$/.test(w)) out.push(w.slice(0, -4)); }
    if (/ed$/.test(w)) { out.push(w.slice(0, -2), w.slice(0, -1)); if (/(.)\1ed$/.test(w)) out.push(w.slice(0, -3)); }
    return out.filter((x) => x.length > 1);
  }
  /** English sentence -> rough pieces [{es, en, unknown}] by greedy longest match on the course's English glosses. */
  function roughFromEnglish(text) {
    const idx = reverseIndex();
    const words = expandContractions(String(text || "")).match(/[a-z]+/g) || [];
    const out = [];
    let i = 0;
    while (i < words.length) {
      const w = words[i];
      if (EN_SKIP.has(w) || (EN_AUX.has(w) && (i === 0 || words[i + 1] === "not" || words[i + 1] === "you"))) { i++; continue; }
      let hit = null, len = 0;
      for (let L = Math.min(4, words.length - i); L >= 1 && !hit; L--) {
        const key = words.slice(i, i + L).join(" ");
        if (idx.has(key)) { hit = idx.get(key)[0].it; len = L; }
        else if (L === 1) { for (const s of stems(w)) if (idx.has(s)) { hit = idx.get(s)[0].it; len = 1; break; } }
      }
      if (hit) out.push({ es: App.withArticle(hit), en: words.slice(i, i + len).join(" "), item: hit });
      else out.push({ es: "?", en: w, unknown: true });
      i += len || 1;
    }
    return out;
  }
  App.roughFromEnglish = roughFromEnglish;

  // ------------------------------------------------------------------ rendering: interlinear tiles + gloss
  const stripPunct = (s) => String(s || "").replace(/[¿?¡!.,;:«»"“”…()]/g, " ").replace(/\s+/g, " ").trim();
  const SKIP_GLOSS_POS = new Set(["det", "prep", "conj", "pron"]);
  function lexRows(text) {
    const rows = [], seen = new Set();
    const whole = chunkIndex().get(App.fold(stripPunct(text)));
    if (whole && whole.id) { rows.push({ form: stripPunct(text), it: whole }); seen.add(whole.id); }
    const words = stripPunct(text).split(" ").filter(Boolean);
    words.forEach((w) => {
      const g = wordGloss(w);
      if (!g || !g.it || seen.has(g.it.id)) return;
      if (words.length > 1 && SKIP_GLOSS_POS.has(g.it.pos) && (g.it.rank || 9999) <= 150) return;
      seen.add(g.it.id);
      rows.push({ form: w, it: g.it, en: g.en });
    });
    return rows;
  }
  function addBtn(it) {
    if (Store.isLearned(it.id)) return h("span.small.muted", "✓ in review");
    const b = h("button.btn.btn-ghost.btn-sm", { type: "button", onclick: (e) => {
      e.stopPropagation();
      Store.learn([it.id], { dueNow: true });
      b.replaceWith(h("span.small.muted", "✓ in review"));
      App.toast(`Added <b>${esc(it.es)}</b> to review.`);
    } }, "+ add to review");
    return b;
  }
  function showPieceGloss(piece, host, tile) {
    App.$$(".ilin-tile.active").forEach((t) => t.classList.remove("active"));
    host.innerHTML = "";
    const text = stripPunct(piece.es);
    if (!text || piece.unknown) { if (piece.unknown) host.appendChild(h("div.gloss-box", h("span", `No course word for “${piece.en}” — the chat model can translate it properly.`))); return; }
    tile.classList.add("active");
    const box = h("div.gloss-box.say-gloss");
    box.appendChild(h("div.say-gloss-head", h("strong", { lang: "es" }, text), piece.en ? h("span", ` — ${piece.en}`) : null,
      App.playBtn(text, "careful", { label: "" }), App.playBtn(text, "slow", { label: "" })));
    const rows = lexRows(piece.es);
    rows.forEach(({ form, it, en }) => {
      const lemma = App.fold(form) !== App.fold(it.es) ? h("span.muted", ` (${App.withArticle(it)})`) : null;
      box.appendChild(h("div.say-lex", h("strong", { lang: "es" }, form), lemma, h("span", ` — ${it.cat === "chunk" ? it.en : App.shortEn(it.en)}`),
        App.genderChip(it), it.pos ? h("span.tag", it.cat === "chunk" ? "phrase" : App.posLabel(it.pos)) : null, addBtn(it)));
    });
    if (!rows.length) box.appendChild(h("div.say-lex.small.muted", "Not in the course word list yet."));
    box.appendChild(h("button.btn.btn-ghost.btn-sm.gloss-close", { type: "button", "aria-label": "close", onclick: () => { host.innerHTML = ""; tile.classList.remove("active"); } }, "✕"));
    host.appendChild(box);
    App.say(text, "careful");
  }
  /** The interlinear view: each piece a stacked tile (Spanish on top, English under), wrapping like a sentence. */
  function interlinear(pieces, glossHost, opts) {
    opts = opts || {};
    const row = h("div.ilin", { lang: "es", class: opts.rough ? "rough" : "" });
    pieces.forEach((pc) => {
      const t = h("button.ilin-tile", { type: "button", class: pc.unknown ? "unknown" : pc.en ? "" : "no-en",
        title: pc.unknown ? "no course word found" : "tap to hear it and see the word" },
        h("span.ilin-es", pc.es), h("span.ilin-en", { lang: "en" }, pc.en || "·"));
      t.onclick = () => showPieceGloss(pc, glossHost, t);
      row.appendChild(t);
    });
    return row;
  }
  function piecesFor(p) { return (p.pieces && p.pieces.length) ? p.pieces : autoPieces(p.es); }

  function correctionEl(p) {
    const box = h("div.say-fixes");
    const c = p.correction;
    if (c && c.fixed && App.fold(c.fixed) !== App.fold(c.original || "")) {
      box.appendChild(h("div.chat-fix", h("span.fix-label", "Tip: "), h("s", { lang: "es" }, c.original || ""), " → ", h("strong", { lang: "es" }, c.fixed),
        c.why_en ? h("div.small.muted", c.why_en) : null));
    } else if (c && c.why_en) box.appendChild(h("div.chat-fix", h("span.fix-label", "Tip: "), h("span", c.why_en)));
    (p.notes || []).forEach((n) => box.appendChild(h("div.chat-fix", { html: `<span class="fix-label">Grammar: </span>${n}` })));
    return box.childNodes.length ? box : null;
  }
  function wordHelpRow(es) {
    const row = App.wordHelp(es);
    if (!row) return null;
    const ids = App.unknownWords(es).map((x) => x.item.id).slice(0, 8);
    if (ids.length) {
      const b = h("button.btn.btn-ghost.btn-sm", { type: "button", onclick: () => {
        Store.learn(ids, { dueNow: true });
        b.replaceWith(h("span.small.muted", `✓ ${ids.length} added to review`));
      } }, ids.length === 1 ? "+ add to review" : `+ add these ${ids.length}`);
      row.appendChild(b);
    }
    return row;
  }
  function practiseBtn(p, onChange) {
    const b = h("button.btn.btn-sm.say-star", { type: "button" });
    const paint = () => {
      const on = !!p.practise;
      b.className = "btn btn-sm say-star " + (on ? "btn-primary" : "btn-secondary");
      b.textContent = on ? "★ Practising" : "☆ Practise";
      b.setAttribute("aria-pressed", String(on));
      b.title = on ? "in your review deck — tap to remove" : "add to Review as a personal card";
    };
    b.onclick = (e) => {
      e.stopPropagation();
      setPractise(p, !p.practise);
      paint();
      App.toast(p.practise ? "Added to Review — you'll see the English and say it in Spanish." : "Removed from Review.");
      if (onChange) onChange();
    };
    paint();
    return b;
  }
  const OUTCOME_CHIP = { good: ["good", "✓ got it"], close: ["close", "≈ close"], miss: ["miss", "✗ missed"], unsure: ["marigold", "peeked"] };
  function outcomeChip(p) {
    const o = OUTCOME_CHIP[p.outcome];
    return o ? h("span.chip", { class: o[0] }, o[1]) : null;
  }
  /** The revealed Spanish: interlinear tiles, audio, tip, corrections, word help. */
  function revealBody(p, opts) {
    opts = opts || {};
    const wrap = h("div.say-reveal");
    const glossHost = h("div.gloss-host");
    wrap.append(interlinear(piecesFor(p), glossHost), glossHost,
      h("div.say-audio", App.playBtn(p.es, "careful"), App.playBtn(p.es, "slow"), App.playBtn(p.es, "natural")));
    if (!(p.pieces && p.pieces.length)) wrap.appendChild(h("p.small.muted.say-note", "Word-by-word glosses from the course word list."));
    if (p.tip) wrap.appendChild(h("p.say-tip", "💡 ", p.tip));
    const fx = correctionEl(p);
    if (fx) wrap.appendChild(fx);
    if (!opts.compact) { const wh = wordHelpRow(p.es); if (wh) wrap.appendChild(wh); }
    return wrap;
  }

  // ------------------------------------------------------------------ review card for "My phrases" (pages.js calls this)
  App.phraseExercise = function (it, card) {
    const produce = (card.seen || 0) % 2 === 0;
    let ex;
    if (produce) {
      ex = { mode: "type", title: "How would you say it?", prompt: h("div.prompt-en", it.en), answers: [it.es], display: it.es, lang: "es",
        placeholder: "En español…", why: it.tip || null };
    } else {
      ex = { mode: "flash", title: "Listen — what does it mean? Then flip.",
        front: [h("div.listen-icon", "🔊"), h("div.audio-row", App.playBtn(it.es, "careful"), App.playBtn(it.es, "slow"), App.playBtn(it.es, "natural")),
          h("p.muted", "Say the meaning to yourself, then flip.")],
        back: [h("p.say-review-es", { lang: "es" }, it.es), h("p.gloss", it.en), interlinear(piecesFor(it), h("div"))],
        audio: { text: it.es, speed: "careful" }, noAudioRow: true };
    }
    ex.id = it.id;
    ex.item = it;
    ex.dir = produce ? "mine-produce" : "mine-hear";
    ex.exType = ex.dir;                 // penguin:answer exType
    ex.itemKind = "phrase";
    ex.production = produce;
    ex.rateOpts = { production: produce };
    return ex;
  };

  // ------------------------------------------------------------------ the page
  App.pages.say = function (main) {
    const page = h("div.page.say-page");
    main.appendChild(page);
    const S = Store.state.settings;
    if (S.sayLang !== "es") S.sayLang = "en";
    const tryFirstOn = () => (S.sayTryFirst != null ? !!S.sayTryFirst : livePhrases().length >= AUTO_TRY_AFTER);

    page.appendChild(h("h1.page-title", "Think out loud"));
    page.appendChild(App.coach("talking", `<p class="speech-line">Say or type what you want to say — in English, or have a go in Spanish — and I'll give it back in Mexican Spanish, <strong>word by word</strong>.</p>`, { size: 80 }));
    const status = h("div.say-status");
    page.appendChild(status);

    // ---- input card
    const inCard = h("section.card.say-input");
    const langRow = h("div.btn-row.say-lang", { role: "radiogroup", "aria-label": "which language you'll speak" });
    const ta = h("textarea.answer-input.say-text", { rows: 2, spellcheck: "false", "aria-label": "what you want to say" });
    function paintLang() {
      langRow.innerHTML = "";
      [["en", "I'm speaking English"], ["es", "I'm trying in Spanish"]].forEach(([k, label]) => langRow.appendChild(h("button.btn.btn-sm", {
        type: "button", role: "radio", "aria-checked": String(S.sayLang === k), class: S.sayLang === k ? "btn-primary" : "btn-secondary",
        onclick: () => { if (S.sayLang === k) return; stopListening(); S.sayLang = k; Store.save(); paintLang(); },
      }, label)));
      ta.lang = S.sayLang;
      ta.placeholder = S.sayLang === "es" ? "Escribe en español (mixing in English is fine)…" : "Type what you want to say… (one or more sentences)";
      if (mic) mic.textContent = listening() ? "■ Stop" : S.sayLang === "es" ? "🎙 Tap and talk (español)" : "🎙 Tap and talk";
    }
    const canMic = !!(window.Speech && Speech.canListen && Speech.listenLive);
    const mic = canMic ? h("button.btn.btn-primary.btn-big.say-mic", { type: "button", "aria-live": "polite" }) : null;
    const live = h("div.say-live", { "aria-live": "polite" });
    live.hidden = true;
    const go = h("button.btn.btn-primary", { type: "button" }, "Translate →");
    const tryBox = h("input", { type: "checkbox", id: "say-try" });
    tryBox.checked = tryFirstOn();
    tryBox.onchange = () => { S.sayTryFirst = tryBox.checked; Store.save(); };
    const examples = h("div.say-examples", h("span.fb-label", "Try"),
      EXAMPLES.map((x) => h("button.chip.chat-chip", { type: "button", onclick: () => enqueueText(x, "en") }, x)));
    inCard.append(...[langRow, mic, live, canMic ? null : h("p.small.muted", "Speech recognition isn't available in this browser — type instead (Chrome or Edge can listen)."),
      h("div.answer-row.say-row", ta, go)].filter(Boolean),
      h("label.check-row.say-try", { for: "say-try" }, tryBox, " Let me try first", h("span.small.muted", " — guess the Spanish, then see it")),
      examples);
    page.appendChild(inCard);

    const results = h("div.say-results", { role: "log", "aria-live": "polite" });
    page.appendChild(results);
    page.appendChild(h("p.small.muted.chat-disclaimer", `${App.penguinName()}'s Spanish is usually right but not perfect — he's a small AI model.`));

    // ---- history
    const hist = h("section.say-history");
    const histTitle = h("h2.section-title");
    const search = h("input.answer-input.search", { type: "search", placeholder: "Search my phrases…", "aria-label": "search my phrases" });
    const list = h("div.say-list");
    const more = h("button.btn.btn-secondary.more", { type: "button" }, "Show more");
    hist.append(histTitle, search, list, more);
    page.appendChild(hist);
    let histShown = HISTORY_PAGE;
    function renderHistory() {
      const all = livePhrases().sort((a, b) => (b.ts || 0) - (a.ts || 0));
      histTitle.textContent = `My phrases (${all.length})`;
      search.hidden = all.length < 4;
      const q = App.fold(search.value.trim());
      const rows = q ? all.filter((p) => App.fold(`${p.es} ${p.en} ${p.input}`).includes(q)) : all;
      list.innerHTML = "";
      if (!all.length) list.appendChild(h("p.muted", "Everything you translate is kept here. ★ Practise puts a phrase into your Review deck."));
      else if (!rows.length) list.appendChild(h("p.muted", "No phrase matches that."));
      rows.slice(0, histShown).forEach((p) => list.appendChild(historyRow(p)));
      more.style.display = rows.length > histShown ? "" : "none";
    }
    function historyRow(p) {
      const row = h("div.say-phrase", { class: p.practise ? "practising" : "" });
      const detail = h("div.say-phrase-detail");
      const del = h("button.btn.btn-ghost.btn-sm.say-del", { type: "button", title: "delete", "aria-label": "delete this phrase", onclick: (e) => {
        e.stopPropagation();
        if (!confirm(`Delete “${p.es}” from My phrases?${p.practise ? " (Its review card goes too.)" : ""}`)) return;
        deletePhrase(p); renderHistory(); App.updateBadge && App.updateBadge();
      } }, "✕");
      const head = h("div.say-phrase-head", { role: "button", tabindex: 0, "aria-expanded": "false" },
        h("div.say-phrase-text", h("span.say-phrase-es", { lang: "es" }, p.es), h("span.say-phrase-en.muted", p.en || p.input)),
        h("div.say-phrase-meta", outcomeChip(p), App.playBtn(p.es, "careful", { label: "" }), practiseBtn(p, () => { row.classList.toggle("practising", !!p.practise); App.updateBadge && App.updateBadge(); }), del));
      head.onclick = () => {
        const open = row.classList.toggle("open");
        head.setAttribute("aria-expanded", String(open));
        detail.innerHTML = "";
        if (open) {
          detail.appendChild(revealBody(p, { compact: true }));
          if (p.input && App.fold(p.input) !== App.fold(p.en || "")) detail.appendChild(h("p.small.muted", "You said: ", p.input));
          const a = (p.attempts || []).filter((x) => x.text).slice(-1)[0];
          if (a) detail.appendChild(h("p.small.muted", "Your last try: ", h("em", { lang: "es" }, a.text)));
        }
      };
      head.onkeydown = (e) => { if (e.target === head && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); head.click(); } };
      row.append(head, detail);
      return row;
    }
    search.addEventListener("input", App.debounce(() => { histShown = HISTORY_PAGE; renderHistory(); }, 150));
    more.onclick = () => { histShown += HISTORY_PAGE; renderHistory(); };
    renderHistory();

    // ---- backend status (+ warm-up)
    let available = null;
    let setupShown = false;
    function showSetup(info) {
      if (setupShown) return;
      setupShown = true;
      status.innerHTML = "";
      if (App.chatSetupCard) status.appendChild(App.chatSetupCard(info));
      status.appendChild(h("p.small.muted.say-rough-note", "Until then I'll do a rough word-by-word lookup from the course words — install the chat model for real sentences."));
    }
    const statusReady = sayStatus().then((st) => {
      available = !!st.available;
      if (!page.isConnected) return;
      if (!available) showSetup(st);
      else status.appendChild(h("p.small.muted", st.backend === "mock" ? st.note :
        `Translator: ${st.backend === "local" ? "small model on this computer (offline)" : st.backend === "claude" ? "Claude (online)" : st.backend || ""}${st.model ? " · " + st.model : ""}`));
    });

    // ---- queue: one sentence per request, in order
    const jobs = [];
    let running = false;
    function enqueueText(text, lang) {
      const parts = splitSentences(text);
      if (!parts.length) return;
      examples.hidden = true;
      parts.forEach((s) => {
        const job = { text: s, lang: lang || S.sayLang, slot: h("div.say-slot") };
        results.appendChild(job.slot);
        pending(job, false);
        jobs.push(job);
      });
      setTimeout(() => { const first = results.lastElementChild; if (first) first.scrollIntoView({ block: "nearest", behavior: "smooth" }); }, 30);
      pump();
    }
    function youLine(text, p) {
      const fix = h("button.btn.btn-ghost.btn-sm.say-edit", { type: "button", title: "put this back in the box to fix it", onclick: () => {
        ta.value = (p && p.input) || text; ta.focus(); ta.scrollIntoView({ block: "center", behavior: "smooth" });
      } }, "✎");
      return h("div.say-you", h("span.say-you-label", "You"), h("span.say-you-text", { lang: p && p.input_lang === "es" ? "es" : null }, text), fix);
    }
    function pending(job, active) {
      job.slot.innerHTML = "";
      job.slot.appendChild(h("div.card.say-card.pending", youLine(job.text),
        h("div.say-thinking", h("span.chat-avatar", { html: App.penguinSvg("thinking", 36), "aria-hidden": "true" }),
          h("span.typing-dots", { "aria-hidden": "true" }, h("i"), h("i"), h("i")),
          h("span.say-thinking-text.small.muted", active ? `${App.penguinName()} is thinking…` : "waiting its turn…"))));
    }
    async function pump() {
      if (running) return;
      running = true;
      try {
        await statusReady;
        while (jobs.length) {
          const job = jobs.shift();
          if (!available) { roughResult(job); continue; }
          pending(job, true);
          const slow = setTimeout(() => { const n = job.slot.querySelector(".say-thinking-text"); if (n) n.textContent = `${App.penguinName()} is thinking… (the first one takes longest while he wakes up)`; }, 6000);
          try {
            const res = await translate(job.text, S.chatBackend);
            clearTimeout(slow);
            showResult(job, res);
          } catch (e) {
            clearTimeout(slow);
            if (e.status === 503 || e.status === 404 || e.status === 405) {
              available = false;
              showSetup({ error: e.status === 503 ? e.message : "This server doesn't have the translator yet (POST /api/translate) — update and restart the app.", setup: e.setup });
              roughResult(job);
            }
            else failed(job, e);
          }
        }
      } finally { running = false; }
    }
    function failed(job, e) {
      job.slot.innerHTML = "";
      job.slot.appendChild(h("div.card.say-card.say-failed", youLine(job.text),
        App.coach("oops", `<p class="speech-line">I couldn't get that one — ${esc(e.message || "something went wrong")}</p>`, { size: 56, name: false }),
        h("div.btn-row",
          h("button.btn.btn-primary.btn-sm", { type: "button", onclick: () => { pending(job, false); jobs.push(job); pump(); } }, "Try again"),
          h("button.btn.btn-ghost.btn-sm", { type: "button", onclick: () => job.slot.remove() }, "Remove"))));
    }
    function roughResult(job) {
      const es = job.lang === "es" || looksSpanish(job.text);
      const pieces = es ? autoPieces(job.text) : roughFromEnglish(job.text);
      const glossHost = h("div.gloss-host");
      job.slot.innerHTML = "";
      job.slot.appendChild(h("article.card.say-card.say-rough", youLine(job.text),
        h("p.say-rough-label", h("span.tag", "rough word-by-word"), h("span.small.muted", " install the chat model for real sentences")),
        pieces.length ? interlinear(pieces, glossHost, { rough: true }) : h("p.muted", "No course words found in that."), glossHost));
    }
    function showResult(job, res) {
      const tryNow = tryFirstOn();          // decided before saving: auto mode switches on after the first 3 sentences
      const p = savePhrase(job.text, res, job.lang);
      const autoFlip = S.sayTryFirst == null && livePhrases().length >= AUTO_TRY_AFTER;
      const tryIt = tryNow && p.input_lang === "en" && job.lang !== "es";
      if (autoFlip) {
        S.sayTryFirst = true; Store.save(); tryBox.checked = true;
        App.toast("From now on you'll guess the Spanish first — tap “Not sure” to skip. (Turn it off with “Let me try first”.)", 5000);
      }
      job.slot.innerHTML = "";
      job.slot.appendChild(resultCard(p, job.text, tryIt));
      renderHistory();
    }
    function resultCard(p, said, tryIt) {
      const card = h("article.card.say-card");
      card.appendChild(youLine(said, p));
      if (p.input_lang !== "en" && p.en && App.fold(p.en) !== App.fold(said)) card.appendChild(h("p.say-meant.small.muted", "You meant: ", h("em", p.en)));
      const body = h("div.say-body");
      const foot = h("div.say-foot", practiseBtn(p, renderHistory));
      card.append(body, foot);
      const reveal = (feedback) => {
        body.innerHTML = "";
        if (feedback) body.appendChild(feedback);
        body.appendChild(revealBody(p));
        const chip = outcomeChip(p);
        if (chip) foot.prepend(chip);
      };
      if (!tryIt) {
        reveal(null);
        if (S.autoplay !== false && !listening()) App.say(p.es, "careful");
        return card;
      }
      // "Let me try first": his English, an input, Not sure; then the lenient grader's diff vs es
      const inp = h("input.answer-input", { type: "text", lang: "es", autocomplete: "off", autocapitalize: "off", spellcheck: "false",
        placeholder: "En español…", "aria-label": "how would you say it in Spanish" });
      const check = h("button.btn.btn-primary", { type: "button" }, "Check");
      const unsure = h("button.btn.btn-ghost.btn-unsure", { type: "button", title: "skip and show me" }, "Not sure 🤷");
      const sayMic = window.Speech && Speech.canListen ? h("button.btn.btn-ghost.mic-btn", { type: "button", title: "say it in Spanish", "aria-label": "say it in Spanish" }, "🎙") : null;
      const done = (val) => {
        const r = val.trim() ? Grader.gradeAnswer(val, [p.es]) : { outcome: "unsure", score: 0, notes: [] };
        App.emitAnswer({ itemId: p.id, itemKind: "say", exType: "say-try", mode: "type", context: "say", production: true,
          outcome: r.outcome, score: val.trim() ? r.score : null, retry: (p.attempts || []).length > 0,
          slip: r.outcome === "good" && (r.notes || []).some((n) => n.kind === "grammar") });
        if (!val.trim()) {
          recordAttempt(p, "", "unsure");
          Store.noteUnsure(null);
          reveal(App.feedback({ outcome: "unsure", notes: [] }, { line: App.line("unsure"), showDiff: false }));
        } else {
          recordAttempt(p, val, r.outcome);
          const line = r.outcome === "good" ? `${App.line("good")} That's how you'd say it.` :
            r.outcome === "close" ? "¡Casi! You had most of it — look at the marked bits." : "Good try! Here's how it goes — tap the tiles to see each piece.";
          reveal(App.feedback(r, { line, answer: p.es, showDiff: true, alwaysAnswer: true }));
        }
        App.say(p.es, "careful");
        renderHistory();
      };
      check.onclick = () => { if (!inp.value.trim()) { inp.focus(); return; } done(inp.value); };
      unsure.onclick = () => done("");
      inp.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); check.click(); } });
      if (sayMic) sayMic.onclick = async () => {
        stopListening();
        sayMic.disabled = true; sayMic.textContent = "🎙…";
        try {
          const alts = await Speech.listen({ lang: "es-MX", timeout: 10000 });
          let best = alts[0], bs = -1;
          alts.forEach((a) => { const s = Grader.gradeAnswer(a, [p.es]).score; if (s > bs) { bs = s; best = a; } });
          inp.value = best; inp.focus();
        } catch (e) { App.toast(e.message === "no-speech" ? "I didn't hear anything." : "Speech recognition isn't available."); }
        finally { sayMic.disabled = false; sayMic.textContent = "🎙"; }
      };
      body.appendChild(h("div.say-try-box", h("p.say-try-q", "How would you say it in Spanish?"),
        h("div.answer-row", inp, check, sayMic), App.accentBar(inp), h("div.ex-secondary", unsure)));
      return card;
    }

    // ---- typing
    function submitTyped() {
      const text = ta.value.trim();
      if (!text) { ta.focus(); return; }
      ta.value = "";
      enqueueText(text, S.sayLang);
    }
    go.onclick = submitTyped;
    ta.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); e.stopPropagation(); submitTyped(); } });

    // ---- listening (continuous, interim text live; each pause = a sentence boundary)
    let ctl = null, held = "";
    function listening() { return !!(ctl && ctl.active); }
    function setLive(interim) {
      const txt = [held, interim].filter(Boolean).join(" ");
      live.hidden = !listening() && !txt;
      live.innerHTML = "";
      if (txt) live.append(...[held ? h("span", held + " ") : null, interim ? h("span.say-interim", interim) : null].filter(Boolean));
      else if (listening()) live.appendChild(h("span.muted", S.sayLang === "es" ? "Escuchando… habla cuando quieras." : "Listening… talk whenever you're ready."));
    }
    function paintMic() {
      if (!mic) return;
      const on = listening();
      mic.classList.toggle("listening", on);
      mic.textContent = on ? "■ Stop" : S.sayLang === "es" ? "🎙 Tap and talk (español)" : "🎙 Tap and talk";
      mic.setAttribute("aria-pressed", String(on));
    }
    function flushHeld() { if (held.trim()) { const t = held; held = ""; enqueueText(t, S.sayLang); } }
    function startListening() {
      if (listening()) return;
      held = "";
      ctl = Speech.listenLive({
        lang: S.sayLang === "es" ? "es-MX" : "en-US", silenceMs: SILENCE_MS,
        onInterim: (t) => setLive(t),
        onFinal: (t) => {
          held = (held + " " + t).trim();
          if (wordCount(held) >= 3 || /[.!?]$/.test(held)) flushHeld();
          setLive("");
        },
        onEnd: (why) => {
          ctl = null;
          flushHeld();
          paintMic(); setLive("");
          if (why === "silence" && page.isConnected) App.toast("Stopped listening after 8 seconds of quiet.");
        },
        onError: (code) => {
          if (!page.isConnected) return;
          App.toast(code === "not-allowed" || code === "service-not-allowed" ? "Microphone access was blocked — allow it in the browser, or type instead." :
            code === "network" ? "Speech recognition needs the internet in this browser — type instead." : `Speech recognition stopped (${esc(code)}).`, 4000);
        },
      });
      paintMic(); setLive("");
    }
    function stopListening() { if (ctl) ctl.stop(); }
    if (mic) mic.onclick = () => (listening() ? stopListening() : startListening());
    window.addEventListener("hashchange", () => { if (ctl) ctl.abort(); }, { once: true });
    paintLang();
    paintMic();
  };
})();
