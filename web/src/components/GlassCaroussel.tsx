'use client'
import {
  Badge,
  Box,
  Button,
  Flex,
  IconButton,
  Image,
  Link,
  Text,
  VStack,
  Wrap,
  WrapItem,
} from '@chakra-ui/react';
import { motion, AnimatePresence } from 'framer-motion';
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Icon } from './ui/Icon';
import Chakra from './ChakraProvider';
import { useT } from '../i18n/index';
import { useLangStore } from './stores/lang.store';
import type { ApiClassType } from './OurClasses';
import { tr, classUrl } from '../utils/localized';

import { optimizedImage, withOriginalFallback } from '../utils/img';
export interface GlassCarouselProps  {
  title: string;
  description: string;
  items: ApiClassType[];
};
export interface ItemGlass {
  image: string;
  title: string;
  description: string;
  time?: string;
  duration: string,
  teacher: UrlItem,
  room: UrlItem,
  tags: string[]
  all_instructors?: string[]
}
export interface UrlItem { name: string, url: string }

// Etiquetas de nivel y categoría: relleno de marca con su texto legible
const tagColors = [
  { bg: 'var(--accent)', color: 'var(--on-primary)' },
  { bg: 'var(--brand-secondary)', color: 'var(--on-secondary)' },
] as const;
const MotionBox = motion(Box);
const mod = (n: number, m: number) => ((n % m) + m) % m;
const PLACEHOLDER = 'data:image/gif;base64,R0lGODlhAQABAAAAACw='; // 1x1 transparente
const VISIBLE_COUNT = 3;

// Color dominante rápido sobre el MISMO <img> cargado (sin red extra)
function extractDominantFromImgEl(img: HTMLImageElement): string | null {
  try {
    const w = Math.max(1, Math.floor(img.naturalWidth / 20));
    const h = Math.max(1, Math.floor(img.naturalHeight / 20));
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, w, h);
    const { data } = ctx.getImageData(0, 0, w, h);
    let r = 0, g = 0, b = 0, c = 0;
    for (let i = 0; i < data.length; i += 4) {
      r += data[i]; g += data[i+1]; b += data[i+2]; c++;
    }
    r = Math.round(r / c); g = Math.round(g / c); b = Math.round(b / c);
    return `rgba(${r}, ${g}, ${b}, 0.6)`;
  } catch { return null; }
}

export default function GlassCarousel(props: GlassCarouselProps) {
  const { items, title, description } = props;

  // Congelar items en el primer render
  const frozenItemsRef = useRef<ApiClassType[] | null>(null);
  if (frozenItemsRef.current === null) frozenItemsRef.current = items;
  const memoItems = frozenItemsRef.current!;
  const total = useMemo(() => memoItems.length, [memoItems]);
   const t = useT();
  const lang = useLangStore(s => s.lang);

  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState<1 | -1>(1);

  // Índices habilitados (solo estos descargan la imagen real)
  const [allowed, setAllowed] = useState<Set<number>>(new Set());
  // Color dominante por índice (se calcula en onLoad del <img> real)
  const [dominantColors, setDominantColors] = useState<string[]>([]);


   const ctaText = useMemo(
    () => t("home.classes.ctaMoreAbout", { title: title.toLowerCase() }, `Ver más sobre ${title.toLowerCase()}`),
    [lang, title, t]
  );

  // ✅ Texto botón “Próximamente”
  const soonText = useMemo(
    () => t("home.classes.soon", undefined, "Ver más"),
    [lang, t]
  );


  // Evitar iniciar fuera de viewport
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') { setInView(true); return; }
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setInView(true); obs.disconnect(); }
    }, { threshold: 0.15 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // Helper: índices visibles desde un índice base
  const computeVisible = useCallback((idx: number) => {
    const count = Math.min(VISIBLE_COUNT, total);
    const arr: number[] = [];
    for (let i = 0; i < count; i++) arr.push(mod(idx + i, total));
    return arr;
  }, [total]);

  // Habilitar exactamente las 3 iniciales al entrar en vista
  useEffect(() => {
    if (!inView || total === 0) return;
    setAllowed(prev => {
      if (prev.size > 0) return prev;
      return new Set(computeVisible(0));
    });
  }, [inView, total, computeVisible]);

  // Habilitar exactamente 1 nueva por interacción (la que entra)
  const lastIndexRef = useRef(0);
  useEffect(() => {
    if (!inView || total === 0) return;
    const prev = lastIndexRef.current;
    if (index === prev && allowed.size > 0) return;
    const incoming = direction === 1
      ? mod(index + (VISIBLE_COUNT - 1), total) // entra por derecha
      : mod(index, total);                      // entra por izquierda
    setAllowed(prevSet => {
      if (prevSet.has(incoming)) return prevSet;
      const next = new Set(prevSet);
      next.add(incoming);
      return next;
    });
    lastIndexRef.current = index;
  }, [index, direction, total, inView, allowed.size]);

  // Handlers
  const handleNext = useCallback(() => {
    if (!total) return;
    setDirection(1);
    setIndex(prev => mod(prev + 1, total));
  }, [total]);

  const handlePrev = useCallback(() => {
    if (!total) return;
    setDirection(-1);
    setIndex(prev => mod(prev - 1, total));
  }, [total]);

  // 3 visibles
  const visibleIndices = useMemo(() => computeVisible(index), [computeVisible, index]);

  // Animaciones estables
  const variants = useMemo(() => ({
    enter: (dir: number) => ({ x: dir > 0 ? 1000 : -1000, opacity: 0 }),
    center: { x: 0, opacity: 1 },
    // ⚠️ no usamos exit para no desmontar el nodo
  }), []);
  const cardTransition = useMemo(() => ({
    x: { type: 'spring', stiffness: 300, damping: 30 },
    opacity: { duration: 0.2 },
  }), []);

  // onLoad del <img> real → calcular color sobre ese mismo recurso
  const handleImgLoad = useCallback((realIdx: number) => (e: React.SyntheticEvent<HTMLImageElement>) => {
    if (!e?.currentTarget || dominantColors[realIdx]) return;
    const col = extractDominantFromImgEl(e.currentTarget);
    if (!col) return;
    setDominantColors(prev => {
      const arr = prev.slice();
      arr[realIdx] = col;
      return arr;
    });
  }, [dominantColors]);

  return (
    <Chakra>
      <Flex w="100%" justifyContent="center" pt="2rem">
        <Text as="h3" fontSize="3xl" color="var(--heading-color)" fontWeight="semibold">
          {title}
        </Text>
      </Flex>

      <Box textAlign="center" maxW="800px" mx="auto" px={4} pb={8}>
        <Text fontSize="lg" color="var(--text-muted)">
          {description}
        </Text>
      </Box>

      <Flex
        ref={containerRef}
        direction="row"
        justify="center"
        align="center"
        position="relative"
        px={{ base: 4, md: 8 }}
        py={12}
        w="100%"
        maxW="100vw"
        overflowX="hidden"
        minH="600px"
      >
        <IconButton
          aria-label={t('common.prev')}
          onClick={handlePrev}
          size="lg"
          variant="ghost"
          position="absolute"
          left={{ base: 4, md: 8 }}
          zIndex={10}
        >
          <Icon name="chevron-left" />
        </IconButton>

        <Flex
          justify="center"
          align="center"
          w="90vw"
          maxW="1400px"
          mx="auto"
          gap={6}
        >
          <AnimatePresence custom={direction} initial={false} mode="popLayout">
            {visibleIndices.map((realIdx, slot) => {
              const isAllowed = allowed.has(realIdx);
              // Sin foto en el panel: marcador neutro
              const imgSrc =  memoItems[realIdx].image || '/placeholder-class.svg';

              return (
                <MotionBox
                  key={`slot-${slot}`}             // 👈 key fija por slot (0/1/2)
                  custom={direction}
                  variants={variants}
                  initial="enter"
                  animate="center"
                  exit={undefined}                 // 👈 no desmontar en salida
                  transition={cardTransition}
                  w={{ base: total >= 3 ? '90%' : '90%', md: total >= 3 ? '30%' : (total === 2 ? '45%' : '30%') }}
                  minW={{ base: '90%', md: total >= 3 ? '30%' : (total === 2 ? '45%' : '30%') }}
                  maxW={{ base: '90%', md: total >= 3 ? '30%' : (total === 2 ? '45%' : '30%') }}
                  h={{ base: '480px', md: '480px' }}
                  // Tarjeta con el acabado del estilo (fondo, borde, radio, sombra, blur)
                  className="sk-card"
                  overflow="hidden"
                  position="relative"
                  flex="0 0 auto"
                  cursor='pointer'
                      onClick={() => {window.location.href = classUrl(memoItems[realIdx].slug, lang)}}
                >
                  {/* Burbujas dinámicas */}
                  {dominantColors[realIdx] && (
                    <>
                      <Box
                        position="absolute"
                        top="-10px"
                        left="15%"
                        w="90px"
                        h="90px"
                        bg={`${dominantColors[realIdx]}30`}
                        filter="blur(30px)"
                        borderRadius="full"
                        zIndex={0}
                        boxShadow={`0 0 50px ${dominantColors[realIdx]}60`}
                      />
                      <Box
                        position="absolute"
                        bottom="-15px"
                        right="10%"
                        w="110px"
                        h="110px"
                        bg={`${dominantColors[realIdx]}30`}
                        filter="blur(40px)"
                        borderRadius="full"
                        zIndex={0}
                        boxShadow={`0 0 60px ${dominantColors[realIdx]}50`}
                      />
                    </>
                  )}

                  {/* Imagen */}
                  <Box position="absolute"  top={0} left={0} w="100%" h="100%" zIndex={0}>
                          
                          

                    <Image
                      src={optimizedImage(imgSrc, 828)}
                      onError={withOriginalFallback(imgSrc)}
                      alt={tr(memoItems[realIdx], 'title', lang)}
                      objectFit="cover"
                      w="100%"
                      h="100%"
                      loading="lazy"
                      decoding="async"
                      fetchPriority={isAllowed ? ('high' as any) : ('low' as any)}
                      onLoad={isAllowed ? handleImgLoad(realIdx) : undefined}
                    />
                  </Box>

                  {/* Gradiente */}
                  <Box
                    position="absolute"
                    bottom={0}
                    left={0}
                    w="100%"
                    h="60%"
                    bgGradient="linear(to-t, blackAlpha.800, transparent)"
                    zIndex={1}
                  />

                  {/* Contenido */}
                  <Flex
                    direction="column"
                    justify="flex-end"
                    align="center"
                    position="relative"
                    zIndex={2}
                    h="100%"
                    p={6}
                  >
                    <Text 

                            bg="blackAlpha.400"
                            backdropFilter="blur(10px)"
                            borderRadius={'10px'}
                             as="h2" fontSize="2xl" fontWeight="bold" color="white">
                      {tr(memoItems[realIdx], 'title', lang)}
                    </Text>
                   

                    <VStack gap={3} pt={2}>
                      <Wrap justify="center" gap={2}>
                        <WrapItem>
                          <Badge
                            px={3}
                            py={1}
                            borderRadius="var(--radius-chip)"
                            bg="blackAlpha.400"
                            backdropFilter="blur(10px)"
                            color="whiteAlpha.900"
                            display="flex"
                            alignItems="center"
                            gap={2}
                            fontSize="xs"
                            fontWeight="bolder"
                          >
                               <Icon name="clock" /> {memoItems[realIdx].duration_minutes}
                          </Badge>
                        </WrapItem>

                        {/* Instructor/a (solo si la clase lo tiene asignado) */}
                        {memoItems[realIdx].all_instructors?.[0] && (
                        <WrapItem>
                          <Badge
                            px={3}
                            py={1}
                            borderRadius="var(--radius-chip)"

                            bg="blackAlpha.400"
                            backdropFilter="blur(10px)"
                            color="whiteAlpha.900"
                            display="flex"
                            alignItems="center"
                            gap={2}
                            fontSize="xs"
                            fontWeight="bolder"
                          >
                            <Icon name="teacher" />
                            <Text as="span" color="white" fontWeight={'bolder'}>
                              {memoItems[realIdx].all_instructors[0]}
                            </Text>
                          </Badge>
                        </WrapItem>
                        )}

                        {/* <WrapItem>
                          <Badge
                            px={3}
                            py={1}
                            borderRadius="full"
                            bg="whiteAlpha.200"
                            backdropFilter="blur(10px)"
                            color="whiteAlpha.900"
                            display="flex"
                            alignItems="center"
                            gap={2}
                            fontSize="xs"
                            fontWeight="medium"
                          >
                            <Icon name="door" />
                            <Link
                              href={memoItems[realIdx].room.url}
                              color="color-mix(in srgb, var(--brand-primary) 75%, white)"
                              _hover={{ textDecoration: 'underline' }}
                            >
                              {memoItems[realIdx].room.name}
                            </Link>
                          </Badge>
                        </WrapItem> */}
                      </Wrap>

                      <Wrap justify="center" gap={2}>
                          <WrapItem >
                            <Badge
                              px={3}
                              variant="subtle"
                              py={1}
                              borderRadius="var(--radius-chip)"
                              bg={tagColors[0].bg}
                              color={tagColors[0].color}
                              fontSize="xs"
                              fontWeight="semibold"
                              textTransform="capitalize"
                            >
                          {memoItems[realIdx].level == 'beg' ? t('classDetail.levelBeg') : ''}
                          {memoItems[realIdx].level == 'int' ? t('classDetail.levelInt') : ''}
                          {memoItems[realIdx].level == 'adv' ? t('classDetail.levelAdv') : ''}
                          {memoItems[realIdx].level == 'all' ? t('classDetail.levelAll') : ''}
                            </Badge>
                          </WrapItem>

                            <WrapItem >
                            <Badge
                              px={3}
                              variant="subtle"
                              py={1}
                              borderRadius="var(--radius-chip)"
                              bg={tagColors[1].bg}
                              color={tagColors[1].color}
                              fontSize="xs"
                              fontWeight="semibold"
                              textTransform="capitalize"
                            >
                              {t(`home.classes.category.${memoItems[realIdx].category.slug}`, undefined, tr(memoItems[realIdx].category, 'name', lang))}
                            </Badge>
                          </WrapItem>

                      </Wrap>
                    </VStack>

                      <Link width='70%' fontWeight={'bolder'} href={classUrl(memoItems[realIdx].slug, lang)}>
                    <Button 
 fontWeight={'bold'}
                             bg="color-mix(in srgb, color-mix(in srgb, var(--brand-primary) 78%, white) 50%, transparent)"

                                      fontSize='1.15rem'
                            borderRadius="var(--radius-button)"
                            backdropFilter="blur(10px)"
                      color="white" 
                      _hover={{ bg: 'white', color: 'black' }} 
                      variant="outline"
                      width={'100%'}
                      marginTop="1rem"

                    >
                       {soonText}
                    
                    </Button>
                       </Link>
                  </Flex>
                </MotionBox>
              );
            })}
          </AnimatePresence>
        </Flex>

        <IconButton
          aria-label={t('common.next')}
          onClick={handleNext}
          size="lg"
          variant="ghost"
          position="absolute"
          right={{ base: 4, md: 8 }}
          zIndex={10}
        >
          <Icon name="chevron-right" />
        </IconButton>
      </Flex>

      <Flex justify="center" mt={2}>
        <Button
          className="sk-btn"
          size="lg" 
          variant="surface"
          position="relative"
          zIndex={1}
        >
          <a href={t('nav.items.classes.href') || '/classes'}>{ctaText}</a> 
        </Button>
      </Flex>
    </Chakra>
  );
}
