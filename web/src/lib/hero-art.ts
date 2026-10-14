// Ilustraciones de la portada (yoga, pilates, barre) dibujadas por código.
//
//   renderHeroArt({ pose: 'reformer', style: 'natural', colors: { primary, secondary, dark, background } })
//   → '<svg …>…</svg>' (cuadrado 1000×1000, sin dependencias ni CSS externo)
//
// La misma escena (figura + accesorio + fondo) se dibuja distinta según el
// ESTILO visual de la web (styles/presets.css, docs/ESTILOS.md) y con los
// COLORES de la marca. La usan la portada de la web (modo «Ilustración») y el
// panel (Ajustes → Portada) para enseñar las posturas.
//
// La figura se construye con «tubos» (segmentos con grosor variable y extremos
// redondeados) sobre un esqueleto con proporciones reales; codos y rodillas
// salen de cinemática inversa, así cada postura tiene articulaciones coherentes
// y los apoyos caen en el suelo, la esterilla o la máquina.
//
// Hay una copia idéntica en crm/src/components/setup/hero-art.ts (la CI
// comprueba que no se separen): cambia las dos a la vez.

export type HeroPose = 'reformer' | 'rollup' | 'tree' | 'warrior' | 'barre' | 'downdog';
export type HeroArtStyle = 'natural' | 'minimal' | 'editorial' | 'glass' | 'brutalist' | 'energy' | 'pop' | 'neon';

export interface HeroArtColors {
  primary: string;
  secondary: string;
  dark: string;
  background: string;
}

export interface HeroArtOptions {
  pose: string;
  style: string;
  colors: HeroArtColors;
  /** Prefijo de los id internos (degradados, filtros) si hay varias en la misma página. */
  idPrefix?: string;
}

/** Posturas disponibles (mismos slugs que SiteConfig.HERO_ILLUSTRATIONS en el API). */
export const HERO_POSES: { id: HeroPose; name: string; discipline: string }[] = [
  { id: 'reformer', name: 'Pilates en reformer', discipline: 'Pilates' },
  { id: 'rollup', name: 'Roll-up en esterilla', discipline: 'Pilates' },
  { id: 'tree', name: 'Árbol', discipline: 'Yoga' },
  { id: 'warrior', name: 'Guerrero II', discipline: 'Yoga' },
  { id: 'barre', name: 'Barre', discipline: 'Barre' },
  { id: 'downdog', name: 'Perro boca abajo', discipline: 'Yoga' },
];

export const HERO_ART_STYLES: HeroArtStyle[] = ['natural', 'minimal', 'editorial', 'glass', 'brutalist', 'energy', 'pop', 'neon'];

// ─── Color ──────────────────────────────────────────────────────────────────

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
type RGB = [number, number, number];

function rgb(hex: string): RGB {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h.slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const toHex = (c: number[]) => `#${c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`;
/** Mezcla a → b (t = 0 → a, t = 1 → b). */
export function mix(a: string, b: string, t: number): string {
  const [x, y] = [rgb(a), rgb(b)];
  return toHex(x.map((v, i) => v + (y[i] - v) * t));
}
function lum(hex: string): number {
  const [r, g, b] = rgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
/** Contraste WCAG (1…21). */
export function contrastRatio(a: string, b: string): number {
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}
/** Acerca `color` a `towards` hasta tener `min` de contraste contra `against`. */
function ensure(color: string, against: string, min: number, towards: string): string {
  for (let t = 0; t <= 1.0001; t += 0.05) {
    const c = mix(color, towards, t);
    if (contrastRatio(c, against) >= min) return c;
  }
  return towards;
}
const alpha = (hex: string, a: number) => {
  const [r, g, b] = rgb(hex);
  return `rgba(${r},${g},${b},${a})`;
};
/** El mismo tono con al menos `minS` de saturación y luminosidad `l` (HSL): para neón y energy. */
function vivid(hex: string, minS: number, l: number): string {
  const [r, g, b] = rgb(hex).map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
  }
  h = (h * 60 + 360) % 360;
  const li = (max + min) / 2;
  const sat = d ? d / (1 - Math.abs(2 * li - 1)) : 0;
  // Grises (sin tono) se quedan grises: un estudio en blanco y negro no se vuelve rosa
  const s = sat < 0.06 ? 0 : Math.max(minS, sat);
  const lightness = sat < 0.06 ? Math.max(l, 0.8) : l;
  const c = (1 - Math.abs(2 * lightness - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = lightness - c / 2;
  const [r1, g1, b1] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return toHex([(r1 + m) * 255, (g1 + m) * 255, (b1 + m) * 255]);
}
/** Versión pastel (para pop) que no se va a blanco del todo. */
const pastel = (hex: string, bg: string) => mix(hex, bg, 0.55);
const safeHex = (v: string, fallback: string) => (typeof v === 'string' && HEX.test(v.trim()) ? v.trim() : fallback);

const NEAR_BLACK = '#0b0b10';
const SKIN = '#E7B593';
const SKIN_FAR = '#CF9C7B';

const DARK_STYLES = new Set<HeroArtStyle>(['energy', 'neon']);

function normStyle(style: string): HeroArtStyle {
  return (HERO_ART_STYLES as string[]).includes(style) ? (style as HeroArtStyle) : 'natural';
}
function normPose(pose: string): HeroPose {
  return HERO_POSES.some((p) => p.id === pose) ? (pose as HeroPose) : 'reformer';
}

export interface HeroArtTheme {
  /** Color liso del fondo de la escena: la portada lo usa detrás del texto. */
  background: string;
  /** Texto legible sobre `background` (≥ 4.5:1). */
  ink: string;
  /** Texto secundario legible sobre `background` (≥ 4.5:1). */
  muted: string;
  /** true si el fondo es oscuro (energy, neón). */
  dark: boolean;
}

/**
 * Colores para poner texto encima o al lado de la ilustración (portada):
 * el mismo fondo que la escena y una tinta con contraste AA.
 */
export function heroArtTheme(style: string, colors: HeroArtColors): HeroArtTheme {
  const s = normStyle(style);
  const c = cleanColors(colors);
  const bg = baseBackground(s, c);
  const dark = DARK_STYLES.has(s);
  const ink = dark ? '#ffffff' : ensure(c.dark, bg, 7, NEAR_BLACK);
  const muted = dark ? ensure(mix('#ffffff', bg, 0.25), bg, 4.5, '#ffffff') : ensure(mix(ink, bg, 0.25), bg, 4.5, ink);
  return { background: bg, ink, muted, dark };
}

function cleanColors(c: HeroArtColors): HeroArtColors {
  return {
    primary: safeHex(c?.primary, '#A0897C'),
    secondary: safeHex(c?.secondary, '#85786B'),
    dark: safeHex(c?.dark, '#3D3228'),
    background: safeHex(c?.background, '#F5F0EA'),
  };
}

function baseBackground(s: HeroArtStyle, c: HeroArtColors): string {
  const b = c.background;
  if (DARK_STYLES.has(s)) return lum(b) <= 0.06 ? b : mix(b, NEAR_BLACK, 0.9);
  const light = lum(b) >= 0.6 ? b : mix(b, '#ffffff', 0.88);
  if (s === 'minimal') return mix(light, '#ffffff', 0.6);
  return light;
}

// ─── Geometría ──────────────────────────────────────────────────────────────

type P = [number, number];
const add = (a: P, b: P): P => [a[0] + b[0], a[1] + b[1]];
const sub = (a: P, b: P): P => [a[0] - b[0], a[1] - b[1]];
const mul = (a: P, k: number): P => [a[0] * k, a[1] * k];
const dist = (a: P, b: P) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const unit = (a: P): P => {
  const l = Math.hypot(a[0], a[1]) || 1;
  return [a[0] / l, a[1] / l];
};
const perp = (a: P): P => [-a[1], a[0]];
const lerp = (a: P, b: P, t: number): P => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const rad = (deg: number) => (deg * Math.PI) / 180;
/** Punto a `len` de `from` con ángulo en grados (0 = derecha, 90 = abajo). */
const polar = (from: P, deg: number, len: number): P => [from[0] + Math.cos(rad(deg)) * len, from[1] + Math.sin(rad(deg)) * len];
const dirOf = (deg: number): P => [Math.cos(rad(deg)), Math.sin(rad(deg))];
const n1 = (v: number) => (Math.round(v * 10) / 10).toString();
const pt = (p: P) => `${n1(p[0])} ${n1(p[1])}`;

/**
 * Articulación intermedia (codo, rodilla) entre `a` y `c` con huesos `l1` y
 * `l2`. `bend` = +1 / -1 elige hacia qué lado se dobla.
 */
function ik(a: P, c: P, l1: number, l2: number, bend: 1 | -1): P {
  const d = Math.max(Math.abs(l1 - l2) + 0.5, Math.min(l1 + l2 - 0.01, dist(a, c)));
  const u = unit(sub(c, a));
  const cos = (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d);
  const ang = Math.acos(Math.max(-1, Math.min(1, cos))) * bend;
  const r: P = [u[0] * Math.cos(ang) - u[1] * Math.sin(ang), u[0] * Math.sin(ang) + u[1] * Math.cos(ang)];
  return add(a, mul(r, l1));
}

/** Curva suave (Catmull-Rom → Bézier) por una lista de puntos, sin el «M» inicial. */
function smooth(points: P[]): string {
  let d = '';
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] || points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] || p2;
    const c1 = add(p1, mul(sub(p2, p0), 1 / 6));
    const c2 = sub(p2, mul(sub(p3, p1), 1 / 6));
    d += ` C ${pt(c1)} ${pt(c2)} ${pt(p2)}`;
  }
  return d;
}

/** Curva cerrada suave por los puntos (forma orgánica). */
function closedSmooth(points: P[]): string {
  const n = points.length;
  let d = `M ${pt(points[0])}`;
  for (let i = 0; i < n; i++) {
    const p0 = points[(i - 1 + n) % n];
    const p1 = points[i];
    const p2 = points[(i + 1) % n];
    const p3 = points[(i + 2) % n];
    d += ` C ${pt(add(p1, mul(sub(p2, p0), 1 / 6)))} ${pt(sub(p2, mul(sub(p3, p1), 1 / 6)))} ${pt(p2)}`;
  }
  return `${d} Z`;
}

/**
 * Tubo con grosor variable y extremos redondeados por una serie de puntos.
 * `a` es el ancho hacia la normal (+perp) y `b` hacia el otro lado.
 */
interface TubePoint { p: P; a: number; b?: number }
function tube(points: TubePoint[]): string {
  const n = points.length;
  const dirs: P[] = points.map((_, i) => {
    const prev = points[Math.max(0, i - 1)].p;
    const next = points[Math.min(n - 1, i + 1)].p;
    return unit(sub(next, prev));
  });
  const A: P[] = points.map((q, i) => add(q.p, mul(perp(dirs[i]), q.a)));
  const B: P[] = points.map((q, i) => sub(q.p, mul(perp(dirs[i]), q.b ?? q.a)));
  const k = 4 / 3;
  const end = points[n - 1];
  const start = points[0];
  const de = dirs[n - 1];
  const ds = dirs[0];
  let d = `M ${pt(A[0])}${smooth(A)}`;
  d += ` C ${pt(add(A[n - 1], mul(de, end.a * k)))} ${pt(add(B[n - 1], mul(de, (end.b ?? end.a) * k)))} ${pt(B[n - 1])}`;
  d += smooth([...B].reverse());
  d += ` C ${pt(sub(B[0], mul(ds, (start.b ?? start.a) * k)))} ${pt(sub(A[0], mul(ds, start.a * k)))} ${pt(A[0])} Z`;
  return d;
}

const pathEl = (d: string) => `<path d="${d}"/>`;

// ─── Figura ─────────────────────────────────────────────────────────────────

type BodyRole = 'skin' | 'skinFar' | 'hair' | 'top' | 'bottom' | 'bottomFar';
type PropRole = 'mat' | 'matEdge' | 'frame' | 'pad' | 'padDark' | 'metal' | 'wood' | 'line';
interface Shape { el: string; role: BodyRole | PropRole; line?: number }
interface Group { kind: 'body' | 'prop'; shapes: Shape[] }

// Medidas del cuerpo (unidades del lienzo de 1000)
const L = {
  upperArm: 116, forearm: 104, hand: 40,
  thigh: 200, shin: 190, foot: 66,
  neck: 22, headRx: 25, headRy: 30, torso: 196,
};

function upperArm(sh: P, el: P): string {
  return tube([{ p: sh, a: 13 }, { p: lerp(sh, el, 0.38), a: 12 }, { p: el, a: 9 }]);
}
function forearm(el: P, wr: P): string {
  return tube([{ p: el, a: 9 }, { p: lerp(el, wr, 0.3), a: 9.6 }, { p: wr, a: 6.2 }]);
}
function hand(wr: P, deg: number, len = L.hand, w = 6.2): string {
  const tip = polar(wr, deg, len);
  return tube([{ p: wr, a: w }, { p: lerp(wr, tip, 0.45), a: w + 1.2 }, { p: tip, a: 4.4 }]);
}
function thigh(hip: P, kn: P): string {
  return tube([{ p: hip, a: 27 }, { p: lerp(hip, kn, 0.4), a: 23 }, { p: kn, a: 15 }]);
}
function shin(kn: P, an: P): string {
  return tube([{ p: kn, a: 15 }, { p: lerp(kn, an, 0.3), a: 16.5 }, { p: lerp(kn, an, 0.75), a: 10.5 }, { p: an, a: 7.5 }]);
}
/** Pie desde el tobillo hacia `deg` (talón detrás, planta hacia `sole`). */
function foot(an: P, deg: number, len = L.foot, sole: 1 | -1 = 1): string {
  const d = dirOf(deg);
  const s = mul(perp(d), 5 * sole);
  const heel = add(sub(an, mul(d, 11)), s);
  const ball = add(add(an, mul(d, len * 0.62)), mul(s, 0.6));
  const toe = add(an, mul(d, len));
  return tube([{ p: heel, a: 8 }, { p: add(an, mul(s, 0.6)), a: 8.5 }, { p: ball, a: 6.5 }, { p: toe, a: 4.2 }]);
}

/** Cabeza (óvalo) con pelo recogido en moño. `face` = hacia dónde mira; null = de frente. */
function head(c: P, up: P, face: P | null): Shape[] {
  const u = unit(up);
  const f: P = face ? unit(face) : perp(u);
  const rx = L.headRx;
  const ry = L.headRy;
  const at = (t: number, s = 1): P => add(c, add(mul(f, Math.cos(rad(t)) * rx * s), mul(u, Math.sin(rad(t)) * ry * s)));
  const rot = (Math.atan2(u[1], u[0]) * 180) / Math.PI + 90;
  const skull = `<ellipse cx="${n1(c[0])}" cy="${n1(c[1])}" rx="${rx}" ry="${ry}" transform="rotate(${n1(rot)} ${n1(c[0])} ${n1(c[1])})"/>`;
  let hair: string;
  let bun: P;
  if (face) {
    // De perfil: pelo desde la frente, por arriba y la nuca, con moño atrás
    const outer = [55, 80, 105, 130, 155, 180, 205].map((t) => at(t, 1.08));
    hair = closedSmooth([at(40, 0.98), ...outer, at(222, 0.96), at(200, 0.55), add(c, mul(u, ry * 0.15)), at(55, 0.7)]);
    bun = at(148, 1.22);
  } else {
    // De frente: casquete con raya y moño arriba
    const outer = [12, 35, 60, 90, 120, 145, 168].map((t) => at(t, 1.07));
    hair = closedSmooth([at(-8, 0.98), ...outer, at(188, 0.98), at(160, 0.62), add(c, mul(u, ry * 0.5)), at(20, 0.62)]);
    bun = at(90, 1.3);
  }
  return [
    { el: skull, role: 'skin' },
    { el: pathEl(hair), role: 'hair' },
    { el: `<circle cx="${n1(bun[0])}" cy="${n1(bun[1])}" r="13.5"/>`, role: 'hair' },
  ];
}

/** Tronco de perfil: columna de cuello a pelvis, `belly` = hacia dónde queda la tripa. */
function torsoSide(spine: P[], belly: P): { top: string; bottom: string } {
  // Anchos [tripa, espalda] en cuello, pecho, cintura y pelvis
  const W: [number, number][] = [[10, 12], [37, 33], [27, 29], [31, 41]];
  const pts: TubePoint[] = spine.map((p, i) => {
    const prev = spine[Math.max(0, i - 1)];
    const next = spine[Math.min(spine.length - 1, i + 1)];
    const n = perp(unit(sub(next, prev)));
    const bellyPlus = n[0] * belly[0] + n[1] * belly[1] > 0;
    const [fr, bk] = W[i];
    return { p, a: bellyPlus ? fr : bk, b: bellyPlus ? bk : fr };
  });
  // Top: cuello → un poco por debajo de la cintura; leggings: cintura → pelvis
  const waistLow = lerp(spine[2], spine[3], 0.25);
  const top = tube([pts[0], pts[1], { ...pts[2], p: waistLow }]);
  const bottom = tube([{ ...pts[2], p: lerp(spine[2], spine[3], 0.05) }, pts[3]]);
  return { top, bottom };
}

/** Tronco de frente (hombros, pecho, cintura, cadera). */
function torsoFront(neck: P, pelvis: P): { top: string; bottom: string } {
  const at = (t: number) => lerp(neck, pelvis, t);
  const top = tube([
    { p: at(0), a: 13 }, { p: at(0.09), a: 50 }, { p: at(0.3), a: 47 }, { p: at(0.62), a: 37 },
  ]);
  const bottom = tube([{ p: at(0.56), a: 38 }, { p: at(0.82), a: 50 }, { p: at(0.96), a: 46 }]);
  return { top, bottom };
}

function neckTube(base: P, topP: P): string {
  return tube([{ p: base, a: 10.5 }, { p: topP, a: 9.5 }]);
}

interface Arm { sh: P; el: P; wr: P; handDeg: number; handLen?: number }
interface Leg { hip: P; kn: P; an: P; footDeg: number; footLen?: number; sole?: 1 | -1 }

function armShapes(a: Arm, role: BodyRole): Shape[] {
  return [
    { el: pathEl(upperArm(a.sh, a.el)), role },
    { el: pathEl(forearm(a.el, a.wr)), role },
    { el: pathEl(hand(a.wr, a.handDeg, a.handLen)), role },
  ];
}
function legShapes(l: Leg, far: boolean): Shape[] {
  return [
    { el: pathEl(thigh(l.hip, l.kn)), role: far ? 'bottomFar' : 'bottom' },
    { el: pathEl(foot(l.an, l.footDeg, l.footLen, l.sole ?? 1)), role: far ? 'skinFar' : 'skin' },
    { el: pathEl(shin(l.kn, l.an)), role: far ? 'bottomFar' : 'bottom' },
  ];
}
const body = (shapes: Shape[]): Group => ({ kind: 'body', shapes });
const prop = (shapes: Shape[]): Group => ({ kind: 'prop', shapes });
const rect = (x: number, y: number, w: number, h: number, r = 0) =>
  `<rect x="${n1(x)}" y="${n1(y)}" width="${n1(w)}" height="${n1(h)}" rx="${n1(r)}"/>`;
const line = (a: P, b: P) => `<path d="M ${pt(a)} L ${pt(b)}"/>`;
const circle = (c: P, r: number) => `<circle cx="${n1(c[0])}" cy="${n1(c[1])}" r="${n1(r)}"/>`;

/** Brazo con el codo calculado (hombro → muñeca). */
function arm(sh: P, wr: P, bend: 1 | -1, handDeg: number, handLen?: number): Arm {
  return { sh, el: ik(sh, wr, L.upperArm, L.forearm, bend), wr, handDeg, handLen };
}
/** Pierna con la rodilla calculada (cadera → tobillo). */
function leg(hip: P, an: P, bend: 1 | -1, footDeg: number, footLen?: number, sole?: 1 | -1): Leg {
  return { hip, kn: ik(hip, an, L.thigh, L.shin, bend), an, footDeg, footLen, sole };
}

interface Scene {
  groups: Group[];
  floor: number;
  /** Centro aproximado de la figura (para el halo/forma de detrás). */
  center: P;
  /** Tamaño aproximado de la figura (radio del halo). */
  radius: number;
  /** Nombre corto (rótulos de los estilos editorial y brutalista). */
  label: string;
  id?: HeroPose;
}

// ─── Posturas ───────────────────────────────────────────────────────────────

/** Árbol (vrksasana) de frente: brazos arriba con las palmas juntas. */
function poseTree(): Scene {
  const floor = 846;
  const cx = 500;
  const pelvis: P = [cx, 446];
  const neckB: P = [cx, pelvis[1] - L.torso];
  const neckT: P = [cx, neckB[1] - L.neck];
  const headC: P = [cx, neckT[1] - L.headRy * 0.82];
  const hipL: P = [cx - 25, pelvis[1] + 6];
  const hipR: P = [cx + 25, pelvis[1] + 6];
  // Pierna de apoyo (izquierda en pantalla), recta
  const anL: P = [cx - 14, floor - 18];
  const standing = leg(hipL, anL, -1, 96, 34);
  // Pierna doblada: rodilla abierta a la derecha y planta en el muslo de apoyo
  const knR: P = polar(hipR, 32, L.thigh);
  const anR: P = polar(knR, 176, L.shin);
  const bent: Leg = { hip: hipR, kn: knR, an: anR, footDeg: 112, footLen: 62, sole: -1 };
  const shL: P = [cx - 44, neckB[1] + 18];
  const shR: P = [cx + 44, neckB[1] + 18];
  const wristTop: P = [cx, headC[1] - 112];
  // Codos abiertos hacia fuera, palmas juntas sobre la cabeza
  const armL = arm(shL, [cx - 7, wristTop[1]], -1, -88, 44);
  const armR = arm(shR, [cx + 7, wristTop[1]], 1, -92, 44);
  const t = torsoFront(neckB, pelvis);
  // Pie de apoyo visto de frente: corto y ancho
  const footL = tube([{ p: add(anL, [0, -2]), a: 8.5 }, { p: add(anL, [-3, 14]), a: 10 }, { p: add(anL, [-6, 20]), a: 9 }]);
  return {
    floor,
    center: [cx, 470],
    radius: 380,
    label: 'Árbol',
    groups: [
      body([...armShapes(armL, 'skinFar'), ...armShapes(armR, 'skinFar')]),
      body([
        { el: pathEl(thigh(standing.hip, standing.kn)), role: 'bottom' },
        { el: pathEl(shin(standing.kn, standing.an)), role: 'bottom' },
        { el: pathEl(footL), role: 'skin' },
      ]),
      // Pierna doblada detrás del tronco (la cadera queda tapada) y su pie sobre el muslo de apoyo
      body([
        { el: pathEl(thigh(bent.hip, bent.kn)), role: 'bottomFar' },
        { el: pathEl(shin(bent.kn, bent.an)), role: 'bottomFar' },
        { el: pathEl(foot(bent.an, bent.footDeg, bent.footLen, -1)), role: 'skinFar' },
      ]),
      body([
        { el: pathEl(neckTube(neckB, neckT)), role: 'skin' },
        { el: pathEl(t.bottom), role: 'bottom' },
        { el: pathEl(t.top), role: 'top' },
        ...head(headC, [0, -1], null),
      ]),
    ],
  };
}

/** Guerrero II de frente: piernas abiertas, rodilla delantera a 90°, brazos en cruz y mirada al frente. */
function poseWarrior(): Scene {
  const cx = 470;
  const pelvis: P = [cx, 470];
  const neckB: P = [cx, pelvis[1] - L.torso];
  const neckT: P = [cx + 3, neckB[1] - L.neck];
  const headC: P = [cx + 8, neckT[1] - L.headRy * 0.8];
  const hipB: P = [cx - 24, pelvis[1] + 8];
  const hipF: P = [cx + 24, pelvis[1] + 8];
  // Pierna delantera (derecha): muslo casi horizontal, espinilla vertical
  const knF = polar(hipF, 10, L.thigh);
  const anF: P = [knF[0] + 4, knF[1] + L.shin];
  const front: Leg = { hip: hipF, kn: knF, an: anF, footDeg: 3, footLen: 66 };
  // Pierna de atrás (izquierda): recta hasta el suelo
  const anBy = anF[1];
  const dy = anBy - hipB[1];
  const dx = Math.sqrt((L.thigh + L.shin - 2) ** 2 - dy * dy);
  const anB: P = [hipB[0] - dx, anBy];
  const back = leg(hipB, anB, 1, 160, 50, -1);
  const shY = neckB[1] + 18;
  const shL: P = [cx - 44, shY];
  const shR: P = [cx + 44, shY];
  const armL: Arm = { sh: shL, el: [shL[0] - L.upperArm, shY - 2], wr: [shL[0] - L.upperArm - L.forearm, shY - 3], handDeg: 181, handLen: 42 };
  const armR: Arm = { sh: shR, el: [shR[0] + L.upperArm, shY - 2], wr: [shR[0] + L.upperArm + L.forearm, shY - 3], handDeg: -1, handLen: 42 };
  const t = torsoFront(neckB, pelvis);
  return {
    floor: anF[1] + 16,
    center: [cx + 10, 470],
    radius: 400,
    label: 'Guerrero II',
    groups: [
      body([...legShapes(back, true)]),
      body([
        { el: pathEl(neckTube(neckB, neckT)), role: 'skin' },
        { el: pathEl(t.bottom), role: 'bottom' },
        { el: pathEl(t.top), role: 'top' },
        ...head(headC, [0, -1], [1, 0]),
      ]),
      body([...legShapes(front, false)]),
      body([...armShapes(armL, 'skin')]),
      body([...armShapes(armR, 'skin')]),
    ],
  };
}

/** Perro boca abajo de perfil sobre la esterilla. */
function poseDowndog(): Scene {
  const floor = 790;
  const wrist: P = [272, floor - 9];
  const armDir = -50; // hacia arriba a la derecha
  const sh = polar(wrist, armDir, L.upperArm + L.forearm - 4);
  const pelvis = polar(sh, armDir - 4, L.torso + 14);
  const legLen = L.thigh + L.shin - 3;
  const anY = floor - 26;
  const anX = pelvis[0] + Math.sqrt(legLen * legLen - (anY - pelvis[1]) ** 2);
  const an: P = [anX, anY];
  const spineDir = unit(sub(pelvis, sh));
  const neckB = add(sh, mul(spineDir, -12));
  const chest = lerp(neckB, pelvis, 0.3);
  const waist = lerp(neckB, pelvis, 0.62);
  const belly = perp(spineDir); // tripa hacia el suelo
  const tr = torsoSide([neckB, add(chest, mul(belly, 2)), add(waist, mul(belly, -3)), pelvis], belly);
  // Cabeza colgando entre los brazos, mirando a los pies
  const neckT = add(neckB, mul(unit(sub(wrist, sh)), 18));
  const headC = add(add(neckT, mul(unit(sub(wrist, sh)), 26)), mul(belly, -8));
  const near: Arm = { sh, el: lerp(sh, wrist, 0.53), wr: wrist, handDeg: 182, handLen: 44 };
  const far: Arm = { sh: add(sh, [10, -4]), el: add(lerp(sh, wrist, 0.53), [12, -2]), wr: add(wrist, [14, 0]), handDeg: 182, handLen: 44 };
  const nearLeg: Leg = { hip: pelvis, kn: lerp(pelvis, an, L.thigh / legLen), an, footDeg: 196, footLen: 64, sole: -1 };
  const farLeg: Leg = { hip: add(pelvis, [6, -4]), kn: add(lerp(pelvis, an, L.thigh / legLen), [12, -2]), an: add(an, [16, 0]), footDeg: 196, footLen: 64, sole: -1 };
  return {
    floor,
    center: [500, 560],
    radius: 360,
    label: 'Perro boca abajo',
    groups: [
      prop([{ el: rect(150, floor, 760, 16, 8), role: 'mat' }, { el: rect(150, floor + 12, 760, 5, 2.5), role: 'matEdge' }]),
      body([...armShapes(far, 'skinFar')]),
      body([...legShapes(farLeg, true)]),
      body([
        { el: pathEl(neckTube(neckB, neckT)), role: 'skin' },
        ...head(headC, mul(unit(sub(sh, wrist)), -1), [1, 0.35]),
        { el: pathEl(tr.bottom), role: 'bottom' },
        { el: pathEl(tr.top), role: 'top' },
      ]),
      body([...legShapes(nearLeg, false)]),
      body([...armShapes(near, 'skin')]),
    ],
  };
}

/** Roll-up (C-curve) sentada en la esterilla, brazos hacia los pies. */
function poseRollup(): Scene {
  const floor = 790;
  const pelvis: P = [420, floor - 40];
  // Columna en C: de la pelvis hacia atrás y arriba, curvándose hacia delante
  const waist: P = [376, floor - 104];
  const chest: P = [352, floor - 178];
  const neckB: P = [380, floor - 236];
  const belly: P = [1, 0.15];
  const tr = torsoSide([neckB, chest, waist, pelvis], belly);
  const neckT: P = [400, floor - 250];
  const headC: P = [428, floor - 262];
  const hipJ: P = [432, floor - 34];
  const kn: P = [hipJ[0] + L.thigh - 2, floor - 26];
  const an: P = [kn[0] + L.shin - 2, floor - 22];
  const near: Leg = { hip: hipJ, kn, an, footDeg: -78, footLen: 62, sole: 1 };
  const far: Leg = { hip: add(hipJ, [-4, -6]), kn: add(kn, [4, -6]), an: add(an, [6, -6]), footDeg: -74, footLen: 62, sole: 1 };
  // Hombro: algo por debajo del cuello y hacia delante (los brazos no salen del cuello)
  const sh: P = add(lerp(neckB, chest, 0.42), mul(unit(belly), 10));
  const reach = (o: P): Arm => ({ sh: add(sh, o), el: add([sh[0] + L.upperArm - 4, sh[1] + 16], o), wr: add([sh[0] + L.upperArm + L.forearm - 8, sh[1] + 26], o), handDeg: 6, handLen: 42 });
  return {
    floor,
    center: [520, 640],
    radius: 340,
    label: 'Roll-up',
    groups: [
      prop([{ el: rect(150, floor, 760, 16, 8), role: 'mat' }, { el: rect(150, floor + 12, 760, 5, 2.5), role: 'matEdge' }]),
      body([...armShapes(reach([10, -8]), 'skinFar')]),
      body([...legShapes(far, true)]),
      body([
        { el: pathEl(neckTube(neckB, neckT)), role: 'skin' },
        ...head(headC, [0.35, -1], [1, 0.45]),
        { el: pathEl(tr.bottom), role: 'bottom' },
        { el: pathEl(tr.top), role: 'top' },
      ]),
      body([...legShapes(near, false)]),
      body([...armShapes(reach([0, 0]), 'skin')]),
    ],
  };
}

/** Barre de perfil: mano en la barra, relevé y pierna extendida delante. */
function poseBarre(): Scene {
  const floor = 836;
  const barY = 470;
  const pelvis: P = [470, 436];
  const neckB: P = [478, pelvis[1] - L.torso];
  const spineDir = unit(sub(pelvis, neckB));
  const belly = perp(spineDir);
  const beltDir: P = belly[0] > 0 ? belly : mul(belly, -1);
  const tr = torsoSide([neckB, lerp(neckB, pelvis, 0.3), add(lerp(neckB, pelvis, 0.62), [-3, 0]), pelvis], beltDir);
  const neckT: P = [484, neckB[1] - L.neck];
  const headC: P = [494, neckT[1] - 24];
  // Pierna de apoyo (lejos) en relevé: talón levantado
  const anS: P = [470, floor - 44];
  const standing = leg(add(pelvis, [-4, 4]), anS, 1, 72, 60, 1);
  // Pierna de gesto (cerca): extendida delante y abajo, pie en punta
  const hipG: P = add(pelvis, [6, 6]);
  const anG = polar(hipG, 52, L.thigh + L.shin - 2);
  const gesture: Leg = { hip: hipG, kn: polar(hipG, 52, L.thigh), an: anG, footDeg: 58, footLen: 66, sole: 1 };
  // Brazo lejano en la barra (detrás); brazo cercano arriba en corona
  // Hombro unos 30 por debajo del cuello y algo hacia delante
  const sh: P = add(lerp(neckB, pelvis, 0.16), mul(beltDir, 4));
  const barHand = arm(add(sh, [-8, 0]), [418, barY - 10], 1, 160, 38);
  // Brazo cercano en diagonal hacia delante y arriba (port de bras), en línea con la pierna
  const shN = add(sh, [6, 2]);
  const crown = arm(shN, polar(shN, -42, L.upperArm + L.forearm - 6), -1, -42, 42);
  const barre: Shape[] = [
    { el: rect(150, barY - 8, 700, 16, 8), role: 'wood' },
    { el: rect(196, barY + 8, 14, floor - barY - 8, 3), role: 'metal' },
    { el: rect(790, barY + 8, 14, floor - barY - 8, 3), role: 'metal' },
    { el: rect(162, floor - 10, 82, 12, 6), role: 'metal' },
    { el: rect(756, floor - 10, 82, 12, 6), role: 'metal' },
  ];
  return {
    floor,
    center: [520, 470],
    radius: 380,
    label: 'Barre',
    groups: [
      body([...armShapes(barHand, 'skinFar')]),
      prop(barre),
      body([...legShapes(standing, true)]),
      body([
        { el: pathEl(neckTube(neckB, neckT)), role: 'skin' },
        ...head(headC, [0.12, -1], [1, -0.08]),
        { el: pathEl(tr.bottom), role: 'bottom' },
        { el: pathEl(tr.top), role: 'top' },
      ]),
      body([...legShapes(gesture, false)]),
      body([...armShapes(crown, 'skin')]),
    ],
  };
}

/** Reformer de perfil: tumbada en el carro, pies en la barra (footwork). */
function poseReformer(): Scene {
  const floor = 820;
  const frameTop = 690;
  const carriageY = frameTop - 34; // superficie del carro
  const headC: P = [262, carriageY - 30];
  const neckB: P = [318, carriageY - 30];
  const pelvis: P = [neckB[0] + L.torso, carriageY - 34];
  const belly: P = [0, -1];
  const tr = torsoSide([neckB, lerp(neckB, pelvis, 0.3), lerp(neckB, pelvis, 0.62), pelvis], belly);
  const neckT: P = [296, carriageY - 31];
  // Pies en la barra: tobillo cerca de la barra, rodillas dobladas hacia arriba
  const barTop: P = [842, 566];
  const an: P = [barTop[0] - 22, barTop[1] + 10];
  const hip: P = add(pelvis, [6, 0]);
  const nearLeg = leg(hip, an, -1, -60, 60, -1);
  const farLeg = leg(add(hip, [-2, -6]), add(an, [8, -10]), -1, -60, 60, -1);
  // Brazos estirados junto al cuerpo, palmas hacia los pies
  const sh: P = [340, carriageY - 30];
  const nearArm: Arm = { sh, el: [sh[0] + L.upperArm, sh[1] + 8], wr: [sh[0] + L.upperArm + L.forearm - 4, sh[1] + 12], handDeg: 4, handLen: 40 };
  const farArm: Arm = { sh: add(sh, [4, -6]), el: [sh[0] + L.upperArm + 4, sh[1] + 0], wr: [sh[0] + L.upperArm + L.forearm, sh[1] + 2], handDeg: 2, handLen: 40 };
  // La máquina
  const x0 = 110;
  const x1 = 900;
  const carX0 = 200;
  const carX1 = 560;
  const springs: Shape[] = [];
  for (const [yy, off] of [[frameTop - 14, 0], [frameTop - 6, 10]] as [number, number][]) {
    let d = `M ${carX1} ${yy}`;
    const sx1 = 836;
    const n = 14;
    for (let i = 1; i <= n; i++) {
      const x = carX1 + ((sx1 - carX1) * i) / n;
      d += ` L ${n1(x - off / 4)} ${n1(yy + (i % 2 ? -5 : 5))}`;
    }
    springs.push({ el: `<path d="${d}"/>`, role: 'line', line: 3 });
  }
  const machine: Shape[] = [
    // patas y bastidor
    { el: rect(x0 + 18, frameTop + 26, 26, floor - frameTop - 26, 4), role: 'metal' },
    { el: rect(x1 - 44, frameTop + 26, 26, floor - frameTop - 26, 4), role: 'metal' },
    { el: rect(x0, frameTop, x1 - x0, 32, 10), role: 'frame' },
    // muelles
    ...springs,
    // barra de pies
    { el: line([856, frameTop + 4], [842, barTop[1] + 4]), role: 'metal', line: 14 },
    { el: circle(barTop, 15), role: 'padDark' },
    // poste de las cuerdas (detrás de la cabeza)
    { el: rect(x0 + 10, frameTop - 210, 16, 214, 6), role: 'metal' },
    { el: circle([x0 + 18, frameTop - 214], 13), role: 'metal' },
    // carro con reposacabezas y hombreras
    { el: rect(carX0, carriageY, carX1 - carX0, 34, 12), role: 'pad' },
    { el: rect(carX0 - 2, carriageY + 26, carX1 - carX0 + 4, 10, 5), role: 'padDark' },
    { el: rect(carX0 - 22, carriageY - 14, 70, 20, 10), role: 'pad' },
    { el: rect(332, carriageY - 52, 20, 50, 8), role: 'padDark' },
  ];
  return {
    floor,
    center: [510, 560],
    radius: 400,
    label: 'Reformer',
    groups: [
      prop(machine),
      body([...armShapes(farArm, 'skinFar')]),
      body([...legShapes(farLeg, true)]),
      body([
        { el: pathEl(neckTube(neckB, neckT)), role: 'skin' },
        ...head(headC, [-1, -0.05], [0.12, -1]),
        { el: pathEl(tr.bottom), role: 'bottom' },
        { el: pathEl(tr.top), role: 'top' },
      ]),
      prop([{ el: rect(332, carriageY - 52, 20, 30, 8), role: 'padDark' }]),
      body([...legShapes(nearLeg, false)]),
      body([...armShapes(nearArm, 'skin')]),
    ],
  };
}

const POSES: Record<HeroPose, () => Scene> = {
  reformer: poseReformer,
  rollup: poseRollup,
  tree: poseTree,
  warrior: poseWarrior,
  barre: poseBarre,
  downdog: poseDowndog,
};

// ─── Estilos ────────────────────────────────────────────────────────────────

interface Paint {
  body: Record<BodyRole, string>;
  prop: Record<PropRole, string>;
  /** Contorno de la figura y del accesorio (línea, brutalista, pop, neón). */
  outline?: { color: string; width: number; prop?: string };
  /** Sombra dura desplazada de todo lo dibujado (brutalista, pop). */
  hardShadow?: { dx: number; dy: number; color: string };
  /** Brillo (neón): aplica el filtro «glow» al contorno. */
  glow?: boolean;
}

function renderGroups(scene: Scene, paint: Paint, idp: string): string {
  let out = '';
  const fillOf = (s: Shape, kind: 'body' | 'prop') =>
    kind === 'body' ? paint.body[s.role as BodyRole] : paint.prop[s.role as PropRole];
  const shapesFill = (g: Group) => g.shapes.map((s) => s.line
    ? `<g fill="none" stroke="${fillOf(s, g.kind)}" stroke-width="${s.line}" stroke-linecap="round" stroke-linejoin="round">${s.el}</g>`
    : `<g fill="${fillOf(s, g.kind)}">${s.el}</g>`).join('');
  const shapesOnly = (g: Group, extra = 0) => g.shapes.map((s) => s.line
    ? `<g stroke-width="${s.line + extra}">${s.el}</g>`
    : s.el).join('');
  // Sombra dura desplazada de todo (brutalista, pop)
  if (paint.hardShadow) {
    const h = paint.hardShadow;
    out += `<g transform="translate(${h.dx} ${h.dy})" fill="${h.color}" stroke="${h.color}" stroke-width="${paint.outline ? paint.outline.width * 2 : 0}" stroke-linejoin="round" stroke-linecap="round">`;
    out += scene.groups.map((g) => shapesOnly(g, paint.outline ? paint.outline.width * 2 : 0)).join('');
    out += '</g>';
  }
  for (const g of scene.groups) {
    const o = paint.outline;
    if (o) {
      const color = g.kind === 'prop' ? (o.prop || o.color) : o.color;
      const glow = paint.glow ? ` filter="url(#${idp}glow)"` : '';
      out += `<g fill="none" stroke="${color}" stroke-width="${o.width * 2}" stroke-linejoin="round" stroke-linecap="round"${glow}>${shapesOnly(g, o.width * 2)}</g>`;
    }
    out += shapesFill(g);
  }
  return out;
}

function star(c: P, r: number, rot = 0): string {
  const pts: P[] = [];
  for (let i = 0; i < 8; i++) {
    const rr = i % 2 ? r * 0.38 : r;
    pts.push(polar(c, rot - 90 + i * 45, rr));
  }
  return `<path d="M ${pts.map(pt).join(' L ')} Z"/>`;
}

/** Hoja estilizada (para el estilo natural). */
function leaf(base: P, deg: number, len: number, w: number): string {
  const tip = polar(base, deg, len);
  const mid = lerp(base, tip, 0.45);
  const n = perp(dirOf(deg));
  return `M ${pt(base)} Q ${pt(add(mid, mul(n, w)))} ${pt(tip)} Q ${pt(add(mid, mul(n, -w)))} ${pt(base)} Z`;
}

function branch(start: P, deg: number, len: number, color: string, opacity: number): string {
  const end = polar(start, deg, len);
  let leaves = '';
  for (let i = 0; i < 7; i++) {
    const t = 0.15 + i * 0.12;
    const p = lerp(start, end, t);
    const side = i % 2 ? 1 : -1;
    leaves += `<path d="${leaf(p, deg + side * 48, 70 - i * 5, 17 - i)}"/>`;
  }
  leaves += `<path d="${leaf(end, deg, 54, 15)}"/>`;
  return `<g fill="${color}" opacity="${opacity}"><path d="M ${pt(start)} Q ${pt(add(lerp(start, end, 0.5), mul(perp(dirOf(deg)), 18)))} ${pt(end)}" fill="none" stroke="${color}" stroke-width="5" stroke-linecap="round"/>${leaves}</g>`;
}

function styleScene(style: HeroArtStyle, scene: Scene, c: HeroArtColors, idp: string): { defs: string; back: string; paint: Paint; front: string } {
  const bg = baseBackground(style, c);
  const [cx, cy] = scene.center;
  const floor = scene.floor;
  const R = scene.radius;
  const hairDark = mix(c.dark, '#000000', 0.25);
  switch (style) {
    case 'minimal': {
      const ink = ensure(c.dark, bg, 7, NEAR_BLACK);
      const accent = mix(c.primary, bg, 0.8);
      return {
        defs: '',
        back: `<circle cx="${n1(cx + R * 0.42)}" cy="${n1(cy - R * 0.5)}" r="${n1(R * 0.24)}" fill="${accent}"/>`
          + `<circle cx="${n1(cx + R * 0.42)}" cy="${n1(cy - R * 0.5)}" r="${n1(R * 0.24 + 14)}" fill="none" stroke="${ink}" stroke-width="1.2" opacity=".5"/>`
          + `<path d="M ${n1(cx - R * 1.05)} ${floor + 0.5} H ${n1(cx + R * 1.05)}" stroke="${ink}" stroke-width="2"/>`,
        paint: {
          body: { skin: bg, skinFar: bg, hair: ink, top: bg, bottom: bg, bottomFar: bg },
          prop: { mat: bg, matEdge: bg, frame: bg, pad: bg, padDark: bg, metal: bg, wood: bg, line: ink },
          outline: { color: ink, width: 1.6 },
        },
        front: '',
      };
    }
    case 'editorial': {
      const ink = ensure(c.dark, bg, 9, NEAR_BLACK);
      const block = mix(c.primary, bg, 0.62);
      const accent = ensure(c.primary, bg, 3, c.dark);
      const idx = Math.max(0, HERO_POSES.findIndex((p) => p.id === scene.id));
      const num = String(idx + 1).padStart(2, '0');
      // Arco tipo «foto de revista» detrás de la figura, siempre dentro del marco
      const ar = Math.min(R * 0.5, 220);
      const ax = Math.max(330 + ar * 0.2, Math.min(cx + 40, 860 - ar));
      return {
        defs: '',
        back: `<rect x="96" y="96" width="808" height="808" fill="none" stroke="${ink}" stroke-width="1.5"/>`
          + `<path d="M ${n1(ax - ar)} ${floor} V ${n1(170 + ar)} A ${n1(ar)} ${n1(ar)} 0 0 1 ${n1(ax + ar)} ${n1(170 + ar)} V ${floor} Z" fill="${block}"/>`
          + `<path d="M 140 ${floor} H 860" stroke="${ink}" stroke-width="1.5"/>`,
        paint: {
          body: { skin: ink, skinFar: mix(ink, block, 0.35), hair: ink, top: accent, bottom: ink, bottomFar: mix(ink, block, 0.35) },
          prop: { mat: mix(ink, bg, 0.75), matEdge: mix(ink, bg, 0.5), frame: mix(ink, bg, 0.2), pad: mix(ink, bg, 0.55), padDark: ink, metal: mix(ink, bg, 0.35), wood: mix(ink, bg, 0.35), line: mix(ink, bg, 0.3) },
        },
        front: `<text x="132" y="196" font-family="Didot, 'Bodoni 72', 'Playfair Display', Georgia, serif" font-size="76" font-weight="400" fill="${ink}">N°${num}</text>`
          + `<path d="M 134 222 H 300" stroke="${ink}" stroke-width="1.5"/>`
          + `<text x="134" y="252" font-family="'Helvetica Neue', Arial, sans-serif" font-size="17" letter-spacing="6" fill="${ink}">${esc(scene.label.toUpperCase())}</text>`
          + `<text x="866" y="882" text-anchor="end" font-family="'Helvetica Neue', Arial, sans-serif" font-size="14" letter-spacing="5" fill="${ink}">${esc(HERO_POSES[idx].discipline.toUpperCase())} · ${esc(scene.label.toUpperCase())}</text>`,
      };
    }
    case 'glass': {
      const p = c.primary;
      const s2 = c.secondary;
      const ink = ensure(c.dark, bg, 7, NEAR_BLACK);
      return {
        defs: `<filter id="${idp}blur" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="46"/></filter>`
          + `<linearGradient id="${idp}g1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${p}"/><stop offset="1" stop-color="${s2}"/></linearGradient>`
          + `<linearGradient id="${idp}card" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff" stop-opacity=".62"/><stop offset="1" stop-color="#ffffff" stop-opacity=".22"/></linearGradient>`,
        back: `<g filter="url(#${idp}blur)"><circle cx="${n1(cx - R * 0.42)}" cy="${n1(cy - R * 0.28)}" r="${n1(R * 0.42)}" fill="${p}" opacity=".55"/>`
          + `<circle cx="${n1(cx + R * 0.45)}" cy="${n1(cy + R * 0.18)}" r="${n1(R * 0.4)}" fill="${s2}" opacity=".5"/></g>`
          + `<rect x="${n1(cx - R * 0.78)}" y="${n1(cy - R * 0.82)}" width="${n1(R * 1.56)}" height="${n1(R * 1.64)}" rx="56" fill="url(#${idp}card)" stroke="#ffffff" stroke-opacity=".85" stroke-width="2"/>`
          + `<path d="M ${n1(cx - R * 0.72)} ${n1(cy - R * 0.8)} H ${n1(cx + R * 0.72)}" stroke="#ffffff" stroke-width="3" stroke-linecap="round" opacity=".9"/>`,
        paint: {
          body: { skin: SKIN, skinFar: SKIN_FAR, hair: hairDark, top: `url(#${idp}g1)`, bottom: mix(ink, s2, 0.25), bottomFar: mix(ink, s2, 0.4) },
          prop: { mat: alpha('#ffffff', 0.75), matEdge: mix(s2, '#ffffff', 0.3), frame: mix(ink, bg, 0.25), pad: mix(p, '#ffffff', 0.45), padDark: mix(ink, p, 0.3), metal: mix(ink, bg, 0.45), wood: mix(ink, bg, 0.35), line: mix(ink, bg, 0.4) },
        },
        front: '',
      };
    }
    case 'brutalist': {
      const black = '#111111';
      const lw = scene.label.length * 16.5 + 48;
      const p = c.primary;
      const s2 = c.secondary;
      return {
        defs: '',
        back: `<rect x="${n1(cx - R * 0.95 + 14)}" y="${n1(cy - R * 0.62 + 14)}" width="${n1(R * 1.3)}" height="${n1(R * 0.95)}" fill="${black}"/>`
          + `<rect x="${n1(cx - R * 0.95)}" y="${n1(cy - R * 0.62)}" width="${n1(R * 1.3)}" height="${n1(R * 0.95)}" fill="${p}" stroke="${black}" stroke-width="6"/>`
          + `<circle cx="${n1(cx + R * 0.62 + 12)}" cy="${n1(cy - R * 0.55 + 12)}" r="${n1(R * 0.24)}" fill="${black}"/>`
          + `<circle cx="${n1(cx + R * 0.62)}" cy="${n1(cy - R * 0.55)}" r="${n1(R * 0.24)}" fill="${s2}" stroke="${black}" stroke-width="6"/>`
          + `<path d="M 70 ${floor + 3} H 930" stroke="${black}" stroke-width="6"/>`,
        paint: {
          body: { skin: SKIN, skinFar: SKIN_FAR, hair: black, top: s2, bottom: mix(c.dark, black, 0.3), bottomFar: mix(mix(c.dark, black, 0.3), '#ffffff', 0.22) },
          prop: { mat: s2, matEdge: black, frame: '#ffffff', pad: p, padDark: black, metal: '#ffffff', wood: '#ffffff', line: black },
          outline: { color: black, width: 3.2 },
          hardShadow: { dx: 12, dy: 12, color: black },
        },
        front: `<g font-family="'Space Mono', 'Courier New', monospace" font-weight="700"><rect x="96" y="96" width="${n1(lw)}" height="62" fill="#ffffff" stroke="${black}" stroke-width="5"/><text x="${n1(96 + lw / 2)}" y="137" text-anchor="middle" font-size="26" fill="${black}">${esc(scene.label.toUpperCase())}</text></g>`,
      };
    }
    case 'energy': {
      const p = ensure(vivid(c.primary, 0.75, 0.56), bg, 4, '#ffffff');
      const s2 = ensure(vivid(c.secondary, 0.75, 0.52), bg, 3, '#ffffff');
      const deep = mix(bg, '#ffffff', 0.06);
      let stripes = '';
      for (let i = 0; i < 7; i++) {
        const y = cy - R * 0.55 + i * 52;
        // Franjas de velocidad en la franja izquierda: no tapan la figura
        const x = 64 + (i % 3) * 34;
        const w = 90 + ((i * 53) % 90);
        stripes += `<path d="M ${n1(x)} ${n1(y + 30)} L ${n1(x + 30)} ${n1(y)} H ${n1(x + 30 + w)} L ${n1(x + w)} ${n1(y + 30)} Z" fill="${i % 3 === 1 ? s2 : p}" opacity="${i % 2 ? 0.55 : 0.9}"/>`;
      }
      return {
        defs: '',
        back: `<path d="M ${n1(cx - R * 0.2)} 120 H ${n1(cx + R * 0.95)} L ${n1(cx + R * 0.45)} 880 H ${n1(cx - R * 0.7)} Z" fill="${deep}"/>`
          + `<g transform="translate(0 0)">${stripes}</g>`
          + `<path d="M 80 ${floor + 2} H 920" stroke="${p}" stroke-width="4"/>`,
        paint: {
          body: { skin: SKIN, skinFar: SKIN_FAR, hair: '#141414', top: p, bottom: '#f4f4f4', bottomFar: '#bdbdbd' },
          prop: { mat: s2, matEdge: mix(s2, '#000000', 0.35), frame: '#3a3a3a', pad: mix(bg, '#ffffff', 0.22), padDark: p, metal: '#8a8a8a', wood: '#d8d8d8', line: p },
        },
        front: '',
      };
    }
    case 'pop': {
      const ink = ensure(c.dark, bg, 7, NEAR_BLACK);
      const p = c.primary;
      const s2 = c.secondary;
      const pp = pastel(p, bg);
      const ps = pastel(s2, bg);
      const confetti = [
        `<g fill="${p}">${star([cx - R * 0.82, cy - R * 0.62], 30, 10)}${star([cx + R * 0.86, cy + R * 0.1], 22, -8)}</g>`,
        `<g fill="${s2}">${star([cx + R * 0.7, cy - R * 0.78], 18, 0)}${circle([cx - R * 0.9, cy + R * 0.22], 12)}</g>`,
        `<g fill="${p}" opacity=".7">${circle([cx + R * 0.95, cy - R * 0.35], 9)}${circle([cx - R * 0.55, cy - R * 0.92], 7)}</g>`,
        `<path d="M ${n1(cx - R * 0.98)} ${n1(cy - R * 0.2)} q 18 -22 36 0 t 36 0 t 36 0" fill="none" stroke="${s2}" stroke-width="7" stroke-linecap="round"/>`,
      ].join('');
      return {
        defs: '',
        back: `<circle cx="${n1(cx - R * 0.18)}" cy="${n1(cy - R * 0.1)}" r="${n1(R * 0.74)}" fill="${pp}"/>`
          + `<circle cx="${n1(cx + R * 0.5)}" cy="${n1(cy + R * 0.32)}" r="${n1(R * 0.36)}" fill="${ps}"/>`
          + confetti,
        paint: {
          body: { skin: SKIN, skinFar: SKIN_FAR, hair: ink, top: p, bottom: s2, bottomFar: mix(s2, ink, 0.25) },
          prop: { mat: '#ffffff', matEdge: p, frame: '#ffffff', pad: pp, padDark: s2, metal: '#ffffff', wood: '#ffffff', line: ink },
          outline: { color: ink, width: 2.4 },
          hardShadow: { dx: 9, dy: 9, color: alpha(p, 0.55) },
        },
        front: '',
      };
    }
    case 'neon': {
      const p = ensure(vivid(c.primary, 0.9, 0.6), bg, 4, '#ffffff');
      const s2 = ensure(vivid(c.secondary, 0.9, 0.6), bg, 4, '#ffffff');
      let grid = '';
      for (let i = -8; i <= 8; i++) grid += `<path d="M ${n1(500 + i * 34)} ${floor} L ${n1(500 + i * 150)} 980"/>`;
      for (let j = 0; j < 6; j++) {
        const y = floor + 6 + j * j * 7.5 + j * 6;
        grid += `<path d="M 40 ${n1(y)} H 960"/>`;
      }
      let vgrid = '';
      for (let x = 120; x <= 880; x += 76) vgrid += `<path d="M ${x} 110 V ${floor - 20}"/>`;
      for (let y = 140; y < floor - 20; y += 76) vgrid += `<path d="M 100 ${y} H 900"/>`;
      return {
        defs: `<filter id="${idp}glow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`
          + `<radialGradient id="${idp}fade" cx=".5" cy=".5" r=".5"><stop offset=".55" stop-color="#fff"/><stop offset="1" stop-color="#000"/></radialGradient>`
          + `<mask id="${idp}m"><rect width="1000" height="1000" fill="url(#${idp}fade)"/></mask>`,
        back: `<g mask="url(#${idp}m)"><g stroke="${s2}" stroke-width="1.2" opacity=".18">${vgrid}</g>`
          + `<g stroke="${s2}" stroke-width="2" opacity=".55" filter="url(#${idp}glow)">${grid}</g></g>`
          + `<circle cx="${n1(cx + R * 0.05)}" cy="${n1(cy - R * 0.12)}" r="${n1(R * 0.62)}" fill="none" stroke="${p}" stroke-width="3" opacity=".45" filter="url(#${idp}glow)"/>`
          + `<path d="M 60 ${floor} H 940" stroke="${p}" stroke-width="3" filter="url(#${idp}glow)"/>`,
        paint: {
          body: { skin: bg, skinFar: bg, hair: p, top: bg, bottom: bg, bottomFar: bg },
          prop: { mat: bg, matEdge: bg, frame: bg, pad: bg, padDark: bg, metal: bg, wood: bg, line: s2 },
          outline: { color: p, width: 2.2, prop: s2 },
          glow: true,
        },
        front: '',
      };
    }
    case 'natural':
    default: {
      const p = c.primary;
      const s2 = c.secondary;
      const blob1 = mix(p, bg, 0.72);
      const blob2 = mix(s2, bg, 0.8);
      const R2 = R * 0.95;
      const blob = closedSmooth([
        [cx - R2 * 0.95, cy - R2 * 0.05], [cx - R2 * 0.55, cy - R2 * 0.78], [cx + R2 * 0.18, cy - R2 * 0.9],
        [cx + R2 * 0.88, cy - R2 * 0.42], [cx + R2 * 0.92, cy + R2 * 0.35], [cx + R2 * 0.3, cy + R2 * 0.62],
        [cx - R2 * 0.6, cy + R2 * 0.55],
      ]);
      const blobB = closedSmooth([
        [cx + R * 0.35, cy - R * 0.92], [cx + R * 0.82, cy - R * 0.98], [cx + R * 0.98, cy - R * 0.62],
        [cx + R * 0.7, cy - R * 0.4], [cx + R * 0.36, cy - R * 0.55],
      ]);
      const ink = ensure(c.dark, bg, 4.5, NEAR_BLACK);
      return {
        defs: '',
        back: `<path d="${blob}" fill="${blob1}"/><path d="${blobB}" fill="${blob2}"/>`
          + branch([cx - R * 0.98, floor + 4], -62, R * 0.62, mix(s2, ink, 0.25), 0.85)
          + `<ellipse cx="${n1(cx)}" cy="${floor + 6}" rx="${n1(R * 0.95)}" ry="16" fill="${mix(ink, bg, 0.88)}"/>`,
        paint: {
          body: { skin: SKIN, skinFar: SKIN_FAR, hair: hairDark, top: p, bottom: mix(c.dark, s2, 0.25), bottomFar: mix(c.dark, '#000000', 0.18) },
          prop: { mat: mix(s2, bg, 0.35), matEdge: mix(s2, c.dark, 0.3), frame: mix(c.dark, bg, 0.12), pad: mix(p, c.dark, 0.18), padDark: mix(c.dark, '#000000', 0.1), metal: mix(c.dark, bg, 0.5), wood: mix('#B98A5E', bg, 0.1), line: mix(c.dark, bg, 0.45) },
        },
        front: '',
      };
    }
  }
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch] as string));
}

/**
 * SVG completo (1000×1000) de la postura en el estilo y colores pedidos.
 * Valores desconocidos caen en «reformer» y «natural»; colores inválidos, en
 * los de la marca por defecto.
 */
export function renderHeroArt(opts: HeroArtOptions): string {
  const style = normStyle(opts.style);
  const pose = normPose(opts.pose);
  const colors = cleanColors(opts.colors);
  const idp = `${(opts.idPrefix || 'ha').replace(/[^a-z0-9_-]/gi, '')}-${pose}-${style}-`;
  const scene = { ...POSES[pose](), id: pose };
  const bg = baseBackground(style, colors);
  const look = styleScene(style, scene, colors, idp);
  const name = HERO_POSES.find((p) => p.id === pose)?.name || '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" role="img" aria-label="${esc(`Ilustración: ${name}`)}">`
    + (look.defs ? `<defs>${look.defs}</defs>` : '')
    + `<rect width="1000" height="1000" fill="${bg}"/>`
    + look.back
    + renderGroups(scene, look.paint, idp)
    + look.front
    + '</svg>';
}
