"""Matemática de color y derivación de los tokens de Corelia (sin dependencias).

Fuente única: `design/tokens/derive.py`. El generador (`tokens.py`) lo copia TAL
CUAL a `api/api/design/derive.py` para que el API lo use sin salir de su carpeta
(Docker). No edites la copia: edita este archivo y ejecuta
`python3 design/tokens/tokens.py`.

La versión TypeScript del panel (`crm/src/design/derive.ts`) es un port 1:1;
`node design/tokens/check_ts.mjs` comprueba que da exactamente los mismos colores.

Conceptos:
  - Una *fuente* de paleta son 5 colores: primario (p), secundario (s), tinta
    (ink, el texto), fondo de página (bg) y superficie (surf, tarjetas).
  - `derive()` saca de ella todos los tokens (texto atenuado, bordes, barra
    lateral, colores de estado, tintes de las clases…), corrige el primario si
    hace falta para que se lea y devuelve la lista de correcciones.
  - `contrast_checks()` mide cada pareja texto/fondo (≥ 4,5:1) y cada pieza de
    interfaz (≥ 3:1). Una paleta solo entra si no falla ninguna.
  - `fix_custom()` hace lo mismo con los 4 colores que guarda el estudio
    (SiteConfig.color_*) cuando elige colores propios en vez de una paleta.
"""

NEAR_BLACK = '#0B0B10'

# Estilo → (modo, barra lateral del panel). La barra: 'dark' = tarjeta oscura
# teñida del primario, 'light' = clara con borde, 'glass' = esmerilada,
# 'darkmode' = superficie del modo oscuro.
STYLE_MODES = {
    'natural': ('light', 'dark'),
    'minimal': ('light', 'light'),
    'editorial': ('light', 'light'),
    'glass': ('light', 'glass'),
    'brutalist': ('light', 'dark'),
    'energy': ('dark', 'darkmode'),
    'pop': ('light', 'dark'),
    'neon': ('dark', 'darkmode'),
}

# Texto de los estilos oscuros cuando el estudio pone colores propios (la web
# usa los mismos: web/src/styles/presets.css).
DARK_INK = {'energy': '#F3F3F3', 'neon': '#F1F0FF'}

CLASS_HUES = {'reformer': '#6E9E73', 'mat': '#E39A6B', 'barre': '#DE7E9C', 'yoga': '#8E7FD6', 'privada': '#5AA6D6'}
SEM_LIGHT = {'ok': '#2E7D4F', 'warn': '#9A6200', 'bad': '#B42318', 'info': '#2F5FB3'}
SEM_DARK = {'ok': '#5BD69A', 'warn': '#FFC24D', 'bad': '#FF8A7A', 'info': '#8DBBFF'}

# Mínimos: texto 4,5:1 (WCAG AA); piezas de interfaz 3:1 (WCAG 1.4.11)
TEXT_MIN = 4.5
UI_MIN = 3.0
UI_CHECKS = ('p/bg(UI)', 'p/surf(UI)', 'borderStrong/surf(UI)', 'borderStrong/bg(UI)', 'sUI/surf(UI)',
             'chart/surf(UI)', 'class dot min(UI)')


# ── Color ────────────────────────────────────────────────────────────────────

def h2r(h):
    h = h.lstrip('#')
    if len(h) == 3:
        h = ''.join(c * 2 for c in h)
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def r2h(c):
    # floor(v + 0.5): mismo redondeo que Math.round en el panel (TS)
    return '#%02X%02X%02X' % tuple(max(0, min(255, int(v + 0.5))) for v in c)


def lum(h):
    def ch(v):
        v /= 255
        return v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4
    r, g, b = h2r(h)
    return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b)


def cr(a, b):
    """Contraste WCAG (1…21)."""
    la, lb = lum(a), lum(b)
    hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)


def mix(a, b, t):
    """t = peso de `a` (1 → a, 0 → b)."""
    A, B = h2r(a), h2r(b)
    return r2h(tuple(A[i] * t + B[i] * (1 - t) for i in range(3)))


def shade(c, against, target, toward):
    """Acerca `c` a `toward` hasta tener `target` de contraste contra todos los `against`."""
    cur = c
    for i in range(0, 101):
        cur = mix(toward, c, i / 100)
        if min(cr(cur, a) for a in against) >= target:
            return cur
    return cur


def norm(h):
    return r2h(h2r(h))


# ── Derivación ───────────────────────────────────────────────────────────────

def derive(sid, p0, s0, ink, bg, surf):
    """Todos los tokens de una paleta a partir de su fuente. Devuelve (tokens, correcciones)."""
    mode, side = STYLE_MODES[sid]
    dark = mode == 'dark'
    p0, s0, ink, bg, surf = (norm(x) for x in (p0, s0, ink, bg, surf))
    fixes = []
    p = p0
    # 1) primario como relleno de interfaz contra el fondo de página ≥ 3:1
    #    (brutalista: el límite lo marca el borde de tinta)
    if sid != 'brutalist' and cr(p, bg) < UI_MIN:
        p = shade(p, [bg], UI_MIN, '#FFFFFF' if dark else '#000000')
        fixes.append(f'primario {p0} → {p} (3:1 contra el fondo)')
    # 2) texto sobre el primario
    cands = ['#FFFFFF', bg if dark else ink, '#111111']
    onp = max(cands, key=lambda c: cr(c, p))
    if cr(onp, p) < TEXT_MIN:
        p2 = shade(p, ['#FFFFFF'], TEXT_MIN, '#000000')
        fixes.append(f'primario {p} → {p2} (texto sobre el botón)')
        p, onp = p2, '#FFFFFF'
    psoft = mix(p, surf, 0.20 if dark else 0.12)
    ptext = shade(p, [bg, surf, psoft], 4.6, '#FFFFFF' if dark else ink)
    s_ui = shade(s0, [surf], UI_MIN, '#FFFFFF' if dark else ink)
    ssoft = mix(s0, surf, 0.22 if dark else 0.16)
    surf2 = mix(surf, bg, 0.5)
    # texto atenuado: lo más claro posible con ≥ 4,6 sobre fondo, superficies y el tinte del primario
    muted = ink
    for i in range(70, -1, -1):
        c = mix(surf, ink, i / 100)
        if min(cr(c, x) for x in (bg, surf, psoft, surf2)) >= 4.6:
            muted = c
            break
    border = mix(ink, surf, 0.16 if dark else 0.11)
    bstrong = border
    for i in range(11, 101):
        c = mix(ink, surf, i / 100)
        if min(cr(c, surf), cr(c, bg)) >= UI_MIN:
            bstrong = c
            break
    sem = {}
    for k, v in (SEM_DARK if dark else SEM_LIGHT).items():
        soft = mix(v, surf, 0.18 if dark else 0.14)
        sem[k] = shade(v, [soft, surf, bg], 4.6, '#FFFFFF' if dark else ink)
        sem[k + 'Soft'] = soft
    cls = {}
    for k, v in CLASS_HUES.items():
        a = 0.30 if dark else 0.24
        tint = mix(v, surf, a)
        while cr(ink, tint) < 4.6 and a > 0.05:
            a -= 0.02
            tint = mix(v, surf, a)
        dot = mix(v, '#FFFFFF', 0.8) if dark else v
        dot = shade(dot, [surf], UI_MIN, '#FFFFFF' if dark else ink)
        cls[k] = {'tint': tint, 'dot': dot}
    # barra lateral del panel
    if side == 'dark':
        sb = '#111111' if sid == 'brutalist' else mix(ink, p, 0.88)
        st = mix(surf, '#FFFFFF', 0.6)
        sm = st
        for i in range(80, -1, -1):
            c = mix(sb, st, i / 100)
            if cr(c, sb) >= 4.6:
                sm = c
                break
        sa, sat = (p, onp) if sid == 'brutalist' else (surf, ink)
        shov = mix(st, sb, 0.10)
    elif side == 'light':
        sb, st, sm, sa, sat, shov = surf, ink, muted, psoft, ptext, surf2
    else:  # glass / darkmode
        sb, st, sm, sa, sat, shov = surf, ink, muted, p, onp, surf2
    t = dict(p=p, onP=onp, pText=ptext, pSoft=psoft, s=s0, sUI=s_ui, sSoft=ssoft,
             ink=ink, muted=muted, bg=bg, surf=surf, surf2=surf2, border=border, borderStrong=bstrong,
             sideBg=sb, sideText=st, sideMuted=sm, sideActive=sa, sideActiveText=sat, sideHover=shov,
             cls=cls, **sem)
    return t, fixes


def contrast_checks(sid, t):
    """Contraste de cada pareja. Las de interfaz (UI) piden 3:1; el resto, texto, 4,5:1."""
    chart = t['ink'] if sid == 'brutalist' else t['p']
    sem = ('ok', 'warn', 'bad', 'info')
    return {
        # texto
        'ink/bg': cr(t['ink'], t['bg']),
        'ink/surf': cr(t['ink'], t['surf']),
        'ink/surf2': cr(t['ink'], t['surf2']),
        'muted/bg': cr(t['muted'], t['bg']),
        'muted/surf': cr(t['muted'], t['surf']),
        'muted/surf2': cr(t['muted'], t['surf2']),
        'onP/p': cr(t['onP'], t['p']),
        'link pText/bg': cr(t['pText'], t['bg']),
        'link pText/surf': cr(t['pText'], t['surf']),
        'pText/pSoft': cr(t['pText'], t['pSoft']),
        'side text': cr(t['sideText'], t['sideBg']),
        'side muted': cr(t['sideMuted'], t['sideBg']),
        'side active': cr(t['sideActiveText'], t['sideActive']),
        'side hover text': cr(t['sideText'], t['sideHover']),
        'class tint min': min(cr(t['ink'], c['tint']) for c in t['cls'].values()),
        'sem/soft min': min(cr(t[k], t[k + 'Soft']) for k in sem),
        'sem/surf min': min(cr(t[k], t['surf']) for k in sem),
        # interfaz
        'p/bg(UI)': cr(t['ink'], t['bg']) if sid == 'brutalist' else cr(t['p'], t['bg']),
        'p/surf(UI)': cr(t['ink'], t['surf']) if sid == 'brutalist' else cr(t['p'], t['surf']),
        'borderStrong/surf(UI)': cr(t['borderStrong'], t['surf']),
        'borderStrong/bg(UI)': cr(t['borderStrong'], t['bg']),
        'sUI/surf(UI)': cr(t['sUI'], t['surf']),
        'chart/surf(UI)': cr(chart, t['surf']),
        'class dot min(UI)': min(cr(c['dot'], t['surf']) for c in t['cls'].values()),
    }


def failures(checks):
    return [k for k, v in checks.items() if v < (UI_MIN if k in UI_CHECKS else TEXT_MIN)]


# ── Lo que guarda el estudio (SiteConfig.color_*) ────────────────────────────

def fields_from_tokens(sid, t):
    """Los 4 colores de SiteConfig para unos tokens. En los estilos oscuros
    `dark` es lo más profundo (bg) y `background` la superficie (como la web:
    --brand-dark = navbar/footer, --brand-bg = fondo)."""
    if STYLE_MODES[sid][0] == 'dark':
        return {'primary': t['p'], 'secondary': t['s'], 'dark': t['bg'], 'background': t['surf']}
    return {'primary': t['p'], 'secondary': t['s'], 'dark': t['ink'], 'background': t['bg']}


def source_from_fields(sid, fields):
    """Fuente de paleta a partir de los 4 colores guardados (colores propios).
    Asegura lo básico: fondo claro (u oscuro en los estilos oscuros) y tinta legible."""
    mode = STYLE_MODES[sid][0]
    p, s = norm(fields['primary']), norm(fields['secondary'])
    if mode == 'dark':
        d, b = norm(fields['dark']), norm(fields['background'])
        bg = d if lum(d) <= 0.03 else mix(NEAR_BLACK, d, 0.9)
        surf = b if lum(b) <= 0.06 else mix(NEAR_BLACK, b, 0.9)
        if lum(surf) < lum(bg):
            bg, surf = surf, bg
        ink = DARK_INK.get(sid, '#F3F3F3')
        return {'p': p, 's': s, 'ink': ink, 'bg': bg, 'surf': surf}
    b = norm(fields['background'])
    bg = b if lum(b) >= 0.6 else mix('#FFFFFF', b, 0.88)
    surf = mix('#FFFFFF', bg, 0.7)
    ink = norm(fields['dark'])
    if min(cr(ink, bg), cr(ink, surf)) < 7:
        ink = shade(ink, [bg, surf], 7, '#000000')
    return {'p': p, 's': s, 'ink': ink, 'bg': bg, 'surf': surf}


def fix_custom(sid, fields):
    """Colores propios → (colores corregidos para guardar, tokens). El primario
    se oscurece (o aclara, en oscuro) lo justo para tener 3:1 contra el fondo y
    un texto legible encima; la tinta, hasta 7:1."""
    src = source_from_fields(sid, fields)
    t, _ = derive(sid, src['p'], src['s'], src['ink'], src['bg'], src['surf'])
    return fields_from_tokens(sid, t), t
