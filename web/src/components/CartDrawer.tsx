"use client";

import React, { useMemo, useEffect } from 'react';
import {
  Box, Text, VStack, Flex, Image, Portal, Drawer, CloseButton,
} from '@chakra-ui/react';
import { motion, AnimatePresence } from 'framer-motion';
import { Icon } from './ui/Icon';
import Chakra from './ChakraProvider';
import { useCartStore, type CartItem } from './stores/car.store';
import UserBalanceDisplay from './GetWallet';
import { useT, formatPrice } from '../i18n';
import { useLangStore } from './stores/lang.store';
import { fmtDate, fmtTime } from '../utils/formatDate';
import { tr } from '../utils/localized';

import { optimizedImage, withOriginalFallback } from '../utils/img';
const MotionBox = motion(Box as any);
const MotionFlex = motion(Flex as any);

// Paleta del carrito: solo tokens del estilo (presets.css)
const C = {
  accent: 'var(--accent-text)', brown: 'var(--page-text)', heading: 'var(--heading-color)',
  textMuted: 'var(--text-muted)', textLight: 'var(--text-subtle)',
  bg: 'var(--page-bg)', cardBg: 'var(--surface)',
  border: 'var(--surface-border)', borderMuted: 'var(--border-neutral)',
};

function useLocale() {
  const lang = useLangStore(s => s.lang);
  return lang === 'en' ? 'en-GB' : 'es-ES';
}

function CartItemRow({ item, onRemove }: { item: CartItem; onRemove: () => void }) {
  const t = useT();
  const locale = useLocale();
  const lang = useLangStore(s => s.lang);
  return (
    <MotionBox
      layout
      initial={{ opacity: 0, x: 32 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 32, height: 0, marginBottom: 0, overflow: 'hidden' }}
      transition={{ duration: 0.28, ease: [0.25, 0.46, 0.45, 0.94] }}
      className="sk-card"
      p={3}
      w="full"
    >
      <Flex gap={3} align="center">
        {/* Thumbnail */}
        <Box
          w="68px" h="68px" borderRadius="var(--radius-input)" overflow="hidden"
          flexShrink={0} bg="var(--accent-soft)"
        >
          {item.image ? (
            <Image
              src={optimizedImage(item.image, 256)} onError={withOriginalFallback(item.image)} alt={tr(item, 'title', lang)}
              w="full" h="full" objectFit="cover"
            />
          ) : (
            <Flex w="full" h="full" align="center" justify="center">
              <Icon name="leaf" size={18} color="var(--accent)" />
            </Flex>
          )}
        </Box>

        {/* Info */}
        <Flex flex={1} direction="column" gap={1} minW={0}>
          <Text
            fontFamily='var(--font-body)'
            fontWeight={700} fontSize="sm" color={C.brown}
            overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap"
          >
            {tr(item, 'title', lang)}
          </Text>
          <Text
            fontFamily='var(--font-body)'
            fontSize="11px" color={C.textMuted}
          >
            {fmtDate(item.sessionDate, locale, { weekday: 'short', day: 'numeric', month: 'short' })}
            {' · '}
            {fmtTime(item.sessionDate, locale, { hour: '2-digit', minute: '2-digit' })}
          </Text>
          <Flex gap={1.5} align="center" mt={0.5}>
            <Box
              px={2} py={0.5} borderRadius="full"
              bg="var(--accent-soft)" border="1px solid var(--accent-border)"
            >
              <Text fontSize="10px" fontWeight={700} color={C.accent}
                fontFamily='var(--font-body)'>
                {item.credits} {item.credits !== 1 ? t('cart.credits') : t('cart.credit')}
              </Text>
            </Box>
            {item.price > 0 && (
              <Text fontSize="11px" color={C.textMuted}
                fontFamily='var(--font-body)' fontWeight={600}>
                {formatPrice(item.price, lang)}
              </Text>
            )}
          </Flex>
        </Flex>

        {/* Remove */}
        <Box
          as="button"
          onClick={onRemove}
          aria-label={t('checkout.deleteLabel')}
          w="32px" h="32px" borderRadius="full" flexShrink={0}
          display="flex" alignItems="center" justifyContent="center"
          bg="var(--surface-muted)" border="1px solid var(--border-neutral)"
          cursor="pointer" transition="all 0.2s"
          _hover={{ bg: 'var(--danger-soft)', borderColor: 'var(--danger)' }}
        >
          <Icon name="trash" size={11} color={C.textMuted} />
        </Box>
      </Flex>
    </MotionBox>
  );
}

function EmptyState() {
  const t = useT();
  return (
    <Flex direction="column" align="center" justify="center" flex={1} py={16} gap={4}>
      <Flex
        w="72px" h="72px" borderRadius="full" align="center" justify="center"
        bg="var(--accent-soft)" border="1px solid var(--accent-border)"
      >
        <Icon name="bag" size={24} color={C.textLight} />
      </Flex>
      <VStack gap={1} textAlign="center">
        <Text fontFamily='var(--font-heading)'
          fontSize="xl" color={C.heading} letterSpacing="0.04em">
          {t('cart.emptyTitle')}
        </Text>
        <Text fontFamily='var(--font-body)'
          fontSize="sm" color={C.textMuted} maxW="200px" lineHeight="1.6">
          {t('cart.emptyDesc')}
        </Text>
      </VStack>
    </Flex>
  );
}

interface CartDrawerProps {
  open: boolean;
  onClose: () => void;
}

function CartDrawerInner({ open, onClose }: CartDrawerProps) {
  const t = useT();
  const lang = useLangStore(s => s.lang);
  const items = useCartStore(s => s.items);
  const removeItem = useCartStore(s => s.removeItem);
  const clearCart = useCartStore(s => s.clearCart);

  const totalCredits = useMemo(() => items.reduce((a, i) => a + (Number(i.credits) || 0), 0), [items]);
  const totalPrice   = useMemo(() => items.reduce((a, i) => a + (Number(i.price)   || 0), 0), [items]);

  useEffect(() => {
    const now = new Date();
    const current = useCartStore.getState().items;
    const future = current.filter(i => new Date(i.sessionDate).getTime() >= now.getTime());
    if (future.length < current.length) useCartStore.setState({ items: future });
  }, []);

  return (
    <Drawer.Root
      open={open}
      onOpenChange={({ open: o }) => { if (!o) onClose(); }}
      placement="end"
      size="sm"
    >
      <Portal>
        <Drawer.Backdrop
          bg="var(--overlay)"
          backdropFilter="var(--surface-blur)"
          style={{ WebkitBackdropFilter: 'var(--surface-blur)' }}
        />
        <Drawer.Positioner>
          <Drawer.Content
            bg={C.bg}
            color={C.brown}
            maxW="400px"
            w="full"
            boxShadow="var(--shadow-float)"
            display="flex"
            flexDirection="column"
          >
            {/* ── Header ── */}
            <Drawer.Header
              px={6} pt={6} pb={4}
              borderBottom={`1px solid ${C.borderMuted}`}
              bg="var(--section-bg)"
              flexShrink={0}
            >
              <Flex align="center" justify="space-between">
                <Flex align="center" gap={3}>
                  <Text
                    fontFamily='var(--font-heading)'
                    fontSize="2xl" color={C.heading}
                    letterSpacing="0.05em" lineHeight="1"
                  >
                    {t('cart.title')}
                  </Text>
                  {items.length > 0 && (
                    <Box
                      px={2.5} py={0.5} borderRadius="full"
                      bg="var(--accent-soft)" border="1px solid var(--accent-border)"
                    >
                      <Text fontSize="11px" fontWeight={700} color={C.accent}
                        fontFamily='var(--font-body)'>
                        {items.length}
                      </Text>
                    </Box>
                  )}
                </Flex>
                <Drawer.CloseTrigger asChild>
                  <CloseButton
                    onClick={onClose} size="sm" borderRadius="full"
                    bg="var(--surface-muted)" border="1px solid var(--border-neutral)"
                    color={C.brown}
                    _hover={{ bg: 'var(--surface-strong)' }} cursor="pointer"
                  />
                </Drawer.CloseTrigger>
              </Flex>

              {/* Balance display */}
              <Flex align="center" gap={2} mt={3}
                px={3} py={2} borderRadius="var(--radius-input)"
                bg={C.cardBg} border={`1px solid ${C.border}`}
                backdropFilter="var(--surface-blur)"
                style={{ WebkitBackdropFilter: 'var(--surface-blur)' }}
              >
                <Text fontFamily='var(--font-body)'
                  fontSize="12px" color={C.textMuted} fontWeight={600}>
                  {t('cart.balance')}
                </Text>
                <UserBalanceDisplay fontSize="sm" color={C.accent} showUnit={true} />
              </Flex>
            </Drawer.Header>

            {/* ── Body ── */}
            <Drawer.Body
              px={5} py={5} flex={1}
              overflowY="auto"
              css={{
                '&::-webkit-scrollbar': { width: '4px' },
                '&::-webkit-scrollbar-track': { background: 'var(--surface-muted)' },
                '&::-webkit-scrollbar-thumb': { background: 'var(--accent-border)', borderRadius: '4px' },
                scrollbarWidth: 'thin',
              }}
              display="flex"
              flexDirection="column"
            >
              {items.length === 0 ? (
                <EmptyState />
              ) : (
                <VStack gap={3} align="stretch">
                  <AnimatePresence mode="popLayout">
                    {items.map(item => (
                      <CartItemRow
                        key={item.id}
                        item={item}
                        onRemove={() => removeItem(item.id)}
                      />
                    ))}
                  </AnimatePresence>
                </VStack>
              )}
            </Drawer.Body>

            {/* ── Footer ── */}
            {items.length > 0 && (
              <Drawer.Footer
                px={5} pt={4} pb={6}
                borderTop={`1px solid ${C.borderMuted}`}
                bg="var(--page-bg-alt)"
                flexShrink={0}
              >
                <VStack w="full" gap={3}>
                  {/* Summary */}
                  <Box
                    w="full" px={4} py={3} borderRadius="var(--radius-input)"
                    bg={C.cardBg} border={`1px solid ${C.border}`}
                    backdropFilter="var(--surface-blur)"
                    style={{ WebkitBackdropFilter: 'var(--surface-blur)' }}
                  >
                    <Flex justify="space-between" align="center" mb={2}>
                      <Text fontFamily='var(--font-body)'
                        fontSize="12px" color={C.textMuted} fontWeight={600}>
                        {t('cart.creditsToUse')}
                      </Text>
                      <Text fontFamily='var(--font-heading)'
                        fontSize="lg" color={C.accent} letterSpacing="0.04em">
                        {totalCredits} {totalCredits !== 1 ? t('cart.credits') : t('cart.credit')}
                      </Text>
                    </Flex>
                    <Box w="full" h="1px" bg={C.borderMuted} mb={2} />
                    <Flex justify="space-between" align="center">
                      <Text fontFamily='var(--font-body)'
                        fontSize="12px" color={C.textMuted} fontWeight={600}>
                        {t('cart.total')}
                      </Text>
                      <Text fontFamily='var(--font-heading)'
                        fontSize="xl" color={C.heading} letterSpacing="0.04em">
                        {formatPrice(totalPrice, lang)}
                      </Text>
                    </Flex>
                  </Box>

                  {/* Checkout CTA */}
                  <Box
                    as="a" href="/checkout" w="full"
                    className="sk-btn"
                    display="flex" alignItems="center" justifyContent="center"
                    h="50px"
                    fontFamily='var(--font-body)'
                    fontSize="sm"
                    cursor="pointer"
                  >
                    {t('cart.checkout')}
                  </Box>

                  {/* Clear cart */}
                  <Box
                    as="button" onClick={clearCart} w="full"
                    h="38px" borderRadius="var(--radius-button)"
                    bg="transparent"
                    border="1px solid var(--accent-border)"
                    color={C.textMuted}
                    fontFamily='var(--font-body)'
                    fontWeight={600} fontSize="12px"
                    cursor="pointer" transition="all 0.2s"
                    _hover={{ bg: 'var(--accent-soft)', color: C.brown }}
                    display="flex" alignItems="center" justifyContent="center"
                  >
                    {t('cart.clear')}
                  </Box>
                </VStack>
              </Drawer.Footer>
            )}
          </Drawer.Content>
        </Drawer.Positioner>
      </Portal>
    </Drawer.Root>
  );
}

export const CartDrawer = ({ open, onClose }: CartDrawerProps) => (
  <Chakra>
    <CartDrawerInner open={open} onClose={onClose} />
  </Chakra>
);
