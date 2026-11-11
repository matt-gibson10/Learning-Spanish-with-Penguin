/* Pages: home, course map, review, words, sounds lab, grammar, about, settings. */
(function () {
  "use strict";
  const App = window.App, h = App.h, esc = App.esc;
  App.pages = App.pages || {};
  const DAY = 86400000;

  // ------------------------------------------------------------------ continue logic
  /** Today's new-items goal reached? (Words auto-added by Read and personal phrases don't count.) */
  App.goalReached = function () {
    const d = Store.state.days[App.dayKey()] || {};
    return (d.new || 0) >= (Store.state.settings.newPerDay || 20);
  };
  /** A "done" line that never contradicts the button beside it (no "go enjoy your day" next to "Next →"). */
  App.doneLine = function (goal) {
    for (let k = 0; k < 10; k++) {
      const l = App.line("done");
      if (!/enjoy|rest of (the|your) day|see you tomorrow|day off|that's enough/i.test(l) && (goal || !/goal/i.test(l))) return l;
    }
    return "¡Bien hecho!";
  };
  const GOAL_SUB = "Today's new-word goal is done. More new words are on the Course map if you want them.";
  App.continueTarget = function () {
    const due = Store.dueCards().length;
    const nxt = Store.nextLesson();
    const sinceReview = Date.now() - (Store.state.lastReview || 0);
    const goal = Store.state.settings.newPerDay || 20;
    if (due && (due >= 8 || sinceReview > 3 * 3600000 || !nxt || due > 10 * goal)) {
      return { href: "#/review", label: `Review ${due} card${due === 1 ? "" : "s"}`,
        sub: due > 10 * goal ? "Big review pile — new words are paused until it's smaller." : "Due reviews first — they keep what you've learned." };
    }
    if (App.goalReached()) {
      // the daily goal is real: Review if anything is due, else a short listening session, else Speak
      if (due) return { href: "#/review", label: `Review ${due} card${due === 1 ? "" : "s"}`, sub: GOAL_SUB };
      if (App.listenPool().length >= 4) return { href: "#/review?mode=listen", label: "5-minute listening", sub: GOAL_SUB };
      return { href: "#/speak", label: "Practise speaking", sub: GOAL_SUB };
    }
    if (nxt) {
      const st = Store.lessonState(nxt.id);
      const started = (st.step || 0) > 0;
      return { href: `#/lesson/${nxt.id}`, label: started ? `Continue: ${nxt.title}` : `Next lesson: ${nxt.title}`,
        sub: `${nxt.unit.title} · ${nxt.steps.length} steps${started ? ` · step ${Math.min(st.step + 1, nxt.steps.length)}` : ""}` };
    }
    return { href: "#/speak", label: "Practise speaking", sub: "You've finished every lesson. ¡Felicidades!" };
  };

  function countdown() {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const days = Math.round((App.TRIP - start) / DAY);
    const el = h("div.countdown", { role: "timer" });
    if (days > 0) el.append(h("span.num", String(days)), h("span.label", h("strong", days === 1 ? "day to Mexico" : "days to Mexico"), h("span", "trip starts " + App.TRIP.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }))));
    else if (days === 0) el.append(h("span.num", "¡Hoy!"), h("span.label", h("strong", "Trip day!"), h("span", "¡Buen viaje!")));
    else el.append(h("span.num", "🇲🇽"), h("span.label", h("strong", "¡Sigue así!"), h("span", "A little Spanish every day keeps it alive.")));
    return el;
  }
  function stat(num, label, cls) { return h("div.stat", { class: cls || "" }, h("span.num", String(num)), h("span.label", label)); }

  // ------------------------------------------------------------------ home
  App.pages.home = function (main) {
    const page = h("div.page.home-page");
    main.appendChild(page);
    const name = App.penguinName();
    const first = !Object.keys(Store.state.learned).length;
    const welcome = first ? `¡Hola! I'm <strong>${esc(name)}</strong>. We'll learn the Spanish you'll actually hear in Mexico — one click at a time. Just press <strong>Continue</strong>.` :
      `<strong>${esc(App.line("welcome"))}</strong>` + (Store.streak() > 1 ? `<br>${Store.streak()}-day streak — ${esc(App.line("streak"))}` : "");
    const hero = h("section.card.card-hero.home-hero");
    hero.appendChild(App.coach("wave", welcome, { size: 132 }));
    const c = App.continueTarget();
    hero.appendChild(h("div.continue-wrap",
      h("a.btn.btn-primary.btn-big.continue-btn", { href: c.href }, c.label, " →"),
      h("p.continue-sub", c.sub)));
    hero.appendChild(countdown());
    page.appendChild(hero);
    App.pageEnter = () => { location.hash = c.href; };

    const total = App.allItems().length;
    const day = Store.state.days[App.dayKey()] || { reviews: 0, new: 0 };
    const goal = Store.state.settings.newPerDay || 20;
    if (window.Rating && Rating.homeCard) { try { const rc = Rating.homeCard(); if (rc) page.appendChild(rc); } catch (e) { console.error(e); } }
    page.appendChild(h("h2.section-title", "Today"));
    page.appendChild(h("div.stat-row",
      stat(Store.dueCards().length, "reviews due", "accent"),
      stat(`${day.new || 0}/${goal}`, "new today", "marigold"),
      stat(day.reviews || 0, "reviewed today"),
      stat(day.unsure || 0, "“not sure” today"),
      stat(Store.streak(), "day streak", "good"),
      stat(`${Store.knownCount()}/${total}`, "words & phrases")));
    if ((day.new || 0) >= goal) page.appendChild(h("p.muted", "You've hit today's new-words goal 🎉 — reviews, listening and Speak are the next steps. More new words are on the Course map if you want them."));

    const done = App.lessons().filter((l) => Store.lessonState(l.id).done).length;
    const all = App.lessons().length;
    page.appendChild(h("div.course-progress",
      h("p", `Course: ${done} of ${all} lessons`),
      h("div.progress-bar", h("div.fill", { style: { width: (all ? (done / all) * 100 : 0).toFixed(1) + "%" } }))));

    page.appendChild(h("h2.section-title", "Jump to"));
    const links = [
      ["#/course", "🗺️", "Course map", "All units and lessons"],
      ["#/review", "🔁", "Review", "Spaced repetition"],
      ["#/say", "💭", "Think out loud → Spanish", "Say it in English, see it word by word"],
      ["#/review?mode=listen", "🎧", "5-minute listening", "Dictation and gist, natural speed first"],
      ["#/sounds", "👂", "How it really sounds", "Fast Mexican speech"],
      ["#/speak", "💬", "Speak", "Respond to situations"],
      ["#/read", "📚", "Read", "Stories, sentence by sentence"],
      ["#/chat", "🗨️", "Charla", "Chat in Spanish with Penguin"],
      ["#/story", "✍️", "Your story", "Write it in Spanish"],
      ["#/grammar", "🧩", "Grammar", "Gender, agreement, verbs"],
      ["#/words", "📖", "Words", "Browse & search"],
      ["#/about", "💡", "Why this works", "The method"],
    ];
    page.appendChild(h("div.card-grid.quick-links", links.map(([href, ic, t, s]) => h("a.card.clickable.quick-link", { href }, h("span.ql-icon", ic), h("strong", t), h("small", s)))));
    if (!App.course.vocab.length) page.appendChild(h("p.muted", "No course content loaded — run python scripts/build_course.py."));
  };

  // ------------------------------------------------------------------ course map
  App.pages.course = function (main) {
    const page = h("div.page.course-page");
    main.appendChild(page);
    page.appendChild(h("h1.page-title", "Course map"));
    const cur = Store.nextLesson();
    page.appendChild(h("p.lead", "Lessons in order — each one: new words, practice, sentence building, and now and then grammar, fast-speech sounds, a real situation or a story. Any lesson can be opened."));
    let reachedCurrent = false;
    App.course.units.forEach((u) => {
      const doneN = u.lessons.filter((l) => Store.lessonState(l.id).done).length;
      const containsCur = cur && u.lessons.some((l) => l.id === cur.id);
      const sec = h("details.unit", { open: containsCur || (!cur && u === App.course.units[0]) ? true : null });
      sec.appendChild(h("summary.unit-head", h("span.unit-title", `${u.title}`), h("span.tag.tier", `tier ${u.tier}`), h("span.unit-count", `${doneN}/${u.lessons.length}`)));
      const ol = h("ol.lesson-path");
      u.lessons.forEach((l, i) => {
        const st = Store.lessonState(l.id);
        let cls = "";
        if (st.done) cls = "done";
        else if (cur && l.id === cur.id) { cls = "current"; reachedCurrent = true; }
        else if (reachedCurrent || (cur && !st.step)) cls = "locked";
        const kinds = Array.from(new Set(l.steps.map((s) => s.type))).filter((t) => !["learn", "drill", "build"].includes(t));
        const icons = { sounds: "👂", grammar: "🧩", prompt: "💬", story: "✍️", read: "📚" };
        const learn = l.steps.find((s) => s.type === "learn");
        const preview = learn ? learn.items.slice(0, 4).map((id) => (App.item(id) || {}).es).filter(Boolean).join(" · ") : "";
        ol.appendChild(h("li", h("a.node", { href: `#/lesson/${l.id}`, class: cls, "aria-current": cls === "current" ? "step" : null },
          l.title, h("small.sub", { lang: "es" }, preview + (st.step && !st.done ? ` — step ${st.step}/${l.steps.length}` : "")),
          kinds.length ? h("span.meta", kinds.map((k) => h("span", { title: App.STEP_LABEL[k], "aria-label": App.STEP_LABEL[k] }, icons[k] || ""))) : null)));
      });
      sec.appendChild(ol);
      page.appendChild(sec);
    });
    if (!App.course.units.length) page.appendChild(h("p", "No lessons yet — build the course with python scripts/build_course.py."));
    setTimeout(() => { const c = App.$(".node.current"); if (c) c.scrollIntoView({ block: "center" }); }, 50);
  };

  // ------------------------------------------------------------------ review
  // Recall-first (docs/REVIEW.md improvements 1–4). First review: hear it -> meaning (function words: a gap in a sentence).
  // Afterwards the directions rotate recall, hear, cloze, recall, dictation, read; very common function words only ever
  // appear inside a sentence (cloze, dictation). Verb cards with 2+ successes get a verb-form card every third review.
  const RECOG_DIRS = new Set(["hear", "read", "hearpick"]);
  const DIRS = ["recall", "hear", "cloze", "recall", "dictation", "read"], FN_DIRS = ["cloze", "dictation"];
  const DIR_LABEL = { hearpick: "Listen → meaning", hear: "Listen → meaning", read: "Read → meaning", recall: "From memory", produce: "Say it in Spanish",
    listen: "Listen → write", cloze: "In context", dictation: "Dictation", form: "Verb form", relearn: "Relearn",
    "mine-produce": "My phrase · say it in Spanish", "mine-hear": "My phrase · listen → meaning" };
  function fnSentence(it) {   // a function word, inside its example sentence
    const cz = App.makeExercise(it, "cloze");
    if (cz && cz.exType === "cloze") return [cz, "cloze"];
    const cc = App.makeExercise(it, "cloze-choice");
    return cc ? [cc, "cloze"] : [App.makeExercise(it, "hear-flash"), "hear"];
  }
  /** Verb-form card: the unlocked form with the most misses, then the fewest successes; hear it until it has one success. */
  function formExercise(it, card) {
    const forms = App.verbForms(it).filter((f) => f.unlocked);
    if (!forms.length) return null;
    const st = (k) => (card.forms && card.forms[k]) || { ok: 0, miss: 0 };
    forms.sort((a, b) => st(b.key).miss - st(a.key).miss || st(a.key).ok - st(b.key).ok || (Math.random() - 0.5));
    const f = forms[0];
    const ex = App.makeExercise(it, st(f.key).ok >= 1 ? "conj-produce" : "conj-hear", { formKey: f.key });
    if (!ex) return null;
    ex.id = it.id; ex.dir = "form"; ex.formKey = f.key;
    return ex;
  }
  function reviewExercise(it, card) {
    if (it.cat === "mine" && App.phraseExercise) return App.phraseExercise(it, card);   // "My phrases" (say.js)
    const seen = card.seen || 0, ok = card.ok || 0;
    if (it.pos === "verb" && it.conj && ok >= 2 && seen % 3 === 2) { const fx = formExercise(it, card); if (fx) return finishEx(fx); }
    const fn = App.isFunctionWord(it);
    let dir = ok < 1 ? (fn ? "cloze" : "hear") : (fn ? FN_DIRS : DIRS)[(Math.max(1, seen) - 1) % (fn ? FN_DIRS : DIRS).length];
    // standing rule: typed Spanish only for items he has been shown and recognised
    if (!fn && ["recall", "cloze", "dictation"].includes(dir) && !Store.canProduce(it.id)) dir = "hear";
    let ex;
    if (fn && dir === "cloze") [ex, dir] = fnSentence(it);
    else if (dir === "cloze") { ex = App.makeExercise(it, "cloze"); if (ex.exType !== "cloze") dir = "recall"; }
    else if (dir === "dictation") {
      if (App.dictationOf(it)) ex = App.makeExercise(it, "dictation");
      else if (fn) [ex, dir] = fnSentence(it);
      else { ex = App.makeExercise(it, App.naturalOf(it) ? "listen-natural" : "listen-type"); dir = "listen"; }
    }
    if (!ex) ex = App.makeExercise(it, dir === "recall" ? "produce-recall" : dir === "read" ? "recognise-flash" : "hear-flash");
    ex.id = it.id;
    ex.dir = dir;
    return finishEx(ex);
  }
  function finishEx(ex) {
    ex.rateOpts = { production: !!ex.production };
    return ex;
  }
  App.reviewExercise = reviewExercise;

  /** Material for the listening session: learned items whose example is a fair dictation, plus finished readings. */
  App.listenPool = function () {
    const out = [];
    Object.keys(Store.state.learned).forEach((id) => {
      const it = App.item(id);
      if (it && it.cat !== "mine" && App.dictationOf(it)) out.push({ it, s: it.ex_es, en: it.ex_en });
    });
    (App.course.readings || []).forEach((r) => {
      const st = (Store.state.readings || {})[r.id];
      if (!st || !st.done) return;
      (r.sentences || []).forEach((s, i) => { const n = Grader.tokenize(s.es).length; if (n >= 3 && n <= 9) out.push({ reading: r, i, s: s.es, en: s.en }); });
    });
    return out;
  };
  /** "5-minute listening" (#/review?mode=listen): ten items alternating dictation and gist. No effect on intervals. */
  function listenSession(page) {
    page.appendChild(h("h1.page-title", "5-minute listening"));
    const pool = App.shuffle(App.listenPool());
    const gistPool = App.shuffle(Object.keys(Store.state.learned).map(App.item).filter((x) => x && x.cat !== "mine" && x.ex_es && x.ex_en));
    if (pool.length < 2 && gistPool.length < 4) {
      page.appendChild(App.coach("sleepy", "<strong>Not enough material yet.</strong><br>Finish a few lessons (or a reading) and the listening session fills up with sentences you can follow."));
      page.appendChild(h("div.btn-row", h("a.btn.btn-primary", { href: App.continueTarget().href }, "Continue →")));
      return;
    }
    page.appendChild(App.coach("talking", "Ten sentences at natural speed. <strong>Play again</strong> slows it down step by step. Dictations: type what you hear. Gist: pick what it means.", { size: 72 }));
    const list = [];
    let pi = 0, gi = 0;
    for (let k = 0; k < 10; k++) {
      if (k % 2 === 0 && pi < pool.length) {
        const p = pool[pi++];
        const ex = p.it ? App.makeExercise(p.it, "dictation") : {
          mode: "type", title: "Dictation: type the sentence you hear", prompt: h("div.listen-icon", "🔊"), answers: [p.s], display: p.s, lang: "es",
          audio: { text: p.s, speed: "natural", natText: p.s, slowText: p.s, ramp: true }, listen: true, production: true, exType: "dictation",
          itemKind: "reading", refId: p.reading.id, refIndex: p.i, after: h("p.ex-en", p.en) };
        if (ex) list.push(ex);
      } else if (gi < gistPool.length) {
        const it = gistPool[gi++];
        const others = App.shuffle(gistPool.filter((x) => x !== it && App.fold(x.ex_en) !== App.fold(it.ex_en))).slice(0, 3).map((x) => x.ex_en);
        if (others.length < 3) continue;
        list.push({ mode: "choice", title: "Listen — what's the gist?", prompt: h("div.listen-icon", "⚡🔊"), options: App.shuffle([it.ex_en].concat(others)),
          answers: [it.ex_en], display: `${it.ex_es} — ${it.ex_en}`, optLang: "en", lang: "en", listen: true, item: it, exType: "listen-natural-meaning",
          audio: { text: it.ex_es, speed: "natural", natText: it.ex_es, slowText: it.ex_es, ramp: true } });
      }
    }
    const host = h("div.review-host");
    page.appendChild(host);
    let good = 0;
    App.runExercises(host, list, {
      context: "review", retry: false,
      onAnswer: (e, r) => { if (r.outcome === "good" || r.outcome === "close") good++; },
      onFinish: () => {
        host.innerHTML = "";
        host.appendChild(h("div.card.card-hero", App.coach("proud", `<strong>${esc(App.doneLine(App.goalReached()))}</strong><br>${good} of ${list.length} caught.`),
          h("div.btn-row", h("a.btn.btn-primary.btn-big", { href: "#/review?mode=listen&t=" + Date.now() }, "Another five minutes"), h("a.btn.btn-secondary", { href: "#/" }, "Home"))));
      },
    });
  }

  App.pages.review = function (main, params, query) {
    const page = h("div.page.review-page");
    main.appendChild(page);
    if (query && query.mode === "listen") return listenSession(page);
    page.appendChild(h("h1.page-title", "Review"));
    const queue = App.shuffle(Store.dueCards().slice(0, 40));      // shuffled: lesson order mustn't prime the answers
    const total = queue.length;
    if (!total) {
      const cards = Object.keys(Store.state.cards).length;
      const soon = Object.values(Store.state.cards).sort((a, b) => a.due - b.due)[0];
      page.appendChild(App.coach("sleepy", cards ? `<strong>Nothing due right now.</strong><br>Next review ${soon ? "in " + Store.describeIvl(soon) : "later"}.` :
        "<strong>No cards yet.</strong><br>Finish a lesson (or add words from the Words page) and they'll show up here."));
      const c = App.continueTarget();
      page.appendChild(h("div.btn-row", c.href !== "#/review" ? h("a.btn.btn-primary.btn-big", { href: c.href }, c.label + " →") : null,
        h("a.btn.btn-secondary", { href: "#/review?mode=listen" }, "🎧 5-minute listening"), h("a.btn.btn-ghost", { href: "#/" }, "Home")));
      return;
    }
    const bar = h("div.progress-bar", h("div.fill", { style: { width: "0%" } }));
    const info = h("p.ex-counter");
    const host = h("div.review-host");
    page.append(bar, info, host);
    let n = 0, good = 0;
    const again = [], reps = {}, relearned = new Set();
    function next() {
      host.innerHTML = "";
      bar.firstChild.style.width = ((n / total) * 100).toFixed(1) + "%";
      let id = queue.shift();
      if (!id && again.length) id = again.shift();
      if (!id) return finish();
      const it = App.item(id);
      const card = Store.state.cards[id];
      if (!it || !card) return next();
      info.textContent = `${Math.min(n + 1, total)} / ${total}` + (again.length ? ` · ${again.length} to repeat` : "");
      if (card.leech && it.cat !== "mine" && !relearned.has(id)) return relearn(id, it, card);
      show(id, it, reviewExercise(it, card));
    }
    /** Leech (4+ lapses): see the card again, then recall it from memory. */
    function relearn(id, it, card) {
      relearned.add(id);
      host.appendChild(h("div.relearn-head", App.coach("thinking", `<p class="speech-line"><strong>Let's relearn this one.</strong> It keeps slipping away — have a good look, say it out loud, then try it from memory.</p>`, { size: 64, name: false })));
      host.appendChild(App.itemCard(it, { showEnglish: true, mic: false }));
      if (Store.state.settings.autoplay !== false) setTimeout(() => App.say(it.es, "careful", it), 200);
      host.appendChild(h("div.btn-row", h("button.btn.btn-primary.btn-big", { type: "button", onclick: () => {
        host.innerHTML = "";
        const ex = App.isFunctionWord(it) ? fnSentence(it)[0] : App.makeExercise(it, "produce-recall");
        ex.id = id; ex.dir = "relearn";
        show(id, it, finishEx(ex));
      } }, "Now from memory →")));
      App.pageEnter = () => { const b = host.querySelector(".btn-big"); if (b) b.click(); };
    }
    function show(id, it, ex) {
      App.pageEnter = null;
      const card = Store.state.cards[id];
      const el = App.exercise(ex, {
        rate: true, context: "review",
        onDone: (res, rating) => {
          rating = rating || "good";
          if (ex.dir === "form" && ex.formKey) {
            card.forms = card.forms || {};
            const f = card.forms[ex.formKey] || (card.forms[ex.formKey] = { ok: 0, miss: 0 });
            if (res.outcome === "miss" || res.outcome === "unsure") { f.miss++; if (rating === "again") rating = "hard"; } else f.ok++;
          }
          Store.rate(id, rating, { recognition: RECOG_DIRS.has(ex.dir) && res.outcome !== "unsure", production: !!ex.production, hints: res.hintsUsed || 0 });
          reps[id] = (reps[id] || 0) + 1;
          if (rating === "again" && reps[id] < 3) again.push(id); else { n++; if (rating !== "hard" && rating !== "again") good++; }
          next();
        },
      });
      el.appendChild(h("p.dir-label", DIR_LABEL[ex.dir] || ""));
      host.appendChild(el);
    }
    function finish() {
      bar.firstChild.style.width = "100%";
      info.textContent = "";
      const c = App.continueTarget();
      host.appendChild(h("div.card.card-hero", App.coach("proud", `<strong>${esc(App.doneLine(App.goalReached()))}</strong><br>${total} cards reviewed${good ? `, ${good} solid` : ""}.`),
        h("div.btn-row", h("a.btn.btn-primary.btn-big", { href: c.href }, c.label + " →"), h("a.btn.btn-secondary", { href: "#/" }, "Home"))));
      App.pageEnter = () => { location.hash = c.href; };
    }
    next();
  };

  // ------------------------------------------------------------------ words browser
  App.pages.words = function (main, params, query) {
    const page = h("div.page.words-page");
    main.appendChild(page);
    page.appendChild(h("h1.page-title", "Words & phrases"));
    const all = App.allItems();
    const topics = Array.from(new Set(all.map((x) => x.topic).filter(Boolean))).sort();
    const sel = (name, opts) => h("select", { "aria-label": name, name }, opts.map(([v, l]) => h("option", { value: v }, l)));
    const q = h("input.answer-input.search", { type: "search", placeholder: "Search Spanish or English…", "aria-label": "search", value: query.q || "" });
    const fKind = sel("kind", [["", "Words + phrases"], ["word", "Words"], ["chunk", "Phrases"]]);
    const fTier = sel("tier", [["", "All tiers"], ...[1, 2, 3, 4, 5, 6].map((t) => [String(t), `Tier ${t}`])]);
    const fPos = sel("pos", [["", "All types"], ...["noun", "verb", "adj", "adv", "pron", "prep", "conj", "det", "num", "interj"].map((p) => [p, App.posLabel(p)])]);
    const fTopic = sel("topic", [["", "All topics"], ...topics.map((t) => [t, t])]);
    const fLearned = sel("learned", [["", "Learned or not"], ["yes", "Learned"], ["no", "Not yet"], ["tricky", "Tricky (keeps slipping)"]]);
    if (query.learned) fLearned.value = query.learned;
    const filters = h("div.filters", q, fKind, fTier, fPos, fTopic, fLearned);
    page.appendChild(filters);
    const count = h("p.muted.count");
    const list = h("div.word-list");
    const more = h("button.btn.btn-secondary.more", { type: "button" }, "Show more");
    page.append(count, list, more);
    let shown = 0, rows = [];
    let formTags = new Map();     // itemId -> "fui = ir · yo · past" when the query is a form of that lemma
    /** A one-word query that is a verb (or other) form: the lemma items, accent-exact matches first. */
    function formMatches(raw) {
      formTags = new Map();
      const word = raw.trim().toLowerCase();
      if (!word || /\s/.test(word)) return [];
      let entries = [];
      try { entries = Grader.lookupExact ? Grader.lookupExact(word) : Grader.lookup(word); } catch (e) { entries = []; }
      const accented = word !== App.fold(word);
      if (accented && entries.some((e) => e.form === word)) entries = entries.filter((e) => e.form === word);
      const out = [];
      entries.forEach((e) => {
        const it = App.item(e.lemma);
        if (!it || App.fold(it.es) === App.fold(word)) return;
        const bits = [App.PERSON_SHORT && App.PERSON_SHORT[e.person] && e.tense !== "inf" ? App.PERSON_SHORT[e.person].split(" / ")[0] : null,
          e.tense ? (App.TENSE_SHORT || {})[e.tense] || e.tense : e.number === "p" ? "plural" : e.gender === "f" ? "feminine" : null].filter(Boolean);
        const tag = `${e.form} = ${it.es}${bits.length ? " · " + bits.join(" · ") : ""}`;
        if (!formTags.has(it.id)) { formTags.set(it.id, tag); out.push(it); }
      });
      return out;
    }
    function apply() {
      const t = App.fold(q.value.trim());
      const lemmas = formMatches(q.value);
      const lemmaIds = new Set(lemmas.map((x) => x.id));
      rows = all.filter((x) => {
        if (fKind.value && x.cat !== fKind.value) return false;
        if (fTier.value && String(x.tier) !== fTier.value) return false;
        if (fPos.value && x.pos !== fPos.value) return false;
        if (fTopic.value && x.topic !== fTopic.value) return false;
        if (fLearned.value === "yes" && !Store.isLearned(x.id)) return false;
        if (fLearned.value === "no" && Store.isLearned(x.id)) return false;
        if (fLearned.value === "tricky" && !(Store.state.cards[x.id] && Store.state.cards[x.id].leech)) return false;
        if (t && !lemmaIds.has(x.id) && !App.fold(x.es).includes(t) && !App.fold(x.en).includes(t) && !App.fold(x.plural || "").includes(t)) return false;
        return true;
      });
      if (t) rows.sort((a, b) => (lemmaIds.has(a.id) ? 0 : 1) - (lemmaIds.has(b.id) ? 0 : 1) ||
        (App.fold(a.es).startsWith(t) ? 0 : 1) - (App.fold(b.es).startsWith(t) ? 0 : 1) || (a.rank || 0) - (b.rank || 0));
      list.innerHTML = ""; shown = 0;
      count.textContent = `${rows.length} item${rows.length === 1 ? "" : "s"}`;
      render();
    }
    function render() {
      const slice = rows.slice(shown, shown + 60);
      slice.forEach((x) => list.appendChild(row(x)));
      shown += slice.length;
      more.style.display = shown < rows.length ? "" : "none";
    }
    function row(x) {
      const learned = Store.isLearned(x.id);
      const r = h("div.word-row", { class: learned ? "learned" : "" });
      const add = h("button.btn.btn-sm", { type: "button", class: learned ? "btn-ghost" : "btn-secondary", title: learned ? "in your review deck" : "add to review" }, learned ? "✓ in review" : "+ review");
      add.onclick = (e) => {
        e.stopPropagation();
        if (Store.isLearned(x.id)) { App.toast(`${esc(x.es)} is already in your review deck.`); return; }
        Store.learn([x.id], { dueNow: true });
        add.textContent = "✓ in review"; add.className = "btn btn-sm btn-ghost"; r.classList.add("learned");
        App.toast(`Added <b>${esc(x.es)}</b> to review.`);
      };
      const head = h("div.word-row-head", { role: "button", tabindex: 0, "aria-expanded": "false" },
        h("span.wr-es", { lang: "es" }, App.withArticle(x)), App.genderChip(x), formTags.has(x.id) ? h("span.chip.marigold.form-tag", { lang: "es" }, formTags.get(x.id)) : null, h("span.wr-en", x.en),
        h("span.wr-meta", h("span.tag.tier", "T" + (x.tier || "?")), App.playBtn(x.es, "careful", { label: "", item: x }), add));
      const detail = h("div.word-detail");
      head.onclick = () => {
        const open = r.classList.toggle("open");
        head.setAttribute("aria-expanded", open);
        detail.innerHTML = "";
        if (open) detail.appendChild(App.itemCard(x, { showEnglish: true, mic: false }));
      };
      head.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); head.click(); } };
      r.append(head, detail);
      return r;
    }
    more.onclick = render;
    q.addEventListener("input", App.debounce(apply, 150));
    [fKind, fTier, fPos, fTopic, fLearned].forEach((s) => s.addEventListener("change", apply));
    apply();
  };

  // ------------------------------------------------------------------ sounds lab
  App.pages.sounds = function (main, params) {
    const page = h("div.page.sounds-page");
    main.appendChild(page);
    const rules = App.course.sounds;
    if (params[0]) {
      const r = App.sound(params[0]);
      page.appendChild(h("nav.crumbs", h("a", { href: "#/sounds" }, "How it really sounds"), h("span", { "aria-current": "page" }, r ? r.name : "?")));
      if (!r) { page.appendChild(h("p", "Rule not found.")); return; }
      page.appendChild(App.soundExplain(r));
      const host = h("div.drill-host");
      page.appendChild(h("h2.section-title", "Drills"));
      page.appendChild(host);
      const start = () => App.runExercises(host, App.soundDrills(r), {
        context: "sounds",
        onFinish: () => {
          Store.state.sounds[r.id] = Date.now(); Store.save();
          host.innerHTML = "";
          const i = rules.indexOf(r);
          host.appendChild(h("div.card", App.coach("cheer", `<strong>${esc(App.line("good"))}</strong> Your ear is getting faster.`),
            h("div.btn-row", h("button.btn.btn-secondary", { type: "button", onclick: start }, "Again"), rules[i + 1] ? h("a.btn.btn-primary", { href: `#/sounds/${rules[i + 1].id}` }, `Next: ${rules[i + 1].name} →`) : null)));
        },
      });
      start();
      return;
    }
    page.appendChild(h("h1.page-title", "How Mexicans really say it"));
    page.appendChild(App.coach("talking", "Spanish on the street is fast: words melt together and get clipped — like English <em>by the way</em> → <em>badaway</em>. Hear each pattern slow and written, then fast and natural, and train your ear."));
    const grid = h("div.card-grid.sound-list");
    rules.forEach((r) => {
      const ex = (r.examples || [])[0];
      grid.appendChild(h("div.card.sound-tile", { class: Store.state.sounds[r.id] ? "done" : "" },
        h("h3", h("a", { href: `#/sounds/${r.id}` }, r.name)), h("p", r.summary || ""),
        ex ? h("p.sound-pair", { lang: "es" }, h("span", ex.written), " → ", h("span.natural", ex.sounds || ex.fast)) : null,
        ex ? h("div.audio-row", App.playBtn(ex.slow || ex.written, "slow", { label: "Slow" }), App.playBtn(ex.fast || ex.sounds, "natural", { label: "Fast" })) : null,
        h("a.btn.btn-primary.btn-sm", { href: `#/sounds/${r.id}` }, Store.state.sounds[r.id] ? "✓ Practise again" : "Learn & drill →")));
    });
    if (!rules.length) page.appendChild(h("p", "No sound rules yet."));
    page.appendChild(grid);
  };

  // ------------------------------------------------------------------ grammar
  App.pages.grammar = function (main, params) {
    const page = h("div.page.grammar-page");
    main.appendChild(page);
    const units = App.course.grammar;
    if (params[0]) {
      const g = App.grammar(params[0]);
      page.appendChild(h("nav.crumbs", h("a", { href: "#/grammar" }, "Grammar"), h("span", { "aria-current": "page" }, g ? g.title : "?")));
      if (!g) { page.appendChild(h("p", "Unit not found.")); return; }
      page.appendChild(App.grammarExplain(g));
      page.appendChild(h("h2.section-title", `Drills (${(g.drills || []).length})`));
      const host = h("div.drill-host");
      page.appendChild(host);
      const start = () => {
        let good = 0;
        const ex = App.grammarDrillExercises(g);
        App.runExercises(host, App.shuffle(ex), {
          context: "grammar",
          onAnswer: (e, r) => { if (!e.retry && r.outcome !== "miss" && r.outcome !== "unsure") good++; },   // first attempts only
          onFinish: () => {
            const prev = Store.state.grammar[g.id] || {};
            const score = ex.length ? good / ex.length : 1;
            Store.state.grammar[g.id] = { done: prev.done || Date.now(), best: Math.max(prev.best || 0, score), at: Date.now() };
            Store.touchStreak(); Store.save();
            host.innerHTML = "";
            const i = units.indexOf(g);
            host.appendChild(h("div.card", App.coach(score >= 0.8 ? "cheer" : "happy", `<strong>${good}/${ex.length}</strong> on the first try. ${esc(score >= 0.8 ? App.line("good") : "Slips are normal — run it again tomorrow and it'll stick.")}`),
              h("div.btn-row", h("button.btn.btn-secondary", { type: "button", onclick: start }, "Drill again"), units[i + 1] ? h("a.btn.btn-primary", { href: `#/grammar/${units[i + 1].id}` }, `Next: ${units[i + 1].title} →`) : null)));
          },
        });
      };
      start();
      return;
    }
    page.appendChild(h("h1.page-title", "Grammar"));
    page.appendChild(App.coach("thinking", "Short explanations with Mexican examples, then drills. Slips are forgiven in the rest of the app — but here you'll see exactly what changed and why."));
    const list = h("ol.grammar-list");
    units.forEach((g) => {
      const st = Store.state.grammar[g.id];
      list.appendChild(h("li", h("a.card.clickable.grammar-tile", { href: `#/grammar/${g.id}`, class: st ? "done" : "" },
        h("strong", g.title), h("small", g.summary || ""), h("span.meta", st ? h("span.chip.good", `best ${Math.round((st.best || 0) * 100)}%`) : h("span.tag.tier", `tier ${g.tier || 1}`)))));
    });
    if (!units.length) page.appendChild(h("p", "No grammar units yet."));
    page.appendChild(list);
  };

  // ------------------------------------------------------------------ about
  App.pages.about = function (main) {
    const page = h("div.page.about-page");
    main.appendChild(page);
    page.appendChild(h("h1.page-title", "Why this works"));
    const cards = App.course.about || [];
    page.appendChild(App.coach("proud", "Every part of this course is here for a reason. Here's the research behind it."));
    const grid = h("div.card-grid.about-grid");
    cards.forEach((c) => {
      const body = c.body_md || c.body || c.text || c.summary || "";
      const srcs = Array.isArray(c.sources) ? c.sources : c.source ? [c.source] : [];
      grid.appendChild(h("article.card.about-card",
        c.icon ? h("div.about-icon", c.icon) : null,
        h("h3", c.title || ""),
        h("div.explain", { html: App.md(body) }),
        c.in_app || c.how ? h("p.in-app", { html: "<strong>In this app:</strong> " + App.inline(c.in_app || c.how) }) : null,
        srcs.length ? h("details.sources", h("summary", `Sources (${srcs.length})`), h("ul", srcs.map((x) => h("li.small",
          typeof x === "string" ? x : x.url ? h("a", { href: x.url, target: "_blank", rel: "noopener" }, x.title || x.url) : (x.title || ""))))) : null));
    });
    if (!cards.length) page.appendChild(h("p.muted", "The method notes will appear here once content/about.json is built into the course."));
    page.appendChild(grid);
  };

  // ------------------------------------------------------------------ settings
  App.pages.settings = function (main) {
    const page = h("div.page.settings-page");
    main.appendChild(page);
    page.appendChild(h("h1.page-title", "Settings"));
    const S = Store.state.settings;

    // voice
    const voiceCard = h("section.card.settings-card", h("h2", "Voice"));
    const vsel = h("select#voice", { "aria-label": "Spanish voice" });
    const vinfo = h("p.muted");
    function fillVoices() {
      vsel.innerHTML = "";
      const vs = Speech.spanishVoices();
      vsel.appendChild(h("option", { value: "" }, "Automatic (best Mexican voice)"));
      vs.slice().sort((a, b) => a.lang.localeCompare(b.lang) || a.name.localeCompare(b.name))
        .forEach((v) => vsel.appendChild(h("option", { value: v.voiceURI, selected: S.voice === v.voiceURI ? true : null }, `${v.name} (${v.lang})`)));
      const best = Speech.bestVoice();
      vinfo.innerHTML = vs.length ? `Using: <strong>${esc(best ? best.name + " (" + best.lang + ")" : "—")}</strong>. ${vs.length} Spanish voice${vs.length === 1 ? "" : "s"} available.` : Speech.NO_VOICE_HELP;
    }
    vsel.onchange = () => { S.voice = vsel.value; Store.save(); fillVoices(); Speech.speak("Hola, ¿cómo estás? Vamos a practicar.", "careful"); };
    Speech.whenReady(fillVoices);
    fillVoices();
    voiceCard.append(h("label", { for: "voice" }, "Spanish voice"), vsel, vinfo);
    // rates
    const rates = h("div.rates");
    [["careful", "Careful", 0.5, 1.3], ["slow", "Slow", 0.4, 1], ["natural", "Natural (fast)", 0.9, 1.8]].forEach(([k, label, lo, hi]) => {
      const val = h("output", String(S.rates[k]));
      const r = h("input", { type: "range", min: lo, max: hi, step: 0.05, value: S.rates[k], id: "rate-" + k, "aria-label": label + " speed" });
      r.oninput = () => { val.textContent = r.value; S.rates[k] = +r.value; };
      r.onchange = () => { Store.save(); Speech.speak("¿Dónde está el baño, por favor?", k); };
      rates.appendChild(h("div.rate-setting", h("label", { for: "rate-" + k }, label), r, val));
    });
    voiceCard.appendChild(rates);
    voiceCard.appendChild(h("div.btn-row", App.playBtn("Buenos días, ¿me da un café, por favor?", "careful", { label: "Test careful" }),
      App.playBtn("Buenos días, ¿me da un café, por favor?", "slow", { label: "Test slow" }), App.playBtn("¿Qué onda? ¿Todo bien?", "natural", { label: "Test natural" })));
    page.appendChild(voiceCard);

    // learning
    const learnCard = h("section.card.settings-card", h("h2", "Learning"));
    const npd = h("input.answer-input", { type: "number", min: 5, max: 200, step: 5, value: S.newPerDay, id: "npd" });
    npd.onchange = () => { S.newPerDay = Math.max(5, Math.min(200, +npd.value || 20)); Store.save(); };
    const preset = (n, label) => h("button.btn.btn-secondary.btn-sm", { type: "button", onclick: () => { S.newPerDay = n; npd.value = n; Store.save(); App.toast(`New-words goal: ${n} a day.`); } }, label);
    const presets = h("div.btn-row", preset(20, "Steady (20/day)"), preset(40, "Trip crunch (40/day)"));
    const toggle = (key, label) => {
      const cb = h("input", { type: "checkbox", id: "set-" + key, checked: S[key] !== false ? true : null });
      cb.onchange = () => { S[key] = cb.checked; Store.save(); };
      return h("label.check-row", { for: "set-" + key }, cb, " ", label);
    };
    learnCard.append(h("label", { for: "npd" }, "New words per day (goal)"), npd, presets,
      h("p.muted.small", "When more than 10 days' worth of reviews pile up, Continue sends you to reviews before new lessons."),
      toggle("showEnglish", "Show English on new-word cards (off = tap to reveal)"),
      toggle("autoplay", "Play audio automatically"));
    page.appendChild(learnCard);

    // data
    const dataCard = h("section.card.settings-card", h("h2", "Your progress"));
    const status = h("p.muted", Store.online ? `Synced with the local server${Store.coach ? " · AI coach available" : ""}.` : "Saved in this browser only (server not running).");
    const exp = h("button.btn.btn-secondary", { type: "button", onclick: () => {
      const blob = new Blob([Store.exportJSON()], { type: "application/json" });
      const a = h("a", { href: URL.createObjectURL(blob), download: `spanish-progress-${App.dayKey()}.json` });
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    } }, "⬇ Export progress");
    const file = h("input", { type: "file", accept: ".json,application/json", style: { display: "none" } });
    file.onchange = async () => {
      const f = file.files[0];
      if (!f) return;
      try { Store.importJSON(await f.text(), false); App.toast("Progress imported (merged)."); App.render(); }
      catch (e) { App.toast("Import failed: " + esc(e.message)); }
      file.value = "";
    };
    const imp = h("button.btn.btn-secondary", { type: "button", onclick: () => file.click() }, "⬆ Import progress");
    const reset = h("button.btn.btn-ghost.danger", { type: "button", onclick: () => {
      if (!confirm("Reset ALL progress (learned words, reviews, lessons, drafts)? Settings are kept. Export first if unsure.")) return;
      Store.reset(); App.toast("Progress reset."); location.hash = "#/";
    } }, "Reset progress");
    const stats = h("p.small", `${Store.knownCount()} items learned · ${Object.keys(Store.state.cards).length} review cards · ${Object.values(Store.state.lessons).filter((l) => l.done).length} lessons done`);
    dataCard.append(status, stats, h("div.btn-row", exp, imp, file, reset));
    page.appendChild(dataCard);
    const m = App.course.meta || {};
    page.appendChild(h("p", h("a", { href: "#/about" }, "💡 Why this works — the method behind the course")));
    page.appendChild(h("p.muted.small", `Course data: ${(m.counts && m.counts.vocab) || App.course.vocab.length} words, ${App.course.chunks.length} phrases, ${App.course.units.length} units.`));
  };
})();
