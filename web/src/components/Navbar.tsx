'use client'
// Cabecera de la web (todas las páginas). Simple a propósito:
//  - Escritorio: logo · 5 enlaces (Clases, Horario, Precios, Equipo, Contacto)
//    · idioma · cuenta · «Reservar clase» (la acción principal, siempre visible).
//  - Móvil: logo · cuenta · menú (hoja con los 5 enlaces + «Más») y una barra
//    fija abajo con «Reservar clase» (o «Ver mi reserva (n)» si ya hay clases elegidas).
//  - La bolsa (con el número de clases) y «Ver mi reserva» abren el panel
//    «Tu reserva» (CartDrawer), que también se abre al elegir una clase.
// Estilos: .w-hd / .w-bar en styles/site.css (solo tokens del estilo visual).
import React, { useEffect, useMemo, useState } from 'react';
import { Drawer, Portal, CloseButton } from '@chakra-ui/react';
import { Icon } from './ui/Icon';
import { useT, localizedPath, isStaticLangPage } from '../i18n/index';
import { useLangStore } from './stores/lang.store';
import { useCartStore } from './stores/car.store';
import AuthEntrypoint from './AuthDialog';
import { CartDrawer } from './CartDrawer';
import { LanguageModal } from './WelcomeDialog';
import WhatsAppButton from './WhatsAppButton';
import InstallAppBanner from './InstallAppBanner';
import { clearSession } from '../utils/session';
import BrandLogo from './BrandLogo';

// ── Idioma: cambia al instante; en páginas con el texto en el HTML salta a su versión
function useChooseLang() {
  const { lang, setLang } = useLangStore();
  const choose = (code: 'es' | 'en') => {
    if (code === lang) return;
    setLang(code);
    try { localStorage.setItem('language_setup_complete', 'true'); } catch { /* sin almacenamiento */ }
    const path = window.location.pathname;
    if (isStaticLangPage(path)) {
      const target = localizedPath(path, code);
      if (target && target !== (path.replace(/\/+$/, '') || '/')) {
        window.location.assign(target + window.location.search + window.location.hash);
      }
    }
  };
  return { lang, choose };
}

function LangToggle() {
  const { lang, choose } = useChooseLang();
  return (
    <div className="w-hd-lang" role="group" aria-label="Idioma / Language">
      <button type="button" aria-pressed={lang === 'es'} onClick={() => choose('es')} aria-label="Español">ES</button>
      <button type="button" aria-pressed={lang === 'en'} onClick={() => choose('en')} aria-label="English">EN</button>
    </div>
  );
}

/** Limpieza de sesión: versión del almacenamiento y caducidad (24 h). */
function useStorageGuard() {
  useEffect(() => {
    const VERSION_KEY = 'storageVersion';
    const TIMESTAMP_KEY = 'sessionTimestamp';
    // Si hace falta forzar otra limpieza en el futuro, cambia la versión
    const CURRENT_VERSION = 'v1.1';
    const MAX_SESSION_TIME_MS = 24 * 60 * 60 * 1000;
    try {
      const storedVersion = localStorage.getItem(VERSION_KEY);
      if (storedVersion !== CURRENT_VERSION) {
        // El idioma elegido no es "dato corrupto": lo conservamos.
        const keepLang = localStorage.getItem('site.lang');
        const keepLangSetup = localStorage.getItem('language_setup_complete');
        // Preferencias del panel (menú comprimido, tamaño de letra, vista del
        // calendario…): si el panel comparte dirección con la web, no son de la web.
        const PANEL_KEYS = /^(panel-|crm|kc[A-Z]|hoy\.)/;
        const keepPanel = Object.keys(localStorage)
          .filter((k) => PANEL_KEYS.test(k))
          .map((k) => [k, localStorage.getItem(k) ?? ''] as const);
        localStorage.clear();
        localStorage.setItem(VERSION_KEY, CURRENT_VERSION);
        if (keepLang) localStorage.setItem('site.lang', keepLang);
        if (keepLangSetup) localStorage.setItem('language_setup_complete', keepLangSetup);
        keepPanel.forEach(([k, v]) => localStorage.setItem(k, v));
      } else {
        const storedTimestamp = localStorage.getItem(TIMESTAMP_KEY);
        if (storedTimestamp && Date.now() - parseInt(storedTimestamp, 10) > MAX_SESSION_TIME_MS) {
          clearSession();
        }
      }
    } catch { /* localStorage no disponible */ }
  }, []);
}

const norm = (p: string) => p.replace(/\/+$/, '') || '/';

interface NavbarProps {
  /** Compatibilidad: antes la barra era transparente sobre la portada. */
  forceScrolled?: boolean;
}

export default function Navbar(_props: NavbarProps = {}) {
  useStorageGuard();
  const t = useT();
  const lang = useLangStore((s) => s.lang);
  const cartCount = useCartStore((s) => s.items.length);
  const openCart = useCartStore((s) => s.openPanel);
  const [path, setPath] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => { setPath(norm(window.location.pathname)); }, []);

  const items = useMemo(() => (['classes', 'calendar', 'prices', 'studio', 'contact'] as const).map((k) => ({
    key: k, label: t(`nav.items.${k}.label`), href: t(`nav.items.${k}.href`),
  })), [t, lang]);
  const more = useMemo(() => (['faq', 'promos', 'terms', 'cookies'] as const).map((k) => ({
    key: k, label: t(`nav.items.${k}.label`), href: t(`nav.items.${k}.href`),
  })), [t, lang]);

  const isCurrent = (href: string) => {
    const h = norm(href.split('#')[0]);
    if (!path || h === '/' || h === '/en') return false;
    return [h, localizedPath(h, 'es'), localizedPath(h, 'en')].some((c) => c && path.startsWith(c));
  };

  const bookLabel = t('nav.cta.book');
  // Barra del móvil: oculta donde ya estás reservando o entrando (y en tu
  // cuenta y el horario, que ya tienen su propio «Reservar»)
  const onCheckout = path.startsWith('/checkout');
  const hideBar = onCheckout || path === '/login' || path.startsWith('/recover-password') || path.startsWith('/verify-account')
    || ((path === '/calendar' || path === '/dashboard') && cartCount === 0);
  useEffect(() => {
    if (!path) return;
    document.body.classList.toggle('w-has-bar', !hideBar);
  }, [hideBar, path]);

  const bookHref = '/calendar';
  const homeHref = t('nav.items.home.href') || '/';

  return (
    <>
      <header className="w-hd">
        <div className="w-wrap w-hd-in">
          <a className="w-hd-logo" href={homeHref} aria-label={t('nav.brandAltDefault')}>
            <BrandLogo width={150} maxHeight={44} alt="" />
          </a>

          <nav className="w-hd-nav" aria-label={t('nav.a11y.mainNav')}>
            {items.map((it) => (
              <a key={it.key} href={it.href} aria-current={isCurrent(it.href) ? 'page' : undefined}>{it.label}</a>
            ))}
          </nav>

          <div className="w-hd-actions">
            <div className="w-hd-desk"><LangToggle /></div>
            {!onCheckout && (
              <button type="button" className="w-hd-icon w-hd-bag" onClick={openCart} aria-haspopup="dialog"
                aria-label={`${t('nav.a11y.cart')}: ${cartCount}`}>
                <Icon name="bag" aria-hidden />
                {cartCount > 0 && <span className="w-hd-badge" aria-hidden>{cartCount}</span>}
              </button>
            )}
            <AuthEntrypoint scrolled linkColor="" />
            {cartCount > 0 ? (
              <button type="button" className="w-btn w-btn--sm sk-btn w-hd-desk" onClick={openCart} aria-haspopup="dialog">
                {t('nav.cta.cart')}
              </button>
            ) : (
              <a className="w-btn w-btn--sm sk-btn w-hd-desk" href={bookHref}>{bookLabel}</a>
            )}
            <Drawer.Root open={menuOpen} placement="end" size="sm" onOpenChange={(e) => setMenuOpen(e.open)}>
              <Drawer.Trigger asChild>
                <button type="button" className="w-hd-icon w-hd-menu" aria-label={t('nav.a11y.toggleNav')}>
                  <Icon name="menu" aria-hidden />
                </button>
              </Drawer.Trigger>
              <Portal>
                <Drawer.Backdrop />
                <Drawer.Positioner>
                  <Drawer.Content className="sk-panel" style={{ borderRadius: 0, fontFamily: 'var(--font-body)' }}>
                    <Drawer.Header>
                      <Drawer.Title style={{ color: 'var(--heading-color)', fontFamily: 'var(--font-heading)', fontSize: '1.3rem' }}>
                        {t('nav.drawer.title')}
                      </Drawer.Title>
                    </Drawer.Header>
                    <Drawer.Body>
                      <ul className="w-sheet-list">
                        <li><a href={homeHref}>{t('nav.items.home.label')}<Icon name="chevron-right" size={14} aria-hidden /></a></li>
                        {items.map((it) => (
                          <li key={it.key}>
                            <a href={it.href} aria-current={isCurrent(it.href) ? 'page' : undefined} onClick={() => setMenuOpen(false)}>
                              {it.label}<Icon name="chevron-right" size={14} aria-hidden />
                            </a>
                          </li>
                        ))}
                      </ul>
                      <p className="w-sheet-sub">{t('nav.drawer.more')}</p>
                      <ul className="w-sheet-list w-sheet-list--sm">
                        <li><a href="/dashboard">{t('nav.cta.account')}</a></li>
                        {more.map((it) => <li key={it.key}><a href={it.href} onClick={() => setMenuOpen(false)}>{it.label}</a></li>)}
                      </ul>
                      <p className="w-sheet-sub">{t('nav.languageLabel')}</p>
                      <LangToggle />
                    </Drawer.Body>
                    <Drawer.Footer>
                      {cartCount > 0 ? (
                        <button type="button" className="w-btn w-btn--lg w-btn--block sk-btn"
                          onClick={() => { setMenuOpen(false); openCart(); }}>
                          {`${t('nav.cta.cart')} (${cartCount})`}
                        </button>
                      ) : (
                        <a className="w-btn w-btn--lg w-btn--block sk-btn" href={bookHref}>{bookLabel}</a>
                      )}
                    </Drawer.Footer>
                    <Drawer.CloseTrigger asChild>
                      <CloseButton size="md" aria-label={lang === 'en' ? 'Close' : 'Cerrar'} />
                    </Drawer.CloseTrigger>
                  </Drawer.Content>
                </Drawer.Positioner>
              </Portal>
            </Drawer.Root>
          </div>
        </div>
      </header>

      {/* Móvil: la acción principal siempre a mano */}
      {path && !hideBar && (
        <div className="w-bar">
          {cartCount > 0 ? (
            <button type="button" className="w-btn sk-btn" onClick={openCart} aria-haspopup="dialog">
              <Icon name="bag" aria-hidden />
              {`${t('nav.cta.cart')} (${cartCount})`}
            </button>
          ) : (
            <a className="w-btn sk-btn" href={bookHref}>
              <Icon name="calendar-plus" aria-hidden />
              {bookLabel}
            </a>
          )}
        </div>
      )}

      {!onCheckout && <CartDrawer />}
      {/* Solo si el estudio tiene WhatsApp en la config */}
      <WhatsAppButton message={t('whatsapp.message')} label={t('whatsapp.helpLabel')} />
      <LanguageModal />
      {/* Invita a instalar la app en toda la web */}
      <InstallAppBanner />
    </>
  );
}
