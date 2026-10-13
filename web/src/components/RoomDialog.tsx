"use client";

import React, { useEffect, useState } from 'react';
import {
  Box, Flex, Text, VStack, CloseButton,
  Portal, Spinner, Center, Dialog,
} from '@chakra-ui/react';
import { motion, AnimatePresence } from 'framer-motion';
import { FaUserFriends, FaMapMarkerAlt, FaChevronLeft, FaChevronRight, FaDoorOpen } from 'react-icons/fa';
import { tr } from '../utils/localized';

import { optimizedImage, withOriginalFallback } from '../utils/img';
import { API_V1 } from '../config';
import { getSiteClient } from '../lib/site';
const MotionBox = motion(Box as any);

const API_BASE_URL = API_V1;

const C = {
  accent: 'var(--brand-primary)', brown: 'var(--brand-dark)', brownMid: 'color-mix(in srgb, var(--brand-primary) 28%, var(--brand-dark))',
  textMuted: 'color-mix(in srgb, var(--brand-secondary) 88%, var(--brand-dark))', textLight: 'color-mix(in srgb, var(--brand-secondary) 65%, white)',
  bg: 'var(--brand-bg)', cardBg: 'rgba(255,255,255,0.75)',
};

interface Room {
  id: number; name: string; title: string | null;
  description: string | null; capacity: number;
  location: string | null; image: string | null;
  title_en?: string | null; description_en?: string | null;
  translations?: Record<string, any>;
}

interface Props {
  open: boolean;
  onClose: () => void;
  lang?: string;
  /** If provided, jump directly to that room */
  initialRoomId?: number | null;
}

export default function RoomDialog({ open, onClose, lang = 'es', initialRoomId }: Props) {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch(`${API_BASE_URL}/rooms/?is_active=true`)
      .then(r => r.json())
      .then(d => {
        const list: Room[] = Array.isArray(d) ? d : (d.results || []);
        setRooms(list);
        if (initialRoomId) {
          const idx = list.findIndex(r => r.id === initialRoomId);
          if (idx >= 0) setActiveIndex(idx);
        } else {
          setActiveIndex(0);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open, initialRoomId]);

  const room = rooms[activeIndex] ?? null;

  const go = (dir: 'prev' | 'next') => {
    if (dir === 'prev') setActiveIndex(i => Math.max(0, i - 1));
    else setActiveIndex(i => Math.min(rooms.length - 1, i + 1));
  };

  const title = tr(room, 'title', lang) || room?.name || '';
  const desc = tr(room, 'description', lang);
  const roomNum = String(activeIndex + 1).padStart(2, '0');
  const en = lang === 'en';
  const L = {
    room: en ? 'Studio' : 'Sala',
    people: en ? 'people' : 'personas',
    about: en ? 'About the studio' : 'Sobre la sala',
    none: en ? 'No studios available' : 'No hay salas disponibles',
  };

  return (
    <Dialog.Root open={open} onOpenChange={({ open: o }) => !o && onClose()} size="xl">
      <Portal>
        <Dialog.Backdrop
          bg="color-mix(in srgb, color-mix(in srgb, var(--brand-dark) 50%, black) 55%, transparent)"
          backdropFilter="blur(8px)"
          style={{ WebkitBackdropFilter: 'blur(8px)' }}
        />
        <Dialog.Positioner>
          <Dialog.Content
            bg="transparent" boxShadow="none"
            maxW={{ base: '95vw', md: '860px' }} w="full" my="auto"
          >
            <AnimatePresence>
              {open && (
                <MotionBox
                  initial={{ opacity: 0, scale: 0.95, y: 16 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: 16 }}
                  transition={{ duration: 0.30, ease: [0.25, 0.46, 0.45, 0.94] }}
                  borderRadius="28px" overflow="hidden"
                  bg={C.cardBg}
                  backdropFilter="blur(24px) saturate(180%)"
                  style={{ WebkitBackdropFilter: 'blur(24px) saturate(180%)' }}
                  border="1px solid rgba(255,255,255,0.75)"
                  boxShadow="0 24px 80px color-mix(in srgb, color-mix(in srgb, var(--brand-dark) 50%, black) 22%, transparent)"
                  position="relative"
                >
                  {/* Close */}
                  <Box position="absolute" top={4} right={4} zIndex={20}>
                    <CloseButton
                      onClick={onClose} size="sm" borderRadius="full"
                      bg="rgba(255,255,255,0.55)" border="1px solid rgba(255,255,255,0.70)"
                      _hover={{ bg: 'white' }} cursor="pointer"
                    />
                  </Box>

                  {loading && (
                    <Center minH="360px">
                      <Spinner size="lg" color={C.accent} borderWidth="3px" />
                    </Center>
                  )}

                  {!loading && room && (
                    <Flex direction={{ base: 'column', md: 'row' }} minH="440px">

                      {/* ── Left: Photo panel ── */}
                      <Box
                        w={{ base: 'full', md: '55%' }}
                        h={{ base: '280px', md: 'auto' }}
                        flexShrink={0} position="relative" overflow="hidden"
                        bg="linear-gradient(135deg, color-mix(in srgb, var(--brand-primary) 50%, white), color-mix(in srgb, var(--brand-primary) 72%, white))"
                      >
                        <AnimatePresence mode="wait">
                          <MotionBox
                            key={activeIndex}
                            initial={{ opacity: 0, scale: 1.04 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.45 }}
                            w="full" h="full" position="absolute" inset={0}
                          >
                            {room.image ? (
                              <Box
                                as="img" src={optimizedImage(room.image, 1080)} onError={withOriginalFallback(room.image)} alt={title}
                                w="full" h="full"
                                style={{ objectFit: 'cover', objectPosition: 'center', display: 'block' }}
                              />
                            ) : (
                              <Flex w="full" h="full" align="center" justify="center">
                                <FaDoorOpen size={48} color="rgba(255,255,255,0.25)" />
                              </Flex>
                            )}
                          </MotionBox>
                        </AnimatePresence>

                        {/* Gradient overlay */}
                        <Box
                          position="absolute" inset={0}
                          bg="linear-gradient(to top, color-mix(in srgb, color-mix(in srgb, var(--brand-dark) 50%, black) 65%, transparent) 0%, color-mix(in srgb, color-mix(in srgb, var(--brand-dark) 50%, black) 0%, transparent) 50%)"
                        />

                        {/* Room number watermark */}
                        <Text
                          position="absolute" top={4} left={5}
                          fontFamily='var(--font-heading)'
                          fontSize="7xl" color="rgba(255,255,255,0.09)"
                          letterSpacing="0.02em" lineHeight="1"
                          pointerEvents="none" userSelect="none"
                        >
                          {roomNum}
                        </Text>

                        {/* Navigation arrows (only if multiple rooms) */}
                        {rooms.length > 1 && (
                          <Flex
                            position="absolute" bottom={4} left={0} right={0}
                            justify="center" gap={2} zIndex={10}
                          >
                            <Box
                              as="button" onClick={() => go('prev')}
                              w="34px" h="34px" borderRadius="full"
                              bg="rgba(255,255,255,0.18)" border="1px solid rgba(255,255,255,0.30)"
                              display="flex" alignItems="center" justifyContent="center"
                              cursor={activeIndex === 0 ? 'not-allowed' : 'pointer'}
                              opacity={activeIndex === 0 ? 0.35 : 1}
                              transition="all 0.2s"
                              _hover={{ bg: 'rgba(255,255,255,0.30)' }}
                            >
                              <FaChevronLeft size={11} color="white" />
                            </Box>
                            {/* Dot indicators */}
                            {rooms.map((_, idx) => (
                              <Box
                                key={idx}
                                as="button" onClick={() => setActiveIndex(idx)}
                                w={idx === activeIndex ? '20px' : '6px'}
                                h="6px" borderRadius="full" cursor="pointer"
                                bg={idx === activeIndex ? 'white' : 'rgba(255,255,255,0.40)'}
                                transition="all 0.25s"
                              />
                            ))}
                            <Box
                              as="button" onClick={() => go('next')}
                              w="34px" h="34px" borderRadius="full"
                              bg="rgba(255,255,255,0.18)" border="1px solid rgba(255,255,255,0.30)"
                              display="flex" alignItems="center" justifyContent="center"
                              cursor={activeIndex === rooms.length - 1 ? 'not-allowed' : 'pointer'}
                              opacity={activeIndex === rooms.length - 1 ? 0.35 : 1}
                              transition="all 0.2s"
                              _hover={{ bg: 'rgba(255,255,255,0.30)' }}
                            >
                              <FaChevronRight size={11} color="white" />
                            </Box>
                          </Flex>
                        )}

                        {/* Room name over photo (bottom left) */}
                        <Box position="absolute" bottom={rooms.length > 1 ? 14 : 5} left={5}>
                          <Text
                            fontFamily='var(--font-heading)'
                            fontSize="2xl" color="white"
                            letterSpacing="0.04em" lineHeight="1.1"
                          >
                            {title}
                          </Text>
                        </Box>
                      </Box>

                      {/* ── Right: Details ── */}
                      <Flex
                        flex={1} direction="column" p={{ base: 6, md: 8 }}
                        gap={5} overflow="auto" maxH={{ md: '560px' }}
                        css={{ '&::-webkit-scrollbar': { width: '4px' }, '&::-webkit-scrollbar-thumb': { background: 'color-mix(in srgb, var(--brand-primary) 30%, transparent)', borderRadius: '4px' } }}
                      >
                        {/* Header */}
                        <Box>
                          <Box
                            display="inline-flex" px={2.5} py={0.5} borderRadius="full" mb={3}
                            bg="color-mix(in srgb, var(--brand-primary) 9%, transparent)" border="1px solid color-mix(in srgb, var(--brand-primary) 18%, transparent)"
                          >
                            <Text fontSize="10px" fontWeight={700} color={C.accent}
                              fontFamily='var(--font-body)' letterSpacing="0.09em"
                              textTransform="uppercase">
                              {L.room} {roomNum}
                            </Text>
                          </Box>
                          <Box w="32px" h="1.5px" bg={C.accent} borderRadius="full" mb={3} />
                          <Text
                            fontFamily='var(--font-heading)'
                            fontSize="3xl" color={C.brown}
                            letterSpacing="0.04em" lineHeight="1.05"
                          >
                            {title}
                          </Text>
                        </Box>

                        {/* Stats */}
                        <Flex gap={2} flexWrap="wrap">
                          {room.capacity > 0 && (
                            <Flex align="center" gap={1.5}
                              px={3} py={1.5} borderRadius="full"
                              bg="color-mix(in srgb, var(--brand-primary) 9%, transparent)" border="1px solid color-mix(in srgb, var(--brand-primary) 18%, transparent)">
                              <FaUserFriends size={11} color={C.accent} />
                              <Text fontSize="12px" fontWeight={600} color={C.textMuted}
                                fontFamily='var(--font-body)'>
                                {room.capacity} {L.people}
                              </Text>
                            </Flex>
                          )}
                          {room.location && (
                            <Flex align="center" gap={1.5}
                              px={3} py={1.5} borderRadius="full"
                              bg="color-mix(in srgb, var(--brand-primary) 9%, transparent)" border="1px solid color-mix(in srgb, var(--brand-primary) 18%, transparent)">
                              <FaMapMarkerAlt size={11} color={C.accent} />
                              <Text fontSize="12px" fontWeight={600} color={C.textMuted}
                                fontFamily='var(--font-body)'>
                                {room.location}
                              </Text>
                            </Flex>
                          )}
                        </Flex>

                        {/* Description */}
                        {desc && (
                          <Box>
                            <Text
                              fontSize="11px" fontWeight={700} color={C.accent}
                              fontFamily='var(--font-body)'
                              letterSpacing="0.09em" textTransform="uppercase" mb={2}
                            >
                              {L.about}
                            </Text>
                            <Text
                              fontSize="sm" color={C.textMuted}
                              fontFamily='var(--font-body)'
                              lineHeight="1.75"
                            >
                              {desc}
                            </Text>
                          </Box>
                        )}

                        {/* Bottom divider */}
                        <Box mt="auto" pt={4}>
                          <Flex align="center" gap={3}>
                            <Box flex={1} h="1px" bg="color-mix(in srgb, var(--brand-primary) 15%, transparent)" />
                            <Text
                              fontFamily='var(--font-heading)'
                              fontSize="xs" color="color-mix(in srgb, var(--brand-primary) 35%, transparent)"
                              letterSpacing="0.12em"
                            >
                              {getSiteClient().studio_name} · {roomNum}
                            </Text>
                          </Flex>
                        </Box>
                      </Flex>
                    </Flex>
                  )}

                  {!loading && rooms.length === 0 && (
                    <Center minH="280px" flexDirection="column" gap={3}>
                      <FaDoorOpen size={32} color={C.textLight} />
                      <Text fontFamily='var(--font-body)'
                        fontSize="sm" color={C.textMuted}>
                        {L.none}
                      </Text>
                    </Center>
                  )}
                </MotionBox>
              )}
            </AnimatePresence>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
