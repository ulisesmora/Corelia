"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Box, Flex, Text, VStack, Button, Spinner,
  Stack, Separator, IconButton, SimpleGrid,
  Dialog, Portal, CloseButton,
} from '@chakra-ui/react';
import {
  FaCalendarCheck, FaStar, FaCrown, FaUser,
  FaTrash, FaClock, FaMapMarkerAlt, FaCheckCircle,
  FaPlus, FaHistory, FaTimes, FaLeaf, FaExclamationTriangle,
  FaBolt, FaListUl, FaCalendarAlt, FaArrowRight, FaEdit,
  FaCalendarWeek, FaCalendarPlus, FaGooglePlusG, FaApple, FaDownload,
  FaLock, FaCalendarDay,
} from 'react-icons/fa';
import { motion, AnimatePresence } from 'framer-motion';
import Chakra from './ChakraProvider';
import { toaster } from './ui/toaster';
import { Toaster } from './ui/toaster';
import { useT, formatPrice } from '../i18n';
import { useLangStore } from '../components/stores/lang.store';
import { clearSession } from '../utils/session';
import { InstallAppCTA } from './InstallAppBanner';
import EmailVerifyCard from './EmailVerifyCard';
import MembershipSuggestionCard from './MembershipSuggestionCard';
import { tr, roomName } from '../utils/localized';
import { planDisplayName } from '../utils/planUtils';
import { cancelMinHours, canCancelBooking } from '../utils/cancelPolicy';
import { API_ROOT } from '../config';
import { addressLine, contactUrl, getSiteClient } from '../lib/site';

const MotionBox = motion(Box as any);

// ── Brand tokens ──────────────────────────────────────────────────────────────
const C = {
  bg: 'linear-gradient(160deg, color-mix(in srgb, var(--brand-primary) 22%, white) 0%, var(--brand-bg) 50%, color-mix(in srgb, var(--brand-primary) 22%, white) 100%)',
  card: 'rgba(255,255,255,0.88)',
  cardGlass: 'rgba(255,255,255,0.55)',
  accent: 'var(--brand-primary)',
  accentDark: 'color-mix(in srgb, var(--brand-primary) 60%, var(--brand-dark))',
  brown: 'var(--brand-dark)',
  textMuted: 'color-mix(in srgb, var(--brand-secondary) 88%, var(--brand-dark))',
  border: 'color-mix(in srgb, var(--brand-primary) 20%, transparent)',
  borderStrong: 'color-mix(in srgb, var(--brand-primary) 35%, transparent)',
  btnGrad: 'linear-gradient(135deg, var(--brand-primary) 0%, color-mix(in srgb, var(--brand-primary) 60%, var(--brand-dark)) 100%)',
  success: '#2D7D46',
  warning: '#B7791F',
  danger: '#C0392B',
};

const API = `${API_ROOT}/`;

function langToLocale(lang: string) { return lang === 'en' ? 'en-GB' : 'es-ES'; }
function weekdayName(day: number | null | undefined, lang: string): string {
  if (day == null) return '—';
  const date = new Date(2025, 0, 6 + day); // Jan 6 2025 = Monday (weekday 0)
  return date.toLocaleDateString(langToLocale(lang), { weekday: 'long' });
}

// ── Calendar export utilities ─────────────────────────────────────────────────
// Nombre, web y dirección salen de la config del estudio.

/** Textos del evento que se exporta al calendario, en el idioma actual. */
function calText() {
  const en = useLangStore.getState().lang === 'en';
  const site = getSiteClient();
  const host = typeof window !== 'undefined' ? window.location.host : '';
  return {
    cls: en ? 'Class' : 'Clase',
    room: en ? 'Studio' : 'Sala',
    studio: site.studio_name,
    footer: host ? `${site.studio_name} – ${host}` : site.studio_name,
    location: [site.studio_name, addressLine(site)].filter(Boolean).join(', '),
    uidDomain: host.replace(/:\d+$/, '') || 'studio.local',
    slug: site.studio_name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'estudio',
  };
}

function toIcsDate(iso: string): string {
  // Format: YYYYMMDDTHHMMSSZ  (UTC)
  return new Date(iso).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
}

function buildGoogleCalendarUrl(booking: { what: string; start_datetime: string; end_datetime: string; teacher: string; room_name: string }): string {
  const base = 'https://calendar.google.com/calendar/render?action=TEMPLATE';
  const L = calText();
  const text = encodeURIComponent(`${L.studio} · ${booking.what}`);
  const dates = `${toIcsDate(booking.start_datetime)}/${toIcsDate(booking.end_datetime)}`;
  const details = encodeURIComponent(`${L.cls}: ${booking.what}${booking.teacher ? `\nInstructor: ${booking.teacher}` : ''}${booking.room_name ? `\n${L.room}: ${booking.room_name}` : ''}\n\n${L.footer}`);
  const location = encodeURIComponent(L.location);
  return `${base}&text=${text}&dates=${dates}&details=${details}&location=${location}&sf=true&output=xml`;
}

function buildIcsContent(booking: { what: string; start_datetime: string; end_datetime: string; teacher: string; room_name: string }): string {
  const L = calText();
  const uid = `booking-${booking.start_datetime.replace(/\D/g, '')}@${L.uidDomain}`;
  const desc = `${L.cls}: ${booking.what}${booking.teacher ? `\\nInstructor: ${booking.teacher}` : ''}${booking.room_name ? `\\n${L.room}: ${booking.room_name}` : ''}\\n\\n${L.footer}`.replace(/\n/g, '\\n');
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Studio Kit//Reservas//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `DTSTART:${toIcsDate(booking.start_datetime)}`,
    `DTEND:${toIcsDate(booking.end_datetime)}`,
    `SUMMARY:${L.studio} · ${booking.what}`,
    `DESCRIPTION:${desc}`,
    `LOCATION:${L.location}`,
    `UID:${uid}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

function downloadIcs(booking: { what: string; start_datetime: string; end_datetime: string; teacher: string; room_name: string }, filename = `clase-${calText().slug}.ics`) {
  const blob = new Blob([buildIcsContent(booking)], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function buildAppleCalendarUrl(booking: { what: string; start_datetime: string; end_datetime: string; teacher: string; room_name: string }): string {
  // webcal:// works on macOS/iOS to open Calendar.app directly
  // Fallback: generate a data URI .ics
  return `data:text/calendar;charset=utf-8,${encodeURIComponent(buildIcsContent(booking))}`;
}

function buildIcsEvent(booking: { id?: number; what: string; start_datetime: string; end_datetime: string; teacher: string; room_name: string }): string[] {
  const L = calText();
  const uid = `booking-${booking.id ?? booking.start_datetime.replace(/\D/g, '')}@${L.uidDomain}`;
  const desc = `${L.cls}: ${booking.what}${booking.teacher ? `\\nInstructor: ${booking.teacher}` : ''}${booking.room_name ? `\\n${L.room}: ${booking.room_name}` : ''}\\n\\n${L.footer}`.replace(/\n/g, '\\n');
  return [
    'BEGIN:VEVENT',
    `DTSTART:${toIcsDate(booking.start_datetime)}`,
    `DTEND:${toIcsDate(booking.end_datetime)}`,
    `SUMMARY:${L.studio} · ${booking.what}`,
    `DESCRIPTION:${desc}`,
    `LOCATION:${L.location}`,
    `UID:${uid}`,
    'END:VEVENT',
  ];
}

/** Un solo .ics con TODAS las próximas clases — se importa de una vez en
 *  Google Calendar, Apple Calendar, Outlook… */
function downloadAllIcs(bookings: { id?: number; what: string; start_datetime: string; end_datetime: string; teacher: string; room_name: string }[]) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Studio Kit//Reservas//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${calText().studio}`,
    ...bookings.flatMap(buildIcsEvent),
    'END:VCALENDAR',
  ].join('\r\n');
  const blob = new Blob([lines], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `mis-clases-${calText().slug}.ics`;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Clave de día en la zona horaria del dispositivo (YYYY-MM-DD). */
function localDayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ─────────────────────────────────────────────────────────────────────────────

function getToken() {
  try { return localStorage.getItem('accessToken'); } catch { return null; }
}
function getUserId() {
  try { return localStorage.getItem('iduser'); } catch { return null; }
}
function authHeaders(): Record<string, string> {
  const t = getToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

// ── Types ─────────────────────────────────────────────────────────────────────
interface Booking {
  id: number; status: string;
  start_datetime: string; end_datetime: string;
  what: string; room_name: string; teacher: string; who: string;
  /** Inglés: `what_en` ya viene de la API; `room_name_en` aún no (se usará si llega). */
  what_en?: string | null; room_name_en?: string | null;
}
interface ClassPreference {
  id: number; schedule: number; schedule_title: string;
  schedule_title_en?: string | null; room_name_en?: string | null;
  weekday: number | null; start_time: string | null; room_name: string | null; is_active: boolean;
  credits_per_class: number;
}
interface Schedule {
  id: number; weekday: number | null; start_time: string | null; end_time: string | null;
  class_type: { id: number; title: string; title_en?: string | null };
  room: { id: number; name: string; title_en?: string | null };
}
interface Subscription {
  id: number; status: string;
  current_period_start: string; current_period_end: string;
  cancel_at_period_end: boolean;
  plan: { id: number; name: string; name_en?: string | null; credits: number; price_eur: string; description: string | null };
}

// ── Utilities ─────────────────────────────────────────────────────────────────
const fmt = (iso: string, locale = 'es-ES') =>
  new Date(iso).toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' });
const fmtTime = (iso: string, locale = 'es-ES') =>
  new Date(iso).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });

// Color translúcido que vale también para variables CSS (`${color}18` solo
// funcionaba con hex): tint('var(--brand-primary)', 9) → 9 % de opacidad.
const tint = (color: string, pct: number) => `color-mix(in srgb, ${color} ${pct}%, transparent)`;

const statusColor: Record<string, string> = {
  reserved: '#2D7D46', attended: 'color-mix(in srgb, var(--brand-primary) 60%, var(--brand-dark))', canceled: '#C0392B',
  no_show: '#B7791F', pending: 'var(--brand-primary)',
};

function useStatusLabel() {
  const t = useT();
  return (status: string) => {
    const map: Record<string, string> = {
      reserved: t('dashboard.agenda.statusReserved'),
      attended: t('dashboard.agenda.statusAttended'),
      canceled: t('dashboard.agenda.statusCanceled'),
      no_show:  t('dashboard.agenda.statusNoShow'),
      pending:  t('dashboard.agenda.statusPending'),
    };
    return map[status] || status;
  };
}

type Tab = 'agenda' | 'clases' | 'suscripcion' | 'perfil';

function useTabs() {
  const t = useT();
  return [
    { key: 'agenda'      as Tab, label: t('dashboard.tabs.agenda'),      icon: <FaCalendarCheck size={14} /> },
    { key: 'clases'      as Tab, label: t('dashboard.tabs.clases'),      icon: <FaStar size={14} /> },
    { key: 'suscripcion' as Tab, label: t('dashboard.tabs.suscripcion'), icon: <FaCrown size={14} /> },
    { key: 'perfil'      as Tab, label: t('dashboard.tabs.perfil'),      icon: <FaUser size={14} /> },
  ];
}

// ── Shared card ───────────────────────────────────────────────────────────────
function Card({ children, p = 5 }: { children: React.ReactNode; p?: number }) {
  return (
    <Box bg={C.card} borderRadius="20px" p={p}
      border={`1px solid ${C.border}`}
      boxShadow="0 4px 24px color-mix(in srgb, var(--brand-dark) 6%, transparent)">
      {children}
    </Box>
  );
}

// ── Week mini calendar ────────────────────────────────────────────────────────
function WeekCalendar({ bookings, onSelect }: {
  bookings: Booking[];
  onSelect: (b: Booking) => void;
}) {
  const lang = useLangStore(s => s.lang);
  const locale = langToLocale(lang);

  const today = useMemo(() => {
    const d = new Date(); d.setHours(0, 0, 0, 0); return d;
  }, []);

  const days = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(today); d.setDate(today.getDate() + i); return d;
    });
  }, [today]);

  const bookingsByDay = useMemo(() => {
    const map: Record<string, Booking[]> = {};
    bookings.forEach(b => {
      const key = new Date(b.start_datetime).toISOString().split('T')[0];
      (map[key] = map[key] || []).push(b);
    });
    return map;
  }, [bookings]);

  return (
    <SimpleGrid columns={7} gap={{ base: 1, md: 2 }}>
      {days.map((day, idx) => {
        const key = day.toISOString().split('T')[0];
        const dayBookings = bookingsByDay[key] || [];
        const isToday = idx === 0;

        return (
          <Box key={key} textAlign="center">
            <Text fontFamily='var(--font-body)' fontSize="9px" fontWeight={700}
              color={isToday ? C.accentDark : C.textMuted}
              textTransform="uppercase" letterSpacing="0.06em" mb={1}>
              {day.toLocaleDateString(locale, { weekday: 'narrow' })}
            </Text>

            <Flex w={{ base: '28px', md: '38px' }} h={{ base: '28px', md: '38px' }}
              borderRadius="full" mx="auto" mb={1.5}
              alignItems="center" justifyContent="center"
              bg={isToday ? C.btnGrad : dayBookings.length > 0 ? 'color-mix(in srgb, var(--brand-primary) 12%, transparent)' : 'transparent'}
              border={isToday ? 'none' : `1px solid ${dayBookings.length > 0 ? C.borderStrong : C.border}`}
              boxShadow={isToday ? '0 3px 10px color-mix(in srgb, color-mix(in srgb, var(--brand-primary) 60%, var(--brand-dark)) 30%, transparent)' : 'none'}>
              <Text fontFamily='var(--font-body)' fontSize={{ base: '10px', md: 'xs' }}
                fontWeight={700}
                color={isToday ? 'white' : dayBookings.length > 0 ? C.accentDark : C.textMuted}>
                {day.getDate()}
              </Text>
            </Flex>

            <VStack gap={0.5} align="stretch">
              {dayBookings.slice(0, 3).map(b => (
                <Box key={b.id} as="button" onClick={() => onSelect(b)}
                  w="full" borderRadius="5px" px={0.5} py={0.5}
                  bg={tint(statusColor[b.status], 9)}
                  border={`1px solid ${tint(statusColor[b.status], 21)}`}
                  cursor="pointer" _hover={{ opacity: 0.75 }} transition="opacity 0.15s">
                  <Text fontFamily='var(--font-body)' fontSize="8px" fontWeight={700}
                    color={statusColor[b.status]}
                    style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {fmtTime(b.start_datetime, locale)}
                  </Text>
                </Box>
              ))}
              {dayBookings.length > 3 && (
                <Text fontFamily='var(--font-body)' fontSize="8px"
                  color={C.textMuted} textAlign="center">
                  +{dayBookings.length - 3}
                </Text>
              )}
            </VStack>
          </Box>
        );
      })}
    </SimpleGrid>
  );
}

// ── Month calendar — todas las gestiones a mano, filtrables por día ──────────
function MonthCalendar({ upcoming, past, month, onMonthChange, selectedDay, onSelectDay }: {
  upcoming: Booking[];
  past: Booking[];
  month: Date;                       // primer día del mes mostrado
  onMonthChange: (m: Date) => void;
  selectedDay: string | null;        // YYYY-MM-DD local
  onSelectDay: (d: string | null) => void;
}) {
  const lang = useLangStore(s => s.lang);
  const locale = langToLocale(lang);
  const todayKey = localDayKey(new Date());

  const byDay = useMemo(() => {
    const map: Record<string, { up: number; past: number }> = {};
    upcoming.forEach(b => {
      const k = localDayKey(new Date(b.start_datetime));
      (map[k] = map[k] || { up: 0, past: 0 }).up += 1;
    });
    past.forEach(b => {
      if (b.status === 'canceled') return;
      const k = localDayKey(new Date(b.start_datetime));
      (map[k] = map[k] || { up: 0, past: 0 }).past += 1;
    });
    return map;
  }, [upcoming, past]);

  const y = month.getFullYear(), m = month.getMonth();
  const startOffset = (new Date(y, m, 1).getDay() + 6) % 7; // lunes primero
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const weekdayInitials = useMemo(
    () => Array.from({ length: 7 }, (_, i) =>
      new Date(2025, 0, 6 + i).toLocaleDateString(locale, { weekday: 'narrow' })),
    [locale],
  );

  return (
    <Box>
      {/* Cabecera de mes con navegación */}
      <Flex justify="space-between" align="center" mb={3}>
        <IconButton aria-label={lang === 'en' ? 'Previous month' : 'Mes anterior'} size="sm" variant="ghost" borderRadius="full"
          color={C.textMuted} _hover={{ bg: 'color-mix(in srgb, var(--brand-primary) 10%, transparent)' }}
          onClick={() => { onSelectDay(null); onMonthChange(new Date(y, m - 1, 1)); }}>
          ‹
        </IconButton>
        <Text fontFamily='var(--font-heading)' fontSize="xl" color={C.brown}
          letterSpacing="0.05em" textTransform="capitalize">
          {month.toLocaleDateString(locale, { month: 'long', year: 'numeric' })}
        </Text>
        <IconButton aria-label={lang === 'en' ? 'Next month' : 'Mes siguiente'} size="sm" variant="ghost" borderRadius="full"
          color={C.textMuted} _hover={{ bg: 'color-mix(in srgb, var(--brand-primary) 10%, transparent)' }}
          onClick={() => { onSelectDay(null); onMonthChange(new Date(y, m + 1, 1)); }}>
          ›
        </IconButton>
      </Flex>

      <SimpleGrid columns={7} gap={1} mb={1}>
        {weekdayInitials.map((w, i) => (
          <Text key={i} textAlign="center" fontFamily='var(--font-body)'
            fontSize="9px" fontWeight={700} color={C.textMuted}
            textTransform="uppercase" letterSpacing="0.06em">{w}</Text>
        ))}
      </SimpleGrid>

      <SimpleGrid columns={7} gap={1}>
        {Array.from({ length: startOffset }).map((_, i) => <Box key={`b${i}`} />)}
        {Array.from({ length: daysInMonth }, (_, i) => {
          const day = i + 1;
          const key = `${y}-${String(m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const info = byDay[key];
          const isSelected = selectedDay === key;
          const isToday = key === todayKey;
          return (
            <Box key={key} as="button"
              onClick={() => onSelectDay(isSelected ? null : key)}
              minH={{ base: '44px', md: '52px' }} borderRadius="12px"
              display="flex" flexDirection="column" alignItems="center" justifyContent="center"
              gap="3px" cursor="pointer"
              bg={isSelected ? C.btnGrad : info ? 'color-mix(in srgb, var(--brand-primary) 10%, transparent)' : 'transparent'}
              border={isToday && !isSelected ? `1.5px solid ${C.accentDark}` : `1px solid ${info ? C.borderStrong : 'transparent'}`}
              boxShadow={isSelected ? '0 3px 10px color-mix(in srgb, color-mix(in srgb, var(--brand-primary) 60%, var(--brand-dark)) 30%, transparent)' : 'none'}
              transition="all 0.15s ease"
              _hover={{ bg: isSelected ? C.btnGrad : 'color-mix(in srgb, var(--brand-primary) 14%, transparent)' }}>
              <Text fontFamily='var(--font-body)' fontSize="xs" fontWeight={700}
                color={isSelected ? 'white' : isToday ? C.accentDark : info ? C.brown : C.textMuted}>
                {day}
              </Text>
              {info && (
                <Flex gap="3px">
                  {info.up > 0 && <Box w="5px" h="5px" borderRadius="full"
                    bg={isSelected ? 'white' : C.success} />}
                  {info.past > 0 && <Box w="5px" h="5px" borderRadius="full"
                    bg={isSelected ? 'rgba(255,255,255,0.65)' : C.accent} />}
                </Flex>
              )}
            </Box>
          );
        })}
      </SimpleGrid>
    </Box>
  );
}

// ── Booking card ──────────────────────────────────────────────────────────────
function BookingCard({ booking, onCancel, cancelingId, cancelLabel }: {
  booking: Booking; onCancel: (id: number) => void; cancelingId: number | null; cancelLabel: string;
}) {
  const t = useT();
  const lang = useLangStore(s => s.lang);
  const locale = langToLocale(lang);
  const getStatusLabel = useStatusLabel();
  const isPast = new Date(booking.start_datetime) < new Date();
  const cancelable = !isPast && canCancelBooking(booking.start_datetime) && booking.status === 'reserved';
  const sc = statusColor[booking.status] || C.accent;
  const isCanceling = cancelingId === booking.id;

  const [showCalMenu, setShowCalMenu] = useState(false);
  const calMenuRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!showCalMenu) return;
    const handler = (e: MouseEvent) => {
      if (calMenuRef.current && !calMenuRef.current.contains(e.target as Node)) {
        setShowCalMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showCalMenu]);

  // Título y sala en el idioma actual (también para Google/Apple/.ics)
  const what = tr(booking, 'what', lang);
  const bookingRoom = tr(booking, 'room_name', lang);
  const calData = {
    what,
    start_datetime: booking.start_datetime,
    end_datetime: booking.end_datetime,
    teacher: booking.teacher,
    room_name: bookingRoom,
  };

  const calOptions = [
    {
      icon: <FaGooglePlusG size={12} />,
      label: t('calendarView.exportGoogle'),
      action: () => { window.open(buildGoogleCalendarUrl(calData), '_blank', 'noopener'); setShowCalMenu(false); },
    },
    {
      icon: <FaApple size={12} />,
      label: t('calendarView.exportApple'),
      action: () => { window.open(buildAppleCalendarUrl(calData), '_blank'); setShowCalMenu(false); },
    },
    {
      icon: <FaDownload size={11} />,
      label: t('calendarView.exportOutlook'),
      action: () => { downloadIcs(calData, `${calText().slug}-${what.replace(/\s+/g, '-').toLowerCase()}.ics`); setShowCalMenu(false); },
    },
  ];

  return (
    <MotionBox
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.26 } as any}
      bg={isPast ? 'color-mix(in srgb, var(--brand-bg) 50%, transparent)' : C.card}
      borderRadius="16px"
      border={`1px solid ${C.border}`}
      boxShadow={isPast ? 'none' : '0 4px 18px color-mix(in srgb, var(--brand-dark) 7%, transparent)'}
      position="relative"
    >
      {/* Top colour bar — clips its own top corners to match card radius */}
      <Box h="3px" bg={sc} borderRadius="16px 16px 0 0" />
      <Flex gap={4} p={4} align="center">
        {/* Date block */}
        <Box minW="48px" textAlign="center" flexShrink={0}>
          <Text fontFamily='var(--font-heading)' fontSize="2xl"
            color={C.brown} lineHeight="1">
            {new Date(booking.start_datetime).getDate()}
          </Text>
          <Text fontFamily='var(--font-body)' fontSize="9px"
            fontWeight={700} color={C.textMuted} textTransform="uppercase" letterSpacing="0.08em">
            {new Date(booking.start_datetime).toLocaleDateString(locale, { month: 'short' })}
          </Text>
        </Box>

        <Box w="1px" h="40px" bg={C.border} flexShrink={0} />

        <Box flex={1} minW={0}>
          <Text fontFamily='var(--font-heading)' fontSize="lg"
            color={C.brown} letterSpacing="0.03em"
            style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {what}
          </Text>
          <Flex gap={3} mt={0.5} flexWrap="wrap">
            <Flex align="center" gap={1}>
              <FaClock size={9} color={C.textMuted} />
              <Text fontFamily='var(--font-body)' fontSize="11px" color={C.textMuted}>
                {fmtTime(booking.start_datetime, locale)} – {fmtTime(booking.end_datetime, locale)}
              </Text>
            </Flex>
            {bookingRoom && (
              <Flex align="center" gap={1}>
                <FaMapMarkerAlt size={9} color={C.textMuted} />
                <Text fontFamily='var(--font-body)' fontSize="11px" color={C.textMuted}>
                  {bookingRoom}
                </Text>
              </Flex>
            )}
          </Flex>
          {booking.teacher && (
            <Text fontFamily='var(--font-body)' fontSize="11px"
              color={C.accent} fontWeight={600} mt={0.5}>
              {booking.teacher}
            </Text>
          )}
        </Box>

        <Flex direction="column" align="flex-end" gap={2} flexShrink={0}>
          <Box px={2} py={0.5} borderRadius="full"
            bg={tint(sc, 9)} border={`1px solid ${tint(sc, 21)}`}>
            <Text fontFamily='var(--font-body)' fontSize="9px"
              fontWeight={700} color={sc} letterSpacing="0.08em">
              {getStatusLabel(booking.status)}
            </Text>
          </Box>

          {/* Calendar export button */}
          {booking.status !== 'canceled' && (
            <Box position="relative" ref={calMenuRef}>
              {/* Labelled pill button — visible & accessible */}
              <Flex
                as="button"
                align="center" gap={1.5}
                px={2.5} py={1}
                borderRadius="full"
                border={`1px solid ${showCalMenu ? C.borderStrong : C.border}`}
                bg={showCalMenu ? 'color-mix(in srgb, var(--brand-primary) 10%, transparent)' : 'transparent'}
                color={showCalMenu ? C.accentDark : C.textMuted}
                cursor="pointer"
                transition="all 0.18s ease"
                _hover={{ bg: 'color-mix(in srgb, var(--brand-primary) 10%, transparent)', borderColor: C.borderStrong, color: C.accentDark }}
                onClick={() => setShowCalMenu(v => !v)}
              >
                <FaCalendarPlus size={10} />
                <Text fontFamily='var(--font-body)' fontSize="10px" fontWeight={700}
                  letterSpacing="0.04em" style={{ whiteSpace: 'nowrap' }}>
                  {t('dashboard.agenda.addToCalendar')}
                </Text>
              </Flex>

              {/* Dropdown — rendered at a z-index above the card stacking context */}
              {showCalMenu && (
                <Box
                  position="absolute" right={0} top="calc(100% + 6px)"
                  zIndex={200}
                  bg="rgba(255,255,255,0.98)"
                  border={`1px solid ${C.borderStrong}`}
                  borderRadius="12px"
                  boxShadow="0 12px 40px color-mix(in srgb, var(--brand-dark) 18%, transparent)"
                  minW="170px"
                  style={{ backdropFilter: 'blur(16px)' }}
                >
                  {calOptions.map((opt, i) => (
                    <Flex
                      key={i}
                      as="button"
                      align="center" gap={2.5}
                      px={3.5} py={2.5}
                      w="full"
                      cursor="pointer"
                      bg="transparent"
                      _hover={{ bg: 'color-mix(in srgb, var(--brand-primary) 8%, transparent)' }}
                      transition="background 0.15s ease"
                      onClick={opt.action}
                      borderBottom={i < calOptions.length - 1 ? `1px solid ${C.border}` : 'none'}
                      borderRadius={i === 0 ? '12px 12px 0 0' : i === calOptions.length - 1 ? '0 0 12px 12px' : '0'}
                    >
                      <Box color={C.accent} flexShrink={0}>{opt.icon}</Box>
                      <Text fontFamily='var(--font-body)' fontSize="12px"
                        fontWeight={600} color={C.brown} style={{ whiteSpace: 'nowrap' }}>
                        {opt.label}
                      </Text>
                    </Flex>
                  ))}
                </Box>
              )}
            </Box>
          )}

          {cancelable && (
            <IconButton aria-label={cancelLabel} size="xs" variant="ghost"
              color={C.danger} onClick={() => onCancel(booking.id)}
              disabled={isCanceling}>
              {isCanceling ? <Spinner size="xs" /> : <FaTimes size={11} />}
            </IconButton>
          )}
          {/* Aviso de plazo — la clase es próxima pero ya no se puede cancelar */}
          {!isPast && !canCancelBooking(booking.start_datetime) && booking.status === 'reserved' && (
            <Flex align="center" gap={1} mt={0.5}>
              <FaLock size={8} color={C.textMuted} />
              <Text fontFamily='var(--font-body)' fontSize="9px" color={C.textMuted} fontWeight={600}>
                {t('dashboard.agenda.cancelLocked', { hours: cancelMinHours() })}
              </Text>
            </Flex>
          )}
        </Flex>
      </Flex>
    </MotionBox>
  );
}

// ── Preference card ───────────────────────────────────────────────────────────
function PrefCard({ pref, onRemove }: { pref: ClassPreference; onRemove: (id: number) => void }) {
  const t = useT();
  const lang = useLangStore(s => s.lang);

  return (
    <MotionBox
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.94 }}
      transition={{ duration: 0.20 } as any}
    >
      <Flex align="center" gap={3} p={3} borderRadius="14px"
        bg={pref.is_active ? 'color-mix(in srgb, var(--brand-primary) 8%, transparent)' : 'color-mix(in srgb, var(--brand-bg) 50%, transparent)'}
        border={`1px solid ${pref.is_active ? C.borderStrong : C.border}`}>
        <Box w="8px" h="8px" borderRadius="full" flexShrink={0}
          bg={pref.is_active ? C.accentDark : 'color-mix(in srgb, var(--brand-primary) 30%, transparent)'} />
        <Box flex={1}>
          <Text fontFamily='var(--font-body)' fontWeight={700}
            fontSize="sm" color={C.brown}>{tr(pref, 'schedule_title', lang)}</Text>
          <Text fontFamily='var(--font-body)' fontSize="11px" color={C.textMuted}>
            {weekdayName(pref.weekday, lang)}
            {pref.start_time && ` · ${pref.start_time.slice(0, 5)}`}
            {pref.room_name && ` · ${tr(pref, 'room_name', lang)}`}
          </Text>
        </Box>
        <IconButton aria-label={t('dashboard.clases.removePref')} size="xs" variant="ghost"
          color={C.textMuted} _hover={{ color: C.danger }}
          onClick={() => onRemove(pref.id)}>
          <FaTrash size={10} />
        </IconButton>
      </Flex>
    </MotionBox>
  );
}

// ── Main inner ────────────────────────────────────────────────────────────────
function MemberDashboardInner() {
  const t = useT();
  const lang = useLangStore(s => s.lang);
  const locale = langToLocale(lang);
  const getStatusLabel = useStatusLabel();
  const TABS = useTabs();
  const [tab, setTab] = useState<Tab>('agenda');
  const [loading, setLoading] = useState(true);
  const [agendaView, setAgendaView] = useState<'list' | 'week' | 'month'>('list');
  const [calMonth, setCalMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const [upcomingBookings, setUpcomingBookings] = useState<Booking[]>([]);
  const [pastBookings, setPastBookings] = useState<Booking[]>([]);
  // FIX: paginación del historial — usuarios con muchas reservas necesitan
  // cargar páginas adicionales en lugar de un limit fijo en cliente.
  // NO usamos el `next` URL de DRF porque puede venir con esquema/host distinto
  // (p.ej. http://... cuando el cliente está en https://...) → redirect →
  // CORS preflight falla con ERR_INVALID_REDIRECT. En su lugar guardamos solo
  // el número de página y reconstruimos el URL local.
  const HISTORY_PAGE_SIZE = 12;
  const [pastPage, setPastPage] = useState(1);
  const [pastHasMore, setPastHasMore] = useState(false);
  const [pastLoadingMore, setPastLoadingMore] = useState(false);
  const [pastTotalCount, setPastTotalCount] = useState<number | null>(null);
  const [preferences, setPreferences] = useState<ClassPreference[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [replacement, setReplacement] = useState<any>(null);
  const [showAddPref, setShowAddPref] = useState(false);
  const [showAddPrefSub, setShowAddPrefSub] = useState(false);
  const [schedulesLoading, setSchedulesLoading] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [cancelingId, setCancelingId] = useState<number | null>(null);
  const [addingScheduleId, setAddingScheduleId] = useState<number | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [subCancelLoading, setSubCancelLoading] = useState(false);
  const [showSubCancelConfirm, setShowSubCancelConfirm] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [choosingReplacementId, setChoosingReplacementId] = useState<number | null>(null);

  const fetchAll = useCallback(async () => {
    const token = getToken();
    const userId = getUserId();
    if (!token || !userId) { setLoading(false); setIsLoggedIn(false); return; }
    setIsLoggedIn(true);
    const h = authHeaders();

    try {
      // FIX: dos queries separadas para reservas, filtradas server-side por fecha.
      // - Upcoming: futuras NO canceladas, asc, sin paginar (200 max — un usuario
      //   típico tiene <50 reservas activas a futuro).
      // - History: pasadas O canceladas, desc, primera página (12 items).
      //   Para "cargar más" se usa `next` URL devuelta por DRF.
      const nowIso = new Date().toISOString();
      // El backend soporta start_datetime__gte/__lt (mismo lookup que el CRM).
      // No incluimos status__in porque no está garantizado y el filtro client-side
      // (línea más abajo) excluye 'canceled'. Si lo añades en backend, podemos
      // pasarlo aquí.
      const upcomingUrl = `${API}v1/bookings/?user=${userId}` +
        `&start_datetime__gte=${encodeURIComponent(nowIso)}` +
        `&ordering=start_datetime&page_size=200`;
      const pastUrl = `${API}v1/bookings/?user=${userId}` +
        `&start_datetime__lt=${encodeURIComponent(nowIso)}` +
        `&ordering=-start_datetime&page_size=${HISTORY_PAGE_SIZE}`;

      const results = await Promise.allSettled([
        fetch(`${API}wallet/my-balance/`, { headers: h }),
        fetch(upcomingUrl, { headers: h }),
        fetch(`${API}v1/my-class-preferences/`, { headers: h }),
        fetch(`${API}v1/subscriptions/?user=${userId}`, { headers: h }),
        fetch(`${API}v1/my-replacement-status/`, { headers: h }),
        fetch(pastUrl, { headers: h }),
      ]);

      const [balR, bookR, prefR, subR, replR, pastR] = results;

      // Sesión inválida/caducada (401 en cualquier endpoint autenticado):
      // limpiar sesión y mostrar la pantalla de login en lugar de un
      // dashboard vacío en silencio.
      const anyAuthFail = results.some(
        r => r.status === 'fulfilled' && r.value.status === 401
      );
      if (anyAuthFail) {
        clearSession();
        setIsLoggedIn(false);
        return;
      }

      // Fallo total (red caída / backend caído): mostrar error con reintento,
      // no un dashboard vacío.
      const allFailed = results.every(
        r => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.ok)
      );
      if (allFailed) {
        setLoadError(true);
        return;
      }
      setLoadError(false);

      if (balR.status === 'fulfilled' && balR.value.ok) {
        const d = await balR.value.json();
        setBalance(Number(d.balance ?? d.credits) || 0);
      }
      if (bookR.status === 'fulfilled' && bookR.value.ok) {
        const d = await bookR.value.json();
        const all: Booking[] = Array.isArray(d) ? d : (d.results || []);
        // Defensive: por si el backend ignora el filter (algunos DRF lo hacen),
        // re-filtramos en cliente. Esto es solo redundancia, NO debería filtrar nada.
        const now = new Date();
        setUpcomingBookings(
          all.filter(b => new Date(b.start_datetime) >= now && b.status !== 'canceled')
        );
        // Ya es clienta: cuenta como recurrente para el aviso de instalar la app
        if (all.length > 0) { try { localStorage.setItem('domHasBooked', '1'); } catch {} }
      }
      if (pastR.status === 'fulfilled' && pastR.value.ok) {
        const d = await pastR.value.json();
        if (Array.isArray(d)) {
          // Si el backend no pagina (array plano), no hay siguiente página
          setPastBookings(d);
          setPastHasMore(false);
          setPastTotalCount(d.length);
        } else {
          const results = d.results || [];
          setPastBookings(results);
          // hasMore basado en count vs items cargados, NO en el `next` URL de DRF
          // (ese URL puede venir mal formado y causar CORS al hacerle fetch).
          const count = typeof d.count === 'number' ? d.count : results.length;
          setPastTotalCount(count);
          setPastHasMore(results.length < count);
          setPastPage(1);
        }
      }
      if (prefR.status === 'fulfilled' && prefR.value.ok) {
        const d = await prefR.value.json();
        const all: ClassPreference[] = Array.isArray(d) ? d : (d.results || []);
        // Strip any preference linked to a non-recurring schedule (weekday null
        // means it's a one-off event — would show "Invalid Date" in the UI).
        setPreferences(all.filter(p => p.weekday != null && p.start_time != null && p.schedule_title));
      }
      if (subR.status === 'fulfilled' && subR.value.ok) {
        const d = await subR.value.json();
        const subs: Subscription[] = Array.isArray(d) ? d : (d.results || []);
        // past_due también se muestra: la usuaria debe enterarse de que su
        // pago falló y la auto-reserva está en pausa (antes veíamos "sin
        // suscripción", que era mentira y no daba ninguna vía de arreglo).
        setSubscription(
          subs.find(s => s.status === 'active')
          || subs.find(s => s.status === 'past_due')
          || null
        );
      }
      if (replR.status === 'fulfilled' && replR.value.ok) {
        setReplacement(await replR.value.json());
      }
    } catch (e) {
      console.error('Dashboard fetch error:', e);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const t = p.get('tab') as Tab | null;
    if (t && TABS.find(x => x.key === t)) setTab(t);
  }, []);

  // FIX #11: refrescar balance/datos cuando el usuario vuelve a la pestaña
  // (p.ej. tras pagar en Stripe en otra pestaña, o al volver con el back
  // button). Sin esto, el balance puede quedar desfasado.
  useEffect(() => {
    const onFocus = () => { fetchAll(); };
    const onVisible = () => { if (document.visibilityState === 'visible') fetchAll(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [fetchAll]);

  const loadSchedules = useCallback(async () => {
    if (schedules.length > 0) return;
    setSchedulesLoading(true);
    try {
      const res = await fetch(`${API}v1/recurrences/?is_active=true&is_recurrent=true`, { headers: authHeaders() });
      if (res.ok) {
        const d = await res.json();
        const all: Schedule[] = Array.isArray(d) ? d : (d.results || []);
        // Strip any non-recurrent schedule that slipped through
        // (weekday null → would render "Invalid Date" in the subscription UI)
        setSchedules(all.filter(s => s.weekday != null && s.start_time != null));
      }
    } catch {} finally { setSchedulesLoading(false); }
  }, [schedules.length]);

  // FIX: cargar siguiente página del historial.
  // Reconstruimos el URL en cliente (mismo API base, page incrementado) para
  // evitar el problema CORS/redirect cuando DRF devuelve el `next` con un
  // esquema (http://) que el browser no acepta en preflight.
  const loadMoreHistory = useCallback(async () => {
    if (!pastHasMore || pastLoadingMore) return;
    const userId = getUserId();
    if (!userId) return;
    setPastLoadingMore(true);
    try {
      const nextPage = pastPage + 1;
      const nowIso = new Date().toISOString();
      const url = `${API}v1/bookings/?user=${userId}` +
        `&start_datetime__lt=${encodeURIComponent(nowIso)}` +
        `&ordering=-start_datetime` +
        `&page_size=${HISTORY_PAGE_SIZE}` +
        `&page=${nextPage}`;
      const res = await fetch(url, { headers: authHeaders() });
      if (!res.ok) throw new Error(t('dashboard.agenda.loadMoreError'));
      const d = await res.json();
      const newItems: Booking[] = Array.isArray(d) ? d : (d.results || []);
      setPastBookings(prev => {
        const combined = [...prev, ...newItems];
        // Recalcular hasMore: tenemos más si combined.length < count
        if (!Array.isArray(d) && typeof d.count === 'number') {
          setPastHasMore(combined.length < d.count);
          setPastTotalCount(d.count);
        } else {
          setPastHasMore(false);
        }
        return combined;
      });
      setPastPage(nextPage);
    } catch (e: any) {
      toaster.create({ title: e.message, type: 'error', duration: 3000 });
    } finally {
      setPastLoadingMore(false);
    }
  }, [pastPage, pastHasMore, pastLoadingMore]);

  const handleCancelBooking = async (id: number) => {
    setCancelingId(id);
    try {
      const res = await fetch(`${API}v1/bookings/${id}/cancel/`, { method: 'POST', headers: authHeaders() });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        if (d?.code === 'cancel_window_closed') {
          throw new Error(t('dashboard.agenda.cancelTooLate', { hours: d.min_hours ?? cancelMinHours() }));
        }
        throw new Error(t('dashboard.agenda.cancelError'));
      }
      setUpcomingBookings(prev => prev.filter(b => b.id !== id));
      setSelectedBooking(null);
      toaster.create({ title: t('dashboard.agenda.cancelSuccess'), type: 'success', duration: 2500 });
      const balRes = await fetch(`${API}wallet/my-balance/`, { headers: authHeaders() });
      if (balRes.ok) { const d = await balRes.json(); setBalance(Number(d.balance) || 0); }
    } catch (e: any) {
      toaster.create({ title: e.message, type: 'error', duration: 4000 });
    } finally { setCancelingId(null); }
  };

  const handleAddPreference = async (scheduleId: number) => {
    setAddingScheduleId(scheduleId);
    try {
      const res = await fetch(`${API}v1/my-class-preferences/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ schedule: scheduleId }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.detail || d.error || t('dashboard.clases.addError'));
      }
      const newPref: ClassPreference = await res.json();
      // Only add the preference if the backend confirms it is recurrent
      if (newPref.weekday != null && newPref.start_time != null && newPref.schedule_title) {
        setPreferences(prev => [...prev, newPref]);
      }
      toaster.create({ title: t('dashboard.clases.addSuccess'), type: 'success', duration: 2500 });
    } catch (e: any) {
      toaster.create({ title: e.message, type: 'error', duration: 4000 });
    } finally { setAddingScheduleId(null); }
  };

  const handleRemovePreference = async (id: number) => {
    try {
      const res = await fetch(`${API}v1/my-class-preferences/${id}/`, { method: 'DELETE', headers: authHeaders() });
      if (!res.ok) throw new Error(t('dashboard.clases.removeError'));
      setPreferences(prev => prev.filter(p => p.id !== id));
      toaster.create({ title: t('dashboard.clases.removeSuccess'), type: 'info', duration: 2000 });
    } catch (e: any) {
      toaster.create({ title: e.message, type: 'error', duration: 4000 });
    }
  };

  // ── Reemplazo de clase cancelada ─────────────────────────────────────────
  // El backend guarda el datetime como "hora de pared" (naive) — calculamos
  // la próxima ocurrencia futura del weekday/hora de la clase elegida.
  const nextSlotNaiveISO = (weekday: number, startTime: string) => {
    const now = new Date();
    const [h, mi] = startTime.split(':').map(Number);
    const jsTarget = (weekday + 1) % 7; // backend: 0=Lunes → JS: 1
    let delta = (jsTarget - now.getDay() + 7) % 7;
    if (delta === 0) {
      const todaySlot = new Date(now);
      todaySlot.setHours(h, mi, 0, 0);
      if (todaySlot <= now) delta = 7;
    }
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + delta);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(h)}:${pad(mi)}:00`;
  };

  const handleChooseReplacement = async (opt: { id: number; weekday?: number | null; start_time: string }) => {
    setChoosingReplacementId(opt.id);
    try {
      let weekday = opt.weekday;
      let startTime = opt.start_time;
      // Flags antiguos no traen weekday: lo pedimos al detalle de la clase.
      if (weekday == null) {
        const res = await fetch(`${API}v1/recurrences/${opt.id}/`, { headers: authHeaders() });
        if (!res.ok) throw new Error(t('dashboard.clases.replacement.error'));
        const d = await res.json();
        weekday = d.weekday;
        startTime = (d.start_time || startTime).slice(0, 5);
        if (weekday == null) throw new Error(t('dashboard.clases.replacement.error'));
      }
      const res = await fetch(`${API}v1/choose-replacement/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({
          schedule_id: opt.id,
          start_datetime: nextSlotNaiveISO(weekday, startTime.slice(0, 5)),
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || t('dashboard.clases.replacement.error'));
      toaster.create({ title: t('dashboard.clases.replacement.success'), type: 'success', duration: 3000 });
      fetchAll(); // refresca agenda, saldo y estado de reemplazo
    } catch (e: any) {
      toaster.create({ title: e.message, type: 'error', duration: 4500 });
    } finally { setChoosingReplacementId(null); }
  };

  // ── Subscription cancel / reactivate ───────────────────────────────────────
  const handleCancelSubscription = async () => {
    if (!subscription) return;
    setSubCancelLoading(true);
    try {
      const res = await fetch(`${API}v1/subscriptions/${subscription.id}/cancel/`, {
        method: 'POST',
        headers: authHeaders(),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || t('dashboard.subscription.cancelError'));
      }
      setSubscription(prev => prev ? { ...prev, cancel_at_period_end: true } : prev);
      setShowSubCancelConfirm(false);
      toaster.create({
        title: t('dashboard.subscription.cancelSuccess'),
        description: t('dashboard.subscription.cancelSuccessDesc', {
          date: new Date(subscription.current_period_end).toLocaleDateString(locale, { day: 'numeric', month: 'long' }),
        }),
        type: 'info',
        duration: 4000,
      });
    } catch (e: any) {
      toaster.create({ title: t('dashboard.subscription.cancelError'), description: e.message, type: 'error', duration: 4000 });
    } finally {
      setSubCancelLoading(false);
    }
  };

  const handleReactivateSubscription = async () => {
    if (!subscription) return;
    setSubCancelLoading(true);
    try {
      const res = await fetch(`${API}v1/subscriptions/${subscription.id}/reactivate/`, {
        method: 'POST',
        headers: authHeaders(),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || t('dashboard.subscription.reactivateError'));
      }
      setSubscription(prev => prev ? { ...prev, cancel_at_period_end: false } : prev);
      toaster.create({
        title: t('dashboard.subscription.reactivateSuccess'),
        description: t('dashboard.subscription.reactivateSuccessDesc'),
        type: 'success',
        duration: 3000,
      });
    } catch (e: any) {
      toaster.create({ title: t('dashboard.subscription.reactivateError'), description: e.message, type: 'error', duration: 4000 });
    } finally {
      setSubCancelLoading(false);
    }
  };

  const schedulesByDay = useMemo(() => {
    const m: Record<number, Schedule[]> = {};
    schedules.forEach(s => { (m[s.weekday] = m[s.weekday] || []).push(s); });
    return m;
  }, [schedules]);

  // ── Auto-booking schedule dates ────────────────────────────────────────────
  const autoBookDates = useMemo(() => {
    const today = new Date();
    const dow = today.getDay(); // 0=Sun … 6=Sat
    const daysToSunday = dow === 0 ? 7 : 7 - dow;
    const nextSunday  = new Date(today.getFullYear(), today.getMonth(), today.getDate() + daysToSunday);
    const nextMonday  = new Date(nextSunday.getFullYear(), nextSunday.getMonth(), nextSunday.getDate() + 1);
    const saturday    = new Date(nextSunday.getFullYear(), nextSunday.getMonth(), nextSunday.getDate() - 1);
    const fmtShort    = (d: Date) => d.toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' });
    const isToday     = (d: Date) => d.toDateString() === today.toDateString();
    return {
      nextSundayStr:    fmtShort(nextSunday),
      nextMondayStr:    fmtShort(nextMonday),
      saturdayStr:      fmtShort(saturday),
      deadlineIsToday:  isToday(saturday),
    };
  }, [locale]);

  const existingScheduleIds = useMemo(() => new Set(preferences.map(p => p.schedule)), [preferences]);

  // ── Not logged in ──────────────────────────────────────────────────────────
  if (!loading && !isLoggedIn) return (
    <Box bg={C.bg} minH="100vh" display="flex" alignItems="center" justifyContent="center" p={8}>
      <Card>
        <Box textAlign="center" py={4} px={2}>
          <Box w="52px" h="52px" borderRadius="full" mx="auto" mb={4}
            bg="color-mix(in srgb, var(--brand-primary) 10%, transparent)" display="flex" alignItems="center" justifyContent="center">
            <FaUser size={22} color={C.accent} />
          </Box>
          <Text fontFamily='var(--font-heading)' fontSize="2xl" color={C.brown} mb={2}>
            {t('dashboard.loginRequired')}
          </Text>
          <Text fontFamily='var(--font-body)' fontSize="sm" color={C.textMuted} mb={5}>
            {t('dashboard.loginDesc')}
          </Text>
          <Button h="44px" borderRadius="full" color="white" bg={C.btnGrad}
            fontFamily='var(--font-body)' fontWeight={700} px={8}
            onClick={() => { window.location.href = t('nav.items.home.href') || '/'; }}>
            {t('dashboard.loginCta')}
          </Button>
        </Box>
      </Card>
    </Box>
  );

  if (loading) return (
    <Box bg={C.bg} minH="100vh" display="flex" alignItems="center" justifyContent="center">
      <VStack gap={3} align="center">
        <Spinner size="xl" color={C.accent} />
        <Text fontFamily='var(--font-body)' fontSize="sm" color={C.textMuted}>
          {t('dashboard.loading')}
        </Text>
      </VStack>
    </Box>
  );

  // ── Error de carga (red/backend caído) — antes fallaba en silencio ─────────
  if (loadError) return (
    <Box bg={C.bg} minH="100vh" display="flex" alignItems="center" justifyContent="center" p={8}>
      <Card>
        <Box textAlign="center" py={4} px={2}>
          <Box w="52px" h="52px" borderRadius="full" mx="auto" mb={4}
            bg="rgba(183,121,31,0.10)" display="flex" alignItems="center" justifyContent="center">
            <FaExclamationTriangle size={22} color={C.warning} />
          </Box>
          <Text fontFamily='var(--font-heading)' fontSize="2xl" color={C.brown} mb={2}>
            {lang === 'en' ? 'Could not load your account' : 'No pudimos cargar tu cuenta'}
          </Text>
          <Text fontFamily='var(--font-body)' fontSize="sm" color={C.textMuted} mb={5}>
            {lang === 'en'
              ? 'There was a connection problem. Your bookings and credits are safe — please try again.'
              : 'Hubo un problema de conexión. Tus reservas y créditos están a salvo — inténtalo de nuevo.'}
          </Text>
          <Button h="44px" borderRadius="full" color="white" bg={C.btnGrad}
            fontFamily='var(--font-body)' fontWeight={700} px={8}
            onClick={() => { setLoadError(false); setLoading(true); fetchAll(); }}>
            {lang === 'en' ? 'Retry' : 'Reintentar'}
          </Button>
        </Box>
      </Card>
    </Box>
  );

  const cancelLabel = t('dashboard.agenda.cancelBtn');

  // ── Tab Agenda ─────────────────────────────────────────────────────────────
  const renderAgenda = () => (
    <VStack gap={4} align="stretch">
      {/* Replacement alert */}
      {replacement?.needs_replacement && (
        <MotionBox initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 } as any}
          p={4} borderRadius="16px"
          bg="rgba(183,121,31,0.08)" border="1px solid rgba(183,121,31,0.25)">
          <Flex align="flex-start" gap={3}>
            <Box pt={0.5} flexShrink={0}><FaExclamationTriangle size={15} color={C.warning} /></Box>
            <Box flex={1}>
              <Text fontFamily='var(--font-body)' fontWeight={700} fontSize="sm" color={C.warning}>
                {t('dashboard.agenda.replacement.title')}
              </Text>
              <Text fontFamily='var(--font-body)' fontSize="xs" color={C.textMuted} mt={0.5}>
                {t('dashboard.agenda.replacement.desc', {
                  date: replacement.replacement_deadline
                    ? new Date(replacement.replacement_deadline).toLocaleDateString(locale)
                    : '—',
                })}
              </Text>
            </Box>
            <Button size="xs" h="28px" borderRadius="full" color="white"
              bg="rgba(183,121,31,0.80)"
              fontFamily='var(--font-body)' fontWeight={700} fontSize="10px"
              flexShrink={0}
              onClick={() => setTab('clases')}>
              {t('dashboard.agenda.replacement.cta')}
            </Button>
          </Flex>
        </MotionBox>
      )}

      {/* Confirmar email (solo si falta): código de 6 dígitos aquí mismo */}
      <EmailVerifyCard />

      {/* Regular sin membresía: su clase fija, reservada sola cada semana */}
      {!subscription && <MembershipSuggestionCard variant="dashboard" balance={balance} />}

      {/* Acceso fijo a instalar la app (solo móvil sin instalar) */}
      <InstallAppCTA compact />

      {/* Stats strip */}
      <SimpleGrid columns={3} gap={3}>
        {[
          { label: t('dashboard.agenda.stats.upcoming'), value: upcomingBookings.length, icon: <FaCalendarCheck size={13} />, clr: C.success },
          { label: t('dashboard.agenda.stats.credits'),  value: balance !== null ? balance.toFixed(1) : '—', icon: <FaBolt size={13} />, clr: C.accentDark },
          { label: t('dashboard.agenda.stats.favorites'), value: preferences.filter(p => p.is_active).length, icon: <FaStar size={13} />, clr: C.warning },
        ].map(({ label, value, icon, clr }) => (
          <Box key={label} bg={C.card} borderRadius="16px" p={{ base: 3, md: 4 }}
            border={`1px solid ${C.border}`}
            boxShadow="0 2px 10px color-mix(in srgb, var(--brand-dark) 5%, transparent)" textAlign="center"
            transition="transform 0.18s ease, box-shadow 0.18s ease"
            _hover={{ transform: 'translateY(-2px)', boxShadow: '0 6px 20px color-mix(in srgb, var(--brand-dark) 10%, transparent)' }}>
            <Flex justify="center" mb={1.5} color={clr}>{icon}</Flex>
            <Text fontFamily='var(--font-heading)' fontSize={{ base: 'xl', md: '2xl' }}
              color={C.brown} lineHeight="1">{value}</Text>
            <Text fontFamily='var(--font-body)' fontSize="9px" color={C.textMuted}
              fontWeight={700} textTransform="uppercase" letterSpacing="0.08em" mt={0.5}>
              {label}
            </Text>
          </Box>
        ))}
      </SimpleGrid>

      {/* Section header + view toggle */}
      <Flex justify="space-between" align="center">
        <Text fontFamily='var(--font-heading)' fontSize={{ base: '2xl', md: '3xl' }}
          color={C.brown} letterSpacing="0.04em">
          {t('dashboard.agenda.sectionTitle')}
        </Text>
        <Flex gap={1} p={1} bg="rgba(255,255,255,0.55)" borderRadius="full"
          border={`1px solid ${C.border}`}>
          {([
            { key: 'list', icon: <FaListUl size={11} /> },
            { key: 'week', icon: <FaCalendarWeek size={11} /> },
            { key: 'month', icon: <FaCalendarAlt size={11} /> },
          ] as const).map(v => (
            <Box key={v.key} as="button"
              w="32px" h="32px" borderRadius="full"
              display="flex" alignItems="center" justifyContent="center"
              bg={agendaView === v.key ? C.btnGrad : 'transparent'}
              color={agendaView === v.key ? 'white' : C.textMuted}
              boxShadow={agendaView === v.key ? '0 2px 8px color-mix(in srgb, color-mix(in srgb, var(--brand-primary) 60%, var(--brand-dark)) 25%, transparent)' : 'none'}
              transition="all 0.18s ease"
              onClick={() => setAgendaView(v.key)}>
              {v.icon}
            </Box>
          ))}
        </Flex>
      </Flex>

      {/* Week view */}
      <AnimatePresence mode="wait">
        {agendaView === 'week' && (
          <MotionBox key="week" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.22 } as any}>
            <Card>
              <Text fontFamily='var(--font-body)' fontSize="xs" fontWeight={700}
                color={C.textMuted} textTransform="uppercase" letterSpacing="0.10em" mb={4}>
                {t('dashboard.agenda.weekHint')}
              </Text>
              {upcomingBookings.length === 0 ? (
                <Box textAlign="center" py={6}>
                  <FaLeaf size={24} color={C.accent} style={{ margin: '0 auto 8px' }} />
                  <Text fontFamily='var(--font-body)' fontSize="sm" color={C.textMuted}>
                    {t('dashboard.agenda.weekEmpty')}
                  </Text>
                </Box>
              ) : (
                <WeekCalendar bookings={upcomingBookings} onSelect={setSelectedBooking} />
              )}
            </Card>
          </MotionBox>
        )}

        {/* Month view — todas las gestiones, filtrables por día */}
        {agendaView === 'month' && (
          <MotionBox key="month" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.22 } as any}>
            <Card>
              <Text fontFamily='var(--font-body)' fontSize="xs" fontWeight={700}
                color={C.textMuted} textTransform="uppercase" letterSpacing="0.10em" mb={3}>
                {t('dashboard.agenda.monthHint')}
              </Text>
              <MonthCalendar
                upcoming={upcomingBookings}
                past={pastBookings}
                month={calMonth}
                onMonthChange={setCalMonth}
                selectedDay={selectedDay}
                onSelectDay={setSelectedDay}
              />
              {/* Leyenda */}
              <Flex gap={4} justify="center" mt={3}>
                <Flex align="center" gap={1.5}>
                  <Box w="6px" h="6px" borderRadius="full" bg={C.success} />
                  <Text fontFamily='var(--font-body)' fontSize="10px" color={C.textMuted}>
                    {t('dashboard.agenda.legendUpcoming')}
                  </Text>
                </Flex>
                <Flex align="center" gap={1.5}>
                  <Box w="6px" h="6px" borderRadius="full" bg={C.accent} />
                  <Text fontFamily='var(--font-body)' fontSize="10px" color={C.textMuted}>
                    {t('dashboard.agenda.legendPast')}
                  </Text>
                </Flex>
              </Flex>
            </Card>

            {/* Clases del día seleccionado (próximas + historial) */}
            {selectedDay && (
              <VStack gap={2.5} align="stretch" mt={4}>
                <Flex justify="space-between" align="center">
                  <Text fontFamily='var(--font-body)' fontSize="sm" fontWeight={700} color={C.brown}>
                    {new Date(`${selectedDay}T12:00:00`).toLocaleDateString(locale,
                      { weekday: 'long', day: 'numeric', month: 'long' })}
                  </Text>
                  <Button size="xs" variant="ghost" color={C.textMuted}
                    fontFamily='var(--font-body)' fontSize="11px"
                    onClick={() => setSelectedDay(null)}>
                    <Flex align="center" gap={1}><FaTimes size={9} />{t('dashboard.agenda.clearDay')}</Flex>
                  </Button>
                </Flex>
                {[...upcomingBookings, ...pastBookings]
                  .filter(b => localDayKey(new Date(b.start_datetime)) === selectedDay)
                  .sort((a, b) => a.start_datetime.localeCompare(b.start_datetime))
                  .map(b => (
                    <BookingCard key={`${b.id}-m`} booking={b}
                      onCancel={handleCancelBooking} cancelingId={cancelingId}
                      cancelLabel={cancelLabel} />
                  ))}
                {[...upcomingBookings, ...pastBookings]
                  .filter(b => localDayKey(new Date(b.start_datetime)) === selectedDay).length === 0 && (
                  <Card>
                    <Text fontFamily='var(--font-body)' fontSize="sm" color={C.textMuted}
                      textAlign="center" py={3}>
                      {t('dashboard.agenda.dayEmpty')}
                    </Text>
                  </Card>
                )}
              </VStack>
            )}
          </MotionBox>
        )}

        {/* List view */}
        {agendaView === 'list' && (
          <MotionBox key="list" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.22 } as any}>
            {upcomingBookings.length === 0 ? (
              <Card>
                <Box textAlign="center" py={7}>
                  <FaLeaf size={28} color={C.accent} style={{ margin: '0 auto 12px' }} />
                  <Text fontFamily='var(--font-body)' fontSize="sm" color={C.textMuted} mb={4}>
                    {t('dashboard.agenda.noClasses')}
                  </Text>
                  <Button h="40px" borderRadius="full" color="white" bg={C.btnGrad}
                    fontFamily='var(--font-body)' fontWeight={700} fontSize="sm" px={6}
                    boxShadow="0 4px 14px color-mix(in srgb, color-mix(in srgb, var(--brand-primary) 60%, var(--brand-dark)) 22%, transparent)"
                    _hover={{ opacity: 0.90 }}
                    onClick={() => { window.location.href = '/calendar'; }}>
                    <Flex align="center" gap={2}>
                      <FaCalendarAlt size={11} />
                      {t('dashboard.agenda.exploreCta')}
                    </Flex>
                  </Button>
                </Box>
              </Card>
            ) : (
              <AnimatePresence>
                <VStack gap={3} align="stretch">
                  {upcomingBookings.map(b => (
                    <BookingCard key={b.id} booking={b}
                      onCancel={handleCancelBooking} cancelingId={cancelingId}
                      cancelLabel={cancelLabel} />
                  ))}
                </VStack>
              </AnimatePresence>
            )}
          </MotionBox>
        )}
      </AnimatePresence>

      {/* History — paginado: muestra primeros 12, "Ver más" trae 12 más cada vez */}
      {pastBookings.length > 0 && (
        <Box>
          <Button variant="ghost" size="sm" color={C.textMuted}
            fontFamily='var(--font-body)' fontSize="xs"
            onClick={() => setShowHistory(v => !v)}>
            <Flex align="center" gap={2}>
              <FaHistory size={10} />
              {showHistory ? t('dashboard.agenda.historyHide') : t('dashboard.agenda.historyShow')}
              {pastTotalCount !== null && pastTotalCount > pastBookings.length && (
                <Text as="span" fontSize="10px" color={C.textMuted} fontWeight={600}>
                  ({pastBookings.length}/{pastTotalCount})
                </Text>
              )}
            </Flex>
          </Button>
          <AnimatePresence>
            {showHistory && (
              <MotionBox initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.25 } as any}>
                <VStack gap={2} align="stretch" mt={3}>
                  {pastBookings.map(b => (
                    <BookingCard key={b.id} booking={b} onCancel={() => {}} cancelingId={null}
                      cancelLabel={cancelLabel} />
                  ))}
                  {/* Botón "Ver más" — solo si hay siguiente página */}
                  {pastHasMore && (
                    <Button
                      mt={2}
                      h="38px"
                      borderRadius="full"
                      variant="outline"
                      borderColor={C.borderStrong}
                      color={C.textMuted}
                      fontFamily='var(--font-body)'
                      fontWeight={600}
                      fontSize="xs"
                      _hover={{ bg: 'color-mix(in srgb, var(--brand-primary) 8%, transparent)' }}
                      disabled={pastLoadingMore}
                      onClick={loadMoreHistory}
                    >
                      {pastLoadingMore
                        ? <Spinner size="sm" color={C.accent} />
                        : (t('dashboard.agenda.loadMore') !== 'dashboard.agenda.loadMore'
                            ? t('dashboard.agenda.loadMore')
                            : 'Ver más')}
                    </Button>
                  )}
                </VStack>
              </MotionBox>
            )}
          </AnimatePresence>
        </Box>
      )}

      {/* CTA strip */}
      <Flex gap={3} justify="center" pt={1} flexWrap="wrap">
        {upcomingBookings.length > 0 && (
          <Button h="42px" borderRadius="full" variant="outline"
            borderColor={C.borderStrong} color={C.accentDark}
            fontFamily='var(--font-body)' fontWeight={700} fontSize="sm" px={5}
            _hover={{ bg: 'color-mix(in srgb, var(--brand-primary) 8%, transparent)' }}
            onClick={() => {
              downloadAllIcs(upcomingBookings.map(b => ({ ...b, what: tr(b, 'what', lang), room_name: tr(b, 'room_name', lang) })));
              toaster.create({ title: t('dashboard.agenda.saveAllDone'), type: 'success', duration: 3500 });
            }}>
            <Flex align="center" gap={2}><FaCalendarPlus size={11} />{t('dashboard.agenda.saveAll')}</Flex>
          </Button>
        )}
        <Button h="42px" borderRadius="full" variant="outline"
          borderColor={C.borderStrong} color={C.textMuted}
          fontFamily='var(--font-body)' fontWeight={700} fontSize="sm" px={5}
          _hover={{ bg: 'color-mix(in srgb, var(--brand-primary) 8%, transparent)' }}
          onClick={() => { window.location.href = '/calendar'; }}>
          <Flex align="center" gap={2}><FaCalendarAlt size={11} />{t('dashboard.agenda.bookCta')}</Flex>
        </Button>
        <Button h="42px" borderRadius="full" color="white" bg={C.btnGrad}
          fontFamily='var(--font-body)' fontWeight={700} fontSize="sm" px={5}
          boxShadow="0 4px 14px color-mix(in srgb, color-mix(in srgb, var(--brand-primary) 60%, var(--brand-dark)) 22%, transparent)" _hover={{ opacity: 0.90 }}
          onClick={() => { window.location.href = '/checkout'; }}>
          <Flex align="center" gap={2}><FaBolt size={11} />{t('dashboard.agenda.buyCta')}</Flex>
        </Button>
      </Flex>
    </VStack>
  );

  // ── Tab Clases ─────────────────────────────────────────────────────────────
  const renderClases = () => (
    <VStack gap={4} align="stretch">
      {/* Reemplazo pendiente: el CTA del banner de Agenda trae aquí, así que
          las opciones tienen que estar AQUÍ (antes no se mostraban en ningún
          sitio y elegir era imposible). */}
      {replacement?.needs_replacement && (
        <Box p={4} borderRadius="16px"
          bg="rgba(183,121,31,0.08)" border="1px solid rgba(183,121,31,0.25)">
          <Flex align="center" gap={2} mb={1}>
            <FaExclamationTriangle size={13} color={C.warning} />
            <Text fontFamily='var(--font-body)' fontWeight={700} fontSize="sm" color={C.warning}>
              {t('dashboard.clases.replacement.title')}
            </Text>
          </Flex>
          <Text fontFamily='var(--font-body)' fontSize="xs" color={C.textMuted} mb={3}>
            {t('dashboard.clases.replacement.desc', {
              date: replacement.replacement_deadline
                ? new Date(replacement.replacement_deadline).toLocaleDateString(locale, { day: 'numeric', month: 'long' })
                : '—',
            })}
          </Text>
          {(replacement.replacement_class_options || []).length > 0 ? (
            <VStack gap={2} align="stretch" mb={2}>
              {(replacement.replacement_class_options || []).map((opt: any) => (
                <Flex key={opt.id} align="center" justify="space-between" p={3}
                  borderRadius="12px" bg="rgba(255,255,255,0.70)"
                  border={`1px solid ${C.border}`}>
                  <Box>
                    <Text fontFamily='var(--font-body)' fontWeight={700} fontSize="sm" color={C.brown}>
                      {tr(opt, 'title', lang)}
                    </Text>
                    <Text fontFamily='var(--font-body)' fontSize="11px" color={C.textMuted}>
                      {opt.weekday != null ? `${weekdayName(opt.weekday, lang)} · ` : ''}
                      {opt.start_time}{opt.room ? ` · ${tr(opt, 'room', lang)}` : ''}
                    </Text>
                  </Box>
                  <Button size="xs" h="30px" px={4} borderRadius="full" color="white"
                    bg={C.btnGrad} fontFamily='var(--font-body)' fontWeight={700} fontSize="11px"
                    disabled={choosingReplacementId !== null}
                    onClick={() => handleChooseReplacement(opt)}>
                    {choosingReplacementId === opt.id
                      ? <Spinner size="xs" color="white" />
                      : t('dashboard.clases.replacement.choose')}
                  </Button>
                </Flex>
              ))}
            </VStack>
          ) : null}
          <Flex align="center" gap={2}>
            <Text fontFamily='var(--font-body)' fontSize="11px" color={C.textMuted}>
              {t('dashboard.clases.replacement.none')}
            </Text>
            <Button size="xs" h="26px" borderRadius="full" variant="outline"
              borderColor={C.borderStrong} color={C.accentDark}
              fontFamily='var(--font-body)' fontWeight={700} fontSize="10px"
              onClick={() => { window.location.href = '/calendar'; }}>
              {t('dashboard.clases.replacement.calendarCta')}
            </Button>
          </Flex>
        </Box>
      )}

      {/* Sin suscripción activa las favoritas NO se reservan solas: decirlo
          claro con su vía de solución, en vez de dejar que lo descubra sola. */}
      {!subscription && preferences.length > 0 && (
        <Box p={4} borderRadius="16px"
          bg="color-mix(in srgb, var(--brand-primary) 10%, transparent)" border={`1px solid ${C.borderStrong}`}>
          <Text fontFamily='var(--font-body)' fontWeight={700} fontSize="sm" color={C.brown} mb={1}>
            {t('dashboard.clases.needSubTitle')}
          </Text>
          <Text fontFamily='var(--font-body)' fontSize="xs" color={C.textMuted} mb={3}>
            {t('dashboard.clases.needSubDesc')}
          </Text>
          <Button size="sm" h="34px" borderRadius="full" color="white" bg={C.btnGrad}
            fontFamily='var(--font-body)' fontWeight={700} fontSize="xs" px={5}
            onClick={() => { window.location.href = '/prices'; }}>
            <Flex align="center" gap={1.5}><FaCrown size={11} />{t('dashboard.clases.needSubCta')}</Flex>
          </Button>
        </Box>
      )}
      {subscription?.status === 'past_due' && (
        <Box p={4} borderRadius="16px"
          bg="rgba(183,121,31,0.08)" border="1px solid rgba(183,121,31,0.25)">
          <Flex align="center" gap={2} mb={1}>
            <FaExclamationTriangle size={13} color={C.warning} />
            <Text fontFamily='var(--font-body)' fontWeight={700} fontSize="sm" color={C.warning}>
              {t('dashboard.clases.pastDueTitle')}
            </Text>
          </Flex>
          <Text fontFamily='var(--font-body)' fontSize="xs" color={C.textMuted} mb={3}>
            {t('dashboard.clases.pastDueDesc')}
          </Text>
          <Button size="sm" h="34px" borderRadius="full" color="white"
            bg="rgba(183,121,31,0.85)" _hover={{ bg: C.warning }}
            fontFamily='var(--font-body)' fontWeight={700} fontSize="xs" px={5}
            onClick={() => setTab('suscripcion')}>
            {t('dashboard.clases.pastDueCta')}
          </Button>
        </Box>
      )}

      <Box bg="color-mix(in srgb, var(--brand-primary) 8%, transparent)" borderRadius="16px" p={4}
        border={`1px solid ${C.borderStrong}`}>
        <Text fontFamily='var(--font-heading)' fontSize="lg"
          color={C.brown} letterSpacing="0.04em" mb={1}>
          {t('dashboard.clases.infoTitle')}
        </Text>
        <Text fontFamily='var(--font-body)' fontSize="sm" color={C.textMuted} lineHeight="1.65">
          {t('dashboard.clases.infoBody')}
        </Text>
      </Box>

      <Flex justify="space-between" align="center">
        <Text fontFamily='var(--font-heading)' fontSize="xl" color={C.brown} letterSpacing="0.04em">
          {t('dashboard.clases.prefTitle', { count: preferences.filter(p => p.is_active).length })}
        </Text>
        <Button size="sm" h="34px" borderRadius="full" color="white" bg={C.btnGrad}
          fontFamily='var(--font-body)' fontWeight={700} fontSize="xs"
          boxShadow="0 3px 10px color-mix(in srgb, color-mix(in srgb, var(--brand-primary) 60%, var(--brand-dark)) 20%, transparent)" _hover={{ opacity: 0.90 }}
          onClick={() => { setShowAddPref(v => !v); if (!showAddPref) loadSchedules(); }}>
          <Flex align="center" gap={1.5}>
            {showAddPref ? <FaTimes size={10} /> : <FaPlus size={10} />}
            {showAddPref ? t('dashboard.clases.closeBtn') : t('dashboard.clases.addBtn')}
          </Flex>
        </Button>
      </Flex>

      {preferences.length === 0 && !showAddPref ? (
        <Card>
          <Box textAlign="center" py={6}>
            <Box w="44px" h="44px" borderRadius="full" mx="auto" mb={3}
              bg="color-mix(in srgb, var(--brand-primary) 10%, transparent)" display="flex" alignItems="center" justifyContent="center">
              <FaStar size={18} color={C.accent} />
            </Box>
            <Text fontFamily='var(--font-body)' fontSize="sm" color={C.textMuted} mb={3}>
              {t('dashboard.clases.emptyText')}
            </Text>
            <Button size="sm" h="34px" borderRadius="full" color="white" bg={C.btnGrad}
              fontFamily='var(--font-body)' fontWeight={700} fontSize="xs"
              onClick={() => { setShowAddPref(true); loadSchedules(); }}>
              <Flex align="center" gap={1.5}><FaPlus size={10} />{t('dashboard.clases.emptyAddBtn')}</Flex>
            </Button>
          </Box>
        </Card>
      ) : (
        <AnimatePresence>
          <VStack gap={2} align="stretch">
            {preferences.map(p => (
              <PrefCard key={p.id} pref={p} onRemove={handleRemovePreference} />
            ))}
          </VStack>
        </AnimatePresence>
      )}

      <AnimatePresence>
        {showAddPref && (
          <MotionBox initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.22 } as any}>
            <Card>
              <Text fontFamily='var(--font-heading)' fontSize="xl" color={C.brown}
                letterSpacing="0.04em" mb={4}>
                {t('dashboard.clases.addSectionTitle')}
              </Text>
              {schedulesLoading ? (
                <Flex justify="center" py={6}><Spinner color={C.accent} /></Flex>
              ) : schedules.length === 0 ? (
                <Text fontFamily='var(--font-body)' fontSize="sm" color={C.textMuted}
                  textAlign="center" py={4}>
                  {t('dashboard.clases.noSchedules')}
                </Text>
              ) : (
                Object.entries(schedulesByDay)
                  .sort(([a], [b]) => parseInt(a) - parseInt(b))
                  .map(([day, dayScheds]) => (
                    <Box key={day} mb={4}>
                      <Text fontFamily='var(--font-body)' fontSize="xs" fontWeight={700}
                        color={C.textMuted} textTransform="uppercase" letterSpacing="0.10em" mb={2}>
                        {weekdayName(parseInt(day), lang)}
                      </Text>
                      <Stack gap={1.5}>
                        {dayScheds.map(s => {
                          const added = existingScheduleIds.has(s.id);
                          const isAdding = addingScheduleId === s.id;
                          return (
                            <Flex key={s.id} align="center" justify="space-between"
                              p={3} borderRadius="12px"
                              bg={added ? 'color-mix(in srgb, var(--brand-primary) 8%, transparent)' : 'rgba(255,255,255,0.60)'}
                              border={`1px solid ${added ? C.borderStrong : C.border}`}
                              transition="all 0.15s ease">
                              <Box>
                                <Text fontFamily='var(--font-body)' fontWeight={700}
                                  fontSize="sm" color={C.brown}>
                                  {tr(s.class_type, 'title', lang) || t('dashboard.clases.classFallback')}
                                </Text>
                                <Text fontFamily='var(--font-body)' fontSize="11px" color={C.textMuted}>
                                  {s.start_time?.slice(0, 5)} – {s.end_time?.slice(0, 5)}
                                  {s.room?.name ? ` · ${roomName(s.room, lang)}` : ''}
                                </Text>
                              </Box>
                              {added ? (
                                <FaCheckCircle size={14} color={C.accentDark} />
                              ) : (
                                <Button size="xs" h="28px" borderRadius="full"
                                  color="white" bg={C.btnGrad}
                                  fontFamily='var(--font-body)' fontWeight={700} fontSize="11px"
                                  disabled={isAdding} _hover={{ opacity: 0.90 }}
                                  onClick={() => handleAddPreference(s.id)}>
                                  {isAdding ? <Spinner size="xs" color="white" /> : t('dashboard.clases.addItemBtn')}
                                </Button>
                              )}
                            </Flex>
                          );
                        })}
                      </Stack>
                    </Box>
                  ))
              )}
            </Card>
          </MotionBox>
        )}
      </AnimatePresence>
    </VStack>
  );

  // ── Tab Suscripción ────────────────────────────────────────────────────────
  const renderSuscripcion = () => (
    <VStack gap={4} align="stretch">
      {/* Credits hero */}
      <Box bg={C.btnGrad} borderRadius="24px" p={6} position="relative" overflow="hidden">
        <Box position="absolute" top="-30px" right="-20px" w="130px" h="130px"
          borderRadius="full" bg="rgba(255,255,255,0.07)" />
        <Box position="absolute" bottom="-25px" left="35%" w="90px" h="90px"
          borderRadius="full" bg="rgba(255,255,255,0.05)" />
        <Box position="absolute" top="30%" right="12%" w="55px" h="55px"
          borderRadius="full" bg="rgba(255,255,255,0.04)" />

        <Flex justify="space-between" align="flex-start" position="relative">
          <Box>
            <Text fontFamily='var(--font-body)' fontSize="xs" fontWeight={700}
              color="rgba(255,255,255,0.70)" letterSpacing="0.14em" textTransform="uppercase" mb={1}>
              {t('dashboard.subscription.balanceLabel')}
            </Text>
            <Text fontFamily='var(--font-heading)' fontSize="6xl" color="white"
              lineHeight="1" letterSpacing="0.02em">
              {balance !== null ? balance.toFixed(1) : '—'}
            </Text>
            <Text fontFamily='var(--font-body)' fontSize="sm" color="rgba(255,255,255,0.70)">
              {t('dashboard.credits')}
            </Text>
          </Box>
          <Button size="sm" h="34px" borderRadius="full"
            bg="rgba(255,255,255,0.18)" color="white"
            fontFamily='var(--font-body)' fontWeight={700} fontSize="xs"
            border="1px solid rgba(255,255,255,0.25)"
            _hover={{ bg: 'rgba(255,255,255,0.28)' }}
            onClick={() => { window.location.href = '/checkout'; }}>
            <Flex align="center" gap={1.5}><FaPlus size={10} />{t('dashboard.subscription.rechargeBtn')}</Flex>
          </Button>
        </Flex>
      </Box>

      {/* Plan card */}
      {subscription ? (
        <Card>
          <Flex justify="space-between" align="flex-start" mb={3}>
            <Box>
              <Flex align="center" gap={2} mb={0.5}>
                <FaCrown size={13} color={C.accentDark} />
                <Text fontFamily='var(--font-heading)' fontSize="xl"
                  color={C.brown} letterSpacing="0.04em">
                  {planDisplayName(subscription.plan, lang)}
                </Text>
              </Flex>
              <Text fontFamily='var(--font-body)' fontSize="sm" color={C.textMuted}>
                {t('plans.subCreditsMonth', { n: subscription.plan.credits })}
              </Text>
            </Box>
            {subscription.status === 'past_due' ? (
              <Box px={2.5} py={1} borderRadius="full"
                bg="rgba(183,121,31,0.10)" border="1px solid rgba(183,121,31,0.30)">
                <Text fontFamily='var(--font-body)' fontSize="10px" fontWeight={700}
                  color={C.warning} letterSpacing="0.08em">
                  {t('dashboard.subscription.pastDueBadge')}
                </Text>
              </Box>
            ) : (
              <Box px={2.5} py={1} borderRadius="full"
                bg="rgba(45,125,70,0.10)" border="1px solid rgba(45,125,70,0.25)">
                <Text fontFamily='var(--font-body)' fontSize="10px" fontWeight={700}
                  color={C.success} letterSpacing="0.08em">
                  {t('dashboard.subscription.activeBadge')}
                </Text>
              </Box>
            )}
          </Flex>

          {subscription.status === 'past_due' && (
            <Box mb={3} p={3} borderRadius="12px"
              bg="rgba(183,121,31,0.08)" border="1px solid rgba(183,121,31,0.25)">
              <Flex align="center" gap={2} mb={1}>
                <FaExclamationTriangle size={12} color={C.warning} />
                <Text fontFamily='var(--font-body)' fontWeight={700} fontSize="sm" color={C.warning}>
                  {t('dashboard.subscription.pastDueTitle')}
                </Text>
              </Flex>
              <Text fontFamily='var(--font-body)' fontSize="xs" color={C.textMuted}
                lineHeight="1.55" mb={2.5}>
                {t('dashboard.subscription.pastDueDesc')}
              </Text>
              <Button size="xs" h="30px" borderRadius="full" color="white"
                bg="rgba(183,121,31,0.85)" _hover={{ bg: C.warning }}
                fontFamily='var(--font-body)' fontWeight={700} fontSize="11px" px={4}
                onClick={() => {
                  const url = contactUrl(getSiteClient(), lang === 'en'
                    ? 'Hi, I have a pending payment on my subscription and would like to sort it out'
                    : 'Hola, tengo un pago pendiente en mi suscripción y quiero resolverlo');
                  if (url) window.open(url, '_blank');
                }}>
                {t('dashboard.subscription.pastDueWhatsapp')}
              </Button>
            </Box>
          )}

          <Separator mb={3} borderColor={C.border} />

          <SimpleGrid columns={2} gap={3} mb={2}>
            {[
              { label: t('dashboard.subscription.periodCurrent'), value: fmt(subscription.current_period_start, locale) },
              { label: t('dashboard.subscription.periodRenewal'), value: fmt(subscription.current_period_end, locale) },
            ].map(({ label, value }) => (
              <Box key={label}>
                <Text fontFamily='var(--font-body)' fontSize="xs" color={C.textMuted} mb={0.5}>{label}</Text>
                <Text fontFamily='var(--font-body)' fontSize="sm" fontWeight={700} color={C.brown}>{value}</Text>
              </Box>
            ))}
          </SimpleGrid>

          {subscription.cancel_at_period_end && (
            <Flex align="center" gap={2} mt={3} p={3} borderRadius="10px"
              bg="rgba(183,121,31,0.08)" border="1px solid rgba(183,121,31,0.25)">
              <FaExclamationTriangle size={12} color={C.warning} />
              <Text fontFamily='var(--font-body)' fontSize="xs" color={C.warning}>
                {t('dashboard.subscription.cancelWarning')}
              </Text>
            </Flex>
          )}

          <Flex justify="space-between" align="center" mt={3}>
            <Text fontFamily='var(--font-heading)' fontSize="2xl"
              color={C.accentDark} letterSpacing="0.04em">
              {formatPrice(parseFloat(subscription.plan.price_eur), lang, 0)}
              <Text as="span" fontFamily='var(--font-body)'
                fontSize="xs" color={C.textMuted} fontWeight={600}>
                {t('plans.subMonth')}
              </Text>
            </Text>

            {/* Cancel / Reactivate button */}
            {subscription.cancel_at_period_end ? (
              <Button
                size="sm" h="34px" borderRadius="full"
                bg={C.btnGrad} color="white"
                fontFamily='var(--font-body)' fontWeight={700} fontSize="xs"
                boxShadow="0 3px 10px color-mix(in srgb, color-mix(in srgb, var(--brand-primary) 60%, var(--brand-dark)) 20%, transparent)"
                _hover={{ opacity: 0.90 }}
                disabled={subCancelLoading}
                onClick={handleReactivateSubscription}
              >
                {subCancelLoading
                  ? <Spinner size="xs" color="white" />
                  : <Flex align="center" gap={1.5}><FaCheckCircle size={10} />{t('dashboard.subscription.reactivateBtn')}</Flex>
                }
              </Button>
            ) : (
              <Button
                size="sm" h="34px" borderRadius="full"
                variant="outline"
                borderColor="rgba(192,57,43,0.35)"
                color={C.danger}
                fontFamily='var(--font-body)' fontWeight={700} fontSize="xs"
                _hover={{ bg: 'rgba(192,57,43,0.06)' }}
                disabled={subCancelLoading}
                onClick={() => setShowSubCancelConfirm(true)}
              >
                {subCancelLoading
                  ? <Spinner size="xs" />
                  : <Flex align="center" gap={1.5}><FaTimes size={10} />{t('dashboard.subscription.cancelBtn')}</Flex>
                }
              </Button>
            )}
          </Flex>

          {/* Cancel confirmation inline box */}
          {showSubCancelConfirm && (
            <Box mt={3} p={3} borderRadius="12px"
              bg="rgba(192,57,43,0.05)" border="1px solid rgba(192,57,43,0.20)">
              <Text fontFamily='var(--font-body)' fontWeight={700} fontSize="sm"
                color={C.danger} mb={1}>
                {t('dashboard.subscription.cancelConfirmTitle')}
              </Text>
              <Text fontFamily='var(--font-body)' fontSize="xs" color={C.textMuted}
                lineHeight="1.55" mb={3}>
                {t('dashboard.subscription.cancelConfirmDesc', {
                  date: new Date(subscription.current_period_end).toLocaleDateString(locale, { day: 'numeric', month: 'long' }),
                })}
              </Text>
              <Flex gap={2}>
                <Button size="xs" h="30px" borderRadius="full"
                  bg={C.danger} color="white"
                  fontFamily='var(--font-body)' fontWeight={700} fontSize="11px"
                  _hover={{ opacity: 0.85 }}
                  disabled={subCancelLoading}
                  onClick={handleCancelSubscription}>
                  {subCancelLoading ? <Spinner size="xs" color="white" /> : t('dashboard.subscription.cancelConfirmBtn')}
                </Button>
                <Button size="xs" h="30px" borderRadius="full"
                  variant="ghost" color={C.textMuted}
                  fontFamily='var(--font-body)' fontWeight={700} fontSize="11px"
                  onClick={() => setShowSubCancelConfirm(false)}>
                  {t('common.back')}
                </Button>
              </Flex>
            </Box>
          )}
        </Card>
      ) : (
        <>
        {/* Si es regular, lo primero que ve aquí es SU recomendación */}
        <MembershipSuggestionCard variant="dashboard" balance={balance} />
        <Card>
          <Box textAlign="center" py={5}>
            <Box w="52px" h="52px" borderRadius="full" mx="auto" mb={4}
              bg="color-mix(in srgb, var(--brand-primary) 10%, transparent)" border={`1px solid ${C.border}`}
              display="flex" alignItems="center" justifyContent="center">
              <FaCrown size={22} color={C.accent} />
            </Box>
            <Text fontFamily='var(--font-heading)' fontSize="xl"
              color={C.brown} letterSpacing="0.04em" mb={2}>
              {t('dashboard.subscription.noSubTitle')}
            </Text>
            <Text fontFamily='var(--font-body)' fontSize="sm" color={C.textMuted} mb={5}
              maxW="260px" mx="auto">
              {t('dashboard.subscription.noSubDesc')}
            </Text>
            <Button h="42px" borderRadius="full" color="white" bg={C.btnGrad}
              fontFamily='var(--font-body)' fontWeight={700} fontSize="sm" px={6}
              boxShadow="0 4px 14px color-mix(in srgb, color-mix(in srgb, var(--brand-primary) 60%, var(--brand-dark)) 22%, transparent)" _hover={{ opacity: 0.90 }}
              onClick={() => { window.location.href = '/checkout?tab=subscription'; }}>
              <Flex align="center" gap={2}><FaArrowRight size={11} />{t('dashboard.subscription.noSubCta')}</Flex>
            </Button>
          </Box>
        </Card>
        </>
      )}

      {/* ── Next Week Auto-booking Preview ─────────────────────────────── */}
      {subscription && !subscription.cancel_at_period_end && (() => {
        const activePrefs = preferences.filter(p => p.is_active);
        const totalCreditsPerClass = activePrefs.reduce((s, p) => s + (p.credits_per_class ?? 1), 0);
        const monthlyNeeded = Math.ceil(totalCreditsPerClass * 4.33);
        const planCredits = subscription.plan.credits;
        const sufficient = planCredits >= monthlyNeeded;
        const missing = monthlyNeeded - planCredits;
        const avgCredits = activePrefs.length > 0 ? totalCreditsPerClass / activePrefs.length : 1;
        const maxClasses = Math.floor(planCredits / avgCredits);

        // Build next week Mon-Sun dates with actual Date objects
        const today = new Date();
        const dow = today.getDay(); // 0=Sun
        const daysToMon = dow === 0 ? 1 : (8 - dow) % 7 || 7;
        const nextMonDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() + daysToMon);
        const WEEK_DAYS = Array.from({ length: 7 }, (_, i) => {
          const d = new Date(nextMonDate.getFullYear(), nextMonDate.getMonth(), nextMonDate.getDate() + i);
          const jsDay = d.getDay(); // 0=Sun,1=Mon…
          // Convert JS weekday → Django weekday (0=Mon … 6=Sun)
          const djangoDay = jsDay === 0 ? 6 : jsDay - 1;
          return {
            date: d,
            djangoDay,
            label: d.toLocaleDateString(locale, { weekday: 'short' }),
            dayNum: d.getDate(),
            monthLabel: d.toLocaleDateString(locale, { month: 'short' }),
          };
        });

        // Group preferences by Django weekday
        const prefsByDay: Record<number, ClassPreference[]> = {};
        activePrefs.forEach(p => {
          (prefsByDay[p.weekday] = prefsByDay[p.weekday] || []).push(p);
        });

        return (
          <Card p={0} overflow="hidden">
            {/* Card header */}
            <Box px={4} pt={4} pb={3}
              borderBottom={`1px solid ${C.border}`}>
              <Flex justify="space-between" align="center">
                <Flex align="center" gap={2}>
                  <FaCalendarWeek size={13} color={C.accentDark} />
                  <Text fontFamily='var(--font-heading)' fontSize="lg"
                    color={C.brown} letterSpacing="0.04em">
                    {t('dashboard.subscription.nextWeekTitle')}
                  </Text>
                </Flex>
                <Box px={2} py={0.5} borderRadius="full"
                  bg="rgba(45,125,70,0.10)" border="1px solid rgba(45,125,70,0.25)">
                  <Text fontFamily='var(--font-body)' fontSize="9px" fontWeight={700}
                    color={C.success} letterSpacing="0.10em">
                    {t('dashboard.subscription.autoBookBadge')}
                  </Text>
                </Box>
              </Flex>

              {/* Cron schedule info strip */}
              <Flex gap={4} mt={2.5} pt={2.5} borderTop={`1px solid ${C.border}`} flexWrap="wrap">
                <Box>
                  <Text fontFamily='var(--font-body)' fontSize="10px" color={C.textMuted} mb={0.5}>
                    {lang === 'en' ? 'Auto-books on' : 'Se reserva el'}
                  </Text>
                  <Text fontFamily='var(--font-body)' fontSize="xs" fontWeight={700} color={C.brown}>
                    {lang === 'en' ? `Sun. ${autoBookDates.nextSundayStr}` : `Dom. ${autoBookDates.nextSundayStr}`}
                  </Text>
                </Box>
                <Box>
                  <Text fontFamily='var(--font-body)' fontSize="10px"
                    color={autoBookDates.deadlineIsToday ? C.warning : C.textMuted} mb={0.5}>
                    {lang === 'en' ? 'Change deadline' : 'Límite de cambios'}
                  </Text>
                  <Text fontFamily='var(--font-body)' fontSize="xs" fontWeight={700}
                    color={autoBookDates.deadlineIsToday ? C.warning : C.brown}>
                    {autoBookDates.deadlineIsToday
                      ? (lang === 'en' ? '⚠ Today!' : '⚠ ¡Hoy!')
                      : `${lang === 'en' ? 'Sat.' : 'Sáb.'} ${autoBookDates.saturdayStr}`}
                  </Text>
                </Box>
                {activePrefs.length > 0 && (
                  <Box ml="auto">
                    <Text fontFamily='var(--font-body)' fontSize="10px" color={C.textMuted} mb={0.5}>
                      {lang === 'en' ? 'Credits/week' : 'Créditos/semana'}
                    </Text>
                    <Flex align="center" gap={1}>
                      {sufficient
                        ? <FaCheckCircle size={9} color={C.success} />
                        : <FaExclamationTriangle size={9} color={C.warning} />}
                      <Text fontFamily='var(--font-body)' fontSize="xs" fontWeight={700}
                        color={sufficient ? C.success : C.warning}>
                        {totalCreditsPerClass} / {planCredits}
                      </Text>
                    </Flex>
                  </Box>
                )}
              </Flex>

              {/* Deadline urgent banner */}
              {autoBookDates.deadlineIsToday && (
                <Flex align="center" gap={1.5} mt={2} p={2} borderRadius="8px"
                  bg="rgba(183,121,31,0.08)" border="1px solid rgba(183,121,31,0.20)">
                  <FaExclamationTriangle size={10} color={C.warning} />
                  <Text fontFamily='var(--font-body)' fontSize="xs" color={C.warning} fontWeight={600}>
                    {t('checkout.subActivatedDeadlineUrgent')}
                  </Text>
                </Flex>
              )}
            </Box>

            {/* Week timeline */}
            {activePrefs.length > 0 ? (
              <Box px={4} py={3}>
                <VStack gap={0} align="stretch">
                  {WEEK_DAYS.map(({ date, djangoDay, label, dayNum, monthLabel }, wIdx) => {
                    const dayPrefs = prefsByDay[djangoDay] || [];
                    const isWeekend = djangoDay >= 5; // Sat(5), Sun(6)
                    const hasClass = dayPrefs.length > 0;
                    return (
                      <Flex key={djangoDay} gap={0} align="stretch"
                        mb={wIdx < 6 ? 0 : 0}>
                        {/* Day column */}
                        <Box w="52px" flexShrink={0} pt={2} pb={wIdx < 6 ? 2 : 0}>
                          <Text fontFamily='var(--font-body)' fontSize="9px"
                            fontWeight={700} color={hasClass ? C.accentDark : C.textMuted}
                            textTransform="uppercase" letterSpacing="0.10em">
                            {label}
                          </Text>
                          <Text fontFamily='var(--font-heading)' fontSize="xl"
                            color={hasClass ? C.brown : 'color-mix(in srgb, var(--brand-primary) 35%, transparent)'}
                            lineHeight="1.1">
                            {dayNum}
                          </Text>
                          <Text fontFamily='var(--font-body)' fontSize="9px" color={C.textMuted}>
                            {monthLabel}
                          </Text>
                        </Box>

                        {/* Timeline line + classes */}
                        <Flex flex={1} gap={0} align="stretch" pl={3}
                          borderLeft={`2px solid ${hasClass ? C.borderStrong : 'color-mix(in srgb, var(--brand-primary) 12%, transparent)'}`}
                          pt={2} pb={wIdx < 6 ? 2 : 0} ml={2}>
                          {hasClass ? (
                            <VStack gap={1.5} align="stretch" w="full">
                              {dayPrefs.map(pref => (
                                <Flex key={pref.id} align="center" gap={2}
                                  p={2.5} borderRadius="10px"
                                  bg="color-mix(in srgb, var(--brand-primary) 7%, transparent)"
                                  border={`1px solid ${C.borderStrong}`}
                                  transition="all 0.15s ease"
                                  _hover={{ bg: 'color-mix(in srgb, var(--brand-primary) 13%, transparent)', transform: 'translateX(2px)' }}
                                  cursor="default">
                                  <Box w="6px" h="6px" borderRadius="full" flexShrink={0}
                                    bg={C.accentDark} />
                                  <Box flex={1} minW={0}>
                                    <Text fontFamily='var(--font-body)' fontWeight={700}
                                      fontSize="xs" color={C.brown}
                                      style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                      {tr(pref, 'schedule_title', lang)}
                                    </Text>
                                    <Flex align="center" gap={1.5} mt={0.5}>
                                      <FaClock size={8} color={C.textMuted} />
                                      <Text fontFamily='var(--font-body)' fontSize="10px" color={C.textMuted}>
                                        {pref.start_time?.slice(0, 5)}
                                      </Text>
                                      {pref.room_name && (
                                        <>
                                          <Text fontFamily='var(--font-body)' fontSize="10px"
                                            color="color-mix(in srgb, var(--brand-primary) 50%, transparent)">·</Text>
                                          <Text fontFamily='var(--font-body)' fontSize="10px" color={C.textMuted}>
                                            {tr(pref, 'room_name', lang)}
                                          </Text>
                                        </>
                                      )}
                                      <Text fontFamily='var(--font-body)' fontSize="9px"
                                        color={C.textMuted} ml="auto">
                                        {pref.credits_per_class ?? 1} {t('checkout.creditsUnit')}
                                      </Text>
                                    </Flex>
                                  </Box>
                                  <IconButton
                                    aria-label={t('dashboard.clases.removePref')}
                                    size="xs" variant="ghost"
                                    color={C.textMuted}
                                    _hover={{ color: C.danger, bg: 'rgba(192,57,43,0.08)' }}
                                    cursor="pointer"
                                    onClick={() => handleRemovePreference(pref.id)}>
                                    <FaTimes size={9} />
                                  </IconButton>
                                </Flex>
                              ))}
                            </VStack>
                          ) : (
                            <Flex align="center" h="40px">
                              <Text fontFamily='var(--font-body)' fontSize="11px"
                                color="color-mix(in srgb, var(--brand-primary) 40%, transparent)"
                                fontStyle="italic">
                                {isWeekend
                                  ? (lang === 'en' ? 'Rest day' : 'Descanso')
                                  : (lang === 'en' ? 'No class' : 'Sin clase')}
                              </Text>
                            </Flex>
                          )}
                        </Flex>
                      </Flex>
                    );
                  })}
                </VStack>
              </Box>
            ) : (
              <Box px={4} py={5} textAlign="center">
                <Box w="40px" h="40px" borderRadius="full" mx="auto" mb={3}
                  bg="color-mix(in srgb, var(--brand-primary) 8%, transparent)" display="flex" alignItems="center" justifyContent="center">
                  <FaCalendarDay size={16} color={C.accent} />
                </Box>
                <Text fontFamily='var(--font-body)' fontSize="sm" color={C.textMuted}
                  lineHeight="1.65" mb={3}>
                  {t('dashboard.subscription.autoBookNoneDesc')}
                </Text>
                <Button size="sm" h="34px" borderRadius="full"
                  bg={C.btnGrad} color="white"
                  fontFamily='var(--font-body)' fontWeight={700} fontSize="xs"
                  boxShadow="0 3px 10px color-mix(in srgb, color-mix(in srgb, var(--brand-primary) 60%, var(--brand-dark)) 20%, transparent)"
                  _hover={{ opacity: 0.90 }}
                  onClick={() => setTab('clases')}>
                  <Flex align="center" gap={1.5}>
                    <FaPlus size={10} />
                    {t('dashboard.subscription.autoBookCta')}
                  </Flex>
                </Button>
              </Box>
            )}

            {/* Footer: add class toggle + credits summary */}
            <Flex px={4} py={3} borderTop={`1px solid ${C.border}`}
              justify="space-between" align="center" flexWrap="wrap" gap={2}>
              <Button size="xs" h="30px" borderRadius="full"
                bg={showAddPrefSub ? C.btnGrad : 'transparent'}
                color={showAddPrefSub ? 'white' : C.accentDark}
                border={`1px solid ${showAddPrefSub ? 'transparent' : C.borderStrong}`}
                fontFamily='var(--font-body)' fontWeight={700} fontSize="11px"
                _hover={{ opacity: 0.85 }}
                cursor="pointer"
                onClick={() => { setShowAddPrefSub(v => !v); if (!showAddPrefSub) loadSchedules(); }}>
                <Flex align="center" gap={1.5}>
                  {showAddPrefSub ? <FaTimes size={9} /> : <FaPlus size={9} />}
                  {showAddPrefSub
                    ? (lang === 'en' ? 'Close' : 'Cerrar')
                    : (lang === 'en' ? 'Add class' : 'Añadir clase')}
                </Flex>
              </Button>
              {activePrefs.length > 0 && (
                <Flex align="center" gap={1.5}>
                  {sufficient ? (
                    <Flex align="center" gap={1}>
                      <FaCheckCircle size={10} color={C.success} />
                      <Text fontFamily='var(--font-body)' fontSize="10px"
                        fontWeight={700} color={C.success}>
                        {t('dashboard.subscription.creditsSufficient')}
                      </Text>
                    </Flex>
                  ) : (
                    <Flex align="center" gap={1}>
                      <FaExclamationTriangle size={10} color={C.warning} />
                      <Text fontFamily='var(--font-body)' fontSize="10px"
                        fontWeight={700} color={C.warning}>
                        {t('dashboard.subscription.creditsInsufficient', { missing })}
                      </Text>
                    </Flex>
                  )}
                </Flex>
              )}
            </Flex>

            {/* Inline add-class panel */}
            <AnimatePresence>
              {showAddPrefSub && (
                <MotionBox
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.22 } as any}
                  style={{ overflow: 'hidden' }}>
                  <Box px={4} pb={4} pt={1} borderTop={`1px solid ${C.border}`}
                    bg="color-mix(in srgb, var(--brand-bg) 55%, transparent)">
                    <Text fontFamily='var(--font-body)' fontSize="xs" fontWeight={700}
                      color={C.textMuted} textTransform="uppercase" letterSpacing="0.10em"
                      mt={3} mb={2}>
                      {lang === 'en' ? 'Choose recurring classes' : 'Elegir clases recurrentes'}
                    </Text>
                    {schedulesLoading ? (
                      <Flex justify="center" py={5}><Spinner color={C.accent} /></Flex>
                    ) : schedules.length === 0 ? (
                      <Text fontFamily='var(--font-body)' fontSize="sm" color={C.textMuted}
                        textAlign="center" py={4}>
                        {t('dashboard.clases.noSchedules')}
                      </Text>
                    ) : (
                      Object.entries(schedulesByDay)
                        .sort(([a], [b]) => parseInt(a) - parseInt(b))
                        .map(([day, dayScheds]) => (
                          <Box key={day} mb={3}>
                            <Text fontFamily='var(--font-body)' fontSize="xs" fontWeight={700}
                              color={C.textMuted} textTransform="uppercase" letterSpacing="0.10em" mb={1.5}>
                              {weekdayName(parseInt(day), lang)}
                            </Text>
                            <Stack gap={1.5}>
                              {dayScheds.map(s => {
                                const added = existingScheduleIds.has(s.id);
                                const isAdding = addingScheduleId === s.id;
                                return (
                                  <Flex key={s.id} align="center" justify="space-between"
                                    p={2.5} borderRadius="10px"
                                    bg={added ? 'color-mix(in srgb, var(--brand-primary) 8%, transparent)' : 'rgba(255,255,255,0.70)'}
                                    border={`1px solid ${added ? C.borderStrong : C.border}`}
                                    transition="all 0.15s ease">
                                    <Box>
                                      <Text fontFamily='var(--font-body)' fontWeight={700}
                                        fontSize="xs" color={C.brown}>
                                        {tr(s.class_type, 'title', lang) || t('dashboard.clases.classFallback')}
                                      </Text>
                                      <Text fontFamily='var(--font-body)' fontSize="10px" color={C.textMuted}>
                                        {s.start_time?.slice(0, 5)} – {s.end_time?.slice(0, 5)}
                                        {s.room?.name ? ` · ${roomName(s.room, lang)}` : ''}
                                      </Text>
                                    </Box>
                                    {added ? (
                                      <Flex align="center" gap={1}>
                                        <FaCheckCircle size={12} color={C.accentDark} />
                                        <IconButton
                                          aria-label={t('dashboard.clases.removePref')}
                                          size="xs" variant="ghost"
                                          color={C.textMuted}
                                          _hover={{ color: C.danger }}
                                          onClick={() => handleRemovePreference(
                                            preferences.find(p => p.schedule === s.id)?.id ?? 0
                                          )}>
                                          <FaTimes size={9} />
                                        </IconButton>
                                      </Flex>
                                    ) : (
                                      <Button size="xs" h="26px" borderRadius="full"
                                        color="white" bg={C.btnGrad}
                                        fontFamily='var(--font-body)' fontWeight={700} fontSize="10px"
                                        disabled={isAdding} _hover={{ opacity: 0.90 }}
                                        onClick={() => handleAddPreference(s.id)}>
                                        {isAdding ? <Spinner size="xs" color="white" /> : t('dashboard.clases.addItemBtn')}
                                      </Button>
                                    )}
                                  </Flex>
                                );
                              })}
                            </Stack>
                          </Box>
                        ))
                    )}
                  </Box>
                </MotionBox>
              )}
            </AnimatePresence>
          </Card>
        );
      })()}

      {/* Auto-booking paused notice (when cancel_at_period_end) */}
      {subscription && subscription.cancel_at_period_end && (
        <Box p={4} borderRadius="16px"
          bg="rgba(183,121,31,0.06)" border="1px solid rgba(183,121,31,0.22)">
          <Flex align="center" gap={2} mb={1}>
            <FaExclamationTriangle size={12} color={C.warning} />
            <Text fontFamily='var(--font-body)' fontWeight={700} fontSize="sm" color={C.warning}>
              {lang === 'en' ? 'Auto-booking paused' : 'Reserva automática pausada'}
            </Text>
          </Flex>
          <Text fontFamily='var(--font-body)' fontSize="xs" color={C.textMuted} lineHeight="1.6">
            {lang === 'en'
              ? 'Auto-booking is inactive because your subscription is set to cancel. Reactivate your subscription to resume automatic reservations.'
              : 'La reserva automática está inactiva porque tu suscripción está configurada para cancelarse. Reactiva tu suscripción para reanudar las reservas automáticas.'}
          </Text>
        </Box>
      )}

      {/* How it works */}
      <Card>
        <Text fontFamily='var(--font-heading)' fontSize="lg" color={C.brown}
          letterSpacing="0.04em" mb={4}>
          {t('dashboard.subscription.howTitle')}
        </Text>
        {[
          { step: '01', title: t('dashboard.subscription.step01Title'), desc: t('dashboard.subscription.step01Desc') },
          { step: '02', title: t('dashboard.subscription.step02Title'), desc: t('dashboard.subscription.step02Desc') },
          { step: '03', title: t('dashboard.subscription.step03Title'), desc: t('dashboard.subscription.step03Desc') },
        ].map(({ step, title, desc }, idx) => (
          <Flex key={step} gap={3} mb={idx < 2 ? 3 : 0} align="flex-start">
            <Box flexShrink={0} w="30px" h="30px" borderRadius="full"
              bg={C.btnGrad} display="flex" alignItems="center" justifyContent="center"
              boxShadow="0 3px 8px color-mix(in srgb, color-mix(in srgb, var(--brand-primary) 60%, var(--brand-dark)) 20%, transparent)">
              <Text fontFamily='var(--font-heading)' fontSize="sm" color="white">{step}</Text>
            </Box>
            <Box>
              <Text fontFamily='var(--font-body)' fontWeight={700} fontSize="sm" color={C.brown}>{title}</Text>
              <Text fontFamily='var(--font-body)' fontSize="xs" color={C.textMuted} lineHeight="1.55">{desc}</Text>
            </Box>
          </Flex>
        ))}
      </Card>
    </VStack>
  );

  // ── Tab Perfil ─────────────────────────────────────────────────────────────
  const renderPerfil = () => (
    <VStack gap={4} align="stretch">
      <InstallAppCTA />
      {/* Profile hero */}
      <Box bg={C.btnGrad} borderRadius="20px" p={5} position="relative" overflow="hidden">
        <Box position="absolute" top="-20px" right="-15px" w="90px" h="90px"
          borderRadius="full" bg="rgba(255,255,255,0.07)" />
        <Flex align="center" gap={3} position="relative">
          <Box w="46px" h="46px" borderRadius="full"
            bg="rgba(255,255,255,0.18)" border="2px solid rgba(255,255,255,0.30)"
            display="flex" alignItems="center" justifyContent="center">
            <FaUser size={18} color="white" />
          </Box>
          <Box>
            <Text fontFamily='var(--font-heading)' fontSize="xl" color="white"
              letterSpacing="0.04em" lineHeight="1.1">
              {t('dashboard.tabs.perfil')}
            </Text>
            <Text fontFamily='var(--font-body)' fontSize="xs" color="rgba(255,255,255,0.75)">
              {t('dashboard.perfil.heroSub')}
            </Text>
          </Box>
        </Flex>
      </Box>

      {/* Stats */}
      <SimpleGrid columns={2} gap={3}>
        {[
          { label: t('dashboard.perfil.statsAttended'), value: pastBookings.filter(b => b.status === 'attended').length },
          { label: t('dashboard.perfil.statsFavorites'), value: preferences.filter(p => p.is_active).length },
        ].map(({ label, value }) => (
          <Card key={label} p={4}>
            <Text fontFamily='var(--font-body)' fontSize="10px" color={C.textMuted}
              fontWeight={700} textTransform="uppercase" letterSpacing="0.08em" mb={1}>{label}</Text>
            <Text fontFamily='var(--font-heading)' fontSize="3xl" color={C.brown} lineHeight="1">{value}</Text>
          </Card>
        ))}
      </SimpleGrid>

      {/* Quick actions */}
      <Card>
        <Text fontFamily='var(--font-heading)' fontSize="xl" color={C.brown}
          letterSpacing="0.04em" mb={3}>
          {t('dashboard.perfil.actionsTitle')}
        </Text>
        <VStack gap={2} align="stretch">
          {[
            { label: t('dashboard.perfil.actionClasses'), href: t('nav.items.classes.href') || '/classes', icon: <FaCalendarAlt size={12} /> },
            { label: t('dashboard.perfil.actionCalendar'), href: '/calendar',          icon: <FaCalendarCheck size={12} /> },
            { label: t('dashboard.perfil.actionBuy'),     href: '/checkout',           icon: <FaBolt size={12} /> },
            { label: t('dashboard.perfil.actionPrefs'),   href: '/updatePreferences',  icon: <FaEdit size={12} /> },
          ].map(({ label, href, icon }) => (
            <Box key={label} as="a" href={href}
              display="flex" alignItems="center" gap={3} p={3} borderRadius="12px"
              bg="rgba(255,255,255,0.60)" border={`1px solid ${C.border}`}
              transition="all 0.18s ease" cursor="pointer"
              _hover={{ bg: 'color-mix(in srgb, var(--brand-primary) 8%, transparent)', borderColor: C.borderStrong, paddingLeft: '14px' }}>
              <Box color={C.accent} flexShrink={0}>{icon}</Box>
              <Text fontFamily='var(--font-body)' fontSize="sm" fontWeight={600} color={C.brown} flex={1}>
                {label}
              </Text>
              <Text color={C.accent} fontSize="sm" flexShrink={0}>→</Text>
            </Box>
          ))}
        </VStack>
      </Card>

      {/* Active subscription mini card */}
      {subscription && (
        <Box bg="color-mix(in srgb, var(--brand-primary) 7%, transparent)" borderRadius="16px" p={4}
          border={`1px solid ${C.borderStrong}`}>
          <Flex justify="space-between" align="center">
            <Flex align="center" gap={2}>
              <FaCrown size={12} color={C.accentDark} />
              <Box>
                <Text fontFamily='var(--font-body)' fontWeight={700} fontSize="sm" color={C.brown}>
                  {planDisplayName(subscription.plan, lang)}
                </Text>
                <Text fontFamily='var(--font-body)' fontSize="11px" color={C.textMuted}>
                  {t('dashboard.perfil.subLabel', { credits: subscription.plan.credits })}
                </Text>
              </Box>
            </Flex>
            <Button size="xs" h="30px" borderRadius="full" variant="outline"
              borderColor={C.borderStrong} color={C.textMuted}
              fontFamily='var(--font-body)' fontWeight={700} fontSize="10px"
              _hover={{ bg: 'color-mix(in srgb, var(--brand-primary) 8%, transparent)' }}
              onClick={() => setTab('suscripcion')}>
              {t('dashboard.perfil.subDetails')}
            </Button>
          </Flex>
        </Box>
      )}
    </VStack>
  );

  // ── Booking detail dialog ──────────────────────────────────────────────────
  const renderBookingDialog = () => (
    <Dialog.Root open={!!selectedBooking}
      onOpenChange={d => { if (!d.open) setSelectedBooking(null); }}
      placement="center" motionPreset="slide-in-bottom">
      <Portal>
        <Dialog.Backdrop bg="color-mix(in srgb, var(--brand-dark) 55%, transparent)" backdropFilter="blur(6px)" />
        <Dialog.Positioner>
          <Dialog.Content borderRadius="24px" overflow="hidden"
            bg="linear-gradient(160deg, color-mix(in srgb, var(--brand-primary) 22%, white) 0%, var(--brand-bg) 100%)"
            border={`1px solid ${C.border}`}
            boxShadow="0 24px 72px color-mix(in srgb, var(--brand-dark) 20%, transparent)"
            maxW="360px" w="full" mx={4}>
            {selectedBooking && (
              <>
                <Box bg={C.btnGrad} p={5}>
                  <Text fontFamily='var(--font-heading)' fontSize="2xl"
                    color="white" letterSpacing="0.04em" lineHeight="1.1">
                    {tr(selectedBooking, 'what', lang)}
                  </Text>
                  <Box px={2} py={0.5} borderRadius="full" display="inline-block"
                    bg="rgba(255,255,255,0.18)" mt={1}>
                    <Text fontFamily='var(--font-body)' fontSize="10px"
                      fontWeight={700} color="rgba(255,255,255,0.90)" letterSpacing="0.08em">
                      {getStatusLabel(selectedBooking.status)}
                    </Text>
                  </Box>
                </Box>

                <Dialog.Body p={5}>
                  <VStack align="stretch" gap={3}>
                    {[
                      {
                        icon: <FaCalendarAlt size={12} color={C.accent} />,
                        text: new Date(selectedBooking.start_datetime).toLocaleDateString(locale, {
                          weekday: 'long', day: 'numeric', month: 'long',
                        }),
                      },
                      {
                        icon: <FaClock size={12} color={C.accent} />,
                        text: `${fmtTime(selectedBooking.start_datetime, locale)} – ${fmtTime(selectedBooking.end_datetime, locale)}`,
                      },
                      ...(selectedBooking.room_name
                        ? [{ icon: <FaMapMarkerAlt size={12} color={C.accent} />, text: tr(selectedBooking, 'room_name', lang) }]
                        : []),
                      ...(selectedBooking.teacher
                        ? [{ icon: <FaUser size={12} color={C.accent} />, text: selectedBooking.teacher }]
                        : []),
                    ].map(({ icon, text }, i) => (
                      <Flex key={i} align="center" gap={2.5}
                        p={3} borderRadius="10px" bg="rgba(255,255,255,0.55)"
                        border={`1px solid ${C.border}`}>
                        {icon}
                        <Text fontFamily='var(--font-body)' fontSize="sm" color={C.brown} fontWeight={600}>
                          {text}
                        </Text>
                      </Flex>
                    ))}
                  </VStack>

                  {canCancelBooking(selectedBooking.start_datetime) && selectedBooking.status === 'reserved' && (
                    <Button w="full" h="42px" mt={4} borderRadius="full"
                      variant="outline" borderColor="rgba(192,57,43,0.30)"
                      color={C.danger}
                      fontFamily='var(--font-body)' fontWeight={700} fontSize="sm"
                      _hover={{ bg: 'rgba(192,57,43,0.06)' }}
                      onClick={async () => {
                        const id = selectedBooking.id;
                        setSelectedBooking(null);
                        await handleCancelBooking(id);
                      }}>
                      <Flex align="center" gap={2}><FaTimes size={11} />{t('dashboard.dialog.cancel')}</Flex>
                    </Button>
                  )}
                </Dialog.Body>

                <Dialog.CloseTrigger asChild position="absolute" top={3} right={3}>
                  <CloseButton size="sm" color="white"
                    _hover={{ bg: 'rgba(255,255,255,0.18)' }} />
                </Dialog.CloseTrigger>
              </>
            )}
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    // El padding inferior móvil lo aporta el BottomNav global del sitio
    // (inyecta padding-bottom en el body); aquí solo un respiro extra.
    <Box bg={C.bg} minH="100vh" pb={{ base: 8, md: 16 }}>
      <Toaster />
      {renderBookingDialog()}

      {/* Header */}
      <Box pt={{ base: 6, md: 10 }} pb={6} px={{ base: 4, md: 8 }} maxW="900px" mx="auto">
        <MotionBox initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.38 } as any}>
          <Flex justify="space-between" align="flex-end" flexWrap="wrap" gap={3}>
            <Box>
              <Text fontFamily='var(--font-body)' fontSize="sm"
                color={C.textMuted} fontWeight={600} mb={0.5}>
                {new Date().toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' })}
              </Text>
              <Text fontFamily='var(--font-heading)'
                fontSize={{ base: '3xl', md: '5xl' }}
                color={C.brown} letterSpacing="wide" lineHeight="1">
                {t('dashboard.title')}
              </Text>
              <Box mt={2} h="2px" w="70px" borderRadius="full"
                bg="linear-gradient(90deg, color-mix(in srgb, var(--brand-primary) 70%, transparent), transparent)" />
            </Box>

            {/* Balance pill */}
            {balance !== null && (
              <Box px={4} py={2} borderRadius="full"
                bg={C.card} border={`1px solid ${C.border}`}
                boxShadow="0 2px 12px color-mix(in srgb, var(--brand-dark) 6%, transparent)">
                <Flex align="baseline" gap={1.5}>
                  <Text fontFamily='var(--font-heading)' fontSize="xl"
                    color={C.accentDark} lineHeight="1">
                    {balance.toFixed(1)}
                  </Text>
                  <Text fontFamily='var(--font-body)' fontSize="xs"
                    color={C.textMuted} fontWeight={600}>
                    {t('dashboard.credits')}
                  </Text>
                </Flex>
              </Box>
            )}
          </Flex>
        </MotionBox>
      </Box>

      <Box maxW="900px" mx="auto" px={{ base: 4, md: 8 }}>
        {/* Aviso GLOBAL de impago: visible en todas las pestañas (en la de
            suscripción ya está el detalle, así que ahí no se duplica). */}
        {subscription?.status === 'past_due' && tab !== 'suscripcion' && (
          <MotionBox initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 } as any} mb={5}>
            <Flex align="center" gap={3} p={3.5} borderRadius="14px"
              bg="rgba(183,121,31,0.10)" border="1px solid rgba(183,121,31,0.30)"
              role="status">
              <Box flexShrink={0}><FaExclamationTriangle size={15} color={C.warning} /></Box>
              <Box flex={1} minW={0}>
                <Text fontFamily='var(--font-body)' fontWeight={700}
                  fontSize="sm" color={C.warning} lineHeight="1.3">
                  {t('dashboard.clases.pastDueTitle')}
                </Text>
                <Text fontFamily='var(--font-body)' fontSize="xs" color={C.textMuted}>
                  {t('dashboard.clases.pastDueDesc')}
                </Text>
              </Box>
              <Button size="xs" h="32px" px={4} borderRadius="full" color="white" flexShrink={0}
                bg="rgba(183,121,31,0.85)" _hover={{ bg: C.warning }}
                fontFamily='var(--font-body)' fontWeight={700} fontSize="11px"
                onClick={() => setTab('suscripcion')}>
                {t('dashboard.clases.pastDueCta')}
              </Button>
            </Flex>
          </MotionBox>
        )}

        {/* Tira de secciones del panel — visible también en móvil (deslizable).
            Es el control segmentado de "Mi cuenta"; la navegación global vive
            en el BottomNav del sitio, así nunca hay dos barras inferiores. */}
        <Box mb={{ base: 4, md: 7 }}>
          <Flex gap={1.5} p={1.5}
            bg="rgba(255,255,255,0.55)" borderRadius="full"
            border={`1px solid ${C.border}`} w={{ base: 'full', md: 'fit-content' }}
            boxShadow="0 2px 14px color-mix(in srgb, var(--brand-dark) 7%, transparent)"
            overflowX="auto"
            css={{ scrollbarWidth: 'none', '&::-webkit-scrollbar': { display: 'none' } }}>
            {TABS.map(t => (
              <Button key={t.key} size="sm" borderRadius="full"
                px={{ base: 3, md: 4 }} flexShrink={0} flex={{ base: 1, md: '0 0 auto' }}
                minH="42px"
                bg={tab === t.key ? C.btnGrad : 'transparent'}
                color={tab === t.key ? 'white' : C.textMuted}
                fontFamily='var(--font-body)' fontWeight={700}
                fontSize={{ base: 'xs', md: 'sm' }}
                boxShadow={tab === t.key ? '0 3px 12px color-mix(in srgb, color-mix(in srgb, var(--brand-primary) 60%, var(--brand-dark)) 25%, transparent)' : 'none'}
                _hover={{ bg: tab === t.key ? C.btnGrad : 'color-mix(in srgb, var(--brand-primary) 10%, transparent)' }}
                onClick={() => setTab(t.key)}
                aria-current={tab === t.key ? 'page' : undefined}>
                <Flex align="center" gap={1.5}>{t.icon}
                  <Box as="span" display={{ base: tab === t.key ? 'inline' : 'none', sm: 'inline' }}>
                    {t.label.split(' ').pop()}
                  </Box>
                </Flex>
              </Button>
            ))}
          </Flex>
        </Box>

        {/* Content */}
        <AnimatePresence mode="wait">
          <MotionBox key={tab}
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.22 } as any}>
            {tab === 'agenda'      && renderAgenda()}
            {tab === 'clases'      && renderClases()}
            {tab === 'suscripcion' && renderSuscripcion()}
            {tab === 'perfil'      && renderPerfil()}
          </MotionBox>
        </AnimatePresence>
      </Box>

      {/* La barra inferior propia del panel se eliminó: en móvil chocaba
          (apilada) con el BottomNav global del sitio. Ahora hay UNA sola
          barra inferior (la global, con "Mi cuenta" activo) y las secciones
          del panel viven en la tira de píldoras de arriba, también en móvil. */}
    </Box>
  );
}

export default function MemberDashboard() {
  return <Chakra><MemberDashboardInner /></Chakra>;
}
