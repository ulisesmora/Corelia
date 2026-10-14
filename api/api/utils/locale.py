"""País y moneda del estudio, y formato de importes para emails y textos del
servidor.

La web y el panel formatean con ``Intl.NumberFormat`` del navegador; aquí, sin
dependencias (no usamos Babel), hay un formato propio y probado para las
monedas que admite Corelia:

    money(29, 'EUR', 'es-ES')   → '29,00 €'
    money(29, 'USD', 'en-US')   → '$29.00'
    money(29, 'USD', 'es-ES')   → '29,00 US$'
    money(549, 'MXN', 'es-MX')  → '$549.00 MXN'   (el «$» solo se aclara con el código)
    money(15990, 'CLP', 'es-CL') → '$15.990 CLP'  (el peso chileno no tiene decimales)

Para añadir una moneda: una entrada en CURRENCIES (y, si hace falta, el país en
COUNTRIES). Si Stripe la trata como «sin decimales», añádela también a
ZERO_DECIMAL en api/utils/payments.py.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation

NBSP = ' '
DEFAULT_CURRENCY = 'EUR'
DEFAULT_COUNTRY = 'ES'


@dataclass(frozen=True)
class Currency:
    code: str
    name: str              # en español, para el panel
    decimals: int          # cifras decimales (ISO 4217)
    symbol: str            # símbolo en su propio país ('$' en México para MXN)
    intl_symbol: str       # símbolo fuera de su país ('MX$')
    home: frozenset = field(default_factory=frozenset)  # países donde es la moneda local


_EURO_COUNTRIES = frozenset({
    'ES', 'PT', 'FR', 'DE', 'IT', 'IE', 'NL', 'BE', 'AT', 'LU', 'FI', 'GR', 'AD', 'MC',
})

CURRENCIES: dict[str, Currency] = {c.code: c for c in [
    Currency('EUR', 'Euro', 2, '€', '€', _EURO_COUNTRIES),
    Currency('USD', 'Dólar estadounidense', 2, '$', 'US$', frozenset({'US', 'PR', 'EC', 'SV', 'PA'})),
    Currency('MXN', 'Peso mexicano', 2, '$', 'MX$', frozenset({'MX'})),
    Currency('CAD', 'Dólar canadiense', 2, '$', 'CA$', frozenset({'CA'})),
    Currency('GBP', 'Libra esterlina', 2, '£', '£', frozenset({'GB'})),
    Currency('COP', 'Peso colombiano', 2, '$', 'COP', frozenset({'CO'})),
    Currency('ARS', 'Peso argentino', 2, '$', 'ARS', frozenset({'AR'})),
    Currency('CLP', 'Peso chileno', 0, '$', 'CLP', frozenset({'CL'})),
    Currency('PEN', 'Sol peruano', 2, 'S/', 'PEN', frozenset({'PE'})),
    Currency('BRL', 'Real brasileño', 2, 'R$', 'R$', frozenset({'BR'})),
    Currency('CHF', 'Franco suizo', 2, 'CHF', 'CHF', frozenset({'CH', 'LI'})),
]}

CURRENCY_CHOICES = [(c.code, f'{c.name} ({c.code})') for c in CURRENCIES.values()]


@dataclass(frozen=True)
class Country:
    code: str
    name: str            # en español
    currency: str        # moneda que se propone ('' = ninguna de las admitidas)
    timezone: str        # zona horaria habitual (la principal si hay varias)
    # Formato de los números: separador decimal, de miles, símbolo detrás,
    # espacio entre símbolo e importe y mínimo de cifras para agrupar (es-ES
    # escribe «1000» y «10.000»).
    decimal: str = ','
    group: str = '.'
    symbol_after: bool = False
    space: bool = True
    min_grouping: int = 1


def _eu(code, name, tz, **kw):
    return Country(code, name, 'EUR', tz, symbol_after=True, **kw)


COUNTRIES: dict[str, Country] = {c.code: c for c in [
    # España y Europa
    _eu('ES', 'España', 'Europe/Madrid', min_grouping=2),
    _eu('PT', 'Portugal', 'Europe/Lisbon', min_grouping=2),
    _eu('FR', 'Francia', 'Europe/Paris', group=NBSP),
    _eu('DE', 'Alemania', 'Europe/Berlin'),
    _eu('IT', 'Italia', 'Europe/Rome'),
    _eu('NL', 'Países Bajos', 'Europe/Amsterdam'),
    _eu('BE', 'Bélgica', 'Europe/Brussels'),
    _eu('AT', 'Austria', 'Europe/Vienna'),
    _eu('LU', 'Luxemburgo', 'Europe/Luxembourg'),
    _eu('FI', 'Finlandia', 'Europe/Helsinki', group=NBSP),
    _eu('GR', 'Grecia', 'Europe/Athens'),
    _eu('AD', 'Andorra', 'Europe/Andorra'),
    _eu('MC', 'Mónaco', 'Europe/Monaco', group=NBSP),
    Country('IE', 'Irlanda', 'EUR', 'Europe/Dublin', '.', ',', space=False),
    Country('GB', 'Reino Unido', 'GBP', 'Europe/London', '.', ',', space=False),
    Country('CH', 'Suiza', 'CHF', 'Europe/Zurich', '.', '’'),
    Country('LI', 'Liechtenstein', 'CHF', 'Europe/Vaduz', '.', '’'),
    # Norteamérica
    Country('US', 'Estados Unidos', 'USD', 'America/New_York', '.', ',', space=False),
    Country('CA', 'Canadá', 'CAD', 'America/Toronto', '.', ',', space=False),
    Country('MX', 'México', 'MXN', 'America/Mexico_City', '.', ',', space=False),
    Country('PR', 'Puerto Rico', 'USD', 'America/Puerto_Rico', '.', ',', space=False),
    # Centroamérica y Caribe
    Country('PA', 'Panamá', 'USD', 'America/Panama', '.', ','),
    Country('SV', 'El Salvador', 'USD', 'America/El_Salvador', '.', ',', space=False),
    Country('CR', 'Costa Rica', '', 'America/Costa_Rica', ',', NBSP, space=False),
    Country('GT', 'Guatemala', '', 'America/Guatemala', '.', ',', space=False),
    Country('HN', 'Honduras', '', 'America/Tegucigalpa', '.', ','),
    Country('NI', 'Nicaragua', '', 'America/Managua', '.', ','),
    Country('DO', 'República Dominicana', '', 'America/Santo_Domingo', '.', ',', space=False),
    # Sudamérica
    Country('CO', 'Colombia', 'COP', 'America/Bogota'),
    Country('AR', 'Argentina', 'ARS', 'America/Argentina/Buenos_Aires'),
    Country('CL', 'Chile', 'CLP', 'America/Santiago', space=False),
    Country('PE', 'Perú', 'PEN', 'America/Lima', '.', ','),
    Country('BR', 'Brasil', 'BRL', 'America/Sao_Paulo'),
    Country('EC', 'Ecuador', 'USD', 'America/Guayaquil'),
    Country('UY', 'Uruguay', '', 'America/Montevideo'),
    Country('PY', 'Paraguay', '', 'America/Asuncion'),
    Country('BO', 'Bolivia', '', 'America/La_Paz'),
    Country('VE', 'Venezuela', '', 'America/Caracas'),
]}

COUNTRY_CHOICES = [(c.code, c.name) for c in sorted(COUNTRIES.values(), key=lambda c: c.name)]

# Formato «en inglés» (página en inglés, sea cual sea el país): 1,234.50
_ENGLISH = Country('', '', '', '', '.', ',', space=False)


def normalize_currency(code) -> str:
    """Código en mayúsculas ('mxn' → 'MXN'); una moneda no admitida → la de por defecto."""
    code = str(code or '').strip().upper()
    return code if code in CURRENCIES else DEFAULT_CURRENCY


def normalize_country(code) -> str:
    code = str(code or '').strip().upper()
    return code if code in COUNTRIES else DEFAULT_COUNTRY


def currency_decimals(code) -> int:
    cur = CURRENCIES.get(str(code or '').upper())
    return cur.decimals if cur else 2


def studio_currency() -> str:
    """Moneda del estudio (en mayúsculas, siempre una de las admitidas)."""
    from api.utils.site import get_site_config
    return normalize_currency(get_site_config().currency)


def studio_country() -> str:
    from api.utils.site import get_site_config
    return normalize_country(get_site_config().country)


def studio_locale(lang: str = 'es') -> str:
    """'es-ES', 'es-MX', 'en-US'… según el idioma y el país del estudio."""
    return f'{lang}-{studio_country()}'


def locale_options() -> dict:
    """Listas para el panel (selector de país y moneda)."""
    return {
        'currencies': [
            {'code': c.code, 'name': c.name, 'symbol': c.symbol, 'decimals': c.decimals}
            for c in CURRENCIES.values()
        ],
        'countries': [
            {'code': c.code, 'name': c.name, 'currency': c.currency, 'timezone': c.timezone}
            for c in sorted(COUNTRIES.values(), key=lambda c: c.name)
        ],
    }


def _group(digits: str, sep: str, min_grouping: int) -> str:
    if len(digits) < 3 + min_grouping:
        return digits
    parts = []
    while len(digits) > 3:
        parts.insert(0, digits[-3:])
        digits = digits[:-3]
    parts.insert(0, digits)
    return sep.join(parts)


def _parse_locale(locale: str | None) -> tuple[str, str | None]:
    loc = str(locale or '').replace('_', '-').strip()
    if not loc:
        return 'es', None
    lang, _, region = loc.partition('-')
    return (lang.lower() or 'es'), (region.upper() or None)


def money(amount, currency: str | None = None, locale: str | None = None, *, trim: bool = False) -> str:
    """Importe con el formato del país: '29,00 €', '$29.00', '$549.00 MXN'.

    - ``currency``: código ISO; por defecto, la moneda del estudio.
    - ``locale``: 'es-ES', 'es-MX', 'en-US'… Sin país (o sin locale) se usa
      el país del estudio; sin idioma, español.
    - ``trim``: quita los decimales si son cero ('30 €' en vez de '30,00 €').
    """
    code = normalize_currency(currency) if currency else studio_currency()
    cur = CURRENCIES[code]
    lang, region = _parse_locale(locale)
    if region is None:
        region = studio_country()
    try:
        value = Decimal(str(amount if amount is not None else 0))
    except (InvalidOperation, ValueError):
        value = Decimal(0)
    quant = Decimal(1).scaleb(-cur.decimals)  # 0.01 o 1
    value = value.quantize(quant, rounding=ROUND_HALF_UP)
    negative = value < 0
    integer, _, fraction = f'{abs(value):f}'.partition('.')

    country = COUNTRIES.get(region)
    style = _ENGLISH if lang == 'en' or country is None else country
    number = _group(integer, style.group, style.min_grouping)
    if cur.decimals and not (trim and set(fraction) <= {'0'}):
        number += style.decimal + fraction

    local = region in cur.home
    symbol = cur.symbol if local else cur.intl_symbol
    alpha = symbol.isalpha()  # 'CHF', 'COP'… siempre separados por un espacio
    gap = NBSP if (style.space or alpha) else ''
    if style.symbol_after:
        text = f'{number}{NBSP}{symbol}'
    else:
        text = f'{symbol}{gap}{number}'
    # Un «$» a secas es ambiguo (MXN, CAD, COP…): se aclara con el código
    if symbol == '$' and code != 'USD':
        text += f'{NBSP}{code}'
    return f'-{text}' if negative else text
