"use client";

import { useState, useEffect } from 'react';
import { cachedFetch } from '../utils/fetchCache';
import {
  Box, Flex, Text, Spinner, SimpleGrid, Button, Center, VStack,
} from '@chakra-ui/react';
import { motion, AnimatePresence } from 'framer-motion';
import Chakra from './ChakraProvider';
import { FaArrowRight, FaInfinity, FaCheck, FaBolt, FaTag, FaChevronDown, FaWhatsapp } from 'react-icons/fa';
import { useT, formatPrice, currencySymbol } from '../i18n';
import { useLangStore, withSsrLang } from './stores/lang.store';
import { planDisplayName } from '../utils/planUtils';
import { trStrict } from '../utils/localized';
import PlanFinder, { dropInPrice, idealFrequency, type FinderPlan } from './PlanFinder';
import { API_ROOT } from '../config';
import { useSite, whatsappUrl } from '../lib/site';
import PaymentsDisabledNotice from './PaymentsDisabledNotice';
import { paymentsEnabled } from '../utils/payments';
import { cancelMinHours } from '../utils/cancelPolicy';
import { useHydrated } from '../utils/useHydrated';

const MotionBox = motion(Box as any);
const MotionFlex = motion(Flex as any);

const API_BASE_URL = `${API_ROOT}/`;

const C = {
  accent: 'var(--brand-primary)',
  accentDark: 'color-mix(in srgb, var(--brand-primary) 78%, var(--brand-dark))',
  accentDeep: 'color-mix(in srgb, var(--brand-primary) 48%, var(--brand-dark))',
  brown: 'var(--brand-dark)',
  brownMid: 'color-mix(in srgb, var(--brand-primary) 28%, var(--brand-dark))',
  textMuted: 'color-mix(in srgb, var(--brand-secondary) 88%, var(--brand-dark))',
  textLight: 'color-mix(in srgb, var(--brand-secondary) 65%, white)',
  bgStart: 'color-mix(in srgb, var(--brand-primary) 22%, white)',
  bgMid: 'var(--brand-bg)',
  bgEnd: 'color-mix(in srgb, var(--brand-primary) 22%, white)',
  cardBg: 'rgba(255,255,255,0.65)',
  cardBorder: 'rgba(255,255,255,0.70)',
  cardShadow: '0 4px 24px color-mix(in srgb, var(--brand-dark) 7%, transparent)',
  cardShadowHover: '0 16px 48px color-mix(in srgb, var(--brand-dark) 14%, transparent)',
  // olive palette
  olive: '#6B7B3C',
  oliveDark: '#536030',
  oliveMid: '#7A8A45',
  oliveTint: 'rgba(107,123,60,0.09)',
  oliveBorder: 'rgba(107,123,60,0.22)',
};

interface ApiPlan {
  id: number; name: string; type: 'pack' | 'sub';
  credits: number; price_eur: string;
  credits_expire_days: number | null; is_active: boolean;
  description: string | null; saving: string | null;
  price_credit: string | null;
  interval?: string | null; interval_count?: number | null;
  name_en?: string | null; description_en?: string | null;
  translations?: Record<string, { name?: string; description?: string }> | null;
}

interface Plan {
  id: string; name: string; credits: number; price: number;
  pricePerCredit: number; description: string;
  recommended: boolean; type: 'pack' | 'sub';
  expireDays: number | null;
  renewalDays: number | null;
  saving: string | null;
  /** Meses por ciclo de cobro (Pro = 2, Elite = 3). Packs: 1. */
  months: number;
  name_en?: string | null; description_en?: string | null;
  translations?: Record<string, { name?: string; description?: string }> | null;
}

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.10 } },
};

const cardVariants = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.25, 0.46, 0.45, 0.94] } },
};

const tabVariants = {
  hidden: { opacity: 0, x: -10 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.3 } },
  exit: { opacity: 0, x: 10, transition: { duration: 0.2 } },
};

// ── PackCard ──────────────────────────────────────────────────────────────────

function PackCard({ plan, dropIn, highlighted }: { plan: Plan; dropIn: number; highlighted?: boolean }) {
  const t = useT();
  const lang = useLangStore(s => s.lang);
  const es = lang !== 'en';
  const perClass = plan.price / plan.credits;

  return (
    <MotionBox
      id={`plan-${plan.id}`}
      variants={cardVariants}
      position="relative"
      whileHover={{ y: -5 }}
      transition={{ duration: 0.25 }}
      cursor="pointer"
    >
      {(plan.recommended || highlighted) && (
        <Flex
          position="absolute" top="-14px" left="50%" transform="translateX(-50%)"
          zIndex={3} px={4} py={1} borderRadius="full"
          bg={`linear-gradient(135deg, ${C.accent}, ${C.accentDeep})`}
          color="white" fontSize="11px" fontWeight={700}
          letterSpacing="0.06em" textTransform="uppercase"
          boxShadow="0 4px 14px color-mix(in srgb, var(--brand-primary) 40%, transparent)"
          align="center" gap={1.5}
          fontFamily='var(--font-body)'
          whiteSpace="nowrap"
        >
          <FaBolt size={9} />
          {highlighted ? (es ? 'Tu recomendación' : 'Recommended for you') : t('plans.popular')}
        </Flex>
      )}

      <Box
        bg={C.cardBg}
        backdropFilter="blur(20px) saturate(180%)"
        style={{ WebkitBackdropFilter: 'blur(20px) saturate(180%)' }}
        borderRadius="24px"
        p={7}
        pt={plan.recommended || highlighted ? 10 : 7}
        border={plan.recommended || highlighted
          ? `1.5px solid color-mix(in srgb, var(--brand-primary) 40%, transparent)`
          : `1px solid ${C.cardBorder}`}
        boxShadow={plan.recommended
          ? `0 8px 32px color-mix(in srgb, var(--brand-primary) 18%, transparent), inset 0 1px 0 rgba(255,255,255,0.8)`
          : `${C.cardShadow}, inset 0 1px 0 rgba(255,255,255,0.8)`}
        h="100%" display="flex" flexDirection="column"
        transition="box-shadow 0.3s ease, border-color 0.3s ease"
        _hover={{ boxShadow: C.cardShadowHover, borderColor: 'color-mix(in srgb, var(--brand-primary) 35%, transparent)' }}
      >
        {/* Credits badge + expiry */}
        <Flex align="center" justify="space-between" mb={4}>
          <Box px={3} py={1} borderRadius="full"
            bg="color-mix(in srgb, var(--brand-primary) 10%, transparent)" border="1px solid color-mix(in srgb, var(--brand-primary) 20%, transparent)">
            <Text fontSize="12px" fontWeight={600} color={C.accent}
              fontFamily='var(--font-body)' letterSpacing="0.04em">
              {t('plans.credits', { n: String(plan.credits) })}
            </Text>
          </Box>
          {plan.expireDays && (
            <Text fontSize="11px" color={C.textLight} fontFamily='var(--font-body)'>
              {t('plans.validDays', { n: String(plan.expireDays) })}
            </Text>
          )}
        </Flex>

        {/* Saving badge */}
        {plan.saving && (
          <Flex align="center" gap={1.5} mb={3}
            px={3} py={1.5} borderRadius="full" w="fit-content"
            bg={C.oliveTint} border={`1px solid ${C.oliveBorder}`}>
            <FaTag size={9} color={C.olive} />
            <Text fontSize="11px" fontWeight={700} color={C.oliveDark}
              fontFamily='var(--font-body)'>
              {t('plans.saving', { saving: plan.saving })}
            </Text>
          </Flex>
        )}

        {/* Name */}
        <Text fontSize="lg" fontWeight={700} color={C.brown}
          fontFamily='var(--font-body)' mb={1} lineHeight="1.3">
          {planDisplayName(plan, lang)}
        </Text>

        {/* Price */}
        <Flex align="baseline" mb={0.5}>
          <Text fontSize="13px" color={C.textMuted} mr={0.5} fontFamily='var(--font-body)'>{currencySymbol(lang)}</Text>
          <Text fontSize="40px" fontWeight={800} color={C.brown} lineHeight="1"
            fontFamily='var(--font-heading)' letterSpacing="0.02em">
            {plan.price}
          </Text>
        </Flex>
        <Text fontSize="12px" color={C.textMuted} mb={4} fontFamily='var(--font-body)'>
          {perClass < dropIn
            ? (es ? `${formatPrice(perClass, lang)} por clase · suelta ${formatPrice(dropIn, lang, 'auto')}` : `${formatPrice(perClass, lang)} per class · drop-in ${formatPrice(dropIn, lang, 'auto')}`)
            : (es ? 'Precio de clase suelta' : 'Drop-in price')}
        </Text>

        {/* Description */}
        <Text fontSize="sm" color={C.textMuted} fontFamily='var(--font-body)'
          lineHeight="1.65" flex={1} mb={5}>
          {trStrict(plan, 'description', lang) || (es
            ? `${plan.credits} ${plan.credits === 1 ? 'crédito' : 'créditos'} para tus clases${plan.expireDays ? `, para usar en ${plan.expireDays} días` : ''}. Sin renovación automática.`
            : `${plan.credits} ${plan.credits === 1 ? 'credit' : 'credits'} for your classes${plan.expireDays ? `, to use within ${plan.expireDays} days` : ''}. No auto-renewal.`)}
        </Text>

        <Button
          onClick={() => { window.location.href = `/checkout?tab=credits&plan_id=${plan.id}`; }}
          w="full" size="md" borderRadius="12px" fontWeight={600}
          fontFamily='var(--font-body)' fontSize="sm"
          minH="48px"
          bg={plan.recommended || highlighted ? C.accent : 'transparent'}
          color={plan.recommended || highlighted ? 'white' : C.accent}
          border={plan.recommended || highlighted ? 'none' : `1.5px solid color-mix(in srgb, var(--brand-primary) 35%, transparent)`}
          cursor="pointer"
          _hover={plan.recommended || highlighted
            ? { bg: C.accentDark, boxShadow: '0 6px 20px color-mix(in srgb, var(--brand-primary) 35%, transparent)' }
            : { bg: 'color-mix(in srgb, var(--brand-primary) 8%, transparent)', borderColor: C.accent }}
          transition="all 0.22s ease"
          gap={2}
        >
          {t('plans.buyBtn')}
          <FaArrowRight size={11} />
        </Button>
      </Box>
    </MotionBox>
  );
}

// ── SubCard ───────────────────────────────────────────────────────────────────

function SubCard({ plan, dropIn, highlighted }: { plan: Plan; dropIn: number; highlighted?: boolean }) {
  const t = useT();
  const lang = useLangStore(s => s.lang);
  const es = lang !== 'en';

  // Todo se expresa POR MES aunque el ciclo de cobro sea de 2 o 3 meses
  // (Pro, Elite): así los planes se comparan de verdad entre sí.
  const months = plan.months || 1;
  const perMonthPrice = plan.price / months;
  const perMonthCredits = plan.credits / months;
  const perClass = plan.price / plan.credits;
  const savingPerMonth = Math.max(0, perMonthCredits * dropIn - perMonthPrice);
  const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace('.', es ? ',' : '.'));
  const round = (n: number) => String(Math.round(n));
  const cycle = months === 1
    ? (es ? '/mes' : '/month')
    : (es ? `cada ${months} meses` : `every ${months} months`);

  const perks = es
    ? [
        months === 1
          ? `${plan.credits} créditos al mes para tus clases`
          : `${plan.credits} clases cada ${months} meses (≈ ${round(perMonthCredits)} al mes)`,
        'Tus clases fijas se reservan solas',
        months === 1 ? 'Se renueva cada mes' : `Se cobra cada ${months} meses · créditos válidos ${plan.renewalDays || months * 30} días`,
        'Sin permanencia · cancela cuando quieras',
      ]
    : [
        months === 1
          ? `${plan.credits} credits a month for your classes`
          : `${plan.credits} classes every ${months} months (≈ ${round(perMonthCredits)} a month)`,
        'Your regular classes book themselves',
        months === 1 ? 'Renews monthly' : `Billed every ${months} months · credits valid ${plan.renewalDays || months * 30} days`,
        'No commitment · cancel anytime',
      ];

  return (
    <MotionBox
      id={`plan-${plan.id}`}
      variants={cardVariants}
      position="relative"
      whileHover={{ y: -5 }}
      transition={{ duration: 0.25 }}
      display="flex"
      flexDirection="column"
      h="100%"
    >
      {highlighted && (
        <Flex
          position="absolute" top="-14px" left="50%" transform="translateX(-50%)"
          zIndex={3} px={4} py={1} borderRadius="full"
          bg={`linear-gradient(135deg, ${C.accent}, ${C.accentDeep})`}
          color="white" fontSize="11px" fontWeight={700}
          letterSpacing="0.06em" textTransform="uppercase"
          boxShadow="0 4px 14px color-mix(in srgb, var(--brand-primary) 40%, transparent)"
          align="center" gap={1.5} whiteSpace="nowrap"
          fontFamily='var(--font-body)'
        >
          <FaCheck size={9} />
          {es ? 'Tu recomendación' : 'Recommended for you'}
        </Flex>
      )}
      <Box
        bg={C.cardBg}
        backdropFilter="blur(20px) saturate(180%)"
        style={{ WebkitBackdropFilter: 'blur(20px) saturate(180%)' }}
        borderRadius="24px"
        p={7}
        pt={highlighted ? 10 : 7}
        border={highlighted ? `2px solid ${C.accent}` : `1px solid ${C.cardBorder}`}
        boxShadow={highlighted
          ? '0 12px 40px color-mix(in srgb, var(--brand-primary) 28%, transparent), inset 0 1px 0 rgba(255,255,255,0.8)'
          : `${C.cardShadow}, inset 0 1px 0 rgba(255,255,255,0.8)`}
        h="100%" display="flex" flexDirection="column"
        transition="box-shadow 0.3s ease, border-color 0.3s ease"
        _hover={{ boxShadow: C.cardShadowHover, borderColor: 'color-mix(in srgb, var(--brand-primary) 45%, transparent)' }}
      >
        {/* Para quién es — lo primero que se entiende */}
        <Box px={3} py={1} mb={4} borderRadius="full" w="fit-content"
          bg="color-mix(in srgb, var(--brand-primary) 10%, transparent)" border="1px solid color-mix(in srgb, var(--brand-primary) 20%, transparent)">
          <Text fontSize="12px" fontWeight={700} color={C.accentDeep}
            fontFamily='var(--font-body)'>
            {es ? 'Ideal si vienes ' : 'Ideal if you come '}{idealFrequency(perMonthCredits, lang)}
          </Text>
        </Box>

        <Text fontSize="xl" fontWeight={800} color={C.brown}
          fontFamily='var(--font-body)' mb={1} lineHeight="1.3">
          {planDisplayName(plan, lang)}
        </Text>

        {/* Precio */}
        <Flex align="baseline" gap={1} mb={0.5}>
          <Text fontSize="44px" fontWeight={800} color={C.brown} lineHeight="1"
            fontFamily='var(--font-heading)' letterSpacing="0.02em">
            {formatPrice(plan.price, lang, 'auto')}
          </Text>
          <Text fontSize="sm" color={C.textMuted} fontFamily='var(--font-body)'>
            {cycle}
          </Text>
        </Flex>
        {months > 1 && (
          <Text fontSize="13px" fontWeight={700} color={C.accentDeep} fontFamily='var(--font-body)' mb={0.5}>
            {es ? `= ${formatPrice(Math.round(perMonthPrice), lang, 0)} al mes` : `= ${formatPrice(Math.round(perMonthPrice), lang, 0)} a month`}
          </Text>
        )}
        <Text fontSize="13px" color={C.textMuted} mb={3} fontFamily='var(--font-body)'>
          {es
            ? <>Sale a <b>{formatPrice(perClass, lang, 'auto')}</b> la clase <Text as="span" textDecoration="line-through" color={C.textLight}>{formatPrice(dropIn, lang, 'auto')}</Text></>
            : <>Only <b>{formatPrice(perClass, lang, 'auto')}</b> per class <Text as="span" textDecoration="line-through" color={C.textLight}>{formatPrice(dropIn, lang, 'auto')}</Text></>}
        </Text>

        {savingPerMonth > 0 && (
          <Flex align="center" gap={1.5} mb={4}
            px={3} py={1.5} borderRadius="full" w="fit-content"
            bg={C.oliveTint} border={`1px solid ${C.oliveBorder}`}>
            <FaTag size={9} color={C.olive} />
            <Text fontSize="12px" fontWeight={800} color={C.oliveDark}
              fontFamily='var(--font-body)'>
              {es ? `Ahorras ${formatPrice(Math.round(savingPerMonth), lang, 0)} al mes` : `You save ${formatPrice(Math.round(savingPerMonth), lang, 0)} a month`}
            </Text>
          </Flex>
        )}

        {/* Qué incluye */}
        <Box as="ul" listStyleType="none" m={0} p={0} flex={1} mb={5}>
          {perks.map((perk) => (
            <Flex as="li" key={perk} align="flex-start" gap={2} mb={2}>
              <Box mt="3px" flexShrink={0}><FaCheck size={11} color="#2D7D46" /></Box>
              <Text fontSize="sm" color={C.brownMid} fontFamily='var(--font-body)' lineHeight="1.5">
                {perk}
              </Text>
            </Flex>
          ))}
        </Box>

        <Button
          onClick={() => { window.location.href = `/checkout?tab=subscription&plan_id=${plan.id}`; }}
          w="full" minH="50px" borderRadius="14px" fontWeight={800}
          fontFamily='var(--font-body)' fontSize="md"
          bg={`linear-gradient(135deg, ${C.accent}, ${C.accentDeep})`} color="white" cursor="pointer"
          boxShadow="0 6px 18px color-mix(in srgb, color-mix(in srgb, var(--brand-primary) 48%, var(--brand-dark)) 28%, transparent)"
          _hover={{ opacity: 0.92, boxShadow: '0 8px 24px color-mix(in srgb, color-mix(in srgb, var(--brand-primary) 48%, var(--brand-dark)) 35%, transparent)' }}
          transition="all 0.22s ease"
          gap={2}
        >
          {es ? `Elegir ${planDisplayName(plan, lang)}` : `Choose ${planDisplayName(plan, lang)}`}
          <FaArrowRight size={12} />
        </Button>
      </Box>
    </MotionBox>
  );
}

// ── Qué es un crédito · FAQ ───────────────────────────────────────────────────

function CreditsExplainer({ dropIn }: { dropIn: number }) {
  const lang = useLangStore(s => s.lang);
  const es = lang !== 'en';
  const items = es
    ? [
        { big: '1', unit: 'crédito', text: '= 1 clase (lo normal)' },
        { big: '2+', unit: 'créditos', text: '= clases especiales (cada clase indica cuántos usa)' },
        { big: formatPrice(dropIn, 'es', 'auto'), unit: '', text: 'es lo que cuesta una clase suelta — con un plan pagas menos' },
      ]
    : [
        { big: '1', unit: 'credit', text: '= 1 class (most classes)' },
        { big: '2+', unit: 'credits', text: '= special classes (each class shows how many it uses)' },
        { big: formatPrice(dropIn, 'en', 'auto'), unit: '', text: 'is a drop-in class — with a plan you pay less' },
      ];
  return (
    <SimpleGrid columns={{ base: 1, md: 3 }} gap={3} maxW="900px" mx="auto" mb={10}>
      {items.map((it) => (
        <Flex key={it.text} align="center" gap={3} p={4} borderRadius="18px"
          bg="rgba(255,255,255,0.55)" border="1px solid rgba(255,255,255,0.70)">
          <Box textAlign="center" minW="64px">
            <Text fontFamily='var(--font-heading)' fontSize="3xl" color={C.accentDeep} lineHeight="1">{it.big}</Text>
            {it.unit && <Text fontFamily='var(--font-body)' fontSize="10px" fontWeight={700} color={C.accent} textTransform="uppercase">{it.unit}</Text>}
          </Box>
          <Text fontFamily='var(--font-body)' fontSize="sm" color={C.brownMid} lineHeight="1.5">{it.text}</Text>
        </Flex>
      ))}
    </SimpleGrid>
  );
}

/**
 * "¿Sigues con dudas?": ayuda para elegir por WhatsApp (solo si el estudio lo
 * tiene). Las preguntas frecuentes son las del panel y se pintan en el
 * servidor (components/seo/FaqList.astro), fuera de esta isla.
 */
function PlansHelp() {
  const lang = useLangStore(s => s.lang);
  const es = lang !== 'en';
  const site = useSite();
  if (!whatsappUrl(site)) return null;
  return (
    <Flex direction="column" align="center" mt={12} gap={3}>
      <Text fontFamily='var(--font-body)' fontSize="sm" color={C.textMuted} textAlign="center">
        {es ? '¿Sigues con dudas? Te ayudamos a elegir en un minuto.' : 'Still unsure? We’ll help you choose in a minute.'}
      </Text>
      <Button as="a"
        href={whatsappUrl(site, es ? 'Hola, ¿qué plan me recomendáis?' : 'Hi, which plan would you recommend?')}
        target="_blank" rel="noopener"
        minH="48px" px={6} borderRadius="full" bg="#25D366" color="white"
        fontFamily='var(--font-body)' fontWeight={800}
        _hover={{ opacity: 0.9 }} gap={2}>
        <FaWhatsapp size={16} />
        {es ? 'Pregúntanos por WhatsApp' : 'Ask us on WhatsApp'}
      </Button>
    </Flex>
  );
}

// ── Tab + Content wrapper ────────────────────────────────────────────────────

type Tab = 'packs' | 'subs';

function PlansContent({ packs, subs }: { packs: Plan[]; subs: Plan[] }) {
  // La membresía es lo que queremos explicar primero (más barata y con reserva automática)
  const [activeTab, setActiveTab] = useState<Tab>(subs.length > 0 ? 'subs' : 'packs');
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const hydrated = useHydrated();
  const t = useT();
  const lang = useLangStore(s => s.lang);

  const toFinder = (p: Plan): FinderPlan => ({
    id: p.id, name: planDisplayName(p, lang), credits: p.credits, price: p.price, type: p.type,
    validDays: p.type === 'pack' ? p.expireDays : p.renewalDays,
    months: p.months,
  });
  const dropIn = dropInPrice(packs.map(toFinder));

  const seeAll = (tab: Tab, planId?: string) => {
    setActiveTab(tab);
    setHighlightId(planId || null);
    // Tras cambiar de pestaña, ir directo a la tarjeta recomendada (centrada)
    setTimeout(() => {
      const target = (planId && document.getElementById(`plan-${planId}`))
        || document.getElementById('todos-los-planes');
      target?.scrollIntoView({ behavior: 'smooth', block: planId ? 'center' : 'start' });
    }, 350);
  };

  return (
    <Box py={{ base: 14, md: 24 }} px={{ base: 4, md: 6 }}
      bg={`linear-gradient(160deg, ${C.bgStart} 0%, ${C.bgMid} 50%, ${C.bgEnd} 100%)`}
      position="relative"
      // clip (no hidden): las manchas decorativas sobresalen y con 'hidden' el
      // contenedor sigue siendo desplazable — al enfocar un botón el navegador
      // lo movía de lado y la página aparecía descuadrada en móvil.
      css={{ overflow: 'hidden', '@supports (overflow: clip)': { overflow: 'clip' } }}
    >
      {/* Decorative blobs */}
      <Box position="absolute" top="-80px" right="-80px" w="400px" h="400px"
        borderRadius="full" bg="color-mix(in srgb, var(--brand-primary) 7%, transparent)" filter="blur(60px)" pointerEvents="none" />
      <Box position="absolute" bottom="-60px" left="-60px" w="350px" h="350px"
        borderRadius="full" bg="rgba(107,123,60,0.05)" filter="blur(50px)" pointerEvents="none" />

      <Box maxW="6xl" mx="auto" position="relative" zIndex={1}>

        {/* Header */}
        <MotionFlex
          direction="column" align="center" mb={12}
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <Box px={4} py={1.5} borderRadius="full" mb={4}
            bg="color-mix(in srgb, var(--brand-primary) 12%, transparent)" border="1px solid color-mix(in srgb, var(--brand-primary) 25%, transparent)">
            <Text fontSize="11px" fontWeight={700} color={C.accent}
              fontFamily='var(--font-body)' letterSpacing="0.10em" textTransform="uppercase">
              {t('plans.badge')}
            </Text>
          </Box>
          <Text
            fontSize={{ base: '3xl', md: '5xl', lg: '6xl' }}
            fontWeight="bold" color={C.brown} textAlign="center"
            fontFamily='var(--font-heading)' letterSpacing="wide" lineHeight="1.1"
          >
            {t('plans.title')}
          </Text>
          <Text fontSize={{ base: 'md', md: 'lg' }} color={C.textMuted}
            fontFamily='var(--font-body)' mt={3} maxW="480px" textAlign="center" lineHeight="1.7">
            {t('plans.subtitle')}
          </Text>
        </MotionFlex>

        {/* Sin pagos online: los precios se ven, pero la compra es en el estudio */}
        {!paymentsEnabled() && (
          <Box maxW="640px" mx="auto" mb={10} p={{ base: 5, md: 6 }} borderRadius="22px"
            bg="rgba(255,255,255,0.75)" border="1px solid color-mix(in srgb, var(--brand-primary) 25%, transparent)">
            <PaymentsDisabledNotice />
          </Box>
        )}

        {/* Asistente guiado: 3 preguntas → plan recomendado */}
        {(packs.length > 0 || subs.length > 0) && (
          <PlanFinder packs={packs.map(toFinder)} subs={subs.map(toFinder)} onSeeAll={seeAll} />
        )}

        <CreditsExplainer dropIn={dropIn} />

        <Box id="todos-los-planes" style={{ scrollMarginTop: '90px' }} />

        {/* Tab toggle */}
        {packs.length > 0 && subs.length > 0 && (
          <MotionFlex
            justify="center" mb={12}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.15 }}
          >
            <Flex
              bg="rgba(255,255,255,0.55)"
              backdropFilter="blur(16px)"
              style={{ WebkitBackdropFilter: 'blur(16px)' }}
              borderRadius="full" p={1.5}
              border="1px solid rgba(255,255,255,0.70)"
              boxShadow="0 4px 20px color-mix(in srgb, var(--brand-dark) 8%, transparent)"
              gap={1}
            >
              {([
                { key: 'subs' as const, labelKey: 'plans.tabSubs', icon: FaInfinity },
                { key: 'packs' as const, labelKey: 'plans.tabPacks', icon: FaBolt },
              ]).map(({ key, labelKey, icon: Icon }) => (
                <Button
                  key={key}
                  onClick={() => setActiveTab(key)}
                  borderRadius="full"
                  px={{ base: 4, md: 6 }} py={2}
                  fontSize={{ base: 'xs', md: 'sm' }}
                  fontWeight={600}
                  fontFamily='var(--font-body)'
                  cursor="pointer"
                  bg={activeTab === key
                    ? `linear-gradient(135deg, ${C.accent}, ${C.accentDeep})`
                    : 'transparent'}
                  color={activeTab === key ? 'white' : C.textMuted}
                  boxShadow={activeTab === key ? '0 4px 14px color-mix(in srgb, var(--brand-primary) 30%, transparent)' : 'none'}
                  _hover={activeTab !== key ? { color: C.brown, bg: 'color-mix(in srgb, var(--brand-primary) 6%, transparent)' } : {}}
                  transition="all 0.25s ease"
                  gap={1.5}
                  border="none"
                  minH="40px"
                >
                  <Icon size={12} />
                  {t(labelKey)}
                </Button>
              ))}
            </Flex>
          </MotionFlex>
        )}

        {/* Content */}
        <AnimatePresence mode="wait">
          {activeTab === 'packs' && packs.length > 0 && (
            <motion.div key="packs" variants={tabVariants} initial="hidden" animate="visible" exit="exit">
              <SimpleGrid
                as={motion.div}
                variants={containerVariants}
                initial="hidden"
                animate="visible"
                columns={{ base: 1, sm: 2, lg: 4 }}
                gap={6}
              >
                {packs.map(plan => <PackCard key={plan.id} plan={plan} dropIn={dropIn} highlighted={highlightId === plan.id} />)}
              </SimpleGrid>
              <MotionFlex justify="center" mt={10}
                initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                transition={{ delay: 0.5, duration: 0.4 }}>
                <Box px={5} py={3} borderRadius="2xl"
                  bg="rgba(255,255,255,0.50)" border="1px solid rgba(255,255,255,0.65)"
                  backdropFilter="blur(12px)" style={{ WebkitBackdropFilter: 'blur(12px)' }}>
                  <Text fontSize="sm" color={C.textMuted}
                    fontFamily='var(--font-body)' textAlign="center">
                    {t('plans.packFooter')}
                  </Text>
                </Box>
              </MotionFlex>
            </motion.div>
          )}

          {activeTab === 'subs' && subs.length > 0 && (
            <motion.div key="subs" variants={tabVariants} initial="hidden" animate="visible" exit="exit">
              <Flex justify="center">
                <SimpleGrid
                  as={motion.div}
                  variants={containerVariants}
                  initial="hidden"
                  animate="visible"
                  columns={{ base: 1, md: 2, xl: Math.min(subs.length, 4) }}
                  gap={6}
                  maxW="1200px"
                  w="full"
                >
                  {subs.map(plan => <SubCard key={plan.id} plan={plan} dropIn={dropIn} highlighted={highlightId === plan.id} />)}
                </SimpleGrid>
              </Flex>
              <MotionFlex justify="center" mt={10}
                initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                transition={{ delay: 0.5, duration: 0.4 }}>
                <Box px={5} py={3} borderRadius="2xl"
                  bg="rgba(255,255,255,0.50)" border="1px solid rgba(255,255,255,0.65)"
                  backdropFilter="blur(12px)" style={{ WebkitBackdropFilter: 'blur(12px)' }}>
                  <Text fontSize="sm" color={C.textMuted}
                    fontFamily='var(--font-body)' textAlign="center">
                    {t('plans.subFooter')}{paymentsEnabled() ? ` ${t('plans.subFooterPay')}` : ''}
                  </Text>
                </Box>
              </MotionFlex>
            </motion.div>
          )}
        </AnimatePresence>

        {/* HTML del servidor: la pestaña no activa también va en el HTML (oculta)
            para que buscadores e IA vean todos los precios. Tras hidratar, solo
            la pestaña activa (como siempre). */}
        {!hydrated && (
          <div hidden>
            {activeTab !== 'packs' && packs.map(plan => <PackCard key={plan.id} plan={plan} dropIn={dropIn} />)}
            {activeTab !== 'subs' && subs.map(plan => <SubCard key={plan.id} plan={plan} dropIn={dropIn} />)}
          </div>
        )}

        {packs.length === 0 && subs.length === 0 && (
          <Center py={20}>
            <Text color={C.textMuted} fontFamily='var(--font-body)' fontSize="lg">
              {t('plans.noPlans')}
            </Text>
          </Center>
        )}

        {(packs.length > 0 || subs.length > 0) && <PlansHelp />}
      </Box>
    </Box>
  );
}

// ── Root export ──────────────────────────────────────────────────────────────

/** Plan del API → formato de las tarjetas. */
function formatPlan(p: ApiPlan): Plan {
  return {
    id: String(p.id),
    name: p.name,
    credits: p.credits,
    price: Number(p.price_eur),
    pricePerCredit: Number(p.price_credit) || Number(p.price_eur) / (p.credits || 1),
    description: p.description || '',
    recommended: false,
    type: p.type,
    expireDays: p.type === 'pack' ? p.credits_expire_days : null,
    renewalDays: p.type === 'sub' ? p.credits_expire_days : null,
    saving: p.saving || null,
    name_en: p.name_en || null,
    description_en: p.description_en || null,
    translations: p.translations || null,
    months: p.type === 'sub'
      ? (p.interval === 'year' ? 12 : p.interval === 'week' ? 0.25 : 1) * Math.max(1, p.interval_count || 1)
      : 1,
  };
}

function splitPlans(all: ApiPlan[]) {
  const active = all.filter(p => p.is_active !== false).sort((a, b) => a.credits - b.credits);
  return {
    packs: active.filter(p => p.type === 'pack').map(formatPlan),
    subs: active.filter(p => p.type === 'sub').map(formatPlan),
  };
}

// `initialPlans`: planes que la página ya cargó en el servidor. Con ellos los
// precios salen en el HTML del servidor (buscadores e IA) y no se repite el fetch.
function SuscriptionPlans({ initialPlans }: { initialPlans?: ApiPlan[] | null }) {
  const initial = initialPlans ? splitPlans(initialPlans) : null;
  const [packs, setPacks] = useState<Plan[]>(initial?.packs ?? []);
  const [subs, setSubs] = useState<Plan[]>(initial?.subs ?? []);
  const [loading, setLoading] = useState(!initial);

  useEffect(() => {
    if (initial) return;
    cachedFetch<ApiPlan[]>(`${API_BASE_URL}v1/plans/?ordering=credits`, { ttl: 600 })
      .then((data) => {
        const split = splitPlans(Array.isArray(data) ? data : []);
        setPacks(split.packs);
        setSubs(split.subs);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <Chakra>
      {loading ? (
        <Center minH="400px"
          bg={`linear-gradient(160deg, ${C.bgStart}, ${C.bgMid}, ${C.bgEnd})`}>
          <Spinner size="xl" color={C.accent} borderWidth="3px" />
        </Center>
      ) : (
        <PlansContent packs={packs} subs={subs} />
      )}
    </Chakra>
  );
}

export default withSsrLang(SuscriptionPlans);
