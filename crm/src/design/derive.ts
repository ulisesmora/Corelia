// ====================================================================
// Port 1:1 de design/tokens/derive.py (matemática de color y derivación de
// tokens). Las paletas ya vienen calculadas en ./palettes.json; esto solo se
// usa para los COLORES PROPIOS del estudio (sin paleta), con exactamente la
// misma lógica que el API. `node design/tokens/check_ts.mjs` comprueba que
// este archivo da los mismos colores que el generador para las 80 paletas.
// No cambies uno sin el otro.
// ====================================================================

export type Mode = 'light' | 'dark';
export type Side = 'dark' | 'light' | 'glass' | 'darkmode';

export const NEAR_BLACK = '#0B0B10';

export const STYLE_MODES: Record<string, [Mode, Side]> = {
  natural: ['light', 'dark'],
  minimal: ['light', 'light'],
  editorial: ['light', 'light'],
  glass: ['light', 'glass'],
  brutalist: ['light', 'dark'],
  energy: ['dark', 'darkmode'],
  pop: ['light', 'dark'],
  neon: ['dark', 'darkmode'],
};

export const DARK_INK: Record<string, string> = { energy: '#F3F3F3', neon: '#F1F0FF' };

export const CLASS_HUES: Record<string, string> = {
  reformer: '#6E9E73', mat: '#E39A6B', barre: '#DE7E9C', yoga: '#8E7FD6', privada: '#5AA6D6',
};
const SEM_LIGHT: Record<string, string> = { ok: '#2E7D4F', warn: '#9A6200', bad: '#B42318', info: '#2F5FB3' };
const SEM_DARK: Record<string, string> = { ok: '#5BD69A', warn: '#FFC24D', bad: '#FF8A7A', info: '#8DBBFF' };

export const TEXT_MIN = 4.5;
export const UI_MIN = 3;

// ── Color ───────────────────────────────────────────────────────────────

export function h2r(h: string): [number, number, number] {
  let s = h.replace('#', '');
  if (s.length === 3) s = s.split('').map((c) => c + c).join('');
  return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16)) as [number, number, number];
}

export function r2h(c: number[]): string {
  return `#${c.map((v) => Math.max(0, Math.min(255, Math.floor(v + 0.5))).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

export function lum(h: string): number {
  const ch = (v: number) => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = h2r(h);
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
}

/** Contraste WCAG (1…21). */
export function cr(a: string, b: string): number {
  const la = lum(a);
  const lb = lum(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** t = peso de `a` (1 → a, 0 → b). */
export function mix(a: string, b: string, t: number): string {
  const A = h2r(a);
  const B = h2r(b);
  return r2h([0, 1, 2].map((i) => A[i] * t + B[i] * (1 - t)));
}

/** Acerca `c` a `toward` hasta tener `target` de contraste contra todos los `against`. */
export function shade(c: string, against: string[], target: number, toward: string): string {
  let cur = c;
  for (let i = 0; i <= 100; i += 1) {
    cur = mix(toward, c, i / 100);
    if (Math.min(...against.map((a) => cr(cur, a))) >= target) return cur;
  }
  return cur;
}

export const norm = (h: string) => r2h(h2r(h));

// ── Tokens ──────────────────────────────────────────────────────────────

export interface ClassTone { tint: string; dot: string }

/** Todos los colores de una paleta (mismos nombres que palettes.json). */
export interface PaletteTokens {
  p: string; onP: string; pText: string; pSoft: string;
  s: string; sUI: string; sSoft: string;
  ink: string; muted: string; bg: string; surf: string; surf2: string;
  border: string; borderStrong: string;
  sideBg: string; sideText: string; sideMuted: string; sideActive: string; sideActiveText: string; sideHover: string;
  cls: Record<string, ClassTone>;
  ok: string; okSoft: string; warn: string; warnSoft: string; bad: string; badSoft: string; info: string; infoSoft: string;
}

export interface SiteColors { primary: string; secondary: string; dark: string; background: string }

export function derive(sid: string, p0in: string, s0in: string, inkIn: string, bgIn: string, surfIn: string): PaletteTokens {
  const [mode, side] = STYLE_MODES[sid] || STYLE_MODES.natural;
  const dark = mode === 'dark';
  const [p0, s0, ink, bg, surf] = [p0in, s0in, inkIn, bgIn, surfIn].map(norm);
  let p = p0;
  if (sid !== 'brutalist' && cr(p, bg) < UI_MIN) p = shade(p, [bg], UI_MIN, dark ? '#FFFFFF' : '#000000');
  const cands = ['#FFFFFF', dark ? bg : ink, '#111111'];
  let onP = cands.reduce((best, c) => (cr(c, p) > cr(best, p) ? c : best), cands[0]);
  if (cr(onP, p) < TEXT_MIN) {
    p = shade(p, ['#FFFFFF'], TEXT_MIN, '#000000');
    onP = '#FFFFFF';
  }
  const pSoft = mix(p, surf, dark ? 0.2 : 0.12);
  const pText = shade(p, [bg, surf, pSoft], 4.6, dark ? '#FFFFFF' : ink);
  const sUI = shade(s0, [surf], UI_MIN, dark ? '#FFFFFF' : ink);
  const sSoft = mix(s0, surf, dark ? 0.22 : 0.16);
  const surf2 = mix(surf, bg, 0.5);
  let muted = ink;
  for (let i = 70; i >= 0; i -= 1) {
    const c = mix(surf, ink, i / 100);
    if (Math.min(...[bg, surf, pSoft, surf2].map((x) => cr(c, x))) >= 4.6) { muted = c; break; }
  }
  const border = mix(ink, surf, dark ? 0.16 : 0.11);
  let borderStrong = border;
  for (let i = 11; i <= 100; i += 1) {
    const c = mix(ink, surf, i / 100);
    if (Math.min(cr(c, surf), cr(c, bg)) >= UI_MIN) { borderStrong = c; break; }
  }
  const sem: Record<string, string> = {};
  for (const [k, v] of Object.entries(dark ? SEM_DARK : SEM_LIGHT)) {
    const soft = mix(v, surf, dark ? 0.18 : 0.14);
    sem[k] = shade(v, [soft, surf, bg], 4.6, dark ? '#FFFFFF' : ink);
    sem[`${k}Soft`] = soft;
  }
  const cls: Record<string, ClassTone> = {};
  for (const [k, v] of Object.entries(CLASS_HUES)) {
    let a = dark ? 0.3 : 0.24;
    let tint = mix(v, surf, a);
    while (cr(ink, tint) < 4.6 && a > 0.05) {
      a -= 0.02;
      tint = mix(v, surf, a);
    }
    let dot = dark ? mix(v, '#FFFFFF', 0.8) : v;
    dot = shade(dot, [surf], UI_MIN, dark ? '#FFFFFF' : ink);
    cls[k] = { tint, dot };
  }
  let sideBg: string, sideText: string, sideMuted: string, sideActive: string, sideActiveText: string, sideHover: string;
  if (side === 'dark') {
    sideBg = sid === 'brutalist' ? '#111111' : mix(ink, p, 0.88);
    sideText = mix(surf, '#FFFFFF', 0.6);
    sideMuted = sideText;
    for (let i = 80; i >= 0; i -= 1) {
      const c = mix(sideBg, sideText, i / 100);
      if (cr(c, sideBg) >= 4.6) { sideMuted = c; break; }
    }
    [sideActive, sideActiveText] = sid === 'brutalist' ? [p, onP] : [surf, ink];
    sideHover = mix(sideText, sideBg, 0.1);
  } else if (side === 'light') {
    [sideBg, sideText, sideMuted, sideActive, sideActiveText, sideHover] = [surf, ink, muted, pSoft, pText, surf2];
  } else {
    [sideBg, sideText, sideMuted, sideActive, sideActiveText, sideHover] = [surf, ink, muted, p, onP, surf2];
  }
  return {
    p, onP, pText, pSoft, s: s0, sUI, sSoft, ink, muted, bg, surf, surf2, border, borderStrong,
    sideBg, sideText, sideMuted, sideActive, sideActiveText, sideHover, cls,
    ok: sem.ok, okSoft: sem.okSoft, warn: sem.warn, warnSoft: sem.warnSoft,
    bad: sem.bad, badSoft: sem.badSoft, info: sem.info, infoSoft: sem.infoSoft,
  };
}

/** Los 4 colores de SiteConfig para unos tokens (ver derive.py → fields_from_tokens). */
export function fieldsFromTokens(sid: string, t: PaletteTokens): SiteColors {
  if ((STYLE_MODES[sid] || STYLE_MODES.natural)[0] === 'dark') return { primary: t.p, secondary: t.s, dark: t.bg, background: t.surf };
  return { primary: t.p, secondary: t.s, dark: t.ink, background: t.bg };
}

/** Fuente de paleta a partir de los colores propios del estudio (derive.py → source_from_fields). */
export function sourceFromFields(sid: string, f: SiteColors) {
  const mode = (STYLE_MODES[sid] || STYLE_MODES.natural)[0];
  const p = norm(f.primary);
  const s = norm(f.secondary);
  if (mode === 'dark') {
    const d = norm(f.dark);
    const b = norm(f.background);
    let bg = lum(d) <= 0.03 ? d : mix(NEAR_BLACK, d, 0.9);
    let surf = lum(b) <= 0.06 ? b : mix(NEAR_BLACK, b, 0.9);
    if (lum(surf) < lum(bg)) [bg, surf] = [surf, bg];
    return { p, s, ink: DARK_INK[sid] || '#F3F3F3', bg, surf };
  }
  const b = norm(f.background);
  const bg = lum(b) >= 0.6 ? b : mix('#FFFFFF', b, 0.88);
  const surf = mix('#FFFFFF', bg, 0.7);
  let ink = norm(f.dark);
  if (Math.min(cr(ink, bg), cr(ink, surf)) < 7) ink = shade(ink, [bg, surf], 7, '#000000');
  return { p, s, ink, bg, surf };
}

/** Colores propios → colores corregidos (para guardar) y tokens. Igual que el API. */
export function fixCustom(sid: string, f: SiteColors): { fields: SiteColors; tokens: PaletteTokens } {
  const src = sourceFromFields(sid, f);
  const tokens = derive(sid, src.p, src.s, src.ink, src.bg, src.surf);
  return { fields: fieldsFromTokens(sid, tokens), tokens };
}
