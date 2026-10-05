const NS = "http://www.w3.org/2000/svg";

// Make an SVG element with attributes
function el(tag, attrs = {}, parent) {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (parent) parent.appendChild(node);
  return node;
}

function makeSvg(w, h, label) {
  return el("svg", { viewBox: `0 0 ${w} ${h}`, class: "chart", role: "img", "aria-label": label });
}

function text(parent, str, attrs) {
  const t = el("text", attrs, parent);
  t.textContent = str;
  return t;
}

// Round the top of an axis up to a friendly number
function niceMax(v) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}

const shortDate = (t) => new Date(t).toLocaleDateString(undefined, { month: "short", year: "2-digit" });
const fullDate = (t) => new Date(t).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
const cut = (s, n) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

/* ---------- Tooltip (one shared box) ---------- */

const tipBox = document.createElement("div");
tipBox.className = "tooltip";
tipBox.hidden = true;
document.body.appendChild(tipBox);

function showTip(e, lines) {
  tipBox.replaceChildren(...lines.map((line, i) => {
    const node = document.createElement(i === 0 ? "strong" : "span");
    node.textContent = line;
    return node;
  }));
  tipBox.hidden = false;

  // Keep it on screen
  const gap = 14;
  const r = tipBox.getBoundingClientRect();
  let x = e.clientX + gap;
  let y = e.clientY + gap;
  if (x + r.width > innerWidth - 8) x = e.clientX - r.width - gap;
  if (y + r.height > innerHeight - 8) y = e.clientY - r.height - gap;
  tipBox.style.left = `${x}px`;
  tipBox.style.top = `${y}px`;
}

const hideTip = () => (tipBox.hidden = true);

function tip(node, lines) {
  node.addEventListener("pointermove", (e) => showTip(e, lines));
  node.addEventListener("pointerdown", (e) => showTip(e, lines));
  node.addEventListener("pointerleave", hideTip);
}

export function empty(box, msg) {
  const p = document.createElement("p");
  p.className = "empty";
  p.textContent = msg;
  box.replaceChildren(p);
}

/* ---------- Line chart: running XP total ---------- */

export function lineChart(box, points, { fmt, animate }) {
  const W = Math.max(box.clientWidth, 300);
  const H = W < 500 ? 240 : 300;
  const m = { t: 16, r: 16, b: 34, l: 62 };
  const s = makeSvg(W, H, "XP over time");
  box.replaceChildren(s);

  const t0 = points[0].date;
  const span = Math.max(points.at(-1).date - t0, 1);
  const max = niceMax(points.at(-1).value);
  const x = (d) => m.l + ((d - t0) / span) * (W - m.l - m.r);
  const y = (v) => H - m.b - (v / max) * (H - m.t - m.b);

  // Horizontal guides + y labels
  for (let i = 0; i <= 4; i++) {
    const v = (max * i) / 4;
    el("line", { x1: m.l, x2: W - m.r, y1: y(v), y2: y(v), class: "grid-line" }, s);
    text(s, fmt(v), { x: m.l - 10, y: y(v) + 4, class: "axis", "text-anchor": "end" });
  }

  // Date labels along the bottom
  const ticks = W < 500 ? 2 : 4;
  for (let i = 0; i <= ticks; i++) {
    const d = t0 + (span * i) / ticks;
    const anchor = i === 0 ? "start" : i === ticks ? "end" : "middle";
    text(s, shortDate(d), { x: x(d), y: H - 10, class: "axis", "text-anchor": anchor });
  }

  let d = `M ${x(t0)} ${y(0)}`;
  for (const p of points) d += ` L ${x(p.date)} ${y(p.value)}`;

  el("path", { d: `${d} L ${x(points.at(-1).date)} ${y(0)} Z`, class: "area" }, s);
  const line = el("path", { d, class: "line" }, s);

  // Draw the line in on first load
  if (animate) {
    line.style.setProperty("--len", line.getTotalLength());
    line.classList.add("draw");
  }

  const guide = el("line", { y1: m.t, y2: H - m.b, class: "hover-line", visibility: "hidden" }, s);
  const dot = el("circle", { r: 7, class: "hover-dot", visibility: "hidden" }, s);
  const hit = el("rect", { x: m.l, y: m.t, width: W - m.l - m.r, height: H - m.t - m.b, fill: "transparent" }, s);

  // Snap to the closest XP gain
  const onMove = (e) => {
    const r = s.getBoundingClientRect();
    const mx = ((e.clientX - r.left) / r.width) * W;
    let best = points[0];
    for (const p of points) {
      if (Math.abs(x(p.date) - mx) < Math.abs(x(best.date) - mx)) best = p;
    }
    const px = x(best.date);
    const py = y(best.value);
    guide.setAttribute("x1", px);
    guide.setAttribute("x2", px);
    dot.setAttribute("cx", px);
    dot.setAttribute("cy", py);
    guide.setAttribute("visibility", "visible");
    dot.setAttribute("visibility", "visible");
    showTip(e, [best.name, `+${fmt(best.amount)}`, `Total ${fmt(best.value)}`, fullDate(best.date)]);
  };

  hit.addEventListener("pointermove", onMove);
  hit.addEventListener("pointerdown", onMove);
  hit.addEventListener("pointerleave", () => {
    guide.setAttribute("visibility", "hidden");
    dot.setAttribute("visibility", "hidden");
    hideTip();
  });
}

/* ---------- Horizontal bar chart ---------- */

export function barChart(box, items, { fmt, cls, label }) {
  const W = Math.max(box.clientWidth, 280);
  const row = 36;
  const m = { l: Math.min(160, W * 0.36), r: 78 };
  const H = items.length * row;
  const s = makeSvg(W, H, label);
  box.replaceChildren(s);

  const max = Math.max(...items.map((i) => i.value)) || 1;
  const maxChars = Math.floor(m.l / 8);

  items.forEach((it, i) => {
    const top = i * row;
    const mid = top + row / 2;
    const w = Math.max(6, (it.value / max) * (W - m.l - m.r));

    text(s, cut(it.label, maxChars), { x: m.l - 10, y: mid, class: "bar-label", "text-anchor": "end", "dominant-baseline": "central" });
    const bar = el("rect", { x: m.l, y: top + 7, width: w, height: row - 14, rx: 8, class: `bar ${cls}` }, s);
    text(s, fmt(it.value), { x: m.l + w + 8, y: mid, class: "bar-value", "dominant-baseline": "central" });

    tip(bar, [it.label, it.sub, fmt(it.value)].filter(Boolean));
  });
}

/* ---------- Donut chart ---------- */

export function donut(box, segs, { center, sub, label }) {
  const S = 220;
  const c = S / 2;
  const r = 78;
  const sw = 32;
  const C = 2 * Math.PI * r;
  const s = makeSvg(S, S, label);
  s.classList.add("donut");
  box.replaceChildren(s);

  const total = segs.reduce((a, b) => a + b.value, 0);
  el("circle", { cx: c, cy: c, r, fill: "none", "stroke-width": sw, class: "donut-track" }, s);

  // Start at 12 o'clock
  const g = el("g", { transform: `rotate(-90 ${c} ${c})` }, s);
  let offset = 0;

  if (total > 0) {
    for (const seg of segs) {
      const len = (seg.value / total) * C;
      if (len <= 0) continue;
      const arc = el("circle", {
        cx: c, cy: c, r, fill: "none", "stroke-width": sw,
        class: `seg ${seg.cls}`,
        "stroke-dasharray": `${len} ${C}`,
        "stroke-dashoffset": -offset,
      }, g);
      offset += len;
      tip(arc, [seg.label, seg.text ?? String(seg.value), `${Math.round((seg.value / total) * 100)}%`]);
    }
  }

  // Ink outline so it looks like a sticker
  el("circle", { cx: c, cy: c, r: r + sw / 2, class: "donut-outline" }, s);
  el("circle", { cx: c, cy: c, r: r - sw / 2, class: "donut-outline" }, s);

  text(s, center, { x: c, y: c + 6, class: "donut-center", "text-anchor": "middle" });
  text(s, sub, { x: c, y: c + 30, class: "donut-sub", "text-anchor": "middle" });
}

/* ---------- Radar chart for skills ---------- */

export function radar(box, skills, label) {
  const W = 480;
  const H = 400;
  const cx = W / 2;
  const cy = H / 2;
  const R = 125;
  const s = makeSvg(W, H, label);
  box.replaceChildren(s);

  const n = skills.length;
  const angle = (i) => -Math.PI / 2 + (i * 2 * Math.PI) / n;
  const pt = (i, k) => [cx + Math.cos(angle(i)) * R * k, cy + Math.sin(angle(i)) * R * k];
  const ring = (k) => skills.map((_, i) => pt(i, k).join(",")).join(" ");

  [0.25, 0.5, 0.75, 1].forEach((k) => el("polygon", { points: ring(k), class: "radar-ring" }, s));

  skills.forEach((sk, i) => {
    const [ex, ey] = pt(i, 1);
    el("line", { x1: cx, y1: cy, x2: ex, y2: ey, class: "radar-axis" }, s);

    const [lx, ly] = pt(i, 1.17);
    const anchor = Math.abs(lx - cx) < 8 ? "middle" : lx > cx ? "start" : "end";
    text(s, sk.label, { x: lx, y: ly + 5, class: "radar-label", "text-anchor": anchor });
  });

  el("polygon", { points: skills.map((sk, i) => pt(i, sk.value / 100).join(",")).join(" "), class: "radar-shape" }, s);

  skills.forEach((sk, i) => {
    const [x, y] = pt(i, sk.value / 100);
    const dot = el("circle", { cx: x, cy: y, r: 6, class: "radar-dot" }, s);
    tip(dot, [sk.label, `${sk.value} / 100`]);
  });
}
