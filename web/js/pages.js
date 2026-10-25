/* Pages: home, course map, review, words, sounds lab, grammar, about, settings. */
(function () {
  "use strict";
  const App = window.App, h = App.h, esc = App.esc;
  App.pages = App.pages || {};
  const DAY = 86400000;

  // ------------------------------------------------------------------ continue logic
  App.continueTarget = function () {
    const due = Store.dueCards().length;
    const nxt = Store.nextLesson();
    const sinceReview = Date.now() - (Store.state.lastReview || 0);
    const goal = Store.state.settings.newPerDay || 20;
    if (due && (due >= 8 || sinceReview > 3 * 3600000 || !nxt || due > 10 * goal)) {
      return { href: "#/review", label: `Review ${due} card${due === 1 ? "" : "s"}`,
        sub: due > 10 * goal ? "Big review pile — new words are paused until it's smaller." : "Due reviews first — they keep what you've learned." };
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
    else el.append(h("span.num", "🇲🇽"), h("span.label", h("strong", "¡Buen viaje!"), h("span", "Keep practising while you're there.")));
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
    page.appendChild(h("h2.section-title", "Today"));
    page.appendChild(h("div.stat-row",
      stat(Store.dueCards().length, "reviews due", "accent"),
      stat(`${day.new || 0}/${goal}`, "new today", "marigold"),
      stat(day.reviews || 0, "reviewed today"),
      stat(Store.streak(), "day streak", "good"),
      stat(`${Store.knownCount()}/${total}`, "words & phrases")));
    if ((day.new || 0) >= goal) page.appendChild(h("p.muted", "You've hit today's new-words goal 🎉 — reviews, Speak and Sounds are great next steps (or keep going if you have the energy)."));

    const done = App.lessons().filter((l) => Store.lessonState(l.id).done).length;
    const all = App.lessons().length;
    page.appendChild(h("div.course-progress",
      h("p", `Course: ${done} of ${all} lessons`),
      h("div.progress-bar", h("div.fill", { style: { width: (all ? (done / all) * 100 : 0).toFixed(1) + "%" } }))));

    page.appendChild(h("h2.section-title", "Jump to"));
    const links = [
      ["#/course", "🗺️", "Course map", "All units and lessons"],
      ["#/review", "🔁", "Review", "Spaced repetition"],
      ["#/sounds", "👂", "How it really sounds", "Fast Mexican speech"],
      ["#/speak", "💬", "Speak", "Respond to situations"],
      ["#/read", "📚", "Read", "Stories, sentence by sentence"],
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
  // Main card: hear it -> recall the meaning. Typed production mostly for survival words and phrases.
  const SURVIVAL_TOPICS = new Set(["courtesy", "restaurant", "food", "drink", "hotel", "directions", "transport", "money", "emergency", "shopping", "travel"]);
  const isSurvival = (it) => (it.cat === "chunk" && (it.rank || 9999) <= 300) || (SURVIVAL_TOPICS.has(it.topic) && (it.rank || 9999) <= 1500);
  function reviewExercise(it, card) {
    const seen = card.seen || 0;
    const dirs = isSurvival(it) ? ["hear", "produce", "read", "hear", "listen", "cloze"] : ["hear", "read", "hear", "cloze", "hear", "listen"];
    let dir = seen === 0 ? "hear" : dirs[seen % dirs.length];
    if (dir === "cloze" && !App.clozeOf(it)) dir = "hear";
    let ex;
    if (dir === "hear") ex = App.makeExercise(it, "hear-flash");
    else if (dir === "read") ex = App.makeExercise(it, "recognise-flash");
    else if (dir === "produce") ex = App.makeExercise(it, "produce-type");
    else if (dir === "listen") ex = App.makeExercise(it, card.reps >= 2 && (it.natural || []).length ? "listen-natural" : "listen-type");
    else ex = App.makeExercise(it, "cloze");
    ex.id = it.id;
    ex.dir = dir;
    if (dir === "recognise") ex.backAudio = null;
    return ex;
  }
  App.pages.review = function (main) {
    const page = h("div.page.review-page");
    main.appendChild(page);
    page.appendChild(h("h1.page-title", "Review"));
    const queue = Store.dueCards().slice(0, 40);
    const total = queue.length;
    if (!total) {
      const cards = Object.keys(Store.state.cards).length;
      const soon = Object.values(Store.state.cards).sort((a, b) => a.due - b.due)[0];
      page.appendChild(App.coach("sleepy", cards ? `<strong>Nothing due right now.</strong><br>Next review ${soon ? "in " + Store.describeIvl(soon) : "later"}. Learn something new?` :
        "<strong>No cards yet.</strong><br>Finish a lesson (or add words from the Words page) and they'll show up here."));
      const nxt = Store.nextLesson();
      page.appendChild(h("div.btn-row", nxt ? h("a.btn.btn-primary.btn-big", { href: `#/lesson/${nxt.id}` }, "Next lesson →") : null, h("a.btn.btn-secondary", { href: "#/" }, "Home")));
      return;
    }
    const bar = h("div.progress-bar", h("div.fill", { style: { width: "0%" } }));
    const info = h("p.ex-counter");
    const host = h("div.review-host");
    page.append(bar, info, host);
    let n = 0, good = 0;
    const again = [], reps = {};
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
      const ex = reviewExercise(it, card);
      const el = App.exercise(ex, {
        rate: true,
        onDone: (res, rating) => {
          Store.rate(id, rating || "good");
          reps[id] = (reps[id] || 0) + 1;
          if (rating === "again" && reps[id] < 3) again.push(id); else { n++; if (rating !== "hard" && rating !== "again") good++; }
          next();
        },
      });
      el.appendChild(h("p.dir-label", { hear: "Listen → meaning", read: "Read → meaning", produce: "Say it in Spanish", listen: "Listen → write", cloze: "In context" }[ex.dir] || ""));
      host.appendChild(el);
    }
    function finish() {
      bar.firstChild.style.width = "100%";
      info.textContent = "";
      host.appendChild(h("div.card.card-hero", App.coach("proud", `<strong>${esc(App.line("done"))}</strong><br>${total} cards reviewed${good ? `, ${good} solid` : ""}.`),
        h("div.btn-row", h("a.btn.btn-primary.btn-big", { href: App.continueTarget().href }, "Continue →"), h("a.btn.btn-secondary", { href: "#/" }, "Home"))));
      App.pageEnter = () => { location.hash = App.continueTarget().href; };
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
    const fLearned = sel("learned", [["", "Learned or not"], ["yes", "Learned"], ["no", "Not yet"]]);
    const filters = h("div.filters", q, fKind, fTier, fPos, fTopic, fLearned);
    page.appendChild(filters);
    const count = h("p.muted.count");
    const list = h("div.word-list");
    const more = h("button.btn.btn-secondary.more", { type: "button" }, "Show more");
    page.append(count, list, more);
    let shown = 0, rows = [];
    function apply() {
      const t = App.fold(q.value.trim());
      rows = all.filter((x) => {
        if (fKind.value && x.cat !== fKind.value) return false;
        if (fTier.value && String(x.tier) !== fTier.value) return false;
        if (fPos.value && x.pos !== fPos.value) return false;
        if (fTopic.value && x.topic !== fTopic.value) return false;
        if (fLearned.value === "yes" && !Store.isLearned(x.id)) return false;
        if (fLearned.value === "no" && Store.isLearned(x.id)) return false;
        if (t && !App.fold(x.es).includes(t) && !App.fold(x.en).includes(t) && !App.fold(x.plural || "").includes(t)) return false;
        return true;
      });
      if (t) rows.sort((a, b) => (App.fold(a.es).startsWith(t) ? 0 : 1) - (App.fold(b.es).startsWith(t) ? 0 : 1) || (a.rank || 0) - (b.rank || 0));
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
        h("span.wr-es", { lang: "es" }, App.withArticle(x)), App.genderChip(x), h("span.wr-en", x.en),
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
          onAnswer: (e, r) => { if (r.outcome !== "miss") good++; },
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
    page.appendChild(h("p.muted.small", `Course data: ${(m.counts && m.counts.vocab) || App.course.vocab.length} words, ${App.course.chunks.length} phrases, ${App.course.units.length} units.`));
  };
})();
