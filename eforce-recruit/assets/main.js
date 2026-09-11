/* eForce Recruit — 共通スクリプト（依存なし）
   1. ハンバーガーナビ  2. スクロールで現れる要素  3. 数字のカウントアップ
   4. 事例タブ          5. ヒーローの信号線アニメーション（canvas） */
(function () {
  "use strict";
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* 1. ナビ */
  var toggle = document.querySelector(".nav-toggle");
  var nav = document.querySelector(".nav");
  if (toggle && nav) {
    toggle.addEventListener("click", function () {
      var open = nav.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    });
    nav.addEventListener("click", function (e) {
      if (e.target.closest("a")) { nav.classList.remove("is-open"); toggle.setAttribute("aria-expanded", "false"); }
    });
  }

  /* 2. 出現 */
  var rv = document.querySelectorAll(".rv");
  if ("IntersectionObserver" in window && !reduce) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add("is-in"); io.unobserve(en.target); } });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
    rv.forEach(function (el) { io.observe(el); });
  } else {
    rv.forEach(function (el) { el.classList.add("is-in"); });
  }

  /* 3. カウントアップ（data-count="1000" data-suffix="+"） */
  var counters = document.querySelectorAll("[data-count]");
  function runCount(el) {
    var to = parseFloat(el.getAttribute("data-count"));
    var dec = (el.getAttribute("data-count").split(".")[1] || "").length;
    var dur = 1100, t0 = null, plain = el.hasAttribute("data-plain");
    function fmt(n) { var s = n.toFixed(dec); return plain ? s : s.replace(/\B(?=(\d{3})+(?!\d))/g, ","); }
    function frame(t) {
      if (!t0) t0 = t;
      var p = Math.min(1, (t - t0) / dur);
      var e = 1 - Math.pow(1 - p, 3);
      el.textContent = fmt(to * e);
      if (p < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }
  if (counters.length) {
    if ("IntersectionObserver" in window && !reduce) {
      var io2 = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) { if (en.isIntersecting) { runCount(en.target); io2.unobserve(en.target); } });
      }, { threshold: 0.5 });
      counters.forEach(function (el) { io2.observe(el); });
    } else {
      counters.forEach(function (el) { var v = el.getAttribute("data-count"); el.textContent = el.hasAttribute("data-plain") ? v : v.replace(/\B(?=(\d{3})+(?!\d))/g, ","); });
    }
  }

  /* 4. タブ */
  document.querySelectorAll("[data-tabs]").forEach(function (root) {
    var tabs = root.querySelectorAll("[role=tab]");
    var panels = root.querySelectorAll("[role=tabpanel]");
    function select(i) {
      tabs.forEach(function (t, j) { t.setAttribute("aria-selected", i === j ? "true" : "false"); t.tabIndex = i === j ? 0 : -1; });
      panels.forEach(function (p, j) { p.hidden = i !== j; });
    }
    tabs.forEach(function (t, i) {
      t.addEventListener("click", function () { select(i); });
      t.addEventListener("keydown", function (e) {
        var n = e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : null;
        if (n === null) return;
        n = (n + tabs.length) % tabs.length; select(n); tabs[n].focus(); e.preventDefault();
      });
    });
    select(0);
  });

  /* 5. ヒーロー背景: 基板の配線のように信号が走る */
  var cv = document.querySelector(".hero__canvas");
  if (cv && cv.getContext && !reduce) {
    var ctx = cv.getContext("2d");
    var W, H, DPR = Math.min(2, window.devicePixelRatio || 1);
    var GRID = 44, pulses = [], nodes = [];
    function resize() {
      var r = cv.parentNode.getBoundingClientRect();
      W = r.width; H = r.height;
      cv.width = W * DPR; cv.height = H * DPR; cv.style.width = W + "px"; cv.style.height = H + "px";
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      nodes = [];
      for (var x = GRID; x < W; x += GRID) for (var y = GRID; y < H; y += GRID) if (Math.random() < 0.06) nodes.push({ x: x, y: y, r: 1.5 + Math.random() * 1.5 });
    }
    function spawn() {
      var horiz = Math.random() < 0.5;
      var y = GRID * Math.round((Math.random() * H) / GRID), x = GRID * Math.round((Math.random() * W) / GRID);
      pulses.push({
        x: horiz ? -40 : x, y: horiz ? y : -40, horiz: horiz,
        v: 1.4 + Math.random() * 2.2, len: 60 + Math.random() * 140,
        col: Math.random() < 0.75 ? "46,230,214" : "43,91,255", turnAt: GRID * (2 + Math.floor(Math.random() * 10)), turned: false
      });
    }
    var last = 0, acc = 0;
    function draw(t) {
      var dt = Math.min(50, t - last); last = t; acc += dt;
      ctx.clearRect(0, 0, W, H);
      /* グリッド */
      ctx.strokeStyle = "rgba(255,255,255,0.045)"; ctx.lineWidth = 1; ctx.beginPath();
      for (var x = GRID; x < W; x += GRID) { ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, H); }
      for (var y = GRID; y < H; y += GRID) { ctx.moveTo(0, y + 0.5); ctx.lineTo(W, y + 0.5); }
      ctx.stroke();
      /* ノード */
      nodes.forEach(function (n) {
        ctx.fillStyle = "rgba(255,255,255,0.14)"; ctx.beginPath(); ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2); ctx.fill();
      });
      /* パルス */
      if (acc > 260 && pulses.length < 14) { spawn(); acc = 0; }
      pulses = pulses.filter(function (p) {
        var g;
        if (p.horiz) {
          if (!p.turned && p.x > p.turnAt) { p.turned = true; p.horiz = false; p.dir = Math.random() < 0.5 ? 1 : -1; }
          p.x += p.v * (dt / 16);
          g = ctx.createLinearGradient(p.x - p.len, 0, p.x, 0);
          g.addColorStop(0, "rgba(" + p.col + ",0)"); g.addColorStop(1, "rgba(" + p.col + ",0.9)");
          ctx.strokeStyle = g; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(p.x - p.len, p.y); ctx.lineTo(p.x, p.y); ctx.stroke();
          ctx.fillStyle = "rgba(" + p.col + ",1)"; ctx.beginPath(); ctx.arc(p.x, p.y, 2, 0, Math.PI * 2); ctx.fill();
          return p.x - p.len < W;
        } else {
          var d = p.dir || 1;
          p.y += p.v * d * (dt / 16);
          g = ctx.createLinearGradient(0, p.y - p.len * d, 0, p.y);
          g.addColorStop(0, "rgba(" + p.col + ",0)"); g.addColorStop(1, "rgba(" + p.col + ",0.9)");
          ctx.strokeStyle = g; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(p.x, p.y - p.len * d); ctx.lineTo(p.x, p.y); ctx.stroke();
          ctx.fillStyle = "rgba(" + p.col + ",1)"; ctx.beginPath(); ctx.arc(p.x, p.y, 2, 0, Math.PI * 2); ctx.fill();
          return d > 0 ? p.y - p.len < H : p.y + p.len > 0;
        }
      });
      requestAnimationFrame(draw);
    }
    resize(); window.addEventListener("resize", resize);
    requestAnimationFrame(draw);
  }

  /* 現在年（フッター） */
  document.querySelectorAll("[data-year]").forEach(function (el) { el.textContent = new Date().getFullYear(); });
})();
