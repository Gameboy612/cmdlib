import { mkdirSync, writeFileSync } from "node:fs";

/* ------------------------------------------------------------------ */
/* Deterministic helpers                                               */
/* ------------------------------------------------------------------ */
const hash = (n) => {
  let x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};
const pick = (arr, n) => arr[Math.floor(hash(n) * arr.length) % arr.length];
const round = (n) => Math.round(n * 100) / 100;

const S = 36;
const OX = 720;
const OY = 455;
const ISO = (x, z, y = 0) => [OX + (x - z) * 0.866 * S, OY + (x + z) * 0.5 * S - y * S * 0.92];
const pts = (list) => list.map(([x, y]) => `${round(x)},${round(y)}`).join(" ");

function topFace(x, z, color, opacity = 1, inset = 0) {
  const [ax, ay] = ISO(x + inset, z + inset);
  const [bx, by] = ISO(x + 1 - inset, z + inset);
  const [cx, cy] = ISO(x + 1 - inset, z + 1 - inset);
  const [dx, dy] = ISO(x + inset, z + 1 - inset);
  return `<polygon points="${pts([[ax, ay], [bx, by], [cx, cy], [dx, dy]])}" fill="${color}" opacity="${opacity}"/>`;
}

function rightFace(x, z, h, color, opacity = 1) {
  const [ax, ay] = ISO(x, z);
  const [bx, by] = ISO(x, z + 1);
  const [cx, cy] = ISO(x, z + 1, h);
  const [dx, dy] = ISO(x, z, h);
  return `<polygon points="${pts([[ax, ay], [bx, by], [cx, cy], [dx, dy]])}" fill="${color}" opacity="${opacity}"/>`;
}

function leftFace(x, z, h, color, opacity = 1) {
  const [ax, ay] = ISO(x, z);
  const [bx, by] = ISO(x + 1, z);
  const [cx, cy] = ISO(x + 1, z, h);
  const [dx, dy] = ISO(x, z, h);
  return `<polygon points="${pts([[ax, ay], [bx, by], [cx, cy], [dx, dy]])}" fill="${color}" opacity="${opacity}"/>`;
}

function cube(x, z, y, size, pal, opacity = 1) {
  const s = size;
  const t = [
    ISO(x, z, y + s),
    ISO(x + s, z, y + s),
    ISO(x + s, z + s, y + s),
    ISO(x, z + s, y + s),
  ];
  const r = [ISO(x, z + s, y + s), ISO(x + s, z + s, y + s), ISO(x + s, z + s, y), ISO(x, z + s, y)];
  const l = [ISO(x + s, z, y + s), ISO(x + s, z + s, y + s), ISO(x + s, z + s, y), ISO(x + s, z, y)];
  return `<g opacity="${opacity}"><polygon points="${pts(t)}" fill="${pal.top}"/><polygon points="${pts(r)}" fill="${pal.right}"/><polygon points="${pts(l)}" fill="${pal.left}"/></g>`;
}

const GRASS = [
  { top: "#3b5c49", right: "#24382e", left: "#1c2c24" },
  { top: "#426851", right: "#2a4136", left: "#213229" },
  { top: "#345442", right: "#20332a", left: "#182720" },
  { top: "#4a7058", right: "#2f4a3b", left: "#24392e" },
];
const ROCK = { top: "#2a3036", right: "#1a1f24", left: "#14191d" };
const SAND = { top: "#8a7454", right: "#5a4a35", left: "#463a2a" };
const WATER = { top: "#2b8a8d", right: "#1c5f66", left: "#154b52" };
const TRUNK = { top: "#5a4030", right: "#3a2a1e", left: "#2c2017" };
const LEAF = [
  { top: "#4f7b53", right: "#33523a", left: "#28412f" },
  { top: "#5c8b5d", right: "#3b5f42", left: "#2e4a35" },
  { top: "#b06a3d", right: "#7c4629", left: "#62371f" },
];

const islandPath = new Set(["2,7", "3,7", "4,7", "4,6", "5,5"]);
const pond = new Set(["6,3", "7,3", "6,4", "7,4"]);
const treeSpots = [
  [0, 1, 0],
  [1, 2, 1],
  [2, 1, 2],
  [7, 0, 1],
  [8, 2, 0],
  [1, 6, 1],
  [6, 6, 0],
  [8, 5, 1],
  [3, 7, 2],
];

function tree(tx, tz, variant) {
  const height = 3 + variant;
  let out = "";
  for (let i = 0; i < height; i++) {
    out += cube(tx, tz, i, 0.34, TRUNK);
  }
  const pal = LEAF[variant % LEAF.length];
  const c = 0.52;
  const offsets = [
    [0, 0, 0], [0.5, 0, 0], [-0.5, 0, 0], [0, 0.5, 0], [0, -0.5, 0],
    [0.5, 0.5, 0.45], [-0.5, -0.5, 0.45], [0.5, -0.5, 0.2], [-0.5, 0.5, 0.2],
  ];
  for (const [dx, dz, dy] of offsets) {
    out += cube(tx + 0.3 + dx, tz + 0.3 + dz, height + dy, c, pal, 0.98);
  }
  return out;
}

function buildIsland() {
  let out = "";
  const TOP = 9;
  // Top faces, painted far-to-near.
  for (let x = 0; x < TOP; x++) {
    for (let z = 0; z < TOP; z++) {
      if (x === 0 && z === 0) continue;
      let color;
      const cell = `${x},${z}`;
      if (pond.has(cell)) color = pick([WATER.top, "#2f989a", "#257b80"], x * 13 + z);
      else if (islandPath.has(cell)) color = pick([SAND.top, "#967d5b", "#7f6a4c"], x * 7 + z);
      else if ((x + z) % 11 === 0) color = "#2c4638";
      else color = pick(GRASS, x * 17 + z * 5).top;
      out += topFace(x, z, color, 1, 0.02);
      // subtle inner seam
      out += `<polyline points="${pts([
        ISO(x + 0.04, z + 0.04),
        ISO(x + 0.96, z + 0.04),
        ISO(x + 0.96, z + 0.96),
      ])}" fill="none" stroke="#0a0d0c" stroke-opacity="0.22" stroke-width="0.6"/>`;
    }
  }
  // Side faces: front (z = TOP-1) and right (x = TOP-1)
  for (let x = 0; x < TOP; x++) {
    const shade = pick(["#1b2720", "#1e2b23", "#17231c"], x * 3);
    out += leftFace(x, TOP - 1, 2.2, shade);
    out += leftFace(x, TOP - 1, 1.1, "#131b16", 0.9);
  }
  for (let z = 0; z < TOP; z++) {
    const shade = pick(["#223128", "#25352b", "#1e2b24"], z * 5);
    out += rightFace(TOP - 1, z, 2.2, shade);
    out += rightFace(TOP - 1, z, 1.0, "#17221b", 0.9);
  }
  // Rocky underside: one mass, then faceted shards with ember-lit edges.
  const [cx, cy] = ISO(4.5, 4.5, 0);
  const baseY = OY + (TOP - 1) * 0.5 * S + 22;
  out += `<path d="M ${OX - 210} ${baseY - 10} L ${OX - 120} ${baseY + 150} L ${OX + 20} ${baseY + 235} L ${OX + 170} ${baseY + 150} L ${OX + 260} ${baseY - 4} L ${OX + 120} ${baseY + 62} L ${OX - 80} ${baseY + 62} Z" fill="#101518" stroke="#0a0d0f" stroke-width="1.4"/>`;
  const shards = [
    [[OX - 210, baseY - 10], [OX - 120, baseY + 150], [OX - 10, baseY + 76]],
    [[OX - 10, baseY + 76], [OX - 120, baseY + 150], [OX + 20, baseY + 235]],
    [[OX - 10, baseY + 76], [OX + 20, baseY + 235], [OX + 128, baseY + 128]],
    [[OX + 128, baseY + 128], [OX + 20, baseY + 235], [OX + 170, baseY + 150]],
    [[OX + 128, baseY + 128], [OX + 170, baseY + 150], [OX + 260, baseY - 4]],
    [[OX + 128, baseY + 128], [OX + 260, baseY - 4], [OX + 120, baseY + 62]],
    [[OX - 10, baseY + 76], [OX + 128, baseY + 128], [OX + 120, baseY + 62], [OX - 80, baseY + 62]],
  ];
  const rockShades = ["#151b1f", "#1c2429", "#111619", "#232c32", "#181f24", "#0e1315", "#1a2227"];
  shards.forEach((shard, i) => {
    out += `<polygon points="${pts(shard)}" fill="${rockShades[i % rockShades.length]}" stroke="#0a0d0f" stroke-width="1"/>`;
  });
  out += `<path d="M ${OX - 150} ${baseY + 20} L ${OX - 90} ${baseY + 100} M ${OX + 60} ${baseY + 90} L ${OX + 150} ${baseY + 30} M ${OX - 20} ${baseY + 150} L ${OX + 60} ${baseY + 190}" stroke="#38434a" stroke-opacity="0.22" stroke-width="1"/>`;
  // Hanging roots
  out += `<path d="M ${OX - 96} ${baseY + 55} q 8 34 -4 64" stroke="#33483a" stroke-width="2" fill="none" opacity="0.7"/>`;
  out += `<path d="M ${OX + 92} ${baseY + 62} q -10 28 2 58" stroke="#33483a" stroke-width="2" fill="none" opacity="0.5"/>`;

  // Objects sorted by depth.
  const objects = [];
  for (const [tx, tz, variant] of treeSpots) {
    objects.push({ depth: tx + tz + 0.5, svg: tree(tx, tz, variant) });
  }
  // Beacon
  let beacon = "";
  for (let i = 0; i < 7; i++) {
    beacon += cube(3.9, 3.9, i, 0.42, { top: "#3a4046", right: "#23282d", left: "#1a1e22" });
  }
  beacon += `<circle cx="${ISO(4.1, 4.1, 7.1)[0]}" cy="${ISO(4.1, 4.1, 7.1)[1]}" r="26" fill="url(#emberGlow)"/>`;
  beacon += cube(3.84, 3.84, 6.9, 0.72, { top: "#ff9a68", right: "#e05c33", left: "#b64324" });
  beacon += `<path d="M ${ISO(4.2, 4.2, 7.4)[0]} ${ISO(4.2, 4.2, 7.4)[1]} L ${ISO(4.2, 4.2, 7.4)[0] - 60} ${ISO(4.2, 4.2, 7.4)[1] - 210} L ${ISO(4.2, 4.2, 7.4)[0] + 60} ${ISO(4.2, 4.2, 7.4)[1] - 210} Z" fill="url(#beam)" opacity="0.55"/>`;
  objects.push({ depth: 8.2, svg: beacon });

  // A couple of crates / command cube props.
  objects.push({ depth: 7.4, svg: cube(5.6, 6.2, 0, 0.9, { top: "#d6a25f", right: "#8f6434", left: "#6e4b26" }) });
  objects.push({ depth: 5.4, svg: cube(1.6, 4.6, 0, 0.8, { top: "#8fd9c8", right: "#3d817b", left: "#2c625f" }) });

  // Waterfall spilling off the right edge of the pond.
  const [wx, wy] = ISO(8.6, 4.2, 0);
  out += `<path d="M ${wx - 12} ${wy} C ${wx - 26} ${wy + 70} ${wx - 18} ${wy + 150} ${wx - 6} ${wy + 218} C ${wx + 4} ${wy + 160} ${wx + 12} ${wy + 80} ${wx + 6} ${wy}" fill="url(#waterGlow)" opacity="0.55"/>`;
  out += `<ellipse cx="${wx - 2}" cy="${wy + 220}" rx="46" ry="12" fill="#6fe3d2" opacity="0.16"/>`;
  for (let i = 0; i < 8; i++) {
    const px = wx - 10 + (i - 4) * 4;
    const py = wy + 24 + i * 24;
    out += `<circle cx="${px}" cy="${py}" r="${1 + (i % 2)}" fill="#8fe6dd" opacity="${0.22 + (i % 3) * 0.1}"/>`;
  }

  objects.sort((a, b) => a.depth - b.depth);
  out += objects.map((o) => o.svg).join("");

  // Floating debris
  for (const [x, z, y, size] of [[-1.5, 1.2, 1.2, 0.7], [10.2, 2.4, 2.2, 0.55], [9.4, -1.2, 3.6, 0.42], [-2.2, 6.4, 2.6, 0.48]]) {
    out += cube(x, z, y, size, GRASS[1], 0.85);
  }

  // Technical annotations
  const label = (x, y, text, anchor = "start") =>
    `<text x="${x}" y="${y}" fill="#9aa3a6" font-family="'JetBrains Mono', monospace" font-size="10" letter-spacing="1.2" text-anchor="${anchor}" opacity="0.72">${text}</text>`;
  const [bx, by] = ISO(4.2, 4.2, 7.4);
  out += `<line x1="${bx + 16}" y1="${by - 8}" x2="${bx + 110}" y2="${by - 84}" stroke="#e0d9cc" stroke-opacity="0.28" stroke-width="1" stroke-dasharray="2 4"/>`;
  out += `<circle cx="${bx + 16}" cy="${by - 8}" r="2.5" fill="#ff9a68"/>`;
  out += label(bx + 116, by - 88, "BEACON · y=71.4");
  out += `<line x1="${OX - 180}" y1="${baseY + 8}" x2="${OX - 250}" y2="${baseY - 22}" stroke="#e0d9cc" stroke-opacity="0.2" stroke-width="1" stroke-dasharray="2 4"/>`;
  out += label(OX - 258, baseY - 26, "chunk 0, 0", "end");
  return out;
}

/* ------------------------------------------------------------------ */
/* Sky                                                                */
/* ------------------------------------------------------------------ */
const stars = Array.from({ length: 90 }, (_, i) => {
  const x = hash(i * 3.1) * 1200;
  const y = hash(i * 7.7) * 760;
  const r = hash(i * 11.3) > 0.86 ? 1.5 : 0.8;
  const o = 0.15 + hash(i * 5.9) * 0.5;
  return `<circle cx="${round(x)}" cy="${round(y)}" r="${r}" fill="#e9e5dc" opacity="${round(o)}"/>`;
}).join("");

const rings = [80, 150, 230, 320, 410].map((r) => `<circle cx="850" cy="420" r="${r}" fill="none" stroke="#e9e5dc" stroke-opacity="0.09" stroke-width="1"/>`).join("");

const sky = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 900" width="1200" height="900" fill="none">
<defs>
  <radialGradient id="skyGlow" cx="70%" cy="45%" r="55%">
    <stop offset="0" stop-color="#28352f" stop-opacity="0.85"/>
    <stop offset="0.45" stop-color="#141b18" stop-opacity="0.6"/>
    <stop offset="1" stop-color="#08090b" stop-opacity="0"/>
  </radialGradient>
  <radialGradient id="emberHaze" cx="70%" cy="45%" r="40%">
    <stop offset="0" stop-color="#ff7a45" stop-opacity="0.13"/>
    <stop offset="1" stop-color="#ff7a45" stop-opacity="0"/>
  </radialGradient>
  <linearGradient id="horizon" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#0a0d0c" stop-opacity="0"/>
    <stop offset="1" stop-color="#0a0d0c" stop-opacity="0.9"/>
  </linearGradient>
  <pattern id="skyGrid" width="60" height="60" patternUnits="userSpaceOnUse">
    <path d="M60 0H0V60" fill="none" stroke="#e9e5dc" stroke-opacity="0.035" stroke-width="1"/>
  </pattern>
</defs>
<rect width="1200" height="900" fill="url(#skyGlow)"/>
<rect width="1200" height="900" fill="url(#emberHaze)"/>
<rect width="1200" height="900" fill="url(#skyGrid)"/>
${rings}
${stars}
<ellipse cx="850" cy="480" rx="420" ry="260" fill="url(#skyGlow)" opacity="0.5"/>
<path d="M0 660 Q 300 610 620 640 T 1200 600 L1200 900 L0 900 Z" fill="url(#horizon)"/>
<path d="M0 690 Q 260 654 520 678 T 1200 650" stroke="#e9e5dc" stroke-opacity="0.06" fill="none"/>
<text x="56" y="838" fill="#7d8789" font-family="'JetBrains Mono', monospace" font-size="11" letter-spacing="2.4" opacity="0.7">CMDLIB / SIMULATION VIEWPORT</text>
<text x="1144" y="838" fill="#7d8789" font-family="'JetBrains Mono', monospace" font-size="11" letter-spacing="2.4" text-anchor="end" opacity="0.7">DATA PACK FORMAT 121.0</text>
</svg>`;

/* ------------------------------------------------------------------ */
/* Island                                                             */
/* ------------------------------------------------------------------ */
const island = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 900" width="1200" height="900" fill="none">
<defs>
  <radialGradient id="emberGlow">
    <stop offset="0" stop-color="#ffc49a" stop-opacity="0.95"/>
    <stop offset="0.35" stop-color="#ff7a45" stop-opacity="0.5"/>
    <stop offset="1" stop-color="#ff7a45" stop-opacity="0"/>
  </radialGradient>
  <linearGradient id="beam" x1="0" y1="1" x2="0" y2="0">
    <stop offset="0" stop-color="#ffb27a" stop-opacity="0.55"/>
    <stop offset="1" stop-color="#ffb27a" stop-opacity="0"/>
  </linearGradient>
  <linearGradient id="waterGlow" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#6fe3d2" stop-opacity="0.55"/>
    <stop offset="1" stop-color="#2b8a8d" stop-opacity="0"/>
  </linearGradient>
  <filter id="softGlow" x="-50%" y="-50%" width="200%" height="200%">
    <feGaussianBlur stdDeviation="12"/>
  </filter>
</defs>
<ellipse cx="760" cy="620" rx="330" ry="70" fill="#000" opacity="0.35" filter="url(#softGlow)"/>
<g opacity="0.5">
  <ellipse cx="${OX}" cy="${OY + 160}" rx="430" ry="300" fill="none" stroke="#e9e5dc" stroke-opacity="0.08" stroke-dasharray="2 10"/>
  <path d="M ${OX - 430} ${OY + 160} L ${OX} ${OY - 240} L ${OX + 430} ${OY + 160} L ${OX} ${OY + 520} Z" fill="none" stroke="#e9e5dc" stroke-opacity="0.06"/>
</g>
${buildIsland()}
<ellipse cx="${ISO(4.1, 4.1, 7.2)[0]}" cy="${ISO(4.1, 4.1, 7.2)[1]}" rx="90" ry="30" fill="url(#waterGlow)" opacity="0.4"/>
</svg>`;

/* ------------------------------------------------------------------ */
/* Foreground                                                         */
/* ------------------------------------------------------------------ */
function blade(x, y, h, lean, color, opacity) {
  return `<path d="M ${x} ${y} Q ${x + lean * 0.4} ${y - h * 0.55} ${x + lean} ${y - h}" stroke="${color}" stroke-width="${2 + h / 60}" fill="none" stroke-linecap="round" opacity="${opacity}"/>`;
}
let blades = "";
const clusters = [
  { x: 70, y: 892, n: 24, h: 150, spread: 240 },
  { x: 1130, y: 886, n: 20, h: 165, spread: 220 },
  { x: 300, y: 906, n: 14, h: 70, spread: 220 },
  { x: 850, y: 906, n: 14, h: 64, spread: 260 },
];
// A low, dense hedge across the very bottom so the island never floats on
// nothing, without turning the whole foreground into reeds.
for (let i = 0; i < 64; i++) {
  const x = (i / 63) * 1200 + (hash(i * 4.4) - 0.5) * 16;
  const h = 18 + hash(i * 7.2) * 46 + (x < 250 || x > 950 ? 40 : 0);
  const lean = (hash(i * 2.2) - 0.5) * 34;
  blades += blade(x, 904, h, lean, i % 4 === 0 ? "#1a2620" : "#0a100d", 0.9);
}
for (const cluster of clusters) {
  for (let i = 0; i < cluster.n; i++) {
    const t = i / cluster.n;
    const x = cluster.x + (hash(i * 2.3 + cluster.x) - 0.5) * cluster.spread;
    const y = cluster.y - hash(i * 4.1 + cluster.y) * 30;
    const h = cluster.h * (0.55 + hash(i * 9.7 + cluster.x) * 0.75);
    const lean = (hash(i * 6.1 + cluster.y) - 0.5) * 70;
    const color = i % 9 === 0 ? "#33443a" : i % 5 === 0 ? "#1d2a23" : "#0d1411";
    blades += blade(x, y, h, lean, color, 0.65 + hash(i * 3.3 + cluster.x) * 0.35);
  }
  for (let i = 0; i < 7; i++) {
    const x = cluster.x + (hash(i * 8.1 + cluster.x) - 0.5) * cluster.spread * 0.8;
    const y = cluster.y - 14 + hash(i * 2.7) * 12;
    const w = 18 + hash(i) * 30;
    blades += `<path d="M ${x} ${y} Q ${x + w * 0.5} ${y - 28} ${x + w} ${y - 6} Q ${x + w * 0.5} ${y + 4} ${x} ${y} Z" fill="#0b110e" opacity="0.85"/>`;
  }
}
const foreground = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 900" width="1200" height="900" fill="none">
<defs>
  <linearGradient id="ridge" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#0c1110"/>
    <stop offset="1" stop-color="#050706"/>
  </linearGradient>
  <linearGradient id="rim" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#ff7a45" stop-opacity="0.45"/>
    <stop offset="1" stop-color="#ff7a45" stop-opacity="0"/>
  </linearGradient>
</defs>
<path d="M0 742 C 90 730 150 776 235 800 C 320 824 380 840 470 848 L 470 900 L0 900 Z" fill="#080d0a" opacity="0.9"/>
<path d="M1200 760 C 1120 748 1060 782 980 810 C 910 834 860 842 790 852 L790 900 L1200 900 Z" fill="#080d0a" opacity="0.85"/>
<path d="M0 792 C 130 770 220 806 330 798 C 470 788 560 760 690 782 C 820 804 930 772 1050 790 C 1120 800 1170 792 1200 786 L1200 900 L0 900 Z" fill="url(#ridge)"/>
<path d="M0 792 C 130 770 220 806 330 798 C 470 788 560 760 690 782 C 820 804 930 772 1050 790 C 1120 800 1170 792 1200 786" stroke="url(#rim)" stroke-width="1.5" fill="none"/>
${blades}
<circle cx="1010" cy="690" r="2" fill="#ff9a68" opacity="0.8"/>
<circle cx="930" cy="742" r="1.5" fill="#ffcf6b" opacity="0.6"/>
<circle cx="214" cy="720" r="1.5" fill="#ff9a68" opacity="0.5"/>
</svg>`;

/* ------------------------------------------------------------------ */
/* Logo / icon                                                        */
/* ------------------------------------------------------------------ */
const mark = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64" fill="none">
<rect x="1" y="1" width="62" height="62" rx="14" fill="#0e1114" stroke="#2a2f36"/>
<path d="M32 8 L54 20 L54 44 L32 56 L10 44 L10 20 Z" fill="#12171a" stroke="#3a424a" stroke-width="1.2"/>
<path d="M32 8 L54 20 L32 32 L10 20 Z" fill="#1b2327"/>
<path d="M32 32 L54 20 L54 44 L32 56 Z" fill="#151b1f"/>
<path d="M32 32 L10 20 L10 44 L32 56 Z" fill="#101518"/>
<path d="M20 26 L27 32 L20 38" stroke="#ff7a45" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M32 39 L41 39" stroke="#e9e5dc" stroke-width="3.2" stroke-linecap="round" opacity="0.85"/>
</svg>`;

writeFileSync("public/art/hero-sky.svg", sky);
writeFileSync("public/art/hero-island.svg", island);
writeFileSync("public/art/hero-foreground.svg", foreground);
writeFileSync("public/art/mark.svg", mark);
writeFileSync("public/icon.svg", mark);

/* ------------------------------------------------------------------ */
/* OG card                                                            */
/* ------------------------------------------------------------------ */
const og = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" width="1200" height="630">
<defs>
  <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#08090b"/>
    <stop offset="1" stop-color="#101512"/>
  </linearGradient>
  <radialGradient id="glow" cx="78%" cy="55%" r="46%">
    <stop offset="0" stop-color="#ff7a45" stop-opacity="0.22"/>
    <stop offset="1" stop-color="#ff7a45" stop-opacity="0"/>
  </radialGradient>
</defs>
<rect width="1200" height="630" fill="url(#bg)"/>
<rect width="1200" height="630" fill="url(#glow)"/>
<g opacity="0.6">${Array.from({ length: 40 }, (_, i) => `<circle cx="${72 + hash(i * 3.1) * 1100}" cy="${40 + hash(i * 7.7) * 420}" r="${hash(i * 11) > 0.8 ? 1.4 : 0.7}" fill="#e9e5dc" opacity="${0.15 + hash(i * 5) * 0.35}"/>`).join("")}</g>
<circle cx="900" cy="300" r="250" fill="none" stroke="#e9e5dc" stroke-opacity="0.07"/>
<circle cx="900" cy="300" r="160" fill="none" stroke="#e9e5dc" stroke-opacity="0.06"/><g transform="translate(640 -20) scale(0.48)">${island}</g>
<g opacity="0.9">
  <text x="72" y="128" fill="#ff7a45" font-family="'JetBrains Mono', monospace" font-size="15" letter-spacing="3">CMDLIB · MINECRAFT 26.3</text>
  <text x="72" y="248" fill="#f0ece3" font-family="'Bricolage Grotesque', sans-serif" font-size="86" font-weight="700" letter-spacing="-4">Write the game.</text>
  <text x="72" y="336" fill="#f0ece3" font-family="'Bricolage Grotesque', sans-serif" font-size="86" font-weight="700" letter-spacing="-4">Don't launch it.</text>
  <text x="72" y="410" fill="#a3a7a6" font-family="'Bricolage Grotesque', sans-serif" font-size="24">A browser-native datapack IDE with a real command runtime.</text>
  <text x="72" y="536" fill="#7f8785" font-family="'JetBrains Mono', monospace" font-size="15">scoreboard · title · function · data · macros · storage</text>
</g>
<rect x="72" y="560" width="168" height="40" rx="20" fill="#ff7a45"/>
<text x="156" y="586" fill="#140d09" font-family="'JetBrains Mono', monospace" font-size="15" font-weight="700" text-anchor="middle">OPEN EDITOR</text>
</svg>`;
writeFileSync("public/og.svg", og);

mkdirSync("public/art", { recursive: true });
console.log("art generated");
