/* Tugrion — site behaviour. No inline scripts, no innerHTML: all text is set with textContent. */
(function () {
  "use strict";

  /* ---------- Settings ---------- */
  var CONFIG = {
    // Fill these in after Google AdSense approves the site. While empty, no ad code loads and ad slots stay hidden.
    adsenseClient: "ca-pub-4908057275713944",
    adsenseSlots: { top: "", middle: "", article: "" }, // ad unit IDs from AdSense
    // Visitor counter: our own Supabase function (unique visitors per day, no raw IPs stored).
    counterUrl: "https://lhhwltdrmptjkjdkwgfq.supabase.co/rest/v1/rpc/site_hit",
    counterKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxoaHdsdGRybXB0amtqZGt3Z2ZxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQyNDg0MjksImV4cCI6MjEwOTgyNDQyOX0.IfeFWsZcBAKkQ9laPiX8bBJ0sGVamzkxA3b20bGIs0g" // public anon key: it can only call site_hit()
  };

  var DICT = window.TUGRION_I18N || {};
  var SUPPORTED = Object.keys(DICT);
  var DEFAULT_LANG = "en";

  function safeGet(key) { try { return window.localStorage.getItem(key); } catch (e) { return null; } }
  function safeSet(key, val) { try { window.localStorage.setItem(key, val); } catch (e) { /* storage blocked */ } }

  /* ---------- Language ---------- */
  function detectLang() {
    var saved = safeGet("tg_lang");
    if (saved && SUPPORTED.indexOf(saved) !== -1) return saved;
    var list = (navigator.languages && navigator.languages.length) ? navigator.languages : [navigator.language || ""];
    for (var i = 0; i < list.length; i++) {
      var code = String(list[i] || "").toLowerCase().split("-")[0];
      if (SUPPORTED.indexOf(code) !== -1) return code;
    }
    return DEFAULT_LANG;
  }

  function t(lang, key) {
    var d = DICT[lang] || DICT[DEFAULT_LANG] || {};
    if (Object.prototype.hasOwnProperty.call(d, key)) return d[key];
    var en = DICT[DEFAULT_LANG] || {};
    return Object.prototype.hasOwnProperty.call(en, key) ? en[key] : null;
  }

  function applyLang(lang) {
    // Articles written in one language keep their own lang attribute; only the site chrome is translated.
    if (!document.documentElement.hasAttribute("data-content-lang")) document.documentElement.setAttribute("lang", lang);
    var nodes = document.querySelectorAll("[data-i18n]");
    for (var i = 0; i < nodes.length; i++) {
      var v = t(lang, nodes[i].getAttribute("data-i18n"));
      if (typeof v === "string") nodes[i].textContent = v;
    }
    var aria = document.querySelectorAll("[data-i18n-aria]");
    for (var j = 0; j < aria.length; j++) {
      var a = t(lang, aria[j].getAttribute("data-i18n-aria"));
      if (typeof a === "string") aria[j].setAttribute("aria-label", a);
    }
    var titleKey = document.documentElement.getAttribute("data-title-key");
    if (titleKey) { var tt = t(lang, titleKey); if (tt) document.title = tt; }
    var sel = document.getElementById("lang-select");
    if (sel) sel.value = lang;
    currentLang = lang;
    renderCount();
  }

  function buildLangSelect() {
    var sel = document.getElementById("lang-select");
    if (!sel) return;
    while (sel.firstChild) sel.removeChild(sel.firstChild);
    for (var i = 0; i < SUPPORTED.length; i++) {
      var opt = document.createElement("option");
      opt.value = SUPPORTED[i];
      opt.textContent = DICT[SUPPORTED[i]]._name || SUPPORTED[i];
      sel.appendChild(opt);
    }
    sel.addEventListener("change", function () {
      var v = sel.value;
      if (SUPPORTED.indexOf(v) === -1) return;
      safeSet("tg_lang", v);
      applyLang(v);
    });
  }

  /* ---------- Visit counter ---------- */
  var currentLang = DEFAULT_LANG;
  var visitCount = null;

  function renderCount() {
    var el = document.getElementById("visit-count");
    if (!el || visitCount === null) return;
    try { el.textContent = visitCount.toLocaleString(currentLang); }
    catch (e) { el.textContent = String(visitCount); }
  }

  function hideCounter() {
    var box = document.getElementById("visit-stat");
    if (box) box.hidden = true;
  }

  function loadCounter() {
    var el = document.getElementById("visit-count");
    if (!el || !window.fetch) { hideCounter(); return; }
    // Show the last known number at once, then refresh it from the server.
    var cached = Number(safeGet("tg_visits"));
    if (isFinite(cached) && cached > 0) { visitCount = Math.floor(cached); renderCount(); }
    var ctrl = window.AbortController ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, 8000);
    fetch(CONFIG.counterUrl, {
      method: "POST", mode: "cors", credentials: "omit", referrerPolicy: "no-referrer", cache: "no-store",
      headers: { "apikey": CONFIG.counterKey, "Authorization": "Bearer " + CONFIG.counterKey, "Content-Type": "application/json" },
      body: "{}", signal: ctrl ? ctrl.signal : undefined
    })
      .then(function (r) { if (!r.ok) throw new Error("bad status"); return r.json(); })
      .then(function (data) {
        clearTimeout(timer);
        var n = Number(data);
        if (!isFinite(n) || n < 1 || n > 1e12) throw new Error("bad value");
        visitCount = Math.floor(n);
        safeSet("tg_visits", String(visitCount));
        renderCount();
      })
      .catch(function () {
        clearTimeout(timer);
        if (!(visitCount > 0)) hideCounter();
      });
  }

  /* ---------- Ads (Google AdSense) ---------- */
    // ---- hero slider (swipe, arrows, dots, autoplay; pauses on hover/focus) ----
  function setupSlider() {
    var root = document.querySelector("[data-slider]");
    if (!root) return;
    var track = root.querySelector(".slides"), slides = [].slice.call(root.querySelectorAll(".slide")),
        dots = root.querySelector(".slider-dots"), n = slides.length, i = 0, timer = null,
        reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!track || n < 2) return;
    slides.forEach(function (s, k) {
      s.setAttribute("aria-label", (k + 1) + " / " + n);
      var b = document.createElement("button");
      b.type = "button"; b.className = "dot"; b.setAttribute("aria-label", "Slide " + (k + 1));
      b.addEventListener("click", function () { go(k, true); });
      dots.appendChild(b);
    });
    function go(k, user) {
      i = (k + n) % n;
      track.style.transform = "translateX(" + (-100 * i) + "%)";
      slides.forEach(function (s, j) {
        var on = j === i;
        s.setAttribute("aria-hidden", on ? "false" : "true");
        [].forEach.call(s.querySelectorAll("a,button"), function (el) { el.tabIndex = on ? 0 : -1; });
      });
      [].forEach.call(dots.children, function (d, j) { d.setAttribute("aria-current", j === i ? "true" : "false"); });
      if (user) start();
    }
    function stop() { if (timer) { clearInterval(timer); timer = null; } }
    function start() { stop(); if (!reduce) timer = setInterval(function () { go(i + 1); }, 5000); }
    root.querySelector(".sl-prev").addEventListener("click", function () { go(i - 1, true); });
    root.querySelector(".sl-next").addEventListener("click", function () { go(i + 1, true); });
    root.addEventListener("keydown", function (e) {
      if (e.key === "ArrowLeft") go(i - 1, true);
      else if (e.key === "ArrowRight") go(i + 1, true);
    });
    var x0 = null, y0 = 0;
    track.addEventListener("pointerdown", function (e) { x0 = e.clientX; y0 = e.clientY; });
    track.addEventListener("pointerup", function (e) {
      if (x0 === null) return;
      var dx = e.clientX - x0, dy = e.clientY - y0; x0 = null;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) go(i + (dx < 0 ? 1 : -1), true);
    });
    track.addEventListener("pointercancel", function () { x0 = null; });
    document.addEventListener("visibilitychange", function () { if (document.hidden) stop(); else start(); });
    go(0); start();
  }

  function setupAds() {
    var client = CONFIG.adsenseClient;
    if (!/^ca-pub-\d{10,20}$/.test(client)) return; // not configured: leave slots hidden
    var s = document.createElement("script");
    s.async = true;
    s.crossOrigin = "anonymous";
    s.src = "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=" + encodeURIComponent(client);
    document.head.appendChild(s);
    var slots = document.querySelectorAll(".ad-slot[data-slot]");
    for (var i = 0; i < slots.length; i++) {
      var id = CONFIG.adsenseSlots[slots[i].getAttribute("data-slot")];
      if (!/^\d{6,20}$/.test(id || "")) continue;
      var box = slots[i].querySelector(".ad-box");
      var ins = document.createElement("ins");
      ins.className = "adsbygoogle";
      ins.style.display = "block";
      ins.setAttribute("data-ad-client", client);
      ins.setAttribute("data-ad-slot", id);
      ins.setAttribute("data-ad-format", "auto");
      ins.setAttribute("data-full-width-responsive", "true");
      box.appendChild(ins);
      slots[i].classList.add("is-on");
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    }
  }

  /* ---------- Start ---------- */
  function start() {
    var y = document.getElementById("year");
    if (y) y.textContent = String(new Date().getFullYear());
    buildLangSelect();
    applyLang(detectLang());
    loadCounter();
    setupAds();
    setupSlider();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
