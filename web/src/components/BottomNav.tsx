"use client";

import React, { useEffect, useState } from 'react';
import { Box, Flex, Text } from '@chakra-ui/react';
import { FaHome, FaSpa, FaCalendarPlus, FaTags, FaUser } from 'react-icons/fa';
import { useCartStore } from './stores/car.store';
import { useT, localizedPath } from '../i18n';

const C = {
  accent: 'var(--brand-primary)',
  accentDark: 'color-mix(in srgb, var(--brand-primary) 60%, var(--brand-dark))',
  brown: 'var(--brand-dark)',
  muted: 'color-mix(in srgb, var(--brand-secondary) 83%, white)',
  bg: 'color-mix(in srgb, var(--brand-bg) 92%, transparent)',
  border: 'color-mix(in srgb, var(--brand-primary) 18%, transparent)',
};

const NAV_H = 62; // px, sin contar safe-area

/**
 * Barra de navegación inferior (solo móvil, <768px) — patrón app-like.
 * 5 secciones máx.: Inicio · Clases · Reservar (CTA central con badge del
 * carrito) · Precios · Mi cuenta. "Reservar" lleva al calendario, o al
 * checkout si ya hay clases en el carrito.
 */
export default function BottomNav() {
  const t = useT();
  const cartCount = useCartStore((s) => s.items.length);
  const [path, setPath] = useState('');

  useEffect(() => {
    setPath(window.location.pathname.replace(/\/$/, '') || '/');
  }, []);

  const reserveHref = cartCount > 0 ? '/checkout' : '/calendar';

  const homeHref = t('nav.items.home.href') || '/';
  const classesHref = t('nav.items.classes.href') || '/classes';
  const items = [
    { href: homeHref, label: t('nav.items.home.label') || 'Inicio', icon: FaHome },
    { href: classesHref, label: t('nav.items.classes.label') || 'Clases', icon: FaSpa },
    { href: reserveHref, label: t('bottomNav.book') || 'Reservar', icon: FaCalendarPlus, primary: true, matches: ['/calendar', '/checkout'] },
    { href: '/prices', label: t('nav.items.prices.label') || 'Precios', icon: FaTags },
    { href: '/dashboard', label: t('bottomNav.account') || 'Mi cuenta', icon: FaUser },
  ];

  const isActive = (item: (typeof items)[number]) => {
    const targets = item.matches || [item.href];
    // Activo también en la versión del otro idioma (/classes ↔ /en/classes)
    return targets.some((h) =>
      [h, localizedPath(h, 'es'), localizedPath(h, 'en')].some((c) =>
        c && (c === '/' || c === '/en' ? path === c : path.startsWith(c))));
  };

  return (
    <>
      {/* Reservar espacio al final de la página para que la barra no tape
          contenido ni el footer (solo móvil). */}
      <style>{`
        @media (max-width: 767px) {
          body { padding-bottom: calc(${NAV_H}px + env(safe-area-inset-bottom, 0px)); }
        }
      `}</style>

      <Box
        as="nav"
        aria-label={t('nav.a11y.mainNav')}
        display={{ base: 'block', md: 'none' }}
        position="fixed"
        bottom={0}
        left={0}
        right={0}
        zIndex={1200}
        bg={C.bg}
        backdropFilter="blur(18px) saturate(160%)"
        style={{ WebkitBackdropFilter: 'blur(18px) saturate(160%)' }}
        borderTop={`1px solid ${C.border}`}
        boxShadow="0 -4px 24px color-mix(in srgb, var(--brand-dark) 8%, transparent)"
        pb="env(safe-area-inset-bottom, 0px)"
      >
        <Flex h={`${NAV_H}px`} align="stretch" justify="space-around">
          {items.map((item) => {
            const active = isActive(item);
            const Icon = item.icon;

            if (item.primary) {
              return (
                <Flex
                  key="reservar"
                  as="a"
                  href={item.href}
                  direction="column"
                  align="center"
                  justify="center"
                  flex={1}
                  position="relative"
                  aria-label={item.label}
                >
                  <Flex
                    align="center"
                    justify="center"
                    w="46px"
                    h="46px"
                    mt="-18px"
                    borderRadius="full"
                    bg={`linear-gradient(135deg, ${C.accent}, ${C.accentDark})`}
                    color="white"
                    boxShadow="0 6px 18px color-mix(in srgb, color-mix(in srgb, var(--brand-primary) 60%, var(--brand-dark)) 40%, transparent)"
                    border="3px solid color-mix(in srgb, var(--brand-bg) 95%, transparent)"
                    position="relative"
                  >
                    <Icon size={17} />
                    {cartCount > 0 && (
                      <Flex
                        position="absolute"
                        top="-4px"
                        right="-4px"
                        minW="18px"
                        h="18px"
                        px="4px"
                        borderRadius="full"
                        bg="#C0392B"
                        color="white"
                        fontSize="10px"
                        fontWeight={800}
                        align="center"
                        justify="center"
                        fontFamily='var(--font-body)'
                      >
                        {cartCount}
                      </Flex>
                    )}
                  </Flex>
                  <Text
                    fontSize="10px"
                    fontWeight={700}
                    mt="2px"
                    color={active ? C.accentDark : C.brown}
                    fontFamily='var(--font-body)'
                  >
                    {item.label}
                  </Text>
                </Flex>
              );
            }

            return (
              <Flex
                key={item.href}
                as="a"
                href={item.href}
                direction="column"
                align="center"
                justify="center"
                gap="3px"
                flex={1}
                color={active ? C.accentDark : C.muted}
                aria-label={item.label}
                aria-current={active ? 'page' : undefined}
                position="relative"
              >
                <Icon size={17} />
                <Text
                  fontSize="10px"
                  fontWeight={active ? 800 : 600}
                  fontFamily='var(--font-body)'
                >
                  {item.label}
                </Text>
                {active && (
                  <Box position="absolute" top="0" w="18px" h="3px" borderRadius="full" bg={C.accent} />
                )}
              </Flex>
            );
          })}
        </Flex>
      </Box>
    </>
  );
}
