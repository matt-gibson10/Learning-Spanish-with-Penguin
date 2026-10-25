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
  const MOOD = { good: "happy", close: "thinking", miss: "oops" };
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
    const coach = App.coach((moods && moods[o]) || MOOD[o], html, { size: 64, name: false });
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

  App.rateRow = function (id, suggested, onRate) {
    const row = h("div.rate-row");
    const names = [["again", "Again"], ["hard", "Hard"], ["good", "Good"], ["easy", "Easy"]];
    for (const [k, label] of names) {
      row.appendChild(h("button", {
        type: "button", class: "rate-" + k + (k === suggested ? " suggested" : ""), "aria-pressed": k === suggested ? "true" : null,
        onclick: () => onRate(k),
      }, label, h("small.when", Store.preview(id, k))));
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
      const nat = h("div.natural-row");
      it.natural.forEach((n) => nat.appendChild(h("span.natural", { lang: "es" }, n, App.playBtn(n, "natural", { label: "" }))));
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

  // ------------------------------------------------------------------ exercise runner
  /**
   * ex = {mode: "choice"|"type"|"tiles"|"flash", title, prompt (Node|string), answers [], display (answer to show),
   *       options [], lang ("es"|"en"), why, audio {text, speed, item}, autoplay, item, id (card id), free (spec for gradeFree)}
   * opts = {rate: bool (show SRS rate row), onDone(result, rating), nextLabel}
   */
  App.exercise = function (ex, opts) {
    opts = opts || {};
    const root = h("div.exercise.card", { "data-mode": ex.mode });
    if (ex.title) root.appendChild(h("p.ex-title", ex.title));
    const prompt = h("div.ex-prompt");
    if (typeof ex.prompt === "string") prompt.innerHTML = ex.prompt; else if (ex.prompt) prompt.appendChild(ex.prompt);
    root.appendChild(prompt);
    if (ex.audio && ex.noAudioRow) {
      if (ex.autoplay !== false && Store.state.settings.autoplay !== false) setTimeout(() => { if (root.isConnected) App.say(ex.audio.text, ex.audio.speed || "careful", ex.audio.item); }, 250);
    } else if (ex.audio) {
      const ar = h("div.audio-row");
      ar.appendChild(App.playBtn(ex.audio.text, ex.audio.speed || "careful", { item: ex.audio.item, label: ex.audio.speed === "natural" ? "Play again (fast)" : "Play again" }));
      if (ex.audio.speed === "natural") ar.appendChild(App.playBtn(ex.audio.slowText || ex.audio.text, "slow", {}));
      else ar.appendChild(App.playBtn(ex.audio.text, "slow", {}));
      root.appendChild(ar);
      if (ex.autoplay !== false && Store.state.settings.autoplay !== false) setTimeout(() => { if (root.isConnected) App.say(ex.audio.text, ex.audio.speed || "careful", ex.audio.item); }, 250);
    }
    const body = h("div.ex-body");
    root.appendChild(body);
    const fb = h("div.ex-feedback");
    root.appendChild(fb);
    const actions = h("div.ex-actions");
    root.appendChild(actions);
    let finished = false;

    function finish(res, displayOpts) {
      if (finished) return;
      finished = true;
      root.classList.add("answered", res.outcome);
      fb.innerHTML = "";
      fb.appendChild(App.feedback(res, Object.assign({ answer: ex.display || (ex.answers || [])[0], why: ex.why, answerLang: ex.lang }, displayOpts || {})));
      actions.innerHTML = "";
      const sug = Store.suggest(res);
      if (opts.rate && ex.id) {
        const rr = App.rateRow(ex.id, sug, (k) => done(res, k));
        actions.appendChild(rr);
        root._enter = () => done(res, sug);
      } else {
        const nb = h("button.btn.btn-primary.btn-next", { type: "button", onclick: () => done(res, sug) }, opts.nextLabel || "Next →");
        actions.appendChild(nb);
        root._enter = () => done(res, sug);
        setTimeout(() => nb.focus(), 30);
      }
      if (ex.mode !== "choice" && ex.lang !== "en" && ex.audio == null && (ex.display || ex.answers)) {
        // nothing: answer audio is in the feedback panel
      }
      if (opts.onAnswer) opts.onAnswer(res);
    }
    let doneCalled = false;
    function done(res, rating) {
      if (doneCalled) return;
      doneCalled = true;
      root._enter = null;
      if (opts.onDone) opts.onDone(res, rating);
    }

    if (ex.mode === "choice") {
      const grid = h("div.choice-grid");
      const opts2 = ex.options || [];
      opts2.forEach((o, i) => {
        const b = h("button.choice", { type: "button", lang: ex.optLang || "", "data-key": i + 1 }, h("span.key", String(i + 1)), " ", o);
        b.onclick = () => {
          if (finished) return;
          const right = App.fold(o) === App.fold(ex.answers[0]) || (ex.answers || []).some((a) => App.fold(a) === App.fold(o));
          b.classList.add("selected", right ? "correct" : "wrong");
          App.$$(".choice", grid).forEach((c) => {
            c.disabled = true;
            if ((ex.answers || []).some((a) => App.fold(a) === App.fold(c.textContent.replace(/^\d+\s*/, "")))) c.classList.add("correct");
          });
          if (ex.optLang === "es") App.say(ex.answers[0], "careful");
          finish({ outcome: right ? "good" : "miss", score: right ? 1 : 0, notes: [] }, { answer: ex.display || ex.answers[0], alwaysAnswer: false });
        };
        grid.appendChild(b);
      });
      body.appendChild(grid);
      root._keys = (k) => { const b = grid.querySelector(`[data-key="${k}"]`); if (b && !finished) b.click(); };
    } else if (ex.mode === "type") {
      const multi = !!ex.multiline;
      const inp = h(multi ? "textarea.answer-input" : "input.answer-input", {
        type: multi ? null : "text", lang: ex.lang === "en" ? "en" : "es", autocomplete: "off", autocapitalize: "off", spellcheck: "false",
        placeholder: ex.placeholder || (ex.lang === "en" ? "Type the English…" : "Escribe en español…"), rows: multi ? 3 : null,
        "aria-label": "your answer",
      });
      const check = h("button.btn.btn-primary", { type: "button" }, "Check");
      const giveUp = h("button.btn.btn-ghost", { type: "button" }, "Show answer");
      const row = h("div.answer-row", inp, check);
      body.appendChild(row);
      if (ex.lang !== "en") body.appendChild(accentBar(inp));
      body.appendChild(h("div.ex-secondary", giveUp));
      const grade = () => {
        const val = inp.value;
        if (!val.trim()) { inp.focus(); return; }
        let res = ex.free ? Grader.gradeFree(val, ex.free) : Grader.gradeAnswer(val, ex.answers, { lang: ex.lang });
        inp.readOnly = true; check.disabled = true; giveUp.disabled = true;
        finish(res);
      };
      check.onclick = grade;
      giveUp.onclick = () => { inp.readOnly = true; check.disabled = true; giveUp.disabled = true; finish({ outcome: "miss", score: 0, notes: [] }, { alwaysAnswer: true }); };
      inp.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey && !finished) { e.preventDefault(); e.stopPropagation(); grade(); } });
      setTimeout(() => { if (root.isConnected && !("ontouchstart" in window)) inp.focus(); }, 60);
    } else if (ex.mode === "tiles") {
      body.appendChild(App.tiles(ex, (res) => finish(res, { alwaysAnswer: true })));
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
          const rr = App.rateRow(ex.id, null, (k) => done({ outcome: k === "again" ? "miss" : k === "hard" ? "close" : "good", score: 1, notes: [] }, k));
          actions.appendChild(rr);
          root._keys = (k) => { const b = rr.querySelectorAll("button")[k - 1]; if (b) b.click(); };
          root._enter = () => done({ outcome: "good", score: 1, notes: [] }, "good");
        } else {
          finish({ outcome: "good", score: 1, notes: [] }, { showDiff: false });
        }
      };
      fc.onclick = (e) => { if (!e.target.closest("button")) doFlip(); };
      flip.onclick = doFlip;
      root._enter = doFlip;
      body.appendChild(fc);
      actions.appendChild(flip);
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
  function distractors(it, n, field) {
    const pool = App.allItems().filter((x) => x.id !== it.id && x.cat === it.cat && (it.cat === "chunk" || x.pos === it.pos));
    const alt = pool.length >= n ? pool : App.allItems().filter((x) => x.id !== it.id);
    const seen = new Set([App.fold(field(it))]);
    const out = [];
    for (const x of App.shuffle(alt)) {
      const v = field(x);
      if (!v || seen.has(App.fold(v))) continue;
      seen.add(App.fold(v)); out.push(v);
      if (out.length >= n) break;
    }
    return out;
  }
  /** Find the item (or one of its forms) inside its example sentence -> {before, word, after} */
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
      if (forms.has(App.fold(m[0]))) return { before: s.slice(0, m.index), word: m[0], after: s.slice(m.index + m[0].length) };
    }
    return null;
  };

  /**
   * Build an exercise for an item. type: recognise-choice | produce-choice | listen-choice | produce-type | listen-type |
   * gender | cloze | recognise-flash | listen-natural
   */
  App.makeExercise = function (it, type) {
    const disp = App.withArticle(it);
    const accepted = Array.from(new Set([it.es, disp, it.es.replace(/[¿?¡!…]/g, "").trim()]));
    const big = () => App.wordBig(it);
    switch (type) {
      case "recognise-choice": {
        const opts = App.shuffle([shortEn(it.en)].concat(distractors(it, 3, (x) => shortEn(x.en))));
        return { mode: "choice", title: "What does it mean?", prompt: big(), options: opts, answers: [shortEn(it.en)], display: it.en,
          audio: { text: it.es, speed: "careful", item: it }, optLang: "en", lang: "en" };
      }
      case "produce-choice": {
        const opts = App.shuffle([disp].concat(distractors(it, 3, (x) => App.withArticle(x))));
        return { mode: "choice", title: "How do you say it in Spanish?", prompt: h("div.prompt-en", it.en), options: opts, answers: [disp], display: disp, optLang: "es" };
      }
      case "listen-choice": {
        const opts = App.shuffle([disp].concat(distractors(it, 3, (x) => App.withArticle(x))));
        return { mode: "choice", title: "Listen — which one did you hear?", prompt: h("div.listen-icon", "🔊"), options: opts, answers: [disp],
          display: `${disp} — ${it.en}`, audio: { text: it.es, speed: "careful", item: it }, optLang: "es" };
      }
      case "listen-natural": {
        const nat = Array.isArray(it.natural) && it.natural.length ? it.natural[0] : it.es;
        return { mode: "type", title: "Fast speech — type what you hear (the normal spelling)", prompt: h("div.listen-icon", "⚡🔊"),
          answers: accepted, display: disp, audio: { text: nat, speed: "natural", slowText: it.es }, lang: "es",
          why: nat !== it.es ? `In fast speech *${it.es}* can sound like *${nat}*.` : null };
      }
      case "listen-type":
        return { mode: "type", title: "Type what you hear", prompt: h("div.listen-icon", "🔊"), answers: accepted, display: `${disp} — ${it.en}`,
          audio: { text: it.es, speed: "careful", item: it }, lang: "es" };
      case "produce-type":
        return { mode: "type", title: "Type it in Spanish", prompt: h("div.prompt-en", it.en,
          it.pos === "noun" ? h("span.hint", " (with el/la)") : null), answers: it.pos === "noun" ? [disp, it.es] : accepted, display: disp, lang: "es" };
      case "gender": {
        const opts = it.gender === "mf" ? ["el", "la", "el/la"] : ["el", "la"];
        const ans = it.article === "el/la" ? "el/la" : it.article;
        return { mode: "choice", title: "Which article?", prompt: h("div.word-big", { lang: "es" }, "___ " + it.es), options: opts, answers: [ans],
          display: disp, optLang: "es", why: it.note || (it.gender === "f" && it.article === "el" ? "Feminine, but takes *el* in the singular." :
            `*${it.es}* is ${{ m: "masculine", f: "feminine", mf: "either" }[it.gender]}.`) };
      }
      case "cloze": {
        const cz = App.clozeOf(it);
        if (!cz) return App.makeExercise(it, "produce-type");
        const p = h("div.cloze", { lang: "es" }, cz.before, h("span.blank", "_____"), cz.after);
        return { mode: "type", title: "Fill the gap", prompt: h("div", p, it.ex_en ? h("div.ex-en", it.ex_en) : null, h("p.hint", `(${shortEn(it.en)})`)),
          answers: [cz.word], display: it.ex_es, audio: null, lang: "es" };
      }
      case "hear-flash":
        return { mode: "flash", title: "Listen — what does it mean? Then flip.",
          front: [h("div.listen-icon", "🔊"), h("div.audio-row", App.playBtn(it.es, "careful", { item: it }), App.playBtn(it.es, "slow", { item: it }), App.playBtn(it.es, "natural", { item: it })),
            h("p.muted", "Say the meaning to yourself, then flip.")],
          back: [App.wordBig(it), h("p.gloss", it.en), it.ex_es ? h("p.example", { lang: "es" }, it.ex_es, it.ex_en ? h("span.en", it.ex_en) : null) : null],
          audio: { text: it.es, speed: "careful", item: it }, noAudioRow: true };
      case "recognise-flash":
      default:
        return { mode: "flash", front: [big(), h("div.audio-row", App.playBtn(it.es, "careful", { item: it }), App.playBtn(it.es, "natural", { item: it }))],
          back: [h("p.gloss", it.en), it.ex_es ? h("p.example", { lang: "es" }, it.ex_es, it.ex_en ? h("span.en", it.ex_en) : null) : null,
            Array.isArray(it.natural) && it.natural.length ? h("span.natural", { lang: "es" }, it.natural[0]) : null],
          audio: null, autoplayFront: it.es };
    }
  };

  /** Sentence-building exercise from an item's example. */
  App.buildExercise = function (it, others) {
    const sentence = it.ex_es;
    const words = sentence.replace(/[¿?¡!.,;:«»"“”…]/g, " ").split(/\s+/).filter(Boolean);
    const pool = (others || []).flatMap((o) => (o.ex_es || "").replace(/[¿?¡!.,;:«»"“”…]/g, " ").split(/\s+/)).filter((w) => w && !words.some((x) => App.fold(x) === App.fold(w)));
    const distract = App.shuffle(Array.from(new Set(pool))).slice(0, words.length > 6 ? 1 : 2);
    return { mode: "tiles", title: "Build the sentence", prompt: h("div.prompt-en", it.ex_en), tiles: words, distractors: distract,
      answers: [sentence], display: sentence };
  };
})();
