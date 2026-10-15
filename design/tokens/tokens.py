#!/usr/bin/env python3
"""Paletas y parejas de letra de Corelia: fuente única para el API, el panel y la web.

    python3 design/tokens/tokens.py            genera palettes.json y sus copias
    python3 design/tokens/tokens.py --check    solo comprueba (contraste + copias al día); sale con 1 si algo falla
    python3 design/tokens/tokens.py --report   tabla con el contraste mínimo de cada paleta
    python3 design/tokens/tokens.py --prototype out.json   formato del prototipo (scratchpad/admin-concept)

Qué genera (no se editan a mano; ver docs/ESTILOS.md):
    design/tokens/palettes.json      el bueno (legible, con la tabla de contraste de cada paleta)
    api/api/design/palettes.json     copia compacta para el API (+ derive.py)
    crm/src/design/palettes.json     copia compacta para el panel
    web/src/design/palettes.json     copia compacta para la web

Cada estilo tiene 10 paletas (fuente: primario, secundario, tinta, fondo,
superficie) y 3 parejas de letra (títulos, texto, peso de los títulos). Una
paleta solo se publica si pasa TODAS las comprobaciones de contraste de
derive.contrast_checks(): texto ≥ 4,5:1 e interfaz ≥ 3:1.
"""
import json
import os
import shutil
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)
from derive import STYLE_MODES, CLASS_HUES, contrast_checks, derive, failures, fields_from_tokens  # noqa: E402

VERSION = 2

# Estilo: nombre, descripción corta (selector) y paletas.
# Paleta: (slug, nombre, primario, secundario, tinta, fondo, superficie)
# Los 6 primeros de cada estilo son los del prototipo aprobado; los 4 últimos,
# las paletas nuevas (cálida / fría / neutra / atrevida dentro del carácter del estilo).
STYLES = {
    'natural': ('Natural', 'Orgánico y cálido', [
        ('arcilla', 'Arcilla', '#9A6B52', '#C9A88F', '#3D3228', '#F5F0EA', '#FFFCF8'),
        ('salvia', 'Salvia', '#5E7A5A', '#B9C7A5', '#2E3A2C', '#F3F2EA', '#FCFBF6'),
        ('oliva', 'Oliva', '#4F5D2F', '#C8B98A', '#2B2E1E', '#F6F3EA', '#FFFDF7'),
        ('terracota', 'Terracota', '#B0573A', '#E8B79A', '#3A2219', '#F8EFE7', '#FFFAF5'),
        ('avena', 'Avena', '#8C7A5B', '#D9CBB0', '#33291C', '#F7F3EC', '#FFFEFA'),
        ('musgo', 'Musgo', '#3F5E4C', '#A9BFA8', '#22302A', '#EFF1EA', '#FAFBF6'),
        ('bahia', 'Bahía', '#2F6B6B', '#9CC5BF', '#1C2D2D', '#EEF3F0', '#FAFCFA'),
        ('brezo', 'Brezo', '#7A5C7A', '#CDB8C9', '#2F2430', '#F5F0F2', '#FDFAFB'),
        ('lino', 'Lino', '#5C6B73', '#B9C4C9', '#262D31', '#F2F3F1', '#FBFBF9'),
        ('ocre', 'Ocre', '#9A6A12', '#E3C27A', '#33270F', '#F8F2E4', '#FFFCF4'),
    ]),
    'minimal': ('Minimal', 'Limpio y sereno', [
        ('grafito', 'Grafito', '#2F2F2F', '#7A7A7A', '#111111', '#FAFAF8', '#FFFFFF'),
        ('niebla', 'Niebla', '#3B4A5A', '#94A3B4', '#141A21', '#F6F7F9', '#FFFFFF'),
        ('arena', 'Arena', '#6B5B4B', '#B8AA98', '#1E1A16', '#FAF8F5', '#FFFFFF'),
        ('salvia', 'Salvia', '#4C6A57', '#A3B8A9', '#15201A', '#F7F9F7', '#FFFFFF'),
        ('lavanda', 'Lavanda', '#5B4F8C', '#B3ABD6', '#1B1730', '#F9F8FC', '#FFFFFF'),
        ('tinta', 'Tinta', '#1F3A5F', '#8DA4C2', '#0F1724', '#F8FAFC', '#FFFFFF'),
        ('coral', 'Coral', '#C2412D', '#F0A898', '#1F1311', '#FCFAF9', '#FFFFFF'),
        ('oceano', 'Océano', '#0F6E6E', '#8CC7C2', '#0E1C1C', '#F6FAF9', '#FFFFFF'),
        ('pizarra', 'Pizarra', '#475467', '#98A2B3', '#101828', '#F9FAFB', '#FFFFFF'),
        ('mostaza', 'Mostaza', '#8A6A00', '#D9B648', '#1C1708', '#FBFAF5', '#FFFFFF'),
    ]),
    'editorial': ('Editorial', 'Revista elegante', [
        ('moca', 'Moca', '#8C6A5B', '#2E2A27', '#1E1B19', '#F7F3EE', '#FFFDF9'),
        ('burdeos', 'Burdeos', '#7A2E3A', '#C9A27E', '#1F1416', '#F7F1EC', '#FFFCF8'),
        ('tinta', 'Tinta azul', '#23395B', '#B08D57', '#141A26', '#F5F2EC', '#FFFDF8'),
        ('pino', 'Pino', '#2F4A3E', '#B5895A', '#17211C', '#F4F1EA', '#FFFDF8'),
        ('ciruela', 'Ciruela', '#5A3557', '#C7A3A0', '#1F151E', '#F7F2F1', '#FFFCFB'),
        ('papel', 'Papel', '#1E1B19', '#9C7B5C', '#1E1B19', '#F2EEE6', '#FBF9F4'),
        ('teja', 'Teja', '#9A3F22', '#D9A47E', '#22140E', '#F8F1EA', '#FFFCF8'),
        ('humo', 'Humo', '#3E4C59', '#A3ACB5', '#161B20', '#F3F4F4', '#FCFCFC'),
        ('oliva', 'Oliva', '#55552A', '#B8A97A', '#1D1D12', '#F4F2EA', '#FDFCF7'),
        ('azafran', 'Azafrán', '#A04E00', '#E8B04A', '#1E1A16', '#FAF4E8', '#FFFDF8'),
    ]),
    'glass': ('Glass', 'Cristal translúcido', [
        ('oceano', 'Océano', '#2F6E80', '#7C9CF5', '#1F2A37', '#E9F1F7', '#F7FAFC'),
        ('lavanda', 'Lavanda', '#6A5ACD', '#F0A6CA', '#241F3A', '#EEEBFA', '#FAF9FF'),
        ('aurora', 'Aurora', '#2E7D6B', '#8FD3C7', '#13302A', '#E7F4F1', '#F7FCFB'),
        ('coral', 'Coral', '#C2543F', '#F6B99B', '#3A1E17', '#FBEDE8', '#FFF9F7'),
        ('cielo', 'Cielo', '#2F5FD0', '#9CC3FF', '#182544', '#E8EFFC', '#F8FAFF'),
        ('malva', 'Malva', '#8A4F7D', '#E3B7D6', '#2E1A2A', '#F5ECF3', '#FFFAFE'),
        ('ambar', 'Ámbar', '#9A5B00', '#F5C26B', '#2E2006', '#FBF3E4', '#FFFCF6'),
        ('lima', 'Lima', '#4D7C0F', '#C5E86C', '#1C2A06', '#F1F7E4', '#FBFEF4'),
        ('perla', 'Perla', '#4A5A6A', '#C9D3DD', '#1E2730', '#EEF1F4', '#FAFBFC'),
        ('orquidea', 'Orquídea', '#B03A7A', '#F3B5D5', '#33142A', '#FBEAF3', '#FFF8FC'),
    ]),
    'brutalist': ('Brutalista', 'Bloques y bordes', [
        ('amarillo', 'Amarillo', '#FFD400', '#1F6BFF', '#111111', '#FFFDF5', '#FFFFFF'),
        ('tomate', 'Tomate', '#FF5A36', '#FFD400', '#111111', '#FFF8F0', '#FFFFFF'),
        ('menta', 'Menta', '#3DDC97', '#FF6B6B', '#111111', '#F4FFF8', '#FFFFFF'),
        ('cobalto', 'Cobalto', '#2B59FF', '#FFD400', '#111111', '#F5F7FF', '#FFFFFF'),
        ('chicle', 'Chicle', '#FF7AC6', '#00C2A8', '#111111', '#FFF5FA', '#FFFFFF'),
        ('lima', 'Lima', '#C6F432', '#7B61FF', '#111111', '#FBFFF0', '#FFFFFF'),
        ('naranja', 'Naranja', '#FF8A00', '#00B3A4', '#111111', '#FFF7EC', '#FFFFFF'),
        ('cielo', 'Cielo', '#5CC8FF', '#FF5A36', '#111111', '#F2FAFF', '#FFFFFF'),
        ('kraft', 'Kraft', '#E9D3A8', '#FF5A36', '#111111', '#FBF8F1', '#FFFFFF'),
        ('lavanda', 'Lavanda', '#B69CFF', '#FFD400', '#111111', '#F7F4FF', '#FFFFFF'),
    ]),
    'energy': ('Energía', 'Deportivo oscuro', [
        ('voltio', 'Voltio', '#D4FF00', '#FF4D00', '#F5F5F0', '#0A0A0A', '#151515'),
        ('fuego', 'Fuego', '#FF5A1F', '#FFC800', '#F7F3EE', '#0D0A08', '#1A1411'),
        ('hielo', 'Hielo', '#3DE0FF', '#B6FF3B', '#EEF6F8', '#071014', '#0F1C22'),
        ('turbo', 'Turbo', '#FF2E63', '#FFD23F', '#F8F0F2', '#0E0A0C', '#1A1216'),
        ('acero', 'Acero', '#E8E8E8', '#FF4D00', '#F2F2F2', '#0B0C0E', '#16181B'),
        ('jungla', 'Jungla', '#39FF88', '#FFE14D', '#EFF7F1', '#08100B', '#111D15'),
        ('oro', 'Oro', '#FFC400', '#FF4D00', '#F7F3EA', '#0C0A06', '#18150E'),
        ('electrico', 'Eléctrico', '#4D8BFF', '#B6FF3B', '#EEF2FA', '#070A12', '#111827'),
        ('arena', 'Arena', '#E6C79C', '#FF6A3D', '#F5F0E8', '#0D0B09', '#1A1714'),
        ('violeta', 'Violeta', '#A66BFF', '#FFE14D', '#F3EEFF', '#0B0814', '#171225'),
    ]),
    'pop': ('Pop', 'Pastel juguetón', [
        ('chicle', 'Chicle', '#FF5FA2', '#7C5CFF', '#2B1B3A', '#FFF0F6', '#FFFFFF'),
        ('lavanda', 'Lavanda', '#7C5CFF', '#FFB4D9', '#2B1B3A', '#F5F0FF', '#FFFFFF'),
        ('melocoton', 'Melocotón', '#FF8A5C', '#7C5CFF', '#3A1F14', '#FFF3EC', '#FFFFFF'),
        ('menta', 'Menta', '#19B394', '#FFB4D9', '#123A33', '#EEFBF6', '#FFFFFF'),
        ('uva', 'Uva', '#9B4DCA', '#FFD84D', '#2A1438', '#FBF3FF', '#FFFFFF'),
        ('cielo', 'Cielo', '#4D8DFF', '#FFC2E2', '#14234A', '#EEF4FF', '#FFFFFF'),
        ('cereza', 'Cereza', '#E0245E', '#FFC94D', '#3A0F1F', '#FFF0F4', '#FFFFFF'),
        ('pistacho', 'Pistacho', '#4E9A2E', '#FF9EC4', '#1E3312', '#F3FBEA', '#FFFFFF'),
        ('limon', 'Limón', '#B88A00', '#7C5CFF', '#33290A', '#FFFBEA', '#FFFFFF'),
        ('regaliz', 'Regaliz', '#2B1B3A', '#FF5FA2', '#2B1B3A', '#FFF5FA', '#FFFFFF'),
    ]),
    'neon': ('Neón', 'Noche con brillo', [
        ('magenta', 'Magenta', '#FF2BD6', '#00E5FF', '#F3F0FF', '#0B0B1A', '#12122A'),
        ('cian', 'Cian', '#00E5FF', '#FF2BD6', '#EAFBFF', '#06121A', '#0E1F2B'),
        ('acido', 'Ácido', '#B8FF2B', '#7A5CFF', '#F2FFE8', '#0A0F07', '#141C10'),
        ('ultravioleta', 'Ultravioleta', '#9D6BFF', '#2BFFC6', '#F1EDFF', '#0D0920', '#1A1436'),
        ('sunset', 'Sunset', '#FF6A3D', '#FF2BD6', '#FFF1EC', '#140A12', '#22121F'),
        ('hielo', 'Hielo', '#7DF9FF', '#9D6BFF', '#EEFDFF', '#070B18', '#10172B'),
        ('oro', 'Oro', '#FFD60A', '#FF2BD6', '#FFFBEA', '#0F0C05', '#1C170A'),
        ('laser', 'Láser', '#FF3355', '#00E5FF', '#FFF0F2', '#12060A', '#220C14'),
        ('menta', 'Menta', '#2BFFB0', '#9D6BFF', '#EDFFF8', '#05120E', '#0C221B'),
        ('cromo', 'Cromo', '#D8DEE9', '#00E5FF', '#F2F4F8', '#0A0B0F', '#15171E'),
    ]),
}

# Parejas de letra por estilo: (títulos, texto, peso de los títulos). La primera es la de serie.
FONTS = {
    'natural': [('Bricolage Grotesque', 'DM Sans', 700), ('Fraunces', 'DM Sans', 600), ('Lora', 'Nunito Sans', 600)],
    'minimal': [('Inter Tight', 'Inter', 600), ('Manrope', 'Manrope', 700), ('DM Sans', 'DM Sans', 600)],
    'editorial': [('Playfair Display', 'Inter', 500), ('Cormorant Garamond', 'Libre Franklin', 600), ('Instrument Serif', 'Inter', 400)],
    'glass': [('Plus Jakarta Sans', 'Plus Jakarta Sans', 700), ('Outfit', 'Work Sans', 600), ('Sora', 'Inter', 600)],
    'brutalist': [('Space Grotesk', 'Space Grotesk', 700), ('Archivo Black', 'Archivo', 400), ('Space Mono', 'Public Sans', 700)],
    'energy': [('Barlow Condensed', 'Barlow', 700), ('Anton', 'Inter', 400), ('Oswald', 'Manrope', 600)],
    'pop': [('Fredoka', 'Nunito', 600), ('Baloo 2', 'Nunito Sans', 700), ('Bricolage Grotesque', 'Rubik', 700)],
    'neon': [('Unbounded', 'Manrope', 600), ('Sora', 'Inter', 600), ('Chakra Petch', 'Inter', 600)],
}
# Fuentes de Google con un solo grosor (pedir más da error)
SINGLE_WEIGHT = ['Instrument Serif', 'Archivo Black', 'Anton']

COPIES = ['api/api/design/palettes.json', 'crm/src/design/palettes.json', 'web/src/design/palettes.json']
DERIVE_COPY = 'api/api/design/derive.py'


def slug(s):
    return ''.join(c if c.isalnum() else '-' for c in s.lower()).strip('-').replace('--', '-')


def font_id(h, b):
    return slug(h) if h == b else f'{slug(h)}--{slug(b)}'


def build():
    """(datos, informe). informe = [(estilo, paleta, correcciones, mínimo texto, mínimo UI, fallos)]."""
    styles, report = {}, []
    for sid, (name, desc, pals) in STYLES.items():
        mode, side = STYLE_MODES[sid]
        out = []
        seen = set()
        for pid, pname, p0, s0, ink, bg, surf in pals:
            assert pid not in seen, f'{sid}: slug repetido {pid}'
            seen.add(pid)
            t, fixes = derive(sid, p0, s0, ink, bg, surf)
            checks = contrast_checks(sid, t)
            failed = failures(checks)
            text = [v for k, v in checks.items() if '(UI)' not in k]
            ui = [v for k, v in checks.items() if '(UI)' in k]
            report.append((sid, pid, fixes, min(text), min(ui), failed))
            out.append({
                'id': pid, 'name': pname, **t,
                'source': {'p': p0.upper(), 's': s0.upper(), 'ink': ink.upper(), 'bg': bg.upper(), 'surf': surf.upper()},
                'fields': fields_from_tokens(sid, t),
                'contrast': {k: round(v, 2) for k, v in checks.items()},
            })
        assert len(out) == 10, f'{sid}: {len(out)} paletas (deben ser 10)'
        fonts = [{'id': font_id(h, b), 'heading': h, 'body': b, 'weight': w} for h, b, w in FONTS[sid]]
        styles[sid] = {'name': name, 'desc': desc, 'mode': mode, 'side': side, 'palettes': out, 'fonts': fonts}
    data = {'version': VERSION, 'classHues': CLASS_HUES, 'singleWeightFonts': SINGLE_WEIGHT, 'styles': styles}
    return data, report


def dump(data):
    return json.dumps(data, ensure_ascii=False, indent=1) + '\n'


def dump_compact(data):
    """Copias para el API, el panel y la web: sin la tabla de contraste y sin espacios."""
    styles = {sid: {**s, 'palettes': [{k: v for k, v in p.items() if k != 'contrast'} for p in s['palettes']]}
              for sid, s in data['styles'].items()}
    return json.dumps({**data, 'styles': styles}, ensure_ascii=False, separators=(',', ':')) + '\n'


def prototype_format(data):
    """Formato de tokens.json del prototipo: {estilo: {mode, palettes: [...]}}."""
    return {sid: {'mode': s['mode'], 'palettes': [{k: v for k, v in p.items() if k not in ('source', 'fields')}
                                                  for p in s['palettes']]}
            for sid, s in data['styles'].items()}


def main(argv):
    data, report = build()
    failed = [r for r in report if r[5]]
    text, compact = dump(data), dump_compact(data)
    if '--report' in argv:
        print('estilo | paleta | correcciones | mín. texto | mín. UI | fallos')
        for sid, pid, fixes, mt, mu, f in report:
            print(f'{sid} | {pid} | {"; ".join(fixes) or "-"} | {mt:.2f} | {mu:.2f} | {", ".join(f) or "-"}')
    if '--prototype' in argv:
        out = argv[argv.index('--prototype') + 1]
        with open(out, 'w', encoding='utf-8') as f:
            json.dump(prototype_format(data), f, ensure_ascii=False, indent=0)
        print('prototipo →', out)
        return 1 if failed else 0
    if failed:
        for sid, pid, _, _, _, f in failed:
            print(f'✗ {sid}/{pid}: falla {", ".join(f)}', file=sys.stderr)
        print(f'{len(failed)} paletas no pasan el contraste', file=sys.stderr)
        return 1
    main_path = os.path.join(HERE, 'palettes.json')
    derive_src = open(os.path.join(HERE, 'derive.py'), encoding='utf-8').read()
    if '--check' in argv:
        bad = []
        for rel, want in [('design/tokens/palettes.json', text), *((c, compact) for c in COPIES)]:
            path = os.path.join(ROOT, rel)
            if not os.path.exists(path) or open(path, encoding='utf-8').read() != want:
                bad.append(rel)
        dpath = os.path.join(ROOT, DERIVE_COPY)
        if not os.path.exists(dpath) or open(dpath, encoding='utf-8').read() != derive_src:
            bad.append(DERIVE_COPY)
        if bad:
            print('Desactualizado (ejecuta python3 design/tokens/tokens.py): ' + ', '.join(bad), file=sys.stderr)
            return 1
        n = sum(len(s['palettes']) for s in data['styles'].values())
        print(f'OK: {n} paletas en {len(data["styles"])} estilos pasan el contraste; copias al día.')
        return 0
    with open(main_path, 'w', encoding='utf-8') as f:
        f.write(text)
    for rel in COPIES:
        path = os.path.join(ROOT, rel)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, 'w', encoding='utf-8') as f:
            f.write(compact)
    dpath = os.path.join(ROOT, DERIVE_COPY)
    os.makedirs(os.path.dirname(dpath), exist_ok=True)
    shutil.copyfile(os.path.join(HERE, 'derive.py'), dpath)
    n = sum(len(s['palettes']) for s in data['styles'].values())
    fixes = sum(1 for r in report if r[2])
    print(f'{n} paletas OK ({fixes} con el primario corregido) → design/tokens/palettes.json + {len(COPIES)} copias + {DERIVE_COPY}')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
