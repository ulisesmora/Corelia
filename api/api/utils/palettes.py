"""Paletas de color y parejas de letra de cada estilo.

Vienen de `design/tokens` (fuente única del repo), copiadas por el generador a
`api/api/design/palettes.json` y `api/api/design/derive.py`. Ver docs/ESTILOS.md.

Qué guarda el estudio (SiteConfig):
  - `palette`: slug de una paleta de SU estilo ('' = colores propios).
  - `font_pair`: slug de una pareja de letra de su estilo ('' = letra propia).
  - `color_*` y `font_*`: los valores EFECTIVOS (lo que leen la web y el
    panel). Elegir una paleta escribe sus colores ahí; elegir colores propios
    los corrige para que se lean (`derive.fix_custom`).

`resolve_theme()` es la única regla para pasar de lo que pide el panel a lo
que se guarda; la usan el serializer de Ajustes y `apply_brand`.
"""
from __future__ import annotations

import functools
import json
from pathlib import Path

from api.design.derive import STYLE_MODES, fix_custom

COLOR_FIELDS = ('color_primary', 'color_secondary', 'color_dark', 'color_background')
FIELD_KEYS = {'color_primary': 'primary', 'color_secondary': 'secondary',
              'color_dark': 'dark', 'color_background': 'background'}
THEME_FIELDS = ('style_preset', 'palette', 'font_pair', *COLOR_FIELDS, 'font_heading', 'font_body')
DEFAULT_STYLE = 'natural'


@functools.lru_cache(maxsize=1)
def tokens() -> dict:
    path = Path(__file__).resolve().parent.parent / 'design' / 'palettes.json'
    return json.loads(path.read_text(encoding='utf-8'))


def style_data(style: str) -> dict:
    styles = tokens()['styles']
    return styles.get(style) or styles[DEFAULT_STYLE]


def palettes(style: str) -> list[dict]:
    return style_data(style)['palettes']


def palette(style: str, slug: str) -> dict | None:
    return next((p for p in palettes(style) if p['id'] == slug), None) if slug else None


def font_pairs(style: str) -> list[dict]:
    return style_data(style)['fonts']


def font_pair(style: str, slug: str) -> dict | None:
    return next((f for f in font_pairs(style) if f['id'] == slug), None) if slug else None


def palette_colors(p: dict) -> dict:
    """{color_primary: …, …} que se guardan al elegir la paleta `p`."""
    return {f: p['fields'][k] for f, k in FIELD_KEYS.items()}


def same_color(a: str, b: str) -> bool:
    return (a or '').strip().upper() == (b or '').strip().upper()


def match_palette(style: str, colors: dict) -> str:
    """Slug de la paleta del estilo cuyos 4 colores son EXACTAMENTE estos ('' si ninguna)."""
    for p in palettes(style):
        if all(same_color(colors.get(f, ''), v) for f, v in palette_colors(p).items()):
            return p['id']
    return ''


def match_font_pair(style: str, heading: str, body: str) -> str:
    for f in font_pairs(style):
        if f['heading'] == (heading or '').strip() and f['body'] == (body or '').strip():
            return f['id']
    return ''


def fixed_custom_colors(style: str, colors: dict) -> dict:
    """Colores propios corregidos para que se lean (primario ≥ 3:1 contra el fondo,
    texto encima legible, tinta ≥ 7:1…). Misma lógica que el panel (derive.ts)."""
    fields, _ = fix_custom(style if style in STYLE_MODES else DEFAULT_STYLE,
                           {k: colors[f] for f, k in FIELD_KEYS.items()})
    return {f: fields[k] for f, k in FIELD_KEYS.items()}


class ThemeError(ValueError):
    def __init__(self, field: str, message: str):
        super().__init__(message)
        self.field = field
        self.message = message


def resolve_theme(current: dict, incoming: dict) -> dict:
    """Lo que hay que guardar de THEME_FIELDS. `current`: valores actuales;
    `incoming`: lo que llega (solo las claves enviadas). Reglas:

    - `palette` con slug → se guardan los colores de esa paleta (gana a los
      colores que vengan). '' → colores propios.
    - Sin `palette` pero con colores distintos de los guardados → colores
      propios (o la paleta que coincida exactamente).
    - Cambio de estilo sin `palette`: la misma paleta si existe en el nuevo
      estilo; si no, la primera. Con colores propios se quedan los suyos.
    - Colores propios: se corrigen (fixed_custom_colors) solo si cambian
      (colores, estilo o paso de paleta a propios). Si nada cambia no se
      tocan: un estudio que guarda otra cosa conserva sus colores.
    - `font_pair` igual con font_heading/font_body.
    Lanza ThemeError si el slug no existe en el estilo.
    """
    out = dict(incoming)
    style = incoming.get('style_preset', current.get('style_preset') or DEFAULT_STYLE)
    style_changed = style != (current.get('style_preset') or DEFAULT_STYLE)
    cur_pal = current.get('palette') or ''
    cur_font = current.get('font_pair') or ''
    colors = {f: incoming.get(f, current.get(f, '')) for f in COLOR_FIELDS}
    colors_changed = any(f in incoming and not same_color(incoming[f], current.get(f, '')) for f in COLOR_FIELDS)

    # ── Colores ──
    if 'palette' in incoming:
        target = incoming['palette'] or ''
        if target and not palette(style, target):
            raise ThemeError('palette', 'Elige una de las paletas de tu estilo (o «Mis colores»).')
    elif style_changed and cur_pal:
        target = cur_pal if palette(style, cur_pal) else palettes(style)[0]['id']
    elif colors_changed:
        target = match_palette(style, colors)
    else:
        target = cur_pal
    if target:
        out['palette'] = target
        out.update(palette_colors(palette(style, target)))
    else:
        out['palette'] = ''
        if colors_changed or style_changed or cur_pal:
            out.update(fixed_custom_colors(style, colors))

    # ── Letra ──
    heading = incoming.get('font_heading', current.get('font_heading', ''))
    body = incoming.get('font_body', current.get('font_body', ''))
    fonts_changed = any(k in incoming and incoming[k] != current.get(k) for k in ('font_heading', 'font_body'))
    if 'font_pair' in incoming:
        fp = incoming['font_pair'] or ''
        if fp and not font_pair(style, fp):
            raise ThemeError('font_pair', 'Elige una de las letras de tu estilo (o escribe las tuyas).')
    elif style_changed and cur_font:
        fp = cur_font if font_pair(style, cur_font) else font_pairs(style)[0]['id']
    elif fonts_changed:
        fp = match_font_pair(style, heading, body)
    else:
        fp = cur_font
    out['font_pair'] = fp
    if fp:
        pair = font_pair(style, fp)
        out['font_heading'], out['font_body'] = pair['heading'], pair['body']
    return out


def public_theme_slugs(style: str, palette_slug: str, font_slug: str) -> dict:
    """palette/font_pair para la config pública: solo si existen en el estilo."""
    return {
        'palette': palette_slug if palette(style, palette_slug) else '',
        'font_pair': font_slug if font_pair(style, font_slug) else '',
    }
