"use client";

import React, { useMemo, useEffect } from 'react';
import {
  Box, Text, VStack, Flex, Image, Portal, Drawer, CloseButton,
} from '@chakra-ui/react';
import { motion, AnimatePresence } from 'framer-motion';
import { FaTrash, FaLeaf, FaShoppingBag } from 'react-icons/fa';
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

const C = {
  accent: 'var(--brand-primary)', accentDark: 'color-mix(in srgb, var(--brand-primary) 60%, var(--brand-dark))', brown: 'var(--brand-dark)',
  textMuted: 'color-mix(in srgb, var(--brand-secondary) 88%, var(--brand-dark))', textLight: 'color-mix(in srgb, var(--brand-secondary) 65%, white)',
  bg: 'var(--brand-bg)', cardBg: 'rgba(255,255,255,0.72)',
  border: 'rgba(255,255,255,0.80)', borderMuted: 'color-mix(in srgb, var(--brand-primary) 18%, transparent)',
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
      borderRadius="18px"
      bg={C.cardBg}
      border={`1px solid ${C.border}`}
      backdropFilter="blur(16px)"
      style={{ WebkitBackdropFilter: 'blur(16px)' }}
      boxShadow="0 2px 12px color-mix(in srgb, var(--brand-dark) 6%, transparent)"
      p={3}
      w="full"
    >
      <Flex gap={3} align="center">
        {/* Thumbnail */}
        <Box
          w="68px" h="68px" borderRadius="12px" overflow="hidden"
          flexShrink={0} bg="linear-gradient(135deg, color-mix(in srgb, var(--brand-primary) 50%, white), color-mix(in srgb, var(--brand-primary) 72%, white))"
        >
          {item.image ? (
            <Image
              src={optimizedImage(item.image, 256)} onError={withOriginalFallback(item.image)} alt={tr(item, 'title', lang)}
              w="full" h="full" objectFit="cover"
            />
          ) : (
            <Flex w="full" h="full" align="center" justify="center">
              <FaLeaf size={18} color="rgba(255,255,255,0.45)" />
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
              bg="color-mix(in srgb, var(--brand-primary) 12%, transparent)" border={`1px solid ${C.borderMuted}`}
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
          bg="rgba(255,255,255,0.55)" border="1px solid color-mix(in srgb, var(--brand-primary) 15%, transparent)"
          cursor="pointer" transition="all 0.2s"
          _hover={{ bg: 'rgba(220,80,60,0.08)', borderColor: 'rgba(220,80,60,0.25)' }}
        >
          <FaTrash size={11} color={C.textMuted} />
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
        bg="color-mix(in srgb, var(--brand-primary) 9%, transparent)" border={`1px solid ${C.borderMuted}`}
      >
        <FaShoppingBag size={24} color={C.textLight} />
      </Flex>
      <VStack gap={1} textAlign="center">
        <Text fontFamily='var(--font-heading)'
          fontSize="xl" color={C.brown} letterSpacing="0.04em">
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
          bg="color-mix(in srgb, color-mix(in srgb, var(--brand-dark) 50%, black) 45%, transparent)"
          backdropFilter="blur(6px)"
          style={{ WebkitBackdropFilter: 'blur(6px)' }}
        />
        <Drawer.Positioner>
          <Drawer.Content
            bg={C.bg}
            maxW="400px"
            w="full"
            boxShadow="-12px 0 60px color-mix(in srgb, color-mix(in srgb, var(--brand-dark) 50%, black) 14%, transparent)"
            display="flex"
            flexDirection="column"
          >
            {/* ── Header ── */}
            <Drawer.Header
              px={6} pt={6} pb={4}
              borderBottom={`1px solid ${C.borderMuted}`}
              bg="linear-gradient(160deg, color-mix(in srgb, var(--brand-primary) 22%, white) 0%, var(--brand-bg) 100%)"
              flexShrink={0}
            >
              <Flex align="center" justify="space-between">
                <Flex align="center" gap={3}>
                  <Text
                    fontFamily='var(--font-heading)'
                    fontSize="2xl" color={C.brown}
                    letterSpacing="0.05em" lineHeight="1"
                  >
                    {t('cart.title')}
                  </Text>
                  {items.length > 0 && (
                    <Box
                      px={2.5} py={0.5} borderRadius="full"
                      bg="color-mix(in srgb, var(--brand-primary) 15%, transparent)" border={`1px solid ${C.borderMuted}`}
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
                    bg="rgba(255,255,255,0.55)" border="1px solid rgba(255,255,255,0.70)"
                    _hover={{ bg: 'white' }} cursor="pointer"
                  />
                </Drawer.CloseTrigger>
              </Flex>

              {/* Balance display */}
              <Flex align="center" gap={2} mt={3}
                px={3} py={2} borderRadius="12px"
                bg="rgba(255,255,255,0.55)" border={`1px solid ${C.border}`}
                backdropFilter="blur(12px)"
                style={{ WebkitBackdropFilter: 'blur(12px)' }}
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
                '&::-webkit-scrollbar-track': { background: 'color-mix(in srgb, var(--brand-primary) 6%, transparent)' },
                '&::-webkit-scrollbar-thumb': { background: 'color-mix(in srgb, var(--brand-primary) 22%, transparent)', borderRadius: '4px' },
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
                bg="linear-gradient(180deg, color-mix(in srgb, var(--brand-primary) 17%, white) 0%, color-mix(in srgb, var(--brand-primary) 22%, white) 100%)"
                flexShrink={0}
              >
                <VStack w="full" gap={3}>
                  {/* Summary */}
                  <Box
                    w="full" px={4} py={3} borderRadius="14px"
                    bg="rgba(255,255,255,0.60)" border={`1px solid ${C.border}`}
                    backdropFilter="blur(12px)"
                    style={{ WebkitBackdropFilter: 'blur(12px)' }}
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
                        fontSize="xl" color={C.brown} letterSpacing="0.04em">
                        {formatPrice(totalPrice, lang)}
                      </Text>
                    </Flex>
                  </Box>

                  {/* Checkout CTA */}
                  <Box
                    as="a" href="/checkout" w="full"
                    display="flex" alignItems="center" justifyContent="center"
                    h="50px" borderRadius="14px"
                    bg={`linear-gradient(135deg, ${C.accent}, ${C.accentDark})`}
                    color="white"
                    fontFamily='var(--font-body)'
                    fontWeight={700} fontSize="sm"
                    letterSpacing="0.03em"
                    cursor="pointer"
                    boxShadow="0 6px 20px color-mix(in srgb, var(--brand-primary) 32%, transparent)"
                    transition="all 0.22s ease"
                    _hover={{ boxShadow: '0 10px 28px color-mix(in srgb, var(--brand-primary) 42%, transparent)', opacity: 0.93 }}
                  >
                    {t('cart.checkout')}
                  </Box>

                  {/* Clear cart */}
                  <Box
                    as="button" onClick={clearCart} w="full"
                    h="38px" borderRadius="12px"
                    bg="transparent"
                    border={`1px solid color-mix(in srgb, var(--brand-primary) 28%, transparent)`}
                    color={C.textMuted}
                    fontFamily='var(--font-body)'
                    fontWeight={600} fontSize="12px"
                    cursor="pointer" transition="all 0.2s"
                    _hover={{ bg: 'color-mix(in srgb, var(--brand-primary) 8%, transparent)', color: C.brown }}
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
