/* Charla con Penguin (#/chat, #/chat/:topicId): a Spanish-only conversation partner on a chosen topic.
 * Backend: GET /api/chat/status, POST /api/chat (docs/CONTRACT.md "Conversation API"). Add ?mockchat=1 to the URL
 * (or #/chat?mockchat=1) to use a built-in fake partner for UI testing without a model. */
(function () {
  "use strict";
  const App = window.App, h = App.h, esc = App.esc;
  App.pages = App.pages || {};
  const MAX_SAVED = 50, MAX_SENT = 20;

  // ------------------------------------------------------------------ backend (real or mock)
  function mockOn() {
    try {
      if (/mockchat=1/.test(location.search + location.hash)) sessionStorage.setItem("mockchat", "1");
      return sessionStorage.getItem("mockchat") === "1";
    } catch (e) { return /mockchat=1/.test(location.search + location.hash); }
  }
  let statusCache = null;
  async function chatStatus() {
    if (mockOn()) return { available: true, backend: "mock", model: "mock partner", note: "Mock mode (?mockchat=1): replies are canned." };
    if (statusCache) return statusCache;
    if (!/^https?:/.test(location.protocol)) return { available: false, offline: true };
    try {
      const r = await fetch("api/chat/status", { cache: "no-store" });
      if (!r.ok) return { available: false, error: `status ${r.status}` };
      statusCache = await r.json();
      setTimeout(() => (statusCache = null), 30000);
      return statusCache;
    } catch (e) { return { available: false, offline: true }; }
  }
  let mockCalls = 0;
  async function mockReply(topic, level, history) {
    mockCalls++;
    await new Promise((r) => setTimeout(r, mockCalls === 1 ? 3600 : 1200));
    const last = history.filter((m) => m.role === "user").slice(-1)[0];
    const text = last ? last.text : "";
    const g = Grader.gradeFree(text, {});
    const note = g.notes.find((n) => n.kind === "grammar");
    let correction = null;
    if (/yo gusto/i.test(text)) correction = { original: "yo gusto", fixed: "me gusta", why_en: "Gustar works backwards: 'me gusta' = it pleases me." };
    else if (note) correction = { original: text, fixed: text, why_en: note.html.replace(/<[^>]+>/g, "") };
    const v = (topic.vocab || ["playa"])[mockCalls % Math.max(1, (topic.vocab || []).length)] || "playa";
    const replies = [
      [`¡Qué bien! A mí también me gusta. ¿Te gusta ${v === "playa" ? "la playa" : v}?`, `How nice! I like it too. Do you like ${v}?`],
      [`¡Órale! Yo voy mucho. ¿Con quién vas normalmente?`, `Wow! I go a lot. Who do you usually go with?`],
      [`Mmm, ¡qué rico! ¿Y qué más te gusta hacer?`, `Mmm, delicious! And what else do you like to do?`],
    ];
    const [es, en] = replies[mockCalls % replies.length];
    return { reply_es: es, reply_en: en, correction, suggestions: (topic.starters || ["Sí, me gusta mucho.", "No sé…"]).slice(0, 3), backend: "mock", ms: 1200 };
  }
  async function sendChat(topic, level, history, backend) {
    if (mockOn()) return mockReply(topic, level, history);
    const r = await fetch("api/chat", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topic_id: topic.id, level, history: history.slice(-MAX_SENT).map((m) => ({ role: m.role, text: m.text })), backend: backend || null }),
    });
    let data = null;
    try { data = await r.json(); } catch (e) { data = null; }
    if (!r.ok) {
      const err = new Error((data && (data.error || data.detail)) || `The chat server answered ${r.status}.`);
      err.setup = data && data.setup;
      err.status = r.status;
      throw err;
    }
    return data;
  }

  // ------------------------------------------------------------------ state
  function chats() { return Store.state.chats || (Store.state.chats = {}); }
  function convo(topicId) {
    const c = chats();
    return c[topicId] || (c[topicId] = { messages: [], updated: 0 });
  }
  function saveConvo(topicId) {
    const c = convo(topicId);
    if (c.messages.length > MAX_SAVED) c.messages = c.messages.slice(-MAX_SAVED);
    c.updated = Date.now();
    Store.save();
  }

  // ------------------------------------------------------------------ word glosses
  function glossFor(word) {
    let entries = [];
    try { entries = Grader.lookup(word); } catch (e) { entries = []; }
    for (const e of entries) {
      const it = App.item(e.lemma);
      if (it) return { it, form: word };
    }
    const it = App.allItems().find((x) => App.fold(x.es.replace(/[¿?¡!.,…]/g, "")) === App.fold(word));
    return it ? { it, form: word } : null;
  }
  /** Spanish text as tappable words; tapping shows a small gloss box below `host`. */
  function tappable(text, glossHost) {
    const p = h("p.chat-es", { lang: "es" });
    const re = /([\p{L}\p{N}]+)|([^\p{L}\p{N}]+)/gu;
    let m;
    while ((m = re.exec(text))) {
      if (m[1]) {
        const w = m[1];
        p.appendChild(h("span.tap-word", { role: "button", tabindex: 0, onclick: () => showGloss(w, glossHost),
          onkeydown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); showGloss(w, glossHost); } } }, w));
      } else p.appendChild(document.createTextNode(m[2]));
    }
    return p;
  }
  function showGloss(word, host) {
    host.innerHTML = "";
    const g = glossFor(word);
    const box = h("div.gloss-box");
    if (!g) {
      box.append(h("strong", { lang: "es" }, word), h("span.muted", " — not in the word list yet"), App.playBtn(word, "careful", { label: "" }));
    } else {
      const it = g.it;
      const base = App.fold(it.es) !== App.fold(word) ? ` (${it.es})` : "";
      box.append(h("strong", { lang: "es" }, word), h("span", ` — ${App.shortEn(it.en)}${base}`), App.playBtn(word, "careful", { label: "" }));
      if (!Store.isLearned(it.id)) {
        const add = h("button.btn.btn-ghost.btn-sm", { type: "button", onclick: () => { Store.learn([it.id], { dueNow: true }); add.replaceWith(h("span.small.muted", "✓ in review")); } }, "+ add to review");
        box.appendChild(add);
      } else box.appendChild(h("span.small.muted", "✓ in review"));
    }
    box.appendChild(h("button.btn.btn-ghost.btn-sm.gloss-close", { type: "button", "aria-label": "close", onclick: () => (host.innerHTML = "") }, "✕"));
    host.appendChild(box);
    App.say(word, "careful");
  }

  // ------------------------------------------------------------------ rendering
  function botBubble(msg) {
    const wrap = h("div.chat-row.bot");
    const avatar = h("div.chat-avatar", { html: App.penguinSvg("talking", 44), "aria-hidden": "true" });
    const bubble = h("div.chat-bubble.bot");
    const glossHost = h("div.gloss-host");
    bubble.appendChild(tappable(msg.text, glossHost));
    const en = h("p.chat-en.muted", { lang: "en" }, msg.en || "");
    en.hidden = true;
    const tools = h("div.chat-tools",
      App.playBtn(msg.text, "careful", { label: "" }), App.playBtn(msg.text, "slow", { label: "" }),
      msg.en ? h("button.btn.btn-ghost.btn-sm", { type: "button", onclick: (e) => { en.hidden = !en.hidden; e.target.textContent = en.hidden ? "Show English" : "Hide English"; } }, "Show English") : null);
    bubble.append(en, tools, glossHost);
    wrap.append(avatar, bubble);
    return wrap;
  }
  function userBubble(msg) {
    const wrap = h("div.chat-row.user");
    const bubble = h("div.chat-bubble.user", h("p.chat-es", { lang: "es" }, msg.text));
    wrap.appendChild(bubble);
    const fixes = h("div.chat-fixes");
    const c = msg.correction;
    if (c && c.fixed && App.fold(c.fixed) !== App.fold(c.original || "")) {
      fixes.appendChild(h("div.chat-fix", h("span.fix-label", "Tip: "), h("s", { lang: "es" }, c.original || ""), " → ", h("strong", { lang: "es" }, c.fixed),
        c.why_en ? h("div.small.muted", c.why_en) : null));
    } else if (c && c.why_en) {
      fixes.appendChild(h("div.chat-fix", h("span.fix-label", "Tip: "), h("span", c.why_en)));
    }
    (msg.notes || []).forEach((n) => fixes.appendChild(h("div.chat-fix", { html: `<span class="fix-label">Grammar: </span>${n}` })));
    if (fixes.childNodes.length) wrap.appendChild(fixes);
    return wrap;
  }
  /** Our own lenient grader's grammar notes on the learner's message, minus what the model already corrected. */
  function graderNotes(text, correction) {
    let notes = [];
    try { notes = Grader.gradeFree(text, {}).notes.filter((n) => n.kind === "grammar").map((n) => n.html); } catch (e) { notes = []; }
    if (correction && correction.fixed) {
      const fixed = App.fold(correction.fixed);
      notes = notes.filter((html) => {
        const ems = Array.from(html.matchAll(/<em>([^<]+)<\/em>/g)).map((m) => App.fold(m[1]));
        return !ems.some((e) => e && fixed.includes(e));
      });
    }
    return notes;
  }

  function setupCard(info) {
    const box = h("div.card.chat-setup");
    const lines = [];
    if (info.offline) lines.push("<strong>Chat needs the local server.</strong> Start the app with <code>start.bat</code> (or open it at http://localhost:8300).");
    else lines.push("<strong>Penguin's chat brain isn't switched on yet.</strong>");
    lines.push("To chat offline, install the small local model once: <code>py -3.13 scripts\\setup_chat_model.py</code> — then restart the app.");
    lines.push("Or set <code>ANTHROPIC_API_KEY</code> before starting the app to use Claude instead.");
    box.appendChild(App.coach("sleepy", lines.map((l) => `<p>${l}</p>`).join(""), { size: 80 }));
    if (info.setup) box.appendChild(h("pre.chat-setup-text", info.setup));
    if (info.error || info.note) box.appendChild(h("p.small.muted", info.error || info.note));
    return box;
  }

  // ------------------------------------------------------------------ pages
  App.pages.chat = async function (main, params) {
    const page = h("div.page.chat-page");
    main.appendChild(page);
    const topics = App.course.chatTopics || [];
    const S = Store.state.settings;
    if (!S.chatLevel) S.chatLevel = 1;
    if (params[0]) return chatView(page, topics.find((t) => t.id === params[0]));

    page.appendChild(h("h1.page-title", "Charla"));
    page.appendChild(App.coach("wave", `<p class="speech-line">¡Hola! Pick a topic and we'll chat — <strong>only in Spanish</strong>. Tap any word I say to see what it means.</p>`, { size: 96 }));
    const status = h("div.chat-status");
    const levels = h("div.btn-row.level-row", { role: "radiogroup", "aria-label": "level" }, h("span.fb-label", "Level"));
    [[1, "1 · short & simple"], [2, "2 · a bit more"], [3, "3 · free chat"]].forEach(([n, label]) => levels.appendChild(h("button.btn.btn-sm", {
      type: "button", role: "radio", "aria-checked": String(S.chatLevel === n), class: S.chatLevel === n ? "btn-primary" : "btn-secondary",
      onclick: () => { S.chatLevel = n; Store.save(); App.render(); },
    }, label)));
    page.appendChild(levels);
    if (!topics.length) { page.appendChild(h("p.muted", "No chat topics yet — they'll appear once content/chat_topics.json is built into the course.")); }
    const grid = h("div.card-grid.chat-topics");
    topics.forEach((t) => {
      const c = (Store.state.chats || {})[t.id];
      const n = c ? c.messages.filter((m) => m.role === "user").length : 0;
      grid.appendChild(h("a.card.chat-topic", { href: `#/chat/${t.id}` },
        h("div.chat-emoji", t.emoji || "💬"), h("h3", { lang: "es" }, t.title), t.title_en ? h("p.muted", t.title_en) : null,
        h("div.chips", h("span.tag.tier", `level ${t.tier || 1}`), n ? h("span.tag", `${n} message${n === 1 ? "" : "s"}`) : null)));
    });
    page.appendChild(grid);
    page.appendChild(status);
    page.appendChild(h("p.small.muted.chat-disclaimer", `${App.penguinName()}'s Spanish is usually right but not perfect — he's a small AI model.`));
    const st = await chatStatus();
    if (!page.isConnected) return;
    if (!st.available) status.appendChild(setupCard(st));
    else {
      const backends = Array.isArray(st.backends) ? st.backends : null;
      status.appendChild(h("p.small.muted", st.backend === "mock" ? st.note : `Chat partner: ${st.backend === "local" ? "small model on this computer (offline)" : st.backend === "claude" ? "Claude (online)" : st.backend || ""}${st.model ? " · " + st.model : ""}`));
      if (backends && backends.length > 1) {
        const sel = h("select.backend-select", { "aria-label": "chat backend", onchange: () => { S.chatBackend = sel.value; Store.save(); } },
          backends.map((b) => h("option", { value: b, selected: (S.chatBackend || st.backend) === b ? true : null }, b === "local" ? "Offline model (this computer)" : b === "claude" ? "Claude (online)" : b)));
        status.appendChild(h("label.check-row", "Partner: ", sel));
      }
    }
  };

  async function chatView(page, topic) {
    page.appendChild(h("nav.crumbs", h("a", { href: "#/chat" }, "Charla"), h("span", { "aria-current": "page" }, topic ? topic.title : "?")));
    if (!topic) { page.appendChild(h("p", "Topic not found.")); return; }
    const S = Store.state.settings;
    const c = convo(topic.id);
    if (!c.messages.length) { c.messages.push({ role: "bot", text: topic.opener_es, en: topic.opener_en || "", ts: Date.now() }); saveConvo(topic.id); }
    page.appendChild(h("div.chat-head",
      h("h1.page-title", h("span.chat-emoji", topic.emoji || "💬"), " ", h("span", { lang: "es" }, topic.title)),
      h("p.muted", [topic.title_en, topic.scenario_en].filter(Boolean).join(" — "))));
    const status = h("div.chat-status");
    page.appendChild(status);
    // load the model and pre-read this topic's instructions now, so the first reply isn't slow
    if (!mockOn() && S.chatBackend !== "claude") {
      fetch(`api/chat/status?warm=1&topic_id=${encodeURIComponent(topic.id)}&level=${S.chatLevel || 1}`, { cache: "no-store" }).catch(() => {});
    }
    const log = h("div.chat-log", { role: "log", "aria-live": "polite" });
    page.appendChild(log);
    c.messages.forEach((m) => log.appendChild(m.role === "bot" ? botBubble(m) : userBubble(m)));
    const sugg = h("div.chat-suggestions");
    const ta = h("textarea.answer-input.chat-input", { rows: 2, lang: "es", placeholder: "Escribe en español…", "aria-label": "your message", spellcheck: "false" });
    const send = h("button.btn.btn-primary", { type: "button" }, "Send");
    let mic = null;
    if (window.Speech && Speech.canListen) {
      mic = h("button.btn.btn-ghost.mic-btn", { type: "button", onclick: async () => {
        mic.disabled = true; mic.textContent = "🎙 Listening…";
        try { const alts = await Speech.listen({ timeout: 10000 }); ta.value = (ta.value ? ta.value.trim() + " " : "") + alts[0]; ta.focus(); }
        catch (e) { App.toast(e.message === "no-speech" ? "I didn't hear anything." : "Speech recognition isn't available."); }
        finally { mic.disabled = false; mic.textContent = "🎙"; }
      } }, "🎙");
    }
    const composer = h("div.chat-composer", sugg, h("div.answer-row", ta, send, mic), App.accentBar(ta));
    page.appendChild(composer);
    const footer = h("div.chat-footer",
      h("button.btn.btn-ghost.btn-sm", { type: "button", onclick: () => {
        if (!confirm("Start a new conversation on this topic? (This one will be cleared.)")) return;
        chats()[topic.id] = { messages: [], updated: Date.now() }; Store.save(); App.render();
      } }, "New conversation"),
      h("span.small.muted.chat-disclaimer", `${App.penguinName()}'s Spanish is usually right but not perfect — he's a small AI model.`));
    page.appendChild(footer);
    function setSuggestions(list) {
      sugg.innerHTML = "";
      (list || []).slice(0, 4).forEach((s) => sugg.appendChild(h("button.chip.chat-chip", { type: "button", lang: "es", onclick: () => {
        ta.value = String(s).replace(/…$/, " ").replace(/\.\.\.$/, " "); ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length);
      } }, s)));
    }
    const lastBot = c.messages.slice().reverse().find((m) => m.role === "bot");
    setSuggestions((lastBot && lastBot.suggestions) || topic.starters || []);
    const scrollEnd = () => setTimeout(() => { const last = log.lastElementChild; if (last) last.scrollIntoView({ block: "nearest", behavior: "smooth" }); }, 30);
    scrollEnd();
    if (c.messages.length === 1 && S.autoplay !== false) setTimeout(() => App.say(topic.opener_es, "careful"), 300);

    const st = await chatStatus();
    if (!page.isConnected) return;
    if (!st.available) { status.appendChild(setupCard(st)); send.disabled = true; }
    else if (st.backend === "mock") status.appendChild(h("p.small.muted", st.note));

    let busy = false;
    async function doSend() {
      const text = ta.value.trim();
      if (!text || busy) { if (!text) ta.focus(); return; }
      busy = true; send.disabled = true;
      const um = { role: "user", text, ts: Date.now() };
      c.messages.push(um);
      const uEl = userBubble(um);
      log.appendChild(uEl);
      ta.value = "";
      setSuggestions([]);
      const typing = h("div.chat-row.bot.typing", h("div.chat-avatar", { html: App.penguinSvg("thinking", 44), "aria-hidden": "true" }),
        h("div.chat-bubble.bot", h("span.typing-dots", { "aria-label": "Penguin is typing" }, h("i"), h("i"), h("i")), h("span.typing-note.small.muted")));
      log.appendChild(typing);
      scrollEnd();
      const wake = setTimeout(() => { const n = typing.querySelector(".typing-note"); if (n) n.textContent = ` ${App.penguinName()} is waking up…`; }, 3000);
      try {
        const res = await sendChat(topic, S.chatLevel || 1, c.messages, S.chatBackend);
        um.correction = res.correction || null;
        um.notes = graderNotes(text, um.correction);
        uEl.replaceWith(userBubble(um));
        const bm = { role: "bot", text: res.reply_es || "…", en: res.reply_en || "", suggestions: res.suggestions || [], ts: Date.now() };
        c.messages.push(bm);
        typing.remove();
        log.appendChild(botBubble(bm));
        setSuggestions(bm.suggestions.length ? bm.suggestions : topic.starters);
        if (S.autoplay !== false) App.say(bm.text, "careful");
        Store.touchStreak();
      } catch (e) {
        typing.remove();
        c.messages.pop();           // keep the learner's text in the box to resend
        uEl.remove();
        ta.value = text;
        if (e.status === 503 || e.status === 404) { status.innerHTML = ""; status.appendChild(setupCard({ error: e.message, setup: e.setup })); }
        else App.toast("Couldn't reach the chat: " + esc(e.message));
      } finally {
        clearTimeout(wake);
        busy = false; send.disabled = !st.available && !mockOn();
        saveConvo(topic.id);
        scrollEnd();
      }
    }
    send.onclick = doSend;
    ta.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); e.stopPropagation(); doSend(); } });
  }
})();
