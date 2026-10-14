'use client'
import React, { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Flex,
  Text,
  IconButton,
  Button,
  Stack,
  useBreakpointValue,
  Link,
  Drawer,
  Portal,
  CloseButton,
  Separator,
} from '@chakra-ui/react';
import { motion } from 'framer-motion';
import { Icon } from './ui/Icon';
import { useScrollDirection } from './hooks/useScrollDetection';
import { useT, localizedPath, isStaticLangPage } from '../i18n/index';
import { useLangStore } from './stores/lang.store';
import AuthEntrypoint from './AuthDialog';
import { GlobalCart } from './GlobalCart';
import { LanguageModal } from './WelcomeDialog';
import WhatsAppButton from './WhatsAppButton';
import BottomNav from './BottomNav';
import InstallAppBanner from './InstallAppBanner';
import { clearSession } from '../utils/session';
import BrandLogo from './BrandLogo';

// ── Inline language toggle — instant, no reload ──────────────────────────────
function LangToggle({ scrolled, size = 'sm' }: { scrolled?: boolean; size?: 'sm' | 'lg' }) {
  const { lang, setLang } = useLangStore();
  // Cambia el idioma al instante. En las páginas con el texto escrito en el
  // HTML (legales y /en/*) además saltamos a la versión equivalente.
  const choose = (code: 'es' | 'en') => {
    if (code === lang) return;
    setLang(code);
    try { localStorage.setItem('language_setup_complete', 'true'); } catch {}
    const path = window.location.pathname;
    if (isStaticLangPage(path)) {
      const target = localizedPath(path, code);
      if (target && target !== (path.replace(/\/+$/, '') || '/')) {
        window.location.assign(target + window.location.search + window.location.hash);
      }
    }
  };
  const LANGS = [
    { code: 'es' as const, flag: '🇪🇸', label: 'ES' },
    { code: 'en' as const, flag: '🇬🇧', label: 'EN' },
  ];
  const isLg = size === 'lg';

  return (
    <Flex
      align="center"
      borderRadius="var(--radius-chip)"
      // Sobre el hero (transparente) se queda blanco; sobre la barra sólida o el cajón, tokens
      bg={isLg ? 'var(--accent-soft)' : scrolled ? 'var(--surface-muted)' : 'rgba(255,255,255,0.12)'}
      border={isLg ? '1px solid var(--accent-border)' : `1px solid ${scrolled ? 'var(--border-neutral)' : 'rgba(255,255,255,0.22)'}`}
      p="2px"
      gap={0}
    >
      {LANGS.map(l => {
        const active = lang === l.code;
        return (
          <button
            key={l.code}
            onClick={() => choose(l.code)}
            aria-pressed={active}
            aria-label={l.code === 'es' ? 'Español' : 'English'}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: isLg ? '6px' : '4px',
              padding: isLg ? '8px 16px' : '4px 10px',
              borderRadius: 'var(--radius-chip)',
              border: 'none',
              cursor: 'pointer',
              background: active
                ? isLg ? 'var(--accent)' : scrolled ? 'var(--accent-soft)' : 'rgba(255,255,255,0.22)'
                : 'transparent',
              color: isLg ? (active ? 'var(--on-primary)' : 'var(--text-muted)') : (scrolled ? 'var(--page-text)' : 'white'),
              fontSize: isLg ? '14px' : '12px',
              fontWeight: 700,
              fontFamily: 'var(--font-body)',
              transition: 'all 0.18s ease',
              WebkitTapHighlightColor: 'transparent',
              touchAction: 'manipulation',
              boxShadow: active && isLg ? 'var(--button-shadow)' : 'none',
            }}
          >
            <span style={{ fontSize: isLg ? '18px' : '13px', lineHeight: 1 }}>{l.flag}</span>
            <span>{l.label}</span>
          </button>
        );
      })}
    </Flex>
  );
}

interface NavbarProps { forceScrolled?: boolean; }

export default function Navbar({ forceScrolled = false }: NavbarProps = {}) {
  const isMobile = useBreakpointValue({ base: true, md: false })
  const scrolledFromHook = useScrollDirection();
  const scrolled = forceScrolled || scrolledFromHook;

  useEffect(() => {
     const VERSION_KEY = 'storageVersion';      // Tu "etiqueta"
      const TOKEN_KEY = 'accessToken';             // Tu token de sesión
      const TIMESTAMP_KEY = 'sessionTimestamp';  // Para la expiración
                    // Datos del usuario

      // --- Tu "Etiqueta" de Versión ---
      // 🔑 ¡IMPORTANTE! Si en el futuro necesitas forzar OTRA limpieza,
      //    simplemente cambia esto (ej. a 'v1.2')
      const CURRENT_VERSION = 'v1.1';
      console.log('from main')

      // --- Configuración de Expiración de la sesión local ---
      // BUG FIX: antes decía 9000 * 60 * 60 * 1000 = ~375 días (el comentario
      // decía "8 horas") — la limpieza nunca ocurría. Usamos 24h: suficiente
      // para no desloguear a nadie a mitad del día, pero la sesión no queda
      // viva para siempre. Ajustable si se quiere otra política.
      const MAX_SESSION_TIME_MS = 24 * 60 * 60 * 1000;

      try {
        // =======================================================
        // PARTE A: Verificación de Versión (Tu "etiqueta")
        // =======================================================
        const storedVersion = localStorage.getItem(VERSION_KEY);

        if (storedVersion !== CURRENT_VERSION) {
          // El idioma elegido no es "dato corrupto": lo conservamos.
          const keepLang = localStorage.getItem('site.lang');
          const keepLangSetup = localStorage.getItem('language_setup_complete');
          // ¡Versión corrupta o antigua!
          // Esto soluciona tu problema de "errores cometidos".
          console.warn(
            `[Storage Guard] Versión obsoleta detectada (tenía: ${storedVersion}, se esperaba: ${CURRENT_VERSION}). Limpiando TODO el localStorage...`
          );
          
          // 1. Borramos TODO para empezar de cero
          localStorage.clear();
          
          // 2. Establecemos la nueva versión para no volver a borrar
          localStorage.setItem(VERSION_KEY, CURRENT_VERSION);
          if (keepLang) localStorage.setItem('site.lang', keepLang);
          if (keepLangSetup) localStorage.setItem('language_setup_complete', keepLangSetup);
        }

        // =======================================================
        // PARTE B: Verificación de Expiración de Sesión
        // =======================================================
        else {
          // La versión es correcta, así que comprobamos el tiempo.
          const storedTimestamp = localStorage.getItem(TIMESTAMP_KEY);
          
          if (storedTimestamp) {
            const sessionStart = parseInt(storedTimestamp, 10);
            const now = Date.now();

            if (now - sessionStart > MAX_SESSION_TIME_MS) {
              // ¡Sesión expirada!
              console.log(
                '[Storage Guard] Sesión expirada por tiempo. Limpiando claves de sesión...'
              );
              // Borramos SOLO las claves de sesión, no la versión.
              // BUG FIX: antes solo se borraban token y timestamp, dejando
              // iduser/username huérfanos (componentes que chequean iduser
              // creían que había sesión).
              clearSession();
            }
          }
        }
      } catch (e) {
        console.error("[Storage Guard] Error al gestionar localStorage:", e);
      }
  }, [])

  const t = useT();
  const lang = useLangStore((s) => s.lang);




const NAV_ITEMS: NavItem[] = useMemo(
    () => [
      { label: t("nav.items.home.label"), href: t("nav.items.home.href") },
      { label: t("nav.items.classes.label"), href: t("nav.items.classes.href") },
      { label: t("nav.items.calendar.label"), href: t("nav.items.calendar.href") },
      { label: t("nav.items.prices.label"), href: t("nav.items.prices.href") },
    ],
    [t, lang]
  );



  /** ✅ memo: objetos de animación/transition para que no cambien de referencia en cada render */
  const bubble1Animate = useMemo(() => ({ scale: [1, 1.05, 1], y: [0, -10, 0] }), []);
  const bubble1Transition = useMemo(() => ({ duration: 10, repeat: Infinity, ease: "easeInOut" }), []);
  const bubble2Animate = useMemo(() => ({ scale: [1, 1.1, 1], x: [0, 10, 0] }), []);
  const bubble2Transition = useMemo(() => ({ duration: 9, repeat: Infinity, ease: "easeInOut", delay: 2 }), []);
  const bubble3Animate = useMemo(() => ({ scale: [1, 1.03, 1], y: [0, -5, 0] }), []);
  const bubble3Transition = useMemo(() => ({ duration: 12, repeat: Infinity, ease: "easeInOut", delay: 1 }), []);

  /** ✅ memo: estilos/props que dependen de `scrolled` */
  const navPosition = useMemo(() => (scrolled ? 'sticky' : 'absolute'), [scrolled]);
  // Transparente sobre el hero (texto blanco); sólida al hacer scroll: barra fija con los tokens de superficie
  const boxShadowVal = useMemo(() => (scrolled ? 'var(--shadow-card)' : 'none'), [scrolled]);
  const bgVal = useMemo(() => (scrolled ? 'var(--surface-strong)' : 'transparent'), [scrolled]);
  const backdropVal = useMemo(() => (scrolled ? 'var(--surface-blur)' : 'none'), [scrolled]);
  const borderBottomVal = useMemo(() => (scrolled ? 'var(--border-width) solid var(--surface-border)' : 'none'), [scrolled]);
  const linkColor = useMemo(() => (scrolled ? 'var(--page-text)' : 'white'), [scrolled]);
  const textShadowVal = useMemo(() => (scrolled ? 'none' : '0 0 4px rgba(0,0,0,0.4)'), [scrolled]);

  const [openMobileMenu, setOpenMobileMenu] = useState(false)


const MobileNavItem = ({ label, href }: NavItem) => {

  return (
    <Stack borderBottom="1px solid var(--border-neutral)">
      <Flex
        py={4} // Aumentamos padding vertical (antes era 2) para facilitar el toque
        as="a"
        justifyContent="space-between"
        alignItems="center"
        _hover={{ textDecoration: 'none', bg: 'var(--surface-muted)' }}
      >
        <Link 
          fontWeight="bold" // Texto más grueso
          fontSize="lg"     // Texto más grande para lectura fácil
          color="var(--page-text)" // Texto de la página: legible también en estilos oscuros
          onClick={(e) => setOpenMobileMenu(false)}  
          href={href}>{label}</Link>
      </Flex>
    </Stack>
  );
};

  /** ✅ memo: animación del logo */
  const logoMotion = useMemo(
    () => ({
      opacity: scrolled ? 1 : 0.8,
      scale: scrolled ? 0.9 : 1,
      rotateY: scrolled ? 0 : 15
    }),
    [scrolled]
  );
  const logoMotionTransition = useMemo(() => ({ duration: 0.4 }), []);

  /** ✅ memo: los dos elementos <img> para que React no cree nuevas instancias cada render */
  const logoScrolledEl = useMemo(
    () => <BrandLogo width={130} maxHeight={56} alt={t('nav.brandAltScrolled')} style={{ transition: 'width 0.3s' }} />,
    [t]
  );
  const logoDefaultEl = useMemo(
    () => <BrandLogo variant="light" width={180} maxHeight={72} alt={t('nav.brandAltDefault')} style={{ transition: 'width 0.3s' }} />,
    [t]
  );

  return (
    <>
    <Box
      w="100%"
      as="nav"
      position={navPosition}
      top="0"
      zIndex="sticky"
      transition="all 0.3s ease-in-out"
      boxShadow={boxShadowVal}
      bg={bgVal}
      backdropFilter={backdropVal}
      style={{ WebkitBackdropFilter: backdropVal }}
      borderBottom={borderBottomVal}
    >
      {/* Bubbles — warm taupe palette */}
      <motion.div
        animate={bubble1Animate}
        transition={bubble1Transition}
        style={{
          position: 'absolute',
          top: '-60px',
          left: '10%',
          width: '140px',
          height: '140px',
          borderRadius: '50%',
          background: 'color-mix(in srgb, color-mix(in srgb, var(--brand-primary) 70%, white) 40%, transparent)',
          filter: 'blur(70px)',
          boxShadow: '0 0 100px color-mix(in srgb, color-mix(in srgb, var(--brand-primary) 70%, white) 60%, transparent)',
          zIndex: 0,
        }}
      />
      <motion.div
        animate={bubble2Animate}
        transition={bubble2Transition}
        style={{
          position: 'absolute',
          bottom: '-40px',
          right: '8%',
          width: '110px',
          height: '110px',
          borderRadius: '50%',
          background: 'color-mix(in srgb, color-mix(in srgb, var(--brand-primary) 70%, white) 40%, transparent)',
          filter: 'blur(50px)',
          boxShadow: '0 0 80px color-mix(in srgb, color-mix(in srgb, var(--brand-primary) 70%, white) 60%, transparent)',
          zIndex: 0,
        }}
      />
      <motion.div
        animate={bubble3Animate}
        transition={bubble3Transition}
        style={{
          position: 'absolute',
          top: '35%',
          right: '22%',
          width: '90px',
          height: '90px',
          borderRadius: '50%',
          background: 'color-mix(in srgb, color-mix(in srgb, var(--brand-primary) 70%, white) 35%, transparent)',
          filter: 'blur(40px)',
          boxShadow: '0 0 60px color-mix(in srgb, color-mix(in srgb, var(--brand-primary) 65%, white) 50%, transparent)',
          zIndex: 0,
        }}
      />

      <Flex
        w="100%"
        position="relative"
        minH={scrolled ? "60px" : "90px"}
        justify="center"
        maxW="1920px"
        py={{ base: 2 }}
        px={{ base: 4 }}
        align="center"
        top={0}
        as='nav'
        zIndex={1}
      >
        {/* Mobile Toggle */}


  <Drawer.Root open={openMobileMenu}  size={'md'} placement='start' onOpenChange={(e) => setOpenMobileMenu(e.open)}>
      <Drawer.Trigger asChild>
       
        <IconButton
          display={{ md: 'none' }}
          variant="ghost"
          // CAMBIO: Color dinámico. Blanco arriba (para ver sobre imagen) y Marca al bajar.
          color={scrolled ? 'var(--page-text)' : 'white'} 
          // CAMBIO: Fondo semitransparente arriba para asegurar contraste si la foto es clara
          bg={scrolled ? 'transparent' : 'rgba(0,0,0,0.2)'}
          aria-label={t('nav.a11y.toggleNav')}
          zIndex={2}
          fontSize="2rem" // CAMBIO: Icono mucho más grande
          size="lg"       // CAMBIO: Botón más grande
          _hover={{ bg: scrolled ? 'var(--surface-muted)' : 'rgba(255,255,255,0.2)' }}
        >
          {openMobileMenu ? <Icon name="close-circle" /> : <Icon name="menu" />}
          
        </IconButton>
      </Drawer.Trigger>
      <Portal>
        <Drawer.Backdrop />
        <Drawer.Positioner>
          <Drawer.Content>
            <Drawer.Header>
              <Drawer.Title 
          color={'var(--heading-color)'}>{t('nav.drawer.title')}</Drawer.Title>
            </Drawer.Header>
            <Drawer.Body>
               {NAV_ITEMS.map((navItem, index) => (
        <MobileNavItem key={index} {...navItem} />
      ))}
             </Drawer.Body>
            <Drawer.Footer>
              <Box w="full" pt={2}>
                <Text fontFamily='var(--font-body)' fontSize="11px" fontWeight={700}
                  color="var(--text-subtle)" textTransform="uppercase" letterSpacing="0.10em" mb={3}>
                  {t('nav.languageLabel')}
                </Text>
                <LangToggle size="lg" />
              </Box>
            </Drawer.Footer>
            <Drawer.CloseTrigger asChild>
              <CloseButton size="sm" />
            </Drawer.CloseTrigger>
          </Drawer.Content>
        </Drawer.Positioner>
      </Portal>
    </Drawer.Root>
        {/* Logo: en móvil ocupa el hueco entre el menú y "Acceder" (si es texto,
            el nombre del estudio no se monta encima de los botones) */}
        <Flex w={{ base: 'auto', md: '15%' }} flex={{ base: 1, md: 'none' }} minW={0} justify="center" overflow="hidden">
          <a href={t('nav.items.home.href')} style={{ display: 'block', maxWidth: '100%', minWidth: 0 }}>
            <div style={{ maxWidth: '100%', overflow: 'hidden' }}>
              {scrolled ? logoScrolledEl : logoDefaultEl}
            </div>
          </a>
        </Flex>

        {/* Desktop Navigation */}
        <Flex w={{ base: 'auto', md: '75%' }} justify="end">
            {/* En móvil sin hueco extra: deja sitio al logo (el carrito es flotante) */}
            <Box marginRight={{ base: 0, md: '4.5rem' }}>
                                   <GlobalCart></GlobalCart>
                                   </Box>
             <Flex display={['flex', 'flex', 'none', 'none']}>
               <AuthEntrypoint scrolled={false} linkColor={''}/>
                                

                                
                                  
            <Box display={{base: 'block', md: 'none'}}  marginRight={'3rem'}></Box>
                                  </Flex>
          <Flex w="75%" display={['none', 'none', 'flex', 'flex']} justify="end">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.label}
                marginLeft="1.5rem"
                fontWeight="bold"
                color={linkColor}
                fontSize={scrolled ? '13px' : '16px'}
                fontFamily='var(--font-body)'
                letterSpacing={scrolled ? 'normal' : '0.02em'}
                textShadow={textShadowVal}
                as={'a'}
                href={`${item.href}`}
              >
                {item.label}
              </Link>
            ))}
            {/* Sobre el hero: píldora translúcida con texto blanco; en la barra sólida, botón secundario del estilo */}
            <Button
              className={scrolled ? 'sk-btn-ghost' : undefined}
              marginLeft="1rem"
              fontSize={scrolled ? '13px' : '16px'}
              fontFamily='var(--font-body)'
              fontWeight="bold"
              borderRadius="var(--radius-button)"
              _hover={scrolled ? undefined : { color: 'black' }}
              variant={scrolled ? 'ghost' : 'ghost'}
              bg="color-mix(in srgb, var(--brand-secondary) 44%, transparent)"
        
                textShadow={textShadowVal}
              color="white" // en la barra sólida manda sk-btn-ghost
            >
              <a href={'#contact'}>        {t("nav.cta.contact")}</a>
            </Button>

            <Box ml={3}>
              <LangToggle scrolled={scrolled} size="sm" />
            </Box>

            <AuthEntrypoint scrolled={false} linkColor={''}/>

          </Flex>
        </Flex>
      </Flex>

    </Box>

      {/* Solo si el estudio tiene WhatsApp en la config */}
      <WhatsAppButton message={t('whatsapp.message')} label={t('whatsapp.helpLabel')}/>
      <LanguageModal />
      <BottomNav />
      {/* Global: invita a instalar la app en toda la web, no solo en portada */}
      <InstallAppBanner />
    </>
  );
}

interface NavItem {
  label: string;
  subLabel?: string;
  children?: NavItem[];
  href?: string;
}
