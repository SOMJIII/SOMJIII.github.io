// Shared tools for building the page, plus every SVG chart, charts only know about numbers and never about XP or projects

// Small tools used all over the app

// Short way to find one element on the page
export const $ = (sel) => document.querySelector(sel);

// Makes an element with text and an optional class, textContent keeps it safe from injected html
export function tag(name, text = "", cls = "") {
  const node = document.createElement(name);
  node.textContent = text;
  if (cls) node.className = cls;
  return node;
}

// Puts a grey message inside a chart box, used for loading, empty and errors
export const empty = (box, msg) => box.replaceChildren(tag("p", msg, "empty"));

// XP in the same units as the platform, where 1 kB is 1000
export function fmtXP(n) {
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)} MB`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(n >= 1e5 ? 0 : 1)} kB`;
  return `${Math.round(n)} B`;
}

// Date formats, the browser picks the language
export const fullDate = (d) => new Date(d).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
export const monthYear = (d) => new Date(d).toLocaleDateString(undefined, { month: "long", year: "numeric" });
export const shortDate = (d) => new Date(d).toLocaleDateString(undefined, { month: "short", year: "2-digit" });

export const capitalize = (s) => s[0].toUpperCase() + s.slice(1);
export const initials = (name) => name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();

// Name of a row, falls back to the last part of its path
export const nameOf = (row) => row.object?.name ?? row.path.split("/").pop();

// Turns an object of name and number pairs into the biggest n items, sorted
export const topItems = (obj, n) =>
  Object.entries(obj).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, n);

// One row in a legend, colour square + label + value
export function legendItem(label, value, color) {
  const li = tag("li");
  const swatch = tag("span", "", "swatch");
  swatch.style.background = color;
  li.append(swatch, tag("span", label), tag("span", value, "val"));
  return li;
}

// One row in a list, name and date on the left, something on the right
export function feedItem(name, meta, right) {
  const li = tag("li");
  const main = tag("div", "", "feed-main");
  main.append(tag("span", name, "name"), tag("span", meta, "meta"));
  li.append(main, right);
  return li;
}

// Shared SVG tools, the tooltip and redrawing on resize

// Makes an svg element, sets its attributes and adds it to a parent
export function el(name, attrs = {}, parent) {
  const node = document.createElementNS("http://www.w3.org/2000/svg", name);
  for (const key in attrs) node.setAttribute(key, attrs[key]);
  parent?.append(node);
  return node;
}

// Makes the main svg, the label is read out by screen readers
export function makeSvg(box, width, height, label) {
  const svg = el("svg", { viewBox: `0 0 ${width} ${height}`, class: "chart", role: "img", "aria-label": label });
  box.replaceChildren(svg);
  return svg;
}

// Adds a text label to an svg
export function text(parent, str, attrs) {
  const node = el("text", attrs, parent);
  node.textContent = str;
  return node;
}

// Rounds the top of an axis up to a clean number like 500 or 1000
export function niceMax(v) {
  if (v <= 0) return 1;
  const power = 10 ** Math.floor(Math.log10(v));
  const step = [1, 2, 5, 10].find((s) => v / power <= s);
  return step * power;
}

// One tooltip box shared by every chart
const tipBox = tag("div", "", "tooltip");
tipBox.hidden = true;
document.body.append(tipBox);

// Shows the tooltip next to the mouse, the first line is bold
export function showTip(e, lines) {
  tipBox.replaceChildren(...lines.map((line, i) => tag(i ? "span" : "strong", line)));
  tipBox.hidden = false;

  // Flips to the other side of the mouse if it would go off screen
  const { width, height } = tipBox.getBoundingClientRect();
  const x = e.clientX + 14 + width > innerWidth ? e.clientX - width - 14 : e.clientX + 14;
  const y = e.clientY + 14 + height > innerHeight ? e.clientY - height - 14 : e.clientY + 14;
  tipBox.style.left = `${x}px`;
  tipBox.style.top = `${y}px`;
}

export const hideTip = () => (tipBox.hidden = true);

// Hooks a tooltip onto a shape, pointerdown makes it work on phones too
export function tip(node, lines) {
  node.addEventListener("pointermove", (e) => showTip(e, lines));
  node.addEventListener("pointerdown", (e) => showTip(e, lines));
  node.addEventListener("pointerleave", hideTip);
}

// Line and bar charts size themselves to their box, so we redraw them when the window resizes
let redraws = [];
let timer;

export function keepDrawn(draw) {
  redraws.push(draw);
  draw(true);
}

export const redrawAll = () => redraws.forEach((draw) => draw(false));
export const forgetCharts = () => (redraws = []);

// Waits until resizing stops before redrawing
window.addEventListener("resize", () => {
  clearTimeout(timer);
  timer = setTimeout(redrawAll, 150);
});

// Line chart

// Running XP total over time, animate is only true the first time it draws
export function lineChart(box, points, animate) {
  const W = Math.max(box.clientWidth, 300);
  const H = W < 500 ? 240 : 300;
  const pad = { top: 16, right: 16, bottom: 34, left: 62 };
  const svg = makeSvg(box, W, H, "XP over time");

  // These turn a date or an XP amount into a spot on the chart, y is flipped because svg y goes down
  const start = points[0].date;
  const span = Math.max(points.at(-1).date - start, 1);
  const max = niceMax(points.at(-1).total);
  const x = (date) => pad.left + ((date - start) / span) * (W - pad.left - pad.right);
  const y = (xp) => H - pad.bottom - (xp / max) * (H - pad.top - pad.bottom);

  // Dashed guide lines with XP labels on the left
  for (let i = 0; i <= 4; i++) {
    const xp = (max * i) / 4;
    el("line", { x1: pad.left, x2: W - pad.right, y1: y(xp), y2: y(xp), class: "grid-line" }, svg);
    text(svg, fmtXP(xp), { x: pad.left - 10, y: y(xp) + 4, class: "axis", "text-anchor": "end" });
  }

  // Dates along the bottom, fewer of them on small screens
  const ticks = W < 500 ? 2 : 4;
  for (let i = 0; i <= ticks; i++) {
    const date = start + (span * i) / ticks;
    const anchor = i === 0 ? "start" : i === ticks ? "end" : "middle";
    text(svg, shortDate(date), { x: x(date), y: H - 10, class: "axis", "text-anchor": anchor });
  }

  // The line starts at zero and goes through every point, the area is the same shape closed at the bottom
  const d = `M ${x(start)} ${y(0)} ` + points.map((p) => `L ${x(p.date)} ${y(p.total)}`).join(" ");
  el("path", { d: `${d} L ${x(points.at(-1).date)} ${y(0)} Z`, class: "area" }, svg);
  const line = el("path", { d, class: "line" }, svg);

  // The css draw animation needs to know how long the line is
  if (animate) {
    line.style.setProperty("--len", line.getTotalLength());
    line.classList.add("draw");
  }

  // A dashed line and a dot that jump to the point closest to the mouse
  const guide = el("line", { y1: pad.top, y2: H - pad.bottom, class: "hover-line", visibility: "hidden" }, svg);
  const dot = el("circle", { r: 7, class: "hover-dot", visibility: "hidden" }, svg);
  const area = el("rect", { x: pad.left, y: pad.top, width: W - pad.left - pad.right, height: H - pad.top - pad.bottom, fill: "transparent" }, svg);

  const onMove = (e) => {
    const mouseX = ((e.clientX - svg.getBoundingClientRect().left) / svg.getBoundingClientRect().width) * W;
    const p = points.reduce((best, p) => (Math.abs(x(p.date) - mouseX) < Math.abs(x(best.date) - mouseX) ? p : best));

    guide.setAttribute("x1", x(p.date));
    guide.setAttribute("x2", x(p.date));
    dot.setAttribute("cx", x(p.date));
    dot.setAttribute("cy", y(p.total));
    guide.setAttribute("visibility", "visible");
    dot.setAttribute("visibility", "visible");
    showTip(e, [p.name, `+${fmtXP(p.amount)}`, `Total ${fmtXP(p.total)}`, fullDate(p.date)]);
  };

  area.addEventListener("pointermove", onMove);
  area.addEventListener("pointerdown", onMove);
  area.addEventListener("pointerleave", () => {
    guide.setAttribute("visibility", "hidden");
    dot.setAttribute("visibility", "hidden");
    hideTip();
  });
}

// Bar chart

// Sideways bars, each item has a label, a value and maybe a sub label for the tooltip
export function barChart(box, items, format, colorClass, label) {
  const W = Math.max(box.clientWidth, 280);
  const row = 36;
  const left = Math.min(160, W * 0.36);
  const svg = makeSvg(box, W, items.length * row, label);

  // The longest bar fills the space, the rest are sized compared to it
  const max = Math.max(...items.map((it) => it.value));
  const maxChars = Math.floor(left / 8);

  items.forEach((it, i) => {
    const middle = i * row + row / 2;
    const width = Math.max(6, (it.value / max) * (W - left - 78));
    const name = it.label.length > maxChars ? it.label.slice(0, maxChars - 1) + "…" : it.label;

    text(svg, name, { x: left - 10, y: middle, class: "bar-label", "text-anchor": "end", "dominant-baseline": "central" });
    const bar = el("rect", { x: left, y: i * row + 7, width, height: row - 14, rx: 8, class: `bar ${colorClass}` }, svg);
    text(svg, format(it.value), { x: left + width + 8, y: middle, class: "bar-value", "dominant-baseline": "central" });

    tip(bar, [it.label, it.sub, format(it.value)].filter(Boolean));
  });
}

// Donut chart

// A ring split into coloured parts, with a big number in the middle
export function donut(box, parts, center, sub) {
  const size = 220;
  const c = size / 2;
  const r = 78;
  const thick = 32;
  const around = 2 * Math.PI * r;
  const svg = makeSvg(box, size, size, `${center} ${sub}`);
  svg.classList.add("donut");

  // Grey ring behind everything
  el("circle", { cx: c, cy: c, r, fill: "none", "stroke-width": thick, class: "donut-track" }, svg);

  // Each part is a circle with a dashed stroke, the dash is as long as its share and offset to start where the last one ended
  const total = parts.reduce((sum, p) => sum + p.value, 0);
  const group = el("g", { transform: `rotate(-90 ${c} ${c})` }, svg);
  let used = 0;

  for (const p of parts) {
    const len = (p.value / total) * around;
    if (!len) continue;
    const arc = el("circle", {
      cx: c, cy: c, r, fill: "none", "stroke-width": thick, class: `seg ${p.cls}`,
      "stroke-dasharray": `${len} ${around}`, "stroke-dashoffset": -used,
    }, group);
    used += len;
    tip(arc, [p.label, p.text ?? String(p.value), `${Math.round((p.value / total) * 100)}%`]);
  }

  // Ink outlines inside and outside so it looks like a sticker
  el("circle", { cx: c, cy: c, r: r + thick / 2, class: "donut-outline" }, svg);
  el("circle", { cx: c, cy: c, r: r - thick / 2, class: "donut-outline" }, svg);

  text(svg, center, { x: c, y: c + 6, class: "donut-center", "text-anchor": "middle" });
  text(svg, sub, { x: c, y: c + 30, class: "donut-sub", "text-anchor": "middle" });
}

// Radar chart

// Spider web chart, each skill gets a spoke and its value is how far out the dot sits
export function radar(box, skills) {
  const W = 480;
  const H = 400;
  const R = 125;
  const svg = makeSvg(box, W, H, "Your skills");

  // Spreads the spokes evenly around the circle, starting at the top, k is how far out from 0 to 1
  const point = (i, k) => {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / skills.length;
    return [W / 2 + Math.cos(angle) * R * k, H / 2 + Math.sin(angle) * R * k];
  };
  const shape = (getK) => skills.map((s, i) => point(i, getK(s)).join(",")).join(" ");

  // Rings at 25, 50, 75 and 100
  for (const k of [0.25, 0.5, 0.75, 1]) el("polygon", { points: shape(() => k), class: "radar-ring" }, svg);

  // Spokes and skill names, names on the right start at the spoke and names on the left end at it
  skills.forEach((s, i) => {
    const [x, y] = point(i, 1);
    el("line", { x1: W / 2, y1: H / 2, x2: x, y2: y, class: "radar-axis" }, svg);
    const [lx, ly] = point(i, 1.17);
    const anchor = Math.abs(lx - W / 2) < 8 ? "middle" : lx > W / 2 ? "start" : "end";
    text(svg, s.label, { x: lx, y: ly + 5, class: "radar-label", "text-anchor": anchor });
  });

  // Your skill shape, then a dot on each corner with a tooltip
  el("polygon", { points: shape((s) => s.value / 100), class: "radar-shape" }, svg);
  skills.forEach((s, i) => {
    const [x, y] = point(i, s.value / 100);
    tip(el("circle", { cx: x, cy: y, r: 6, class: "radar-dot" }, svg), [s.label, `${s.value} / 100`]);
  });
}
