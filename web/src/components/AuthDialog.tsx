"use client";

/**
 * Punto de entrada de la cuenta en el Navbar (y en el checkout):
 * - Sin sesión: botón "Acceder" que abre el modal de acceso/registro.
 *   En móvil ocupa toda la pantalla (cabecera fija + cerrar grande); en
 *   escritorio es una tarjeta centrada.
 *   `lazyMount unmountOnExit` es IMPORTANTE: el contenido (y con él el script de Google,
 *   que se precarga al mostrarse el botón de Google) solo se carga al abrir.
 * - Con sesión: avatar con menú (mis clases, preferencias, suscripción, salir).
 */

import React, { useState, useEffect, useMemo, useCallback, Suspense, lazy } from 'react';
import { Button, Menu, Avatar, Dialog, Portal, chakra, Box, Flex, Spinner } from '@chakra-ui/react';
import { FaUser, FaTimes } from 'react-icons/fa';
import Chakra from './ChakraProvider';
// PERF: el formulario (y el acceso con Google) se descarga solo al abrir el modal, no en
// cada página donde está el menú.
const AuthPage = lazy(() => import('./AuthPage'));
import { useLangStore } from './stores/lang.store';
import { clearSession } from '../utils/session';
import BrandLogo from './BrandLogo';

const T = {
  es: {
    trigger: 'Acceder',
    triggerAria: 'Entrar o crear cuenta',
    dialogTitle: 'Tu cuenta',
    close: 'Cerrar',
    account: 'Mi cuenta',
    myCalendar: 'Mis clases',
    preferences: 'Mis preferencias',
    subscription: 'Mi suscripción',
    logout: 'Cerrar sesión',
    coachmark: '¡Aquí tienes tus clases reservadas y tu calendario!',
    gotIt: 'Entendido',
  },
  en: {
    trigger: 'Sign in',
    triggerAria: 'Log in or create an account',
    dialogTitle: 'Your account',
    close: 'Close',
    account: 'My account',
    myCalendar: 'My classes',
    preferences: 'My preferences',
    subscription: 'My subscription',
    logout: 'Log out',
    coachmark: 'Your booked classes and calendar are here!',
    gotIt: 'Got it',
  },
};

// Tipado de las props
interface AuthEntrypointProps {
  scrolled: boolean;
  linkColor: string;
}

/**
 * Foco inicial del modal: el email en escritorio; en táctil, el botón cerrar
 * (no abrimos el teclado de golpe tapando el botón de Google).
 * Siempre devuelve un elemento: con null el focus-trap lanzaría un error.
 */
function initialFocus(): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  const fine = typeof window !== 'undefined' && window.matchMedia?.('(pointer: fine)').matches;
  const email = document.getElementById('auth-email');
  const close = document.getElementById('auth-dialog-close');
  const content = document.querySelector<HTMLElement>('[data-scope="dialog"][data-part="content"][data-state="open"]');
  return (fine ? email || close : close || email) || content;
}

export default function AuthEntrypoint({ scrolled }: AuthEntrypointProps) {
  const lang = useLangStore((s) => s.lang);
  const tx = lang === 'en' ? T.en : T.es;

  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [showCoachmark, setShowCoachmark] = useState<boolean>(false);
  const [initial, setInitial] = useState('D');

  // Colores dinámicos
  const userAvatarBg = useMemo<string>(() => scrolled ? 'color-mix(in srgb, var(--brand-primary) 48%, var(--brand-dark))' : 'white', [scrolled]);
  const userAvatarColor = useMemo<string>(() => scrolled ? 'white' : 'color-mix(in srgb, var(--brand-primary) 48%, var(--brand-dark))', [scrolled]);

  // 1. Autenticación y coachmark
  useEffect(() => {
    let auth = false;
    try {
      auth = !!localStorage.getItem('accessToken');
      const name = (localStorage.getItem('username') || '').trim();
      if (name && name !== 'undefined' && name !== 'null') setInitial(name.charAt(0).toUpperCase());
    } catch { /* localStorage no disponible */ }
    setIsAuthenticated(auth);

    let timerId: ReturnType<typeof setTimeout> | undefined;
    if (auth) {
      let seen = true;
      try { seen = !!localStorage.getItem('coachmarkAvatarVisto'); } catch { /* noop */ }
      if (!seen) timerId = setTimeout(() => setShowCoachmark(true), 500);
    }
    return () => { if (timerId) clearTimeout(timerId); };
  }, []);

  // 2. Cerrar sesión: solo las claves de sesión (antes localStorage.clear()
  //    borraba también el carrito y el idioma).
  const handleLogout = useCallback((): void => {
    clearSession();
    try { localStorage.removeItem('coachmarkAvatarVisto'); } catch { /* noop */ }
    window.location.reload();
  }, []);

  const handleCloseCoachmark = useCallback(() => {
    setShowCoachmark(false);
    try { localStorage.setItem('coachmarkAvatarVisto', 'true'); } catch { /* noop */ }
  }, []);

  const buttonHoverStyles = useMemo(() => ({
    bg: scrolled ? 'color-mix(in srgb, var(--brand-secondary) 76%, white)' : 'var(--brand-bg)',
    color: scrolled ? 'white' : 'color-mix(in srgb, var(--brand-primary) 48%, var(--brand-dark))',
    borderColor: scrolled ? 'color-mix(in srgb, var(--brand-secondary) 76%, white)' : 'color-mix(in srgb, var(--brand-primary) 48%, var(--brand-dark))',
    boxShadow: 'lg',
  }), [scrolled]);

  // === Con sesión: menú de usuaria ===
  if (isAuthenticated) {
    const itemStyle = { minH: '44px', fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: '15px', color: 'var(--brand-dark)', cursor: 'pointer', textTransform: 'none' as const };
    return (
      <Chakra>
        <chakra.div position="relative" display="inline-block">
          <Menu.Root>
            <Menu.Trigger asChild>
              <Button variant="ghost" rounded="full" minW="44px" h="44px" p={0} marginLeft=".5rem" aria-label={tx.account}>
                <Avatar.Root className="avatar-bg" size="sm" bg={userAvatarBg} color={userAvatarColor}>
                  <Avatar.Fallback>{initial}</Avatar.Fallback>
                </Avatar.Root>
              </Button>
            </Menu.Trigger>

            <Menu.Positioner>
              <Menu.Content minW="220px" borderRadius="14px" p={1.5}>
                <Menu.Item value="calendar" asChild {...itemStyle}>
                  <a href="/myCalendar">{tx.myCalendar}</a>
                </Menu.Item>
                <Menu.Item value="preferences" asChild {...itemStyle}>
                  <a href="/myPreferences">{tx.preferences}</a>
                </Menu.Item>
                <Menu.Item value="subscription" asChild {...itemStyle}>
                  <a href="/mySubscription">{tx.subscription}</a>
                </Menu.Item>
                <Menu.Separator />
                <Menu.Item value="logout" onClick={handleLogout} {...itemStyle} color="#B42318">
                  {tx.logout}
                </Menu.Item>
              </Menu.Content>
            </Menu.Positioner>
          </Menu.Root>

          {showCoachmark && (
            <Box
              role="status"
              position="absolute" top="100%" right={0} mt={2} width="220px"
              bg="color-mix(in srgb, var(--brand-primary) 48%, var(--brand-dark))" color="white" borderRadius="12px" boxShadow="lg" p={3} zIndex={1000}
              fontFamily='var(--font-body)'
            >
              <Box position="absolute" top="-5px" right="15px" width="10px" height="10px" bg="color-mix(in srgb, var(--brand-primary) 48%, var(--brand-dark))" transform="rotate(45deg)" />
              <Box fontSize="sm" fontWeight={600} mb={2} lineHeight="1.4">{tx.coachmark}</Box>
              <Flex justify="flex-end">
                <chakra.button type="button" onClick={handleCloseCoachmark} minH="36px" px={3}
                  border="1px solid rgba(255,255,255,0.7)" borderRadius="8px" bg="transparent" color="white"
                  fontWeight={700} fontSize="13px" cursor="pointer" _hover={{ bg: 'rgba(255,255,255,0.12)' }}>
                  {tx.gotIt}
                </chakra.button>
              </Flex>
            </Box>
          )}
        </chakra.div>
      </Chakra>
    );
  }

  // === Sin sesión: botón + modal de acceso ===
  return (
    <Chakra>
      <Dialog.Root
        size={{ base: 'full', md: 'md' }}
        placement="center"
        motionPreset="slide-in-bottom"
        scrollBehavior="inside"
        initialFocusEl={initialFocus}
        lazyMount
        unmountOnExit
      >
        <Dialog.Trigger asChild>
          <Button
            aria-label={tx.triggerAria}
            fontSize="14px"
            fontWeight="bolder"
            fontFamily='var(--font-body)'
            minH="44px"
            boxShadow="2xl"
            marginRight="1.5rem"
            marginLeft="1.5rem"
            variant={scrolled ? 'solid' : 'outline'}
            bg="color-mix(in srgb, color-mix(in srgb, var(--brand-primary) 48%, var(--brand-dark)) 80%, transparent)"
            color="white"
            borderColor="white"
            _hover={buttonHoverStyles}
            transition="all 0.3s ease-in-out"
            translate="no"
            className="notranslate"
          >
            <FaUser aria-hidden />
            <span>{tx.trigger}</span>
          </Button>
        </Dialog.Trigger>

        <Portal>
          <Dialog.Backdrop bg="color-mix(in srgb, var(--brand-dark) 55%, transparent)" backdropFilter="blur(3px)" />
          <Dialog.Positioner>
            <Dialog.Content
              suppressHydrationWarning
              bg="color-mix(in srgb, var(--brand-bg) 55%, white)"
              maxW={{ md: '480px' }}
              h={{ base: '100dvh', md: 'auto' }}
              minH={{ base: '100dvh', md: 'auto' }}
              my={{ base: 0, md: 'auto' }}
              maxH={{ base: '100dvh', md: 'calc(100dvh - 3rem)' }}
              borderRadius={{ base: 0, md: '24px' }}
              overflow="hidden"
              fontFamily='var(--font-body)'
              boxShadow={{ md: '0 24px 60px color-mix(in srgb, var(--brand-dark) 28%, transparent)' }}
              translate="no"
              className="notranslate"
            >
              <Dialog.Header
                display="flex" alignItems="center" justifyContent="space-between" gap={3}
                px={{ base: 4, md: 6 }} py={2}
                pt={{ base: 'max(8px, env(safe-area-inset-top))', md: 3 }}
                bg="color-mix(in srgb, var(--brand-bg) 55%, white)" borderBottom="1px solid color-mix(in srgb, var(--brand-primary) 30%, white)" flexShrink={0}
              >
                <Flex align="center" gap={3} minW={0}>
                  <BrandLogo width={64} maxHeight={32} alt="" />
                  <Dialog.Title fontFamily='var(--font-body)' fontWeight={700} fontSize="16px" color="var(--brand-dark)" truncate>
                    {tx.dialogTitle}
                  </Dialog.Title>
                </Flex>
                <Dialog.CloseTrigger asChild position="static" top="auto" insetEnd="auto">
                  <chakra.button
                    type="button"
                    id="auth-dialog-close"
                    aria-label={tx.close}
                    w="48px" h="48px" flexShrink={0} mr={-1}
                    display="flex" alignItems="center" justifyContent="center"
                    borderRadius="full" bg="transparent" color="var(--brand-dark)" fontSize="20px" cursor="pointer"
                    _hover={{ bg: 'color-mix(in srgb, var(--brand-primary) 18%, white)' }}
                    _focusVisible={{ outline: '2px solid color-mix(in srgb, var(--brand-primary) 48%, var(--brand-dark))', outlineOffset: '2px' }}
                  >
                    <FaTimes aria-hidden />
                  </chakra.button>
                </Dialog.CloseTrigger>
              </Dialog.Header>

              <Dialog.Body p={0} pb="env(safe-area-inset-bottom)" flex="1" minH={0} overflowY="auto" overscrollBehavior="contain">
                <Suspense fallback={<Flex justify="center" py={16}><Spinner color="var(--brand-primary)" size="lg" /></Flex>}>
                  <AuthPage isInModal />
                </Suspense>
              </Dialog.Body>
            </Dialog.Content>
          </Dialog.Positioner>
        </Portal>
      </Dialog.Root>
    </Chakra>
  );
}
