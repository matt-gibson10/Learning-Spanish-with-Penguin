/* Free production: respond to prompts (#/speak) and write goal stories (#/story). Lenient grading via
 * Grader.gradeFree, optional AI coach (POST /api/coach) when the server reports it is available. */
(function () {
  "use strict";
  const App = window.App, h = App.h, esc = App.esc;

  // ------------------------------------------------------------------ shared bits
  function targetChips(r) {
    const box = h("div.targets");
    (r.targets.hit || []).forEach((t) => box.appendChild(h("span.chip.target-hit", { title: "used" }, "✓ " + t)));
    (r.targets.missed || []).forEach((t) => box.appendChild(h("span.chip.target-miss", { title: "not found" }, "○ " + t)));
    return box;
  }
  function freeFeedback(r, spec) {
    const extra = h("div.free-extra");
    if ((spec.targets || []).length) {
      extra.appendChild(h("div.fb-row", h("span.fb-label", `Key words ${r.targets.hit.length}/${spec.targets.length}`), targetChips(r)));
    }
    const slips = (r.notes || []).filter((n) => n.kind === "grammar").length;
    const line = r.outcome === "good" ? (slips ? "Your meaning comes across — a couple of small fixes below." : App.line("good") + " Your meaning comes across.") :
      r.outcome === "close" ? "¡Casi! Good start — try to work in the missing words." : "Let's try that again — the key words below will help.";
    return App.feedback(r, { line, extra, showDiff: true });
  }
  /** penguin:answer for free writing (see App.emitAnswer in widgets.js). */
  function emitFree(r, d) {
    App.emitAnswer(Object.assign({ mode: "free", outcome: r.outcome, score: typeof r.score === "number" ? r.score : null, production: true,
      slip: r.outcome === "good" && (r.notes || []).some((n) => n.kind === "grammar") }, d));
  }
  function grammarLinks(ids) {
    const gs = (ids || []).map(App.grammar).filter(Boolean);
    if (!gs.length) return null;
    return h("p.grammar-links", "Grammar: ", gs.map((g, i) => [i ? ", " : "", h("a", { href: `#/grammar/${g.id}` }, g.title)]));
  }
  function modelList(models) {
    const box = h("div.models");
    (models || []).forEach((m) => box.appendChild(h("div.model-line", h("span", { lang: "es" }, m), " ", App.playBtn(m, "careful", { label: "" }), App.playBtn(m, "natural", { label: "" }))));
    return box;
  }

  /** "Ask the coach" button (only when the server says the coach is available). */
  App.coachButton = function (getPayload, label) {
    label = label || `🐧 Ask ${App.penguinName()} (AI coach)`;
    if (!Store.coach) return null;
    const out = h("div.coach-out");
    const btn = h("button.btn.btn-secondary.coach-btn", { type: "button", onclick: async () => {
      const payload = getPayload();
      if (!payload.text || !payload.text.trim()) { App.toast("Write something first."); return; }
      btn.disabled = true; btn.textContent = "Thinking…";
      out.innerHTML = "";
      try {
        const r = await fetch("api/coach", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        const data = await r.json();
        if (!r.ok) throw new Error(data.detail || "Coach unavailable");
        out.appendChild(payload.mode === "reading" ? renderReadingCoach(data) : renderCoach(data));
      } catch (e) {
        out.appendChild(h("p.coach-error", "The coach couldn't answer: " + e.message + " (the built-in feedback above still applies)."));
      } finally { btn.disabled = false; btn.textContent = label; }
    } }, label);
    return h("div.coach-wrap", btn, out);
  };
  function renderReadingCoach(d) {
    const box = h("div.card.coach-card");
    let html = `<p class="speech-line"><strong>${esc(d.verdict || "")}</strong></p>`;
    if (d.feedback) html += `<p>${esc(d.feedback)}</p>`;
    if ((d.misconceptions || []).length) html += "<ul>" + d.misconceptions.map((m) => `<li>${esc(m)}</li>`).join("") + "</ul>";
    if (d.encouragement) html += `<p>${esc(d.encouragement)}</p>`;
    box.appendChild(App.coach(d.understood === "yes" ? "happy" : "thinking", html, { size: 64, name: false }));
    return box;
  }
  function renderCoach(d) {
    const box = h("div.card.coach-card");
    let html = `<strong>${esc(d.encouragement || "")}</strong>`;
    if (d.meaning_note) html += `<p>${d.meaning_conveyed ? "✅" : "⚠️"} ${esc(d.meaning_note)}</p>`;
    box.appendChild(App.coach(d.meaning_conveyed ? "happy" : "thinking", html));
    if ((d.corrections || []).length) {
      const ul = h("ul.corrections");
      d.corrections.forEach((c) => ul.appendChild(h("li", h("span.diff", h("span.grammar", c.original)), " → ", h("strong", { lang: "es" }, c.fixed), h("div.why", c.why))));
      box.appendChild(h("h4", "Fixes"));
      box.appendChild(ul);
    }
    if (d.corrected) box.appendChild(h("div.fb-row", h("span.fb-label", "Corrected"), h("span", { lang: "es" }, d.corrected), " ", App.playBtn(d.corrected, "careful", { label: "" })));
    if (d.natural) box.appendChild(h("div.fb-row", h("span.fb-label", "How a Mexican might say it"), h("span", { lang: "es" }, d.natural), " ", App.playBtn(d.natural, "natural", { label: "" })));
    return box;
  }

  function micInto(textarea) {
    if (!window.Speech || !Speech.canListen) return null;
    const b = h("button.btn.btn-ghost.mic-btn", { type: "button", onclick: async () => {
      b.disabled = true; b.textContent = "🎙 Listening…";
      try {
        const alts = await Speech.listen({ timeout: 12000 });
        textarea.value = (textarea.value ? textarea.value.trim() + " " : "") + alts[0];
        textarea.dispatchEvent(new Event("input"));
      } catch (e) { App.toast(e.message === "no-speech" ? "I didn't hear anything." : "Speech recognition isn't available."); }
      finally { b.disabled = false; b.textContent = "🎙 Say it"; }
    } }, "🎙 Say it");
    return b;
  }

  // ------------------------------------------------------------------ prompt view
  App.promptView = function (p, opts) {
    opts = opts || {};
    const card = h("div.card.prompt-card");
    card.appendChild(h("p.situation", h("span.tag", p.situation || "Situation")));
    card.appendChild(h("p.prompt-en", p.prompt_en));
    // listen first: what they say is heard at natural speed; the text only on demand or after Check
    let revealSaid = () => {};
    if (p.prompt_es) {
      const text = h("span.prompt-es.hidden", { lang: "es" }, p.prompt_es);
      const showBtn = h("button.btn.btn-ghost.btn-sm", { type: "button" }, "Show what they said");
      revealSaid = () => { text.classList.remove("hidden"); showBtn.remove(); };
      showBtn.onclick = revealSaid;
      const said = h("div.they-say",
        h("span.fb-label", "They say"), text, showBtn,
        h("div.audio-row", App.playBtn(p.prompt_es, "natural"), App.playBtn(p.prompt_es, "careful"), App.playBtn(p.prompt_es, "slow")));
      card.appendChild(said);
      if (Store.state.settings.autoplay !== false) setTimeout(() => { if (card.isConnected) App.say(p.prompt_es, "natural"); }, 300);
    }
    const draftKey = "p:" + p.id;
    const ta = h("textarea.answer-input", { rows: 3, lang: "es", placeholder: "Responde en español…", "aria-label": "your answer", spellcheck: "false" });
    ta.value = Store.state.drafts[draftKey] || "";
    ta.addEventListener("input", App.debounce(() => { Store.state.drafts[draftKey] = ta.value; Store.save(); }, 500));
    card.appendChild(ta);
    card.appendChild(App.accentBar(ta));
    const help = App.wordHelp((p.targets || []).join(" "));
    const hints = h("details.hints", h("summary", "Hints"),
      help, (p.targets || []).length ? h("p", "Try to use: ", h("span", { lang: "es" }, p.targets.join(" · "))) : null,
      (p.hints || []).map((x) => h("p", { html: App.inline(x) })));
    const check = h("button.btn.btn-primary", { type: "button" }, "Check");
    const mic = micInto(ta);
    card.appendChild(h("div.answer-row.prompt-actions", check, mic));
    card.appendChild(hints);
    const fb = h("div.prompt-feedback");
    card.appendChild(fb);
    let tries = 0;
    check.onclick = () => {
      const text = ta.value;
      if (!text.trim()) { ta.focus(); return; }
      tries++;
      const spec = { targets: p.targets || [], models: p.models || [] };
      const r = Grader.gradeFree(text, spec);
      emitFree(r, { itemKind: "prompt", refId: p.id, exType: "prompt", context: opts.inLesson ? "lesson" : "speak", retry: tries > 1 });
      revealSaid();
      fb.innerHTML = "";
      fb.appendChild(freeFeedback(r, spec));
      const more = h("div.prompt-more");
      const gl = grammarLinks(p.grammar);
      if (gl) more.appendChild(gl);
      // a weak first try: hints open, models behind a click, so the retry comes from memory
      if (r.outcome === "miss" && tries < 2) {
        hints.open = true;
        more.appendChild(h("details.models-wrap", h("summary", "Show model answers"), modelList(p.models)));
      } else {
        more.appendChild(h("h4", "Model answers"));
        more.appendChild(modelList(p.models));
      }
      const cb = App.coachButton(() => ({ kind: "prompt", task_en: p.prompt_en, context_es: p.prompt_es || "", text: ta.value, targets: p.targets || [], model_answers: p.models || [] }));
      if (cb) more.appendChild(cb);
      const prev = Store.state.prompts[p.id] || {};
      Store.state.prompts[p.id] = { best: Math.max(prev.best || 0, r.score), outcome: r.outcome === "good" || prev.outcome === "good" ? "good" : r.outcome, at: Date.now() };
      Store.touchStreak();
      Store.save();
      const nav = h("div.answer-row");
      nav.appendChild(h("button.btn.btn-ghost", { type: "button", onclick: () => { fb.innerHTML = ""; ta.focus(); } }, "Try again"));
      if (opts.onDone) nav.appendChild(h("button.btn.btn-primary.btn-next", { type: "button", onclick: opts.onDone }, "Continue →"));
      else {
        const nx = nextPrompt(p.id);
        if (nx) nav.appendChild(h("a.btn.btn-primary", { href: `#/speak/${nx.id}` }, "Next prompt →"));
      }
      more.appendChild(nav);
      fb.appendChild(more);
      fb.scrollIntoView({ behavior: "smooth", block: "nearest" });
    };
    ta.addEventListener("keydown", (e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); check.click(); } });
    return card;
  };
  function unlocked(x) { return !x.after_grammar || Store.isGrammarDone(x.after_grammar) || lessonReached(x.id) || targetsLearned(x); }
  /** Tier-1 prompts open as soon as most of their target words are learned (not only after their lesson). */
  function targetsLearned(p) {
    const ts = p.targets || [];
    if (!ts.length || (p.tier || 1) > 1) return false;
    const known = ts.filter((t) => {
      const f = App.fold(t);
      if (App.allItems().some((x) => Store.isLearned(x.id) && App.fold(x.es.replace(/[¿?¡!.,]/g, "")).includes(f))) return true;
      try { return Grader.lookup(t).some((e) => Store.isLearned(e.lemma)); } catch (e) { return false; }
    });
    return known.length >= Math.ceil(ts.length * 0.75);
  }
  function lessonReached(id) {   // the course has reached the lesson that contains this prompt/story
    for (const l of App.lessons()) {
      if (l.steps.some((s) => s.id === id)) return (Store.lessonState(l.id).step || 0) > 0;
    }
    return false;
  }
  function nextPrompt(after) {
    const ps = App.course.prompts;
    const i = ps.findIndex((x) => x.id === after);
    return ps.slice(i + 1).find((x) => !(Store.state.prompts[x.id] && Store.state.prompts[x.id].outcome === "good")) || null;
  }

  // ------------------------------------------------------------------ story view
  App.storyView = function (s, opts) {
    opts = opts || {};
    const card = h("div.card.story-card");
    card.appendChild(h("h2", s.title));
    if (s.source) card.appendChild(h("p.muted.story-source", "📖 " + s.source));
    card.appendChild(h("p.goal", { html: "🎯 " + App.inline(s.goal_en || "") }));
    const focus = [];
    if ((s.vocab_focus || []).length) focus.push(h("span", "Words: ", h("span", { lang: "es" }, s.vocab_focus.join(", "))));
    const gl = grammarLinks(s.grammar_focus);
    if (focus.length || gl) card.appendChild(h("div.focus", focus, gl));
    const draft = Store.state.drafts[s.id] || (Store.state.drafts[s.id] = { beats: [], all: "", mode: "beats" });
    const saveDraft = App.debounce(() => Store.save(), 500);
    const modeRow = h("div.mode-toggle", { role: "tablist" });
    const bBeats = h("button.btn", { type: "button", role: "tab" }, "Beat by beat");
    const bAll = h("button.btn", { type: "button", role: "tab" }, "All at once");
    modeRow.append(bBeats, bAll);
    card.appendChild(modeRow);
    const area = h("div.story-area");
    card.appendChild(area);
    const end = h("div.story-end");
    card.appendChild(end);

    function setMode(m) {
      draft.mode = m; Store.save();
      bBeats.className = "btn " + (m === "beats" ? "btn-primary" : "btn-secondary");
      bAll.className = "btn " + (m === "all" ? "btn-primary" : "btn-secondary");
      bBeats.setAttribute("aria-selected", m === "beats"); bAll.setAttribute("aria-selected", m === "all");
      area.innerHTML = "";
      if (m === "beats") renderBeats(); else renderAll();
    }
    bBeats.onclick = () => setMode("beats");
    bAll.onclick = () => setMode("all");

    let lastTa = null;
    function renderBeats() {
      (s.beats || []).forEach((b, i) => {
        const box = h("div.beat");
        box.appendChild(h("p.beat-en", h("span.beat-num", String(i + 1)), " ", b.en));
        const ta = h("textarea.answer-input", { rows: 2, lang: "es", placeholder: "En español…", "aria-label": `beat ${i + 1}`, spellcheck: "false" });
        ta.value = draft.beats[i] || "";
        ta.addEventListener("input", () => { draft.beats[i] = ta.value; saveDraft(); });
        ta.addEventListener("focus", () => { lastTa = ta; });
        const hint = b.hint_es ? h("details.hints", h("summary", "Hint"), h("p", { lang: "es" }, b.hint_es), (b.targets || []).length ? h("p", "Try: ", h("span", { lang: "es" }, b.targets.join(" · "))) : null) : null;
        const fb = h("div.beat-feedback");
        const check = h("button.btn.btn-secondary", { type: "button", onclick: () => {
          if (!ta.value.trim()) { ta.focus(); return; }
          const spec = { targets: b.targets || [] };
          const r = Grader.gradeFree(ta.value, spec);
          emitFree(r, { itemKind: "story", refId: s.id, refIndex: i, exType: "story-beat", context: opts.inLesson ? "lesson" : "story", retry: !!fb.childNodes.length });
          fb.innerHTML = "";
          fb.appendChild(freeFeedback(r, spec));
        } }, "Check");
        box.append(App.wordHelp([(b.targets || []).join(" "), b.hint_es || ""]) || "", ta, h("div.answer-row", check, micInto(ta), hint), fb);
        area.appendChild(box);
      });
      area.appendChild(App.accentBar(() => lastTa || area.querySelector("textarea")));
    }
    function renderAll() {
      const ta = h("textarea.answer-input.story-all", { rows: 8, lang: "es", placeholder: "Escribe tu historia aquí…", "aria-label": "your story", spellcheck: "false" });
      ta.value = draft.all || (draft.beats || []).filter(Boolean).join(" ");
      ta.addEventListener("input", () => { draft.all = ta.value; saveDraft(); });
      const beatsList = h("ol.beat-list", (s.beats || []).map((b) => h("li", b.en)));
      const fb = h("div.beat-feedback");
      const check = h("button.btn.btn-primary", { type: "button", onclick: () => {
        if (!ta.value.trim()) { ta.focus(); return; }
        const targets = Array.from(new Set((s.beats || []).flatMap((b) => b.targets || [])));
        const spec = { targets, models: s.model_es ? [s.model_es] : [] };
        const r = Grader.gradeFree(ta.value, spec);
        emitFree(r, { itemKind: "story", refId: s.id, exType: "story-all", context: opts.inLesson ? "lesson" : "story", retry: !!fb.childNodes.length });
        fb.innerHTML = "";
        fb.appendChild(freeFeedback(r, spec));
      } }, "Check my story");
      area.append(beatsList, App.wordHelp((s.beats || []).flatMap((b) => (b.targets || []).concat(b.hint_es || []))) || "", ta, App.accentBar(ta), h("div.answer-row", check, micInto(ta)), fb);
    }

    // end: reveal model, coach, done
    const reveal = h("details.model-story", h("summary", "Reveal the model story"),
      h("p", { lang: "es" }, s.model_es || ""), h("div.audio-row", App.playBtn(s.model_es || "", "careful"), App.playBtn(s.model_es || "", "slow"), App.playBtn(s.model_es || "", "natural")),
      s.model_en ? h("p.muted", s.model_en) : null);
    end.appendChild(reveal);
    const cb = App.coachButton(() => ({ kind: "story", task_en: s.goal_en + " Beats: " + (s.beats || []).map((b) => b.en).join(" / "),
      text: draft.mode === "all" ? draft.all : (s.beats || []).map((b, i) => draft.beats[i] || "").filter(Boolean).join(" "),
      targets: (s.vocab_focus || []), model_answers: s.model_es ? [s.model_es] : [] }));
    if (cb) end.appendChild(cb);
    const doneBtn = h("button.btn.btn-primary.btn-next", { type: "button", onclick: () => {
      const st = Store.state.stories[s.id] || {};
      Store.state.stories[s.id] = { done: st.done || Date.now(), at: Date.now() };
      Store.touchStreak();
      Store.save();
      if (opts.onDone) opts.onDone(); else App.toast("Story saved. ¡Bien hecho!");
    } }, opts.inLesson ? "I'm done → continue" : "Mark as done");
    end.appendChild(h("div.answer-row", doneBtn));
    setMode(draft.mode || "beats");
    return card;
  };

  // ------------------------------------------------------------------ pages
  App.pages = App.pages || {};
  App.pages.speak = function (main, params) {
    const page = h("div.page.speak-page");
    main.appendChild(page);
    const ps = App.course.prompts;
    if (params[0]) {
      const p = App.prompt(params[0]);
      page.appendChild(h("nav.crumbs", h("a", { href: "#/speak" }, "Speak"), h("span", { "aria-current": "page" }, p ? p.situation || p.id : "?")));
      if (!p) { page.appendChild(h("p", "Prompt not found.")); return; }
      page.appendChild(h("h1.page-title", "Respond in Spanish"));
      page.appendChild(App.promptView(p));
      return;
    }
    page.appendChild(h("h1.page-title", "Speak: respond to real situations"));
    page.appendChild(App.coach("talking", "Read the situation, listen to what they say, then answer in Spanish. <strong>Typos and slips are fine</strong> — I check that your meaning gets across and point out grammar gently."));
    if (!ps.length) { page.appendChild(h("p", "No prompts yet.")); return; }
    const notDone = (x) => !(Store.state.prompts[x.id] && Store.state.prompts[x.id].outcome === "good");
    // always a Start: the first open prompt, else the easiest one not done yet (every tile opens anyway)
    const first = ps.find((x) => unlocked(x) && notDone(x)) || ps.filter(notDone).sort((a, b) => (a.tier || 1) - (b.tier || 1))[0];
    if (first) page.appendChild(h("a.btn.btn-primary.btn-big", { href: `#/speak/${first.id}` }, `Start: ${first.situation || "next prompt"} →`));
    const grid = h("div.card-grid.prompt-list");
    ps.forEach((p) => {
      const st = Store.state.prompts[p.id];
      const lock = !unlocked(p);
      const g = p.after_grammar ? App.grammar(p.after_grammar) : null;
      grid.appendChild(h("a.card.prompt-tile", { href: `#/speak/${p.id}`, class: (st ? "tried " : "") + (st && st.outcome === "good" ? "done" : "") + (lock ? " locked" : "") },
        h("span.tag", p.situation || "Prompt"), h("p", p.prompt_en),
        h("small", st ? (st.outcome === "good" ? "✓ done" : "tried") : lock && g ? `after: ${g.title}` : `tier ${p.tier || 1}`)));
    });
    page.appendChild(grid);
  };

  App.pages.story = function (main, params) {
    const page = h("div.page.story-page");
    main.appendChild(page);
    if (params[0]) {
      const s = App.story(params[0]);
      page.appendChild(h("nav.crumbs", h("a", { href: "#/story" }, "Stories"), h("span", { "aria-current": "page" }, s ? s.title : "?")));
      if (!s) { page.appendChild(h("p", "Story not found.")); return; }
      page.appendChild(App.storyView(s));
      return;
    }
    page.appendChild(h("h1.page-title", "Write your story"));
    page.appendChild(App.coach("happy", "Pick a goal story and write it in Spanish, beat by beat or all at once. Your drafts are saved as you type."));
    const grid = h("div.card-grid.story-list");
    App.course.stories.forEach((s) => {
      const st = Store.state.stories[s.id];
      const d = Store.state.drafts[s.id];
      const started = d && ((d.beats || []).some(Boolean) || d.all);
      grid.appendChild(h("a.card.story-tile", { href: `#/story/${s.id}`, class: st ? "done" : "" },
        h("h3", s.title), s.source ? h("small.muted.story-source", s.source) : null, h("p", s.goal_en),
        h("small", st ? "✓ done" : started ? "draft saved" : unlocked(s) ? `tier ${s.tier || 1}` : `after: ${(App.grammar(s.after_grammar) || {}).title || ""}`)));
    });
    if (!App.course.stories.length) page.appendChild(h("p", "No stories yet."));
    page.appendChild(grid);
  };
})();
