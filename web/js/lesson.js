/* Lesson step runner (#/lesson/:id) and the step views it shares with other pages
 * (sound-rule lab, grammar drills). */
(function () {
  "use strict";
  const App = window.App, h = App.h;

  const STEP_LABEL = { learn: "Learn & check", sounds: "How it really sounds", grammar: "Grammar", drill: "Practice", build: "Build sentences",
    prompt: "Say something", story: "Your story", read: "Read a story" };
  App.STEP_LABEL = STEP_LABEL;

  /** Run a list of exercises one at a time inside `host`. Misses come back once at the end.
   * opts: {context (for the answer event), onAnswer(ex, res) (ex.retry tells a repeat), onFinish({total, good}), onProgress} */
  App.runExercises = function (host, list, opts) {
    opts = opts || {};
    const queue = list.filter(Boolean);
    const total = queue.length;
    let doneCount = 0, good = 0;
    function nextEx() {
      host.innerHTML = "";
      if (!queue.length) { if (opts.onFinish) opts.onFinish({ total, good }); return; }
      const ex = queue.shift();
      if (opts.counter !== false) host.appendChild(h("p.ex-counter", `${Math.min(doneCount + 1, total)} / ${total}`));
      const el = App.exercise(ex, {
        context: opts.context,
        nextLabel: queue.length ? "Next →" : (opts.lastLabel || "Continue →"),
        onAnswer: (res) => {
          if (opts.onAnswer) opts.onAnswer(ex, res);
        },
        onDone: (res) => {
          if ((res.outcome === "miss" || res.outcome === "unsure") && !ex.retry && opts.retry !== false) { queue.push(Object.assign({}, ex, { retry: true, title: "Once more: " + (ex.title || "") })); }
          else { doneCount++; if (res.outcome !== "miss" && res.outcome !== "unsure") good++; }
          if (opts.onProgress) opts.onProgress(doneCount / total);
          nextEx();
        },
      });
      if (ex.retry) el.classList.add("retry");
      host.appendChild(el);
    }
    nextEx();
  };

  // ------------------------------------------------------------------ learn <-> check rounds
  const GROUP = 4;
  const EASY = new Set(["recognise-choice", "listen-meaning", "listen-natural-meaning", "cloze-choice"]);     // see/hear Spanish -> meaning
  const TYPED = new Set(["produce-type", "produce-recall", "listen-type", "cloze", "listen-natural", "dictation", "conj-produce"]);
  function groupsOf(items) {
    const g = [];
    for (let k = 0; k < items.length; k += GROUP) g.push(items.slice(k, k + GROUP));
    if (g.length > 1 && g[g.length - 1].length < 2) g[g.length - 2].push(...g.pop());
    return g;
  }
  /** Present-tense person used in a verb's example sentence ("pres3s"), else yo. */
  function exampleFormKey(it) {
    const cz = App.clozeOf(it);
    return cz && cz.entry && cz.entry.tense === "pres" && cz.entry.person ? "pres" + cz.entry.person : "pres1s";
  }
  /** Does this item have a fair typed gap (the blank's tense is unlocked)? */
  const fairCloze = (it) => { const ex = App.clozeOf(it) && App.makeExercise(it, "cloze"); return !!ex && ex.exType === "cloze"; };

  /**
   * The lesson's core flow. For each group of ~4 items: learn cards, then a quick check on just those
   * (see Spanish -> meaning, then hear it -> meaning; very common function words get one gap-choice in a sentence
   * instead). Then one mixed round on all items (recall-first, docs/REVIEW.md improvement 1):
   * - recall: every item recognised correctly and not missed in a quick check, typed from English with a hint ladder
   *   (standing rule: never type a word he hasn't been shown AND recognised — the quick checks come first);
   * - pick: only the items missed in a quick check, as multiple choice en -> es;
   * - fast: up to three items with a genuine fast-speech respelling;
   * - verbs: one conj-hear each (+ one conj-produce once g_present_ar is done);
   * - extra: up to three fair typed gaps.
   * opts: {learn (show cards; false = practice only), onDone}
   */
  App.learnFlow = function (items, ctx, opts) {
    opts = opts || {};
    const struggled = new Set();
    const okHere = new Set();
    const rounds = [];
    const groups = opts.learn === false ? [items] : groupsOf(items);
    groups.forEach((g) => {
      const a = items.indexOf(g[0]) + 1, b = items.indexOf(g[g.length - 1]) + 1;
      const lab = g.length > 1 ? `${a}–${b}` : `${a}`;
      if (opts.learn !== false) rounds.push({ label: `New words ${lab}`, kind: "learn", build: () => g.map((it) => ({ kind: "card", item: it })) });
      rounds.push({ label: opts.learn === false ? "Warm-up: what do they mean?" : `Quick check ${lab}`, kind: "check", build: () => {
        const fn = g.filter((it) => App.isFunctionWord(it)), rest = g.filter((it) => !App.isFunctionWord(it));
        return App.shuffle(rest).map((it) => ({ kind: "ex", item: it, type: "recognise-choice" }))
          .concat(App.shuffle(fn).filter((it) => App.clozeOf(it)).map((it) => ({ kind: "ex", item: it, type: "cloze-choice" })))
          .concat(App.shuffle(rest).map((it) => ({ kind: "ex", item: it, type: "listen-meaning" })));
      } });
    });
    rounds.push({ label: "Mix it up — all the new words", kind: "mix", build: () => {
      const canType = (it) => !struggled.has(it.id) && (okHere.has(it.id) || Store.recognised(it.id) > 0);
      const recall = App.shuffle(items.filter((it) => canType(it) && !App.isFunctionWord(it)))
        .map((it) => ({ kind: "ex", item: it, type: "produce-recall", typed: true }));
      const fnGaps = items.filter((it) => canType(it) && App.isFunctionWord(it) && fairCloze(it))
        .map((it) => ({ kind: "ex", item: it, type: "cloze", typed: true }));
      const pick = App.shuffle(items.filter((it) => struggled.has(it.id) && !App.isFunctionWord(it)))
        .map((it) => ({ kind: "ex", item: it, type: it.pos === "noun" && it.gender && it.gender !== "mf" && Math.random() < 0.3 ? "gender" : "produce-choice" }));
      const fast = App.shuffle(items.filter((it) => App.naturalOf(it) && !struggled.has(it.id) && !App.isFunctionWord(it))).slice(0, 3)
        .map((it) => ({ kind: "ex", item: it, type: "listen-natural-meaning" }));
      const verbs = items.filter((it) => it.pos === "verb" && it.conj && Array.isArray(it.conj.pres));
      const conj = verbs.map((it) => ({ kind: "ex", item: it, type: "conj-hear", formKey: exampleFormKey(it) }));
      if (Store.isGrammarDone("g_present_ar")) {
        verbs.filter(canType).forEach((it) => {
          const f = App.shuffle(App.verbForms(it).filter((x) => x.unlocked && x.tense === "pres"))[0];
          if (f) conj.push({ kind: "ex", item: it, type: "conj-produce", formKey: f.key, typed: true });
        });
      }
      const extra = App.shuffle(items.filter((it) => canType(it) && !App.isFunctionWord(it) && fairCloze(it))).slice(0, 3)
        .map((it) => ({ kind: "ex", item: it, type: "cloze", typed: true }));
      return pick.concat(App.shuffle(recall.concat(fnGaps)), fast, App.shuffle(conj), extra);
    } });

    let r = -1, queue = [], roundTotal = 0, roundDone = 0;
    const shown = [];      // card tasks shown in this round (for Back)
    const missedIds = new Set();
    function startRound() {
      r++;
      if (r >= rounds.length) return finish();
      queue = rounds[r].build();
      if (!queue.length) return startRound();
      roundTotal = queue.length; roundDone = 0; shown.length = 0;
      next();
    }
    function progress() { ctx.progress((r + Math.min(1, roundDone / Math.max(1, roundTotal))) / rounds.length); }
    function header(extra) {
      const rd = rounds[r];
      return h("div.round-head", { class: "round-" + rd.kind },
        h("span.round-label", rd.label), h("span.ex-counter", extra || `${Math.min(roundDone + 1, roundTotal)} / ${roundTotal}`));
    }
    function next() {
      ctx.body.innerHTML = "";
      progress();
      if (!queue.length) return startRound();
      const t = queue.shift();
      if (t.kind === "card") return showCard(t);
      if (t.kind === "flash") return showRefresher(t);
      return showExercise(t);
    }
    function showCard(t) {
      const it = t.item;
      Store.learn([it.id]);
      ctx.body.appendChild(header());
      ctx.body.appendChild(App.itemCard(it));
      if (Store.state.settings.autoplay !== false) setTimeout(() => App.say(it.es, "careful", it), 200);
      const last = !queue.length;
      ctx.setNext(last ? "Check these →" : "Next word →", () => { shown.push(t); roundDone++; next(); },
        shown.length ? () => { queue.unshift(t); queue.unshift(shown.pop()); roundDone = Math.max(0, roundDone - 1); next(); } : null);
    }
    function showRefresher(t) {
      // missed an easy one: re-show the card briefly before it comes back later
      const it = t.item;
      ctx.body.appendChild(header("Quick refresher"));
      const card = h("div.card.refresher", App.wordBig(it), h("p.gloss", it.en),
        h("div.audio-row", App.playBtn(it.es, "careful", { item: it }), App.playBtn(it.es, "slow", { item: it })),
        it.ex_es ? h("p.example", { lang: "es" }, it.ex_es, it.ex_en ? h("span.en", it.ex_en) : null) : null);
      ctx.body.appendChild(card);
      App.say(it.es, "careful", it);
      ctx.setNext("Got it →", () => next());
    }
    function showExercise(t) {
      ctx.clearNext();
      const it = t.item;
      const ex = App.makeExercise(it, t.type, { formKey: t.formKey });
      if (!ex) { roundDone++; return next(); }
      if (t.retry) { ex.title = "Once more: " + (ex.title || ""); ex.retry = true; }
      ctx.body.appendChild(header());
      const el = App.exercise(ex, {
        context: "lesson",
        nextLabel: queue.length ? "Next →" : (r < rounds.length - 1 ? "Continue →" : "Finish →"),
        onDone: (res) => {
          const unsure = res.outcome === "unsure";
          const ok = res.outcome !== "miss" && !unsure;
          if (ok && EASY.has(t.type)) { okHere.add(it.id); Store.markRecognised(it.id); }
          if (!ok) {
            missedIds.add(it.id);
            if (!TYPED.has(t.type)) struggled.add(it.id);       // missed an easy one -> no typing for it this lesson
            if (!t.retry) {
              if (!unsure) queue.unshift({ kind: "flash", item: it });     // "Not sure" already showed the card
              // try again later in this round: recall comes back as recall; other typed formats get an easier version
              const againType = t.type === "produce-recall" || t.type === "conj-produce" || t.type === "conj-hear" ? t.type
                : TYPED.has(t.type) ? (App.isFunctionWord(it) ? "cloze-choice" : "produce-choice") : t.type;
              const again = { kind: "ex", item: it, type: againType, formKey: t.formKey, retry: true };
              queue.push(again);
              roundTotal++;
            }
          }
          roundDone++;
          next();
        },
      });
      if (t.retry) el.classList.add("retry");
      ctx.body.appendChild(el);
    }
    function finish() {
      // missed in the lesson: back soon, and its first real interval is capped at 1 day whatever is tapped
      missedIds.forEach((id) => { Store.rate(id, "again", { practice: true }); const c = Store.state.cards[id]; if (c) c.missedInLesson = true; });
      if (missedIds.size) Store.save();
      if (opts.onDone) opts.onDone();
    }
    if (!items.length) return opts.onDone && opts.onDone();
    startRound();
  };

  /** learn step = the interleaved learn/check flow; it also covers the lesson's drill step on the same items. */
  function learnStep(step, ctx) {
    const items = step.items.map(App.item).filter(Boolean);
    App.learnFlow(items, ctx, { onDone: () => {
      const l = Store.state.lessons[ctx.lessonId] || (Store.state.lessons[ctx.lessonId] = { step: 0, done: 0 });
      l.flow = (l.flow || []).concat([step.items.join(",")]);
      Store.save();
      ctx.next();
    } });
  }
  /** A drill step: skipped when the learn flow already practised these items; otherwise (old saved progress, or a
   * lesson without a learn step) practice rounds without cards. */
  function drillStep(step, ctx) {
    const items = step.items.map(App.item).filter(Boolean);
    const flows = (Store.state.lessons[ctx.lessonId] || {}).flow || [];
    if (!items.length || flows.includes(step.items.join(","))) return ctx.next();
    Store.learn(items.map((x) => x.id));
    App.learnFlow(items, ctx, { learn: false, onDone: () => ctx.next() });
  }

  /** A connected-speech rule: explainer + examples, then its drills. */
  App.soundExplain = function (rule) {
    const card = h("div.card.sound-rule");
    card.appendChild(h("h2.rule-name", rule.name));
    if (rule.summary) card.appendChild(h("p.lead", rule.summary));
    card.appendChild(h("div.explain", { html: App.md(rule.explain) }));
    if (rule.mexico) card.appendChild(h("p.mexico", { html: "🇲🇽 " + App.inline(rule.mexico) }));
    const exs = h("div.sound-examples");
    (rule.examples || []).forEach((x) => {
      exs.appendChild(h("div.sound-ex",
        h("div.sound-written", { lang: "es" }, h("span.fb-label", "Written"), " ", x.written),
        h("div.sound-like", h("span.natural", { lang: "es" }, x.sounds || x.fast)),
        x.en ? h("div.ex-en.muted", x.en) : null,
        h("div.audio-row",
          App.playBtn(x.slow || x.written, "slow", { label: "Slow & clear" }),
          App.playBtn(x.fast || x.sounds, "natural", { label: "Fast & natural" }))));
    });
    card.appendChild(exs);
    return card;
  };
  App.soundDrills = function (rule) {
    return (rule.drills || []).map((d, i) => {
      const differs = d.say !== d.answer && !App.soundsSame(d.say, d.answer);
      const base = { itemKind: "sound", refId: rule.id, refIndex: i, listen: true,
        audio: { text: d.say, speed: "natural", natText: d.say, slowText: d.answer, ramp: true } };
      if (d.type === "hear_pick") {
        return Object.assign(base, { mode: "choice", title: "Fast speech: what did they say?", prompt: h("div.listen-icon", "⚡🔊"), options: App.shuffle(d.options || [d.answer]),
          answers: [d.answer], display: d.answer, optLang: "es", exType: "sound-pick",
          why: differs ? `Written *${d.answer}*, said fast it sounds like *${d.say}*.` : null });
      }
      return Object.assign(base, { mode: "type", title: "Fast speech: type it in normal spelling", prompt: h("div.listen-icon", "⚡🔊"), answers: [d.answer].concat(d.alts || []),
        display: d.answer, lang: "es", exType: "sound-type", production: true,
        why: differs ? `*${d.say}* is the fast-speech version of *${d.answer}*.` : null });
    });
  };
  function soundsStep(step, ctx) {
    const rule = App.sound(step.rule);
    if (!rule) return ctx.next();
    ctx.body.innerHTML = "";
    ctx.body.appendChild(App.soundExplain(rule));
    ctx.setNext("Try the drills →", () => {
      ctx.clearNext();
      App.runExercises(ctx.body, App.soundDrills(rule), {
        context: "lesson",
        onProgress: (f) => ctx.progress(0.3 + 0.7 * f),
        onFinish: () => { Store.state.sounds[rule.id] = Date.now(); Store.save(); ctx.next(); },
      });
    });
  }

  /** Grammar unit: explanation, rules, then drills. */
  App.grammarExplain = function (g) {
    const card = h("div.card.grammar-unit");
    card.appendChild(h("h2", g.title));
    if (g.summary) card.appendChild(h("p.lead", g.summary));
    card.appendChild(h("div.explain", { html: App.md(g.explain) }));
    if ((g.rules || []).length) {
      const ul = h("div.rules");
      g.rules.forEach((r) => {
        ul.appendChild(h("div.rule",
          h("p.rule-text", { html: App.inline(r.rule) }),
          (r.examples || []).length ? h("p.rule-ex", { lang: "es" }, (r.examples || []).map((e, i) => [i ? " · " : "", h("span", e), " ", App.playBtn(e, "careful", { label: "" })])) : null,
          (r.exceptions || []).length ? h("p.rule-exc", "Exceptions: ", h("span", { lang: "es" }, r.exceptions.join(", "))) : null));
      });
      card.appendChild(ul);
    }
    return card;
  };
  App.grammarDrillExercises = function (g, max) {
    let drills = (g.drills || []).slice();
    if (max && drills.length > max) {
      // keep a mix of types
      const byType = {};
      drills.forEach((d) => (byType[d.type] = byType[d.type] || []).push(d));
      const out = [];
      while (out.length < max) {
        let added = false;
        for (const t of Object.keys(byType)) if (byType[t].length && out.length < max) { out.push(byType[t].shift()); added = true; }
        if (!added) break;
      }
      drills = out;
    }
    return drills.map((d) => {
      const accepted = [d.answer].concat(d.alts || []);
      const q = h("div.grammar-q", { lang: d.type === "translate" ? "en" : "es" });
      q.innerHTML = App.esc(d.q).replace(/___/g, '<span class="blank">_____</span>');
      const title = { choice: "Pick the right form", fill: "Fill the gap", transform: "Change it", translate: "Say it in Spanish" }[d.type] || "Grammar";
      const base = { itemKind: "grammar", refId: g.id, refIndex: (g.drills || []).indexOf(d), exType: "grammar-" + (d.type || "fill"), why: d.why };
      if (d.type === "choice") return Object.assign(base, { mode: "choice", title, prompt: q, options: App.shuffle(d.options || [d.answer]), answers: accepted, display: d.answer, optLang: "es" });
      // word help must not leak the answer: none on fill; on translate only dictionary forms ("trabajar — work")
      const help = d.type === "translate" ? App.wordHelp(d.answer, { lemma: true }) : null;
      return Object.assign(base, { mode: "type", title, prompt: q, answers: accepted, display: d.answer, lang: "es", help, production: d.type === "translate" });
    });
  };
  function grammarStep(step, ctx) {
    const g = App.grammar(step.unit);
    if (!g) return ctx.next();
    ctx.body.innerHTML = "";
    ctx.body.appendChild(App.grammarExplain(g));
    ctx.setNext("Practise it →", () => {
      ctx.clearNext();
      let good = 0;
      const ex = App.grammarDrillExercises(g, 8);
      App.runExercises(ctx.body, ex, {
        context: "lesson",
        onAnswer: (e, res) => { if (!e.retry && res.outcome !== "miss" && res.outcome !== "unsure") good++; },   // first attempts only
        onProgress: (f) => ctx.progress(0.3 + 0.7 * f),
        onFinish: () => {
          const prev = Store.state.grammar[g.id] || {};
          Store.state.grammar[g.id] = { done: prev.done || Date.now(), best: Math.max(prev.best || 0, ex.length ? good / ex.length : 1), at: Date.now() };
          Store.save();
          ctx.next();
        },
      });
    });
  }

  /** Mixed one-off drill (used outside lessons): easy formats only for items not yet recognised. */
  App.drillExercises = function (items) {
    return App.shuffle(items).map((it, i) => {
      const t = Store.recognised(it.id) ? ["produce-choice", "listen-meaning", "produce-type"][i % 3] : ["recognise-choice", "listen-meaning"][i % 2];
      return Object.assign(App.makeExercise(it, t), { item: it });
    });
  };

  function buildStep(step, ctx) {
    // at least four tiles (two-tile sentences give the order away)
    const all = step.items.map(App.item).filter((x) => x && x.ex_es && Grader.tokenize(x.ex_es.replace(/[—–-]/g, " ")).length >= 4);
    if (!all.length) return ctx.next();
    // prefer example sentences whose words are all learned (fewest unknown words first)
    const items = all.map((x) => ({ x, n: App.unknownWords(x.ex_es).length }))
      .sort((a, b) => a.n - b.n).map((o) => o.x).slice(0, Math.min(4, all.length));
    let i = 0;
    ctx.clearNext();
    function show() {
      ctx.body.innerHTML = "";
      if (i >= items.length) return ctx.next();
      ctx.progress(i / items.length);
      const it = items[i];
      ctx.body.appendChild(h("p.ex-counter", `Sentence ${i + 1} / ${items.length}`));
      const ex = App.buildExercise(it, items.filter((x) => x !== it));
      if (!ex) { i++; return show(); }
      const el = App.exercise(ex, { context: "lesson", nextLabel: i < items.length - 1 ? "Next sentence →" : "Continue →", onDone: () => { i++; show(); } });
      ctx.body.appendChild(el);
      // optional: type it too
      const typeBtn = h("button.btn.btn-ghost.type-too", { type: "button", onclick: () => {
        typeBtn.remove();
        const tx = { mode: "type", title: "Now type it (optional)", prompt: h("div.prompt-en", it.ex_en), answers: [it.ex_es], display: it.ex_es, lang: "es",
          help: App.wordHelp(it.ex_es), item: it, exType: "build-type", production: true };
        const tel = App.exercise(tx, { context: "lesson", nextLabel: i < items.length - 1 ? "Next sentence →" : "Continue →", onDone: () => { i++; show(); } });
        ctx.body.innerHTML = "";
        ctx.body.appendChild(tel);
      } }, "✍ Type it too");
      const watch = new MutationObserver(() => {
        if (el.classList.contains("answered")) { watch.disconnect(); const act = el.querySelector(".ex-actions"); if (act) act.prepend(typeBtn); }
      });
      watch.observe(el, { attributes: true, attributeFilter: ["class"] });
    }
    show();
  }

  function promptStep(step, ctx) {
    const p = App.prompt(step.id);
    if (!p) return ctx.next();
    ctx.body.innerHTML = "";
    ctx.body.appendChild(App.promptView(p, { inLesson: true, onDone: () => ctx.next() }));
    ctx.setNext("Skip for now →", () => ctx.next(), null, true);
  }
  function storyStep(step, ctx) {
    const s = App.story(step.id);
    if (!s) return ctx.next();
    ctx.body.innerHTML = "";
    ctx.body.appendChild(App.storyView(s, { inLesson: true, onDone: () => ctx.next() }));
    ctx.setNext("Finish later →", () => ctx.next(), null, true);
  }

  function readStep(step, ctx) {
    const r = (App.course.readings || []).find((x) => x.id === step.id);
    if (!r) return ctx.next();
    ctx.body.innerHTML = "";
    ctx.body.appendChild(App.readView(r, { inLesson: true, onDone: () => ctx.next() }));
    ctx.setNext("Skip for now →", () => ctx.next(), null, true);
  }

  const RUNNERS = { read: readStep, learn: learnStep, sounds: soundsStep, grammar: grammarStep, drill: drillStep, build: buildStep, prompt: promptStep, story: storyStep };

  // ------------------------------------------------------------------ page
  App.pages = App.pages || {};
  App.pages.lesson = function (main, params) {
    const lesson = App.lesson(params[0]);
    if (!lesson) { main.appendChild(h("div.page", h("h1.page-title", "Lesson not found"), h("a.btn.btn-primary", { href: "#/course" }, "Back to the course"))); return; }
    const steps = lesson.steps || [];
    const ls = Store.lessonState(lesson.id);
    const firstOpen = () => { const st = Store.lessonState(lesson.id); return st.done ? steps.length : Math.min(st.step || 0, steps.length - 1); };
    let idx = params[1] != null ? Math.max(0, Math.min(steps.length - 1, +params[1] || 0)) : (ls.done ? 0 : firstOpen());
    if (idx > firstOpen()) { idx = firstOpen(); history.replaceState(null, "", `#/lesson/${lesson.id}/${idx}`); }
    const page = h("div.page.lesson-page");
    const crumbs = h("nav.crumbs", { "aria-label": "breadcrumb" }, h("a", { href: "#/course" }, "Course"), h("span", lesson.unit.title), h("span", lesson.title));
    const bar = h("div.progress-bar", { role: "progressbar", "aria-valuemin": 0, "aria-valuemax": 100 }, h("div.fill", { style: { width: "0%" } }));
    const head = h("div.lesson-head", h("h1.page-title", lesson.title), h("p.step-label"));
    const stepDots = h("ol.step-dots");
    function renderDots() {
      stepDots.innerHTML = "";
      const open = firstOpen();
      steps.forEach((s, k) => {
        const reachable = k <= open;
        const cls = (k === idx ? "current " : "") + (k < open ? "done" : reachable ? "" : "locked");
        stepDots.appendChild(h("li", { class: cls.trim(), title: STEP_LABEL[s.type] + (reachable ? "" : " (finish the earlier steps first)") },
          reachable ? h("a", { href: `#/lesson/${lesson.id}/${k}`, "aria-label": `step ${k + 1}: ${STEP_LABEL[s.type]}` }, String(k + 1))
            : h("span", { "aria-label": `step ${k + 1}: ${STEP_LABEL[s.type]} (locked)`, "aria-disabled": "true" }, String(k + 1))));
      });
    }
    const body = h("div.step-body");
    const footer = h("div.lesson-footer");
    page.append(crumbs, bar, head, stepDots, body, footer);
    main.appendChild(page);

    let nextFn = null;
    const ctx = {
      body,
      lessonId: lesson.id,
      progress(f) {
        const pct = steps.length ? ((idx + Math.max(0, Math.min(1, f))) / steps.length) * 100 : 100;
        bar.firstChild.style.width = pct.toFixed(1) + "%";
        bar.setAttribute("aria-valuenow", Math.round(pct));
      },
      setNext(label, fn, back, ghost) {
        footer.innerHTML = "";
        nextFn = fn;
        if (back) footer.appendChild(h("button.btn.btn-ghost.btn-back", { type: "button", onclick: back }, "← Back"));
        const b = h("button.btn", { type: "button", class: ghost ? "btn-ghost btn-skip" : "btn-primary btn-big btn-next", onclick: () => { nextFn = null; fn(); } }, label);
        footer.appendChild(b);
        App.pageEnter = ghost ? null : () => b.click();
      },
      clearNext() { footer.innerHTML = ""; nextFn = null; App.pageEnter = null; },
      next(n) {
        n = n || 1;
        Store.setStep(lesson.id, idx + n, steps.length);
        idx += n;
        if (idx >= steps.length) return finish();
        history.replaceState(null, "", `#/lesson/${lesson.id}/${idx}`);
        run();
        window.scrollTo({ top: 0, behavior: "smooth" });
      },
    };
    function run() {
      const s = steps[idx];
      renderDots();
      head.querySelector(".step-label").textContent = `Step ${idx + 1} of ${steps.length} · ${STEP_LABEL[s.type] || s.type}`;
      ctx.clearNext();
      body.innerHTML = "";
      ctx.progress(0);
      const fn = RUNNERS[s.type];
      if (!fn) return ctx.next();
      try { fn(s, ctx, steps, idx); } catch (e) { console.error(e); body.appendChild(h("p", "Something went wrong with this step. ")); ctx.setNext("Skip →", () => ctx.next()); }
    }
    function finish() {
      ctx.clearNext();
      bar.firstChild.style.width = "100%";
      body.innerHTML = "";
      renderDots();
      head.querySelector(".step-label").textContent = "Lesson complete";
      const nxt = Store.nextLesson();
      const learnedHere = steps.filter((s) => s.type === "learn").reduce((n, s) => n + s.items.length, 0);
      // the daily new-words goal decides the main button; the line never contradicts it
      const goal = App.goalReached ? App.goalReached() : false;
      const c = goal && App.continueTarget ? App.continueTarget() : null;
      const mainHref = c ? c.href : nxt ? `#/lesson/${nxt.id}` : "#/review";
      const mainLabel = c ? c.label + " →" : nxt ? `Next: ${nxt.title} →` : "Review →";
      const line = App.doneLine ? App.doneLine(goal) : App.line("done");
      body.appendChild(h("div.card.card-hero.lesson-done",
        App.coach("proud", `<strong>${App.esc(line)}</strong><br>${learnedHere} new words and phrases are now in your review deck.` +
          (goal ? "<br>Today's new-word goal is done — the next lesson can wait for tomorrow." : "")),
        h("div.done-actions",
          h("a.btn.btn-primary.btn-big", { href: mainHref }, mainLabel),
          goal && nxt ? h("a.btn.btn-ghost", { href: `#/lesson/${nxt.id}` }, `Next lesson anyway: ${nxt.title}`) : null,
          h("a.btn.btn-secondary", { href: "#/" }, "Home"))));
      App.pageEnter = () => { location.hash = mainHref; };
    }
    run();
  };
})();
