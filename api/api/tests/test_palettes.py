"""Paletas y parejas de letra (design/tokens → api/utils/palettes.py)."""
import importlib

from django.apps import apps as global_apps
from django.test import SimpleTestCase
from rest_framework.test import APIClient

from api.design.derive import contrast_checks, cr, derive, failures, fix_custom
from api.models import SiteConfig
from api.tests.factories import StudioTestCase, make_admin
from api.utils.palettes import (
    THEME_FIELDS, font_pairs, match_palette, palette, palette_colors, palettes, resolve_theme, tokens,
)


class PaletteTokensTests(SimpleTestCase):
    def test_every_style_has_ten_palettes_and_three_font_pairs(self):
        styles = tokens()['styles']
        self.assertEqual(set(styles), {s for s, _ in SiteConfig.STYLE_PRESETS})
        for sid, st in styles.items():
            self.assertEqual(len(st['palettes']), 10, sid)
            self.assertEqual(len({p['id'] for p in st['palettes']}), 10, f'{sid}: slugs repetidos')
            self.assertEqual(len(st['fonts']), 3, sid)
            for p in st['palettes']:
                self.assertLessEqual(len(p['id']), SiteConfig._meta.get_field('palette').max_length)
            for f in st['fonts']:
                self.assertLessEqual(len(f['id']), SiteConfig._meta.get_field('font_pair').max_length)

    def test_every_palette_passes_the_contrast_gate(self):
        """El JSON copiado al API se re-deriva con derive.py y pasa todas las comprobaciones."""
        for sid, st in tokens()['styles'].items():
            for p in st['palettes']:
                src = p['source']
                t, _ = derive(sid, src['p'], src['s'], src['ink'], src['bg'], src['surf'])
                for k, v in t.items():
                    self.assertEqual(v, p[k], f'{sid}/{p["id"]}.{k} desactualizado: python3 design/tokens/tokens.py')
                self.assertEqual(failures(contrast_checks(sid, t)), [], f'{sid}/{p["id"]}')
                self.assertGreaterEqual(cr(t['onP'], t['p']), 4.5)
                self.assertGreaterEqual(cr(t['ink'], t['bg']), 4.5)


class CustomColorFixTests(SimpleTestCase):
    def test_light_primary_is_darkened_until_it_reads_on_the_background(self):
        fields, t = fix_custom('natural', {'primary': '#F5D0C5', 'secondary': '#C9A88F',
                                           'dark': '#3D3228', 'background': '#FFFFFF'})
        self.assertNotEqual(fields['primary'], '#F5D0C5')
        self.assertGreaterEqual(cr(fields['primary'], fields['background']), 3)
        self.assertGreaterEqual(cr(t['onP'], t['p']), 4.5)
        self.assertEqual(failures(contrast_checks('natural', t)), [])

    def test_dark_style_with_light_colors_gets_a_dark_background(self):
        fields, t = fix_custom('neon', {'primary': '#FF2BD6', 'secondary': '#00E5FF',
                                        'dark': '#F5F0EA', 'background': '#FFFFFF'})
        self.assertLess(cr(fields['background'], '#000000'), 3)
        self.assertGreaterEqual(cr(t['ink'], t['bg']), 4.5)
        self.assertEqual(failures(contrast_checks('neon', t)), [])

    def test_readable_custom_colors_stay_the_same(self):
        fields, _ = fix_custom('natural', {'primary': '#112233', 'secondary': '#85786B',
                                           'dark': '#3D3228', 'background': '#F5F0EA'})
        self.assertEqual(fields, {'primary': '#112233', 'secondary': '#85786B',
                                  'dark': '#3D3228', 'background': '#F5F0EA'})


class ResolveThemeTests(SimpleTestCase):
    current = {'style_preset': 'natural', 'palette': '', 'font_pair': '', 'color_primary': '#A0897C',
               'color_secondary': '#85786B', 'color_dark': '#3D3228', 'color_background': '#F5F0EA',
               'font_heading': 'Playfair Display', 'font_body': 'Jost'}

    def test_choosing_a_palette_writes_its_colors(self):
        out = resolve_theme(self.current, {'palette': 'salvia'})
        self.assertEqual(out['palette'], 'salvia')
        for f, v in palette_colors(palette('natural', 'salvia')).items():
            self.assertEqual(out[f], v)

    def test_palette_wins_over_stale_colors(self):
        out = resolve_theme(self.current, {'palette': 'oliva', 'color_primary': '#000000'})
        self.assertEqual(out['color_primary'], palette('natural', 'oliva')['fields']['primary'])

    def test_unchanged_custom_colors_are_not_touched(self):
        """Un estudio que guarda otra cosa (o reenvía sus mismos colores) los conserva."""
        cur = {**self.current, 'color_primary': '#F5D0C5'}  # se lee mal, pero es suyo
        out = resolve_theme(cur, {'color_primary': '#f5d0c5', 'font_heading': 'Playfair Display'})
        self.assertEqual(out['color_primary'], '#f5d0c5')
        self.assertEqual(out['palette'], '')

    def test_new_custom_colors_are_fixed(self):
        out = resolve_theme(self.current, {'palette': '', 'color_primary': '#FFE4B5'})
        self.assertEqual(out['palette'], '')
        self.assertGreaterEqual(cr(out['color_primary'], out['color_background']), 3)

    def test_colors_equal_to_a_palette_select_it(self):
        out = resolve_theme(self.current, palette_colors(palette('natural', 'musgo')))
        self.assertEqual(out['palette'], 'musgo')

    def test_style_change_keeps_same_slug_or_takes_the_first(self):
        cur = {**self.current, 'palette': 'salvia'}
        self.assertEqual(resolve_theme(cur, {'style_preset': 'minimal'})['palette'], 'salvia')
        out = resolve_theme(cur, {'style_preset': 'neon'})
        self.assertEqual(out['palette'], palettes('neon')[0]['id'])
        self.assertEqual(out['color_primary'], palettes('neon')[0]['fields']['primary'])

    def test_unknown_palette_for_the_style_is_rejected(self):
        from api.utils.palettes import ThemeError
        with self.assertRaises(ThemeError):
            resolve_theme(self.current, {'palette': 'magenta'})  # es de neón

    def test_font_pair_writes_both_fonts(self):
        pair = font_pairs('natural')[1]
        out = resolve_theme(self.current, {'font_pair': pair['id']})
        self.assertEqual((out['font_heading'], out['font_body']), (pair['heading'], pair['body']))

    def test_style_change_moves_font_pair_to_the_new_style(self):
        cur = {**self.current, 'font_pair': font_pairs('natural')[0]['id']}
        out = resolve_theme(cur, {'style_preset': 'editorial'})
        self.assertEqual(out['font_pair'], font_pairs('editorial')[0]['id'])
        self.assertEqual(out['font_heading'], font_pairs('editorial')[0]['heading'])


class PaletteApiTests(StudioTestCase):
    def setUp(self):
        self.c = APIClient()
        self.c.force_authenticate(make_admin())

    def test_admin_chooses_style_palette_and_font_pair(self):
        pair = font_pairs('glass')[2]
        r = self.c.patch('/api/v1/site-config/', {
            'style_preset': 'glass', 'palette': 'perla', 'font_pair': pair['id'],
        }, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        data = r.json()
        self.assertEqual(data['palette'], 'perla')
        self.assertEqual(data['color_primary'], palette('glass', 'perla')['fields']['primary'])
        self.assertEqual(data['font_heading'], pair['heading'])
        public = APIClient().get('/api/v1/site-config/public/').json()['theme']
        self.assertEqual(public['palette'], 'perla')
        self.assertEqual(public['font_pair'], pair['id'])
        self.assertEqual(public['primary'], palette('glass', 'perla')['fields']['primary'])

    def test_palette_of_another_style_is_rejected(self):
        r = self.c.patch('/api/v1/site-config/', {'style_preset': 'minimal', 'palette': 'voltio'}, format='json')
        self.assertEqual(r.status_code, 400)
        self.assertIn('palette', r.json())

    def test_custom_brand_color_is_fixed_for_contrast(self):
        r = self.c.patch('/api/v1/site-config/', {
            'style_preset': 'natural', 'palette': '', 'color_primary': '#FFD9E8',
            'color_background': '#FFFFFF',
        }, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        data = r.json()
        self.assertEqual(data['palette'], '')
        self.assertNotEqual(data['color_primary'].upper(), '#FFD9E8')
        self.assertGreaterEqual(cr(data['color_primary'], data['color_background']), 3)

    def test_saving_other_fields_keeps_existing_colors(self):
        cfg = SiteConfig.load()
        cfg.color_primary = '#EEDDCC'  # ilegible, pero es el que tenía
        cfg.save()
        r = self.c.patch('/api/v1/site-config/', {
            'studio_name': 'Estudio Sol', 'color_primary': '#EEDDCC', 'style_preset': cfg.style_preset,
        }, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(SiteConfig.load().color_primary, '#EEDDCC')

    def test_public_config_hides_a_palette_that_is_not_of_the_style(self):
        SiteConfig.objects.filter(pk=SiteConfig.load().pk).update(palette='voltio', style_preset='natural')
        public = APIClient().get('/api/v1/site-config/public/').json()['theme']
        self.assertEqual(public['palette'], '')


class MigrationMappingTests(StudioTestCase):
    """0008: la paleta se marca solo si los colores coinciden EXACTAMENTE; nunca cambian."""
    migration = importlib.import_module('api.migrations.0008_siteconfig_palette_font_pair')

    def _run(self):
        self.migration.map_existing(global_apps, None)
        return SiteConfig.load()

    def test_default_colors_stay_custom_and_untouched(self):
        cfg = SiteConfig.load()
        before = {f: getattr(cfg, f) for f in THEME_FIELDS}
        after = self._run()
        self.assertEqual(after.palette, '')
        self.assertEqual({f: getattr(after, f) for f in THEME_FIELDS}, {**before, 'palette': '', 'font_pair': ''})

    def test_exact_palette_colors_are_mapped(self):
        cfg = SiteConfig.load()
        cfg.style_preset = 'minimal'
        for f, v in palette_colors(palette('minimal', 'grafito')).items():
            setattr(cfg, f, v.lower())
        cfg.font_heading, cfg.font_body = 'Manrope', 'Manrope'
        cfg.save()
        after = self._run()
        self.assertEqual(after.palette, 'grafito')
        self.assertEqual(after.font_pair, 'manrope')
        self.assertEqual(after.color_primary, palette('minimal', 'grafito')['fields']['primary'].lower())

    def test_legacy_energy_default_maps_to_voltio(self):
        cfg = SiteConfig.load()
        cfg.style_preset = 'energy'
        cfg.color_primary, cfg.color_secondary, cfg.color_dark, cfg.color_background = (
            '#D4FF00', '#FF4D00', '#0A0A0A', '#151515')
        cfg.save()
        self.assertEqual(self._run().palette, 'voltio')

    def test_near_match_is_not_mapped(self):
        colors = palette_colors(palette('natural', 'arcilla'))
        colors['color_primary'] = '#9A6B53'
        self.assertEqual(match_palette('natural', colors), '')
