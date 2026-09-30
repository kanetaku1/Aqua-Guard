/*
 * Time-series Chart / Bar Chart — inline SVG (imports into Figma as vectors).
 * Charts.line("#id", { labels, series: [{ values, label, style: "primary"|"actual"|"target" }], yMin, yMax, ticks, unit,
 *                      band: { from, to }, threshold: [{ value, label }], height })
 * Charts.bars("#id", { labels, values, yMax, ticks, unit, height })
 */
(function () {
  var NS = "http://www.w3.org/2000/svg";
  var C = {
    primary: "#087EA4", actual: "#2F855A", muted: "#5B7078", grid: "#D6E3E5", text: "#5B7078",
    band: "#F9F0EB", threshold: "#B54708"
  };
  var registry = [];

  function el(tag, attrs, parent) {
    var n = document.createElementNS(NS, tag);
    for (var k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }
  function text(parent, x, y, str, anchor) {
    var t = el("text", { x: x, y: y, "font-size": 12, "font-family": "Inter, sans-serif", fill: C.text, "text-anchor": anchor || "start" }, parent);
    t.textContent = str;
    return t;
  }
  function frame(node, cfg) {
    var W = node.clientWidth;
    var H = cfg.height || 240;
    var pad = { l: 44, r: 16, t: cfg.unit ? 26 : 12, b: 28 };
    node.innerHTML = "";
    var svg = el("svg", { width: W, height: H, viewBox: "0 0 " + W + " " + H }, node);
    var iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
    var y = function (v) { return pad.t + ih - ((v - cfg.yMin) / (cfg.yMax - cfg.yMin)) * ih; };
    var ticks = cfg.ticks || 4;
    for (var i = 0; i <= ticks; i++) {
      var v = cfg.yMin + ((cfg.yMax - cfg.yMin) * i) / ticks;
      el("line", { x1: pad.l, x2: W - pad.r, y1: y(v), y2: y(v), stroke: C.grid, "stroke-width": 1 }, svg);
      text(svg, pad.l - 8, y(v) + 4, (Math.round(v * 10) / 10).toLocaleString("en-US"), "end");
    }
    if (cfg.unit) text(svg, pad.l - 8, 10, "(" + cfg.unit + ")", "end").setAttribute("font-size", 10);
    return { svg: svg, W: W, H: H, pad: pad, iw: iw, ih: ih, y: y };
  }
  function xLabels(f, labels, xAt) {
    var every = Math.max(1, Math.ceil(labels.length / 8));
    labels.forEach(function (lab, i) {
      if (i % every === 0 || i === labels.length - 1) text(f.svg, xAt(i), f.H - 8, lab, "middle");
    });
  }

  function drawLine(node, cfg) {
    var f = frame(node, cfg);
    var n = cfg.labels.length;
    var x = function (i) { return f.pad.l + (n === 1 ? f.iw / 2 : (i / (n - 1)) * f.iw); };
    if (cfg.band) {
      var top = f.y(Math.min(cfg.band.to, cfg.yMax)), bot = f.y(Math.max(cfg.band.from, cfg.yMin));
      el("rect", { x: f.pad.l, y: top, width: f.iw, height: bot - top, fill: C.band }, f.svg);
    }
    (cfg.threshold || []).forEach(function (th) {
      el("line", { x1: f.pad.l, x2: f.W - f.pad.r, y1: f.y(th.value), y2: f.y(th.value), stroke: C.threshold, "stroke-width": 1, "stroke-dasharray": "4 3" }, f.svg);
      var t = text(f.svg, f.W - f.pad.r, f.y(th.value) - 5, th.label, "end");
      t.setAttribute("fill", C.threshold);
    });
    cfg.series.forEach(function (s) {
      var d = "";
      s.values.forEach(function (v, i) {
        if (v == null) return;
        d += (d ? " L" : "M") + x(i).toFixed(1) + " " + f.y(v).toFixed(1);
      });
      var target = s.style === "target";
      var color = target ? C.muted : s.style === "actual" ? C.actual : C.primary;
      el("path", {
        d: d, fill: "none", stroke: color, "stroke-width": target ? 1.5 : 2,
        "stroke-dasharray": target ? "5 4" : "none", "stroke-linejoin": "round", "stroke-linecap": "round"
      }, f.svg);
      if (s.points) s.values.forEach(function (v, i) {
        if (v != null) el("circle", { cx: x(i), cy: f.y(v), r: 3, fill: "#fff", stroke: color, "stroke-width": 2 }, f.svg);
      });
    });
    xLabels(f, cfg.labels, x);
  }

  function drawBars(node, cfg) {
    var f = frame(node, Object.assign({ yMin: 0 }, cfg));
    var n = cfg.labels.length, slot = f.iw / n, bw = Math.min(28, slot * 0.56);
    var xc = function (i) { return f.pad.l + slot * i + slot / 2; };
    cfg.values.forEach(function (v, i) {
      var yTop = f.y(v);
      el("rect", { x: xc(i) - bw / 2, y: yTop, width: bw, height: f.pad.t + f.ih - yTop, rx: 2, fill: cfg.highlight === i ? C.threshold : cfg.style === "actual" ? C.actual : C.primary, opacity: cfg.highlight === i ? 1 : 0.85 }, f.svg);
    });
    xLabels(f, cfg.labels, xc);
  }

  /* Growth vs target: target ABW curve by DOC (+ ±5 % on-track band) and each Pond's ABW as a point.
     Ponds have different DOC, so no averaged line is drawn (04_KPI・データ項目定義書 §4). */
  function drawGrowth(node, cfg) {
    var f = frame(node, cfg);
    var x = function (d) { return f.pad.l + ((d - cfg.xMin) / (cfg.xMax - cfg.xMin)) * f.iw; };
    var up = "", lo = "", mid = "";
    cfg.target.forEach(function (p, i) {
      up += (i ? " L" : "M") + x(p[0]).toFixed(1) + " " + f.y(p[1] * 1.05).toFixed(1);
      mid += (i ? " L" : "M") + x(p[0]).toFixed(1) + " " + f.y(p[1]).toFixed(1);
    });
    cfg.target.slice().reverse().forEach(function (p) { lo += " L" + x(p[0]).toFixed(1) + " " + f.y(p[1] * 0.95).toFixed(1); });
    el("path", { d: up + lo + " Z", fill: "#EDF4F2" }, f.svg);
    el("path", { d: mid, fill: "none", stroke: C.muted, "stroke-width": 1.5, "stroke-dasharray": "5 4" }, f.svg);
    for (var d = cfg.xMin; d <= cfg.xMax; d += cfg.xStep || 7) text(f.svg, x(d), f.H - 8, "DOC " + d, "middle");
    var seen = {};
    cfg.points.forEach(function (p) {
      var color = p.status === "behind" ? C.threshold : C.actual;
      el("circle", { cx: x(p.x), cy: f.y(p.y), r: 5, fill: color, stroke: "#fff", "stroke-width": 1.5 }, f.svg);
      // Ponds with the same DOC: put the label of the lower point below it
      var twin = cfg.points.filter(function (q) { return q.x === p.x; });
      var below = twin.length > 1 && p.y === Math.min.apply(null, twin.map(function (q) { return q.y; }));
      var t = text(f.svg, x(p.x), f.y(p.y) + (below ? 18 : -9), p.label, "middle");
      t.setAttribute("fill", p.status === "behind" ? C.threshold : "#18323B");
      t.setAttribute("font-weight", "700");
    });
  }

  function register(sel, cfg, fn) {
    var node = typeof sel === "string" ? document.querySelector(sel) : sel;
    if (node) registry.push({ node: node, cfg: cfg, fn: fn, done: false });
  }

  window.Charts = {
    line: function (sel, cfg) { register(sel, cfg, drawLine); },
    bars: function (sel, cfg) { register(sel, cfg, drawBars); },
    growth: function (sel, cfg) { register(sel, cfg, drawGrowth); },
    renderAll: function () {
      registry.forEach(function (r) {
        if (!r.done && r.node.clientWidth > 0) { r.fn(r.node, r.cfg); r.done = true; }
      });
    }
  };
})();
