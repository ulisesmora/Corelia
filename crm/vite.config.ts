import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'path';

// Identificador de este despliegue: el commit (Railway o GIT_COMMIT_SHA), o la
// hora del build en local
const APP_VERSION = process.env.RAILWAY_GIT_COMMIT_SHA || process.env.GIT_COMMIT_SHA || `local-${Date.now()}`;

// Publica /version.json con ese identificador: el panel lo consulta (AppUpdater)
// para saber si hay una versión más nueva que la que tiene abierta
function appVersionFile(): Plugin {
  return {
    name: 'app-version-file',
    apply: 'build',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ version: APP_VERSION }) });
    },
  };
}

// API de Django en local. En producción el panel lo sirve el propio backend
// (mismo dominio), así que las peticiones van a '/api/' sin más.
const DEV_API_TARGET = process.env.DEV_API_TARGET || 'http://localhost:8000';

// https://vite.dev/config/
export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(APP_VERSION),
  },
  plugins: [react(), appVersionFile()],
  server: {
    // En `pnpm dev` el panel usa también rutas relativas: Vite reenvía /api y
    // /media al backend local, sin CORS ni variables de entorno
    proxy: {
      '/api': { target: DEV_API_TARGET, changeOrigin: true },
      '/media': { target: DEV_API_TARGET, changeOrigin: true },
      '/panel.webmanifest': { target: DEV_API_TARGET, changeOrigin: true },
    },
  },
  build: {
    // Sin source maps publicados: el código del panel no se expone tal cual
    sourcemap: false,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  base: '/',
});
