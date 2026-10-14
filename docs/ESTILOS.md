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

## Cómo añadir un estilo nuevo (3 pasos)

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

3. **Panel (CRM)**: añade su ficha (nombre, descripción y vista previa) en
   `crm/src/components/setup/presets.ts`.

Para probarlo en local:

```bash
cd api && .venv/bin/python manage.py shell -c "from api.models import SiteConfig as S; c=S.load(); c.style_preset='sunset'; c.save()"
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
