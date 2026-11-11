/* Reusable UI pieces: audio buttons, feedback panels, item cards, the exercise runner and exercise generators. */
(function () {
  "use strict";
  const App = window.App, h = App.h, esc = App.esc;

  // ------------------------------------------------------------------ audio
  let noVoiceWarned = false;
  function warnNoVoice() {
    if (noVoiceWarned || !window.Speech) return;
    if (!Speech.supported) { App.toast("This browser can't play speech audio."); noVoiceWarned = true; return; }
    Speech.whenReady(() => {
      if (Speech.hasSpanish()) return;
      noVoiceWarned = true;
      let shown = false;
      try { shown = sessionStorage.getItem("noVoiceWarned") === "1"; sessionStorage.setItem("noVoiceWarned", "1"); } catch (e) { /* ignore */ }
      if (shown) { App.toast("No Spanish voice installed — see Settings → Voice.", 2500); return; }
      const main = App.$("#main");
      if (!main || App.$(".voice-banner")) return;
      const banner = h("div.card.voice-banner", { role: "alert" },
        App.coach("oops", `<p class="speech-line"><strong>I can't speak yet!</strong></p><p>${Speech.NO_VOICE_HELP}</p>`, { size: 64, name: false }),
        h("button.btn.btn-secondary.btn-sm", { type: "button", onclick: () => banner.remove() }, "Got it"));
      main.prepend(banner);
    });
  }
  App.say = function (text, speed, item) {
    warnNoVoice();
    if (speed === "natural" && item) return Speech.speakNatural(item, text);
    return Speech.speak(text, speed);
  };
  /** One play button. speed: careful | slow | natural */
  App.playBtn = function (text, speed, opts) {
    opts = opts || {};
    const labels = { careful: "Careful", slow: "Slow", natural: "Natural" };
    const cls = speed === "slow" ? ".audio-btn.slow" : speed === "natural" ? ".audio-btn.fast" : ".audio-btn";
    const label = opts.label != null ? opts.label : labels[speed] || "Play";
    const b = h("button" + cls, {
      type: "button", title: { careful: "play at careful speed", slow: "play slowly", natural: "play at natural fast speed" }[speed] || "play",
      "aria-label": (label || labels[speed] || "Play") + ": " + text,
      onclick: (e) => {
        e.stopPropagation();
        App.$$(".audio-btn.playing").forEach((x) => x.classList.remove("playing"));
        b.classList.add("playing");
        Promise.resolve(App.say(opts.sayText || text, speed, opts.item)).finally(() => b.classList.remove("playing"));
      },
    }, label);
    return b;
  };
  /** careful / slow / natural buttons for a piece of Spanish. */
  App.audioRow = function (text, opts) {
    opts = opts || {};
    const row = h("div.audio-row");
    row.appendChild(App.playBtn(text, "careful", { item: opts.item }));
    if (!opts.noSlow) row.appendChild(App.playBtn(text, "slow", { item: opts.item }));
    if (!opts.noNatural) row.appendChild(App.playBtn(text, "natural", { item: opts.item }));
    return row;
  };

  // ------------------------------------------------------------------ feedback
  App.diffEl = function (tokens) {
    const d = h("div.diff");
    (tokens || []).forEach((t, i) => {
      if (i) d.appendChild(document.createTextNode(" "));
      const why = { typo: "small typo", accent: "watch the accent", grammar: "right word, different form", wrong: "different word" }[t.mark] || t.mark;
      const title = t.mark === "ok" ? null : t.mark === "missing" ? "missing word" : t.mark === "extra" ? "extra word" :
        t.expected ? `${why}: “${t.expected}”` : why;
      d.appendChild(h("span", { class: t.mark === "wrong" ? "missing wrong" : t.mark, title }, t.text));
    });
    return d;
  };
  const MOOD = { good: "happy", close: "thinking", miss: "oops", unsure: "talking" };
  /**
   * Feedback panel (.feedback.good|close|miss): the penguin with the line + notes, the marked answer (.diff), the answer (.model).
   * res = grader result (or {outcome}). opts: {answer, why, extra (Node), line, audio, showDiff, alwaysAnswer, answerLang}
   */
  App.feedback = function (res, opts) {
    opts = opts || {};
    const o = res.outcome || "miss";
    const box = h("div.feedback", { class: o, role: "status", "aria-live": "polite" });
    let html = `<h3 class="title">${esc(opts.line || App.line(o))}</h3>`;
    html += (res.notes || []).map((n) => `<p class="note note-${n.kind}">${n.html}</p>`).join("");
    if (opts.why) html += `<p class="note why">${App.inline(opts.why)}</p>`;
    const moods = window.Penguin && window.Penguin.moodFor;
    const coach = App.coach((o !== "unsure" && moods && moods[o]) || MOOD[o], html, { size: 64, name: false });
    if (coach.firstChild && coach.firstChild.classList) coach.firstChild.classList.add("sm");
    box.appendChild(coach);
    if (res.tokens && res.tokens.length && opts.showDiff !== false) box.appendChild(App.diffEl(res.tokens));
    if (opts.answer && (o !== "good" || (res.notes || []).length || opts.alwaysAnswer)) {
      const ans = h("div.model", h("span.lbl", o === "good" ? "Exactly" : "Answer"), h("span", { lang: opts.answerLang === "en" ? "en" : "es" }, opts.answer));
      if (opts.audio !== false && opts.answerLang !== "en") ans.appendChild(App.playBtn(opts.audio || opts.answer, "careful", { label: "" }));
      box.appendChild(ans);
    }
    if (opts.extra) box.appendChild(opts.extra);
    return box;
  };

  /** rateOpts: the opts Store.rate will receive (e.g. {production: true}) so the previewed intervals match. */
  App.rateRow = function (id, suggested, onRate, rateOpts) {
    const row = h("div.rate-row");
    const names = [["again", "Again"], ["hard", "Hard"], ["good", "Good"], ["easy", "Easy"]];
    for (const [k, label] of names) {
      row.appendChild(h("button", {
        type: "button", class: "rate-" + k + (k === suggested ? " suggested" : ""), "aria-pressed": k === suggested ? "true" : null,
        onclick: () => onRate(k),
      }, label, h("small.when", Store.preview(id, k, rateOpts))));
    }
    const cap = (x) => x[0].toUpperCase() + x.slice(1);
    return h("div.rate-wrap", h("p.rate-hint", suggested ? `Suggested: ${cap(suggested)} (Enter) — tap another if you disagree.` : "How well did you know it?"), row);
  };

  // ------------------------------------------------------------------ item card (learn)
  App.conjTable = function (it) {
    const c = it.conj || {};
    const P = ["yo", "tú", "él/ella/usted", "nosotros", "ellos/ustedes"];
    const T = [["pres", "present"], ["pret", "past"], ["imp", "used to"], ["fut", "future"]].filter(([k]) => Array.isArray(c[k]));
    if (!T.length) return null;
    const tbl = h("table.conj");
    tbl.appendChild(h("thead", h("tr", h("th", ""), T.map(([, l]) => h("th", l)))));
    const tb = h("tbody");
    P.forEach((p, i) => tb.appendChild(h("tr", h("th", p), T.map(([k]) => h("td", { class: k === "pres" ? "pres" : "" }, c[k][i] || "")))));
    tbl.appendChild(tb);
    const det = h("details.conj-peek", h("summary", "Conjugation peek" + (c.irregular ? " (irregular)" : "")), h("div.table-wrap", tbl));
    const extra = [c.ger && `gerund: ${c.ger}`, c.part && `participle: ${c.part}`, c.cmd && c.cmd.usted && `command: ${c.cmd.usted} (usted) / ${c.cmd.tu} (tú)`].filter(Boolean);
    if (extra.length) det.appendChild(h("p.small", extra.join(" · ")));
    return det;
  };

  /** The big learn card for a word or chunk. opts: {showEnglish, mic} */
  App.itemCard = function (it, opts) {
    opts = opts || {};
    const S = Store.state.settings;
    const showEn = opts.showEnglish ?? S.showEnglish;
    const card = h("div.card.card-hero.item-card");
    const top = h("div.item-top");
    const word = App.wordBig(it);
    top.appendChild(word);
    const chips = h("div.chips");
    const gc = App.genderChip(it, it.plural && it.plural !== it.es && it.gender !== "mf" ? `${it.gender === "f" ? "las" : "los"} ${it.plural}` : null);
    if (gc) chips.appendChild(gc);
    chips.appendChild(h("span.tag", it.cat === "chunk" ? chunkKind(it) : posLabel(it.pos)));
    if (it.topic && it.topic !== "function") chips.appendChild(h("span.tag", it.topic));
    top.appendChild(chips);
    card.appendChild(top);
    card.appendChild(App.audioRow(it.es, { item: it }));
    const gloss = h("div.gloss", it.en);
    if (!showEn) {
      gloss.classList.add("hidden-gloss");
      gloss.textContent = "Tap to show English";
      gloss.setAttribute("role", "button");
      gloss.tabIndex = 0;
      gloss.onclick = () => { gloss.textContent = it.en; gloss.classList.remove("hidden-gloss"); };
    }
    card.appendChild(gloss);
    if (it.pos === "adj" && it.fem && it.fem !== it.es) card.appendChild(h("p.forms", `${it.es} / ${it.fem}` + (it.plural ? ` · ${it.plural} / ${Grader.derivePlural(it.fem)}` : "")));
    if (it.cat === "chunk" && it.slot) {
      card.appendChild(h("p.forms", "Pattern: ", h("strong", it.slot), it.slot_examples ? "  e.g. " + it.slot_examples.join(", ") : ""));
    }
    if (Array.isArray(it.natural) && it.natural.length) {
      // "sounds like" only for a respelling that really is this item said fast; alternates / related phrases are
      // labelled "you'll also hear" (.natural.alt)
      const real = App.naturalOf(it), others = App.otherNaturals(it);
      const nat = h("div.natural-row");
      if (real) nat.appendChild(h("span.natural", { lang: "es" }, real, App.playBtn(real, "natural", { label: "" })));
      others.forEach((n) => nat.appendChild(h("span.natural.alt", { lang: "es" }, n, App.playBtn(n, "natural", { label: "" }))));
      card.appendChild(nat);
    }
    if (it.ex_es) {
      const ex = h("div.example-row",
        h("p.example", { lang: "es" }, it.ex_es, it.ex_en ? h("span.en", { lang: "en" }, it.ex_en) : null),
        h("div.audio-row", App.playBtn(it.ex_es, "careful", { label: "" }), App.playBtn(it.ex_es, "slow", { label: "" }), App.playBtn(it.ex_es, "natural", { label: "" })));
      card.appendChild(ex);
    }
    if (it.note) card.appendChild(h("p.note", { html: "💡 " + App.inline(it.note) }));
    if (it.pos === "verb") { const t = App.conjTable(it); if (t) card.appendChild(t); }
    if (opts.mic !== false && window.Speech && Speech.canListen) card.appendChild(App.micButton([it.es, App.withArticle(it)]));
    return card;
  };
  function posLabel(p) {
    return { noun: "noun", verb: "verb", adj: "adjective", adv: "adverb", pron: "pronoun", prep: "preposition", conj: "conjunction",
      det: "determiner", num: "number", interj: "expression" }[p] || p || "";
  }
  function chunkKind(it) { return { phrase: "phrase", collocation: "word pair", frame: "pattern", filler: "filler", question: "question", reply: "reply" }[it.kind] || "phrase"; }
  App.posLabel = posLabel;

  /** "Say it" mic button. Grades the transcript with the grader. */
  App.micButton = function (accepted, onResult) {
    const wrap = h("div.mic-wrap");
    const out = h("div.mic-out");
    const btn = h("button.btn.btn-secondary.mic-btn", {
      type: "button", onclick: async () => {
        btn.disabled = true; btn.textContent = "🎙 Listening…";
        try {
          const alts = await Speech.listen();
          let best = null;
          for (const a of alts) { const r = Grader.gradeAnswer(a, accepted); if (!best || r.score > best.score) best = Object.assign(r, { heard: a }); }
          out.innerHTML = "";
          out.appendChild(h("p.small", "I heard: ", h("em", best.heard)));
          out.appendChild(App.feedback(best, { answer: accepted[0], line: best.outcome === "good" ? "¡Muy bien! Clear as day." : best.outcome === "close" ? "Almost — try once more." : "Hmm, I didn't catch that. Try again?" }));
          if (onResult) onResult(best);
        } catch (e) {
          out.textContent = e.message === "no-speech" ? "I didn't hear anything — try again." : e.message === "not-allowed" ? "Microphone access was blocked." : "Speech recognition isn't available right now.";
        } finally { btn.disabled = false; btn.textContent = "🎙 Say it"; }
      },
    }, "🎙 Say it");
    wrap.appendChild(btn); wrap.appendChild(out);
    return wrap;
  };

  // ------------------------------------------------------------------ answer event (for the rating tracker)
  /**
   * The single "an exercise was answered" signal. web/js/rating.js (docs/RATING.md) listens for it; nothing here
   * depends on a listener existing. Emit exactly once per answered exercise, BEFORE any Store.rate for that answer
   * (the listener reads the card's previous `last`).
   *
   * window "penguin:answer" CustomEvent, detail:
   *   itemId     course item / "my_" phrase id, or null
   *   itemKind   "word"|"chunk"|"phrase"|"grammar"|"sound"|"prompt"|"story"|"reading"|"chat"|"say"
   *   refId      grammar unit / sound rule / prompt / story / reading / chat topic id, or null
   *   refIndex   drill index within a grammar unit or sound rule, story beat index, reading sentence index; else null
   *   exType     recognise-choice, recognise-flash, hear-flash, listen-choice, listen-meaning, listen-natural-meaning,
   *              listen-type, listen-natural, produce-choice, produce-recall, produce-type, cloze, cloze-choice, gender,
   *              dictation, conj-hear, conj-produce, tiles, build-type, grammar-choice, grammar-fill, grammar-transform,
   *              grammar-translate, sound-pick, sound-type, prompt, story-beat, story-all, read-mark, say-try,
   *              mine-produce, mine-hear, chat-turn
   *   mode       "choice"|"type"|"tiles"|"flash"|"free"
   *   nChoices   number of options (choice mode) or null
   *   outcome    "good"|"close"|"miss"|"unsure"
   *   score      0–1 or null
   *   hintsUsed, slowUsed, retry (same-round repeat), production (typed/said Spanish from meaning or sound)
   *   context    "lesson"|"review"|"grammar"|"sounds"|"speak"|"story"|"read"|"say"|"chat"
   *   slip       outcome good but the grader attached a grammar note
   *   level      chat level for chat turns, else null
   *   srs        self-rated flash cards: the button chosen ("again"|"hard"|"good"|"easy"), else null
   *   ts         ms
   */
  App.emitAnswer = function (d) {
    const detail = Object.assign({ itemId: null, itemKind: null, refId: null, refIndex: null, exType: null, mode: null, nChoices: null,
      outcome: "miss", score: null, hintsUsed: 0, slowUsed: false, retry: false, context: null, production: false, slip: false,
      level: null, srs: null }, d || {}, { ts: Date.now() });
    try { window.dispatchEvent(new CustomEvent("penguin:answer", { detail })); } catch (e) { /* old browser: ignore */ }
    return detail;
  };
  App.itemKindOf = (it) => (!it ? null : it.cat === "chunk" ? "chunk" : it.cat === "mine" ? "phrase" : "word");
  const hasSlip = (res) => res.outcome === "good" && (res.notes || []).some((n) => n.kind === "grammar");

  // ------------------------------------------------------------------ hint ladder
  /** Three cues for typed recall: first letters, then half of each word, then {audio: true} (play the answer). */
  App.hintLadder = function (answer) {
    const a = String(answer || "");
    const l1 = a.replace(/\p{L}+/gu, (w) => w[0] + "·".repeat(w.length - 1));
    const l2 = a.replace(/\p{L}+/gu, (w) => { const k = Math.ceil(w.length / 2); return w.slice(0, k) + "·".repeat(w.length - k); });
    return [l1, l2, { audio: true }];
  };

  // ------------------------------------------------------------------ exercise runner
  /**
   * ex = {mode: "choice"|"type"|"tiles"|"flash", title, prompt (Node|string), answers [], display (answer to show),
   *       options [], lang ("es"|"en"), why, audio {text, speed, item, ramp, slowText}, autoplay, item, id (card id),
   *       free (spec for gradeFree), hints [cues] + hintAudio {text, item}, production, listen (text after audio),
   *       after (Node shown under the feedback), exType, itemKind, refId, refIndex, context, retry}
   * opts = {rate: bool (show SRS rate row), onDone(result, rating), onAnswer(result), nextLabel, context}
   * audio.ramp: autoplay at natural speed; the one "Play again" button steps natural → careful → slow (slow sets res.slowUsed).
   */
  App.exercise = function (ex, opts) {
    opts = opts || {};
    const root = h("div.exercise.card", { "data-mode": ex.mode });
    if (ex.title) root.appendChild(h("p.ex-title", ex.title));
    const prompt = h("div.ex-prompt");
    if (typeof ex.prompt === "string") prompt.innerHTML = ex.prompt; else if (ex.prompt) prompt.appendChild(ex.prompt);
    root.appendChild(prompt);
    if (ex.help) root.appendChild(ex.help);
    let slowUsed = false;
    const auto = ex.autoplay !== false && Store.state.settings.autoplay !== false;
    if (ex.audio && ex.audio.ramp) {
      const SPEEDS = ["natural", "careful", "slow"], LBL = { natural: "natural speed", careful: "careful", slow: "slow" };
      let k = 0;
      const textFor = (sp) => (sp === "natural" ? (ex.audio.natText || ex.audio.text) : (ex.audio.slowText || ex.audio.text));
      const now = h("span.small.muted.ramp-now", "▶ natural speed");
      const btn = h("button.audio-btn.ramp-btn", { type: "button", title: "play again, a bit slower each time" });
      const paint = () => { btn.textContent = `Play again (${LBL[SPEEDS[Math.min(k + 1, 2)]]})`; now.textContent = `▶ ${LBL[SPEEDS[k]]}`; };
      const play = (sp) => { if (sp === "slow") slowUsed = true; return App.say(textFor(sp), sp); };
      btn.onclick = (e) => {
        e.stopPropagation();
        k = Math.min(k + 1, 2);
        btn.classList.add("playing");
        Promise.resolve(play(SPEEDS[k])).finally(() => btn.classList.remove("playing"));
        paint();
      };
      paint();
      root.appendChild(h("div.audio-row.ramp-row", btn, now));
      if (auto) setTimeout(() => { if (root.isConnected) play("natural"); }, 250);
    } else if (ex.audio && ex.noAudioRow) {
      if (auto) setTimeout(() => { if (root.isConnected) App.say(ex.audio.text, ex.audio.speed || "careful", ex.audio.item); }, 250);
    } else if (ex.audio) {
      const ar = h("div.audio-row");
      ar.appendChild(App.playBtn(ex.audio.text, ex.audio.speed || "careful", { item: ex.audio.item, label: ex.audio.speed === "natural" ? "Play again (fast)" : "Play again" }));
      const slowB = App.playBtn(ex.audio.speed === "natural" ? (ex.audio.slowText || ex.audio.text) : ex.audio.text, "slow", {});
      slowB.addEventListener("click", () => { slowUsed = true; });
      ar.appendChild(slowB);
      root.appendChild(ar);
      if (auto) setTimeout(() => { if (root.isConnected) App.say(ex.audio.text, ex.audio.speed || "careful", ex.audio.item); }, 250);
    }
    const body = h("div.ex-body");
    root.appendChild(body);
    const fb = h("div.ex-feedback");
    root.appendChild(fb);
    const actions = h("div.ex-actions");
    root.appendChild(actions);
    let finished = false, emitted = false;
    const item = ex.item || null;

    function emit(res, srs) {
      if (emitted) return;
      emitted = true;
      App.emitAnswer({
        itemId: ex.id || (item && item.id) || null, itemKind: ex.itemKind || App.itemKindOf(item), refId: ex.refId || null,
        refIndex: ex.refIndex != null ? ex.refIndex : null, exType: ex.exType || null, mode: ex.mode,
        nChoices: ex.mode === "choice" ? (ex.options || []).length : null, outcome: res.outcome, score: typeof res.score === "number" ? res.score : null,
        hintsUsed: res.hintsUsed || 0, slowUsed: !!res.slowUsed, retry: !!ex.retry, context: opts.context || ex.context || null,
        production: !!ex.production, slip: hasSlip(res), srs: srs || null,
      });
    }
    function listenReveal() {
      // text after audio, always: the written form, what was played fast, replay buttons
      const t = ex.audio && (ex.audio.slowText || ex.audio.text);
      if (!t) return null;
      const fast = ex.audio.natText && App.fold(ex.audio.natText) !== App.fold(t) ? ex.audio.natText : (ex.audio.speed === "natural" && App.fold(ex.audio.text) !== App.fold(t) ? ex.audio.text : null);
      return h("div.listen-reveal", fast ? h("span.small", "said fast: ", h("em.natural", { lang: "es" }, fast), " ") : null,
        App.playBtn(t, "careful", { label: "Careful" }), App.playBtn(fast || t, "natural", { label: "Natural" }));
    }
    function finish(res, displayOpts) {
      if (finished) return;
      finished = true;
      res.slowUsed = !!(res.slowUsed || slowUsed);
      root.classList.add("answered", res.outcome);
      fb.innerHTML = "";
      const extraBits = [];
      if (ex.listen && res.outcome !== "unsure") extraBits.push(listenReveal());
      if (ex.production && res.outcome !== "unsure" && !ex.listen) {
        const ans = ex.display || (ex.answers || [])[0];
        if (ans) {
          extraBits.push(h("div.audio-row.prod-audio", App.playBtn(ans, "careful", { label: "Careful", item }), App.playBtn(ans, "natural", { label: "Natural", item })));
          setTimeout(() => App.say(ans, "careful", item), 150);
        }
      }
      if (ex.after) extraBits.push(ex.after);
      if (displayOpts && displayOpts.extra) extraBits.unshift(displayOpts.extra);
      const extra = extraBits.filter(Boolean).length ? h("div.fb-extra", extraBits.filter(Boolean)) : null;
      fb.appendChild(App.feedback(res, Object.assign({ answer: ex.display || (ex.answers || [])[0], why: ex.why, answerLang: ex.lang, alwaysAnswer: !!ex.listen },
        displayOpts || {}, { extra })));
      actions.innerHTML = "";
      const sug = Store.suggest(res);
      const selfRated = ex.mode === "flash" && opts.rate && ex.id;
      if (!selfRated) emit(res);
      if (opts.rate && ex.id) {
        const rr = App.rateRow(ex.id, sug, (k) => done(res, k), ex.rateOpts);
        actions.appendChild(rr);
        root._enter = () => done(res, sug);
      } else {
        const nb = h("button.btn.btn-primary.btn-next", { type: "button", onclick: () => done(res, sug) }, opts.nextLabel || "Next →");
        actions.appendChild(nb);
        root._enter = () => done(res, sug);
        setTimeout(() => nb.focus(), 30);
      }
      if (opts.onAnswer) opts.onAnswer(res);
    }
    /** "Not sure": reveal the answer (with a refresher card for words), no guessing, scheduled like a miss. */
    function notSure() {
      if (finished) return;
      if (root._lock) root._lock();
      const it = ex.item && ex.item.cat !== "mine" ? ex.item : null;
      const extra = it ? h("div.refresher.refresher-inline", App.wordBig(it), h("p.gloss", it.en),
        h("div.audio-row", App.playBtn(it.es, "careful", { item: it }), App.playBtn(it.es, "slow", { item: it })),
        it.ex_es ? h("p.example", { lang: "es" }, it.ex_es, it.ex_en ? h("span.en", it.ex_en) : null) : null) : null;
      Store.noteUnsure(ex.item ? ex.item.id : null);
      finish({ outcome: "unsure", score: 0, notes: [], hintsUsed: hintsUsed }, { alwaysAnswer: !it, answer: it ? null : (ex.display || (ex.answers || [])[0]), line: App.line("unsure"), extra, showDiff: false });
      if (it) App.say(it.es, "careful", it);
      else if (ex.lang !== "en" && (ex.display || (ex.answers || [])[0])) App.say(ex.display || ex.answers[0], "careful");
    }
    root._unsure = notSure;
    const unsureBtn = () => h("button.btn.btn-ghost.btn-unsure", { type: "button", title: "Not sure (? or 0)", onclick: notSure }, "Not sure 🤷");
    let doneCalled = false;
    function done(res, rating) {
      if (doneCalled) return;
      doneCalled = true;
      root._enter = null;
      if (ex.mode === "flash" && opts.rate && ex.id) emit(res, rating);   // self-rated card: the event carries the button
      if (opts.onDone) opts.onDone(res, rating);
    }
    // hint ladder (typed recall)
    let hintsUsed = 0;
    const hintLine = h("div.hint-line", { "aria-live": "polite" });
    function hintButton() {
      if (!ex.hints || !ex.hints.length) return null;
      const b = h("button.btn.btn-ghost.btn-hint", { type: "button", title: "a little help" }, "Hint 💡");
      b.onclick = () => {
        if (finished || hintsUsed >= ex.hints.length) return;
        const cue = ex.hints[hintsUsed++];
        if (cue && cue.audio) {
          const a = ex.hintAudio || { text: ex.display || ex.answers[0] };
          App.say(a.text, "careful", a.item);
          hintLine.appendChild(h("span.hint-cue", "🔊 ", App.playBtn(a.text, "careful", { label: "Hear it again", item: a.item })));
        } else hintLine.replaceChildren(h("span.hint-cue", { lang: "es" }, cue));
        if (hintsUsed >= ex.hints.length) b.disabled = true;
        else b.textContent = `Hint ${hintsUsed + 1} 💡`;
      };
      return b;
    }

    if (ex.mode === "choice") {
      const grid = h("div.choice-grid");
      const opts2 = ex.options || [];
      opts2.forEach((o, i) => {
        const b = h("button.choice", { type: "button", lang: ex.optLang || "", "data-key": i + 1 }, h("span.key", String(i + 1)), " ", o);
        b.onclick = () => {
          if (finished) return;
          const right = (ex.answers || []).some((a) => App.fold(a) === App.fold(o));
          b.classList.add("selected", right ? "correct" : "wrong");
          App.$$(".choice", grid).forEach((c) => {
            c.disabled = true;
            if ((ex.answers || []).some((a) => App.fold(a) === App.fold(c.textContent.replace(/^\d+\s*/, "")))) c.classList.add("correct");
          });
          if (ex.optLang === "es" && !ex.listen) App.say(ex.answers[0], "careful");
          finish({ outcome: right ? "good" : "miss", score: right ? 1 : 0, notes: [], picked: o }, { answer: ex.display || ex.answers[0], alwaysAnswer: !!ex.listen });
          if (ex.onPick) ex.onPick(right, o);
        };
        grid.appendChild(b);
      });
      body.appendChild(grid);
      body.appendChild(h("div.ex-secondary", unsureBtn()));
      root._lock = () => App.$$(".choice", grid).forEach((c) => {
        c.disabled = true;
        if ((ex.answers || []).some((a) => App.fold(a) === App.fold(c.textContent.replace(/^\d+\s*/, "")))) c.classList.add("correct");
      });
      root._keys = (k) => { const b = grid.querySelector(`[data-key="${k}"]`); if (b && !finished) b.click(); };
    } else if (ex.mode === "type") {
      const multi = !!ex.multiline;
      const inp = h(multi ? "textarea.answer-input" : "input.answer-input", {
        type: multi ? null : "text", lang: ex.lang === "en" ? "en" : "es", autocomplete: "off", autocapitalize: "off", spellcheck: "false",
        placeholder: ex.placeholder || (ex.lang === "en" ? "Type the English…" : "Escribe en español…"), rows: multi ? 3 : null,
        "aria-label": "your answer",
      });
      const check = h("button.btn.btn-primary", { type: "button" }, "Check");
      const giveUp = unsureBtn();
      const hb = hintButton();
      const row = h("div.answer-row", inp, check);
      body.appendChild(row);
      if (ex.hints) body.appendChild(hintLine);
      if (ex.lang !== "en") body.appendChild(accentBar(inp));
      body.appendChild(h("div.ex-secondary", hb, giveUp));
      const grade = () => {
        const val = inp.value;
        if (!val.trim()) { inp.focus(); return; }
        let res = ex.grade ? ex.grade(val) : ex.free ? Grader.gradeFree(val, ex.free) : Grader.gradeAnswer(val, ex.answers, { lang: ex.lang });
        res.hintsUsed = hintsUsed;
        inp.readOnly = true; check.disabled = true; giveUp.disabled = true; if (hb) hb.disabled = true;
        finish(res);
      };
      check.onclick = grade;
      root._lock = () => { inp.readOnly = true; check.disabled = true; giveUp.disabled = true; if (hb) hb.disabled = true; };
      inp.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey && !finished) { e.preventDefault(); e.stopPropagation(); grade(); } });
      setTimeout(() => { if (root.isConnected && !("ontouchstart" in window)) inp.focus(); }, 60);
    } else if (ex.mode === "tiles") {
      const tw = App.tiles(ex, (res) => finish(res, { alwaysAnswer: true }));
      body.appendChild(tw);
      body.appendChild(h("div.ex-secondary", unsureBtn()));
      root._lock = () => { tw._locked = true; App.$$("button", tw).forEach((b) => (b.disabled = true)); };
    } else if (ex.mode === "flash") {
      const fc = h("div.flashcard", { tabindex: 0, role: "button", "aria-pressed": "false", "aria-label": "flip card" },
        h("div.front", ex.front || ""), h("div.back", ex.back || ""));
      const flip = h("button.btn.btn-primary", { type: "button" }, "Show answer");
      const doFlip = () => {
        if (fc.classList.contains("flipped")) return;
        fc.classList.add("flipped"); fc.setAttribute("aria-pressed", "true"); flip.remove();
        if (ex.backAudio) App.say(ex.backAudio, "careful");
        if (opts.rate && ex.id) {
          actions.innerHTML = "";
          const map = { again: "miss", hard: "close", good: "good", easy: "good" };
          const rr = App.rateRow(ex.id, null, (k) => done({ outcome: map[k], score: null, notes: [] }, k), ex.rateOpts);
          actions.appendChild(rr);
          root._keys = (k) => { const b = rr.querySelectorAll("button")[k - 1]; if (b) b.click(); };
          root._enter = () => done({ outcome: "good", score: null, notes: [] }, "good");
        } else {
          finish({ outcome: "good", score: null, notes: [] }, { showDiff: false });
        }
      };
      fc.onclick = (e) => { if (!e.target.closest("button")) doFlip(); };
      flip.onclick = doFlip;
      root._enter = doFlip;
      body.appendChild(fc);
      const nsb = unsureBtn();
      nsb.onclick = () => {
        if (fc.classList.contains("flipped")) return;
        fc.classList.add("flipped"); fc.setAttribute("aria-pressed", "true"); flip.remove(); nsb.remove();
        Store.noteUnsure(ex.id || (ex.item && ex.item.id));
        if (opts.rate && ex.id) {
          actions.innerHTML = "";
          fb.innerHTML = "";
          fb.appendChild(App.feedback({ outcome: "unsure", notes: [] }, { line: App.line("unsure"), showDiff: false }));
          const rr = App.rateRow(ex.id, "again", (k) => done({ outcome: "unsure", score: 0, notes: [] }, k), ex.rateOpts);
          actions.appendChild(rr);
          root._enter = () => done({ outcome: "unsure", score: 0, notes: [] }, "again");
        } else finish({ outcome: "unsure", score: 0, notes: [] }, { showDiff: false, line: App.line("unsure") });
      };
      root._unsure = () => nsb.click();
      actions.appendChild(flip);
      actions.appendChild(nsb);
    }
    return root;
  };

  /** Accent helper buttons (á é í ó ú ñ ü ¿ ¡) inserting into the input. */
  function accentBar(target) {
    const get = typeof target === "function" ? target : () => target;
    const bar = h("div.accent-keys", { role: "group", "aria-label": "insert accented letter" });
    ["á", "é", "í", "ó", "ú", "ñ", "ü", "¿", "¡"].forEach((c) => bar.appendChild(h("button.btn", {
      type: "button", tabindex: -1, onmousedown: (e) => e.preventDefault(),
      onclick: () => {
        const inp = get();
        if (!inp) return;
        const s = inp.selectionStart ?? inp.value.length, e = inp.selectionEnd ?? inp.value.length;
        inp.value = inp.value.slice(0, s) + c + inp.value.slice(e);
        inp.focus(); inp.setSelectionRange(s + 1, s + 1);
      },
    }, c)));
    return bar;
  }
  App.accentBar = accentBar;

  /** Sentence building tiles. ex: {answers:[sentence], tiles:[...words], distractors:[]} */
  App.tiles = function (ex, onChecked) {
    const wrap = h("div.tiles-wrap");
    const slots = h("div.tile-slots", { "aria-label": "your sentence" });
    const bank = h("div.tile-bank", { "aria-label": "word tiles" });
    const words = App.shuffle(ex.tiles.concat(ex.distractors || []));
    const placed = [];
    function refresh() { slots.classList.toggle("empty", !placed.length); check.disabled = !placed.length; }
    slots.classList.add("empty");
    words.forEach((w) => {
      const t = h("button.tile", { type: "button", lang: "es" }, w);
      t.onclick = () => {
        if (t.classList.contains("used") || wrap._locked) return;
        t.classList.add("used");
        const s = h("button.tile.placed", { type: "button", lang: "es" }, w);
        s.onclick = () => { if (wrap._locked) return; s.remove(); placed.splice(placed.indexOf(s), 1); t.classList.remove("used"); refresh(); };
        placed.push(s);
        slots.appendChild(s);
        refresh();
      };
      bank.appendChild(t);
    });
    const check = h("button.btn.btn-primary", { type: "button", disabled: true }, "Check");
    const reset = h("button.btn.btn-ghost", { type: "button", onclick: () => {
      if (wrap._locked) return;
      placed.splice(0).forEach((s) => s.remove());
      App.$$(".tile.used", bank).forEach((t) => t.classList.remove("used"));
      refresh();
    } }, "Clear");
    check.onclick = () => {
      const text = placed.map((p) => p.textContent).join(" ");
      const res = Grader.gradeAnswer(text, ex.answers);
      wrap._locked = true; check.disabled = true; reset.disabled = true;
      App.say(ex.answers[0], "careful");
      onChecked(res);
    };
    wrap.appendChild(slots);
    wrap.appendChild(bank);
    wrap.appendChild(h("div.answer-row.tiles-actions", reset, check));
    return wrap;
  };

  // ------------------------------------------------------------------ exercise generators
  const shortEn = (en) => String(en || "").split(/[;,(/]/)[0].trim().replace(/^(to|the|a|an) /i, "") || en;
  App.shortEn = shortEn;
  /** Option text for an item's meaning: chunks keep their comma ("slower, please"), words take the first sense. */
  const optEn = (it) => (it.cat === "chunk" ? String(it.en || "").split(/[;(]/)[0].trim() || it.en : shortEn(it.en));
  App.optEn = optEn;
  const FN_POS = new Set(["det", "prep", "conj", "pron"]);
  /** Very common function words (el, la, de, que, y…): practised in sentences only, never as isolated cards. */
  App.isFunctionWord = (it) => !!it && it.cat === "word" && FN_POS.has(it.pos) && (it.rank || 9999) <= 150;
  const repsOf = (it) => { const c = it && Store.state.cards[it.id]; return c ? c.reps || 0 : 0; };

  let lessonIdx = null;
  /** Course position (index of the first lesson that teaches the item), or undefined. */
  App.lessonIndexOf = function (id) {
    if (!lessonIdx) {
      lessonIdx = new Map();
      App.lessons().forEach((l, i) => (l.steps || []).forEach((s) => { if (s.type === "learn") (s.items || []).forEach((x) => { if (!lessonIdx.has(x)) lessonIdx.set(x, i); }); }));
    }
    return lessonIdx.get(id);
  };
  /**
   * Plausible wrong options. Pool in priority: learned items of the same kind (pos / chunk) and topic; learned of the same
   * kind; items from lessons within ±3 (same kind, then any); then the nearest rank. Spanish options prefer a similar
   * form (same first letter, edit distance ≤ 3, length within 30%; chunks: similar word count). Options whose English
   * equals the answer's are dropped.
   */
  function distractors(it, n, field, spanish) {
    const all = App.allItems();
    const kind = (x) => (it.cat === "chunk" ? x.cat === "chunk" : x.cat === "word" && x.pos === it.pos);
    const li = App.lessonIndexOf(it.id);
    const near = (x) => { if (li == null) return false; const lx = App.lessonIndexOf(x.id); return lx != null && Math.abs(lx - li) <= 3; };
    const learned = (x) => Store.isLearned(x.id);
    const base = App.fold(field(it));
    const wc = (s) => String(s).trim().split(/\s+/).length;
    const sim = (x) => {
      const v = App.fold(field(x));
      if (it.cat === "chunk") return -Math.abs(wc(v) - wc(base));
      return (v[0] === base[0] ? 1 : 0) + (Grader.levenshtein(v, base) <= 3 ? 1 : 0) + (Math.abs(v.length - base.length) <= base.length * 0.3 ? 1 : 0);
    };
    const tiers = [(x) => learned(x) && kind(x) && x.topic === it.topic, (x) => learned(x) && kind(x), (x) => near(x) && kind(x), (x) => near(x)];
    const out = [], seen = new Set([base]), seenEn = new Set([App.fold(optEn(it))]);
    const take = (x) => {
      const v = field(x);
      if (!v || out.length >= n) return;
      const f = App.fold(v), fe = App.fold(optEn(x));
      if (seen.has(f) || seenEn.has(fe)) return;
      seen.add(f); seenEn.add(fe); out.push(v);
    };
    const run = (pool) => {
      pool = App.shuffle(pool);
      if (spanish) pool = pool.map((x) => [x, sim(x)]).sort((a, b) => b[1] - a[1]).map((p) => p[0]);
      for (const x of pool) { if (out.length >= n) break; take(x); }
    };
    for (const t of tiers) { if (out.length >= n) break; run(all.filter((x) => x.id !== it.id && t(x))); }
    if (out.length < n) {
      const r = it.rank || 9999;
      run(all.filter((x) => x.id !== it.id && kind(x)).sort((a, b) => Math.abs((a.rank || 9999) - r) - Math.abs((b.rank || 9999) - r)).slice(0, 40));
    }
    if (out.length < n) run(all.filter((x) => x.id !== it.id));
    return out;
  }
  App.distractors = distractors;

  // ------------------------------------------------------------------ fast-speech respellings
  const phon = (s) => App.fold(s).replace(/qu/g, "k").replace(/c(?=[ei])/g, "s").replace(/z/g, "s").replace(/ll/g, "y").replace(/v/g, "b")
    .replace(/h/g, "").replace(/[^a-z]/g, "");
  /** True when two spellings sound the same anyway (c/z → s, ll → y, silent h): no "sounds like" note needed. */
  App.soundsSame = (a, b) => phon(a) === phon(b);
  function isSubseq(a, b) { let i = 0; for (const ch of b) if (ch === a[i]) i++; return i === a.length; }
  let sharedNat = null;
  /**
   * The fast-speech respelling that really is this item said fast, or null. Words: the respelling's letters must be a
   * subsequence of the word's (para → pa', todo → to'o) or one substitution away; otherwise (ser → "osea") play the
   * word itself fast. Chunks: skip a respelling shared with another chunk (¡buenas! for tardes and noches).
   */
  App.naturalOf = function (it) {
    if (!it || !Array.isArray(it.natural) || !it.natural.length) return null;
    if (it.cat === "chunk") {
      if (!sharedNat) {
        sharedNat = new Map();
        App.allItems().forEach((x) => { if (x.cat === "chunk") (x.natural || []).forEach((n) => { const k = phon(n); sharedNat.set(k, (sharedNat.get(k) || 0) + 1); }); });
      }
      return it.natural.find((n) => phon(n) && sharedNat.get(phon(n)) === 1) || null;
    }
    const base = phon(it.es);
    return it.natural.find((n) => {
      const r = phon(n);
      return r && (isSubseq(r, base) || (r.length === base.length && Grader.levenshtein(r, base) <= 1));
    }) || null;
  };
  /** Respellings that are NOT this item said fast (alternates, related phrases): shown as "You'll also hear". */
  App.otherNaturals = (it) => (Array.isArray(it.natural) ? it.natural.filter((n) => n !== App.naturalOf(it) && !(it.cat === "chunk" && phon(n) === phon(App.naturalOf(it) || ""))) : []);

  // ------------------------------------------------------------------ cloze, dictation, verb forms
  /** Find the item (or one of its forms) inside its example sentence -> {before, word, after, entry (verb forms)} */
  App.clozeOf = function (it) {
    if (!it.ex_es) return null;
    const s = it.ex_es;
    const forms = new Set();
    const core = App.fold(it.es.replace(/[¿?¡!…]|\.\.\./g, "").trim());
    if (it.cat === "chunk") {
      const idx = App.fold(s).indexOf(core);
      if (idx >= 0 && core.length > 1) return { before: s.slice(0, idx), word: s.slice(idx, idx + core.length), after: s.slice(idx + core.length) };
      return null;
    }
    forms.add(core);
    if (it.plural) forms.add(App.fold(it.plural));
    if (it.fem) forms.add(App.fold(it.fem));
    if (it.conj) for (const v of Object.values(it.conj)) {
      if (Array.isArray(v)) v.forEach((f) => forms.add(App.fold(f)));
      else if (typeof v === "string") forms.add(App.fold(v));
      else if (v && typeof v === "object") Object.values(v).forEach((f) => forms.add(App.fold(f)));
    }
    const re = /[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+/g;
    let m;
    while ((m = re.exec(s))) {
      if (forms.has(App.fold(m[0]))) {
        const out = { before: s.slice(0, m.index), word: m[0], after: s.slice(m.index + m[0].length) };
        if (it.pos === "verb") {
          let es = [];
          try { es = (Grader.lookupExact || Grader.lookup)(m[0]).filter((e) => e.lemma === it.id); } catch (e) { es = []; }
          out.entry = es[0] || null;
        }
        return out;
      }
    }
    return null;
  };
  const TENSE_SHORT = { pres: "present", pret: "past", imp: "was / used to", fut: "future", subj: "subjunctive", cmd: "command",
    ger: "-ing form", part: "participle", inf: "infinitive", cond: "would" };
  const PERSON_SHORT = { "1s": "yo", "2s": "tú", "3s": "él / ella / usted", "1p": "nosotros", "3p": "ellos / ustedes" };
  App.TENSE_SHORT = TENSE_SHORT; App.PERSON_SHORT = PERSON_SHORT;
  // which grammar unit makes a tense fair game in gaps (null = always; "never" = not drilled in this course yet)
  const TENSE_UNIT = { pres: null, inf: null, ger: "g_progressive", part: null, pret: "g_preterite_regular", imp: "g_imperfect",
    subj: "g_subjunctive_taste", cmd: "g_commands", fut: "never", cond: "never" };
  App.tenseUnlocked = (t) => { const u = TENSE_UNIT[t]; return u === undefined || u === null ? true : u === "never" ? false : Store.isGrammarDone(u); };
  /** Verb gap label: "(pedir · ustedes · past)"; null when the form's tense isn't unlocked yet (no fair gap). */
  function gapLabel(it, entry) {
    if (!entry || !entry.tense) return `(${shortEn(it.en)})`;
    if (!App.tenseUnlocked(entry.tense)) return null;
    if (entry.tense === "inf") return `(${it.es})`;
    const who = PERSON_SHORT[entry.person];
    return `(${[it.es, who, TENSE_SHORT[entry.tense]].filter(Boolean).join(" · ")})`;
  }

  /** The example sentence as a dictation, when it has 3–9 words and at most one word he hasn't learned. */
  App.dictationOf = function (it) {
    const s = it && it.ex_es;
    if (!s) return null;
    const n = Grader.tokenize(s).length;
    if (n < 3 || n > 9) return null;
    if (App.unknownWords(s, { except: new Set([it.id]) }).length > 1) return null;
    return s;
  };

  const P5 = ["1s", "2s", "3s", "1p", "3p"];
  const REFL = ["me", "te", "se", "nos", "se"];
  const SUBJ_PRON = { "1s": ["yo"], "2s": ["tú", "tu"], "3s": ["él", "ella", "usted"], "1p": ["nosotros", "nosotras"], "3p": ["ellos", "ellas", "ustedes"] };
  /**
   * The drillable forms of a verb: [{key: "pres1s", form, bare, tense, person, unlocked}]. Reflexive lemmas carry the
   * pronoun (me voy, te vas…). Unlocked: present yo + él/usted from the start; every present person after g_present_ar;
   * the preterite after g_preterite_regular.
   */
  App.verbForms = function (it) {
    const c = (it && it.conj) || {};
    const refl = !!c.reflexive || /(ar|er|ir)se$/.test(it.es || "");
    const presAll = Store.isGrammarDone("g_present_ar"), pret = Store.isGrammarDone("g_preterite_regular");
    const out = [];
    ["pres", "pret"].forEach((t) => {
      if (!Array.isArray(c[t])) return;
      c[t].forEach((f, i) => {
        if (!f) return;
        const unlocked = t === "pres" ? (i === 0 || i === 2 || presAll) : pret;
        out.push({ key: t + P5[i], form: refl ? `${REFL[i]} ${f}` : f, bare: f, tense: t, person: P5[i], unlocked });
      });
    });
    return out;
  };
  /** The five-form row with the target highlighted, the infinitive and meaning (feedback for form cards). */
  function formRow(it, f) {
    const c = (it.conj || {})[f.tense] || [];
    const refl = !!(it.conj || {}).reflexive || /(ar|er|ir)se$/.test(it.es || "");
    return h("div.form-row-wrap",
      h("p.small", h("strong", { lang: "es" }, f.form), " = ", h("strong", { lang: "es" }, it.es), " — ", it.en, ` · ${PERSON_SHORT[f.person]} · ${TENSE_SHORT[f.tense]}`),
      h("div.form-row", { lang: "es" }, c.map((x, i) => h("span.form-cell", { class: P5[i] === f.person ? "target" : "" },
        h("small", ["yo", "tú", "él/usted", "nosotros", "ellos/ustedes"][i]), h("span", refl ? `${REFL[i]} ${x}` : x)))));
  }
  App.formRow = formRow;

  /**
   * Build an exercise for an item. type: recognise-choice | produce-choice | listen-choice | listen-meaning |
   * listen-natural-meaning | produce-type | produce-recall | listen-type | listen-natural | gender | cloze | cloze-choice |
   * dictation | conj-hear | conj-produce | recognise-flash | hear-flash. opts: {formKey}. May return null (no fair version).
   */
  App.makeExercise = function (it, type, opts) {
    const ex = makeExercise(it, type, opts || {});
    if (!ex) return null;
    if (!ex.item) ex.item = it;
    if (!ex.exType) ex.exType = type;
    return ex;
  };
  function makeExercise(it, type, opts) {
    const disp = App.withArticle(it);
    const accepted = Array.from(new Set([it.es, disp, it.es.replace(/[¿?¡!…]/g, "").trim()]));
    const big = () => App.wordBig(it);
    const ramp = repsOf(it) >= 1;
    const nat = App.naturalOf(it);
    const listenIcon = (fast) => h("div.listen-icon", fast ? "⚡🔊" : "🔊");
    switch (type) {
      case "recognise-choice": {
        const opts2 = App.shuffle([optEn(it)].concat(distractors(it, 3, optEn)));
        return { mode: "choice", title: "What does it mean?", prompt: big(), options: opts2, answers: [optEn(it)], display: it.en,
          audio: { text: it.es, speed: "careful", item: it }, optLang: "en", lang: "en" };
      }
      case "listen-meaning":
      case "listen-natural-meaning": {
        const fast = type === "listen-natural-meaning";
        const said = fast ? (nat || it.es) : it.es;
        const opts2 = App.shuffle([optEn(it)].concat(distractors(it, 3, optEn)));
        return { mode: "choice", title: fast ? "Fast speech — what does it mean?" : "Listen — what does it mean?", prompt: listenIcon(fast),
          options: opts2, answers: [optEn(it)], display: `${disp} — ${it.en}`, optLang: "en", lang: "en", listen: true,
          audio: fast || ramp ? { text: said, speed: "natural", natText: fast ? said : (nat || it.es), slowText: it.es, ramp: true }
            : { text: it.es, speed: "careful", item: it, slowText: it.es },
          why: fast && said !== it.es && !App.soundsSame(said, it.es) ? `Said fast, *${it.es}* can sound like *${said}*.` : null };
      }
      case "produce-choice": {
        const opts2 = App.shuffle([disp].concat(distractors(it, 3, (x) => App.withArticle(x), true)));
        return { mode: "choice", title: "How do you say it in Spanish?", prompt: h("div.prompt-en", it.en), options: opts2, answers: [disp], display: disp, optLang: "es" };
      }
      case "listen-choice": {
        const opts2 = App.shuffle([disp].concat(distractors(it, 3, (x) => App.withArticle(x), true)));
        return { mode: "choice", title: "Listen — which one did you hear?", prompt: listenIcon(), options: opts2, answers: [disp],
          display: `${disp} — ${it.en}`, optLang: "es", listen: true,
          audio: ramp ? { text: it.es, speed: "natural", natText: nat || it.es, slowText: it.es, ramp: true } : { text: it.es, speed: "careful", item: it, slowText: it.es } };
      }
      case "listen-natural": {
        const said = nat || it.es;
        return { mode: "type", title: "Fast speech — type what you hear (the normal spelling)", prompt: listenIcon(true),
          answers: accepted, display: `${disp} — ${it.en}`, audio: { text: said, speed: "natural", natText: said, slowText: it.es, ramp: true }, lang: "es",
          listen: true, production: true,
          why: said !== it.es && !App.soundsSame(said, it.es) ? `In fast speech *${it.es}* can sound like *${said}*.` : null };
      }
      case "listen-type":
        return { mode: "type", title: "Type what you hear", prompt: listenIcon(), answers: accepted, display: `${disp} — ${it.en}`, listen: true, production: true,
          audio: ramp ? { text: it.es, speed: "natural", natText: nat || it.es, slowText: it.es, ramp: true } : { text: it.es, speed: "careful", item: it, slowText: it.es }, lang: "es" };
      case "produce-type":
        return { mode: "type", title: "Type it in Spanish", prompt: h("div.prompt-en", it.en,
          it.pos === "noun" ? h("span.hint", " (with el/la)") : null), answers: it.pos === "noun" ? [disp, it.es] : accepted, display: disp, lang: "es", production: true };
      case "produce-recall":
        return { mode: "type", title: "From memory: say it out loud, then type it",
          prompt: h("div", h("div.prompt-en", it.en, it.pos === "noun" ? h("span.hint", " (with el/la)") : null),
            it.ex_en ? h("p.muted.recall-as", "as in: ", h("em", it.ex_en)) : null),
          answers: it.pos === "noun" ? [disp, it.es] : accepted, display: disp, lang: "es", production: true,
          hints: App.hintLadder(disp), hintAudio: { text: it.es, item: it } };
      case "gender": {
        const opts2 = it.gender === "mf" ? ["el", "la", "el/la"] : ["el", "la"];
        const ans = it.article === "el/la" ? "el/la" : it.article;
        return { mode: "choice", title: "Which article?", prompt: h("div.word-big", { lang: "es" }, "___ " + it.es), options: opts2, answers: [ans],
          display: disp, optLang: "es", why: it.note || (it.gender === "f" && it.article === "el" ? "Feminine, but takes *el* in the singular." :
            `*${it.es}* is ${{ m: "masculine", f: "feminine", mf: "either" }[it.gender]}.`) };
      }
      case "cloze": {
        const cz = App.clozeOf(it);
        const label = cz ? gapLabel(it, cz.entry) : null;
        if (!cz || !label) return Object.assign(makeExercise(it, "produce-recall", opts), { exType: "produce-recall" });
        const p = h("div.cloze", { lang: "es" }, cz.before, h("span.blank", "_____"), cz.after);
        return { mode: "type", title: "Fill the gap", prompt: h("div", p, it.ex_en ? h("div.ex-en", it.ex_en) : null, h("p.hint", { lang: it.pos === "verb" ? "es" : null }, label)),
          answers: [cz.word], display: it.ex_es, audio: null, lang: "es", production: true,
          help: App.wordHelp([cz.before, cz.after], { except: new Set([it.id]) }) };
      }
      case "cloze-choice": {
        // function words: pick the right little word inside the example sentence (el / la / los / las…)
        const cz = App.clozeOf(it);
        if (!cz) return null;
        const w = cz.word.toLowerCase();
        const FAM = [["el", "la", "los", "las"], ["un", "una", "unos", "unas"], ["del", "al", "de", "a"], ["que", "qué", "quien", "como"]];
        let pool = (FAM.find((f) => f.includes(w)) || []).filter((x) => x !== w);
        if (pool.length < 3) {
          pool = pool.concat(App.allItems().filter((x) => x.id !== it.id && App.isFunctionWord(x) && x.pos === it.pos && !/\s/.test(x.es)).map((x) => x.es.toLowerCase()));
          pool = pool.concat(App.allItems().filter((x) => x.id !== it.id && App.isFunctionWord(x) && !/\s/.test(x.es)).map((x) => x.es.toLowerCase()));
        }
        const opts2 = App.shuffle([w].concat(Array.from(new Set(pool.filter((x) => App.fold(x) !== App.fold(w)))).slice(0, 3)));
        const p = h("div.cloze", { lang: "es" }, cz.before, h("span.blank", "_____"), cz.after);
        return { mode: "choice", title: "Which little word fits?", prompt: h("div", p, it.ex_en ? h("div.ex-en", it.ex_en) : null),
          options: opts2, answers: [w], display: it.ex_es, optLang: "es" };
      }
      case "dictation": {
        const s = (opts && opts.sentence) || App.dictationOf(it) || it.ex_es;
        if (!s) return null;
        return { mode: "type", title: "Dictation: type the sentence you hear", prompt: listenIcon(), answers: [s], display: s, lang: "es",
          audio: { text: s, speed: "natural", natText: s, slowText: s, ramp: true }, listen: true, production: true,
          after: h("div.dictation-after", (opts && opts.en) || it.ex_en ? h("p.ex-en", (opts && opts.en) || it.ex_en) : null, App.wordHelp(s) || null) };
      }
      case "conj-hear": {
        const forms = App.verbForms(it);
        const f = forms.find((x) => x.key === (opts && opts.formKey)) || forms.find((x) => x.unlocked);
        if (!f) return null;
        const re = new RegExp(`(^|[^\\p{L}])${f.bare}([^\\p{L}]|$)`, "iu");
        const say = it.ex_es && f.tense === "pres" && re.test(it.ex_es) ? it.ex_es : f.form;
        const same = forms.filter((x) => x.tense === f.tense && App.fold(x.bare) === App.fold(f.bare)).map((x) => PERSON_SHORT[x.person]);
        return { mode: "choice", title: "Listen — who is it?", prompt: h("div", listenIcon(), h("p.muted", `A form of ${it.es} — who is doing it?`)),
          options: P5.map((p) => PERSON_SHORT[p]), answers: same, display: `${f.form} — ${PERSON_SHORT[f.person]}, ${TENSE_SHORT[f.tense]}`,
          optLang: "en", lang: "en", listen: true, formKey: f.key, after: formRow(it, f),
          audio: { text: say, speed: "natural", natText: say, slowText: say, ramp: true } };
      }
      case "conj-produce": {
        const forms = App.verbForms(it);
        const f = forms.find((x) => x.key === (opts && opts.formKey)) || forms.find((x) => x.unlocked);
        if (!f) return null;
        const answers = [f.form].concat(SUBJ_PRON[f.person].map((p) => `${p} ${f.form}`));
        return { mode: "type", title: "Say the form, then type it",
          prompt: h("div.prompt-en", h("strong", { lang: "es" }, it.es), " — ", it.en, " ", h("span.chip.primary", `${PERSON_SHORT[f.person]} · ${TENSE_SHORT[f.tense]}`)),
          answers, display: f.form, lang: "es", production: true, formKey: f.key, hints: App.hintLadder(f.form), hintAudio: { text: f.form }, after: formRow(it, f),
          // the subject pronoun is optional: grade the form itself
          grade: (val) => Grader.gradeAnswer(String(val).replace(/^\s*(yo|tú|tu|él|ella|usted|nosotros|nosotras|ellos|ellas|ustedes)\s+(?=\S)/i, ""), [f.form]) };
      }
      case "hear-flash":
        return { mode: "flash", title: "Listen — what does it mean? Then flip.",
          front: [listenIcon(), h("div.audio-row", App.playBtn(it.es, "careful", { item: it }), App.playBtn(it.es, "slow", { item: it }), App.playBtn(it.es, "natural", { item: it })),
            h("p.muted", "Say the meaning to yourself, then flip.")],
          back: [App.wordBig(it), h("p.gloss", it.en), it.ex_es ? h("p.example", { lang: "es" }, it.ex_es, it.ex_en ? h("span.en", it.ex_en) : null) : null],
          audio: ramp ? { text: nat || it.es, speed: "natural" } : { text: it.es, speed: "careful", item: it }, noAudioRow: true };
      case "recognise-flash":
      default:
        return { mode: "flash", front: [big(), h("div.audio-row", App.playBtn(it.es, "careful", { item: it }), App.playBtn(it.es, "natural", { item: it }))],
          back: [h("p.gloss", it.en), it.ex_es ? h("p.example", { lang: "es" }, it.ex_es, it.ex_en ? h("span.en", it.ex_en) : null) : null,
            nat ? h("span.natural", { lang: "es" }, nat) : null],
          audio: null, autoplayFront: it.es, exType: "recognise-flash" };
    }
  }

  // ------------------------------------------------------------------ word help for words not learned yet
  const SKIP_POS = new Set(["det", "prep", "conj", "pron"]);
  /** Spanish words in `texts` whose lemma the learner hasn't learned -> [{form, item}] (deduped by lemma). */
  App.unknownWords = function (texts, opts) {
    opts = opts || {};
    const seen = new Set(), out = [];
    const all = (Array.isArray(texts) ? texts : [texts]).filter(Boolean).join(" ");
    // words inside phrases already learned count as known ("buenas tardes" covers buenas + tardes)
    const chunkWords = new Set();
    for (const id of Object.keys(Store.state.learned)) {
      const it = App.item(id);
      if (it && it.cat === "chunk") Grader.tokenize(it.es).forEach((t) => chunkWords.add(t.f));
    }
    for (const t of Grader.tokenize(all)) {
      if (/^\d+$/.test(t.n) || chunkWords.has(t.f)) continue;
      const entries = Grader.lookup(t.n);
      if (!entries.length) continue;
      const lemmas = Array.from(new Set(entries.map((e) => e.lemma)));
      const items = lemmas.map((id) => App.item(id)).filter(Boolean);
      if (!items.length) continue;
      if (items.some((x) => Store.isLearned(x.id) || (opts.except && opts.except.has(x.id)))) continue;
      const it = items.slice().sort((a, b) => (a.rank || 9999) - (b.rank || 9999))[0];
      if (SKIP_POS.has(it.pos) && (it.rank || 9999) <= 150) continue;      // very common function words
      if (seen.has(it.id)) continue;
      seen.add(it.id);
      const same = items.filter((x) => x !== it && App.fold(x.es) === App.fold(it.es));
      out.push({ form: t.raw.toLowerCase(), item: it, also: same.map((x) => App.shortEn(x.en)) });
    }
    return out;
  };
  /**
   * "Word help" row: chips es — en for words not learned yet (tap = hear it). null when there are none.
   * opts.lemma: show the dictionary form only ("trabajar — work"), never the inflected form (grammar drills).
   */
  App.wordHelp = function (texts, opts) {
    opts = opts || {};
    const words = App.unknownWords(texts, opts);
    if (!words.length) return null;
    const row = h("div.word-help", h("span.fb-label", "Word help"));
    words.slice(0, 8).forEach(({ form, item, also }) => {
      const glosses = [];
      [App.shortEn(item.en)].concat(also || []).forEach((g) => { if (g && !glosses.some((x) => App.fold(x) === App.fold(g))) glosses.push(g); });
      const gloss = glosses.slice(0, 2).join(" / ");
      const label = opts.lemma ? item.es : form;
      const lemma = !opts.lemma && App.fold(form) !== App.fold(item.es) && App.fold(glosses[0] || "") !== App.fold(item.es) ? ` (${item.es})` : "";
      row.appendChild(h("button.chip.help-chip", { type: "button", lang: "es", title: "tap to hear it", onclick: () => App.say(label, "careful") },
        h("strong", label), h("span.help-en", ` — ${gloss}${lemma}`)));
    });
    return row;
  };

  /** Sentence-building exercise from an item's example (null when it would have fewer than four tiles). */
  App.buildExercise = function (it, others) {
    const sentence = it.ex_es;
    if (!sentence) return null;
    const raw = sentence.replace(/[—–-]/g, " ").replace(/[¿?¡!.,;:«»"“”…()]/g, " ").split(/\s+/).filter(Boolean);
    if (raw.length < 4) return null;
    // lower-case every tile except proper nouns, so a capital doesn't give away the first word
    const known = (w) => { try { return Grader.lookup(w).length > 0; } catch (e) { return false; } };
    const words = raw.map((w, i) => (/^\p{Lu}/u.test(w) && (i > 0 || !known(w)) ? w : w.toLowerCase()));
    const inSentence = new Set(words.map((w) => App.fold(w)));
    const learnedWords = Object.keys(Store.state.learned).map((id) => App.item(id))
      .filter((x) => x && x.cat === "word" && !/\s/.test(x.es) && !inSentence.has(App.fold(x.es))).map((x) => x.es.toLowerCase());
    const pool = learnedWords.length >= 3 ? learnedWords : learnedWords.concat((others || []).flatMap((o) => (o.ex_es || "").replace(/[¿?¡!.,;:«»"“”…—–-]/g, " ").split(/\s+/))
      .filter((w) => w && !inSentence.has(App.fold(w))).map((w) => w.toLowerCase()));
    const distract = App.shuffle(Array.from(new Set(pool))).slice(0, 3);
    return { mode: "tiles", title: "Build the sentence", prompt: h("div.prompt-en", it.ex_en), tiles: words, distractors: distract,
      answers: [sentence], display: sentence, help: App.wordHelp(sentence), exType: "tiles", item: it };
  };
})();
