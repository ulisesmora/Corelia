"use client";

import { useEffect, useRef, useState } from 'react';
import {
  Box, Flex, Text, HStack, CloseButton, Portal, Spinner, Center, Dialog, chakra,
} from '@chakra-ui/react';
import { Icon } from './ui/Icon';
import { useLangStore } from './stores/lang.store';
import { tr } from '../utils/localized';

import { optimizedImage, withOriginalFallback } from '../utils/img';
import { API_V1 } from '../config';
const API_BASE_URL = API_V1;

// Paleta del diálogo: tokens del estilo visual (presets.css)
const C = {
  accent: 'var(--accent)', brandDark: 'var(--accent-text)', brown: 'var(--page-text)', brownMid: 'var(--text-muted)',
  cream: 'var(--surface-strong)', focus: 'var(--accent)',
};

type InstructorTr = { name?: string; short_bio?: string; description?: string; vision?: string };

export interface Instructor {
  id: number; name: string; slug: string;
  image?: string | null; experience_years: number;
  short_bio?: string | null; description?: string | null;
  vision?: string | null; website?: string | null;
  short_bio_en?: string | null; description_en?: string | null; vision_en?: string | null;
  instagram?: string | null; linkedin?: string | null;
  created_at?: string | null;
  translations?: Record<string, InstructorTr | undefined>;
}

interface Props {
  instructorId: number | null;
  open: boolean;
  onClose: () => void;
  /** Idioma activo; si no se pasa se usa el del store. */
  lang?: string;
  /** Instructor ya cargado (completo o parcial). Si es parcial se completa con la API. */
  prefetched?: Instructor;
}

const TXT = {
  es: {
    close: 'Cerrar perfil',
    about: 'Sobre mí',
    vision: 'Mi visión',
    follow: 'Sígueme',
    years: (n: number) => (n === 1 ? '1 año de experiencia' : `${n} años de experiencia`),
    photo: (n: string) => `Foto de ${n}`,
    level: { senior: 'Senior', expert: 'Experta/o', base: 'Instructor/a' },
    error: 'No hemos podido cargar este perfil. Inténtalo de nuevo más tarde.',
    loading: 'Cargando perfil…',
    ig: (n: string) => `Instagram de ${n} (se abre en una pestaña nueva)`,
    web: (n: string) => `Web de ${n} (se abre en una pestaña nueva)`,
    li: (n: string) => `LinkedIn de ${n} (se abre en una pestaña nueva)`,
  },
  en: {
    close: 'Close profile',
    about: 'About me',
    vision: 'My vision',
    follow: 'Follow me',
    years: (n: number) => (n === 1 ? '1 year of experience' : `${n} years of experience`),
    photo: (n: string) => `Photo of ${n}`,
    level: { senior: 'Senior', expert: 'Expert', base: 'Instructor' },
    error: "We couldn't load this profile. Please try again later.",
    loading: 'Loading profile…',
    ig: (n: string) => `${n} on Instagram (opens in a new tab)`,
    web: (n: string) => `${n}'s website (opens in a new tab)`,
    li: (n: string) => `${n} on LinkedIn (opens in a new tab)`,
  },
};

/** El listado de la API trae todos los campos (aunque sean null); un objeto parcial no. */
const isComplete = (i?: Instructor | null) => !!i && ('description' in i || 'short_bio' in i);

/** Acepta URL completas, dominios sin esquema o, para Instagram, "@usuario". */
function normalizeUrl(raw?: string | null, kind?: 'instagram'): string | null {
  const v = (raw || '').trim();
  if (!v) return null;
  if (/^https?:\/\//i.test(v)) return v;
  if (kind === 'instagram' && !v.includes('.') && !v.includes('/')) {
    return `https://www.instagram.com/${v.replace(/^@/, '')}/`;
  }
  return `https://${v.replace(/^\/+/, '')}`;
}

function SocialLink({ href, label, children }: { href: string; label: string; children: React.ReactNode }) {
  return (
    <chakra.a
      href={href} target="_blank" rel="noopener noreferrer" aria-label={label}
      w="44px" h="44px" borderRadius="full" display="inline-flex"
      alignItems="center" justifyContent="center"
      bg="var(--accent-soft)" border="1px solid var(--accent-border)"
      color={C.brandDark} transition="background 0.2s, color 0.2s"
      _hover={{ bg: C.accent, color: 'var(--on-primary)', borderColor: C.accent }}
      _focusVisible={{ outline: `2px solid ${C.focus}`, outlineOffset: '2px' }}
    >
      {children}
    </chakra.a>
  );
}

export default function InstructorDialog({ instructorId, open, onClose, lang, prefetched }: Props) {
  const storeLang = useLangStore(s => s.lang);
  const en = (lang ?? storeLang) === 'en';
  const T = en ? TXT.en : TXT.es;

  const [instructor, setInstructor] = useState<Instructor | null>(prefetched ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);

  // El padre puede pasar un objeto nuevo en cada render: lo leemos por ref
  // para no relanzar el efecto (y la petición) en cada render.
  const prefetchedRef = useRef(prefetched);
  prefetchedRef.current = prefetched;
  const targetId = instructorId ?? prefetched?.id ?? null;

  useEffect(() => {
    if (!open || targetId == null) return;
    const pf = prefetchedRef.current;
    const pfMatches = !!pf && pf.id === targetId;
    setError(false);
    setImgFailed(false);
    setInstructor(pfMatches ? pf! : null);
    if (pfMatches && isComplete(pf)) { setLoading(false); return; }

    const ctrl = new AbortController();
    setLoading(true);
    fetch(`${API_BASE_URL}/instructors/${targetId}/`, { signal: ctrl.signal })
      .then(r => { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
      .then((d: Instructor) => setInstructor(d))
      .catch(e => { if (e?.name !== 'AbortError') setError(true); })
      .finally(() => { if (!ctrl.signal.aborted) setLoading(false); });
    return () => ctrl.abort();
  }, [open, targetId]);

  const trLang = en ? 'en' : 'es';
  const name = tr(instructor, 'name', trLang);
  const shortBio = tr(instructor, 'short_bio', trLang);
  const description = tr(instructor, 'description', trLang);
  const vision = tr(instructor, 'vision', trLang);
  const years = instructor?.experience_years ?? 0;
  const level = years >= 10 ? T.level.senior : years >= 5 ? T.level.expert : years > 0 ? T.level.base : null;

  const ig = normalizeUrl(instructor?.instagram, 'instagram');
  const web = normalizeUrl(instructor?.website);
  const li = normalizeUrl(instructor?.linkedin);
  const showImg = !!instructor?.image && !imgFailed;

  const sectionLabel = {
    fontSize: '12px', fontWeight: 700, color: C.brandDark,
    fontFamily: 'var(--font-body)', letterSpacing: '0.09em',
    textTransform: 'uppercase' as const, mb: 2,
  };

  return (
    <Dialog.Root
      open={open}
      onOpenChange={({ open: o }) => { if (!o) onClose(); }}
      placement="center"
      motionPreset="slide-in-bottom"
    >
      <Portal>
        <Dialog.Backdrop
          bg="var(--overlay)"
          backdropFilter="var(--surface-blur)"
          style={{ WebkitBackdropFilter: 'var(--surface-blur)' }}
        />
        <Dialog.Positioner px={{ base: 3, md: 6 }}>
          <Dialog.Content
            // Panel del estilo: superficie, borde, radio, sombra flotante y blur
            className="sk-panel"
            overflow="hidden"
            w="full"
            maxW={{ base: '560px', md: '860px' }}
            maxH={{ base: 'calc(100dvh - 24px)', md: 'min(680px, calc(100dvh - 64px))' }}
            display="flex" flexDirection="column"
            my="auto"
            aria-busy={loading || undefined}
          >
            <Dialog.CloseTrigger asChild top={3} insetEnd={3} zIndex={3}>
              <CloseButton
                aria-label={T.close}
                w="44px" h="44px" minW="44px" borderRadius="full"
                bg="var(--surface-strong)" color={C.brown}
                boxShadow="var(--shadow-card)"
                _hover={{ bg: 'var(--surface)' }}
                _focusVisible={{ outline: `2px solid ${C.focus}`, outlineOffset: '2px' }}
              />
            </Dialog.CloseTrigger>

            {!instructor && (
              <Center minH="320px" p={8} flexDirection="column" gap={3}>
                {error ? (
                  <>
                    <Dialog.Title srOnly>{T.error}</Dialog.Title>
                    <Text role="alert" color={C.brownMid} fontFamily='var(--font-body)' textAlign="center">
                      {T.error}
                    </Text>
                  </>
                ) : (
                  <>
                    <Dialog.Title srOnly>{T.loading}</Dialog.Title>
                    <Spinner size="lg" color={C.accent} borderWidth="3px" />
                  </>
                )}
              </Center>
            )}

            {instructor && (
              // En móvil desplaza todo el contenido; en escritorio solo la columna de texto.
              <Flex
                direction={{ base: 'column', md: 'row' }}
                flex="1" minH={0}
                overflowY={{ base: 'auto', md: 'hidden' }}
                css={{ overscrollBehavior: 'contain' }}
              >
                {/* ── Foto ── */}
                <Box
                  w={{ base: 'full', md: '320px' }}
                  h={{ base: 'min(52dvh, 380px)', md: 'auto' }}
                  flexShrink={0}
                  position="relative" overflow="hidden"
                  bg="var(--surface-muted)"
                >
                  {showImg ? (
                    <chakra.img
                      src={optimizedImage(instructor.image, 828)} alt={T.photo(name)}
                      w="full" h="full" objectFit="cover" objectPosition="center 20%"
                      display="block" decoding="async"
                      onError={withOriginalFallback(instructor.image, () => setImgFailed(true))}
                    />
                  ) : (
                    <Flex h="full" align="center" justify="center" aria-hidden>
                      <Flex w="96px" h="96px" borderRadius="full" bg="var(--accent-soft)"
                        align="center" justify="center">
                        <Icon name="leaf" size={34} color={C.accent} />
                      </Flex>
                    </Flex>
                  )}

                  <Box position="absolute" inset={0} pointerEvents="none"
                    bg="linear-gradient(to top, color-mix(in srgb, color-mix(in srgb, var(--brand-dark) 50%, black) 72%, transparent) 0%, color-mix(in srgb, color-mix(in srgb, var(--brand-dark) 50%, black) 10%, transparent) 45%, color-mix(in srgb, color-mix(in srgb, var(--brand-dark) 50%, black) 0%, transparent) 60%)" />

                  <Box position="absolute" bottom={0} left={0} right={0} p={{ base: 5, md: 6 }}>
                    {level && (
                      <Box display="inline-flex" px={2.5} py={0.5} borderRadius="var(--radius-chip)" mb={2}
                        bg="rgba(255,255,255,0.20)" border="1px solid rgba(255,255,255,0.35)">
                        <Text fontSize="11px" fontWeight={700} color="white"
                          fontFamily='var(--font-body)' letterSpacing="0.08em" textTransform="uppercase">
                          {level}
                        </Text>
                      </Box>
                    )}
                    <Dialog.Title
                      fontFamily='var(--font-heading)' fontWeight={400}
                      fontSize={{ base: '3xl', md: '4xl' }} color="white"
                      letterSpacing="0.04em" lineHeight="1.05"
                    >
                      {name}
                    </Dialog.Title>
                    {years > 0 && (
                      <Text fontSize="13px" fontWeight={600} color="rgba(255,255,255,0.88)"
                        fontFamily='var(--font-body)' mt={1}>
                        {T.years(years)}
                      </Text>
                    )}
                  </Box>
                </Box>

                {/* ── Texto ── */}
                <Flex
                  flex={1} minH={0} direction="column"
                  p={{ base: 6, md: 8 }} pt={{ base: 6, md: 16 }} gap={6}
                  overflowY={{ base: 'visible', md: 'auto' }}
                  css={{
                    overscrollBehavior: 'contain',
                    '&::-webkit-scrollbar': { width: '6px' },
                    '&::-webkit-scrollbar-thumb': { background: 'var(--accent-border)', borderRadius: '6px' },
                  }}
                >
                  {shortBio && (
                    <Box>
                      <Box w="32px" h="2px" bg={C.accent} borderRadius="full" mb={3} aria-hidden />
                      <Dialog.Description
                        fontSize={{ base: 'md', md: 'lg' }} fontWeight={600} color={C.brownMid}
                        fontFamily='var(--font-body)' lineHeight="1.6" fontStyle="italic"
                      >
                        “{shortBio}”
                      </Dialog.Description>
                    </Box>
                  )}

                  {description && (
                    <Box>
                      <Text as="h3" {...sectionLabel}>{T.about}</Text>
                      <Text fontSize="15px" color={C.brownMid} fontFamily='var(--font-body)'
                        lineHeight="1.75" whiteSpace="pre-line">
                        {description}
                      </Text>
                    </Box>
                  )}

                  {vision && (
                    <Box p={4} borderRadius="var(--radius-card)"
                      bg="var(--accent-soft)" border="1px solid var(--accent-border)">
                      <Text as="h3" {...sectionLabel}>{T.vision}</Text>
                      <Text fontSize="15px" color={C.brownMid} fontFamily='var(--font-body)'
                        lineHeight="1.7" whiteSpace="pre-line">
                        {vision}
                      </Text>
                    </Box>
                  )}

                  {loading && !description && !shortBio && (
                    <Center py={6}><Spinner size="md" color={C.accent} aria-label={T.loading} /></Center>
                  )}

                  {(ig || web || li) && (
                    <Box mt="auto" pt={2}>
                      <Text as="h3" {...sectionLabel}>{T.follow}</Text>
                      <HStack gap={3}>
                        {ig && <SocialLink href={ig} label={T.ig(name)}><Icon name="instagram" size={17} aria-hidden /></SocialLink>}
                        {web && <SocialLink href={web} label={T.web(name)}><Icon name="globe" size={16} aria-hidden /></SocialLink>}
                        {li && <SocialLink href={li} label={T.li(name)}><Icon name="linkedin" size={16} aria-hidden /></SocialLink>}
                      </HStack>
                    </Box>
                  )}
                </Flex>
              </Flex>
            )}
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
