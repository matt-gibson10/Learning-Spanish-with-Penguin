/* Router, top bar, keyboard shortcuts and boot. Hash routes: #/ #/course #/lesson/:id[/:step] #/review #/words
 * #/sounds[/:id] #/grammar[/:id] #/speak[/:id] #/read #/chat[/:id] #/say #/story[/:id] #/progress[/checkup] #/about #/settings */
(function () {
  "use strict";
  const App = window.App, h = App.h;

  // "Why this works" (#/about) lives on Home's quick links and in Settings, which keeps the nav on one row
  const NAV = [
    ["home", "#/", "Home"], ["course", "#/course", "Course"], ["review", "#/review", "Review"], ["words", "#/words", "Words"],
    ["sounds", "#/sounds", "Sounds"], ["grammar", "#/grammar", "Grammar"], ["speak", "#/speak", "Speak"], ["read", "#/read", "Read"], ["chat", "#/chat", "Chat"], ["say", "#/say", "💭 Say it"], ["story", "#/story", "Story"],
    ["progress", "#/progress", "Progress"], ["settings", "#/settings", "⚙"],
  ];
  const TITLES = { home: "Home", course: "Course", lesson: "Lesson", review: "Review", words: "Words", sounds: "Sounds", grammar: "Grammar",
    speak: "Speak", read: "Read", chat: "Charla", say: "Think out loud", story: "Story", progress: "Progress", about: "Why this works", settings: "Settings" };

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

  // Build the rating from saved progress. A rating that was started from an empty browser (no scored answers
  // yet) is rebuilt, so progress merged in from the server afterwards still counts. Returns true if it rebuilt.
  function startRating() {
    if (!window.Rating || !Rating.bootstrap) return false;
    const rt = Store.state.rating;
    const empty = !rt || !Object.values(rt.skills || {}).some((s) => s.n > 0);
    if (rt && !empty) return false;
    Store.state.rating = null;
    Rating.bootstrap(Store.state, window.COURSE);
    return true;
  }

  // ------------------------------------------------------------------ boot
  function boot() {
    header();
    window.addEventListener("hashchange", App.render);
    Store.onChange(App.debounce(updateBadge, 200));
    App.render();
    Store.connect().then((r) => {
      // the rating tracker (web/js/rating.js, optional) starts once server progress has been merged in
      let ratingReady = false;
      if (window.Rating) {
        try { if (Rating.init) Rating.init(window.COURSE); startRating(); ratingReady = true; }
        catch (e) { console.error(e); }
      }
      if (r.online) document.documentElement.classList.add("online");
      const { route } = parse();
      // refresh pages whose numbers may have changed after merging server progress / rating bootstrap (not mid-exercise)
      if ((r.online && ["home", "course", "settings"].includes(route)) || (ratingReady && ["home", "progress"].includes(route))) { App._keepScroll = true; App.render(); }
    });
    setInterval(updateBadge, 60000);
    // the server can miss the first probe (slow start, busy CPU) or drop later: keep trying, so progress
    // always reaches the database and not only this browser
    if (/^https?:/.test(location.protocol)) {
      setInterval(() => {
        if (Store.online) return;
        Store.connect().then((r) => {
          if (!r.online) return;
          document.documentElement.classList.add("online");
          // a rating that was started from an empty browser (no answers yet) is rebuilt from the merged progress
          try { if (startRating()) Store.save(); } catch (e) { console.error(e); }
          const { route } = parse();
          if (["home", "course", "progress"].includes(route)) { App._keepScroll = true; App.render(); }
        });
      }, 20000);
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
