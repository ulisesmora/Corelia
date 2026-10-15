# Estilos visuales de la web

Cada estudio elige en el panel (**Ajustes → Aspecto**) dos cosas:

- **Estilo** (`theme.style`): el *acabado* de la web. Cambia superficies, esquinas,
  sombras, botones, títulos y fondos. **No** cambia la estructura: siempre son las
  mismas secciones, en el mismo orden y con el mismo layout.
- **Iconos** (`theme.icons`): `line` (Lucide, línea fina, por defecto), `soft`
  (Phosphor Duotone, redondeados) o `solid` (FontAwesome, rellenos). Los logos de
  marcas (WhatsApp, Instagram…) son siempre los de FontAwesome.

Los colores y las tipografías también salen del panel. Cada estilo los combina con sus
propios tokens: la fuente la decide el panel y el estilo solo pone el peso, las
mayúsculas y el espaciado.

El **panel** (lo que usa el estudio a diario) también sigue el estilo y los iconos de
la web, en una versión «de trabajo»: se reconoce la marca, pero todo se lee bien y es
cómodo para usarlo muchas horas. Ver [El panel con el estilo de la web](#el-panel-con-el-estilo-de-la-web).

## Estilos incluidos

| Slug | Familia | Aspecto |
|---|---|---|
| `natural` *(por defecto)* | Calma | Orgánico y cálido. Superficies crema, esquinas muy redondeadas, sombras suaves teñidas de marca y un halo detrás de los títulos. |
| `minimal` | Calma | Limpio y aireado. Blanco, radio pequeño, sin sombras, bordes finos y títulos ligeros. |
| `editorial` | Calma | De revista. Esquinas rectas, líneas entre secciones, etiquetas en mayúsculas espaciadas, botones de contorno y títulos grandes. |
| `glass` | Tendencia 2026 | Liquid Glass (iOS 26). Cristal translúcido con blur, brillo interior en el borde y profundidad. En móvil el blur se apaga y el cristal pasa a ser casi opaco. |
| `brutalist` | Tendencia 2026 | Neobrutalismo. Bordes negros gruesos, sombras duras desplazadas, bloques de color, etiquetas mono y botones que "se hunden". |
| `energy` | Tendencia 2026 | Deportivo, **oscuro**. Casi negro, títulos en mayúsculas, bandas diagonales entre secciones y acentos saturados. |
| `pop` | Tendencia 2026 | Dopamina pastel. Formas blanditas, sombras de color, lunares de fondo y etiquetas tipo pegatina. |
| `neon` | Tendencia 2026 | Cyberpunk, **oscuro**. Azul-negro, resplandor del primario, rejilla y scanlines. Sin animaciones. |

### Colores en los estilos oscuros (`energy`, `neon`)

- `background` (`--brand-bg`) es el **fondo de la página**: el estudio lo pone oscuro.
- `dark` (`--brand-dark`) se usa en las **zonas más profundas**: navbar, footer y bandas.
- El texto es claro y fijo (`--page-text`). `--brand-dark` nunca es color de texto en un estilo oscuro.
- El primario y el secundario son los acentos.

Si el estudio deja un fondo claro con un estilo oscuro (o al revés), la web no queda
ilegible. `lib/site.ts → themeCss()` calcula unas variables que lo garantizan:

- `--brand-bg-dark` / `--brand-bg-light`: el fondo garantizado oscuro o claro.
- `--on-primary` / `--on-secondary`: texto legible sobre un relleno de ese color.
- `--brand-primary-on-dark` / `--brand-primary-on-light`: el primario como texto legible sobre fondo oscuro o claro.

## Cómo añadir un estilo nuevo

1. **Backend**: añade la entrada a `STYLE_PRESETS` en `api/api/models.py`:

   ```python
   ('sunset', 'Sunset: cálido, degradados de atardecer'),
   ```

   El slug va en minúsculas, con números y guiones, y como máximo 24 caracteres.
   `style_preset` tiene `max_length=16`: si el slug es más largo, amplía el campo con
   una migración. Solo cambian las *choices*; Django genera la migración con
   `makemigrations`.

2. **Web**: añade un bloque en `web/src/styles/presets.css`. Cópialo del estilo más
   parecido, cambia el selector y ajusta los tokens que quieras. Los que no pongas
   heredan los de `natural`:

   ```css
   :root[data-style="sunset"] {
     --page-bg: color-mix(in srgb, var(--brand-bg-light) 70%, #fff3e6);
     --radius-card: 18px;
     --shadow-card: 0 12px 30px -14px color-mix(in srgb, var(--brand-primary) 50%, transparent);
     /* … */
   }
   /* Reglas de detalle opcionales, justo debajo y siempre con el mismo prefijo */
   :root[data-style="sunset"] .sk-eyebrow { padding-inline: 0; }
   ```

   Si el estilo es **oscuro**, pon `color-scheme: dark;`, `--page-bg: var(--brand-bg-dark)` y
   textos claros fijos (`--page-text`, `--text-muted`, `--text-subtle`, `--heading-color`,
   `--deep-text`…) y muestra el logo claro (`--logo-default-display: none;
   --logo-light-display: inline;`). Mira `energy` o `neon`.

   No hace falta tocar ningún componente: solo consumen tokens. Un slug sin bloque
   se ve como `natural`.

3. **Selector del panel (CRM)**: añade su ficha (nombre, descripción y vista previa) en
   `crm/src/components/setup/presets.ts` y el slug a `STYLE_IDS` en
   `crm/src/site/siteConfig.ts`.

4. **El panel con ese estilo**: añade su entrada a `LOOKS` en `crm/src/theme.ts`
   (TypeScript no compila hasta que la tiene). Cópiala del estilo más parecido:
   - `tokens(t)`: la ficha de forma (esquinas, bordes, superficies, sombras, barra
     superior, menú lateral, campos y fondo de la página). `t` son los tonos del
     estudio ya calculados (`t.primaryText` es el primario legible como texto,
     `t.primaryFill`/`t.onPrimary` el relleno de los botones y su texto, `t.ink` el
     oscuro de la marca, `t.uiBorder` un borde de campo con 3:1…).
   - `extra(t)` (opcional): los detalles de MUI (botones, tablas, pestañas, títulos…).
     Llama a `inputs()` para que los campos tengan un borde visible y añade
     `MuiCssBaseline: { styleOverrides: workingCss(t) }` (foco visible y
     `prefers-reduced-motion`).
   - Si es **oscuro**, añade el slug a `DARK_STYLES` en `crm/src/site/siteConfig.ts` y
     a `SiteConfig.DARK_STYLES` en `api/api/models.py` (el icono de la app instalada
     y su color de barra salen de ahí). Los tonos oscuros (`darkTones`) y la paleta
     oscura de MUI (`darkBase`) ya se aplican solos.
   - Revísalo en `/`, `/bookings` (calendario), `/clients` (y su ventana «Dar de alta»),
   `/ajustes` → Aspecto y `/login`, en escritorio y en móvil.

5. **Ilustraciones de la portada** (opcional): cada estilo tiene su tratamiento en
   `web/src/lib/hero-art.ts` (`styleScene`). Un estilo sin caso propio se dibuja como
   `natural`. Si lo añades, copia el archivo a `crm/src/components/setup/hero-art.ts`
   (debajo de su cabecera de 3 líneas): la CI comprueba que las dos copias son iguales.
   Para revisar las 6 posturas en todos los estilos, renderiza `renderHeroArt()` para
   cada combinación en una página y mírala en escritorio y en móvil.

Para probarlo en local:

```bash
cd api && uv run python manage.py shell -c "from api.models import SiteConfig as S; c=S.load(); c.style_preset='sunset'; c.save()"
```

La web cachea la config unos 60 s: espera o reinicia el servidor web. Revisa la
portada, el horario (`/calendar`), el checkout, el login y el área de la clienta
(`/dashboard`), en escritorio y en móvil.

## Tokens disponibles

Todos se definen en el bloque de `natural` (que también es `:root`). Un estilo solo
redefine los que cambian. Se usan como `var(--token)` en las props de Chakra, en
`style` o en CSS.

### Página y texto

| Token | Para qué |
|---|---|
| `--page-bg` | Fondo de la página (`body`). |
| `--page-bg-alt` | Fondo alterno de algunas secciones (`.white-gradient`). Color. |
| `--page-pattern` | Capa decorativa sobre el fondo (rejilla, lunares…) o `none`. Lleva tamaños: úsalo solo en `background`. |
| `--section-bg` | Fondo de las secciones destacadas (degradado de marca). Solo en `background`. |
| `--deep-bg` / `--deep-text` / `--deep-muted` / `--deep-border` | Zonas profundas (footer, bloque de contacto, bandas): fondo, texto, texto secundario y bordes. |
| `--page-text` | Texto principal. |
| `--text-muted` / `--text-subtle` | Texto secundario / terciario (placeholders, metadatos). |
| `--heading-color` | Color de los títulos. |
| `--accent` | Primario para iconos y decoración. |
| `--accent-text` | Primario como texto pequeño, siempre legible. |
| `--accent-soft` / `--accent-border` | Fondo tintado y borde con el primario (píldoras, seleccionado). |
| `--border-neutral` | Separadores y bordes neutros. |

### Superficies

| Token | Para qué |
|---|---|
| `--surface` | Tarjetas sobre la página. |
| `--surface-strong` | Superficies destacadas: diálogos, menús, barras fijas. También es el `bg.panel` de Chakra. |
| `--surface-muted` | Rellenos suaves: filas, chips, zonas de input. |
| `--surface-text` | Texto sobre una superficie. |
| `--surface-border` | Borde de tarjetas. Se usa con `--border-width`. |
| `--surface-blur` | Valor de `backdrop-filter`: `none` o `blur(…)`. |
| `--overlay` | Fondo oscurecido detrás de los diálogos. |
| `--input-bg` / `--input-border` | Campos de formulario. |

### Forma, sombras y movimiento

| Token | Para qué |
|---|---|
| `--border-width` | Grosor del borde de tarjetas (1 px; 2.5 px en brutalista). |
| `--radius-card` / `--radius-card-lg` | Esquinas de tarjetas / de imágenes y paneles grandes. |
| `--radius-button` / `--radius-input` / `--radius-chip` | Esquinas de botones, campos y píldoras. |
| `--shadow-card` / `--shadow-hover` / `--shadow-float` | Sombra de tarjeta, al pasar el ratón y de elementos flotantes (diálogos, menús). |
| `--hover-lift` | `transform` de una tarjeta al pasar el ratón. |

### Botones

| Token | Para qué |
|---|---|
| `--button-bg` / `--button-text` / `--button-border` / `--button-shadow` | Botón principal. `--button-bg` puede ser un degradado. |
| `--button-hover-bg` / `--button-hover-text` / `--button-hover-shadow` / `--button-hover-transform` | Su estado hover. |
| `--button-text-transform` / `--button-spacing` / `--button-weight` | Letra del botón. |
| `--button-ghost-bg` / `--button-ghost-text` / `--button-ghost-border` / `--button-ghost-hover-bg` / `--button-ghost-decoration` | Botón secundario (contorno o subrayado). |

### Tipografía y secciones

| Token | Para qué |
|---|---|
| `--heading-weight` / `--heading-transform` / `--heading-spacing` | Peso, mayúsculas y espaciado de `h1`/`h2`. La familia viene del panel (`--font-heading`). |
| `--heading-shadow` | Resplandor de los títulos de sección (neón) o `none`. |
| `--title-decor` | Forma decorativa detrás del título de sección (halo orgánico) o `none`. |
| `--eyebrow-bg` / `--eyebrow-text` / `--eyebrow-border` / `--eyebrow-font` / `--eyebrow-transform` / `--eyebrow-spacing` / `--eyebrow-shadow` / `--eyebrow-rotate` | La etiqueta pequeña sobre los títulos. |
| `--font-mono` | Fuente monoespaciada para detalles. |
| `--logo-default-display` / `--logo-light-display` | Qué logo se ve sobre superficies normales (`inline`/`none`). Los estilos oscuros muestran el claro (`logo_light_url`). |
| `--section-divider` | Borde superior entre secciones (`border-top`). |
| `--section-band` | Fondo de la banda diagonal entre secciones (energy) o `none`. |

### Estados

`--success`, `--warning` y `--danger` son el color del texto o del icono.
`--success-soft`, `--warning-soft` y `--danger-soft` son su fondo tenue.

## Clases utilitarias (para componentes)

Están al final de `presets.css` y aplican los tokens de golpe. Llevan `:root` delante
para ganar a las props de Chakra. Para una variante concreta (p. ej. la tarjeta
recomendada con borde primario), usa `style={{ … }}` en línea.

| Clase | Uso |
|---|---|
| `.sk-card` | Tarjeta. |
| `.sk-panel` | Diálogo, menú o barra fija. |
| `.sk-chip` | Píldora neutra. |
| `.sk-eyebrow` | Etiqueta sobre un título. |
| `.sk-section-title` | Título principal de una sección. |
| `.sk-section` | `<section>` de la portada (separadores y bandas). |
| `.sk-btn` / `.sk-btn-ghost` | Botón principal / secundario sobre la página o una tarjeta. **No** van sobre fotos: el hero usa siempre relleno primario. |
| `.sk-input` | Campos de formulario propios. |
| `.sk-deep` | Zona profunda. |

Los componentes de Chakra (Dialog, Input, Toast…) ya siguen los tokens:
`presets.css` redirige sus variables semánticas (`--chakra-colors-bg-panel`,
`--chakra-colors-fg`, `--chakra-colors-border`…) a los tokens.

## Iconos

`web/src/components/ui/Icon.tsx`: `<Icon name="calendar" size={14} color="var(--accent)" />`.
Cada nombre semántico tiene tres variantes, una por familia. Para añadir un icono,
añade una entrada en `ICONS` con sus tres componentes de `react-icons`:

- `lu`: Lucide;
- `pi`: Phosphor, variante `…Duotone`;
- `fa`: FontAwesome.

Comprueba antes que los tres nombres existen en `node_modules/react-icons/{lu,pi,fa}/index.d.ts`.
No importes `react-icons` directamente en los componentes.

## El panel con el estilo de la web

En **Ajustes → Aspecto** (y en el paso «Tu estilo» del asistente) hay un interruptor
**«Panel con el estilo de mi web»**, encendido por defecto. Se guarda al momento
(`SiteConfig.panel_follows_style`, migración `0005_panel_follows_style`) y el panel
cambia sin recargar: `SiteProvider.refresh()` vuelve a pedir la config pública, que lo
incluye en `theme.panel_follows_style` (el panel lo necesita ya en la pantalla de
entrada, antes de iniciar sesión). Al lado se ve una maqueta pequeña del panel con lo
que hay elegido en la pantalla, aunque aún no se haya guardado.

- **Encendido**: el panel usa el estilo (`theme.style`) y los iconos (`theme.icons`).
- **Apagado**: el aspecto clásico del panel (el de `natural`) con los colores y la letra
  del estudio y sus iconos de siempre. Es exactamente el panel de antes.

Todo vive en `crm/src/theme.ts` (`buildTheme`, `panelLook`, `LOOKS`). En `<html>`
quedan `data-panel-style="…"` y `data-panel-mode="light|dark"` por si una pantalla
necesita un detalle propio.

### Cómo se traduce cada estilo al panel

| Estilo | En el panel |
|---|---|
| `natural` | El aspecto clásico, idéntico al de siempre: cristal suave, esquinas muy redondeadas, botón principal con degradado. Es la referencia: no se toca. |
| `minimal` | Plano y aireado: blanco, bordes finos, sin sombras ni degradados, esquinas pequeñas (8–12 px), títulos finos, más aire en tablas y ventanas. |
| `editorial` | Esquinas rectas y líneas finas entre zonas, títulos con serifa ligeros y grandes, botones en mayúsculas espaciadas (el principal relleno con el oscuro de la marca), cabeceras de tabla con una línea. |
| `glass` | Cristal translúcido con blur y brillo interior en el borde sobre un degradado suave del primario y el secundario. Si el navegador no tiene `backdrop-filter`, las superficies pasan a ser casi opacas. |
| `brutalist` | Bordes oscuros gruesos (2 px), sombras duras desplazadas, esquinas casi rectas, botones que «se hunden» al pasar el ratón, cabeceras de tabla en mono sobre un bloque de color. |
| `energy` | **Oscuro**. Casi negro, títulos en mayúsculas y compactos, botón principal con degradado del primario, banda de color (primario → secundario) bajo la barra superior y en las pestañas. |
| `pop` | Más redondo y alegre pero contenido: bordes de 2 px tintados, sombras de color, botones píldora con «suelo» oscuro, lunares muy suaves en el fondo. |
| `neon` | **Oscuro**. Azul-negro con rejilla muy tenue, bordes con el primario y brillo **solo en los acentos** (botón principal, campo con el foco, pestaña activa, bordes de tarjeta). Nunca en el texto. Sin animaciones. |

En todos los estilos salvo `natural` el panel garantiza contraste AA: el primario
como texto (`--studio-primary-text`) se oscurece (o aclara, en oscuro) hasta 4,5:1, el
botón principal usa `--studio-primary-fill` con `--studio-on-primary` encima (si el
primario no llega a 4,5:1 ni con blanco ni con el oscuro, se usa su versión
legible), los estados (avisos, chips) usan tonos más fuertes, los campos tienen un
borde de al menos 3:1 y el foco se ve siempre. Con `prefers-reduced-motion` se quitan
transiciones y desplazamientos.

### Estilos oscuros en el panel

`energy` y `neon` ponen MUI en modo oscuro (`palette.mode = 'dark'`) y
`color-scheme: dark` (los selectores de fecha y hora del navegador también salen
oscuros). Como en la web:

- El fondo es el del estudio si ya es oscuro; si no, una versión casi negra teñida de él.
- El texto es claro y fijo; `--studio-dark` (que en el panel es «el color del texto
  principal») pasa a ser ese texto claro, y las variables `--studio-text-*`,
  `--studio-bg*` y los tonos fuertes del primario (`-shade`, `-dark`, `-deep`) se
  calculan para fondo oscuro. Así las pantallas que ya usaban las variables se ven
  bien sin tocarlas.
- La barra superior y el menú lateral usan el oscuro del estudio (zona profunda).
- El color de la barra del móvil (`meta theme-color`) y el manifiesto de la app
  instalada (`/panel.webmanifest`: `background_color` y `theme_color`) usan el fondo
  oscuro (`api/api/views_site.py → panel_theme_colors`).
- Lo que debe seguir siendo claro (la hoja del horario para imprimir) lleva
  `className="studio-light"`: dentro, las variables `--studio-*` vuelven a las claras.

### Variables CSS para lo que no es de MUI

Además de las de color (ver cabecera de `crm/src/theme.ts`), cada estilo publica su forma:

| Variable | Para qué |
|---|---|
| `--studio-radius` / `--studio-radius-sm` / `--studio-radius-chip` | Esquinas de tarjeta / botón / píldora. |
| `--studio-border-width` / `--studio-border` | Grosor y borde completo de las tarjetas. |
| `--studio-surface` / `--studio-surface-strong` | Fondo de tarjeta / de diálogo. |
| `--studio-surface-rgb` | Canales de la superficie (blanco en claro, gris oscuro en oscuro): úsalo en lugar de `rgba(255,255,255,…)` → `rgb(var(--studio-surface-rgb) / 0.8)`. |
| `--studio-shadow` / `--studio-shadow-float` / `--studio-shadow-rgb` | Sombra de tarjeta, de lo flotante y su color (negro en oscuro): `0 6px 20px rgb(var(--studio-shadow-rgb) / 0.12)`. |
| `--studio-blur` | `backdrop-filter` de las superficies (`none` si el estilo no tiene cristal). |
| `--studio-primary-text` / `--studio-primary-fill` / `--studio-on-primary` | Primario como texto legible / relleno de botón / texto encima. |
| `--studio-danger-text` / `--studio-success-text` / `--studio-warning-text` | Textos de estado escritos a mano: `var(--studio-danger-text, #A0473A)` (el segundo valor es el de natural). |

El calendario (`crm/src/calendar.css`) usa estas variables y sus `--cal-*`; cada
estilo redefine las que cambian (esquinas, bordes, sombras) desde
`cssVariables()` en `theme.ts`, y `calendarCss()` corrige los grises fijos del CSS de
react-big-calendar en los estilos «de trabajo».

### Iconos del panel

`crm/src/site/StudioIcon.tsx`: `<StudioIcon name="home" />` (acepta las props de
`SvgIcon`). Cada nombre tiene cuatro variantes de `@mui/icons-material`:

| Iconos de la web | En el panel |
|---|---|
| `line` (línea fina) | variante `…Outlined` |
| `soft` (suaves) | variante `…Rounded` |
| `solid` (rellenos) | variante normal (rellena) |
| panel sin el estilo de la web | los iconos de siempre |

En los iconos de círculo (`Help`, `Error`, `AddCircle`) la variante `Outlined` de MUI
es rellena: para la línea fina se usan `…Outline` / `…OutlineRounded`.

Ya lo usan el menú lateral, la barra de abajo del móvil, la barra superior (Ayuda),
las cabeceras y guías de cada pantalla (`PageIntro`, `HelpTip`, `EmptyState`), Inicio
(accesos rápidos y acciones principales), la pantalla de error y el final del
asistente. **Pendiente**: el resto de pantallas (botones dentro de listas, diálogos
concretos, Ajustes…) siguen importando sus iconos de MUI directamente; para pasarlos,
añade el nombre a `ICONS` y cambia `<XIcon />` por `<StudioIcon name="x" />`.
