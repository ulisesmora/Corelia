// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';

// Adaptador según dónde se despliega: en Vercel (variable VERCEL, que pone su
// build) funciones serverless; en cualquier otro sitio (Docker, Railway, VPS…)
// servidor Node autónomo: `node ./dist/server/entry.mjs` (HOST y PORT por env).
// En los dos casos el proxy /api/* reenvía al backend de API_URL.
const ON_VERCEL = !!process.env.VERCEL;
const adapter = ON_VERCEL
  ? (await import('@astrojs/vercel')).default()
  : (await import('@astrojs/node')).default({ mode: 'standalone' });

// Dominio público de la web por defecto. En tiempo de ejecución manda el
// `site_url` de la config del estudio (dominio propio del panel) y después
// PUBLIC_SITE_URL (src/config.ts → siteOrigin), así que no hace falta
// reconstruir para cambiar de dominio.
const SITE_URL = (process.env.PUBLIC_SITE_URL || process.env.SITE_URL || 'http://localhost:4321').replace(/\/+$/, '');

// https://astro.build/config
export default defineConfig({
  site: SITE_URL,
  // 'ignore': el proxy /api/* necesita la barra final que exige Django
  // (con 'never' Astro redirigía /api/v1/plans/ → /api/v1/plans).
  trailingSlash: 'ignore',
  // Todo se renderiza en servidor: la marca (nombre, colores, fuentes, logo)
  // sale de la configuración del estudio en cada petición, y el build NO
  // necesita el backend encendido.
  output: 'server',
  compressHTML: true,

  security: {
    // El proxy /api/* reenvía formularios multipart (fotos) al backend, que se
    // autentica con JWT en la cabecera Authorization (sin cookies de sesión).
    // Detrás de un proxy HTTPS (Railway, Docker…) el origen que ve Node no
    // coincide con el del navegador y la comprobación bloqueaba esos envíos.
    checkOrigin: false,
  },

  // PERF: prefetch interno habilitado para que las páginas internas (login, dashboard,
  // checkout) se pre-bajen cuando el usuario hace hover/touch en un link. Reduce el
  // TTFB percibido entre páginas sin coste extra de CPU en la página actual.
  prefetch: {
    prefetchAll: false,
    defaultStrategy: 'hover',
  },

  build: {
    inlineStylesheets: 'auto',
    assets: '_astro',
  },

  // PERF: pipeline de imágenes con sharp — produce WebP/AVIF y srcset automáticamente
  // cuando se usa <Image /> de astro:assets en lugar de <img>.
  image: {
    service: { entrypoint: 'astro/assets/services/sharp' },
  },

  vite: {
    optimizeDeps: {
      // PERF: dejar que Vite pre-bundle todo por defecto. NO usar `exclude` con
      // libs que tienen deps CommonJS (Stripe usa prop-types CJS) — al excluirlas
      // se rompe el interop default/named export en dev/HMR.
      // Incluimos explícitamente las libs grandes para tenerlas pre-bundleadas
      // desde el primer start y evitar re-optimizes en caliente (causa 504s).
      include: [
        'react',
        'react-dom',
        'react-dom/client',
        '@stripe/stripe-js',
        '@stripe/react-stripe-js',
        'date-fns',
        'dayjs',
        'dayjs/plugin/utc',
        'dayjs/plugin/timezone',
        'react-big-calendar',
        'react-day-picker',
        '@chakra-ui/react',
        'framer-motion',
      ],
      // Evita re-optimizes innecesarios que disparan 504s en módulos en vuelo.
      force: false,
    },
    server: {
      watch: {
        ignored: ['**/node_modules/**', '**/dist/**'],
      },
    },
    build: {
      // PERF: target moderno → menos polyfills, JS más chico y rápido de parsear.
      // iOS 15+ y Chrome 90+ soportan es2022 nativamente (95%+ de tráfico móvil).
      target: 'es2022',
      cssMinify: 'esbuild',
      minify: 'esbuild',
      // PERF: separar el CSS por chunk para que solo se cargue lo necesario por ruta.
      cssCodeSplit: true,
      chunkSizeWarningLimit: 1024,
      rollupOptions: {
        output: {
          manualChunks: {
            // PERF: chunks granulares. El browser los puede cachear independientemente
            // y descargar solo lo que cada ruta usa (Stripe/Firebase/Framer… no se
            // cargan en la portada si no se usan).
            'react-vendor':  ['react', 'react-dom'],
            'chakra':        ['@chakra-ui/react', '@emotion/react', '@emotion/styled'],
            'framer':        ['framer-motion'],
            'icons':         ['react-icons'],
            'stripe':        ['@stripe/stripe-js', '@stripe/react-stripe-js'],
            'calendar':      ['react-big-calendar', 'date-fns'],
            'day-picker':    ['react-day-picker'],
            'phone-input':   ['react-international-phone'],
            'dayjs':         ['dayjs'],
          },
        },
      },
    },
  },

  // El sitemap se genera en vivo (src/pages/sitemap-*.xml.ts) con el dominio y
  // las clases reales, en lugar de fijarlo en el build.
  integrations: [react()],

  adapter,
});
