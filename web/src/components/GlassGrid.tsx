"use client";
import React from 'react';
import {
  Badge,
  Box,
  Button,
  Flex,
  Image,
  Link,
  SimpleGrid,
  Text,
  VStack,
  Wrap,
  WrapItem,
} from '@chakra-ui/react';
import { FaChalkboardTeacher, FaClock, FaDoorOpen } from 'react-icons/fa';
import { useEffect, useRef, useState } from 'react';
import Chakra from './ChakraProvider';
import { useDominantColor } from './hooks/useColorExtractor';
import { useT } from '../i18n';
import { useLangStore } from './stores/lang.store';
import type { ApiClassType } from './OurClasses';
import { tr, classUrl } from '../utils/localized';

import { optimizedImage, withOriginalFallback } from '../utils/img';
export interface GlassCarouselProps {
  title: string;
  description: string;
  items: ApiClassType[];
}

export interface ItemGlass {
  image: string;
  title: string;
  description: string;
  time?: string;
  duration: string;
  teacher: UrlItem;
  room: UrlItem;
  tags: string[];
}

export interface UrlItem {
  name: string;
  url: string;
}

const tagColors = ['color-mix(in srgb, var(--brand-primary) 75%, white)', 'var(--brand-secondary)', 'color-mix(in srgb, var(--brand-primary) 40%, white)'];

// ✅ Cache global de colores por URL (persiste entre montajes)
const colorCache = new Map<string, string>();

function GlassGridInner(props: GlassCarouselProps) {
  const t = useT();
  const lang = useLangStore((s) => s.lang);
  const {  items,title, description } = props;
  const itemTitle = (it: ApiClassType) => tr(it, 'title', lang);
  const levelLabel = (level: string) =>
    level === 'beg' ? t('classDetail.levelBeg')
      : level === 'int' ? t('classDetail.levelInt')
      : level === 'adv' ? t('classDetail.levelAdv')
      : level === 'all' ? t('classDetail.levelAll')
      : '';
  const [dominantColors, setDominantColors] = useState<string[]>([]);
  const { getDominantColor } = useDominantColor();

  // Evita repetición innecesaria si el mismo lote vuelve a montarse (tabs)
  const didResolveRef = useRef(false);

  useEffect(() => {
    if (!items.length) return;

    let cancelled = false;

    (async () => {
      // ✅ Envolvemos todo en un try...catch
      try {
        // 1) Identifica las URLs que faltan Y son válidas
        const missingSrcs: string[] = [];
        for (const it of items) {
          // ✅ FILTRO: Solo procesa si 'it.image' es un string válido y no está en caché
          if (it.image && !colorCache.has(it.image)) {
            missingSrcs.push(it.image);
          }
        }

        // 2) Procesa solo las que faltan
        if (missingSrcs.length) {
          const colors = await Promise.all(
            missingSrcs.map(async (src) => {
              // ✅ try...catch individual para que un error no rompa todo
              try {
                return await getDominantColor(src);
              } catch (e) {
                console.error(`Error al obtener color dominante para ${src}:`, e);
                return ''; // Devolvemos un string vacío en caso de error
              }
            })
          );
          
          // 3) Llena la caché con los resultados (incluso los fallidos)
          missingSrcs.forEach((src, i) => {
            colorCache.set(src, colors[i] || ''); // Asegura que se guarde un string
          });
        }

        // 4) Proyecta el arreglo final usando la caché
        if (!cancelled) {
          const arr = items.map((it) => 
            // Si hay imagen, búscala en caché; si no, string vacío
            it.image ? colorCache.get(it.image) ?? '' : ''
          );
          setDominantColors(arr);
          didResolveRef.current = true;
        }

      } catch (e) {
        // Error general por si algo más falla
        console.error('Error fatal en el efecto de color:', e);
        if (!cancelled) {
          // Ponemos un array de vacíos para que no se quede colgado
          setDominantColors(items.map(() => ''));
        }
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  return (
    <Chakra>
      <Flex w="100%" justifyContent="center" pt="2rem">
        <Text as="h3" fontSize="3xl" color="var(--brand-secondary)" fontWeight="semibold">
          {title}
        </Text>
      </Flex>

      <Box textAlign="center" maxW="800px" mx="auto" px={4} pb={8}>
        <Text fontSize="lg" color="var(--brand-secondary)">
          {description}
        </Text>
      </Box>

      <SimpleGrid
        columns={{ base: 1, md: 2, lg: 3 }}
        gap={6}
        justifyItems="center"
        px={{ base: 4, md: 8 }}
        py={12}
        w="100%"
        maxW="1400px"
        mx="auto"
      >
        {items.map((item, realIdx) => (
          <Box
            key={`card-${realIdx}`}
            w="100%"
            minW={{ base: '90%', md: '90%' }}
            maxW={{ base: '90%', md: '90%' }}
            h={{ base: '480px', md: '480px' }}
            borderRadius="2xl"
            overflow="hidden"
            position="relative"
            bg="rgba(255,255,255,0.1)"
            backdropFilter="blur(14px)"
            boxShadow={
              dominantColors[realIdx] ? `0 10px 40px ${dominantColors[realIdx]}` : 'lg'
            }
            cursor='pointer'
            onClick={() => {window.location.href = classUrl(item.slug, lang)}}
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
            <Box position="absolute" top={0} left={0} w="100%" h="100%" zIndex={0}>
              <Image
                src={optimizedImage(item.image, 828) || '/placeholder-class.svg'}
                onError={withOriginalFallback(item.image)}
                alt={itemTitle(item)}
                objectFit="cover"
                w="100%"
                h="100%"
                loading="lazy"     // hint: no cargar hasta que haga falta
                decoding="async"    // hint: decodificación asíncrona
                draggable={false}
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
              <Text as="h2" fontSize="2xl" fontWeight="bolder"  bg="blackAlpha.300"
                            backdropFilter="blur(10px)"
                            borderRadius={'10px'}
                              color="white">
                {itemTitle(item)}
              </Text>
             

              <VStack gap={3} pt={2}>
                {/* Badges informativos */}
                <Wrap justify="center" gap={2}>
                  <WrapItem>
                    <Badge
                      px={3}
                      py={1}
                      borderRadius="full"
                      bg="blackAlpha.400"
                      backdropFilter="blur(10px)"
                      color="whiteAlpha.900"
                      display="flex"
                      alignItems="center"
                      gap={2}
                      fontSize="xs"
                      fontWeight="bolder"
                    >
                      <FaClock /> {item.duration_minutes}
                    </Badge>
                  </WrapItem>

                  <WrapItem>
                    <Badge
                      px={3}
                      py={1}
                      borderRadius="full"

                      bg="blackAlpha.400"
                      backdropFilter="blur(10px)"
                      color="whiteAlpha.900"
                      display="flex"
                      alignItems="center"

                      gap={2}
                      fontSize="xs"
                      fontWeight="bolder"
                    >
                      <FaChalkboardTeacher />
                      <Link
                      fontWeight={'bolder'}
                        color="#fff"
                        _hover={{ textDecoration: 'underline' }}
                      >
                        {item.all_instructors[0]}
                      </Link>
                    </Badge>
                  </WrapItem>

                  <WrapItem>
                    <Badge
                      px={3}
                      py={1}
                      borderRadius="full"
                      bg="blackAlpha.400"
                      backdropFilter="blur(10px)"
                      color="whiteAlpha.900"
                      display="flex"
                      alignItems="center"
                      gap={2}
                      fontSize="xs"
                      fontWeight="bolder"
                    >
                      <FaDoorOpen />

                       <Link
                        color="#fff"
                        _hover={{ textDecoration: 'underline' }}
                      > 
                       {t('classDetail.mainRoom')}
                      </Link>
                    </Badge>
                  </WrapItem>
                </Wrap>

                {/* Tags */}
                <Wrap justify="center" gap={2}>
                    <WrapItem key={0}>
                      <Badge
                        px={3}
                        variant="subtle"
                        py={1}
                        borderRadius="full"
                        bg={tagColors[0] || 'color-mix(in srgb, var(--brand-primary) 75%, white)'}
                        color="white"
                        fontSize="xs"
                        fontWeight="semibold"
                        textTransform="capitalize"
                      >

                        {levelLabel(item.level)}
                        
                      </Badge>
                    </WrapItem>
                     <WrapItem key={0}>
                      <Badge
                        px={3}
                        variant="subtle"
                        py={1}
                        borderRadius="full"
                        bg={tagColors[0] || 'color-mix(in srgb, var(--brand-primary) 75%, white)'}
                        color="white"
                        fontSize="xs"
                        fontWeight="semibold"
                        textTransform="capitalize"
                      >
                        {t(`home.classes.category.${item.category.slug}`, undefined, tr(item.category, 'name', lang))}
                      </Badge>
                    </WrapItem>
                 
                </Wrap>
              </VStack>

                <Link width='70%' href={classUrl(items[realIdx].slug, lang)}>
                                  <Button 
                                     bg="color-mix(in srgb, color-mix(in srgb, var(--brand-primary) 78%, white) 50%, transparent)"
                                      fontWeight={'bold'}
                                      
                                      fontSize='1.15rem'
                            backdropFilter="blur(10px)"
                      color="white" 
                      _hover={{ bg: 'white', color: 'black' }} 
                      variant="outline"
                      width={'100%'}
                      marginTop="1rem"
                                  >
                                     {t('bottomNav.book')}
                                  </Button>
                                     </Link>
            </Flex>
          </Box>
        ))}
      </SimpleGrid>
    </Chakra>
  );
}

// ✅ Memo del componente para no re-renderizar si los datos no cambian realmente
export default React.memo(
  GlassGridInner,
  (prev, next) => {
    if (prev.title !== next.title || prev.description !== next.description) return false;

    const a = prev.items;
    const b = next.items;
    if (a === b) return true;
    if (a.length !== b.length) return false;

    // Comparación “barata” pero suficiente para tu caso
    for (let i = 0; i < a.length; i++) {
      const x = a[i];
      const y = b[i];
      if (
        x.image !== y.image ||
        x.title !== y.title ||
        x.description !== y.description ||
        x.duration_minutes !== y.duration_minutes ||
        x.instructor?.name.toString() !== y.instructor?.name.toString() ||
        x.instructor?.id !== y.instructor?.id 
      ) {
        return false;
      }
    }
    return true;
  }
);
