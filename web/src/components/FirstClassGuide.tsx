"use client";

import { useEffect, useMemo, useState } from 'react';
import { Box, Flex, Text, Button, SimpleGrid } from '@chakra-ui/react';
import { motion, AnimatePresence } from 'framer-motion';
import { Icon } from './ui/Icon';
import { useLangStore } from './stores/lang.store';
import { cachedFetch } from '../utils/fetchCache';
import { prettyTitle } from '../utils/classTitles';
import { tr, classUrl } from '../utils/localized';

import { optimizedImage, withOriginalFallback } from '../utils/img';
import { API_ROOT } from '../config';
import { contactUrl, getSiteClient } from '../lib/site';
import { formatPrice } from '../i18n';
const MotionBox = motion.create(Box as any);

const API_BASE_URL = `${API_ROOT}/`;
const SEEN_KEY = 'domFirstClassGuideSeen';

// Paleta de la guía: tokens del estilo visual (styles/presets.css)
const C = {
  accent: 'var(--accent)',            // rellenos, bordes e iconos
  accentDeep: 'var(--accent-text)',   // primario como texto
  heading: 'var(--heading-color)',
  brown: 'var(--page-text)',
  textMuted: 'var(--text-muted)',
  border: 'var(--accent-border)',
  // Relleno primario de puntos/píldoras (texto var(--on-primary))
  grad: 'linear-gradient(135deg, var(--brand-primary) 0%, var(--brand-primary-2) 100%)',
};

type Goal = 'strength' | 'machines' | 'relax' | 'music' | 'mom' | 'senior';
type Experience = 'new' | 'some' | 'lots';

interface ApiSchedule {
  id: number;
  weekday: number | null;
  start_time: string;
  end_time: string;
  end_date: string | null;
  is_recurrent: boolean;
  price_credits_override: string | null;
  class_type: {
    id: number; title: string; title_en?: string; slug: string; level: string; image: string | null;
    default_price_credits: string | null; duration_minutes: number;
    category: { slug: string } | null;
  };
}

interface GuideClass {
  /** `title` (español) se usa para clasificar; `titleEn` sólo para pintar en inglés. */
  id: number; slug: string; title: string; titleEn: string; level: string; image: string | null;
  credits: number; category: string; duration: number;
  sessions: { weekday: number; start: string }[];
}

const MATCHERS: Record<Goal, (c: GuideClass) => boolean> = {
  strength: (c) => c.category === 'pilates' && c.credits < 2 && !/senior|postparto|embarazo|beb/i.test(c.title),
  machines: (c) => c.category === 'pilates' && c.credits >= 2,
  relax: (c) => c.category === 'yoga' || /meditaci|mindful/i.test(c.title),
  music: (c) => c.category === 'others' && !/senior/i.test(c.title),
  mom: (c) => /postparto|embarazo|beb/i.test(c.title),
  senior: (c) => /senior/i.test(c.title),
};

// Orden de preferencia por nivel según la experiencia (menor = mejor)
const LEVEL_RANK: Record<Experience, Record<string, number>> = {
  new: { beg: 0, all: 1, int: 3, adv: 4 },
  some: { all: 0, beg: 1, int: 1, adv: 3 },
  lots: { int: 0, adv: 0, all: 1, beg: 2 },
};

const T = {
  es: {
    teaserTitle: `¿Primera vez en ${getSiteClient().studio_name}?`,
    teaserText: 'Te ayudamos a elegir tu clase en 2 preguntas.',
    teaserCta: 'Empezar',
    title: 'Encuentra tu clase',
    journey: ['Elige tu clase', 'Elige día', 'Reserva'],
    q1: '¿Qué te apetece?',
    goals: [
      { v: 'strength', label: 'Fortalecer y cuidar la espalda', hint: 'Pilates en suelo' },
      { v: 'machines', label: 'Pilates con máquinas', hint: 'Reformer y Chair' },
      { v: 'relax', label: 'Relajarme, estirar y respirar', hint: 'Yoga' },
      { v: 'music', label: 'Moverme con música', hint: 'Barre y baile' },
      { v: 'mom', label: 'Embarazo o postparto', hint: 'Con o sin tu bebé' },
      { v: 'senior', label: 'Movimiento suave', hint: 'Para mayores' },
    ],
    q2: '¿Has hecho algo parecido antes?',
    exps: [
      { v: 'new', label: 'Nunca', hint: 'empiezo de cero' },
      { v: 'some', label: 'Alguna vez', hint: 'me suena' },
      { v: 'lots', label: 'Sí, bastante', hint: 'busco un reto' },
    ],
    resultTitle: 'Tus clases',
    first: 'Te recomendamos empezar por aquí',
    when: 'Cuándo:',
    cta: 'Ver días y reservar',
    none: 'Ahora mismo no hay clases de este tipo en el horario. Escríbenos y te avisamos en cuanto haya.',
    noneCta: 'Avísame por WhatsApp',
    tip: (d: string) => `Tu primera clase cuesta 1 crédito (${d}). Si te gusta, con un plan te sale más barata.`,
    back: 'Atrás',
    restart: 'Volver a empezar',
    hide: 'Ocultar',
    levels: { beg: 'Principiante', int: 'Intermedio', adv: 'Avanzado', all: 'Todos los niveles' } as Record<string, string>,
    credits: (n: number) => (n === 1 ? '1 crédito' : `${n} créditos`),
    days: ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'],
  },
  en: {
    teaserTitle: `First time at ${getSiteClient().studio_name}?`,
    teaserText: 'We’ll help you pick your class in 2 questions.',
    teaserCta: 'Start',
    title: 'Find your class',
    journey: ['Pick your class', 'Pick a day', 'Book'],
    q1: 'What do you fancy?',
    goals: [
      { v: 'strength', label: 'Get stronger & care for my back', hint: 'Mat pilates' },
      { v: 'machines', label: 'Pilates on machines', hint: 'Reformer & Chair' },
      { v: 'relax', label: 'Relax, stretch & breathe', hint: 'Yoga' },
      { v: 'music', label: 'Move to music', hint: 'Barre & dance' },
      { v: 'mom', label: 'Pregnancy or postpartum', hint: 'With or without baby' },
      { v: 'senior', label: 'Gentle movement', hint: 'For seniors' },
    ],
    q2: 'Have you done something similar before?',
    exps: [
      { v: 'new', label: 'Never', hint: 'starting from zero' },
      { v: 'some', label: 'A few times', hint: 'somewhat familiar' },
      { v: 'lots', label: 'Yes, quite a lot', hint: 'looking for a challenge' },
    ],
    resultTitle: 'Your classes',
    first: 'We recommend starting here',
    when: 'When:',
    cta: 'See days & book',
    none: 'There are no classes of this type on the timetable right now. Message us and we’ll let you know.',
    noneCta: 'Notify me on WhatsApp',
    tip: (d: string) => `Your first class costs 1 credit (${d}). If you like it, a plan makes it cheaper.`,
    back: 'Back',
    restart: 'Start over',
    hide: 'Hide',
    levels: { beg: 'Beginner', int: 'Intermediate', adv: 'Advanced', all: 'All levels' } as Record<string, string>,
    credits: (n: number) => (n === 1 ? '1 credit' : `${n} credits`),
    days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
  },
};

function useScheduledClasses() {
  const [classes, setClasses] = useState<GuideClass[] | null>(null);
  useEffect(() => {
    cachedFetch<ApiSchedule[] | { results: ApiSchedule[] }>(
      `${API_BASE_URL}v1/recurrences/?is_active=true`, { ttl: 600 },
    )
      .then((data) => {
        const list = Array.isArray(data) ? data : data?.results || [];
        const today = new Date().toISOString().slice(0, 10);
        const byType = new Map<number, GuideClass>();
        list.forEach((s) => {
          if (!s.is_recurrent || s.weekday == null || (s.end_date && s.end_date < today) || !s.class_type) return;
          const ct = s.class_type;
          if (!byType.has(ct.id)) {
            byType.set(ct.id, {
              id: ct.id, slug: ct.slug, title: prettyTitle(ct.title), titleEn: prettyTitle(tr(ct, 'title', 'en')), level: ct.level || 'all',
              image: ct.image, credits: Number(s.price_credits_override ?? ct.default_price_credits ?? 1),
              category: ct.category?.slug || '', duration: ct.duration_minutes, sessions: [],
            });
          }
          byType.get(ct.id)!.sessions.push({ weekday: s.weekday, start: s.start_time.slice(0, 5) });
        });
        byType.forEach((c) => c.sessions.sort((a, b) => a.weekday - b.weekday || a.start.localeCompare(b.start)));
        setClasses([...byType.values()]);
      })
      .catch(() => setClasses([]));
  }, []);
  return classes;
}

function Choice({ selected, label, hint, onClick }: { selected: boolean; label: string; hint: string; onClick: () => void }) {
  return (
    <Box as="button" onClick={onClick} aria-pressed={selected} textAlign="left"
      p={4} minH="68px" borderRadius="var(--radius-card)" border="2px solid"
      borderColor={selected ? C.accent : C.border}
      bg={selected ? 'var(--accent-soft)' : 'var(--surface-strong)'}
      cursor="pointer" transition="all .15s ease"
      _hover={{ borderColor: C.accent, transform: 'translateY(-2px)' }}
      _focusVisible={{ outline: `3px solid ${C.accent}`, outlineOffset: '2px' }}>
      <Flex align="center" justify="space-between" gap={2}>
        <Box>
          <Text fontFamily='var(--font-body)' fontWeight={800} fontSize="md" color={C.brown} lineHeight="1.3">{label}</Text>
          <Text fontFamily='var(--font-body)' fontSize="xs" color={C.textMuted}>{hint}</Text>
        </Box>
        <Flex w="22px" h="22px" borderRadius="full" flexShrink={0} border="2px solid"
          borderColor={selected ? C.accent : C.border} bg={selected ? C.accent : 'transparent'}
          align="center" justify="center">
          {selected && <Icon name="check" size={10} color="var(--on-primary)" />}
        </Flex>
      </Flex>
    </Box>
  );
}

/**
 * Guía "Tu primera clase": 2 preguntas en lenguaje llano → las clases reales
 * del horario que encajan (con sus días y horas) y un botón directo a
 * reservar. Abierta por defecto para quien llega por primera vez; después
 * queda como una barra discreta "¿Primera vez en {estudio}?".
 */
export default function FirstClassGuide({ dropIn = Number(getSiteClient().drop_in_price) || 12 }: { dropIn?: number }) {
  const lang = useLangStore((s) => s.lang);
  const tx = lang === 'en' ? T.en : T.es;
  const classes = useScheduledClasses();

  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [goal, setGoal] = useState<Goal | null>(null);
  const [exp, setExp] = useState<Experience | null>(null);

  useEffect(() => {
    let firstVisit = true;
    try {
      firstVisit = !localStorage.getItem(SEEN_KEY) && !localStorage.getItem('accessToken');
    } catch {}
    const fromLink = window.location.hash === '#guia';
    if (firstVisit || fromLink) setOpen(true);
    if (fromLink) setTimeout(() => document.getElementById('guia')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 300);
  }, []);

  const markSeen = () => { try { localStorage.setItem(SEEN_KEY, '1'); } catch {} };

  const results = useMemo(() => {
    if (!classes || !goal || !exp) return [];
    const rank = LEVEL_RANK[exp];
    const matched = classes.filter(MATCHERS[goal])
      .sort((a, b) => (rank[a.level] ?? 2) - (rank[b.level] ?? 2) || a.title.localeCompare(b.title));
    // Para quien empieza de cero, ocultar lo avanzado si hay alternativas
    const suitable = exp === 'new' ? matched.filter((c) => (rank[c.level] ?? 2) < 3) : matched;
    return (suitable.length ? suitable : matched).slice(0, 3);
  }, [classes, goal, exp]);

  const pick = (fn: () => void, next: number) => { fn(); setTimeout(() => setStep(next), 180); };
  const restart = () => { setGoal(null); setExp(null); setStep(1); };

  // ── Barra discreta (cerrada) ──
  if (!open) {
    return (
      <Box id="guia" maxW="900px" mx="auto" px={4} mb={6} style={{ scrollMarginTop: '90px' }}>
        <Flex as="button" w="full" onClick={() => { setOpen(true); }}
          className="sk-card"
          align="center" justify="space-between" gap={3} textAlign="left"
          p={4} cursor="pointer"
          _hover={{ borderColor: C.accent }}>
          <Box>
            <Text fontFamily='var(--font-body)' fontWeight={800} color={C.brown}>{tx.teaserTitle}</Text>
            <Text fontFamily='var(--font-body)' fontSize="sm" color={C.textMuted}>{tx.teaserText}</Text>
          </Box>
          {/* Aspecto de botón principal (no es un <button> aparte: toda la barra lo es) */}
          <Flex className="sk-btn" align="center" gap={2} flexShrink={0} px={4} py={2}>
            <Text fontFamily='var(--font-body)' fontSize="sm">{tx.teaserCta}</Text>
            <Icon name="arrow-right" size={11} />
          </Flex>
        </Flex>
      </Box>
    );
  }

  return (
    <Box id="guia" maxW="900px" mx="auto" px={4} mb={10} style={{ scrollMarginTop: '90px' }}>
      <Box className="sk-card" p={{ base: 5, md: 7 }}>

        {/* Cabecera + recorrido completo (dónde estás en el proceso de reservar) */}
        <Flex justify="space-between" align="flex-start" gap={3} mb={4}>
          <Text fontFamily='var(--font-heading)' fontSize={{ base: '2xl', md: '4xl' }}
            color={C.heading} letterSpacing="0.03em" lineHeight="1.1">
            {step === 3 ? tx.resultTitle : tx.title}
          </Text>
          <Button variant="ghost" size="sm" color={C.textMuted} minH="40px"
            fontFamily='var(--font-body)'
            onClick={() => { markSeen(); setOpen(false); }}>
            <Flex align="center" gap={1}><Icon name="chevron-down" size={10} style={{ transform: 'rotate(180deg)' }} />{tx.hide}</Flex>
          </Button>
        </Flex>

        <Flex as="ol" listStyleType="none" m={0} p={0} mb={5} gap={2} align="center" wrap="wrap"
          aria-label={lang === 'en' ? 'Booking steps' : 'Pasos para reservar'}>
          {tx.journey.map((label, i) => {
            const active = i === 0;
            return (
              <Flex as="li" key={label} align="center" gap={2}>
                <Flex w="24px" h="24px" borderRadius="full" align="center" justify="center"
                  bg={active ? C.grad : 'var(--accent-soft)'} color={active ? 'var(--on-primary)' : C.textMuted}
                  fontFamily='var(--font-body)' fontWeight={800} fontSize="xs">{i + 1}</Flex>
                <Text fontFamily='var(--font-body)' fontSize="xs" fontWeight={active ? 800 : 600}
                  color={active ? C.brown : C.textMuted}>{label}</Text>
                {i < tx.journey.length - 1 && <Box w="18px" h="2px" bg="var(--accent-border)" borderRadius="full" />}
              </Flex>
            );
          })}
        </Flex>

        <AnimatePresence mode="wait">
          {step === 1 && (
            <MotionBox key="g1" initial={{ opacity: 0, x: 14 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -14 }} transition={{ duration: 0.2 }}>
              <Text fontFamily='var(--font-body)' fontWeight={700} fontSize="lg" color={C.brown} mb={3}>{tx.q1}</Text>
              <SimpleGrid columns={{ base: 1, sm: 2, md: 3 }} gap={3}>
                {tx.goals.map((g) => (
                  <Choice key={g.v} selected={goal === g.v} label={g.label} hint={g.hint}
                    onClick={() => pick(() => setGoal(g.v as Goal), 2)} />
                ))}
              </SimpleGrid>
            </MotionBox>
          )}

          {step === 2 && (
            <MotionBox key="g2" initial={{ opacity: 0, x: 14 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -14 }} transition={{ duration: 0.2 }}>
              <Text fontFamily='var(--font-body)' fontWeight={700} fontSize="lg" color={C.brown} mb={3}>{tx.q2}</Text>
              <SimpleGrid columns={{ base: 1, md: 3 }} gap={3}>
                {tx.exps.map((e) => (
                  <Choice key={e.v} selected={exp === e.v} label={e.label} hint={e.hint}
                    onClick={() => pick(() => { setExp(e.v as Experience); markSeen(); }, 3)} />
                ))}
              </SimpleGrid>
            </MotionBox>
          )}

          {step === 3 && (
            <MotionBox key="g3" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
              {results.length === 0 ? (
                <Box p={5} borderRadius="var(--radius-card)" bg="var(--accent-soft)" textAlign="center">
                  <Text fontFamily='var(--font-body)' fontSize="sm" color={C.textMuted} mb={4}>{tx.none}</Text>
                  {contactUrl(getSiteClient()) && <Button as="a" target="_blank" rel="noopener"
                    href={contactUrl(getSiteClient(), lang === 'en' ? 'Hi! Please let me know when there are classes of this type' : 'Hola, avisadme cuando haya clases de este tipo')}
                    minH="46px" px={5} borderRadius="var(--radius-button)" bg="#25D366" color="white"
                    fontFamily='var(--font-body)' fontWeight={800} gap={2}>
                    <Icon name="whatsapp" size={15} />{tx.noneCta}
                  </Button>}
                </Box>
              ) : (
                <SimpleGrid columns={{ base: 1, md: Math.min(results.length, 3) }} gap={4}>
                  {results.map((c, i) => (
                    // sk-card; la primera (recomendada) con borde primario más grueso
                    <Box key={c.id} className="sk-card" overflow="hidden"
                      style={i === 0 ? { borderColor: 'var(--accent)', borderWidth: '2px' } : undefined}
                      display="flex" flexDirection="column">
                      {c.image && (
                        <Box h="120px" bgImage={`url(${optimizedImage(c.image, 640)})`} bgSize="cover" bgPos="center" position="relative">
                          {i === 0 && (
                            <Flex position="absolute" top={2} left={2} align="center" gap={1.5}
                              px={2.5} py={1} borderRadius="var(--radius-chip)" bg="color-mix(in srgb, var(--brand-dark) 78%, transparent)" color="white">
                              <Icon name="check" size={9} />
                              <Text fontFamily='var(--font-body)' fontSize="10px" fontWeight={800}>{tx.first}</Text>
                            </Flex>
                          )}
                        </Box>
                      )}
                      <Box p={4} display="flex" flexDirection="column" flex={1}>
                        {!c.image && i === 0 && (
                          <Text fontFamily='var(--font-body)' fontSize="10px" fontWeight={800}
                            color={C.accentDeep} textTransform="uppercase" letterSpacing="0.08em" mb={1}>{tx.first}</Text>
                        )}
                        <Text fontFamily='var(--font-body)' fontWeight={800} fontSize="md" color={C.brown} lineHeight="1.3">{lang === 'en' ? c.titleEn : c.title}</Text>
                        <Text fontFamily='var(--font-body)' fontSize="xs" color={C.textMuted} mb={3}>
                          {tx.levels[c.level] || c.level} · {c.duration} min · {tx.credits(c.credits)}
                        </Text>
                        <Text fontFamily='var(--font-body)' fontSize="11px" fontWeight={700} color={C.textMuted} mb={1}>{tx.when}</Text>
                        <Flex gap={1.5} wrap="wrap" mb={4} flex={1} alignContent="flex-start">
                          {c.sessions.slice(0, 6).map((s) => (
                            <Box key={`${s.weekday}-${s.start}`} px={2.5} py={1} borderRadius="var(--radius-chip)" bg="var(--accent-soft)">
                              <Text fontFamily='var(--font-body)' fontSize="12px" fontWeight={700} color={C.brown} textTransform="capitalize">
                                {tx.days[s.weekday]} {s.start}
                              </Text>
                            </Box>
                          ))}
                        </Flex>
                        <Button as="a" href={classUrl(c.slug, lang)}
                          className={i === 0 ? 'sk-btn' : 'sk-btn-ghost'}
                          w="full" minH="46px"
                          fontFamily='var(--font-body)' gap={2}>
                          {tx.cta}<Icon name="arrow-right" size={11} />
                        </Button>
                      </Box>
                    </Box>
                  ))}
                </SimpleGrid>
              )}

              <Text fontFamily='var(--font-body)' fontSize="sm" color={C.textMuted} mt={5}
                p={3} borderRadius="var(--radius-input)" bg="var(--accent-soft)">
                💡 {tx.tip(formatPrice(dropIn, lang, 'auto'))}
              </Text>

              <Button variant="ghost" size="sm" mt={3} color={C.textMuted} minH="44px"
                fontFamily='var(--font-body)' onClick={restart}>
                <Flex align="center" gap={1.5}><Icon name="refresh" size={10} />{tx.restart}</Flex>
              </Button>
            </MotionBox>
          )}
        </AnimatePresence>

        {step === 2 && (
          <Button variant="ghost" size="sm" mt={4} color={C.textMuted} minH="44px"
            fontFamily='var(--font-body)' onClick={() => setStep(1)}>
            <Flex align="center" gap={1.5}><Icon name="arrow-left" size={10} />{tx.back}</Flex>
          </Button>
        )}
      </Box>
    </Box>
  );
}
