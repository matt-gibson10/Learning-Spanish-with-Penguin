/* Router, top bar, keyboard shortcuts and boot. Hash routes: #/ #/course #/lesson/:id[/:step] #/review #/words
 * #/sounds[/:id] #/grammar[/:id] #/speak[/:id] #/story[/:id] #/about #/settings */
(function () {
  "use strict";
  const App = window.App, h = App.h;

  const NAV = [
    ["home", "#/", "Home"], ["course", "#/course", "Course"], ["review", "#/review", "Review"], ["words", "#/words", "Words"],
    ["sounds", "#/sounds", "Sounds"], ["grammar", "#/grammar", "Grammar"], ["speak", "#/speak", "Speak"], ["read", "#/read", "Read"], ["chat", "#/chat", "Chat"], ["story", "#/story", "Story"],
    ["about", "#/about", "Why"], ["settings", "#/settings", "⚙"],
  ];
  const TITLES = { home: "Home", course: "Course", lesson: "Lesson", review: "Review", words: "Words", sounds: "Sounds", grammar: "Grammar",
    speak: "Speak", read: "Read", chat: "Charla", story: "Story", about: "Why this works", settings: "Settings" };

  function header() {
    const hd = App.$(".app-header");
    if (!hd) return;
    hd.innerHTML = "";
    const brand = h("a.brand", { href: "#/", "aria-label": "Learning Spanish with Penguin — home" });
    brand.innerHTML = App.penguinSvg("happy", 40);
    brand.appendChild(h("span.brand-text", h("span.brand-name", "Learning Spanish"), h("span.brand-sub", "with " + App.penguinName())));
    const nav = h("nav.nav", { "aria-label": "main" });
    NAV.forEach(([key, href, label]) => {
      const a = h("a", { href, "data-route": key, title: key === "settings" ? "Settings" : null, "aria-label": key === "settings" ? "Settings" : null }, label);
      if (key === "review") a.appendChild(h("span.badge.due-badge", { "aria-label": "due" }));
      nav.appendChild(a);
    });
    hd.append(brand, nav);
    updateBadge();
  }
  function updateBadge() {
    const b = App.$(".due-badge");
    if (!b) return;
    const n = Store.dueCards().length;
    b.textContent = n ? String(n > 99 ? "99+" : n) : "";
    b.style.display = n ? "" : "none";
  }
  App.updateBadge = updateBadge;

  function parse() {
    const raw = (location.hash || "#/").replace(/^#\/?/, "");
    const [path, qs] = raw.split("?");
    const parts = path.split("/").filter(Boolean).map(decodeURIComponent);
    const query = {};
    new URLSearchParams(qs || "").forEach((v, k) => (query[k] = v));
    return { route: parts[0] || "home", params: parts.slice(1), query };
  }

  App.render = function () {
    const { route, params, query } = parse();
    const main = App.$("#main");
    if (!main) return;
    if (window.Speech) Speech.cancel();
    App.pageEnter = null;
    main.innerHTML = "";
    const fn = App.pages[route] || App.pages.home;
    App.$$(".nav a").forEach((a) => {
      const on = a.dataset.route === route || (route === "lesson" && a.dataset.route === "course");
      a.classList.toggle("active", on);
      if (on) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    });
    document.title = `${TITLES[route] || "Home"} · Learning Spanish with Penguin`;
    const pp = App.$(".papel-picado");
    if (pp) pp.classList.toggle("subtle", route !== "home");
    try { fn(main, params, query); }
    catch (e) {
      console.error(e);
      main.appendChild(h("div.page", App.coach("oops", `<strong>Oops — this page hit a snag.</strong><br><code>${App.esc(e.message)}</code>`),
        h("a.btn.btn-primary", { href: "#/" }, "Home")));
    }
    updateBadge();
    if (!App._keepScroll) window.scrollTo(0, 0);
    App._keepScroll = false;
    main.focus({ preventScroll: true });
  };

  // ------------------------------------------------------------------ keyboard: Enter = next / check, 1-4 = choices
  document.addEventListener("keydown", (e) => {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    const t = e.target;
    const tag = (t && t.tagName) || "";
    if (tag === "TEXTAREA" || tag === "SELECT") return;
    const exs = App.$$(".exercise").filter((x) => x.isConnected);
    const ex = exs[exs.length - 1];
    if (e.key === "Enter") {
      if (tag === "INPUT" && !(t.readOnly)) return;          // the input handles its own Enter (check)
      if (tag === "BUTTON" || tag === "A") { if (!(ex && ex._enter)) return; }   // let the focused control act
      if (ex && ex._enter) { e.preventDefault(); ex._enter(); return; }
      if (App.pageEnter && tag !== "INPUT") { e.preventDefault(); App.pageEnter(); }
    } else if ((e.key === "?" || e.key === "0") && ex && ex._unsure && tag !== "INPUT" && !ex.classList.contains("answered")) {
      e.preventDefault();
      ex._unsure();
    } else if (/^[1-9]$/.test(e.key) && ex && ex._keys && tag !== "INPUT") {
      e.preventDefault();
      ex._keys(+e.key);
    } else if (e.key === " " && tag !== "INPUT" && tag !== "BUTTON") {
      const fc = ex && ex.querySelector(".flashcard:not(.flipped)");
      if (fc) { e.preventDefault(); fc.click(); }
    }
  });

  // ------------------------------------------------------------------ boot
  function boot() {
    header();
    window.addEventListener("hashchange", App.render);
    Store.onChange(App.debounce(updateBadge, 200));
    App.render();
    Store.connect().then((r) => {
      if (r.online) {
        document.documentElement.classList.add("online");
        const { route } = parse();
        // refresh pages whose numbers may have changed after merging server progress (not mid-exercise)
        if (["home", "course", "settings"].includes(route)) { App._keepScroll = true; App.render(); }
      }
    });
    setInterval(updateBadge, 60000);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
