/* Reading (#/read, #/read/:id): read a Spanish story one sentence at a time, explain it in your own words, reveal,
 * self-mark (not graded). "Missed it" / "Partly" sends the sentence's glossed words to the review queue. */
(function () {
  "use strict";
  const App = window.App, h = App.h, esc = App.esc;
  App.pages = App.pages || {};

  const MARKS = [["got", "Got it", "good"], ["partly", "Partly", "close"], ["unsure", "Not sure 🤷", "unsure"], ["missed", "Missed it", "miss"]];
  const REACT = {
    got: ["¡Eso! You read that like a local.", "¡Muy bien! That sentence is yours now.", "Exactly the idea. ¡Órale!"],
    unsure: ["Not sure is a fine answer — the translation's right there, and its words are in your reviews now.", "No pasa nada. Read the English, then the Spanish once more."],
    partly: ["Half the battle! The glossed words are going into your reviews.", "Close — you caught the gist. The new bits will come back in review.", "Good guess from context — that's real reading."],
    missed: ["No pasa nada — that one was dense. I've queued its words for review.", "Tricky one! Read the English, then the Spanish once more.", "That's what reading practice is for. Its words are now in your deck."],
  };

  function rstate(id) {
    const all = Store.state.readings || (Store.state.readings = {});
    return all[id] || (all[id] = { idx: 0, marks: {}, notes: {}, done: 0, at: 0, runs: 0 });
  }
  function readingUnlocked(r) { return !r.after_grammar || Store.isGrammarDone(r.after_grammar) || lessonHas(r.id); }
  function lessonHas(id) {
    for (const l of App.lessons()) if (l.steps.some((s) => s.id === id)) return (Store.lessonState(l.id).step || 0) > 0;
    return false;
  }
  /** Map a glossed word to a vocab/chunk id, when there is one. */
  function vocabFor(w) {
    const key = App.fold(String(w.es || "").replace(/[¿?¡!.,]/g, "").trim());
    if (!key) return null;
    let hit = App.allItems().find((x) => App.fold(x.es.replace(/[¿?¡!.,…]/g, "").trim()) === key);
    if (hit) return hit;
    // inflected form -> lemma via the grader's lexicon (e.g. "llega" -> llegar)
    const m = /\(([^)]+)\)/.exec(w.en || "");
    if (m) { hit = App.allItems().find((x) => App.fold(x.es) === App.fold(m[1].trim())); if (hit) return hit; }
    try {
      for (const e of Grader.lookup(key)) { hit = App.item(e.lemma); if (hit) return hit; }
    } catch (e) { /* ignore */ }
    return null;
  }
  App.readingVocabFor = vocabFor;

  /** The sentence-by-sentence reader. opts: {inLesson, onDone, spanishOnly} */
  App.readView = function (r, opts) {
    opts = opts || {};
    const st = rstate(r.id);
    const sents = r.sentences || [];
    const spanishOnly = !!opts.spanishOnly;
    const wrap = h("div.reader");
    const head = h("div.reader-head",
      h("h2.reader-title", { lang: "es" }, r.title), r.title_en ? h("p.muted.reader-title-en", r.title_en) : null,
      r.source ? h("p.muted.story-source", "📖 " + r.source) : null,
      r.level_note ? h("span.tag", r.level_note) : null);
    const bar = h("div.progress-bar", h("div.fill", { style: { width: "0%" } }));
    const sofar = h("div.reader-sofar", { "aria-label": "story so far" });
    const stage = h("div.reader-stage");
    wrap.append(head, bar, sofar, stage);
    let listenFirst = !!(Store.state.settings.listenFirst);
    let i = opts.restart ? 0 : Math.min(st.idx || 0, sents.length);
    if (opts.restart || i >= sents.length) { i = 0; }
    const counts = { got: 0, partly: 0, unsure: 0, missed: 0 };

    function renderSoFar() {
      sofar.innerHTML = "";
      sents.slice(0, i).forEach((s, k) => sofar.appendChild(h("p.sofar-line", { class: st.marks[k] || "" },
        h("span", { lang: "es" }, s.es), spanishOnly ? null : h("span.sofar-en.muted", " — " + s.en))));
      bar.firstChild.style.width = (sents.length ? (i / sents.length) * 100 : 100).toFixed(1) + "%";
    }
    function show() {
      renderSoFar();
      stage.innerHTML = "";
      if (i >= sents.length) return finish();
      const s = sents[i];
      const card = h("div.card.card-hero.reader-card");
      card.appendChild(h("p.ex-counter", `Sentence ${i + 1} / ${sents.length}`));
      const text = h("p.reader-es", { lang: "es" }, s.es);
      const showBtn = h("button.btn.btn-secondary.btn-sm", { type: "button", onclick: () => { text.classList.remove("hidden"); showBtn.remove(); } }, "Show the text");
      const lf = h("label.check-row.listen-first", h("input", { type: "checkbox", checked: listenFirst ? true : null, onchange: (e) => {
        listenFirst = e.target.checked; Store.state.settings.listenFirst = listenFirst; Store.save(); show();
      } }), " Listen first (hide the text)");
      if (listenFirst) { text.classList.add("hidden"); }
      card.append(text);
      if (listenFirst) card.appendChild(showBtn);
      card.appendChild(h("div.audio-row",
        App.playBtn(s.es, "careful"), App.playBtn(s.es, "slow"), App.playBtn(s.natural || s.es, "natural")));
      card.appendChild(lf);
      if (listenFirst && Store.state.settings.autoplay !== false) setTimeout(() => { if (card.isConnected) App.say(s.es, "careful"); }, 250);
      const ta = h("textarea.answer-input", { rows: 2, lang: "en", placeholder: "What's this sentence about? (in English, your own words — optional)", "aria-label": "your explanation" });
      ta.value = st.notes[i] || "";
      ta.addEventListener("input", App.debounce(() => { st.notes[i] = ta.value; Store.save(); }, 400));
      const reveal = h("button.btn.btn-primary", { type: "button" }, "Reveal");
      card.append(ta, h("div.answer-row", reveal));
      const after = h("div.reader-reveal");
      card.appendChild(after);
      stage.appendChild(card);
      App.pageEnter = () => reveal.click();
      reveal.onclick = () => {
        reveal.remove();
        text.classList.remove("hidden"); showBtn.remove();
        st.notes[i] = ta.value; Store.save();
        ta.readOnly = true;
        const cmp = h("div.reader-compare");
        if (ta.value.trim()) cmp.appendChild(h("div.cmp.cmp-you", h("span.lbl", "You said"), h("span", ta.value.trim())));
        cmp.appendChild(h("div.cmp", h("span.lbl", "Translation"), h("span", s.en)));
        if (s.gist) cmp.appendChild(h("div.cmp.cmp-gist", h("span.lbl", "Big idea"), h("span", s.gist)));
        after.appendChild(cmp);
        if ((s.words || []).length) {
          const chips = h("div.reader-words");
          s.words.forEach((w) => {
            const it = vocabFor(w);
            const chip = h("span.word-chip",
              h("button.chip", { type: "button", lang: "es", title: "hear it", onclick: () => App.say(w.es, "careful") }, w.es),
              h("span.muted", " " + (w.en || "")));
            if (it && !Store.isLearned(it.id)) {
              const add = h("button.btn.btn-ghost.btn-sm", { type: "button", onclick: () => { Store.learn([it.id], { dueNow: true }); add.replaceWith(h("span.small.muted", "✓ in review")); } }, "+ review");
              chip.appendChild(add);
            }
            chips.appendChild(chip);
          });
          after.appendChild(h("div.fb-row", h("span.fb-label", "Words"), chips));
        }
        const cb = App.coachButton && Store.coach ? App.coachButton(() => ({ mode: "reading", kind: "reading", task_en: s.en, context_es: s.es, text: ta.value || "" }), `Ask ${App.penguinName()} (AI): did I misunderstand anything?`) : null;
        if (cb && ta.value.trim()) after.appendChild(cb);
        const react = h("div.reader-react");
        const row = h("div.btn-row.mark-row", { role: "group", "aria-label": "how did you do (not graded)" });
        MARKS.forEach(([k, label, cls]) => row.appendChild(h("button.btn", { type: "button", class: "btn-secondary mark-" + cls, onclick: () => mark(k) }, label)));
        after.append(h("p.muted.small", "How did that go? (just for you — not graded)"), row, react);
        App.pageEnter = null;
        function mark(k) {
          st.marks[i] = k; counts[k]++;
          if (k !== "got") {
            const ids = (s.words || []).map(vocabFor).filter(Boolean).map((x) => x.id);
            if (ids.length) {
              const fresh = ids.filter((id) => !Store.isLearned(id));
              Store.learn(ids, { dueNow: true });
              ids.forEach((id) => { if (!fresh.includes(id)) { const c = Store.state.cards[id]; if (c) c.due = Math.min(c.due, Date.now()); } });
            }
          }
          Store.save();
          row.innerHTML = "";
          react.innerHTML = "";
          react.appendChild(App.coach(k === "got" ? "happy" : k === "partly" || k === "unsure" ? "thinking" : "oops", `<p class="speech-line">${esc(App.pick(REACT[k]))}</p>`, { size: 64, name: false }));
          const nx = h("button.btn.btn-primary.btn-next", { type: "button", onclick: () => { i++; st.idx = i; Store.save(); show(); window.scrollTo({ top: 0, behavior: "smooth" }); } }, i < sents.length - 1 ? "Next sentence →" : "Finish →");
          react.appendChild(nx);
          App.pageEnter = () => nx.click();
          nx.focus();
        }
      };
    }
    function finish() {
      st.idx = sents.length;
      st.done = st.done || Date.now();
      st.at = Date.now();
      st.runs = (st.runs || 0) + 1;
      Store.touchStreak();
      Store.save();
      bar.firstChild.style.width = "100%";
      const tally = { got: 0, partly: 0, unsure: 0, missed: 0 };
      sents.forEach((_, k) => { if (st.marks[k]) tally[st.marks[k]]++; });
      const review = sents.map((s, k) => ({ s, k })).filter((x) => st.marks[x.k] && st.marks[x.k] !== "got");
      const end = h("div.card.card-hero.reader-end");
      end.appendChild(App.coach("cheer", `<h3 class="title">${esc(App.line("done"))}</h3><p>${tally.got} got it · ${tally.partly} partly${tally.unsure ? ` · ${tally.unsure} not sure` : ""} · ${tally.missed} missed — and you read a whole story in Spanish.</p>`, { size: 110 }));
      if (review.length) {
        end.appendChild(h("h4", "Worth another look"));
        end.appendChild(h("ul.reader-review", review.map(({ s, k }) => h("li", h("span", { lang: "es" }, s.es), " ", App.playBtn(s.es, "careful", { label: "" }),
          h("div.muted", s.en), st.notes[k] ? h("div.small", "You said: ", h("em", st.notes[k])) : null))));
      }
      const list = App.course.readings || [];
      const idx = list.indexOf(r);
      const next = list.slice(idx + 1).find((x) => !(Store.state.readings && Store.state.readings[x.id] && Store.state.readings[x.id].done));
      const btns = h("div.btn-row");
      if (opts.onDone) btns.appendChild(h("button.btn.btn-primary.btn-next", { type: "button", onclick: opts.onDone }, "Continue →"));
      btns.appendChild(h("a.btn.btn-secondary", { href: `#/read/${r.id}?mode=es` , onclick: (e) => { if (location.hash.startsWith(`#/read/${r.id}`)) { e.preventDefault(); location.hash = `#/read/${r.id}?mode=es&t=${Date.now()}`; } } }, "Read again (Spanish only)"));
      if (!opts.onDone && next) btns.appendChild(h("a.btn.btn-primary", { href: `#/read/${next.id}` }, `Next story: ${next.title} →`));
      end.appendChild(btns);
      stage.appendChild(end);
      sofar.innerHTML = "";
      App.pageEnter = opts.onDone ? opts.onDone : null;
    }
    show();
    return wrap;
  };

  App.pages.read = function (main, params, query) {
    const page = h("div.page.read-page");
    main.appendChild(page);
    const list = App.course.readings || [];
    if (params[0]) {
      const r = list.find((x) => x.id === params[0]);
      page.appendChild(h("nav.crumbs", h("a", { href: "#/read" }, "Read"), h("span", { "aria-current": "page" }, r ? r.title : "?")));
      if (!r) { page.appendChild(h("p", "Story not found.")); return; }
      if (!readingUnlocked(r)) {
        const g = App.grammar(r.after_grammar);
        page.appendChild(h("p.note.muted", `Heads-up: this story uses grammar you haven't reached yet${g ? ` (${g.title})` : ""}. Read it anyway — just go for the gist.`));
      }
      const spanishOnly = query.mode === "es";
      page.appendChild(App.readView(r, { spanishOnly, restart: spanishOnly }));
      return;
    }
    page.appendChild(h("h1.page-title", "Read"));
    page.appendChild(App.coach("talking", "Read a short story one sentence at a time. Say what each sentence is about in your own words, then reveal the English. <strong>Nothing here is graded</strong> — just mark how it went, and the words you missed go into your reviews."));
    if (!list.length) { page.appendChild(h("p.muted", "No reading stories yet — they'll appear once content/readings.json is built into the course.")); return; }
    const grid = h("div.card-grid.read-list");
    list.forEach((r) => {
      const st = (Store.state.readings || {})[r.id];
      const n = (r.sentences || []).length;
      const status = st && st.done ? "✓ read" : st && st.idx ? `${st.idx}/${n} read` : readingUnlocked(r) ? "" : `after: ${(App.grammar(r.after_grammar) || {}).title || "later grammar"}`;
      grid.appendChild(h("a.card.read-tile", { href: `#/read/${r.id}`, class: (st && st.done ? "done" : "") + (readingUnlocked(r) ? "" : " locked") },
        h("h3", { lang: "es" }, r.title), r.title_en ? h("p.muted", r.title_en) : null, r.source ? h("small.muted.story-source", r.source) : null,
        h("div.chips", h("span.tag.tier", `tier ${r.tier || 1}`), r.topic ? h("span.tag.topic", r.topic) : null, h("span.tag", `${n} sentences`)),
        status ? h("small", status) : null));
    });
    page.appendChild(grid);
  };
})();
