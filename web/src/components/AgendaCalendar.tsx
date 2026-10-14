"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Box, Flex, Text, VStack, Button, IconButton, Spinner, Center,
  Image, Badge, Portal,
} from '@chakra-ui/react';
import { motion, AnimatePresence } from 'framer-motion';
import { DayPicker } from 'react-day-picker';
import { es, enUS } from 'date-fns/locale';
import {
  format, addDays, subDays, startOfWeek, endOfWeek, isSameDay,
  isAfter, isBefore, startOfToday, startOfMonth, endOfMonth, addMonths,
} from 'date-fns';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import { Icon } from './ui/Icon';
import { useCartStore, type CartItem } from './stores/car.store';
import { toaster, Toaster } from './ui/toaster';
import { useLangStore } from './stores/lang.store';
import { tr, classUrl } from '../utils/localized';
import { useT, formatPrice } from '../i18n';
import { optimizedImage, withOriginalFallback } from '../utils/img';
import 'react-day-picker/dist/style.css';
import { API_ROOT } from '../config';
import { getSiteClient } from '../lib/site';

dayjs.extend(utc);
dayjs.extend(timezone);

const API_BASE_URL = `${API_ROOT}/`;
// Zona horaria del estudio (config → timezone)
const TIMEZONE = getSiteClient().timezone || 'Europe/Madrid';
const LIMITED_THRESHOLD = 5;

// Solo tokens del estilo visual (presets.css): se lee igual en estilos oscuros.
const C = {
  accent: 'var(--accent)',            // rellenos/decoración de acento
  accentText: 'var(--accent-text)',   // texto pequeño de acento
  brown: 'var(--page-text)',
  heading: 'var(--heading-color)',
  textMuted: 'var(--text-muted)',
  textLight: 'var(--text-subtle)',
  cardBg: 'var(--surface)',
  border: 'var(--surface-border)',
};

export interface ApiScheduleEvent {
  id: string; type: string; title: string; title_en?: string;
  start_datetime: string; end_datetime: string;
  room: string; room_en?: string; instructor?: string;
  capacity_max: number; is_recurrent: boolean;
  source_id: number; class_type_id?: number; class_type_slug?: string;
  image: string; price_eur_overwrite?: number; price_credit_overwrite?: number;
  price_eur?: number; price_credit: number;
  capacity_min: number; occupied_seats: number; available_seats: number;
}

export interface CalendarEvent {
  id: string; title: string; start: Date; end: Date;
  resource: ApiScheduleEvent;
}

export type CalendarFilter =
  | { type: 'class'; slug: string }
  | { type: 'event'; id: number };

interface AgendaCalendarProps {
  filter?: CalendarFilter;
  onSelectEvent: (event: CalendarEvent) => void;
  compact?: boolean;
  /** Oculta el enlace "Ver detalle" — para el modal dentro de la propia
      página de detalle (antes el enlace te devolvía a la misma página). */
  hideDetailLink?: boolean;
}

type Status = 'available' | 'limited' | 'full' | 'past';

function getStatus(event: CalendarEvent): Status {
  if (event.end < new Date()) return 'past';
  if (event.resource.available_seats <= 0) return 'full';
  if (event.resource.available_seats <= LIMITED_THRESHOLD) return 'limited';
  return 'available';
}

const statusConfig: Record<Status, { color: string; dot: string }> = {
  available: { color: 'var(--success)', dot: 'var(--success)' },
  limited:   { color: 'var(--warning)', dot: 'var(--warning)' },
  full:      { color: 'var(--danger)', dot: 'var(--danger)' },
  past:      { color: 'var(--text-subtle)', dot: 'var(--text-subtle)' },
};

// ─── Event card ───────────────────────────────────────────────────
const MotionBox = motion(Box as any);

function EventCard({ event, onAdd, hideDetailLink }: { event: CalendarEvent; onAdd: (e: CalendarEvent) => void; hideDetailLink?: boolean }) {
  const status = getStatus(event);
  const cfg = statusConfig[status];
  const isDisabled = status === 'full' || status === 'past';
  const cartItems = useCartStore((s) => s.items);
  const inCart = cartItems.some(i => i.id === event.id);
  const credits = event.resource.price_credit_overwrite ?? event.resource.price_credit;
  const price = event.resource.price_eur_overwrite ?? event.resource.price_eur ?? 0;
  const t = useT();
  const lang = useLangStore((s) => s.lang);

  return (
    <MotionBox
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.28 }}
    >
      <Flex
        p={4} borderRadius="var(--radius-card)"
        bg={C.cardBg}
        backdropFilter="var(--surface-blur)"
        style={{ WebkitBackdropFilter: 'var(--surface-blur)' }}
        border={`var(--border-width) solid ${isDisabled ? 'var(--border-neutral)' : C.border}`}
        boxShadow={isDisabled ? 'none' : 'var(--shadow-card)'}
        borderLeft={`3px solid ${cfg.dot}`}
        opacity={isDisabled ? 0.6 : 1}
        align="center"
        gap={3}
        cursor={isDisabled ? 'not-allowed' : 'default'}
        transition="all 0.2s ease"
        _hover={!isDisabled ? { boxShadow: 'var(--shadow-hover)', transform: 'translateY(-1px)' } : {}}
      >
        {/* Thumbnail */}
        {event.resource.image && (
          <Image
            src={optimizedImage(event.resource.image, 96)}
            onError={withOriginalFallback(event.resource.image)}
            loading="lazy"
            alt={tr(event.resource, 'title', lang) || event.title}
            boxSize="46px"
            borderRadius="var(--radius-input)"
            objectFit="cover"
            flexShrink={0}
          />
        )}

        {/* Info */}
        <Box flex={1} minW={0}>
          <Text fontWeight={700} fontSize="sm" color={C.brown}
            fontFamily='var(--font-body)' lineClamp={1}>
            {tr(event.resource, 'title', lang) || event.title}
          </Text>
          {(status === 'limited' || status === 'full') && (
            <Text fontSize="11px" fontWeight={700} color={cfg.color} mt={0.5}>
              {status === 'limited' ? t('calendar.statusLimited') : t('calendar.statusFull')}
            </Text>
          )}
          <Text fontSize="12px" color={C.textMuted} mt={0.5}
            fontFamily='var(--font-body)' lineClamp={1}>
            {event.resource.instructor || ''}{event.resource.instructor && event.resource.room ? ' · ' : ''}{tr(event.resource, 'room', lang)}
          </Text>
        </Box>

        {/* Time + price */}
        <VStack align="end" gap={0.5} flexShrink={0}>
          <Text fontSize="sm" fontWeight={700} color={C.brown}
            fontFamily='var(--font-body)' whiteSpace="nowrap">
            {dayjs(event.start).tz(TIMEZONE).format('HH:mm')}
            <Text as="span" fontSize="11px" fontWeight={600} color={C.textMuted}>
              {'–'}{dayjs(event.end).tz(TIMEZONE).format('HH:mm')}
            </Text>
          </Text>
          {credits > 0 && (
            <Text fontSize="11px" fontWeight={600} color={C.accentText}
              fontFamily='var(--font-body)'>
              {credits} {t('checkout.creditsUnit')}
            </Text>
          )}
          {credits === 0 && price > 0 && (
            <Text fontSize="11px" fontWeight={600} color={C.accentText}
              fontFamily='var(--font-body)'>
              {formatPrice(price, lang, 'auto')}
            </Text>
          )}
        </VStack>

        {/* Actions */}
        <VStack gap={1.5} flexShrink={0} align="stretch">
          {/* Add to cart — acción PRIMARIA, con etiqueta (antes: icono suelto
              que nadie descubría; el "Ver detalle" fantasma parecía la única acción) */}
          {!isDisabled && (
            // Sin añadir: botón principal del estilo (sk-btn). Añadida: relleno suave de acento.
            <Button
              className={inCart ? undefined : 'sk-btn'}
              aria-label={inCart ? t('calendar.inCart') : t('calendar.addToCart')}
              size="sm"
              h="36px"
              px={3}
              borderRadius="var(--radius-button)"
              bg={inCart ? 'var(--accent-soft)' : undefined}
              color={inCart ? C.accentText : undefined}
              border={inCart ? '1.5px solid var(--accent-border)' : undefined}
              disabled={inCart}
              cursor={inCart ? 'default' : 'pointer'}
              onClick={() => onAdd(event)}
              transition="all 0.2s"
              fontFamily='var(--font-body)'
              fontWeight={700}
              fontSize="12px"
              gap={1.5}
            >
              {inCart ? <Icon name="check" size={11} /> : <Icon name="cart" size={11} />}
              {inCart ? t('calendar.added') : t('calendar.add')}
            </Button>
          )}

          {/* Ver detalle — secundario, con contraste legible */}
          {!hideDetailLink && event.resource.class_type_slug && (
            <Box
              as="a"
              className="sk-btn-ghost"
              href={classUrl(event.resource.class_type_slug, lang)}
              display="flex" alignItems="center" justifyContent="center"
              h="28px" px={2.5}
              fontSize="11px" fontWeight={700}
              fontFamily='var(--font-body)'
              cursor="pointer" transition="all 0.2s"
              whiteSpace="nowrap"
            >
              {t('calendar.viewDetail')}
            </Box>
          )}
          {isDisabled && status === 'full' && (
            <Box
              px={2.5} py={1} borderRadius="var(--radius-chip)"
              bg="var(--danger-soft)"
            >
              <Text fontSize="11px" fontWeight={600} color="var(--danger)"
                fontFamily='var(--font-body)' textAlign="center">
                {t('calendar.statusFull')}
              </Text>
            </Box>
          )}
        </VStack>
      </Flex>
    </MotionBox>
  );
}

// ─── Day pill (week strip) ────────────────────────────────────────
function DayPill({
  date, isActive, hasEvents, onClick, lang,
}: { date: Date; isActive: boolean; hasEvents: boolean; onClick: () => void; lang: string }) {
  const today = startOfToday();
  const isToday = isSameDay(date, today);
  const isPast = isBefore(date, today);

  return (
    <Flex
      direction="column" align="center" gap={1}
      px={{ base: 2.5, md: 3 }} py={2.5}
      borderRadius="var(--radius-card)" cursor={isPast ? 'default' : 'pointer'}
      transition="all 0.2s ease"
      minW={{ base: '42px', md: '52px' }}
      opacity={isPast ? 0.45 : 1}
      bg={isActive ? C.accent : C.cardBg}
      border={isActive
        ? 'none'
        : isToday
          ? '1.5px solid var(--accent-border)'
          : `var(--border-width) solid ${C.border}`}
      boxShadow={isActive
        ? 'var(--button-shadow)'
        : 'var(--shadow-card)'}
      backdropFilter="var(--surface-blur)"
      style={{ WebkitBackdropFilter: 'var(--surface-blur)' }}
      onClick={!isPast ? onClick : undefined}
      _hover={!isPast && !isActive ? { bg: 'var(--surface-strong)', transform: 'translateY(-2px)' } : {}}
    >
      <Text
        fontSize="10px" fontWeight={700} textTransform="uppercase" letterSpacing="0.06em"
        color={isActive ? 'var(--on-primary)' : C.textMuted}
        fontFamily='var(--font-body)'
      >
        {format(date, 'EEE', { locale: lang === 'es' ? es : enUS }).slice(0, 3)}
      </Text>
      <Text
        fontSize={{ base: 'md', md: 'lg' }} fontWeight={800}
        color={isActive ? 'var(--on-primary)' : isToday ? C.accentText : C.brown}
        fontFamily='var(--font-heading)'
        lineHeight="1"
      >
        {format(date, 'd')}
      </Text>
      {/* Dot indicator */}
      <Box
        w="5px" h="5px" borderRadius="full"
        bg={isActive ? 'color-mix(in srgb, var(--on-primary) 70%, transparent)' : hasEvents ? C.accent : 'transparent'}
        transition="background 0.2s"
      />
    </Flex>
  );
}

// ─── Main component ───────────────────────────────────────────────
export default function AgendaCalendar({ filter, onSelectEvent, compact = false, hideDetailLink = false }: AgendaCalendarProps) {
  const lang = useLangStore((s) => s.lang);
  const t = useT();
  const [selectedDate, setSelectedDate] = useState<Date>(startOfToday());
  const [weekStart, setWeekStart] = useState<Date>(startOfWeek(startOfToday(), { weekStartsOn: 1 }));
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [showPicker, setShowPicker] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  // Primera visita (sin sesión ni guía vista): ofrecer la guía "Encuentra tu clase"
  const [showGuideHint, setShowGuideHint] = useState(false);
  useEffect(() => {
    if (filter || compact) return;
    try {
      setShowGuideHint(!localStorage.getItem('domFirstClassGuideSeen') && !localStorage.getItem('accessToken'));
    } catch {}
  }, [filter, compact]);

  const addItemToCart = useCartStore((s) => s.addItem);
  const cartItems = useCartStore((s) => s.items);

  const weekDays = useMemo(() =>
    Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart]
  );

  // Con filtro (detalle de UNA clase) cargamos 8 semanas de golpe: así
  // podemos mostrar solo los días en que se da y saltar a su próxima fecha.
  const isFiltered = Boolean(filter);
  const fetchKey = isFiltered ? 'filtered' : format(weekStart, 'yyyy-MM-dd');

  // Load events for the visible range
  useEffect(() => {
    const fetchEvents = async () => {
      setLoading(true);
      const rangeStart = isFiltered ? startOfToday() : weekStart;
      const startDate = format(rangeStart, 'yyyy-MM-dd');
      const endDate = format(addDays(rangeStart, isFiltered ? 62 : 13), 'yyyy-MM-dd');
      try {
        const res = await fetch(
          `${API_BASE_URL}v1/schedule/schedule/?start_date=${startDate}&end_date=${endDate}`
        );
        if (!res.ok) throw new Error('Error al cargar los datos.');
        const data: ApiScheduleEvent[] = await res.json();
        const parsed: CalendarEvent[] = data.map(e => ({
          id: e.id, title: e.title,
          start: dayjs.tz(e.start_datetime, TIMEZONE).toDate(),
          end: dayjs.tz(e.end_datetime, TIMEZONE).toDate(),
          resource: e,
        }));
        setEvents(parsed);
      } catch { /* silent */ }
      finally { setLoading(false); }
    };
    fetchEvents();
  }, [fetchKey]);

  // Close picker on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setShowPicker(false);
      }
    };
    if (showPicker) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showPicker]);

  // Eventos que pasan el filtro (una clase o un evento concretos)
  const filteredEvents = useMemo(() => {
    let base = events;
    if (filter?.type === 'class') base = base.filter(e => e.resource.class_type_slug === filter.slug);
    if (filter?.type === 'event') base = base.filter(e => e.resource.type === 'EVENT' && e.resource.source_id === filter.id);
    return base;
  }, [events, filter]);

  // Events for selected day, filtered
  const dayEvents = useMemo(() => {
    // Compare dates in Madrid timezone so a Mexico-City browser still groups
    // events to the correct calendar day (e.g. 00:30 Madrid ≠ prev day UTC-6)
    const selKey = dayjs(selectedDate).tz(TIMEZONE).format('YYYY-MM-DD');
    return filteredEvents
      .filter(e => dayjs(e.start).tz(TIMEZONE).format('YYYY-MM-DD') === selKey)
      .sort((a, b) => a.start.getTime() - b.start.getTime());
  }, [filteredEvents, selectedDate]);

  // Events per day (for dot indicators) — solo los que pasan el filtro
  const eventsByDay = useMemo(() => {
    const map: Record<string, number> = {};
    filteredEvents.forEach(e => {
      // Key in Madrid timezone so dots appear on the correct day pill
      const key = dayjs(e.start).tz(TIMEZONE).format('YYYY-MM-DD');
      map[key] = (map[key] || 0) + 1;
    });
    return map;
  }, [filteredEvents]);

  // Próximas fechas (futuras) en que se da la clase filtrada
  const upcomingDays = useMemo(() => {
    if (!isFiltered) return [] as Date[];
    const now = new Date();
    const keys = new Set<string>();
    const days: Date[] = [];
    filteredEvents
      .filter(e => e.end > now)
      .sort((a, b) => a.start.getTime() - b.start.getTime())
      .forEach(e => {
        const k = dayjs(e.start).tz(TIMEZONE).format('YYYY-MM-DD');
        if (!keys.has(k)) { keys.add(k); days.push(dayjs.tz(k, TIMEZONE).toDate()); }
      });
    return days;
  }, [isFiltered, filteredEvents]);

  // Al cargar: seleccionar automáticamente la próxima fecha en que se da
  const autoSelectedRef = useRef(false);
  useEffect(() => {
    if (!isFiltered || loading || autoSelectedRef.current || upcomingDays.length === 0) return;
    autoSelectedRef.current = true;
    const first = upcomingDays[0];
    setSelectedDate(first);
    setWeekStart(startOfWeek(first, { weekStartsOn: 1 }));
  }, [isFiltered, loading, upcomingDays]);

  // En modo filtrado, la tira de días muestra SOLO los días de esta semana
  // en que se da la clase (en lugar de los 7).
  const visibleDays = useMemo(() => {
    if (!isFiltered) return weekDays;
    return weekDays.filter(d => eventsByDay[dayjs(d).tz(TIMEZONE).format('YYYY-MM-DD')]);
  }, [isFiltered, weekDays, eventsByDay]);

  const nextDayAfterWeek = useMemo(() => {
    const weekEnd = addDays(weekStart, 7);
    return upcomingDays.find(d => !isBefore(d, weekEnd)) || null;
  }, [upcomingDays, weekStart]);

  useEffect(() => {
    if (!isFiltered || visibleDays.length === 0) return;
    if (!visibleDays.some(d => isSameDay(d, selectedDate))) setSelectedDate(visibleDays[0]);
  }, [isFiltered, visibleDays, selectedDate]);

  const goToDay = useCallback((d: Date) => {
    setWeekStart(startOfWeek(d, { weekStartsOn: 1 }));
    setSelectedDate(d);
  }, []);

  const handlePrevWeek = useCallback(() => {
    const prev = subDays(weekStart, 7);
    if (!isBefore(addDays(prev, 6), startOfToday())) {
      setWeekStart(prev);
    }
  }, [weekStart]);

  const handleNextWeek = useCallback(() => {
    const limit = addMonths(startOfToday(), 2);
    if (isBefore(weekStart, limit)) setWeekStart(addDays(weekStart, 7));
  }, [weekStart]);

  const handlePickerSelect = useCallback((date?: Date) => {
    if (!date) return;
    const ws = startOfWeek(date, { weekStartsOn: 1 });
    setWeekStart(ws);
    setSelectedDate(date);
    setShowPicker(false);
  }, []);

  const handleAddToCart = useCallback((event: CalendarEvent) => {
    const now = new Date();
    if (event.end < now) return;
    if (event.resource.available_seats <= 0) {
      toaster.create({ title: t('cart.full'), type: 'error', duration: 2000 });
      return;
    }
    if (cartItems.some(i => i.id === event.id)) {
      toaster.create({ title: t('cart.alreadyIn'), type: 'info', duration: 2000 });
      return;
    }
    const item: CartItem = {
      id: event.id,
      title: event.resource.title,
      title_en: event.resource.title_en || undefined,
      credits: Number(event.resource.price_credit_overwrite ?? event.resource.price_credit) || 0,
      image: event.resource.image,
      sessionDate: event.start,
      sessionDateEnd: event.end,
      id_session: Number(event.resource.class_type_id) || 0,
      id_source: Number(event.resource.source_id),
      price: Number(event.resource.price_eur_overwrite ?? event.resource.price_eur) || 0,
    };
    addItemToCart(item);
    onSelectEvent(event);
    toaster.create({
      title: t('cart.added'),
      description: `${tr(event.resource, 'title', lang) || event.title} · ${dayjs(event.start).tz(TIMEZONE).format('HH:mm')}`,
      type: 'success',
      duration: 2500,
    });
  }, [cartItems, addItemToCart, onSelectEvent, t, lang]);

  const today = startOfToday();
  const isPrevDisabled = isBefore(weekStart, addDays(today, 1));

  return (
    <>
      <Toaster />
      <Box
        w="full"
        bg={compact ? 'transparent' : 'var(--section-bg)'}
        minH={compact ? 'auto' : '80vh'}
        pt={compact ? 0 : { base: 4, md: 8 }}
        pb={compact ? 0 : { base: 8, md: 12 }}
        px={compact ? 0 : { base: 3, md: 6 }}
      >
        <Box maxW={compact ? '100%' : '900px'} mx="auto">

          {/* ── Toolbar ── */}
          <Flex
            align="center" justify="space-between"
            mb={4} px={compact ? 0 : 2}
            flexWrap="wrap" gap={2}
          >
            {/* Week label */}
            <Text
              fontFamily='var(--font-heading)'
              fontSize={{ base: 'xl', md: '2xl' }}
              color={C.heading} letterSpacing="0.04em"
            >
              {format(weekStart, "d MMM", { locale: lang === 'es' ? es : enUS })}
              {' — '}
              {format(addDays(weekStart, 6), "d MMM yyyy", { locale: lang === 'es' ? es : enUS })}
            </Text>

            {/* Controls */}
            <Flex align="center" gap={2}>
              {/* Prev week */}
              <IconButton
                aria-label={t('calendar.prevWeek')}
                size="sm" borderRadius="var(--radius-button)"
                bg={C.cardBg}
                border={`var(--border-width) solid ${C.border}`}
                color={C.textMuted}
                disabled={isPrevDisabled}
                onClick={handlePrevWeek}
                cursor="pointer"
                _hover={{ bg: 'var(--surface-strong)' }}
                boxShadow="var(--shadow-card)"
              >
                <Icon name="chevron-left" size={11} />
              </IconButton>

              {/* Date picker button */}
              <Box position="relative">
                <Button
                  size="sm" borderRadius="var(--radius-button)"
                  bg={showPicker ? C.accent : C.cardBg}
                  color={showPicker ? 'var(--on-primary)' : C.textMuted}
                  border={`var(--border-width) solid ${C.border}`}
                  cursor="pointer"
                  onClick={() => setShowPicker(v => !v)}
                  _hover={{ bg: showPicker ? C.accent : 'var(--surface-strong)' }}
                  boxShadow="var(--shadow-card)"
                  gap={1.5} fontFamily='var(--font-body)'
                  fontWeight={600} fontSize="xs"
                  transition="all 0.2s"
                >
                  <Icon name="calendar" size={11} />
                  {format(selectedDate, 'd MMM', { locale: lang === 'es' ? es : enUS })}
                </Button>

                {/* Day picker popover */}
                <AnimatePresence>
                  {showPicker && (
                    <MotionBox
                      ref={pickerRef}
                      className="sk-panel"
                      position="absolute"
                      top="calc(100% + 8px)"
                      right={0}
                      zIndex={50}
                      p={3}
                      initial={{ opacity: 0, y: -8, scale: 0.96 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -8, scale: 0.96 }}
                      transition={{ duration: 0.18 }}
                    >
                      <DayPicker
                        mode="single"
                        selected={selectedDate}
                        onSelect={handlePickerSelect}
                        locale={lang === 'es' ? es : enUS}
                        disabled={[{ before: today }]}
                        weekStartsOn={1}
                        showOutsideDays={false}
                        style={{
                          '--rdp-accent-color': C.accent,
                          '--rdp-accent-background-color': 'var(--accent-soft)',
                          '--rdp-background-color': 'var(--accent-soft)',
                          fontSize: '13px',
                        } as React.CSSProperties}
                      />
                    </MotionBox>
                  )}
                </AnimatePresence>
              </Box>

              {/* Next week */}
              <IconButton
                aria-label={t('calendar.nextWeek')}
                size="sm" borderRadius="var(--radius-button)"
                bg={C.cardBg}
                border={`var(--border-width) solid ${C.border}`}
                color={C.textMuted}
                onClick={handleNextWeek}
                cursor="pointer"
                _hover={{ bg: 'var(--surface-strong)' }}
                boxShadow="var(--shadow-card)"
              >
                <Icon name="chevron-right" size={11} />
              </IconButton>
            </Flex>
          </Flex>

          {showGuideHint && (
            <Flex as="a" href={`${t('nav.items.classes.href') || '/classes'}#guia`} align="center" justify="space-between" gap={3}
              mb={4} p={3.5} borderRadius="var(--radius-card)" bg={C.cardBg}
              border="1px solid var(--accent-border)" _hover={{ borderColor: C.accent }}>
              <Box>
                <Text fontFamily='var(--font-body)' fontWeight={800} fontSize="sm" color={C.brown}>
                  {lang === 'en' ? 'Not sure which class to pick?' : '¿No sabes qué clase elegir?'}
                </Text>
                <Text fontFamily='var(--font-body)' fontSize="xs" color={C.textMuted}>
                  {lang === 'en' ? 'Answer 2 questions and we’ll recommend one.' : 'Responde 2 preguntas y te recomendamos una.'}
                </Text>
              </Box>
              <Flex className="sk-btn" align="center" gap={1.5} px={3.5} py={2} flexShrink={0}>
                <Text fontFamily='var(--font-body)' fontWeight={800} fontSize="xs">
                  {lang === 'en' ? 'Help me' : 'Ayúdame'}
                </Text>
                <Icon name="chevron-right" size={9} />
              </Flex>
            </Flex>
          )}

          {/* Modo clase concreta: explicar que solo aparecen sus días */}
          {isFiltered && !loading && upcomingDays.length > 0 && (
            <Text fontSize="xs" color={C.textMuted} fontFamily='var(--font-body)' mb={3}>
              {t('calendar.onlyDaysHint')}
            </Text>
          )}

          {/* Sin ninguna fecha próxima: la clase no se está dando ahora */}
          {isFiltered && !loading && upcomingDays.length === 0 && (
            <Center py={10}>
              <VStack gap={3} maxW="320px" textAlign="center">
                <Box w="52px" h="52px" borderRadius="full" bg="var(--accent-soft)"
                  display="flex" alignItems="center" justifyContent="center">
                  <Icon name="calendar" color={C.textLight} size={20} />
                </Box>
                <Text fontSize="md" fontWeight={700} color={C.brown} fontFamily='var(--font-body)'>
                  {t('calendar.noUpcomingTitle')}
                </Text>
                <Text fontSize="sm" color={C.textMuted} fontFamily='var(--font-body)'>
                  {t('calendar.noUpcomingDesc')}
                </Text>
              </VStack>
            </Center>
          )}

          {/* ── Week strip ── */}
          <Flex
            gap={2} mb={6}
            overflowX="auto"
            pb={1}
            display={isFiltered && !loading && upcomingDays.length === 0 ? 'none' : 'flex'}
            css={{ '&::-webkit-scrollbar': { display: 'none' }, scrollbarWidth: 'none' }}
          >
            {isFiltered && !loading && visibleDays.length === 0 && upcomingDays.length > 0 && (
              <Flex w="full" align="center" justify="space-between" gap={3} wrap="wrap"
                p={3} borderRadius="var(--radius-card)" bg="var(--accent-soft)"
                border="1px solid var(--accent-border)">
                <Text fontSize="sm" color={C.textMuted} fontFamily='var(--font-body)'>
                  {t('calendar.noDatesThisWeek')}
                </Text>
                {nextDayAfterWeek && (
                  <Button className="sk-btn" size="sm"
                    fontFamily='var(--font-body)' fontWeight={700} minH="40px"
                    onClick={() => goToDay(nextDayAfterWeek)}>
                    {t('calendar.nextDate')}{' '}
                    {format(nextDayAfterWeek, lang === 'es' ? "EEEE d MMM" : 'EEEE, MMM d', { locale: lang === 'es' ? es : enUS })}
                  </Button>
                )}
              </Flex>
            )}
            {visibleDays.map(day => (
              <DayPill
                key={day.toISOString()}
                date={day}
                isActive={isSameDay(day, selectedDate)}
                hasEvents={Boolean(eventsByDay[dayjs(day).tz(TIMEZONE).format('YYYY-MM-DD')])}
                onClick={() => setSelectedDate(day)}
                lang={lang}
              />
            ))}
          </Flex>

          {/* ── Event list ── */}
          {isFiltered && !loading && visibleDays.length === 0 ? null : loading ? (
            <Center py={12}>
              <VStack gap={3}>
                <Spinner size="lg" color={C.accent} borderWidth="3px" />
                <Text fontSize="sm" color={C.textMuted} fontFamily='var(--font-body)'>
                  {t('calendar.loading')}
                </Text>
              </VStack>
            </Center>
          ) : (
            <AnimatePresence mode="wait">
              <motion.div
                key={format(selectedDate, 'yyyy-MM-dd')}
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.22 }}
              >
                {dayEvents.length === 0 ? (
                  <Center py={12}>
                    <VStack gap={2}>
                      <Box
                        w="48px" h="48px" borderRadius="full"
                        bg="var(--accent-soft)"
                        display="flex" alignItems="center" justifyContent="center"
                      >
                        <Icon name="calendar" color={C.textLight} size={18} />
                      </Box>
                      <Text fontSize="sm" color={C.textMuted}
                        fontFamily='var(--font-body)' fontWeight={500}>
                        {t('calendar.noClasses')}
                      </Text>
                    </VStack>
                  </Center>
                ) : (
                  <VStack gap={2.5} align="stretch">
                    <Flex align="center" justify="space-between" mb={1}>
                      <Text fontSize="sm" fontWeight={700} color={C.textMuted}
                        fontFamily='var(--font-body)' textTransform="capitalize">
                        {lang === 'es'
                          ? format(selectedDate, "EEEE, d 'de' MMMM", { locale: es })
                          : format(selectedDate, 'EEEE, MMMM d', { locale: enUS })}
                      </Text>
                      <Badge
                        px={2.5} py={0.5} borderRadius="var(--radius-chip)"
                        bg="var(--accent-soft)" color={C.accentText}
                        fontSize="11px" fontWeight={700}
                        fontFamily='var(--font-body)'
                      >
                        {dayEvents.length} {dayEvents.length === 1 ? t('calendar.classCount_one') : t('calendar.classCount_other')}
                      </Badge>
                    </Flex>

                    <AnimatePresence>
                      {dayEvents.map(event => (
                        <EventCard key={event.id} event={event} onAdd={handleAddToCart} hideDetailLink={hideDetailLink} />
                      ))}
                    </AnimatePresence>
                  </VStack>
                )}
              </motion.div>
            </AnimatePresence>
          )}
        </Box>
      </Box>
    </>
  );
}
