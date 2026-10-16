"use client";

import { useState, useEffect } from 'react';
import { cachedFetch } from '../utils/fetchCache';
import {
  Box, Flex, Text, Spinner, SimpleGrid, Button, Center,
} from '@chakra-ui/react';
import { motion } from 'framer-motion';
import Chakra from './ChakraProvider';
import { Icon, type IconName } from './ui/Icon';
import { useT, formatPrice, priceParts } from '../i18n';
import { useLangStore, withSsrLang } from './stores/lang.store';
import { planDisplayName } from '../utils/planUtils';
import { trStrict } from '../utils/localized';
import PlanFinder, { dropInPrice, idealFrequency, type FinderPlan } from './PlanFinder';
import { API_ROOT } from '../config';
import { useSite, whatsappUrl } from '../lib/site';
import PaymentsDisabledNotice from './PaymentsDisabledNotice';
import { clientFixedClasses, paymentOptions, paymentsEnabled } from '../utils/payments';
import { cancelMinHours } from '../utils/cancelPolicy';
import { useHydrated } from '../utils/useHydrated';

const MotionBox = motion(Box as any);

const API_BASE_URL = `${API_ROOT}/`;

// Paleta de la sección: todo tokens del estilo visual (styles/presets.css)
const C = {
  accent: 'var(--accent)',            // iconos y decoración
  accentText: 'var(--accent-text)',   // primario como texto
  accentDeep: 'var(--accent-text)',
  // Relleno primario de las píldoras "recomendado" (texto var(--on-primary))
  accentFill: 'linear-gradient(135deg, var(--brand-primary), var(--brand-primary-2))',
  heading: 'var(--heading-color)',
  brown: 'var(--page-text)',
  brownMid: 'var(--page-text)',
  textMuted: 'var(--text-muted)',
  textLight: 'var(--text-subtle)',
  sectionBg: 'var(--section-bg)',     // solo en `bg` (puede ser un degradado)
  cardBorder: 'var(--surface-border)',
  cardShadowHover: 'var(--shadow-hover)',
  // ahorro (antes paleta oliva)
  olive: 'var(--success)',
  oliveDark: 'var(--success)',
  oliveTint: 'var(--success-soft)',
  oliveBorder: 'color-mix(in srgb, var(--success) 22%, transparent)',
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

// ── PackCard ──────────────────────────────────────────────────────────────────

function PackCard({ plan, dropIn, highlighted }: { plan: Plan; dropIn: number; highlighted?: boolean }) {
  const t = useT();
  const lang = useLangStore(s => s.lang);
  const es = lang !== 'en';
  const perClass = plan.price / plan.credits;
  const price = priceParts(plan.price, lang);

  return (
    <MotionBox
      id={`plan-${plan.id}`}
      position="relative"
      whileHover={{ y: -5 }}
      transition={{ duration: 0.25 }}
      cursor="pointer"
    >
      {(plan.recommended || highlighted) && (
        <Flex
          position="absolute" top="-14px" left="50%" transform="translateX(-50%)"
          zIndex={3} px={4} py={1} borderRadius="var(--radius-chip)"
          bg={C.accentFill}
          color="var(--on-primary)" fontSize="11px" fontWeight={700}
          letterSpacing="0.06em" textTransform="uppercase"
          boxShadow="var(--shadow-card)"
          align="center" gap={1.5}
          fontFamily='var(--font-body)'
          whiteSpace="nowrap"
        >
          <Icon name="bolt" size={9} />
          {highlighted ? (es ? 'Tu recomendación' : 'Recommended for you') : t('plans.popular')}
        </Flex>
      )}

      {/* sk-card: superficie, borde, radio, sombra y blur del estilo. La
          recomendada lleva el borde en primario (inline: gana a la clase). */}
      <Box
        className="sk-card"
        p={7}
        pt={plan.recommended || highlighted ? 10 : 7}
        style={plan.recommended || highlighted ? { borderColor: 'var(--accent)' } : undefined}
        h="100%" display="flex" flexDirection="column"
        transition="box-shadow 0.3s ease, border-color 0.3s ease"
        _hover={{ boxShadow: C.cardShadowHover, borderColor: 'var(--accent-border)' }}
      >
        {/* Credits badge + expiry */}
        <Flex align="center" justify="space-between" mb={4}>
          <Box px={3} py={1} borderRadius="var(--radius-chip)"
            bg="var(--accent-soft)" border="1px solid var(--accent-border)">
            <Text fontSize="12px" fontWeight={600} color={C.accentText}
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
            px={3} py={1.5} borderRadius="var(--radius-chip)" w="fit-content"
            bg={C.oliveTint} border={`1px solid ${C.oliveBorder}`}>
            <Icon name="tag" size={9} color={C.olive} />
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
        {/* Símbolo pequeño y número grande, en el orden del país (60 € · $60 · S/ 60) */}
        <Flex align="baseline" mb={0.5}>
          {price.before && <Text fontSize="13px" color={C.textMuted} mr={0.5} fontFamily='var(--font-body)'>{price.before.trim()}</Text>}
          <Text fontSize="40px" fontWeight={800} color={C.brown} lineHeight="1"
            fontFamily='var(--font-heading)' letterSpacing="0.02em">
            {price.number}
          </Text>
          {price.after && <Text fontSize="13px" color={C.textMuted} ml={0.5} fontFamily='var(--font-body)'>{price.after.trim()}</Text>}
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

        {/* Recomendada: botón principal; el resto, secundario de contorno.
            Si el estudio no vende bonos online («Formas de cobro»): cómo comprarlo. */}
        {!paymentOptions().packs_online && paymentsEnabled() ? (
          <a className="w-btn w-btn--block sk-btn-ghost" href="#comprar-en-estudio" style={{ minHeight: 48 }}>
            <Icon name="store" size={13} aria-hidden /> {es ? 'Se compra en el estudio' : 'Bought at the studio'}
          </a>
        ) : (
        <Button
          className={plan.recommended || highlighted ? 'sk-btn' : 'sk-btn-ghost'}
          onClick={() => { window.location.href = `/checkout?tab=credits&plan_id=${plan.id}`; }}
          w="full" size="md"
          fontFamily='var(--font-body)' fontSize="sm"
          minH="48px"
          cursor="pointer"
          gap={2}
        >
          {t('plans.buyBtn')}
          <Icon name="arrow-right" size={11} />
        </Button>
        )}
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
  const round = (n: number) => String(Math.round(n));
  const cycle = months === 1
    ? (es ? '/mes' : '/month')
    : (es ? `cada ${months} meses` : `every ${months} months`);

  const perks = es
    ? [
        months === 1
          ? `${plan.credits} créditos al mes para tus clases`
          : `${plan.credits} clases cada ${months} meses (≈ ${round(perMonthCredits)} al mes)`,
        // Las clases fijas solo se explican si las clientas las eligen en la web
        clientFixedClasses() ? 'Tus clases fijas se reservan solas' : 'Reserva tus clases cuando quieras',
        months === 1 ? 'Se renueva cada mes' : `Se cobra cada ${months} meses · créditos válidos ${plan.renewalDays || months * 30} días`,
        'Sin permanencia · cancela cuando quieras',
      ]
    : [
        months === 1
          ? `${plan.credits} credits a month for your classes`
          : `${plan.credits} classes every ${months} months (≈ ${round(perMonthCredits)} a month)`,
        clientFixedClasses() ? 'Your regular classes book themselves' : 'Book your classes whenever you like',
        months === 1 ? 'Renews monthly' : `Billed every ${months} months · credits valid ${plan.renewalDays || months * 30} days`,
        'No commitment · cancel anytime',
      ];

  return (
    <MotionBox
      id={`plan-${plan.id}`}
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
          zIndex={3} px={4} py={1} borderRadius="var(--radius-chip)"
          bg={C.accentFill}
          color="var(--on-primary)" fontSize="11px" fontWeight={700}
          letterSpacing="0.06em" textTransform="uppercase"
          boxShadow="var(--shadow-card)"
          align="center" gap={1.5} whiteSpace="nowrap"
          fontFamily='var(--font-body)'
        >
          <Icon name="check" size={9} />
          {es ? 'Tu recomendación' : 'Recommended for you'}
        </Flex>
      )}
      {/* sk-card; la recomendada, con borde primario más grueso (inline) */}
      <Box
        className="sk-card"
        p={7}
        pt={highlighted ? 10 : 7}
        style={highlighted ? { borderColor: 'var(--accent)', borderWidth: '2px' } : undefined}
        h="100%" display="flex" flexDirection="column"
        transition="box-shadow 0.3s ease, border-color 0.3s ease"
        _hover={{ boxShadow: C.cardShadowHover, borderColor: 'var(--accent-border)' }}
      >
        {/* Para quién es — lo primero que se entiende */}
        <Box px={3} py={1} mb={4} borderRadius="var(--radius-chip)" w="fit-content"
          bg="var(--accent-soft)" border="1px solid var(--accent-border)">
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
            px={3} py={1.5} borderRadius="var(--radius-chip)" w="fit-content"
            bg={C.oliveTint} border={`1px solid ${C.oliveBorder}`}>
            <Icon name="tag" size={9} color={C.olive} />
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
              <Box mt="3px" flexShrink={0}><Icon name="check" size={11} color="var(--success)" /></Box>
              <Text fontSize="sm" color={C.brownMid} fontFamily='var(--font-body)' lineHeight="1.5">
                {perk}
              </Text>
            </Flex>
          ))}
        </Box>

        {!paymentOptions().memberships_online && paymentsEnabled() ? (
          <a className="w-btn w-btn--block sk-btn-ghost" href="#comprar-en-estudio" style={{ minHeight: 50 }}>
            <Icon name="store" size={13} aria-hidden /> {es ? 'Se contrata en el estudio' : 'Sign up at the studio'}
          </a>
        ) : (
        <Button
          className="sk-btn"
          onClick={() => { window.location.href = `/checkout?tab=subscription&plan_id=${plan.id}`; }}
          w="full" minH="50px"
          fontFamily='var(--font-body)' fontSize="md"
          cursor="pointer"
          gap={2}
        >
          {es ? `Elegir ${planDisplayName(plan, lang)}` : `Choose ${planDisplayName(plan, lang)}`}
          <Icon name="arrow-right" size={12} />
        </Button>
        )}
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
    <SimpleGrid columns={{ base: 1, md: 3 }} gap={3}>
      {items.map((it) => (
        <Flex key={it.text} className="sk-card" align="center" gap={3} p={4}>
          <Box textAlign="center" minW="64px" flexShrink={0}>
            {/* Sin cortes: «MX$12» o «CLP 15,990» no se parten en dos líneas */}
            <Text fontFamily='var(--font-heading)' fontSize="3xl" color={C.accentDeep} lineHeight="1" whiteSpace="nowrap">{it.big}</Text>
            {it.unit && <Text fontFamily='var(--font-body)' fontSize="10px" fontWeight={700} color={C.accentText} textTransform="uppercase">{it.unit}</Text>}
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
    <Flex align="center" mt={12} gap={3} wrap="wrap">
      <Text fontFamily='var(--font-body)' fontSize="sm" color={C.textMuted}>
        {es ? '¿Sigues con dudas? Te ayudamos a elegir en un minuto.' : 'Still unsure? We’ll help you choose in a minute.'}
      </Text>
      <Button as="a" className="sk-btn-ghost"
        href={whatsappUrl(site, es ? 'Hola, ¿qué plan me recomendáis?' : 'Hi, which plan would you recommend?')}
        target="_blank" rel="noopener"
        minH="44px" px={5} borderRadius="var(--radius-button)"
        fontFamily='var(--font-body)' fontWeight={700} textTransform="none"
        gap={2}>
        <Icon name="whatsapp" size={16} />
        {es ? 'Pregúntanos por WhatsApp' : 'Ask us on WhatsApp'}
      </Button>
    </Flex>
  );
}

// ── Tab + Content wrapper ────────────────────────────────────────────────────

type Tab = 'packs' | 'subs' | 'single';

/**
 * Precios con revelado progresivo: una línea de cabecera, pestañas
 * (Mensualidades · Bonos · Clase suelta) y las tarjetas de la pestaña. El
 * asistente «¿Cuál me conviene?» y la explicación de los créditos quedan
 * plegados hasta que se piden.
 */
function PlansContent({ packs, subs }: { packs: Plan[]; subs: Plan[] }) {
  // La membresía es lo que queremos explicar primero (más barata y con reserva automática)
  const [activeTab, setActiveTab] = useState<Tab>(subs.length > 0 ? 'subs' : packs.length > 0 ? 'packs' : 'single');
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [finderOpen, setFinderOpen] = useState(false);
  const hydrated = useHydrated();
  const t = useT();
  const lang = useLangStore(s => s.lang);
  const es = lang !== 'en';
  const site = useSite();

  const toFinder = (p: Plan): FinderPlan => ({
    id: p.id, name: planDisplayName(p, lang), credits: p.credits, price: p.price, type: p.type,
    validDays: p.type === 'pack' ? p.expireDays : p.renewalDays,
    months: p.months,
  });
  const dropIn = dropInPrice(packs.map(toFinder)) || Number(site.drop_in_price) || 0;

  const seeAll = (tab: 'packs' | 'subs', planId?: string) => {
    setActiveTab(tab);
    setHighlightId(planId || null);
    setTimeout(() => {
      const target = (planId && document.getElementById(`plan-${planId}`))
        || document.getElementById('todos-los-planes');
      target?.scrollIntoView({ behavior: 'smooth', block: planId ? 'center' : 'start' });
    }, 150);
  };

  const tabs = ([
    { key: 'subs' as const, label: es ? 'Mensualidades' : 'Memberships', show: subs.length > 0 },
    { key: 'packs' as const, label: es ? 'Bonos' : 'Class packs', show: packs.length > 0 },
    { key: 'single' as const, label: es ? 'Clase suelta' : 'Drop-in', show: true },
  ]).filter((x) => x.show);
  const hasPlans = packs.length > 0 || subs.length > 0;

  return (
    <div className="w-wrap" style={{ paddingBottom: 'var(--w-8)' }}>
      <header className="w-pagehead">
        <h1 className="w-h1">{es ? 'Precios' : 'Prices'}</h1>
        <p className="w-lead">
          {es
            ? `Una clase suelta cuesta ${formatPrice(dropIn, 'es', 'auto')}. Con un bono o una mensualidad cada clase te sale más barata.`
            : `A drop-in class is ${formatPrice(dropIn, 'en', 'auto')}. With a pack or a membership every class costs less.`}
        </p>
      </header>

      <div id="todos-los-planes" style={{ scrollMarginTop: 90 }} />
      <Flex justify="space-between" align="center" gap={3} wrap="wrap" mb={8}>
        <div className="w-tabs" role="tablist" aria-label={es ? 'Tipo de precio' : 'Price type'}>
          {tabs.map(({ key, label }) => (
            <button key={key} type="button" role="tab" className="w-tab" aria-selected={activeTab === key}
              aria-controls={`plans-${key}`} onClick={() => setActiveTab(key)}>
              {label}
            </button>
          ))}
        </div>
        {hasPlans && (
          <button type="button" className="w-btn w-btn--sm sk-btn-ghost" aria-expanded={finderOpen}
            onClick={() => setFinderOpen((v) => !v)}>
            <Icon name="sparkle" size={14} aria-hidden />
            {es ? '¿Cuál me conviene?' : 'Which one suits me?'}
          </button>
        )}
      </Flex>

      {/* Asistente guiado (3 preguntas → plan recomendado): solo si se pide */}
      {hasPlans && finderOpen && (
        <Box mb={10}>
          <PlanFinder packs={packs.map(toFinder)} subs={subs.map(toFinder)} onSeeAll={(tab, id) => { setFinderOpen(false); seeAll(tab as 'packs' | 'subs', id); }} />
        </Box>
      )}

      {activeTab === 'subs' && subs.length > 0 && (
        <div id="plans-subs" role="tabpanel">
          <SimpleGrid templateColumns="repeat(auto-fill, minmax(min(100%, 300px), 1fr))" gap={6} w="full" maxW={subs.length === 1 ? '460px' : subs.length === 2 ? '900px' : undefined}>
            {subs.map(plan => <SubCard key={plan.id} plan={plan} dropIn={dropIn} highlighted={highlightId === plan.id} />)}
          </SimpleGrid>
          <p className="w-muted w-small" style={{ marginTop: 'var(--w-5)' }}>
            {t('plans.subFooter')}{paymentOptions().memberships_online ? ` ${t('plans.subFooterPay')}` : ''}
          </p>
        </div>
      )}

      {activeTab === 'packs' && packs.length > 0 && (
        <div id="plans-packs" role="tabpanel">
          <SimpleGrid templateColumns="repeat(auto-fill, minmax(min(100%, 260px), 1fr))" gap={6} w="full" maxW={packs.length === 1 ? '420px' : packs.length === 2 ? '820px' : undefined}>
            {packs.map(plan => <PackCard key={plan.id} plan={plan} dropIn={dropIn} highlighted={highlightId === plan.id} />)}
          </SimpleGrid>
          <p className="w-muted w-small" style={{ marginTop: 'var(--w-5)' }}>{t('plans.packFooter')}</p>
        </div>
      )}

      {activeTab === 'single' && (
        <div id="plans-single" role="tabpanel">
          <div className="w-card w-price" style={{ maxWidth: 420 }}>
            <span className="w-price-kind">{es ? 'Clase suelta' : 'Drop-in class'}</span>
            <span className="w-price-amount">{formatPrice(dropIn, lang, 'auto')}</span>
            <p>{es ? 'Paga solo la clase que reservas, sin compromiso. Ideal para probar.' : 'Pay only for the class you book, no commitment. Ideal to try us.'}</p>
            <a className="w-btn sk-btn" href="/calendar" style={{ marginTop: 'var(--w-3)' }}>{t('nav.cta.book')}</a>
          </div>
          <details className="w-card" style={{ marginTop: 'var(--w-5)', padding: 'var(--w-4) var(--w-5)', maxWidth: 900 }}>
            <summary style={{ cursor: 'pointer', fontWeight: 700, minHeight: 44, display: 'flex', alignItems: 'center' }}>
              {es ? '¿Cómo funcionan los créditos?' : 'How do credits work?'}
            </summary>
            <Box pt={4}><CreditsExplainer dropIn={dropIn} /></Box>
          </details>
        </div>
      )}

      {/* Sin pagos online: los precios se ven, pero la compra es en el estudio
          (debajo de los precios: primero lo que cuesta, después cómo pagarlo) */}
      {!paymentsEnabled() && hasPlans && (
        <Box className="sk-card" maxW="720px" mt={10} p={{ base: 5, md: 6 }} style={{ borderColor: 'var(--accent-border)' }}>
          <PaymentsDisabledNotice id="comprar-en-estudio" />
        </Box>
      )}
      {/* Con tarjeta en la web, pero el estudio vende algo solo en persona */}
      {paymentsEnabled() && ((packs.length > 0 && !paymentOptions().packs_online) || (subs.length > 0 && !paymentOptions().memberships_online)) && (
        <Box className="sk-card" maxW="720px" mt={10} p={{ base: 5, md: 6 }} style={{ borderColor: 'var(--accent-border)' }}>
          <PaymentsDisabledNotice id="comprar-en-estudio"
            offline={{ packs: packs.length > 0 && !paymentOptions().packs_online, memberships: subs.length > 0 && !paymentOptions().memberships_online }} />
        </Box>
      )}

      {/* HTML del servidor: las pestañas no activas también van en el HTML
          (ocultas) para que buscadores e IA vean todos los precios. */}
      {!hydrated && (
        <div hidden>
          {activeTab !== 'packs' && packs.map(plan => <PackCard key={plan.id} plan={plan} dropIn={dropIn} />)}
          {activeTab !== 'subs' && subs.map(plan => <SubCard key={plan.id} plan={plan} dropIn={dropIn} />)}
        </div>
      )}

      {!hasPlans && (
        <p className="w-muted" style={{ marginTop: 'var(--w-5)' }}>{t('plans.noPlans')}</p>
      )}

      {hasPlans && <PlansHelp />}
    </div>
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
        <Center minH="400px">
          <Spinner size="xl" color={C.accent} borderWidth="3px" />
        </Center>
      ) : (
        <PlansContent packs={packs} subs={subs} />
      )}
    </Chakra>
  );
}

export default withSsrLang(SuscriptionPlans);
