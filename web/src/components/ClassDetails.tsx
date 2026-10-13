"use client";

import React, { useState, useEffect } from "react";
import {
  Box, Flex, Text, VStack, Image, Link,
  Dialog, CloseButton, Portal, Spinner, Center,
} from "@chakra-ui/react";
import { motion } from "framer-motion";
import { FaClock, FaDoorOpen, FaChevronLeft, FaChevronRight, FaLeaf, FaWhatsapp, FaUserCircle } from "react-icons/fa";
import Chakra from "./ChakraProvider";
import { useLangStore } from "./stores/lang.store";
import { useT, formatPrice } from "../i18n";
import CalendarView from "./CalendarTwo";
import InstructorDialog from "./InstructorDialog";
import RoomDialog from "./RoomDialog";
import { tr } from "../utils/localized";

import { optimizedImage, withOriginalFallback } from '../utils/img';
import { cancelMinHours } from '../utils/cancelPolicy';
import { API_V1 } from '../config';
import { contactUrl, getSiteClient } from '../lib/site';
const MotionBox = motion(Box as any);

const API_BASE_URL = API_V1;

const C = {
  accent: 'var(--brand-primary)', accentDark: 'color-mix(in srgb, var(--brand-primary) 60%, var(--brand-dark))', brown: 'var(--brand-dark)', brownMid: 'color-mix(in srgb, var(--brand-primary) 28%, var(--brand-dark))',
  textMuted: 'color-mix(in srgb, var(--brand-secondary) 88%, var(--brand-dark))', textLight: 'color-mix(in srgb, var(--brand-secondary) 65%, white)',
  bg: 'var(--brand-bg)', cardBg: 'rgba(255,255,255,0.72)', border: 'rgba(255,255,255,0.80)',
  borderMuted: 'color-mix(in srgb, var(--brand-primary) 18%, transparent)',
};

interface ApiClassType {
  id: number;
  category: { id: number; name: string; slug: string; description: string; name_en?: string; description_en?: string };
  instructor: { id: number; name: string; slug: string; image?: string | null } | null;
  title: string; slug: string; description: string;
  title_en?: string; description_en?: string;
  duration_minutes: number; level: string;
  default_price_credits: string; default_price_eur: string;
  image: string | null; all_instructors: string[];
  translations?: Record<string, any>;
  is_active?: boolean;
}

interface ApiRecurrence {
  id: number; weekday: number | null; start_time: string; end_time: string;
  start_date: string | null; end_date: string | null;
  is_recurrent: boolean; is_active: boolean;
  override_instructor?: { id: number; name: string; slug: string; image?: string | null } | null;
  room?: RoomPreview | null;
}

/** Sesiones vigentes de la clase: recurrentes no terminadas + puntuales futuras. */
function currentSessions(list: ApiRecurrence[]): ApiRecurrence[] {
  const today = new Date().toISOString().slice(0, 10);
  return list.filter(r => r.is_active && (
    r.is_recurrent
      ? r.weekday != null && (!r.end_date || r.end_date >= today)
      : !!r.start_date && r.start_date >= today
  ));
}

interface RoomPreview { id: number; name: string; title: string | null; title_en?: string | null; image: string | null; capacity: number; }

// Level labels are resolved via useT() inside the component

const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.48, delay, ease: [0.25, 0.46, 0.45, 0.94] as any },
});

function ClassDetailInner() {
  const lang = useLangStore(s => s.lang);
  const t = useT();
  const [classData, setClassData] = useState<ApiClassType | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const classesHref = t('nav.items.classes.href') || '/classes';
  const [error, setError] = useState<string | null>(null);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [instructorOpen, setInstructorOpen] = useState(false);
  const [roomOpen, setRoomOpen] = useState(false);
  const [previewRoom, setPreviewRoom] = useState<RoomPreview | null>(null);
  // null = cargando; [] = no se da ahora mismo
  const [sessions, setSessions] = useState<ApiRecurrence[] | null>(null);
  useEffect(() => {
    const slug = window.location.pathname.split('/').filter(Boolean).pop() ?? '';
    if (!slug) { setError('slug'); setIsLoading(false); return; }
    fetch(`${API_BASE_URL}/class-types/?slug=${slug}`)
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then((d: ApiClassType[]) => {
        if (d?.length) setClassData(d[0]);
        else setError('notfound');
      })
      .catch(() => setError('load'))
      .finally(() => setIsLoading(false));
  }, []);

  // Horario real de esta clase (para "Cuándo se da" y saber si está disponible)
  useEffect(() => {
    if (!classData) return;
    fetch(`${API_BASE_URL}/recurrences/?class_type=${classData.id}&is_active=true`)
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(d => setSessions(currentSessions(Array.isArray(d) ? d : (d.results || []))))
      .catch(() => setSessions(null));
  }, [classData?.id]);

  useEffect(() => {
    fetch(`${API_BASE_URL}/rooms/?is_active=true`)
      .then(r => r.json())
      .then(d => {
        const list = Array.isArray(d) ? d : (d.results || []);
        if (list.length > 0) setPreviewRoom(list[0]);
      })
      .catch(() => {});
  }, []);

  // AgendaCalendar already added the item to cart — just close the calendar
  const handleSelectEvent = (_event: any) => {
    setIsCalendarOpen(false);
  };

  if (isLoading) return (
    <Center minH="100vh" bg={C.bg}>
      <Spinner size="xl" color={C.accent} borderWidth="3px" />
    </Center>
  );

  if (error || !classData) return (
    <Center minH="100vh" bg={C.bg} flexDirection="column" gap={4}>
      <Text fontFamily='var(--font-heading)' fontSize="3xl" color={C.brown}>
        {t('classDetail.errorNotFound')}
      </Text>
      <Text fontSize="sm" color={C.textMuted} fontFamily='var(--font-body)'>
        {error === 'slug' ? t('classDetail.errorSlug')
          : error === 'load' ? t('classDetail.errorLoad')
          : t('classDetail.errorNoData')}
      </Text>
      <Box as="a" href={classesHref} px={6} h="44px" borderRadius="12px"
        display="flex" alignItems="center"
        bg={`linear-gradient(135deg, ${C.accent}, ${C.accentDark})`}
        color="white" fontFamily='var(--font-body)'
        fontWeight={700} fontSize="sm" cursor="pointer">
        {t('classDetail.backBtn')}
      </Box>
    </Center>
  );

  const title = tr(classData, 'title', lang);
  const description = tr(classData, 'description', lang);
  const LEVEL_MAP: Record<string, string> = {
    beg: t('classDetail.levelBeg'),
    int: t('classDetail.levelInt'),
    adv: t('classDetail.levelAdv'),
    all: t('classDetail.levelAll'),
  };
  const levelLabel = LEVEL_MAP[classData.level] ?? classData.level;

  // La profesora suele asignarse en cada horario (override_instructor), no en la
  // clase: se toma de los horarios vigentes, prefiriendo la que tiene foto.
  const sessionTeachers = (sessions ?? []).map(s => s.override_instructor).filter(Boolean) as NonNullable<ApiRecurrence['override_instructor']>[];
  const instructor = classData.instructor
    ?? sessionTeachers.find(i => i.image)
    ?? sessionTeachers[0]
    ?? null;
  const instructorName = instructor?.name ?? classData.all_instructors?.[0] ?? null;
  const initials = (instructorName || '').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
  // Sala: la de sus horarios si la hay; si no, la primera del estudio
  const room = (sessions ?? []).find(s => s.room?.image)?.room ?? (sessions ?? [])[0]?.room ?? previewRoom;

  return (
    <Box minH="100vh" bg={C.bg}>

      {/* ── Desktop split layout: image left + content right ── */}
      <Flex
        direction={{ base: 'column', lg: 'row' }}
        minH="100vh"
        align="stretch"
      >

        {/* ── LEFT: Image panel (sticky on desktop) ── */}
        <Box
          w={{ base: 'full', lg: '45%' }}
          h={{ base: '62vw', lg: '100vh' }}
          position={{ base: 'relative', lg: 'sticky' }}
          top={{ lg: 0 }}
          flexShrink={0}
          overflow="hidden"
          bg="linear-gradient(135deg, color-mix(in srgb, var(--brand-primary) 50%, white), color-mix(in srgb, var(--brand-primary) 72%, white))"
        >
          {classData.image ? (
            <Box
              as="img" src={optimizedImage(classData.image, 1200)} onError={withOriginalFallback(classData.image)} alt={title}
              position="absolute" inset={0} w="full" h="full"
              style={{ objectFit: 'cover', objectPosition: 'center', display: 'block' }}
            />
          ) : (
            <Flex position="absolute" inset={0} align="center" justify="center">
              <FaLeaf size={60} color="rgba(255,255,255,0.20)" />
            </Flex>
          )}

          {/* Gradient overlay */}
          <Box position="absolute" inset={0}
            bg="linear-gradient(to bottom, color-mix(in srgb, var(--brand-dark) 8%, transparent) 0%, color-mix(in srgb, var(--brand-dark) 50%, transparent) 100%)" />

          {/* Back link */}
          <Box as="a" href={classesHref}
            position="absolute" top={6} left={6} zIndex={10}
            display="flex" alignItems="center" gap={2}
            px={3} py={2} borderRadius="full"
            bg="rgba(255,255,255,0.18)" border="1px solid rgba(255,255,255,0.30)"
            backdropFilter="blur(12px)" style={{ WebkitBackdropFilter: 'blur(12px)' }}
            cursor="pointer" transition="all 0.2s" _hover={{ bg: 'rgba(255,255,255,0.28)' }}
          >
            <FaChevronLeft size={10} color="white" />
            <Text fontFamily='var(--font-body)' fontSize="12px" fontWeight={700} color="white">
              {t('classDetail.backToClasses')}
            </Text>
          </Box>

          {/* Category badge + title on image */}
          <Box position="absolute" bottom={0} left={0} right={0}
            px={{ base: 5, lg: 8 }} pb={{ base: 6, lg: 10 }}>
            <Box
              display="inline-flex" px={3} py={1} borderRadius="full" mb={3}
              bg="rgba(255,255,255,0.15)" border="1px solid rgba(255,255,255,0.25)"
            >
              <Text fontSize="10px" fontWeight={700} color="rgba(255,255,255,0.90)"
                fontFamily='var(--font-body)' letterSpacing="0.12em" textTransform="uppercase">
                {classData.category?.slug ? t(`home.classes.category.${classData.category.slug}`, undefined, tr(classData.category, 'name', lang)) : tr(classData.category, 'name', lang)}
              </Text>
            </Box>
            <Text as="h1" fontFamily='var(--font-heading)' fontWeight="normal" m={0}
              fontSize={{ base: '4xl', lg: '5xl' }}
              color="white" letterSpacing="0.03em" lineHeight="0.95">
              {title}
            </Text>
          </Box>
        </Box>

        {/* ── RIGHT: Scrollable content ── */}
        <Box
          flex={1}
          overflowY="auto"
          bg="linear-gradient(180deg, var(--brand-bg) 0%, color-mix(in srgb, var(--brand-primary) 22%, white) 100%)"
          px={{ base: 5, md: 10, lg: 12 }}
          py={{ base: 8, lg: 14 }}
          display="flex"
          flexDirection="column"
          gap={8}
        >
          {/* Accent line */}
          <MotionBox {...fadeUp(0)}>
            <Box w="40px" h="2px" bg={C.accent} borderRadius="full" />
          </MotionBox>

          {/* Description */}
          <MotionBox {...fadeUp(0.06)}>
            <Text fontFamily='var(--font-body)'
              fontSize={{ base: 'md', md: 'lg' }}
              color={C.brownMid || C.brownMid} lineHeight="1.85">
              {description}
            </Text>
          </MotionBox>

          {/* Stat pills */}
          <MotionBox {...fadeUp(0.10)}>
            <Flex gap={2} flexWrap="wrap">
              <Flex align="center" gap={1.5}
                px={3} py={1.5} borderRadius="full"
                bg={C.cardBg} border={`1px solid ${C.borderMuted}`}
                backdropFilter="blur(12px)" style={{ WebkitBackdropFilter: 'blur(12px)' }}>
                <FaClock size={10} color={C.accent} />
                <Text fontSize="12px" fontWeight={600} color={C.textMuted}
                  fontFamily='var(--font-body)'>
                  {classData.duration_minutes} min
                </Text>
              </Flex>

              <Flex align="center" gap={1.5}
                px={3} py={1.5} borderRadius="full"
                bg={C.cardBg} border={`1px solid ${C.borderMuted}`}
                backdropFilter="blur(12px)" style={{ WebkitBackdropFilter: 'blur(12px)' }}>
                <Box w="6px" h="6px" borderRadius="full" bg={C.accent} flexShrink={0} />
                <Text fontSize="12px" fontWeight={600} color={C.textMuted}
                  fontFamily='var(--font-body)'>
                  {levelLabel}
                </Text>
              </Flex>

              <Flex align="center" gap={1.5}
                px={3} py={1.5} borderRadius="full"
                bg="color-mix(in srgb, var(--brand-primary) 10%, transparent)" border="1px solid color-mix(in srgb, var(--brand-primary) 25%, transparent)"
                backdropFilter="blur(12px)" style={{ WebkitBackdropFilter: 'blur(12px)' }}>
                <Text fontSize="12px" fontWeight={700} color={C.accent}
                  fontFamily='var(--font-body)'>
                  {classData.default_price_credits} {Number(classData.default_price_credits) !== 1 ? t('classDetail.credits') : t('classDetail.credit')}
                </Text>
                {Number(classData.default_price_eur) > 0 && (
                  <Text fontSize="12px" color={C.textMuted} fontFamily='var(--font-body)'>
                    · {formatPrice(classData.default_price_eur, lang, 'auto')}
                  </Text>
                )}
              </Flex>
            </Flex>
          </MotionBox>

          {/* ── Instructor card ── */}
          {instructorName && (
            <MotionBox {...fadeUp(0.13)}>
              <Text fontFamily='var(--font-body)' fontSize="10px" fontWeight={700}
                color={C.accent} letterSpacing="0.12em" textTransform="uppercase" mb={3}>
                {t('classDetail.instructorLabel')}
              </Text>
              <Box
                as={instructor ? 'button' : 'div'}
                onClick={instructor ? () => setInstructorOpen(true) : undefined}
                w="full" display="flex" alignItems="center" gap={4}
                px={4} py={4} borderRadius="20px"
                bg={C.cardBg} border={`1px solid ${C.border}`}
                backdropFilter="blur(16px)" style={{ WebkitBackdropFilter: 'blur(16px)' }}
                boxShadow="0 2px 16px color-mix(in srgb, var(--brand-dark) 8%, transparent), inset 0 1px 0 rgba(255,255,255,0.90)"
                cursor={instructor ? 'pointer' : 'default'}
                transition="all 0.22s"
                _hover={instructor ? {
                  boxShadow: '0 6px 24px color-mix(in srgb, var(--brand-dark) 12%, transparent), inset 0 1px 0 rgba(255,255,255,0.95)',
                  borderColor: C.borderMuted,
                } : {}}
                textAlign="left"
              >
                {/* Photo circle */}
                <Box
                  w="64px" h="64px" borderRadius="full" overflow="hidden" flexShrink={0}
                  bg="linear-gradient(135deg, color-mix(in srgb, var(--brand-primary) 50%, white), color-mix(in srgb, var(--brand-primary) 72%, white))"
                  border="2px solid color-mix(in srgb, var(--brand-primary) 25%, transparent)"
                  boxShadow="0 4px 16px color-mix(in srgb, var(--brand-dark) 12%, transparent)"
                >
                  {instructor?.image ? (
                    <Image
                      src={optimizedImage(instructor.image, 256)} onError={withOriginalFallback(instructor.image)} alt={instructorName}
                      w="full" h="full" objectFit="cover" objectPosition="top"
                    />
                  ) : (
                    <Flex w="full" h="full" align="center" justify="center">
                      {initials
                        ? <Text fontFamily='var(--font-heading)' fontSize="2xl" color="white" letterSpacing="0.04em">{initials}</Text>
                        : <FaLeaf size={20} color="rgba(255,255,255,0.50)" />}
                    </Flex>
                  )}
                </Box>

                <Box flex={1}>
                  <Text fontFamily='var(--font-heading)'
                    fontSize="xl" color={C.brown} letterSpacing="0.04em" lineHeight="1.1">
                    {instructorName}
                  </Text>
                  {instructor ? (
                    <Flex mt={2}>
                      <Flex
                        align="center" gap={1.5}
                        px={3} py={1} borderRadius="full"
                        bg={`linear-gradient(135deg, ${C.accent}, ${C.accentDark})`}
                        boxShadow="0 2px 10px color-mix(in srgb, var(--brand-primary) 35%, transparent)"
                        display="inline-flex"
                      >
                        <FaUserCircle size={10} color="rgba(255,255,255,0.85)" />
                        <Text fontFamily='var(--font-body)'
                          fontSize="11px" fontWeight={700} color="white">
                          {t('classDetail.instructorViewProfile')}
                        </Text>
                        <FaChevronRight size={7} color="rgba(255,255,255,0.70)" />
                      </Flex>
                    </Flex>
                  ) : (
                    <Text fontFamily='var(--font-body)'
                      fontSize="11px" color={C.textMuted} mt={0.5}>
                      {t('classDetail.instructorFallback')}
                    </Text>
                  )}
                </Box>
              </Box>
            </MotionBox>
          )}

          {/* ── Room card ── */}
          <MotionBox {...fadeUp(0.17)}>
            <Text fontFamily='var(--font-body)' fontSize="10px" fontWeight={700}
              color={C.accent} letterSpacing="0.12em" textTransform="uppercase" mb={3}>
              {t('classDetail.spaceLabel')}
            </Text>
            <Box
              as="button" onClick={() => setRoomOpen(true)}
              w="full" display="flex" alignItems="center" gap={4}
              px={4} py={4} borderRadius="20px"
              bg={C.cardBg} border={`1px solid ${C.border}`}
              backdropFilter="blur(16px)" style={{ WebkitBackdropFilter: 'blur(16px)' }}
              boxShadow="0 2px 16px color-mix(in srgb, var(--brand-dark) 8%, transparent), inset 0 1px 0 rgba(255,255,255,0.90)"
              cursor="pointer" transition="all 0.22s"
              _hover={{
                boxShadow: '0 6px 24px color-mix(in srgb, var(--brand-dark) 12%, transparent), inset 0 1px 0 rgba(255,255,255,0.95)',
                borderColor: C.borderMuted,
              }}
              textAlign="left"
              overflow="hidden"
              position="relative"
            >
              {/* Room image strip */}
              {room?.image && (
                <Box position="absolute" right={0} top={0} bottom={0} w="40%" overflow="hidden">
                  <Box as="img" src={optimizedImage(room.image, 640)} onError={withOriginalFallback(room.image)} loading="lazy" alt=""
                    w="full" h="full"
                    style={{ objectFit: 'cover', objectPosition: 'center', display: 'block', opacity: 0.22 }} />
                  <Box position="absolute" inset={0}
                    bg="linear-gradient(to right, var(--brand-bg) 0%, transparent 55%)" />
                </Box>
              )}

              {/* Room icon */}
              <Flex
                w="64px" h="64px" borderRadius="full" flexShrink={0}
                align="center" justify="center"
                bg="color-mix(in srgb, var(--brand-primary) 12%, transparent)" border="2px solid color-mix(in srgb, var(--brand-primary) 22%, transparent)"
                position="relative" zIndex={1}
              >
                {room?.image ? (
                  <Image src={optimizedImage(room.image, 256)} onError={withOriginalFallback(room.image)} alt={tr(room, 'title', lang) || room.name}
                    w="full" h="full" objectFit="cover" borderRadius="full" loading="lazy" />
                ) : (
                  <FaDoorOpen size={22} color={C.accent} />
                )}
              </Flex>

              <Box flex={1} position="relative" zIndex={1}>
                <Text fontFamily='var(--font-heading)'
                  fontSize="xl" color={C.brown} letterSpacing="0.04em" lineHeight="1.1">
                  {tr(room, 'title', lang) || room?.name || t('classDetail.spaceFallback')}
                </Text>
                {room?.capacity && (
                  <Text fontFamily='var(--font-body)'
                    fontSize="11px" color={C.textMuted} mt={0.5}>
                    {t('classDetail.spacePeople', { n: room.capacity })}
                  </Text>
                )}
                <Flex mt={2}>
                  <Flex
                    align="center" gap={1.5}
                    px={3} py={1} borderRadius="full"
                    bg={`linear-gradient(135deg, ${C.accent}, ${C.accentDark})`}
                    boxShadow="0 2px 10px color-mix(in srgb, var(--brand-primary) 35%, transparent)"
                    display="inline-flex"
                  >
                    <FaDoorOpen size={10} color="rgba(255,255,255,0.85)" />
                    <Text fontFamily='var(--font-body)'
                      fontSize="11px" fontWeight={700} color="white">
                      {t('classDetail.spaceViewAll')}
                    </Text>
                    <FaChevronRight size={7} color="rgba(255,255,255,0.70)" />
                  </Flex>
                </Flex>
              </Box>
            </Box>
          </MotionBox>

          {/* Divider */}
          <MotionBox {...fadeUp(0.20)}>
            <Flex align="center" gap={3}>
              <Box flex={1} h="1px" bg="color-mix(in srgb, var(--brand-primary) 15%, transparent)" />
              <Text fontFamily='var(--font-heading)'
                fontSize="xs" color="color-mix(in srgb, var(--brand-primary) 35%, transparent)" letterSpacing="0.15em" textTransform="uppercase">
                {getSiteClient().studio_name}
              </Text>
              <Box flex={1} h="1px" bg="color-mix(in srgb, var(--brand-primary) 15%, transparent)" />
            </Flex>
          </MotionBox>

          {/* ── Booking panel ── */}
          <MotionBox {...fadeUp(0.22)}>
            <Box p={6} borderRadius="24px"
              bg={C.cardBg} border={`1px solid ${C.border}`}
              backdropFilter="blur(20px)" style={{ WebkitBackdropFilter: 'blur(20px)' }}
              boxShadow="0 8px 32px color-mix(in srgb, var(--brand-dark) 8%, transparent), inset 0 1px 0 rgba(255,255,255,0.90)"
            >
              <Text fontFamily='var(--font-body)' fontSize="10px" fontWeight={700}
                color={C.accent} letterSpacing="0.12em" textTransform="uppercase" mb={1}>
                {t('classDetail.priceLabel')}
              </Text>
              <Flex align="baseline" gap={2} mb={5}>
                <Text fontFamily='var(--font-heading)'
                  fontSize="4xl" color={C.brown} letterSpacing="0.03em" lineHeight="1">
                  {classData.default_price_credits}
                </Text>
                <Text fontFamily='var(--font-body)'
                  fontSize="sm" color={C.textMuted} fontWeight={600}>
                  {Number(classData.default_price_credits) !== 1 ? t('classDetail.credits') : t('classDetail.credit')}
                </Text>
                {Number(classData.default_price_eur) > 0 && (
                  <Text fontFamily='var(--font-body)' fontSize="sm" color={C.textLight}>
                    · {formatPrice(classData.default_price_eur, lang, 'auto')}
                  </Text>
                )}
              </Flex>

              <Box h="1px" bg={C.borderMuted} mb={5} />

              {/* Cuándo se da — el horario a la vista antes de abrir el calendario */}
              {sessions && sessions.length > 0 && (
                <Box mb={5}>
                  <Text fontFamily='var(--font-body)' fontSize="10px" fontWeight={700}
                    color={C.accent} letterSpacing="0.12em" textTransform="uppercase" mb={2}>
                    {lang === 'en' ? 'When it runs' : 'Cuándo se da'}
                  </Text>
                  <VStack gap={1.5} align="stretch">
                    {[...sessions]
                      .sort((a, b) =>
                        ((a.weekday ?? 9) - (b.weekday ?? 9)) || a.start_time.localeCompare(b.start_time))
                      .map(ses => {
                        const dayName = ses.is_recurrent && ses.weekday != null
                          ? new Date(2025, 0, 6 + ses.weekday).toLocaleDateString(lang === 'en' ? 'en-GB' : 'es-ES', { weekday: 'long' })
                          : ses.start_date
                            ? new Date(`${ses.start_date}T12:00:00`).toLocaleDateString(lang === 'en' ? 'en-GB' : 'es-ES', { weekday: 'long', day: 'numeric', month: 'short' })
                            : '';
                        return (
                          <Flex key={ses.id} align="center" justify="space-between"
                            px={3} py={2} borderRadius="10px" bg="color-mix(in srgb, var(--brand-primary) 7%, transparent)">
                            <Text fontFamily='var(--font-body)' fontSize="sm" fontWeight={700}
                              color={C.brown} textTransform="capitalize">
                              {ses.is_recurrent ? (lang === 'en' ? `Every ${dayName}` : `Cada ${dayName}`) : dayName}
                            </Text>
                            <Text fontFamily='var(--font-body)' fontSize="sm" color={C.textMuted}>
                              {ses.start_time.slice(0, 5)}–{ses.end_time.slice(0, 5)}
                            </Text>
                          </Flex>
                        );
                      })}
                  </VStack>
                </Box>
              )}

              {sessions && sessions.length === 0 && (
                <Box mb={4} p={3.5} borderRadius="14px"
                  bg="color-mix(in srgb, var(--brand-primary) 8%, transparent)" border="1px solid color-mix(in srgb, var(--brand-primary) 22%, transparent)">
                  <Text fontFamily='var(--font-body)' fontSize="sm" fontWeight={700} color={C.brown} mb={0.5}>
                    {lang === 'en' ? 'Not on the timetable right now' : 'Ahora mismo no está en el horario'}
                  </Text>
                  <Text fontFamily='var(--font-body)' fontSize="xs" color={C.textMuted} lineHeight="1.55">
                    {lang === 'en'
                      ? "Message us and we'll let you know as soon as it's back — or explore other classes."
                      : 'Escríbenos y te avisamos en cuanto vuelva, o descubre otras clases parecidas.'}
                  </Text>
                </Box>
              )}

              <VStack gap={3}>
                {sessions && sessions.length === 0 ? (
                  <>
                    <Box
                      aria-disabled="true"
                      w="full" h="50px" borderRadius="14px"
                      bg="color-mix(in srgb, var(--brand-primary) 14%, transparent)" color={C.textMuted}
                      fontFamily='var(--font-body)' fontWeight={700} fontSize="sm"
                      display="flex" alignItems="center" justifyContent="center"
                      cursor="not-allowed"
                    >
                      {lang === 'en' ? 'Not available for now' : 'No disponible por el momento'}
                    </Box>
                    <Box
                      as="a" href={classesHref}
                      w="full" h="46px" borderRadius="14px"
                      bg={`linear-gradient(135deg, ${C.accent}, ${C.accentDark})`}
                      color="white" fontFamily='var(--font-body)' fontWeight={700} fontSize="sm"
                      display="flex" alignItems="center" justifyContent="center"
                      _hover={{ opacity: 0.93 }}
                    >
                      {lang === 'en' ? 'See other classes' : 'Ver otras clases'}
                    </Box>
                  </>
                ) : (
                  <Box
                    as="button" onClick={() => setIsCalendarOpen(true)}
                    w="full" h="50px" borderRadius="14px"
                    bg={`linear-gradient(135deg, ${C.accent}, ${C.accentDark})`}
                    color="white" fontFamily='var(--font-body)'
                    fontWeight={700} fontSize="sm" cursor="pointer"
                    boxShadow="0 6px 20px color-mix(in srgb, var(--brand-primary) 30%, transparent)"
                    transition="all 0.22s ease"
                    _hover={{ boxShadow: '0 10px 28px color-mix(in srgb, var(--brand-primary) 40%, transparent)', opacity: 0.93 }}
                    display="flex" alignItems="center" justifyContent="center"
                  >
                    {lang === 'en' ? 'Choose a date and book' : 'Elegir fecha y reservar'}
                  </Box>
                )}

                {contactUrl(getSiteClient(), t('classDetail.waMessage', { title })) && (
                <Box
                  as="a"
                  href={contactUrl(getSiteClient(), t('classDetail.waMessage', { title }))}
                  target="_blank" rel="noopener noreferrer"
                  w="full" h="46px" borderRadius="14px"
                  bg="transparent" border={`1px solid ${C.borderMuted}`}
                  color={C.textMuted} fontFamily='var(--font-body)'
                  fontWeight={600} fontSize="sm" cursor="pointer"
                  transition="all 0.2s"
                  _hover={{ bg: 'color-mix(in srgb, var(--brand-primary) 6%, transparent)', color: C.brown }}
                  display="flex" alignItems="center" justifyContent="center" gap={2}
                >
                  <FaWhatsapp size={14} />
                  {sessions && sessions.length === 0
                    ? (lang === 'en' ? 'Let me know when it’s back' : 'Avísame cuando vuelva')
                    : t('classDetail.privateBtn')}
                </Box>
                )}
              </VStack>

              {!(sessions && sessions.length === 0) && (
                <Text fontFamily='var(--font-body)' fontSize="11px"
                  color={C.textLight} textAlign="center" mt={4}>
                  {t('classDetail.disclaimer', { hours: cancelMinHours() })}
                </Text>
              )}
            </Box>
          </MotionBox>

          {/* bottom padding */}
          <Box h={4} />
        </Box>
      </Flex>

      {/* ── Calendar dialog ── */}
      <Dialog.Root open={isCalendarOpen} size="xl">
        <Portal>
          <Dialog.Backdrop bg="color-mix(in srgb, color-mix(in srgb, var(--brand-dark) 50%, black) 45%, transparent)" backdropFilter="blur(6px)"
            style={{ WebkitBackdropFilter: 'blur(6px)' }} />
          <Dialog.Positioner>
            <Dialog.Content
              borderRadius="24px" overflow="hidden"
              bg="color-mix(in srgb, var(--brand-bg) 55%, white)"
              style={{ WebkitBackdropFilter: 'blur(20px)' }}
              border={`1px solid ${C.border}`}
              maxW={{ base: '95vw', md: '760px' }} w="full"
              boxShadow="0 24px 80px color-mix(in srgb, color-mix(in srgb, var(--brand-dark) 50%, black) 18%, transparent)"
            >
              <Dialog.Header px={6} pt={6} pb={4}
                borderBottom={`1px solid ${C.borderMuted}`}>
                <Flex justify="space-between" align="center">
                  <Box>
                    <Text fontFamily='var(--font-heading)' fontSize="2xl"
                      color={C.brown} letterSpacing="0.05em" lineHeight="1">
                      {t('classDetail.calendarTitle')}
                    </Text>
                    <Text fontFamily='var(--font-body)' fontSize="12px"
                      color={C.textMuted} mt={0.5}>
                      {title}
                    </Text>
                  </Box>
                  <Dialog.CloseTrigger asChild>
                    <CloseButton onClick={() => setIsCalendarOpen(false)} size="sm" borderRadius="full"
                      bg="rgba(255,255,255,0.55)" border={`1px solid ${C.border}`}
                      _hover={{ bg: 'white' }} cursor="pointer" />
                  </Dialog.CloseTrigger>
                </Flex>
              </Dialog.Header>
              <Dialog.Body px={5} py={5}>
                <CalendarView
                  onSelectEvent={handleSelectEvent}
                  filter={{ type: 'class', slug: classData.slug }}
                  compact={true}
                  hideDetailLink={true}
                />
              </Dialog.Body>
            </Dialog.Content>
          </Dialog.Positioner>
        </Portal>
      </Dialog.Root>

      {/* ── Instructor dialog ── */}
      {instructor && (
        <InstructorDialog
          instructorId={instructor.id}
          open={instructorOpen}
          onClose={() => setInstructorOpen(false)}
          lang={lang}
          prefetched={{
            id: instructor.id, name: instructor.name, slug: instructor.slug,
            image: instructor.image ?? null, experience_years: 0,
          }}
        />
      )}

      {/* ── Room dialog ── */}
      <RoomDialog open={roomOpen} onClose={() => setRoomOpen(false)} lang={lang} />
    </Box>
  );
}

export default function PilatesClassDetail() {
  return <Chakra><ClassDetailInner /></Chakra>;
}
