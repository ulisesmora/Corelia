"use client";

import { Box, Flex, Text, Container, Skeleton, chakra } from '@chakra-ui/react';
import { useState, useEffect, useRef, useMemo, useCallback, useId } from 'react';
import { cachedFetch } from '../utils/fetchCache';
import Chakra from './ChakraProvider';
import { useLangStore, withSsrLang } from './stores/lang.store';
import { Icon } from './ui/Icon';
import InstructorDialog, { type Instructor } from './InstructorDialog';
import { tr } from '../utils/localized';

import { optimizedImage, withOriginalFallback } from '../utils/img';
import { API_V1 } from '../config';
const API_BASE_URL = API_V1;

// Paleta de la sección: tokens del estilo visual (presets.css)
const C = {
  accent: 'var(--accent)', brandDark: 'var(--accent-text)', brown: 'var(--heading-color)', brownMid: 'var(--text-muted)',
  focus: 'var(--accent)',
};

const TXT = {
  es: {
    eyebrow: 'Equipo',
    heading: 'Nuestro equipo',
    subtitle: 'Profesionales que te acompañan con conocimiento y cercanía',
    carousel: 'Instructores del estudio',
    prev: 'Ver instructores anteriores',
    next: 'Ver siguientes instructores',
    goTo: (i: number, n: number) => `Ir a la posición ${i} de ${n}`,
    showing: (a: number, b: number, n: number) => (a === b ? `Mostrando ${a} de ${n}` : `Mostrando ${a} a ${b} de ${n}`),
    meet: (n: string) => `Conocer a ${n}`,
    years: (n: number) => (n === 1 ? '1 año de experiencia' : `${n} años de experiencia`),
    photo: (n: string) => `Foto de ${n}`,
    loading: 'Cargando el equipo…',
  },
  en: {
    eyebrow: 'Team',
    heading: 'Our team',
    subtitle: 'Professionals who guide you with knowledge and warmth',
    carousel: 'Studio instructors',
    prev: 'Previous instructors',
    next: 'Next instructors',
    goTo: (i: number, n: number) => `Go to position ${i} of ${n}`,
    showing: (a: number, b: number, n: number) => (a === b ? `Showing ${a} of ${n}` : `Showing ${a} to ${b} of ${n}`),
    meet: (n: string) => `Meet ${n}`,
    years: (n: number) => (n === 1 ? '1 year of experience' : `${n} years of experience`),
    photo: (n: string) => `Photo of ${n}`,
    loading: 'Loading the team…',
  },
};
type Dict = typeof TXT.es;

const GAP = 20; // px entre tarjetas
const PAD = 12; // px de aire lateral para que no se corten las sombras
// Anchura de tarjeta: 1 (+ asomo de la siguiente) en móvil, 2 / 3 / 4 según ancho.
const CARD_W = {
  base: '80%',
  sm: `calc((100% - ${GAP}px) / 2)`,
  md: `calc((100% - ${GAP * 2}px) / 3)`,
  lg: `calc((100% - ${GAP * 3}px) / 4)`,
};

const focusRing = { outline: `2px solid ${C.focus}`, outlineOffset: '3px' };

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Más recientes primero: created_at desc, y id desc como desempate / respaldo. */
function newestFirst(list: Instructor[]): Instructor[] {
  const ts = (i: Instructor) => {
    const t = i.created_at ? Date.parse(i.created_at) : NaN;
    return Number.isFinite(t) ? t : 0;
  };
  return [...list].sort((a, b) => (ts(b) - ts(a)) || (b.id - a.id));
}

/* ─────────────────────────── Carrusel ─────────────────────────── */

interface CarouselState { index: number; perView: number; canPrev: boolean; canNext: boolean; fits: boolean }

function useCarousel(count: number) {
  const trackRef = useRef<HTMLUListElement>(null);
  const [s, setS] = useState<CarouselState>({ index: 0, perView: 1, canPrev: false, canNext: false, fits: true });

  const geometry = useCallback(() => {
    const el = trackRef.current;
    const first = el?.children[0] as HTMLElement | undefined;
    if (!el || !first) return null;
    const step = first.offsetWidth + GAP;
    const inner = el.clientWidth - PAD * 2;
    const perView = Math.max(1, Math.floor((inner + GAP + 1) / step));
    return { el, step, perView, max: Math.max(0, el.scrollWidth - el.clientWidth) };
  }, []);

  const measure = useCallback(() => {
    const g = geometry();
    if (!g) return;
    const { el, step, perView, max } = g;
    const fits = count <= perView;
    const last = Math.max(0, count - perView);
    const index = el.scrollLeft >= max - 2 ? last : Math.min(last, Math.round(el.scrollLeft / step));
    const next: CarouselState = {
      index, perView, fits,
      canPrev: !fits && el.scrollLeft > 2,
      canNext: !fits && el.scrollLeft < max - 2,
    };
    setS(prev => (
      prev.index === next.index && prev.perView === next.perView && prev.fits === next.fits &&
      prev.canPrev === next.canPrev && prev.canNext === next.canNext ? prev : next
    ));
  }, [count, geometry]);

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    let raf = 0;
    const onScroll = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(measure); };
    el.addEventListener('scroll', onScroll, { passive: true });
    const ro = new ResizeObserver(onScroll);
    ro.observe(el);
    measure();
    return () => { el.removeEventListener('scroll', onScroll); ro.disconnect(); cancelAnimationFrame(raf); };
  }, [measure]);

  const goTo = useCallback((i: number) => {
    const g = geometry();
    if (!g) return;
    const { el, perView, max } = g;
    const target = Math.max(0, Math.min(i, count - perView));
    const item = el.children[target] as HTMLElement | undefined;
    const left = Math.min(max, Math.max(0, (item?.offsetLeft ?? 0) - PAD));
    el.scrollTo({ left, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  }, [count, geometry]);

  const prev = useCallback(() => goTo(s.index - s.perView), [goTo, s.index, s.perView]);
  const next = useCallback(() => goTo(s.index + s.perView), [goTo, s.index, s.perView]);

  return { trackRef, ...s, goTo, prev, next };
}

function ArrowButton({ dir, disabled, label, onClick, controls }: {
  dir: 'prev' | 'next'; disabled: boolean; label: string; onClick: () => void; controls: string;
}) {
  return (
    <chakra.button
      type="button" onClick={onClick} disabled={disabled}
      aria-label={label} aria-controls={controls}
      w="48px" h="48px" flexShrink={0} borderRadius="full"
      display="inline-flex" alignItems="center" justifyContent="center"
      bg="var(--surface-strong)" color={C.brandDark}
      border="var(--border-width) solid var(--accent-border)"
      boxShadow="var(--shadow-card)"
      cursor="pointer" transition="background 0.2s, color 0.2s, box-shadow 0.2s, opacity 0.2s"
      _hover={{ bg: C.accent, color: 'var(--on-primary)', borderColor: C.accent, boxShadow: 'var(--shadow-hover)' }}
      _focusVisible={focusRing}
      _disabled={{
        opacity: 0.4, cursor: 'not-allowed', boxShadow: 'none',
        _hover: { bg: 'var(--surface-strong)', color: C.brandDark, borderColor: 'var(--accent-border)' },
      }}
    >
      {dir === 'prev' ? <Icon name="chevron-left" size={15} aria-hidden /> : <Icon name="chevron-right" size={15} aria-hidden />}
    </chakra.button>
  );
}

/* ─────────────────────────── Tarjeta ─────────────────────────── */

function InstructorCard({ instructor, en, T, onOpen }: {
  instructor: Instructor; en: boolean; T: Dict; onOpen: () => void;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const lang = en ? 'en' : 'es';
  const name = tr(instructor, 'name', lang) || instructor.name;
  const shortBio = tr(instructor, 'short_bio', lang);
  const firstName = name.trim().split(/\s+/)[0] || name;
  const years = instructor.experience_years ?? 0;

  return (
    <chakra.article
      position="relative" display="flex" flexDirection="column" w="full"
      bg="var(--surface)" borderRadius="var(--radius-card)" overflow="hidden"
      border="var(--border-width) solid var(--surface-border)"
      boxShadow="var(--shadow-card)"
      backdropFilter="var(--surface-blur)"
      cursor="pointer"
      transition="transform 0.3s ease, box-shadow 0.3s ease"
      css={{
        WebkitBackdropFilter: 'var(--surface-blur)',
        '& .team-photo': { transition: 'transform 0.55s cubic-bezier(0.25,0.46,0.45,0.94)' },
        '@media (hover: hover)': {
          '&:hover': { transform: 'var(--hover-lift)', boxShadow: 'var(--shadow-hover)' },
          '&:hover .team-photo': { transform: 'scale(1.04)' },
        },
        '&:focus-within': { boxShadow: 'var(--shadow-hover)' },
        '@media (prefers-reduced-motion: reduce)': {
          transition: 'none',
          '&:hover': { transform: 'none' },
          '& .team-photo': { transition: 'none' },
          '&:hover .team-photo': { transform: 'none' },
        },
      }}
    >
      {/* Foto: mismo recorte para todas */}
      <Box position="relative" aspectRatio="4 / 5" overflow="hidden"
        bg="var(--accent-soft)">
        {instructor.image && !imgFailed ? (
          <chakra.img
            className="team-photo"
            src={optimizedImage(instructor.image, 640)} alt={T.photo(name)}
            loading="lazy" decoding="async" width={400} height={500}
            w="full" h="full" objectFit="cover" objectPosition="center 20%" display="block"
            onError={withOriginalFallback(instructor.image, () => setImgFailed(true))}
          />
        ) : (
          <Flex w="full" h="full" align="center" justify="center" aria-hidden>
            <Icon name="leaf" size={40} color="var(--accent-border)" />
          </Flex>
        )}
      </Box>

      <Flex direction="column" flex={1} gap={1.5} px={5} pt={4} pb={5}>
        <Text as="h3" fontFamily='var(--font-heading)' fontWeight={400}
          fontSize={{ base: '2xl', md: '2xl' }} color={C.brown}
          letterSpacing="0.04em" lineHeight="1.1">
          {name}
        </Text>
        {years > 0 && (
          <Text fontSize="13px" fontWeight={700} color={C.brandDark}
            fontFamily='var(--font-body)'>
            {T.years(years)}
          </Text>
        )}
        {shortBio && (
          <Text fontSize="14px" color={C.brownMid} fontFamily='var(--font-body)'
            lineHeight="1.55" lineClamp={3}>
            {shortBio}
          </Text>
        )}
        <Box flex={1} minH={3} aria-hidden />

        {/* El pseudo-elemento ::after estira el botón a toda la tarjeta:
            un único punto de foco/clic accesible. */}
        <chakra.button
          type="button" onClick={onOpen} aria-haspopup="dialog"
          className="sk-btn-ghost"
          alignSelf="flex-start" minH="44px" px={4} gap={2}
          display="inline-flex" alignItems="center"
          fontFamily='var(--font-body)' fontWeight={700} fontSize="14px"
          cursor="pointer"
          _focusVisible={focusRing}
          _after={{ content: '""', position: 'absolute', inset: 0, borderRadius: 'var(--radius-card)' }}
        >
          {T.meet(firstName)}
          <Icon name="arrow-right" size={11} aria-hidden />
        </chakra.button>
      </Flex>
    </chakra.article>
  );
}

function CardSkeleton() {
  return (
    <Box w="full" borderRadius="var(--radius-card)" overflow="hidden" bg="var(--surface)"
      border="var(--border-width) solid var(--surface-border)">
      <Skeleton aspectRatio="4 / 5" borderRadius={0} css={{ '--start-color': 'var(--accent-soft)', '--end-color': 'var(--accent-border)' }} />
      <Box px={5} pt={4} pb={5}>
        <Skeleton h="24px" w="65%" mb={2} />
        <Skeleton h="14px" w="45%" mb={3} />
        <Skeleton h="14px" w="95%" mb={1.5} />
        <Skeleton h="14px" w="80%" mb={4} />
        <Skeleton h="44px" w="60%" borderRadius="var(--radius-button)" />
      </Box>
    </Box>
  );
}

/* ─────────────────────────── Sección ─────────────────────────── */

function TeamInner({ initialInstructors }: { initialInstructors?: Instructor[] | null }) {
  const lang = useLangStore(s => s.lang);
  const en = lang === 'en';
  const T = en ? TXT.en : TXT.es;
  const uid = useId();
  const headingId = `${uid}-team-heading`;
  const trackId = `${uid}-team-track`;

  // Con datos del servidor la sección sale ya en el HTML (sin esqueleto ni fetch)
  const [raw, setRaw] = useState<Instructor[] | null>(initialInstructors ?? null);
  const [selected, setSelected] = useState<Instructor | null>(null);

  useEffect(() => {
    if (initialInstructors) return;
    let alive = true;
    cachedFetch<Instructor[] | { results: Instructor[] }>(`${API_BASE_URL}/instructors/`, { ttl: 600 })
      .then(d => { if (alive) setRaw(Array.isArray(d) ? d : (d?.results || [])); })
      // Error silencioso: la sección simplemente no se muestra.
      .catch(() => { if (alive) setRaw([]); });
    return () => { alive = false; };
  }, []);

  const instructors = useMemo(() => (raw ? newestFirst(raw) : []), [raw]);
  const loading = raw === null;
  const count = loading ? 4 : instructors.length;
  const car = useCarousel(count);

  if (!loading && instructors.length === 0) return null;

  const positions = Math.max(1, count - car.perView + 1);
  const showControls = !loading && !car.fits;
  const first = car.index + 1;
  const lastVisible = Math.min(count, car.index + car.perView);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!showControls) return;
    const map: Record<string, () => void> = {
      ArrowLeft: car.prev, ArrowRight: car.next,
      Home: () => car.goTo(0), End: () => car.goTo(count),
    };
    const fn = map[e.key];
    if (fn) { e.preventDefault(); fn(); }
  };

  return (
    <Box w="full" py={{ base: 14, md: 24 }}
      bg="var(--section-bg)"
      overflow="hidden">
      <Container maxW="6xl">
        {/* Cabecera */}
        <Box mb={{ base: 7, md: 10 }} maxW="560px">
          <Box className="sk-eyebrow" display="inline-flex" px={3} py={1} mb={3}>
            <Text fontSize="11px" fontWeight={700}>
              {T.eyebrow}
            </Text>
          </Box>
          <Text as="h2" id={headingId} className="sk-section-title" fontFamily='var(--font-heading)' fontWeight={400}
            fontSize={{ base: '4xl', md: '5xl', lg: '6xl' }}
            color={C.brown} letterSpacing="wide" lineHeight="1">
            {T.heading}
          </Text>
          <Text fontSize={{ base: 'md', md: 'lg' }} color={C.brownMid}
            fontFamily='var(--font-body)' mt={2} lineHeight="1.65">
            {T.subtitle}
          </Text>
        </Box>

        {/* Carrusel */}
        <Box
          role="region" aria-roledescription={en ? 'carousel' : 'carrusel'}
          aria-label={T.carousel} aria-busy={loading || undefined}
          onKeyDown={onKeyDown}
        >
          <chakra.ul
            ref={car.trackRef} id={trackId}
            tabIndex={showControls ? 0 : -1}
            aria-label={loading ? T.loading : undefined}
            display="flex" gap={`${GAP}px`} listStyleType="none" m={0}
            position="relative"
            mx={`-${PAD}px`} px={`${PAD}px`} py={3}
            justifyContent={car.fits ? 'center' : 'flex-start'}
            borderRadius="var(--radius-card)"
            _focusVisible={focusRing}
            css={{
              scrollSnapType: 'x mandatory',
              scrollPaddingInline: `${PAD}px`,
              overscrollBehaviorX: 'contain',
              overflowY: 'hidden',
              // Táctil: deslizamiento natural con snap, sin barra visible.
              overflowX: 'auto',
              WebkitOverflowScrolling: 'touch',
              scrollbarWidth: 'none',
              '&::-webkit-scrollbar': { display: 'none' },
              // Ratón / trackpad: sin arrastre ni rueda; solo botones, puntos y teclado.
              '@media (hover: hover) and (pointer: fine)': { overflowX: 'hidden' },
            }}
          >
            {loading
              ? Array.from({ length: 4 }, (_, i) => (
                <chakra.li key={i} flex="0 0 auto" w={CARD_W} display="flex" aria-hidden>
                  <CardSkeleton />
                </chakra.li>
              ))
              : instructors.map((ins, i) => (
                <chakra.li key={ins.id} flex="0 0 auto" w={CARD_W} display="flex"
                  aria-setsize={count} aria-posinset={i + 1}
                  css={{ scrollSnapAlign: 'start' }}>
                  <InstructorCard instructor={ins} en={en} T={T} onOpen={() => setSelected(ins)} />
                </chakra.li>
              ))}
          </chakra.ul>

          {showControls && (
            <Flex mt={{ base: 5, md: 7 }} align="center" justify="center" gap={{ base: 3, md: 5 }}>
              <ArrowButton dir="prev" disabled={!car.canPrev} label={T.prev} onClick={car.prev} controls={trackId} />

              {positions <= 8 ? (
                <Flex gap={0.5} align="center">
                  {Array.from({ length: positions }, (_, i) => {
                    const active = i === car.index;
                    return (
                      <chakra.button key={i} type="button"
                        aria-label={T.goTo(i + 1, positions)} aria-current={active ? 'true' : undefined}
                        aria-controls={trackId}
                        onClick={() => car.goTo(i)}
                        w="28px" h="28px" display="inline-flex" alignItems="center" justifyContent="center"
                        bg="transparent" border="none" cursor="pointer" borderRadius="full"
                        _focusVisible={{ outline: `2px solid ${C.focus}`, outlineOffset: '0' }}
                      >
                        <Box as="span" display="block" h="8px" borderRadius="full"
                          w={active ? '22px' : '8px'}
                          bg={active ? C.brandDark : 'var(--accent-border)'}
                          transition="width 0.25s ease, background 0.25s ease" />
                      </chakra.button>
                    );
                  })}
                </Flex>
              ) : (
                <Text aria-hidden fontFamily='var(--font-body)' fontWeight={700}
                  fontSize="14px" color={C.brandDark} minW="56px" textAlign="center">
                  {first} / {positions}
                </Text>
              )}

              <ArrowButton dir="next" disabled={!car.canNext} label={T.next} onClick={car.next} controls={trackId} />
            </Flex>
          )}

          {showControls && (
            <Box srOnly aria-live="polite" aria-atomic="true">
              {T.showing(first, lastVisible, count)}
            </Box>
          )}
        </Box>
      </Container>

      <InstructorDialog
        instructorId={selected?.id ?? null}
        open={!!selected}
        onClose={() => setSelected(null)}
        lang={lang}
        prefetched={selected ?? undefined}
      />
    </Box>
  );
}

function Team({ initialInstructors }: { initialInstructors?: Instructor[] | null }) {
  return <Chakra><TeamInner initialInstructors={initialInstructors} /></Chakra>;
}

export default withSsrLang(Team);
