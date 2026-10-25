/* Lesson step runner (#/lesson/:id) and the step views it shares with other pages
 * (sound-rule lab, grammar drills). */
(function () {
  "use strict";
  const App = window.App, h = App.h;

  const STEP_LABEL = { learn: "New words", sounds: "How it really sounds", grammar: "Grammar", drill: "Practice", build: "Build sentences",
    prompt: "Say something", story: "Your story", read: "Read a story" };
  App.STEP_LABEL = STEP_LABEL;

  /** Run a list of exercises one at a time inside `host`. Misses come back once at the end. */
  App.runExercises = function (host, list, opts) {
    opts = opts || {};
    const queue = list.slice();
    const total = queue.length;
    let doneCount = 0, good = 0;
    function nextEx() {
      host.innerHTML = "";
      if (!queue.length) { if (opts.onFinish) opts.onFinish({ total, good }); return; }
      const ex = queue.shift();
      if (opts.counter !== false) host.appendChild(h("p.ex-counter", `${Math.min(doneCount + 1, total)} / ${total}`));
      const el = App.exercise(ex, {
        nextLabel: queue.length ? "Next →" : (opts.lastLabel || "Continue →"),
        onAnswer: (res) => {
          if (opts.onAnswer) opts.onAnswer(ex, res);
        },
        onDone: (res) => {
          if (res.outcome === "miss" && !ex.retry && opts.retry !== false) { queue.push(Object.assign({}, ex, { retry: true, title: "Once more: " + (ex.title || "") })); }
          else { doneCount++; if (res.outcome !== "miss") good++; }
          if (opts.onProgress) opts.onProgress(doneCount / total);
          nextEx();
        },
      });
      if (ex.retry) el.classList.add("retry");
      host.appendChild(el);
    }
    nextEx();
  };

  // ------------------------------------------------------------------ step views
  /** Learn: one card per item, Next button. */
  function learnStep(step, ctx) {
    const items = step.items.map(App.item).filter(Boolean);
    let i = 0;
    function show() {
      ctx.body.innerHTML = "";
      const it = items[i];
      ctx.progress(i / items.length);
      ctx.body.appendChild(h("p.ex-counter", `New ${i + 1} / ${items.length}`));
      ctx.body.appendChild(App.itemCard(it));
      if (Store.state.settings.autoplay !== false) setTimeout(() => App.say(it.es, "careful", it), 200);
      ctx.setNext(i < items.length - 1 ? "Next word →" : "Practice these →", () => {
        if (i < items.length - 1) { i++; show(); } else { Store.learn(items.map((x) => x.id)); ctx.next(); }
      }, i > 0 ? () => { i--; show(); } : null);
    }
    if (!items.length) return ctx.next();
    show();
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
    return (rule.drills || []).map((d) => {
      if (d.type === "hear_pick") {
        return { mode: "choice", title: "Fast speech: what did they say?", prompt: h("div.listen-icon", "⚡🔊"), options: App.shuffle(d.options || [d.answer]),
          answers: [d.answer], display: d.answer, audio: { text: d.say, speed: "natural", slowText: d.answer }, optLang: "es",
          why: d.say !== d.answer ? `Written *${d.answer}*, said fast it sounds like *${d.say}*.` : null };
      }
      return { mode: "type", title: "Fast speech: type it in normal spelling", prompt: h("div.listen-icon", "⚡🔊"), answers: [d.answer].concat(d.alts || []),
        display: d.answer, audio: { text: d.say, speed: "natural", slowText: d.answer }, lang: "es",
        why: d.say !== d.answer ? `*${d.say}* is the fast-speech version of *${d.answer}*.` : null };
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
      const q = h("div.grammar-q", { lang: d.type === "translate" ? "en" : "es", html: App.inline(String(d.q).replace(/___/g, "<span class=\"blank\">___</span>")) });
      q.innerHTML = App.esc(d.q).replace(/___/g, '<span class="blank">_____</span>');
      const title = { choice: "Pick the right form", fill: "Fill the gap", transform: "Change it", translate: "Say it in Spanish" }[d.type] || "Grammar";
      if (d.type === "choice") return { mode: "choice", title, prompt: q, options: App.shuffle(d.options || [d.answer]), answers: accepted, display: d.answer, why: d.why, optLang: "es" };
      return { mode: "type", title, prompt: q, answers: accepted, display: d.answer, why: d.why, lang: "es" };
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
        onAnswer: (e, res) => { if (res.outcome !== "miss") good++; },
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

  /** Mixed drill on the items just learned. */
  App.drillExercises = function (items) {
    const types = ["recognise-choice", "listen-choice", "produce-choice", "produce-type", "cloze", "listen-type"];
    const out = [];
    App.shuffle(items).forEach((it, i) => {
      let t = types[i % types.length];
      if (it.pos === "noun" && it.gender && i % 3 === 1) t = "gender";
      if (t === "cloze" && !App.clozeOf(it)) t = "produce-type";
      if (i % 5 === 4 && Array.isArray(it.natural) && it.natural.length) t = "listen-natural";
      const ex = App.makeExercise(it, t);
      ex.item = it;
      out.push(ex);
    });
    return out;
  };
  function drillStep(step, ctx) {
    const items = step.items.map(App.item).filter(Boolean);
    if (!items.length) return ctx.next();
    Store.learn(items.map((x) => x.id));
    const missed = new Set();
    ctx.clearNext();
    App.runExercises(ctx.body, App.drillExercises(items), {
      onAnswer: (ex, res) => { if (res.outcome === "miss" && ex.item) missed.add(ex.item.id); },
      onProgress: (f) => ctx.progress(f),
      onFinish: () => {
        missed.forEach((id) => Store.rate(id, "again", { practice: true }));
        ctx.next();
      },
    });
  }

  function buildStep(step, ctx) {
    const items = step.items.map(App.item).filter((x) => x && x.ex_es);
    if (!items.length) return ctx.next();
    let i = 0;
    ctx.clearNext();
    function show() {
      ctx.body.innerHTML = "";
      if (i >= items.length) return ctx.next();
      ctx.progress(i / items.length);
      const it = items[i];
      ctx.body.appendChild(h("p.ex-counter", `Sentence ${i + 1} / ${items.length}`));
      const ex = App.buildExercise(it, items.filter((x) => x !== it));
      const el = App.exercise(ex, { nextLabel: i < items.length - 1 ? "Next sentence →" : "Continue →", onDone: () => { i++; show(); } });
      ctx.body.appendChild(el);
      // optional: type it too
      const typeBtn = h("button.btn.btn-ghost.type-too", { type: "button", onclick: () => {
        typeBtn.remove();
        const tx = { mode: "type", title: "Now type it (optional)", prompt: h("div.prompt-en", it.ex_en), answers: [it.ex_es], display: it.ex_es, lang: "es" };
        const tel = App.exercise(tx, { nextLabel: i < items.length - 1 ? "Next sentence →" : "Continue →", onDone: () => { i++; show(); } });
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
    let idx = params[1] != null ? Math.max(0, Math.min(steps.length - 1, +params[1] || 0)) : (ls.done ? 0 : Math.min(ls.step || 0, steps.length - 1));
    const page = h("div.page.lesson-page");
    const crumbs = h("nav.crumbs", { "aria-label": "breadcrumb" }, h("a", { href: "#/course" }, "Course"), h("span", lesson.unit.title), h("span", lesson.title));
    const bar = h("div.progress-bar", { role: "progressbar", "aria-valuemin": 0, "aria-valuemax": 100 }, h("div.fill", { style: { width: "0%" } }));
    const head = h("div.lesson-head", h("h1.page-title", lesson.title), h("p.step-label"));
    const stepDots = h("ol.step-dots");
    steps.forEach((s, k) => stepDots.appendChild(h("li", { class: k < idx ? "done" : k === idx ? "current" : "", title: STEP_LABEL[s.type] },
      h("a", { href: `#/lesson/${lesson.id}/${k}`, "aria-label": `step ${k + 1}: ${STEP_LABEL[s.type]}` }, String(k + 1)))));
    const body = h("div.step-body");
    const footer = h("div.lesson-footer");
    page.append(crumbs, bar, head, stepDots, body, footer);
    main.appendChild(page);

    let nextFn = null;
    const ctx = {
      body,
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
      next() {
        Store.setStep(lesson.id, idx + 1, steps.length);
        idx++;
        if (idx >= steps.length) return finish();
        history.replaceState(null, "", `#/lesson/${lesson.id}/${idx}`);
        run();
        window.scrollTo({ top: 0, behavior: "smooth" });
      },
    };
    function run() {
      const s = steps[idx];
      App.$$("li", stepDots).forEach((li, k) => { li.className = k < idx || Store.lessonState(lesson.id).step > k ? "done" : ""; if (k === idx) li.classList.add("current"); });
      head.querySelector(".step-label").textContent = `Step ${idx + 1} of ${steps.length} · ${STEP_LABEL[s.type] || s.type}`;
      ctx.clearNext();
      body.innerHTML = "";
      ctx.progress(0);
      const fn = RUNNERS[s.type];
      if (!fn) return ctx.next();
      try { fn(s, ctx); } catch (e) { console.error(e); body.appendChild(h("p", "Something went wrong with this step. ")); ctx.setNext("Skip →", () => ctx.next()); }
    }
    function finish() {
      ctx.clearNext();
      bar.firstChild.style.width = "100%";
      body.innerHTML = "";
      App.$$("li", stepDots).forEach((li) => (li.className = "done"));
      head.querySelector(".step-label").textContent = "Lesson complete";
      const nxt = Store.nextLesson();
      const learnedHere = steps.filter((s) => s.type === "learn").reduce((n, s) => n + s.items.length, 0);
      body.appendChild(h("div.card.card-hero.lesson-done",
        App.coach("proud", `<strong>${App.esc(App.line("done"))}</strong><br>${learnedHere} new words and phrases are now in your review deck.`),
        h("div.done-actions",
          nxt ? h("a.btn.btn-primary.btn-big", { href: `#/lesson/${nxt.id}` }, `Next: ${nxt.title} →`) : h("a.btn.btn-primary.btn-big", { href: "#/review" }, "Review →"),
          h("a.btn.btn-secondary", { href: "#/" }, "Home"))));
      App.pageEnter = () => { location.hash = nxt ? `#/lesson/${nxt.id}` : "#/review"; };
    }
    run();
  };
})();
