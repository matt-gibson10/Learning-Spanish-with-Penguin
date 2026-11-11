/* Audio: speechSynthesis wrapper (best es-MX voice, careful / slow / natural speeds, queueing, cancel) and
 * optional speech recognition ("Say it"). Exposes window.Speech. */
(function () {
  "use strict";
  const synth = window.speechSynthesis || null;
  const Rec = window.SpeechRecognition || window.webkitSpeechRecognition || null;
  let voices = [];
  let ready = false;
  const listeners = [];
  const DEFAULT_RATES = { careful: 0.9, slow: 0.65, natural: 1.25 };

  function settings() {
    const s = (window.Store && window.Store.state && window.Store.state.settings) || {};
    return { voice: s.voice || "", rates: Object.assign({}, DEFAULT_RATES, s.rates || {}) };
  }

  function loadVoices() {
    if (!synth) return;
    const v = synth.getVoices() || [];
    if (v.length) {
      voices = v;
      ready = true;
      listeners.splice(0).forEach((f) => f(voices));
    }
  }
  if (synth) {
    loadVoices();
    if (typeof synth.addEventListener === "function") synth.addEventListener("voiceschanged", loadVoices);
    else synth.onvoiceschanged = loadVoices;
    setTimeout(loadVoices, 300);
    setTimeout(loadVoices, 1500);
  }

  function spanishVoices() {
    return voices.filter((v) => /^es([-_]|$)/i.test(v.lang));
  }
  function score(v) {
    let s = 0;
    const lang = v.lang.replace("_", "-").toLowerCase();
    if (lang === "es-mx") s += 100;
    else if (lang === "es-us" || lang === "es-419") s += 70;
    else if (/^es-(co|ar|cl|pe|ve)/.test(lang)) s += 40;
    else if (lang === "es-es") s += 20;
    else s += 30;
    if (/natural|online|neural/i.test(v.name)) s += 40;
    if (/dalia|jorge|renata|paloma|sabina|raul|raúl|gerardo/i.test(v.name)) s += 15;
    if (/google/i.test(v.name)) s += 25;
    if (v.localService === false) s += 3;
    return s;
  }
  function bestVoice() {
    const es = spanishVoices();
    if (!es.length) return null;
    const want = settings().voice;
    if (want) {
      const v = es.find((x) => x.voiceURI === want || x.name === want);
      if (v) return v;
    }
    return es.slice().sort((a, b) => score(b) - score(a))[0];
  }

  let queue = Promise.resolve();
  let gen = 0;
  /** speak(text, speed) -> Promise resolved when finished. speed: "careful" | "slow" | "natural" | number. */
  function speak(text, speed, opts) {
    opts = opts || {};
    if (!synth || !text) return Promise.resolve(false);
    const myGen = opts.queue ? gen : ++gen;
    if (!opts.queue) synth.cancel();
    const rate = typeof speed === "number" ? speed : (settings().rates[speed || "careful"] || 0.9);
    const clean = String(text).replace(/___/g, "…").replace(/\([^)]*\)/g, "").replace(/([A-Za-zÁÉÍÓÚÜÑáéíóúüñ])-(?=[A-Za-zÁÉÍÓÚÜÑáéíóúüñ])/g, "$1").replace(/[’']/g, "");
    const run = () => new Promise((resolve) => {
      if (myGen !== gen) return resolve(false);
      const u = new SpeechSynthesisUtterance(clean);
      const v = bestVoice();
      if (v) { u.voice = v; u.lang = v.lang; } else u.lang = "es-MX";
      u.rate = Math.max(0.3, Math.min(2, rate));
      u.pitch = 1;
      let done = false;
      const fin = (ok) => { if (!done) { done = true; resolve(ok); } };
      u.onend = () => fin(true);
      u.onerror = () => fin(false);
      setTimeout(() => fin(false), 2000 + clean.length * 220 / u.rate);   // safety: some engines never fire onend
      try { synth.speak(u); } catch (e) { fin(false); }
    });
    queue = opts.queue ? queue.then(run) : run();
    return queue;
  }
  function cancel() { gen++; if (synth) synth.cancel(); }

  /** Play the "natural" (fast) version: the first respelling if present, else the text, at natural speed. */
  function speakNatural(item, text) {
    // only a respelling that really is this item said fast (App.naturalOf rejects e.g. ser -> "osea"), and only when
    // the text being played is the item itself
    const same = !text || !item || String(text).toLowerCase().trim() === String(item.es).toLowerCase().trim();
    const nat = !item || !same ? null : window.App && App.naturalOf ? App.naturalOf(item)
      : Array.isArray(item.natural) && item.natural.length ? item.natural[0] : null;
    return speak(nat || text || (item && item.es), "natural");
  }

  function hasSpanish() { return spanishVoices().length > 0; }
  function whenReady(f) { if (ready || !synth) f(voices); else listeners.push(f); }

  const NO_VOICE_HELP = "No Spanish voice is installed, so audio can't play. On Windows: Settings → Time &amp; language → " +
    "Language &amp; region → Add a language → <b>Español (México)</b> (tick <i>Text-to-speech</i>), then restart the browser. " +
    "In Edge, the online voices (e.g. <i>Microsoft Dalia Online (Natural)</i>) work without installing anything.";

  // ------------------------------------------------------------------ speech recognition
  const canListen = !!Rec;
  function listen(opts) {
    opts = opts || {};
    return new Promise((resolve, reject) => {
      if (!Rec) return reject(new Error("unsupported"));
      cancel();
      const r = new Rec();
      r.lang = opts.lang || "es-MX";
      r.interimResults = false;
      r.maxAlternatives = 3;
      let got = false;
      r.onresult = (e) => {
        got = true;
        const alts = Array.from(e.results[0] || []).map((a) => a.transcript);
        resolve(alts);
      };
      r.onerror = (e) => { if (!got) reject(new Error(e.error || "error")); };
      r.onend = () => { if (!got) reject(new Error("no-speech")); };
      try { r.start(); } catch (e) { reject(e); }
      setTimeout(() => { try { r.stop(); } catch (e) { /* ignore */ } }, opts.timeout || 7000);
    });
  }

  /**
   * Continuous "think out loud" listening with live interim text.
   * opts: {lang ("en-US" | "es-MX", default "es-MX"), silenceMs (auto-stop after this long without speech, default 8000),
   *        onInterim(text), onFinal(text) (once per finished phrase, i.e. at each pause), onEnd(reason), onError(code)}
   * -> controller {stop() (finish, delivering pending finals), abort(), get active}. reason: "stopped" | "silence" | "error".
   * Engines end continuous sessions on their own (~60 s in Chrome); while the learner is still talking we restart.
   */
  function listenLive(opts) {
    opts = opts || {};
    if (!Rec) { if (opts.onError) opts.onError("unsupported"); return { stop() {}, abort() {}, get active() { return false; } }; }
    cancel();
    const silenceMs = opts.silenceMs || 8000;
    let r = null, stopped = false, ended = false, last = Date.now(), reason = "stopped", timer = null;
    const finish = (why) => {
      if (ended) return;
      ended = true; clearInterval(timer);
      if (opts.onInterim) opts.onInterim("");
      if (opts.onEnd) opts.onEnd(why);
    };
    function start() {
      r = new Rec();
      r.lang = opts.lang || "es-MX";
      r.continuous = true;
      r.interimResults = true;
      r.maxAlternatives = 1;
      r.onresult = (e) => {
        last = Date.now();
        let interim = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const res = e.results[i];
          const t = (res[0] && res[0].transcript || "").trim();
          if (res.isFinal) { if (t && opts.onFinal) opts.onFinal(t); }
          else interim += (interim ? " " : "") + t;
        }
        if (opts.onInterim) opts.onInterim(interim);
      };
      r.onerror = (e) => {
        const code = e.error || "error";
        if (code === "no-speech" || code === "aborted") return;      // silence is handled by our own timer
        stopped = true; reason = "error";
        if (opts.onError) opts.onError(code);
      };
      r.onend = () => {
        if (!stopped && Date.now() - last < silenceMs) { try { start(); return; } catch (e) { /* fall through */ } }
        finish(reason);
      };
      try { r.start(); } catch (e) { stopped = true; if (opts.onError) opts.onError(e.message || "error"); finish("error"); }
    }
    start();
    timer = setInterval(() => {
      if (!stopped && Date.now() - last >= silenceMs) { stopped = true; reason = "silence"; try { r.stop(); } catch (e) { finish("silence"); } }
    }, 500);
    return {
      stop() { if (stopped) return; stopped = true; reason = "stopped"; try { r.stop(); } catch (e) { finish("stopped"); } },
      abort() { stopped = true; reason = "stopped"; try { r.abort(); } catch (e) { /* ignore */ } finish("stopped"); },
      get active() { return !ended; },
    };
  }

  window.Speech = { speak, speakNatural, cancel, bestVoice, spanishVoices, hasSpanish, whenReady, canListen, listen, listenLive,
    supported: !!synth, NO_VOICE_HELP, DEFAULT_RATES, allVoices: () => voices };
})();
