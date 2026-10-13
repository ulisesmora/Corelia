"use client";

import { Box, Flex, Text, VStack, Container } from '@chakra-ui/react';
import { useState, useEffect } from 'react';
import { cachedFetch } from '../utils/fetchCache';
import { motion } from 'framer-motion';
import Chakra from './ChakraProvider';
import { useT } from '../i18n';
import { useLangStore, withSsrLang } from './stores/lang.store';
import { tr } from '../utils/localized';
import { FaUserFriends, FaMapMarkerAlt, FaLeaf } from 'react-icons/fa';

import { optimizedImage, withOriginalFallback } from '../utils/img';
import { API_V1 } from '../config';
import { getSiteClient } from '../lib/site';
const MotionBox = motion(Box as any);

interface Room {
  id: number; name: string; title: string | null;
  description: string | null; capacity: number;
  location: string | null; image: string | null;
  title_en?: string | null; description_en?: string | null;
  translations?: Record<string, any>;
}

const API_BASE_URL = API_V1;

const C = {
  accent: 'var(--brand-primary)', accentDark: 'color-mix(in srgb, var(--brand-primary) 60%, var(--brand-dark))', brown: 'var(--brand-dark)',
  textMuted: 'color-mix(in srgb, var(--brand-secondary) 88%, var(--brand-dark))', textLight: 'color-mix(in srgb, var(--brand-secondary) 65%, white)',
  borderMuted: 'color-mix(in srgb, var(--brand-primary) 18%, transparent)',
};

function RoomCard({ room, index, lang }: { room: Room; index: number; lang: string }) {
  const t = useT();
  const [hovered, setHovered] = useState(false);
  const title = tr(room, 'title', lang) || room.name;
  const desc = tr(room, 'description', lang);
  const roomNum = String(index + 1).padStart(2, '0');

  return (
    <MotionBox
      initial={{ opacity: 0, y: 28 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.58, delay: index * 0.09, ease: [0.25, 0.46, 0.45, 0.94] }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      position="relative"
      borderRadius="24px"
      overflow="hidden"
      h={{ base: '400px', md: '460px' }}
      boxShadow={hovered
        ? '0 20px 56px color-mix(in srgb, var(--brand-dark) 16%, transparent), 0 0 0 1px color-mix(in srgb, var(--brand-primary) 28%, transparent)'
        : '0 4px 24px color-mix(in srgb, var(--brand-dark) 8%, transparent), 0 0 0 1px color-mix(in srgb, var(--brand-primary) 14%, transparent)'}
      transition="box-shadow 0.38s ease"
      cursor="default"
    >
      {/* Background image */}
      {room.image ? (
        <Box
          as="img" src={optimizedImage(room.image, 828)} onError={withOriginalFallback(room.image)} alt={title}
          position="absolute" inset={0} w="full" h="full"
          style={{
            objectFit: 'cover', objectPosition: 'center', display: 'block',
            transform: hovered ? 'scale(1.05)' : 'scale(1)',
            transition: 'transform 0.65s cubic-bezier(0.25,0.46,0.45,0.94)',
          }}
        />
      ) : (
        <Box position="absolute" inset={0}
          bg="linear-gradient(135deg, color-mix(in srgb, var(--brand-primary) 50%, white), color-mix(in srgb, var(--brand-primary) 72%, white))"
          display="flex" alignItems="center" justifyContent="center">
          <FaLeaf size={40} color="rgba(255,255,255,0.25)" />
        </Box>
      )}

      {/* Warm dark gradient — bottom heavy */}
      <Box position="absolute" inset={0}
        bg="linear-gradient(to top, color-mix(in srgb, color-mix(in srgb, var(--brand-dark) 55%, black) 85%, transparent) 0%, color-mix(in srgb, color-mix(in srgb, var(--brand-dark) 55%, black) 30%, transparent) 50%, color-mix(in srgb, color-mix(in srgb, var(--brand-dark) 55%, black) 5%, transparent) 100%)"
      />

      {/* Watermark number */}
      <Text
        position="absolute" top={5} left={5}
        fontFamily='var(--font-heading)'
        fontSize="7xl" color="rgba(255,255,255,0.08)"
        letterSpacing="0.02em" lineHeight="1"
        pointerEvents="none" userSelect="none"
      >
        {roomNum}
      </Text>

      {/* ── Glass info panel at bottom ── */}
      <Box
        position="absolute" bottom={0} left={0} right={0}
        p={{ base: 4, md: 5 }}
      >
        <Box
          borderRadius="18px"
          bg="color-mix(in srgb, var(--brand-bg) 14%, transparent)"
          border="1px solid rgba(255,255,255,0.22)"
          backdropFilter="blur(24px) saturate(160%)"
          style={{
            WebkitBackdropFilter: 'blur(24px) saturate(160%)',
            transform: hovered ? 'translateY(-3px)' : 'translateY(0)',
            transition: 'transform 0.35s ease',
          }}
          boxShadow="0 6px 28px color-mix(in srgb, color-mix(in srgb, var(--brand-dark) 55%, black) 20%, transparent), inset 0 1px 0 rgba(255,255,255,0.30)"
          px={5} py={4}
        >
          {/* Number pill + divider */}
          <Flex align="center" gap={3} mb={3}>
            <Box px={2} py={0.5} borderRadius="full"
              bg="color-mix(in srgb, var(--brand-primary) 22%, transparent)" border="1px solid color-mix(in srgb, var(--brand-primary) 30%, transparent)">
              <Text fontFamily='var(--font-body)' fontSize="10px"
                fontWeight={700} color="rgba(255,255,255,0.85)" letterSpacing="0.10em"
                textTransform="uppercase">
                {t('home.rooms.roomLabel', { n: roomNum })}
              </Text>
            </Box>
            <Box flex={1} h="1px" bg="rgba(255,255,255,0.18)" />
          </Flex>

          <Text fontFamily='var(--font-heading)'
            fontSize={{ base: '2xl', md: '3xl' }} color="white"
            letterSpacing="0.04em" lineHeight="1.05" mb={3}>
            {title}
          </Text>

          {/* Stats */}
          <Flex gap={2} flexWrap="wrap" mb={0}>
            {room.capacity > 0 && (
              <Flex align="center" gap={1.5}
                px={2.5} py={1} borderRadius="full"
                bg="rgba(255,255,255,0.10)" border="1px solid rgba(255,255,255,0.18)">
                <FaUserFriends size={10} color="rgba(255,255,255,0.75)" />
                <Text fontSize="11px" fontWeight={600} color="rgba(255,255,255,0.75)"
                  fontFamily='var(--font-body)'>
                  {t('home.rooms.people', { n: room.capacity })}
                </Text>
              </Flex>
            )}
            {room.location && (
              <Flex align="center" gap={1.5}
                px={2.5} py={1} borderRadius="full"
                bg="rgba(255,255,255,0.10)" border="1px solid rgba(255,255,255,0.18)">
                <FaMapMarkerAlt size={10} color="rgba(255,255,255,0.75)" />
                <Text fontSize="11px" fontWeight={600} color="rgba(255,255,255,0.75)"
                  fontFamily='var(--font-body)'>
                  {room.location}
                </Text>
              </Flex>
            )}
          </Flex>

          {/* Description: revealed on hover */}
          {desc && (
            <Box
              overflow="hidden"
              maxH={hovered ? '72px' : '0px'}
              opacity={hovered ? 1 : 0}
              transition="all 0.32s ease"
              mt={hovered ? 3 : 0}
            >
              <Text fontFamily='var(--font-body)'
                fontSize="12px" color="rgba(255,255,255,0.65)"
                lineHeight="1.70"
                style={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' } as any}
              >
                {desc}
              </Text>
            </Box>
          )}
        </Box>
      </Box>
    </MotionBox>
  );
}

function RoomsSectionInner({ initialRooms }: { initialRooms?: Room[] | null }) {
  const t = useT();
  const lang = useLangStore(s => s.lang);
  // Con datos del servidor la sección sale ya en el HTML (sin fetch)
  const [rooms, setRooms] = useState<Room[]>(initialRooms ?? []);
  const [loading, setLoading] = useState(!initialRooms);

  useEffect(() => {
    if (initialRooms) return;
    cachedFetch<Room[] | { results: Room[] }>(`${API_BASE_URL}/rooms/?is_active=true`, { ttl: 600 })
      .then(d => setRooms(Array.isArray(d) ? d : (d.results || [])))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading || rooms.length === 0) return null;

  return (
    <Box as="section" w="full"
      bg="linear-gradient(160deg, color-mix(in srgb, var(--brand-primary) 22%, white) 0%, var(--brand-bg) 50%, color-mix(in srgb, var(--brand-primary) 22%, white) 100%)"
      py={{ base: 14, md: 24 }}
    >
      <Container maxW="6xl">

        {/* Header */}
        <MotionBox
          initial={{ opacity: 0, y: -16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.48 }}
          mb={12}
        >
          <Flex align="flex-end" justify="space-between" wrap="wrap" gap={4}>
            <Box>
              <Box display="inline-flex" px={3} py={1} borderRadius="full" mb={3}
                bg="color-mix(in srgb, var(--brand-primary) 10%, transparent)" border="1px solid color-mix(in srgb, var(--brand-primary) 22%, transparent)">
                <Text fontSize="10px" fontWeight={700} color={C.accent}
                  fontFamily='var(--font-body)' letterSpacing="0.10em" textTransform="uppercase">
                  {t('home.rooms.badge')}
                </Text>
              </Box>
              <Text fontFamily='var(--font-heading)'
                fontSize={{ base: '3xl', md: '5xl', lg: '6xl' }}
                color={C.brown} letterSpacing="wide" lineHeight="1">
                {t('home.rooms.heading') || 'Nuestras Salas'}
              </Text>
            </Box>
            <Text fontSize="md" color={C.textMuted}
              fontFamily='var(--font-body)'
              maxW="300px" lineHeight="1.65"
              textAlign={{ base: 'left', md: 'right' }}>
              {t('home.rooms.subtitle') || 'Espacios diseñados para conectar con tu práctica'}
            </Text>
          </Flex>

          <Box mt={6} h="1px"
            bg="linear-gradient(90deg, color-mix(in srgb, var(--brand-primary) 25%, transparent), color-mix(in srgb, var(--brand-primary) 8%, transparent) 60%, transparent)" />
        </MotionBox>

        {/* Grid */}
        <Box
          display="grid"
          gridTemplateColumns={{
            base: '1fr',
            md: 'repeat(2, 1fr)',
            lg: rooms.length >= 3 ? 'repeat(3, 1fr)' : 'repeat(2, 1fr)',
          }}
          gap={5}
        >
          {rooms.slice(0, 6).map((room, i) => (
            <RoomCard key={room.id} room={room} index={i} lang={lang} />
          ))}
        </Box>

        {/* Bottom watermark */}
        <MotionBox
          initial={{ opacity: 0 }} whileInView={{ opacity: 1 }}
          viewport={{ once: true }} transition={{ duration: 0.55, delay: 0.25 }}
          mt={12}
        >
          <Flex align="center" gap={3}>
            <Box flex={1} h="1px" bg="color-mix(in srgb, var(--brand-primary) 15%, transparent)" />
            <Text fontFamily='var(--font-heading)'
              fontSize="xs" color="color-mix(in srgb, var(--brand-primary) 35%, transparent)" letterSpacing="0.15em" textTransform="uppercase">
              {getSiteClient().studio_name}
            </Text>
            <Box flex={1} h="1px" bg="color-mix(in srgb, var(--brand-primary) 15%, transparent)" />
          </Flex>
        </MotionBox>
      </Container>
    </Box>
  );
}

function RoomsSection({ initialRooms }: { initialRooms?: Room[] | null }) {
  return <Chakra><RoomsSectionInner initialRooms={initialRooms} /></Chakra>;
}

export default withSsrLang(RoomsSection);
