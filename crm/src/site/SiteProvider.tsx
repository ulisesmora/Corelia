import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { API_BASE_URL } from '../config';
import { authHeaders } from '../utils/auth';
import { loadStudioFonts } from './fonts';
import { setStudioTz } from './timezone';
import { setStudioMoney } from './money';
import { DEFAULT_SITE_CONFIG, fetchPublicSiteConfig, type SiteConfigPublic } from './siteConfig';
import { panelLook, panelThemeColor } from '../theme';

// Proveedor de la configuración del estudio para todo el panel.
// Los tipos y la descarga están en ./siteConfig.
export type { SiteConfigPublic, SiteContact, SiteThemeConfig } from './siteConfig';

// La web pública (`web_url`) solo viene en la config de administración: se
// pide una vez, cuando alguna pantalla la necesita y hay sesión iniciada.
let webUrlRequest: Promise<string> | null = null;
function fetchAdminWebUrl(): Promise<string> {
  if (!webUrlRequest) {
    webUrlRequest = fetch(`${API_BASE_URL}v1/site-config/`, { headers: authHeaders() })
      .then((r): Promise<{ web_url?: unknown }> => (r.ok ? r.json() : Promise.resolve({})))
      .then((d) => (typeof d.web_url === 'string' ? d.web_url.replace(/\/+$/, '') : ''))
      .catch(() => '')
      .then((url) => {
        if (!url) webUrlRequest = null; // se reintenta la próxima vez
        return url;
      });
  }
  return webUrlRequest;
}

interface SiteContextValue {
  config: SiteConfigPublic;
  /** true mientras se recarga la configuración */
  loading: boolean;
  /** Vuelve a descargar la configuración (p. ej. tras guardar los ajustes) */
  refresh: () => Promise<SiteConfigPublic>;
  /** Web pública del estudio sin barra final ('' si aún no se conoce) */
  webUrl: string;
  /** Pide la web pública a la config de administración (lo usa useStudioWebUrl) */
  ensureWebUrl: () => void;
}

const SiteContext = createContext<SiteContextValue>({
  config: DEFAULT_SITE_CONFIG,
  loading: false,
  refresh: async () => DEFAULT_SITE_CONFIG,
  webUrl: '',
  ensureWebUrl: () => {},
});

function setFavicon(href: string) {
  let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
  }
  if (link.getAttribute('href') !== href) link.href = href;
}

function setMeta(name: string, content: string) {
  const meta = document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
  if (meta) meta.content = content;
}

interface SiteProviderProps {
  children: ReactNode;
  /** Configuración ya descargada al arrancar (main.tsx), para no pedirla dos veces */
  initialConfig?: SiteConfigPublic;
}

export function SiteProvider({ children, initialConfig }: SiteProviderProps) {
  const [config, setConfig] = useState<SiteConfigPublic>(initialConfig || DEFAULT_SITE_CONFIG);
  const [loading, setLoading] = useState(!initialConfig);
  const [adminWebUrl, setAdminWebUrl] = useState('');
  const mounted = useRef(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const next = await fetchPublicSiteConfig();
    // Antes de pintar: los formateadores fuera de React (money()) ya ven la nueva moneda
    setStudioMoney(next.currency, next.country, next.drop_in_price);
    if (mounted.current) {
      setConfig(next);
      setLoading(false);
    }
    // La web puede haber cambiado en los ajustes
    webUrlRequest = null;
    return next;
  }, []);

  useEffect(() => {
    mounted.current = true;
    if (!initialConfig) refresh();
    return () => { mounted.current = false; };
  }, [initialConfig, refresh]);

  const webUrl = (config.web_url || adminWebUrl || '').replace(/\/+$/, '');

  const ensureWebUrl = useCallback(() => {
    if (config.web_url || !authHeaders().Authorization) return;
    fetchAdminWebUrl().then((url) => { if (mounted.current && url) setAdminWebUrl(url); });
  }, [config.web_url]);

  // Lo que depende de la config fuera de React: título, icono, fuentes, zona
  useEffect(() => {
    document.title = `${config.studio_name} · Panel`;
    setMeta('apple-mobile-web-app-title', config.studio_name);
    setMeta('application-name', config.studio_name);
    // Estilo del panel: color de la barra del móvil y modo claro/oscuro (src/theme.ts)
    const look = panelLook(config);
    setMeta('theme-color', panelThemeColor(config));
    setMeta('apple-mobile-web-app-status-bar-style', look.dark ? 'black' : 'default');
    document.documentElement.dataset.panelStyle = look.style;
    document.documentElement.dataset.panelMode = look.dark ? 'dark' : 'light';
    document.documentElement.style.colorScheme = look.dark ? 'dark' : '';
    setFavicon(config.favicon_url || '/api/v1/site-config/icon/32.png?variant=panel');
    loadStudioFonts(config.theme.font_heading, config.theme.font_body);
    setStudioTz(config.timezone);
    setStudioMoney(config.currency, config.country, config.drop_in_price);
  }, [config]);

  const value = useMemo(
    () => ({ config, loading, refresh, webUrl, ensureWebUrl }),
    [config, loading, refresh, webUrl, ensureWebUrl],
  );

  return <SiteContext.Provider value={value}>{children}</SiteContext.Provider>;
}

/** Configuración del estudio: `const { config, refresh } = useSite();` */
export const useSite = () => useContext(SiteContext);

/** Web pública del estudio ('' mientras no se conoce). */
export function useStudioWebUrl(): string {
  const { webUrl, ensureWebUrl } = useSite();
  useEffect(() => { if (!webUrl) ensureWebUrl(); }, [webUrl, ensureWebUrl]);
  return webUrl;
}
