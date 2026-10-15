# Estilos visuales de la web

Cada estudio elige en el panel (**Ajustes → Aspecto**) dos cosas:

- **Estilo** (`theme.style`): el *acabado* de la web. Cambia superficies, esquinas,
  sombras, botones, títulos y fondos. **No** cambia la estructura: siempre son las
  mismas secciones, en el mismo orden y con el mismo layout.
- **Iconos** (`theme.icons`): `line` (Lucide, línea fina, por defecto), `soft`
  (Phosphor Duotone, redondeados) o `solid` (FontAwesome, rellenos). Los logos de
  marcas (WhatsApp, Instagram…) son siempre los de FontAwesome.

Los colores y las tipografías también salen del panel. Cada estilo trae **10 paletas**
y **3 parejas de letra** probadas (ver [Paletas y letra](#paletas-y-letra-fuente-única)),
o el estudio pone las suyas. La fuente la decide el panel y el estilo solo pone el
peso, las mayúsculas y el espaciado.

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

## Paletas y letra (fuente única)

Las paletas y las parejas de letra viven en **un solo sitio**, `design/tokens/`, y de
ahí salen para el API, el panel y la web:

| Archivo | Qué es |
|---|---|
| `design/tokens/tokens.py` | Las definiciones: por estilo, 10 paletas (primario, secundario, tinta, fondo y superficie) y 3 parejas de letra (títulos, texto, peso). **Se edita aquí.** |
| `design/tokens/derive.py` | La matemática: deriva de cada paleta todos los tonos (texto atenuado, bordes, menú lateral, estados, tintes de las clases…), corrige el primario si no se lee y mide el contraste. |
| `design/tokens/palettes.json` | Generado, legible y con la tabla de contraste de cada paleta. |
| `api/api/design/palettes.json` + `api/api/design/derive.py` | Copias para el API (Docker solo ve `api/`). |
| `crm/src/design/palettes.json` | Copia compacta para el panel (la importa `crm/src/design/tokens.ts`). |
| `web/src/design/palettes.json` | Copia compacta para la web (la importa `web/src/lib/site.ts`). |
| `crm/src/design/derive.ts` | Port 1:1 de `derive.py` (para los colores propios, en el navegador). |

Las copias son archivos normales del repo (se versionan): así funcionan igual con
`pnpm dev`, `pnpm build`, `astro build` y los `Dockerfile` (cada uno solo ve su
carpeta). **Nunca se editan a mano.** Después de tocar una paleta:

```bash
python3 design/tokens/tokens.py            # regenera el JSON y las 3 copias (+ derive.py del API)
python3 design/tokens/tokens.py --check    # contraste de las 80 paletas + copias al día (sale con 1 si algo falla)
python3 design/tokens/tokens.py --report   # tabla con el contraste mínimo de cada paleta
node design/tokens/check_ts.mjs            # derive.ts da exactamente los mismos colores que derive.py
```

Además, `api/api/tests/test_palettes.py` re-deriva las 80 paletas en los tests del
API: si alguien cambia una copia a mano o rompe el contraste, los tests fallan.

### La comprobación de contraste

Una paleta solo se publica si pasa **todas** estas parejas (WCAG AA):

- **Texto ≥ 4,5:1**: tinta sobre fondo, superficie y superficie 2; texto atenuado
  sobre las tres; texto del botón sobre el primario; enlaces (primario como texto)
  sobre fondo, superficie y su tinte; texto, texto atenuado, activo y hover del menú
  lateral; tinta sobre los 5 tintes de las clases; los 4 estados sobre su fondo suave
  y sobre la superficie.
- **Interfaz ≥ 3:1**: primario contra el fondo y la superficie (en brutalista, el
  borde de tinta), borde de los campos contra superficie y fondo, secundario,
  color de los gráficos y punto de color de cada clase.

Si el primario no llega, `derive.py` lo oscurece (o lo aclara, en los estilos
oscuros) lo justo y lo apunta en el informe.

### Lo que guarda el estudio

`SiteConfig.palette` (slug de una paleta **de su estilo**, `''` = colores propios) y
`SiteConfig.font_pair` (`''` = letra propia), migración `0008`. Los `color_*` y
`font_*` de siempre siguen siendo los valores **efectivos** que leen la web y el
panel: elegir una paleta escribe sus colores ahí (en los estilos oscuros, `dark` =
lo más profundo y `background` = la superficie, como espera la web). La regla vive en
`api/api/utils/palettes.py → resolve_theme()` (y su espejo en
`crm/src/design/tokens.ts → pickStyle / pickPalette / pickCustomColors`):

- Paleta elegida → se guardan sus colores (gana a los colores que vengan).
- Colores propios → se corrigen para que se lean (`fix_custom`: primario ≥ 3:1
  contra el fondo y texto encima legible, tinta ≥ 7:1, fondo claro u oscuro según el
  estilo), **solo si cambian**: un estudio que guarda otra cosa conserva los suyos.
- Cambio de estilo sin paleta → la misma paleta si existe en el nuevo estilo; si no,
  la primera. Igual con la letra.
- La config pública expone `theme.palette` y `theme.font_pair`.
- La migración marca la paleta de un estudio existente solo si sus 4 colores
  coinciden **exactamente** con los que escribiría una paleta de su estilo; si no,
  quedan como propios. Nunca cambia sus colores.

### En la web

`web/src/lib/site.ts → themeCss()` sigue publicando los `--brand-*` de los 4
colores efectivos. Si el estudio eligió una paleta, añade sus tonos comprobados
`--pal-ink`, `--pal-muted`, `--pal-accent` y su `--on-primary`, y
`presets.css` los usa antes que sus mezclas (`var(--pal-muted, color-mix(…))`). Con
colores propios no existen y la web se ve exactamente como antes.

### En el panel

`crm/src/theme.ts` genera el tema de MUI desde los tokens (ver [El panel con el
estilo de la web](#el-panel-con-el-estilo-de-la-web)). Los colores de los tipos de
clase para el calendario: `crm/src/design/classColors.ts`
(`classTypeColor(tokens, id)` o el hook `useClassTypeColor()`).

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

3. **Paletas y letra**: añade el estilo a `STYLE_MODES` en `design/tokens/derive.py`
   (y en `crm/src/design/derive.ts`), y sus 10 paletas y 3 parejas de letra a
   `STYLES` / `FONTS` en `design/tokens/tokens.py`. Ejecuta
   `python3 design/tokens/tokens.py` (y `--check`). El selector del panel lo saca
   solo del JSON; añade también el slug a `STYLE_IDS` en `crm/src/site/siteConfig.ts`
   (y su ficha en `crm/src/components/setup/presets.ts`, que usa la portada).

4. **El panel con ese estilo**: añade su entrada a `STRUCTS` en `crm/src/theme.ts`
   (TypeScript no compila hasta que la tiene): esquinas (`r.xl` diálogos y menú,
   `r.lg` tarjetas, `r.md` campos, `r.sm` chips, `r.btn` botones), borde y fondo de
   las tarjetas, sombras (`sh1` tarjeta, `sh2` flotante), sombra del botón, brillo,
   mayúsculas de los títulos y fondo de la página. Los colores salen solos de los
   tokens. Si necesita detalles propios de MUI, añádelos en `buildTheme()` igual que
   `brutal` / `neon`.
   - Si es **oscuro**, en `derive.py`/`derive.ts` su modo es `'dark'`; añade el slug a
     `DARK_STYLES` en `crm/src/site/siteConfig.ts` y a `SiteConfig.DARK_STYLES` en
     `api/api/models.py` (el icono de la app instalada y su color de barra salen de ahí).
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

El panel sigue el estilo, la paleta, la letra y los iconos de la web (rediseño,
fase 1). En **Ajustes → Aspecto** (y en el paso «Tu estilo» del asistente y de la
guía) está el selector nuevo: tarjetas de estilo con miniatura, las 10 paletas del
estilo + «Mis colores» (color de marca, del logo o los 4 a mano, corregidos para que
se lean), las 3 parejas de letra (+ otra de Google Fonts), los iconos y una vista
previa en directo de la portada de la web y del panel.

El interruptor **«Panel con el estilo de mi web»** (`SiteConfig.panel_follows_style`)
sigue ahí: apagado, el panel se ve con su **aspecto clásico** (claro, cristal blanco
suave, barra lateral clara) con los colores del estudio.

Todo vive en `crm/src/theme.ts`:

- `panelLook(config)` → estilo, si es clásico, modo claro/oscuro y tipo de barra lateral.
- `panelPalette(config)` → los tokens de color: los de la paleta elegida o, con
  colores propios, `fixCustom()` (misma corrección que el API).
- `STRUCTS` → la forma de cada estilo (la del prototipo aprobado).
- `buildTheme(config)` → el tema de MUI (paleta, tipografía con la pareja del
  estudio y su peso de títulos, esquinas, sombras, bordes y los `styleOverrides` de
  cada estilo) y las variables CSS.

Las fuentes se cargan bajo demanda: solo las dos del estudio
(`crm/src/site/fonts.ts → loadStudioFonts`), y en el selector las 3 parejas del estilo
que se está viendo. En `<html>` quedan `data-panel-style`, `data-panel-mode`,
`data-panel-side` y `data-panel-classic` (si es el aspecto clásico).

### Cómo se traduce cada estilo al panel

| Estilo | En el panel |
|---|---|
| `natural` | Tarjetas crema sin borde con sombra suave, esquinas muy redondeadas (22–28 px), botones píldora, menú lateral oscuro teñido del primario. |
| `minimal` | Plano y limpio: bordes finos, sin sombras, esquinas pequeñas (10–16 px), menú lateral claro con borde. |
| `editorial` | Casi recto (3–6 px), líneas finas, títulos con serifa de la pareja y etiquetas muy espaciadas, menú lateral claro. |
| `glass` | Cristal translúcido con `backdrop-filter` sobre un degradado del primario y el secundario, menú lateral esmerilado. Sin `backdrop-filter` (o con `prefers-reduced-transparency`) las superficies pasan a ser opacas. |
| `brutalist` | Esquinas rectas, bordes de tinta de 2 px, sombras duras (4 px / 8 px), botones con sombra que «se hunden», menú negro con el activo del color primario. |
| `energy` | **Oscuro**, títulos en mayúsculas, esquinas medias (8–14 px), menú del modo oscuro. |
| `pop` | Muy redondo (26–32 px), sombras teñidas del primario, botones píldora, menú oscuro teñido. |
| `neon` | **Oscuro**, brillo del primario solo en los acentos (botón principal, menú activo, pestaña), menú del modo oscuro. |

Todas las paletas pasan la comprobación de contraste; con colores propios el panel
usa los mismos tokens corregidos. El foco se ve siempre (contorno con el primario
legible) y con `prefers-reduced-motion` se quitan transiciones.

### El armazón (menú, barra superior, móvil)

`crm/src/components/MainLayout.tsx` + `crm/src/components/shell/`:

- **Menú lateral** (≥ 1024 px): tarjeta redondeada con los colores `--studio-side-*`
  de la paleta (oscura en natural/brutalista/pop, clara en minimal/editorial,
  esmerilada en glass, superficie oscura en energy/neón); logo y nombre del estudio;
  grupos **Día a día** (Hoy, Calendario, Reservas, Clientas) y **Negocio** (Ventas,
  Mi web) y **Ajustes** abajo; «Puesta en marcha» arriba mientras la web no está
  publicada; tarjeta de la persona con el botón **A/A** (tamaño del texto, guardado
  por persona en `localStorage`).
- **Barra superior**: buscador **⌘K / Ctrl+K** (`shell/CommandPalette.tsx`: ir a
  cualquier pantalla, acciones rápidas y buscar clientas en el API; flechas, Intro y
  Esc), «Ver como clienta» (abre la web), «?» (ayuda de la pantalla, buscador, guía,
  instalar; la visita guiada se registra con `registerTour()` en la fase 2) y
  **+ Nuevo** (Reserva, Clienta, Clase, Bono).
- **Móvil** (< 1024 px): barra de abajo (Hoy, Calendario, Reservas, Clientas, Más) y
  «+» arriba.
- **Mapa de secciones**: `shell/navigation.ts`. Ventas, Mi web y Ajustes son páginas
  índice (`crm/src/pages/SectionHub.tsx`, rutas `/ventas`, `/mi-web`,
  `/configuracion`) que enlazan todas las pantallas de siempre.
- **Punto de extensión** para otras distribuciones: `shell/extensions.tsx`
  (`useShellExtensions()` devuelve enlaces extra de Ajustes y un aviso encima de cada
  pantalla). Se sustituye ese archivo, no `MainLayout`.

### Estilos oscuros en el panel

`energy` y `neon` ponen MUI en modo oscuro y `color-scheme: dark`. El color de la
barra del móvil (`meta theme-color`) es el fondo de la paleta y el manifiesto de la
app instalada sigue saliendo de `api/api/views_site.py → panel_theme_colors`. Lo que
debe seguir siendo claro (la hoja del horario para imprimir) lleva
`className="studio-light"`: dentro, las variables `--studio-*` vuelven a las claras.

### Variables CSS para lo que no es de MUI

La lista completa está en la cabecera de `crm/src/theme.ts`. Las de siempre
(`--studio-primary`, `--studio-dark` = texto principal, `--studio-text-*`,
`--studio-bg*`, `--studio-surface-rgb`, `--studio-shadow-rgb`, `--studio-radius*`,
`--studio-border`, `--studio-primary-text` / `-fill`, `--studio-on-primary`,
`--studio-danger-text`…) siguen existiendo, ahora calculadas desde los tokens. Las
nuevas son las de los tokens: `--studio-ink`, `--studio-muted`, `--studio-surf`,
`--studio-surf2`, `--studio-p-soft`, `--studio-border-color`,
`--studio-border-strong`, `--studio-side-*`, `--studio-ok|warn|bad|info(-soft)`,
`--studio-c-<clase>` / `--studio-c-<clase>-dot`, `--studio-radius-xl|lg|md|btn`,
`--studio-shadow-1|2`, `--studio-card-bg`, `--studio-card-border`,
`--studio-btn-shadow`, `--studio-glow`, `--studio-heading-weight|transform`.
El calendario (`crm/src/calendar.css`) usa sus `--cal-*`, que también se calculan
desde los tokens.

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
