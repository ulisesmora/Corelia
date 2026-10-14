"use client";

import { useEffect, useMemo, useState } from 'react';
import { Box, Flex, Text, Button, SimpleGrid } from '@chakra-ui/react';
import { motion, AnimatePresence } from 'framer-motion';
import { Icon } from './ui/Icon';
import { useLangStore } from './stores/lang.store';
import { cachedFetch } from '../utils/fetchCache';
import { prettyTitle } from '../utils/classTitles';
import { tr } from '../utils/localized';
import { API_ROOT } from '../config';
import { formatPrice } from '../i18n';
import { getSiteClient } from '../lib/site';

const API_BASE_URL = `${API_ROOT}/`;

interface ApiSchedule {
  is_recurrent: boolean;
  end_date: string | null;
  price_credits_override: string | null;
  class_type: { title: string; title_en?: string; default_price_credits: string | null };
}

/**
 * Clases que están AHORA en el horario, agrupadas por lo que cuestan
 * (1 crédito / 2 créditos). Sale del calendario real, así que se actualiza
 * sola cuando el estudio añade o quita clases.
 */
function useClassesByCredits(lang: string) {
  const [groups, setGroups] = useState<{ 1: string[]; 2: string[] } | null>(null);
  useEffect(() => {
    cachedFetch<ApiSchedule[] | { results: ApiSchedule[] }>(
      `${API_BASE_URL}v1/recurrences/?is_active=true`, { ttl: 600 },
    )
      .then((data) => {
        const list = Array.isArray(data) ? data : data?.results || [];
        const today = new Date().toISOString().slice(0, 10);
        const one = new Set<string>();
        const two = new Set<string>();
        list.forEach((sch) => {
          if (!sch.is_recurrent || (sch.end_date && sch.end_date < today) || !sch.class_type?.title) return;
          const credits = Number(sch.price_credits_override ?? sch.class_type.default_price_credits ?? 1);
          (credits >= 2 ? two : one).add(prettyTitle(tr(sch.class_type, 'title', lang)));
        });
        const sort = (xs: Set<string>) => [...xs].sort((a, b) => a.localeCompare(b, lang === 'en' ? 'en' : 'es'));
        setGroups({ 1: sort(one), 2: sort(two) });
      })
      .catch(() => setGroups(null)); // sin lista: las opciones siguen funcionando con su pista
  }, [lang]);
  return groups;
}

const MotionBox = motion.create(Box as any);

// Paleta del asistente: tokens del estilo visual (styles/presets.css)
const C = {
  accent: 'var(--accent)',            // rellenos, bordes e iconos
  accentDeep: 'var(--accent-text)',   // primario como texto
  heading: 'var(--heading-color)',
  brown: 'var(--page-text)',
  textMuted: 'var(--text-muted)',
  border: 'var(--accent-border)',
  olive: 'var(--success)',
  oliveTint: 'var(--success-soft)',
  // Franja de precio del resultado: relleno primario (texto var(--on-primary))
  grad: 'linear-gradient(135deg, var(--brand-primary) 0%, var(--brand-primary-2) 100%)',
};

export interface FinderPlan {
  id: string;
  name: string;
  credits: number;
  price: number;
  type: 'pack' | 'sub';
  validDays: number | null;
  /** Meses por ciclo de cobro (Pro = 2, Elite = 3). */
  months?: number;
}

type Freq = 1 | 2 | 3 | 5;
type Kind = 'mat' | 'machine' | 'mix';
type Rhythm = 'fixed' | 'flexible';

const WEEKS_PER_MONTH = 4.33;
const KIND_FACTOR: Record<Kind, number> = { mat: 1, machine: 2, mix: 1.5 };

/** Precio de la clase suelta: el bono de 1 crédito o, si no existe, el de la config del estudio. */
export function dropInPrice(packs: FinderPlan[]): number {
  return packs.find((p) => p.credits === 1)?.price ?? (Number(getSiteClient().drop_in_price) || 12);
}

/** "Ideal si vienes…" a partir de los créditos/mes de un plan (clases de 1 crédito). */
export function idealFrequency(credits: number, lang: string): string {
  const perWeek = credits / WEEKS_PER_MONTH;
  const es = lang !== 'en';
  if (perWeek < 1.5) return es ? '1 vez por semana' : 'once a week';
  if (perWeek < 2.6) return es ? '2 veces por semana' : 'twice a week';
  if (perWeek < 3.6) return es ? '3 veces por semana' : '3 times a week';
  if (perWeek < 6) return es ? '4-5 veces por semana' : '4-5 times a week';
  return es ? 'casi todos los días' : 'almost every day';
}

/**
 * El plan que menos cuesta en total al mes para cubrir `needed` créditos,
 * contando lo que faltaría pagar como clases sueltas. Si un plan que cubre
 * todo cuesta como mucho un 10 % más, se prefiere (comodidad de no recargar).
 * Así nunca recomendamos un plan más grande de lo que la persona necesita.
 */
// Todo normalizado POR MES (Pro se cobra cada 2 meses, Elite cada 3)
const perMonthCredits = (p: FinderPlan) => p.credits / (p.months || 1);
const perMonthPrice = (p: FinderPlan) => p.price / (p.months || 1);

function pickPlan(list: FinderPlan[], needed: number, dropIn: number): FinderPlan | null {
  if (!list.length) return null;
  const cost = (p: FinderPlan) => perMonthPrice(p) + Math.max(0, needed - perMonthCredits(p)) * dropIn;
  const cheapest = [...list].sort((a, b) => cost(a) - cost(b) || a.credits - b.credits)[0];
  if (perMonthCredits(cheapest) >= needed) return cheapest;
  const covering = [...list]
    .filter((p) => perMonthCredits(p) >= needed)
    .sort((a, b) => perMonthPrice(a) - perMonthPrice(b))[0];
  return covering && perMonthPrice(covering) <= cost(cheapest) * 1.1 ? covering : cheapest;
}

const T = {
  es: {
    kicker: 'Encuentra tu plan en 3 toques',
    title: '¿Cuál me conviene?',
    step: (n: number) => `Paso ${n} de 3`,
    q1: '¿Cuántas veces a la semana te gustaría venir?',
    q1opts: [
      { v: 1, label: '1 vez', hint: 'para empezar' },
      { v: 2, label: '2 veces', hint: 'lo más habitual' },
      { v: 3, label: '3 veces', hint: 'constancia' },
      { v: 5, label: '4 o más', hint: 'a tope' },
    ],
    q2: '¿Qué clases te apetecen?',
    q2opts: [
      { v: 'mat', label: 'Suelo, yoga y barre', hint: '1 crédito por clase' },
      { v: 'machine', label: 'Máquinas', hint: '2 créditos por clase' },
      { v: 'mix', label: 'De todo un poco', hint: 'combinando los dos tipos' },
    ],
    q3: '¿Sueles poder venir los mismos días?',
    q3opts: [
      { v: 'fixed', label: 'Sí, días fijos', hint: 'p. ej. lunes y miércoles' },
      { v: 'flexible', label: 'Depende de la semana', hint: 'voy cuando puedo' },
    ],
    back: 'Atrás',
    classesTitle: 'Clases que hay ahora:',
    mixText: 'Puedes combinar cualquiera de las dos listas',
    resultKicker: 'Tu plan ideal',
    classesMonth: (n: number) => `≈ ${n} clases al mes`,
    perClass: (p: string, d: string) => `${p} por clase (suelta: ${d})`,
    saving: (s: string) => `Ahorras ${s} al mes`,
    whySub: 'Como vienes con regularidad, la membresía te sale más barata y además te guarda tu plaza sola cada semana.',
    extra: (n: number, d: string) => `Es la opción más económica para ti. Para las ${n} ${n === 1 ? 'clase' : 'clases'} de más al mes, añade un bono cuando lo necesites (desde ${d} por clase).`,
    whyPack: 'Como tu ritmo cambia cada semana, un bono te da libertad: compras cuando lo necesitas, sin renovaciones.',
    subPerks: [
      'Tus clases fijas se reservan solas cada domingo',
      'Recordatorio 2 h antes de cada clase',
      'Sin permanencia: cancela cuando quieras',
    ],
    packPerks: [
      'Reservas tú, cuando te venga bien',
      (d: number | null) => (d ? `Créditos válidos ${d} días` : 'Úsalos a tu ritmo'),
      'Sin renovación automática',
    ],
    cta: (name: string) => `Empezar con ${name}`,
    seeAll: 'Ver todos los planes',
    restart: 'Volver a empezar',
    monthly: '/mes',
    once: 'pago único',
  },
  en: {
    kicker: 'Find your plan in 3 taps',
    title: 'Which one suits me?',
    step: (n: number) => `Step ${n} of 3`,
    q1: 'How many times a week would you like to come?',
    q1opts: [
      { v: 1, label: 'Once', hint: 'to get started' },
      { v: 2, label: 'Twice', hint: 'most common' },
      { v: 3, label: '3 times', hint: 'consistency' },
      { v: 5, label: '4 or more', hint: 'all in' },
    ],
    q2: 'Which classes do you fancy?',
    q2opts: [
      { v: 'mat', label: 'Mat, yoga & barre', hint: '1 credit per class' },
      { v: 'machine', label: 'Machines', hint: '2 credits per class' },
      { v: 'mix', label: 'A bit of everything', hint: 'mixing both types' },
    ],
    q3: 'Can you usually come on the same days?',
    q3opts: [
      { v: 'fixed', label: 'Yes, fixed days', hint: 'e.g. Mon & Wed' },
      { v: 'flexible', label: 'It depends', hint: 'whenever I can' },
    ],
    back: 'Back',
    classesTitle: 'Classes on the timetable:',
    mixText: 'Combine any classes from both lists',
    resultKicker: 'Your ideal plan',
    classesMonth: (n: number) => `≈ ${n} classes a month`,
    perClass: (p: string, d: string) => `${p} per class (drop-in: ${d})`,
    saving: (s: string) => `You save ${s} a month`,
    whySub: 'Since you come regularly, the membership is cheaper and it saves your spot automatically every week.',
    extra: (n: number, d: string) => `It's the most economical option for you. For the ${n} extra ${n === 1 ? 'class' : 'classes'} a month, add a class pack when needed (from ${d} per class).`,
    whyPack: 'Since your rhythm changes, a class pack gives you freedom: buy when you need it, no renewals.',
    subPerks: [
      'Your regular classes are booked every Sunday',
      'Reminder 2 h before each class',
      'No commitment: cancel anytime',
    ],
    packPerks: [
      'Book whenever it suits you',
      (d: number | null) => (d ? `Credits valid for ${d} days` : 'Use them at your pace'),
      'No automatic renewal',
    ],
    cta: (name: string) => `Start with ${name}`,
    seeAll: 'See all plans',
    restart: 'Start over',
    monthly: '/month',
    once: 'one-off',
  },
};

function OptionButton({ selected, label, hint, onClick, classes, classesTitle, note }: {
  selected: boolean; label: string; hint: string; onClick: () => void;
  classes?: string[]; classesTitle?: string; note?: string;
}) {
  // Se muestran todas (son pocas): un "ver más" dentro del botón sería un
  // control anidado en otro, inválido para lectores de pantalla.
  const shown = classes || [];
  return (
    <Box
      as="button"
      onClick={onClick}
      aria-pressed={selected}
      textAlign="left"
      p={4}
      minH="72px"
      borderRadius="var(--radius-card)"
      border="2px solid"
      borderColor={selected ? C.accent : C.border}
      bg={selected ? 'var(--accent-soft)' : 'var(--surface-strong)'}
      cursor="pointer"
      transition="all .15s ease"
      _hover={{ borderColor: C.accent, transform: 'translateY(-2px)' }}
      _focusVisible={{ outline: `3px solid ${C.accent}`, outlineOffset: '2px' }}
    >
      <Flex align="center" justify="space-between" gap={2}>
        <Box>
          <Text fontFamily='var(--font-body)' fontWeight={800} fontSize="md" color={C.brown}>{label}</Text>
          <Text fontFamily='var(--font-body)' fontSize="xs" color={C.textMuted}>{hint}</Text>
        </Box>
        <Flex
          w="22px" h="22px" borderRadius="full" flexShrink={0}
          border="2px solid" borderColor={selected ? C.accent : C.border}
          bg={selected ? C.accent : 'transparent'}
          align="center" justify="center"
        >
          {selected && <Icon name="check" size={10} color="var(--on-primary)" />}
        </Flex>
      </Flex>

      {/* Clases reales de este tipo, sacadas del horario */}
      {classes && classes.length > 0 && (
        <Box mt={3} pt={3} borderTop="1px dashed var(--accent-border)">
          <Text fontFamily='var(--font-body)' fontSize="11px" fontWeight={700}
            color={C.textMuted} mb={1.5}>
            {classesTitle}
          </Text>
          <Flex gap={1.5} wrap="wrap">
            {shown.map((name) => (
              <Box key={name} px={2.5} py={1} borderRadius="var(--radius-chip)"
                bg={selected ? 'var(--surface-strong)' : 'var(--accent-soft)'}
                border="1px solid var(--accent-border)">
                <Text fontFamily='var(--font-body)' fontSize="12px" fontWeight={600} color={C.brown}>
                  {name}
                </Text>
              </Box>
            ))}
          </Flex>
        </Box>
      )}
      {note && (
        <Text mt={3} fontFamily='var(--font-body)' fontSize="12px" color={C.textMuted}>{note}</Text>
      )}
    </Box>
  );
}

/**
 * Asistente "¿Cuál me conviene?": 3 preguntas en lenguaje llano → plan
 * recomendado con el ahorro real frente a la clase suelta y por qué encaja.
 */
export default function PlanFinder({ packs, subs, onSeeAll }: {
  packs: FinderPlan[];
  subs: FinderPlan[];
  onSeeAll: (tab: 'packs' | 'subs', planId?: string) => void;
}) {
  const lang = useLangStore((s) => s.lang);
  const tx = lang === 'en' ? T.en : T.es;

  const [step, setStep] = useState(1);
  const [freq, setFreq] = useState<Freq | null>(null);
  const [kind, setKind] = useState<Kind | null>(null);
  const [rhythm, setRhythm] = useState<Rhythm | null>(null);

  const dropIn = dropInPrice(packs);
  const classGroups = useClassesByCredits(lang);

  const result = useMemo(() => {
    if (!freq || !kind || !rhythm) return null;
    // Un mes tiene 4 semanas "reservables" de cada día (los créditos valen 30 días)
    const needed = Math.ceil(freq * 4 * KIND_FACTOR[kind]);
    // Las clases extra se completan al mejor precio por crédito de los bonos
    const topUpRate = packs.length
      ? Math.min(...packs.map((p) => p.price / p.credits))
      : dropIn;
    // Membresía si hay días fijos, o si viene 2+ veces aunque varíe (sale más barata)
    const wantSub = subs.length > 0 && (rhythm === 'fixed' || freq >= 2);
    let plan = wantSub ? pickPlan(subs, needed, topUpRate) : pickPlan(packs, needed, dropIn);
    if (!plan) return null;
    // Honestidad ante todo: si para tanto volumen un bono grande cuesta
    // claramente menos al mes que membresía + extras, recomendamos el bono.
    if (plan.type === 'sub') {
      const subCost = perMonthPrice(plan) + Math.max(0, needed - perMonthCredits(plan)) * topUpRate;
      const bigPack = [...packs].filter((p) => p.credits >= needed).sort((a, b) => a.price - b.price)[0];
      if (bigPack && bigPack.price < subCost * 0.9) plan = bigPack;
    }
    const monthlyCredits = plan.type === 'sub' ? perMonthCredits(plan) : plan.credits;
    const monthlyPrice = plan.type === 'sub' ? perMonthPrice(plan) : plan.price;
    const classesPerMonth = Math.floor(monthlyCredits / KIND_FACTOR[kind]);
    const perClass = plan.price / plan.credits;
    const saving = Math.max(0, monthlyCredits * dropIn - monthlyPrice);
    // Clases que quedarían sin cubrir al mes
    const extraClasses = Math.max(0, Math.ceil((needed - monthlyCredits) / KIND_FACTOR[kind]));
    const months = plan.type === 'sub' ? (plan.months || 1) : 1;
    return { plan, classesPerMonth, perClass, saving, extraClasses, months, monthlyPrice, topUpRate, isSub: plan.type === 'sub' };
  }, [freq, kind, rhythm, packs, subs, dropIn]);


  const choose = (setter: () => void, next: number) => {
    setter();
    setTimeout(() => setStep(next), 180); // deja ver la selección antes de avanzar
  };

  const restart = () => { setFreq(null); setKind(null); setRhythm(null); setStep(1); };

  return (
    <Box
      className="sk-card"
      style={{ borderRadius: 'var(--radius-card-lg)' }}
      p={{ base: 5, md: 8 }}
      maxW="760px"
      mx="auto"
      mb={{ base: 12, md: 16 }}
    >
      {/* Cabecera + progreso */}
      <Flex justify="space-between" align="flex-start" mb={5} gap={3} wrap="wrap">
        <Box>
          <Text fontFamily='var(--font-body)' fontSize="xs" fontWeight={700}
            color={C.accentDeep} textTransform="uppercase" letterSpacing="0.10em">
            {tx.kicker}
          </Text>
          <Text fontFamily='var(--font-heading)' fontSize={{ base: '3xl', md: '4xl' }}
            color={C.heading} letterSpacing="0.03em" lineHeight="1.05">
            {step <= 3 ? tx.title : tx.resultKicker}
          </Text>
        </Box>
        {step <= 3 && (
          <Box minW="140px" flex={{ base: '1 1 100%', sm: '0 0 auto' }}>
            <Text fontFamily='var(--font-body)' fontSize="xs" color={C.textMuted}
              mb={1.5} textAlign={{ base: 'left', sm: 'right' }} aria-live="polite">
              {tx.step(step)}
            </Text>
            <Flex gap={1.5}>
              {[1, 2, 3].map((n) => (
                <Box key={n} flex={1} h="6px" borderRadius="full"
                  bg={n <= step ? C.accent : 'var(--accent-soft)'}
                  transition="background .25s ease" />
              ))}
            </Flex>
          </Box>
        )}
      </Flex>

      <AnimatePresence mode="wait">
        {step === 1 && (
          <MotionBox key="q1" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.22 }}>
            <Text fontFamily='var(--font-body)' fontWeight={700} fontSize="lg" color={C.brown} mb={4}>{tx.q1}</Text>
            <SimpleGrid columns={{ base: 2, md: 4 }} gap={3}>
              {tx.q1opts.map((o) => (
                <OptionButton key={o.v} selected={freq === o.v} label={o.label} hint={o.hint}
                  onClick={() => choose(() => setFreq(o.v as Freq), 2)} />
              ))}
            </SimpleGrid>
          </MotionBox>
        )}

        {step === 2 && (
          <MotionBox key="q2" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.22 }}>
            <Text fontFamily='var(--font-body)' fontWeight={700} fontSize="lg" color={C.brown} mb={4}>{tx.q2}</Text>
            <SimpleGrid columns={{ base: 1, md: 3 }} gap={3}>
              {tx.q2opts.map((o) => (
                <OptionButton key={o.v} selected={kind === o.v} label={o.label} hint={o.hint}
                  classes={classGroups ? (o.v === 'mat' ? classGroups[1] : o.v === 'machine' ? classGroups[2] : undefined) : undefined}
                  classesTitle={tx.classesTitle}
                  note={o.v === 'mix' && classGroups ? tx.mixText : undefined}
                  onClick={() => choose(() => setKind(o.v as Kind), 3)} />
              ))}
            </SimpleGrid>
          </MotionBox>
        )}

        {step === 3 && (
          <MotionBox key="q3" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.22 }}>
            <Text fontFamily='var(--font-body)' fontWeight={700} fontSize="lg" color={C.brown} mb={4}>{tx.q3}</Text>
            <SimpleGrid columns={{ base: 1, md: 2 }} gap={3}>
              {tx.q3opts.map((o) => (
                <OptionButton key={o.v} selected={rhythm === o.v} label={o.label} hint={o.hint}
                  onClick={() => choose(() => setRhythm(o.v as Rhythm), 4)} />
              ))}
            </SimpleGrid>
          </MotionBox>
        )}

        {step === 4 && result && (
          <MotionBox key="res" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}>
            <Box borderRadius="var(--radius-card)" overflow="hidden" border="var(--border-width) solid var(--accent-border)"
              boxShadow="var(--shadow-card)">
              {/* Franja superior con precio */}
              <Box bg={C.grad} color="var(--on-primary)" p={{ base: 5, md: 6 }}>
                <Flex align="center" gap={2} mb={1}>
                  {result.isSub ? <Icon name="crown" size={13} /> : <Icon name="bolt" size={13} />}
                  <Text fontFamily='var(--font-body)' fontSize="xs" fontWeight={700}
                    textTransform="uppercase" letterSpacing="0.10em" opacity={0.9}>
                    {result.isSub ? (lang === 'en' ? 'Monthly membership' : 'Membresía mensual') : (lang === 'en' ? 'Class pack' : 'Bono de clases')}
                  </Text>
                </Flex>
                <Flex justify="space-between" align="flex-end" wrap="wrap" gap={2}>
                  <Text fontFamily='var(--font-heading)' fontSize={{ base: '4xl', md: '5xl' }} lineHeight="1" letterSpacing="0.03em">
                    {result.plan.name}
                  </Text>
                  <Flex align="baseline" gap={1}>
                    <Text fontFamily='var(--font-heading)' fontSize={{ base: '4xl', md: '5xl' }} lineHeight="1">
                      {formatPrice(result.plan.price, lang, 'auto')}
                    </Text>
                    <Text fontFamily='var(--font-body)' fontSize="sm" opacity={0.85}>
                      {!result.isSub ? tx.once : result.months === 1 ? tx.monthly
                        : (lang === 'en' ? `every ${result.months} months` : `cada ${result.months} meses`)}
                    </Text>
                  </Flex>
                </Flex>
                {result.isSub && result.months > 1 && (
                  <Text fontFamily='var(--font-body)' fontSize="sm" fontWeight={700} opacity={0.9} mt={1} textAlign="right">
                    {lang === 'en' ? `= ${formatPrice(Math.round(result.monthlyPrice), lang, 0)} a month` : `= ${formatPrice(Math.round(result.monthlyPrice), lang, 0)} al mes`}
                  </Text>
                )}
              </Box>

              <Box bg="var(--surface-strong)" p={{ base: 5, md: 6 }}>
                {/* Datos clave */}
                <Flex gap={2} wrap="wrap" mb={4}>
                  <Box px={3} py={1.5} borderRadius="var(--radius-chip)" bg="var(--accent-soft)">
                    <Text fontFamily='var(--font-body)' fontSize="sm" fontWeight={700} color={C.accentDeep}>
                      {tx.classesMonth(result.classesPerMonth)}
                    </Text>
                  </Box>
                  <Box px={3} py={1.5} borderRadius="var(--radius-chip)" bg="var(--accent-soft)">
                    <Text fontFamily='var(--font-body)' fontSize="sm" fontWeight={700} color={C.accentDeep}>
                      {tx.perClass(formatPrice(result.perClass, lang, 'auto'), formatPrice(dropIn, lang, 'auto'))}
                    </Text>
                  </Box>
                  {result.saving > 0 && (
                    <Box px={3} py={1.5} borderRadius="var(--radius-chip)" bg={C.oliveTint}>
                      <Text fontFamily='var(--font-body)' fontSize="sm" fontWeight={800} color={C.olive}>
                        {tx.saving(formatPrice(Math.round(result.saving), lang, 0))}
                      </Text>
                    </Box>
                  )}
                </Flex>

                <Text fontFamily='var(--font-body)' fontSize="sm" color={C.textMuted} lineHeight="1.65" mb={result.extraClasses > 0 ? 2 : 4}>
                  {result.isSub ? tx.whySub : tx.whyPack}
                </Text>
                {result.extraClasses > 0 && (
                  <Text fontFamily='var(--font-body)' fontSize="sm" color={C.textMuted} lineHeight="1.65" mb={4}
                    p={3} borderRadius="var(--radius-input)" bg="var(--accent-soft)">
                    {tx.extra(result.extraClasses, formatPrice(result.topUpRate, lang, 'auto'))}
                  </Text>
                )}

                <Box as="ul" listStyleType="none" m={0} p={0} mb={5}>
                  {(result.isSub ? tx.subPerks : tx.packPerks).map((perk, i) => (
                    <Flex as="li" key={i} align="center" gap={2.5} mb={2}>
                      <Flex w="20px" h="20px" borderRadius="full" bg="var(--success-soft)" align="center" justify="center" flexShrink={0}>
                        <Icon name="check" size={9} color="var(--success)" />
                      </Flex>
                      <Text fontFamily='var(--font-body)' fontSize="sm" color={C.brown}>
                        {typeof perk === 'function' ? perk(result.plan.validDays) : perk}
                      </Text>
                    </Flex>
                  ))}
                </Box>

                <Button
                  className="sk-btn"
                  w="full" h="54px"
                  fontFamily='var(--font-body)' fontSize="md"
                  onClick={() => {
                    const tab = result.isSub ? 'subscription' : 'credits';
                    window.location.href = `/checkout?tab=${tab}&plan_id=${result.plan.id}`;
                  }}
                >
                  <Flex align="center" gap={2}>{tx.cta(result.plan.name)} <Icon name="arrow-right" size={13} /></Flex>
                </Button>

                <Flex justify="space-between" mt={3} gap={2} wrap="wrap">
                  <Button variant="ghost" size="sm" color={C.textMuted} fontFamily='var(--font-body)'
                    minH="44px" onClick={restart}>
                    <Flex align="center" gap={1.5}><Icon name="refresh" size={10} />{tx.restart}</Flex>
                  </Button>
                  <Button variant="ghost" size="sm" color={C.accentDeep} fontFamily='var(--font-body)'
                    fontWeight={700} minH="44px"
                    onClick={() => onSeeAll(result.isSub ? 'subs' : 'packs', result.plan.id)}>
                    {tx.seeAll}
                  </Button>
                </Flex>
              </Box>
            </Box>
          </MotionBox>
        )}
      </AnimatePresence>

      {step > 1 && step <= 3 && (
        <Button variant="ghost" size="sm" mt={4} color={C.textMuted} fontFamily='var(--font-body)'
          minH="44px" onClick={() => setStep(step - 1)}>
          <Flex align="center" gap={1.5}><Icon name="arrow-left" size={10} />{tx.back}</Flex>
        </Button>
      )}
    </Box>
  );
}
