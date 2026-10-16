"use client";

import React, { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import {
  Box, Flex, Text, VStack, Button, Input, Field,
  Alert, IconButton, Spinner, Stack, Separator,
  Dialog, Portal, CloseButton, SimpleGrid,
} from '@chakra-ui/react';
import { Icon } from './ui/Icon';
import { motion } from 'framer-motion';
import Chakra from './ChakraProvider';
import { requestInstallPrompt, InstallInlineHint } from './InstallAppBanner';
import EmailVerifyCard from './EmailVerifyCard';
import MembershipSuggestionCard from './MembershipSuggestionCard';
import { useCartStore, type CartItem } from './stores/car.store';
import { useT, formatPrice } from '../i18n';
import { useLangStore } from './stores/lang.store';
import { getPeriodKey, planDisplayName } from '../utils/planUtils';
import { tr } from '../utils/localized';
import { fmtDate, fmtTime } from '../utils/formatDate';
import StripeEmbeddedForm from './StripeEmbeddedForm';
import StripePlanForm from './StripePlanForm';
import { toaster } from './ui/toaster';
import { Toaster } from './ui/toaster';
import AuthEntrypoint from './AuthDialog';
import { PhoneInput } from 'react-international-phone';
import 'react-international-phone/style.css';
import SpamWarning from './SpamWarning';

import { optimizedImage, withOriginalFallback } from '../utils/img';
import { API_ROOT } from '../config';
import PaymentsDisabledNotice from './PaymentsDisabledNotice';
import GuestStudioBooking from './GuestStudioBooking';
import { paymentsEnabled } from '../utils/payments';
import { getSiteClient } from '../lib/site';
import { hashId, track } from '../lib/tracking';
import { joinWaitlist } from '../lib/booking';
import { clearSession } from '../utils/session';
const MotionBox = motion(Box as any);

// Paleta del checkout: solo tokens del estilo (presets.css). Los botones
// principales usan la clase .sk-btn; los campos, .sk-input.
const C = {
  bg: 'var(--section-bg)',
  card: 'var(--surface)',
  accent: 'var(--accent-text)',     // primario como TEXTO
  accentDark: 'var(--accent)',      // primario como icono / borde / relleno
  brown: 'var(--page-text)',
  heading: 'var(--heading-color)',
  textMuted: 'var(--text-muted)',
  border: 'var(--border-neutral)',
  // "olive" — acento de suscripción/ahorro → color de éxito del estilo
  olive: 'var(--success)',
  oliveTint: 'var(--success-soft)',
  oliveBorder: 'color-mix(in srgb, var(--success) 22%, transparent)',
};

/** Tinte del color de éxito del estilo (sustituye a los rgba verdes/oliva fijos). */
const successMix = (pct: number) => `color-mix(in srgb, var(--success) ${pct}%, transparent)`;

interface ApiPlan {
  id: number; name: string; credits: number;
  price_eur: string; is_active: boolean;
  type: 'pack' | 'sub'; description: string | null;
  credits_expire_days: number | null;
  saving: string | null;
}

interface RecurringSchedule {
  id: number;
  weekday: number | null;
  start_time: string | null;
  end_time: string | null;
  is_recurrent?: boolean;
  class_type?: { id: number; title: string; title_en?: string; name?: string };
  override_instructor?: { id: number; name: string } | null;
}

const API_BASE = `${API_ROOT}/`;

// ── CartItemRow ──────────────────────────────────────────────────────────────

function CartItemRow({ item }: { item: CartItem }) {
  const t = useT();
  const lang = useLangStore(s => s.lang);
  const locale = lang === 'en' ? 'en-GB' : 'es-ES';
  const removeItem = useCartStore(s => s.removeItem);
  return (
    <Flex align="center" gap={3} py={2.5}
      borderBottom="1px solid" borderColor={C.border}>
      <Box as="img" src={optimizedImage(item.image, 256) || '/placeholder-class.svg'} onError={withOriginalFallback(item.image)} alt={tr(item, 'title', lang)}
        w="50px" h="50px" borderRadius="var(--radius-input)" flexShrink={0}
        style={{ objectFit: 'cover' }} />
      <Box flex={1} minW={0}>
        <Text fontFamily='var(--font-body)' fontWeight={700}
          fontSize="sm" color={C.brown}
          style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
          {tr(item, 'title', lang)}
        </Text>
        <Text fontFamily='var(--font-body)' fontSize="xs" color={C.textMuted}>
          {fmtDate(item.sessionDate, locale, { day:'numeric', month:'short' })}
          {' · '}
          {fmtTime(item.sessionDate, locale, { hour:'2-digit', minute:'2-digit' })}
        </Text>
        <Text fontFamily='var(--font-body)' fontSize="xs"
          color={C.accent} fontWeight={600}>
          {item.credits} {item.credits !== 1 ? t('cart.credits') : t('cart.credit')}
        </Text>
      </Box>
      <IconButton aria-label={t('checkout.deleteLabel')} variant="ghost" size="sm"
        color={C.textMuted} onClick={() => removeItem(item.id)}>
        <Icon name="trash" size={11} />
      </IconButton>
    </Flex>
  );
}

// ── PlanCard ─────────────────────────────────────────────────────────────────

function PlanCard({ plan, selected, onSelect }: {
  plan: ApiPlan; selected: boolean; onSelect: () => void;
}) {
  const t = useT();
  const lang = useLangStore(s => s.lang);
  const isSub = plan.type === 'sub';
  const periodKey = isSub ? getPeriodKey(plan.credits_expire_days) : null;
  const priceSuffix = periodKey ? t(`plans.subPeriodSuffix_${periodKey}`) : '';
  const periodLabel = periodKey ? t(`plans.subRenewal_${periodKey}`) : '';

  return (
    <Box as="button" type="button" onClick={onSelect} w="full" textAlign="left"
      borderRadius="var(--radius-card)" p={4} cursor="pointer" h="88px"
      border={`2px solid ${selected ? C.accentDark : C.border}`}
      bg={selected ? 'var(--accent-soft)' : C.card}
      boxShadow={selected ? '0 0 0 3px var(--accent-soft)' : 'var(--shadow-card)'}
      transition="all 0.22s ease"
    >
      <Flex justify="space-between" align="center" h="full">
        <VStack align="start" gap={0.5} flex={1} minW={0}>
          <Flex align="center" gap={2}>
            {selected && <Icon name="crown" size={11} color={C.accentDark} />}
            <Text fontFamily='var(--font-heading)' fontSize="xl"
              color={C.heading} letterSpacing="0.04em">
              {planDisplayName(plan as any, lang)}
            </Text>
            {/* Saving badge — olive, inline next to name */}
            {isSub && plan.saving && (
              <Box px={1.5} py={0.5} borderRadius="var(--radius-chip)"
                bg={successMix(11)} border={`1px solid ${successMix(26)}`}>
                <Text fontFamily='var(--font-body)' fontSize="9px"
                  fontWeight={700} color={C.olive} letterSpacing="0.06em">
                  {t('plans.saving', { saving: plan.saving })}
                </Text>
              </Box>
            )}
          </Flex>
          <Text fontFamily='var(--font-body)' fontSize="sm" color={C.textMuted}>
            {plan.credits} {t('cart.credits')}
            {isSub && periodLabel ? ` · ${periodLabel}` : ''}
          </Text>
        </VStack>
        <Box textAlign="right" flexShrink={0}>
          <Text fontFamily='var(--font-heading)' fontSize="2xl"
            color={C.accent}>
            {formatPrice(parseFloat(plan.price_eur), lang, 0)}
          </Text>
          {isSub && priceSuffix && (
            <Text fontFamily='var(--font-body)' fontSize="10px"
              color={C.textMuted} letterSpacing="0.08em">
              {priceSuffix.toUpperCase()}
            </Text>
          )}
        </Box>
      </Flex>
    </Box>
  );
}

// ── ClassEnrollmentPicker ─────────────────────────────────────────────────────

function ClassEnrollmentPicker({ authToken, onComplete, cartScheduleIds }: {
  authToken: string;
  onComplete: () => void;
  cartScheduleIds: Set<number>;
}) {
  const t = useT();
  const lang = useLangStore(s => s.lang);
  const [schedules, setSchedules] = useState<RecurringSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  // Pre-select schedules that match cart items
  const [selected, setSelected] = useState<Set<number>>(new Set(cartScheduleIds));
  const [enrolling, setEnrolling] = useState(false);

  useEffect(() => {
    fetch(`${API_BASE}v1/recurrences/?is_active=true&is_recurrent=true`, {
      headers: { Authorization: `Bearer ${authToken}` },
    })
      .then(r => r.json())
      .then(d => {
        const all: RecurringSchedule[] = Array.isArray(d) ? d : (d.results || []);
        // Hard-filter: only truly recurring schedules with a weekday — never
        // show one-off events/sessions here (they'd render as "Invalid Date").
        setSchedules(all.filter(s => s.weekday != null && s.start_time != null && s.is_recurrent !== false));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [authToken]);

  const toggle = (id: number) => setSelected(prev => {
    const n = new Set(prev);
    n.has(id) ? n.delete(id) : n.add(id);
    return n;
  });

  const byDay = useMemo(() => {
    const m: Record<number, RecurringSchedule[]> = {};
    schedules.forEach(s => {
      if (s.weekday != null) {
        (m[s.weekday] = m[s.weekday] || []).push(s);
      }
    });
    return m;
  }, [schedules]);

  const handleEnroll = async () => {
    setEnrolling(true);
    try {
      if (selected.size > 0) {
        // POST to my-class-preferences with field name 'schedule' (not schedule_id)
        const results = await Promise.allSettled(
          Array.from(selected).map(scheduleId =>
            fetch(`${API_BASE}v1/my-class-preferences/`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${authToken}`,
              },
              body: JSON.stringify({ schedule: scheduleId }),
            })
          )
        );
        const failed = results.filter(
          r => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.ok)
        );
        if (failed.length > 0) {
          toaster.create({
            title: t('checkout.enrollFailed', { count: String(failed.length) }),
            type: 'warning', duration: 3000,
          });
        } else {
          toaster.create({ title: t('checkout.enrollAdded'), type: 'success', duration: 3000 });
        }
      }
      onComplete();
    } catch (e: any) {
      toaster.create({ title: e.message, type: 'error', duration: 4000 });
      onComplete();
    } finally {
      setEnrolling(false);
    }
  };

  if (loading) return (
    <Flex justify="center" align="center" minH="160px">
      <Spinner color={C.accent} size="lg" />
    </Flex>
  );

  const hasSuggested = cartScheduleIds.size > 0 && schedules.some(s => cartScheduleIds.has(s.id));

  return (
    <VStack gap={4} align="stretch">
      <Text fontFamily='var(--font-body)' fontSize="sm" color={C.textMuted}>
        {t('checkout.enrollSelect')}
      </Text>

      {/* Cart suggestion banner */}
      {hasSuggested && (
        <Flex align="flex-start" gap={2.5} p={3} borderRadius="var(--radius-input)"
          bg="var(--accent-soft)" border="1px solid var(--accent-border)">
          <Icon name="calendar" size={13} color={C.accentDark} style={{ flexShrink: 0, marginTop: 2 }} />
          <Text fontFamily='var(--font-body)' fontSize="xs" color={C.brown} lineHeight="1.55">
            <strong>{t('checkout.enrollCartBanner')}</strong>{' '}
            {t('checkout.enrollCartBannerSub')}
          </Text>
        </Flex>
      )}

      {schedules.length === 0 ? (
        <Box textAlign="center" py={6}>
          <Icon name="calendar" size={28} color={C.accent} style={{ margin: '0 auto 8px' }} />
          <Text fontFamily='var(--font-body)' fontSize="sm" color={C.textMuted}>
            {t('checkout.enrollNone')}
          </Text>
        </Box>
      ) : (
        Object.entries(byDay).sort(([a], [b]) => parseInt(a) - parseInt(b)).map(([dayIdx, daySchedules]) => (
          <Box key={dayIdx}>
            <Text fontFamily='var(--font-heading)' fontSize="md"
              color={C.heading} letterSpacing="0.06em" mb={1.5}>
              {t(`days.${dayIdx}`)}
            </Text>
            <Stack gap={1.5}>
              {daySchedules.map(s => {
                const isSel = selected.has(s.id);
                const isFromCart = cartScheduleIds.has(s.id);
                const name = tr(s.class_type, 'title', lang) || s.class_type?.name || t('checkout.classFallback');
                const instructor = s.override_instructor?.name;
                const time = `${(s.start_time || '').slice(0, 5)} – ${(s.end_time || '').slice(0, 5)}`;
                return (
                  <Flex key={s.id} as="button" type="button" onClick={() => toggle(s.id)}
                    align="center" gap={3} p={3} borderRadius="var(--radius-input)" cursor="pointer" w="full"
                    bg={isSel ? 'var(--accent-soft)' : 'var(--surface-muted)'}
                    border={`1px solid ${isSel ? C.accentDark : C.border}`}
                    transition="all 0.18s ease"
                  >
                    <Box w="18px" h="18px" borderRadius="5px" flexShrink={0}
                      bg={isSel ? C.accentDark : 'transparent'}
                      border={`2px solid ${isSel ? C.accentDark : 'var(--accent-border)'}`}
                      display="flex" alignItems="center" justifyContent="center">
                      {isSel && <Icon name="check-circle" size={9} color="var(--on-primary)" />}
                    </Box>
                    <Box textAlign="left" flex={1}>
                      <Flex align="center" gap={1.5}>
                        <Text fontFamily='var(--font-body)' fontWeight={700}
                          fontSize="sm" color={C.brown}>{name}</Text>
                        {isFromCart && (
                          <Box px={1.5} py={0.5} borderRadius="var(--radius-chip)"
                            bg="var(--accent-soft)" border="1px solid var(--accent-border)">
                            <Text fontFamily='var(--font-body)' fontSize="8px"
                              fontWeight={700} color={C.accent} letterSpacing="0.06em">
                              {t('checkout.enrollInCart')}
                            </Text>
                          </Box>
                        )}
                      </Flex>
                      <Text fontFamily='var(--font-body)' fontSize="xs" color={C.textMuted}>
                        {time}{instructor ? ` · ${instructor}` : ''}
                      </Text>
                    </Box>
                  </Flex>
                );
              })}
            </Stack>
          </Box>
        ))
      )}

      <Button w="full" h="46px" className="sk-btn"
        fontFamily='var(--font-body)' fontSize="sm"
        disabled={enrolling} onClick={handleEnroll}>
        {enrolling
          ? <Spinner size="sm" color="inherit" />
          : selected.size > 0
            ? t('checkout.enrollAddBtn', { count: String(selected.size) })
            : t('checkout.enrollSkipBtn')}
      </Button>
    </VStack>
  );
}

// ── Main inner component ──────────────────────────────────────────────────────

function CheckoutPageInner() {
  const t = useT();
  // Pagos online con tarjeta (Stripe) activados en la config del estudio
  const paymentsOn = paymentsEnabled();
  const lang = useLangStore(s => s.lang);
  const items = useCartStore(s => s.items);
  const clearCart = useCartStore(s => s.clearCart);
  // Extract recurring schedule IDs from cart items to pre-suggest them in enrollment
  // Clases fijas que llegan preseleccionadas desde una recomendación (?prefer=)
  const [preferIds, setPreferIds] = useState<number[]>(() => {
    try {
      const url = new URLSearchParams(window.location.search).get('prefer');
      const ids = (url || localStorage.getItem('preferIds') || '')
        .split(',').map(Number).filter(n => Number.isFinite(n) && n > 0);
      if (url) localStorage.setItem('preferIds', ids.join(','));
      return ids;
    } catch { return []; }
  });
  const cartScheduleIds = useMemo(
    () => new Set([...(items.filter(i => !String(i.id).startsWith('E_')).map(i => i.id_source).filter(Boolean) as number[]), ...preferIds]),
    [items, preferIds]
  );

  // form state
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [guestCreated, setGuestCreated] = useState(false);
  // Reserva sin cuenta hecha (pagar en el estudio): el carrito ya está vacío
  // pero se sigue viendo la confirmación
  const [guestBooked, setGuestBooked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // coupon
  const [offerCode, setOfferCode] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<any>(null);
  const [isCouponLoading, setIsCouponLoading] = useState(false);
  const [isEmailLocked, setIsEmailLocked] = useState(false);

  // auth / balance
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [balanceLoading, setBalanceLoading] = useState(true);
  const [userBalance, setUserBalance] = useState<number | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(null);

  // plans
  const [packPlans, setPackPlans] = useState<ApiPlan[]>([]);
  const [subPlans, setSubPlans] = useState<ApiPlan[]>([]);
  const [plansLoading, setPlansLoading] = useState(true);
  const [selectedPackId, setSelectedPackId] = useState<string | null>(null);
  const [selectedSubId, setSelectedSubId] = useState<string | null>(null);
  const [showPackPayment, setShowPackPayment] = useState(false);

  // subscription flow
  const [subStep, setSubStep] = useState<'select' | 'pay' | 'cart' | 'enroll' | 'done'>('select');
  const [bookedCartSnapshot, setBookedCartSnapshot] = useState<CartItem[]>([]);
  const [activeSubscription, setActiveSubscription] = useState<{
    id: number; plan: { id: number; name: string; name_en?: string | null; credits: number; price_eur: string };
    status: string; cancel_at_period_end: boolean;
    current_period_end: string;
  } | null>(null);
  const [subLoading, setSubLoading] = useState(false);

  // ui
  const [activeTab, setActiveTab] = useState<'credits' | 'subscription'>('credits');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  // Tras una reserva exitosa, mostramos pantalla con aviso de spam ANTES de redirigir
  const [showPostReserveSuccess, setShowPostReserveSuccess] = useState(false);
  const [needsEmailVerify, setNeedsEmailVerify] = useState(false);
  const [showInstallHint, setShowInstallHint] = useState(false);
  // Qué acaba de pasar: una reserva, o una compra de créditos SIN reservar aún
  const [successKind, setSuccessKind] = useState<'booking' | 'pack'>('booking');
  const [userEmail, setUserEmail] = useState<string | null>(null);

  const reserveButtonRef = useRef<HTMLButtonElement>(null);
  const processingSessionId = useRef<string | null>(null);
  const totalCreditsRef = useRef(0);
  // Snapshot del balance previo al pago — para detectar cuando el webhook acredita
  const balanceBeforePayRef = useRef<number | null>(null);
  // plan_id de la URL — se aplica cuando los planes terminan de cargar
  const pendingPlanIdRef = useRef<string | null>(null);

  const totalCredits = useMemo(() =>
    items.reduce((acc, item) => acc + (Number(item.credits) || 0), 0), [items]);
  const totalPrice = useMemo(() =>
    items.reduce((acc, item) => acc + (parseFloat((item as any).price) || 0), 0), [items]);

  useEffect(() => { totalCreditsRef.current = totalCredits; }, [totalCredits]);

  const canReserve = isLoggedIn && userBalance !== null && userBalance >= totalCredits && totalCredits > 0;
  const showCreditWarning = isLoggedIn && userBalance !== null && userBalance < totalCredits && totalCredits > 0;
  const remainingBalance = userBalance !== null ? userBalance - totalCredits : null;

  const fetchBalance = useCallback(async (token: string): Promise<number | null> => {
    setBalanceLoading(true);
    try {
      const res = await fetch(`${API_BASE}wallet/my-balance/`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) {
        // Sesión caducada o de otro estudio: se sigue como invitada (antes se
        // quedaba en «no se pudo cargar tu saldo» sin poder reservar).
        clearSession();
        setAuthToken(null);
        setIsLoggedIn(false);
        setUserBalance(null);
        return null;
      }
      if (!res.ok) throw new Error(t('checkout.noBalanceError'));
      const data = await res.json();
      const bal = Number(data.balance) || 0;
      setUserBalance(bal);
      return bal;
    } catch (e: any) {
      setError(e.message);
      setUserBalance(null);
      return null;
    } finally {
      setBalanceLoading(false);
    }
  }, []);

  const verifyPaymentSequence = useCallback(async (sessionId: string, token: string) => {
    setIsVerifying(true);
    const POLL_INTERVAL = 3000;
    const POLL_TIMEOUT = 30000;
    const startTime = Date.now();
    // FIX #10: ahora distinguimos 'auth' (401/403) de 'pending' para no
    // polear con un token muerto durante 30 segundos en silencio.

    // Importe y moneda del pago confirmado (para la conversión de compra)
    let paid: { amount_total?: string; currency?: string } = {};
    const checkOnce = async (): Promise<'success' | 'pending' | 'auth'> => {
      try {
        const res = await fetch(`${API_BASE}v1/checkout/verify-plan/`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ session_id: sessionId }),
        });
        if (res.status === 401 || res.status === 403) return 'auth';
        if (res.ok) {
          const d = await res.json();
          if (d.status === 'success') { paid = d; return 'success'; }
        }
      } catch {}
      return 'pending';
    };

    try {
      let result = await checkOnce();

      while (result !== 'success' && result !== 'auth' && Date.now() - startTime < POLL_TIMEOUT) {
        await new Promise(r => setTimeout(r, POLL_INTERVAL));
        result = await checkOnce();
      }

      if (result === 'auth') {
        // FIX #10: token expirado durante el flujo de Stripe.
        // No tiene caso seguir poleando con un token muerto.
        localStorage.removeItem('accessToken');
        localStorage.removeItem('balanceBeforePay');
        toaster.create({
          title: t('checkout.sessionExpiredTitle'),
          description: t('checkout.sessionExpiredDesc'),
          type: 'warning',
          duration: 8000,
        });
        setIsLoggedIn(false);
        setAuthToken(null);
        setUserBalance(null);
        window.history.replaceState(null, '', window.location.pathname);
        return;
      }

      if (result === 'success') {
        // Conversión de compra del bono/membresía (con consentimiento). Antes se
        // quita la sesión de pago de la URL para que no llegue a terceros.
        window.history.replaceState(null, '', window.location.pathname);
        const value = Number(paid.amount_total);
        track('purchase', {
          transaction_id: hashId(sessionId),
          value: Number.isFinite(value) ? value : undefined,
          currency: paid.currency || getSiteClient().currency,
          items: [{ item_name: localStorage.getItem('pendingPaymentType') === 'sub' ? 'membership' : 'pack', quantity: 1 }],
        });
        toaster.create({
          title: t('checkout.paySuccess'),
          description: t('checkout.paySuccessDesc'),
          type: 'success',
          duration: 3000,
        });

        // ── FIX #2: re-poll balance hasta que el webhook acredite ───────────
        // verify-plan/ puede marcar success antes de que el webhook procese el
        // wallet. Reintentamos fetchBalance hasta ver un cambio o timeout 10s.
        const balBefore = balanceBeforePayRef.current;
        let newBalance = await fetchBalance(token);
        const balStart = Date.now();
        while (
          newBalance !== null &&
          balBefore !== null &&
          newBalance <= balBefore &&
          Date.now() - balStart < 10000
        ) {
          await new Promise(r => setTimeout(r, 1500));
          newBalance = await fetchBalance(token);
        }
        // ─────────────────────────────────────────────────────────────────────

        const payType = localStorage.getItem('pendingPaymentType') || 'pack';
        localStorage.removeItem('pendingPaymentType');
        localStorage.removeItem('balanceBeforePay');

        if (payType === 'sub') {
          setActiveTab('subscription');
          const cartHasItems = totalCreditsRef.current > 0;
          if (cartHasItems && newBalance !== null && newBalance >= totalCreditsRef.current) {
            setSubStep('cart');
          } else {
            setSubStep('enroll');
          }
        } else {
          const cart = totalCreditsRef.current;
          if (newBalance !== null && newBalance >= cart && cart > 0) {
            setIsModalOpen(true);
          } else {
            // Recarga de créditos sin reserva inmediata: la pantalla de éxito
            // lo dice tal cual y lleva a reservar (antes decía "Reserva
            // completada" aunque no se había reservado nada).
            setSuccessKind('pack');
            setShowPostReserveSuccess(true);
          }
        }
      } else {
        toaster.create({
          title: t('checkout.payConfirmedTitle'),
          description: t('checkout.payConfirmedDesc'),
          type: 'info',
          duration: 5000,
        });
      }
      window.history.replaceState(null, '', window.location.pathname);
    } catch (e: any) {
      setError(e.message);
      toaster.create({
        title: t('checkout.verifyError'),
        description: t('checkout.verifyErrorDesc'),
        type: 'error',
      });
    } finally {
      setIsVerifying(false);
    }
  }, [fetchBalance]);

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get('session_id');
    const urlTab = params.get('tab');
    const urlPlanId = params.get('plan_id');

    if (token) {
      setAuthToken(token);
      setIsLoggedIn(true);
      fetchBalance(token);
    } else {
      setIsLoggedIn(false);
      setBalanceLoading(false);
    }
    setIsAuthLoading(false);

    // FIX #4: si entramos a /checkout SIN session_id, limpiamos cualquier
    // flag sucio que haya quedado de un flujo abandonado.
    if (!sessionId) {
      localStorage.removeItem('pendingPaymentType');
      localStorage.removeItem('balanceBeforePay');
    } else {
      // Si venimos de Stripe, leemos el balance pre-pago de localStorage
      const stored = localStorage.getItem('balanceBeforePay');
      if (stored !== null) {
        balanceBeforePayRef.current = Number(stored);
      }
    }

    // FIX #3: leer ?tab= y ?plan_id= de la URL al entrar
    if (urlTab === 'subscription' || urlTab === 'credits') {
      setActiveTab(urlTab);
    } else if (urlPlanId) {
      // Si vienen con ?plan_id pero sin ?tab=, asumimos sub (que es lo único
      // que envía plan_id desde SuscriptionPlans)
      setActiveTab('subscription');
    }
    if (urlPlanId) {
      pendingPlanIdRef.current = urlPlanId;
    }

    if (sessionId && token && processingSessionId.current !== sessionId) {
      processingSessionId.current = sessionId;
      verifyPaymentSequence(sessionId, token);
    }
  }, [verifyPaymentSequence, fetchBalance]);

  // FIX #3 (parte 2): cuando los planes terminan de cargar, aplicamos
  // el plan_id que venía en la URL. Lo hacemos aquí porque depende de subPlans/packPlans.
  // OJO: setPlansLoading(false) en el effect de fetch corre ANTES del .json().then()
  // interno, así que esperamos a que las listas estén realmente pobladas.
  useEffect(() => {
    const pid = pendingPlanIdRef.current;
    if (!pid) return;
    if (plansLoading) return;
    // Si aún no hay planes cargados (race con .json().then), esperamos al próximo render
    if (subPlans.length === 0 && packPlans.length === 0) return;
    const inSub = subPlans.find(p => p.id.toString() === pid);
    const inPack = packPlans.find(p => p.id.toString() === pid);
    if (inSub) {
      setSelectedSubId(pid);
      setActiveTab('subscription');
      pendingPlanIdRef.current = null;
    } else if (inPack) {
      setSelectedPackId(pid);
      setActiveTab('credits');
      pendingPlanIdRef.current = null;
    }
    // Si no se encontró pero al menos una lista tiene datos → el plan_id es inválido,
    // lo descartamos para no quedarnos esperando.
    else if (subPlans.length > 0 || packPlans.length > 0) {
      pendingPlanIdRef.current = null;
    }
  }, [plansLoading, subPlans, packPlans]);

  useEffect(() => {
    if (!isLoggedIn || !authToken) { setPlansLoading(false); return; }
    const userId = localStorage.getItem('iduser');
    const headers = { Authorization: `Bearer ${authToken}` };

    // Cargamos el email del usuario para mostrarlo en el aviso de spam.
    if (userId) {
      fetch(`${API_BASE}v1/users/${userId}/`, { headers })
        .then(r => r.ok ? r.json() : null)
        .then(d => { if (d?.email) setUserEmail(d.email); })
        .catch(() => {});
    }

    Promise.allSettled([
      fetch(`${API_BASE}v1/plans/?ordering=price_eur`, { headers }),
      userId ? fetch(`${API_BASE}v1/subscriptions/?user=${userId}&status=active`, { headers }) : Promise.resolve(null),
    ]).then(([plansR, subR]) => {
      if (plansR.status === 'fulfilled' && plansR.value.ok) {
        plansR.value.json().then((data: ApiPlan[]) => {
          const active = Array.isArray(data) ? data.filter(p => p.is_active) : [];
          setPackPlans(active.filter(p => p.type === 'pack'));
          setSubPlans(active.filter(p => p.type === 'sub'));
        });
      }
      if (subR.status === 'fulfilled' && subR.value && (subR.value as Response).ok) {
        (subR.value as Response).json().then((data: any) => {
          const subs = Array.isArray(data) ? data : (data.results || []);
          const active = subs.find((s: any) => s.status === 'active');
          setActiveSubscription(active || null);
        });
      }
    }).catch(e => setError(e.message)).finally(() => setPlansLoading(false));
  }, [isLoggedIn, authToken]);

  useEffect(() => {
    if (isLoggedIn && !balanceLoading && canReserve && reserveButtonRef.current) {
      setTimeout(() =>
        reserveButtonRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 300);
    }
  }, [isLoggedIn, balanceLoading, canReserve]);

  const handleGuestCheckout = (e: React.FormEvent) => {
    e.preventDefault();

    // Validación nombre (mínimo 2 caracteres)
    if (!name || name.trim().length < 2) {
      setError(t('checkout.guestAllFields'));
      return;
    }

    // Validación email con regex básico
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(guestEmail.trim());
    if (!emailOk) {
      setError(t('checkout.guestAllFields'));
      return;
    }

    // Validación teléfono — react-international-phone siempre retorna al menos
    // el código de país (ej. "+34"), así que comprobar !phone NO basta.
    // Requerimos al menos 7 dígitos en total (mínimo internacional típico).
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 7) {
      setError(t('checkout.guestPhoneInvalid'));
      return;
    }

    setError(null);
    setIsSubmitting(true);
    setGuestCreated(true);
    setIsSubmitting(false);
  };

  const handlePackSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPackId) return;
    // FIX #1: marcar tipo de pago ANTES de iniciar Stripe. Guardamos el balance
    // pre-pago en localStorage (no en ref) porque la redirección de Stripe
    // recarga toda la página y los refs se pierden.
    localStorage.setItem('pendingPaymentType', 'pack');
    if (userBalance !== null) {
      localStorage.setItem('balanceBeforePay', String(userBalance));
    }
    setShowPackPayment(true);
  };

  const handleSubPayment = async () => {
    if (!selectedSubId) return;
    // La membresía exige email confirmado: si falta, pedimos el código aquí
    // mismo y al confirmarlo seguimos al pago (sin perder la selección).
    try {
      const me = await fetch(`${API_BASE}v1/me/`, { headers: { Authorization: `Bearer ${authToken}` } })
        .then(r => (r.ok ? r.json() : null));
      if (me && me.is_verified === false) { setNeedsEmailVerify(true); return; }
    } catch { /* si falla la comprobación, el backend lo vuelve a validar */ }
    setNeedsEmailVerify(false);
    localStorage.setItem('pendingPaymentType', 'sub');
    if (userBalance !== null) {
      localStorage.setItem('balanceBeforePay', String(userBalance));
    }
    setSubStep('pay');
  };

  // FIX #1/#4: helpers para limpiar el flag al cancelar/cambiar contexto.
  const cancelPendingPayment = useCallback(() => {
    localStorage.removeItem('pendingPaymentType');
    localStorage.removeItem('balanceBeforePay');
  }, []);

  const switchTab = useCallback((tab: 'credits' | 'subscription') => {
    cancelPendingPayment();
    setActiveTab(tab);
  }, [cancelPendingPayment]);

  // Devuelve true solo si la reserva se completó: el flujo de suscripción
  // usa este valor para no avanzar a "enroll" con una reserva fallida.
  const handleCreditBooking = async (e?: React.FormEvent, fromSubFlow = false): Promise<boolean> => {
    e?.preventDefault();
    if (!authToken || !canReserve) return false;
    setIsSubmitting(true);
    setError(null);
    try {
      const snapshot = [...items]; // save before clearCart
      const res = await fetch(`${API_BASE}v1/checkout/reserve/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ cart_items: items }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        const backendMsg: string = d.error || d.message || d.detail || '';

        // FIX: detección específica del caso "Ya tienes una reserva".
        // El backend devuelve 400 con error="Ya tienes una reserva para X en ese horario."
        // Mostramos un toast más visible con instrucciones (no se puede reservar
        // para otra persona estando logueado — habría que cerrar sesión y usar guest).
        const isDuplicateBooking =
          res.status === 400 &&
          /ya tienes una reserva/i.test(backendMsg);

        // Clase llena (alguien reservó la última plaza mientras tanto): si el
        // estudio tiene lista de espera, ofrecer apuntarse desde aquí mismo.
        if (d.code === 'class_full' && d.waitlist && d.schedule_id && d.start_datetime) {
          const en = lang === 'en';
          toaster.create({
            title: backendMsg || (en ? 'That class is full.' : 'Esa clase está completa.'),
            description: en ? 'Join the waitlist and we’ll let you know if a spot opens up.' : 'Apúntate a la lista de espera y te avisamos si se libera una plaza.',
            type: 'warning', duration: 12000,
            action: {
              label: en ? 'Join the waitlist' : 'Apuntarme a la lista de espera',
              onClick: async () => {
                const r = await joinWaitlist(Number(d.schedule_id), String(d.start_datetime));
                const ok = r.kind === 'joined' || r.kind === 'already_waiting';
                toaster.create({
                  title: ok
                    ? (en ? 'You’re on the waitlist. We’ll let you know.' : 'Estás en la lista de espera. Te avisaremos.')
                    : r.kind === 'has_space'
                      ? (en ? 'A spot just opened up: try booking again.' : 'Se ha liberado una plaza: vuelve a reservar.')
                      : (r.kind === 'error' && r.message) || (en ? 'Couldn’t join the waitlist.' : 'No se ha podido apuntar a la lista.'),
                  type: ok ? 'success' : 'info', duration: 4000,
                });
              },
            },
          });
          setError(backendMsg);
          setIsSubmitting(false);
          setIsModalOpen(false);
          return false;
        }

        if (isDuplicateBooking) {
          toaster.create({
            title: t('checkout.duplicateBookingTitle'),
            description: t('checkout.duplicateBookingDesc', { msg: backendMsg }),
            type: 'warning',
            duration: 10000,
          });
          setError(backendMsg);
          setIsSubmitting(false);
          // Cerramos el modal de confirmación para que el usuario pueda ajustar el cart
          setIsModalOpen(false);
          return false;
        }

        throw new Error(backendMsg || t('checkout.reserveError'));
      }
      toaster.create({ title: t('checkout.reserveSuccess'), type: 'success', duration: 2000 });
      // Reserva con créditos → conversión «reserva» por clase (con consentimiento)
      for (const it of snapshot) track('book', { class_name: it.title });
      clearCart();
      if (fromSubFlow) {
        setBookedCartSnapshot(snapshot);
        // caller sets the next subStep — don't navigate away
      } else {
        setIsModalOpen(false);
        setIsSubmitting(false);
        // En lugar de redirigir inmediatamente, mostramos pantalla de éxito con
        // el aviso de spam. El usuario decide cuándo ir a su calendario.
        setSuccessKind('booking');
        setShowPostReserveSuccess(true);
        // Momento de máxima intención: invitar a instalar la app para recibir
        // el recordatorio de esta clase (una vez por sesión).
        setTimeout(() => { if (requestInstallPrompt('booking') === 'inline') setShowInstallHint(true); }, 1200);
        return true;   // evitar el finally que volvería a tocarlo
      }
      return true;
    } catch (err: any) {
      setError(err.message);
      setIsSubmitting(false);
      if (fromSubFlow) {
        // En el flujo de suscripción esta vista ya no muestra `error`:
        // sin este toast el fallo era invisible y el usuario creía que
        // sus clases quedaron reservadas.
        toaster.create({
          title: err.message || t('checkout.reserveError'),
          type: 'error',
          duration: 7000,
        });
      }
      return false;
    } finally {
      if (fromSubFlow) setIsSubmitting(false);
    }
  };

  const handleApplyCoupon = async () => {
    if (!offerCode) return;
    setIsCouponLoading(true);
    try {
      const res = await fetch(`${API_BASE}v1/coupons/${encodeURIComponent(offerCode)}/`);
      if (res.status === 404) throw new Error(t('checkout.couponNotFound'));
      if (!res.ok) throw new Error(t('checkout.couponError'));
      const coupon = await res.json();
      if (!coupon.is_active) throw new Error(t('checkout.couponInactive'));
      const now = new Date();
      if (coupon.valid_from && now < new Date(coupon.valid_from)) throw new Error(t('checkout.couponNotYet'));
      if (coupon.valid_to && now > new Date(coupon.valid_to)) throw new Error(t('checkout.couponExpired'));
      setAppliedCoupon(coupon);
      if (!isLoggedIn) setIsEmailLocked(true);
      toaster.create({ title: t('checkout.couponSuccess'), type: 'success', duration: 3000 });
    } catch (e: any) {
      setAppliedCoupon(null);
      toaster.create({ title: e.message, type: 'error', duration: 4000 });
    } finally {
      setIsCouponLoading(false);
    }
  };

  // ── Shared card wrapper ───────────────────────────────────────────────────

  const card = (children: React.ReactNode) => (
    <Box className="sk-card" p={6}>
      {children}
    </Box>
  );

  // ── Credits tab ───────────────────────────────────────────────────────────

  const renderCreditsTab = () => {
    if (isAuthLoading || isVerifying) return card(
      <Flex justify="center" align="center" minH="180px" direction="column" gap={3}>
        <Spinner color={C.accent} size="xl" />
        {isVerifying && (
          <Text fontFamily='var(--font-body)' fontSize="sm" color={C.textMuted}>
            {t('checkout.verifying')}
          </Text>
        )}
      </Flex>
    );

    if (!isLoggedIn) return (
      <VStack gap={5} align="stretch">
        {/* UX: con el carrito vacío no tiene sentido el formulario de pago
            («Continuar» con importe cero) — guiamos al calendario. */}
        {items.length === 0 && !guestBooked ? card(
          <Box textAlign="center" py={6}>
            <Box w="56px" h="56px" borderRadius="full" bg="var(--accent-soft)"
              display="flex" alignItems="center" justifyContent="center" mx="auto" mb={3}>
              <Icon name="cart" size={22} color={C.accentDark} />
            </Box>
            <Text fontFamily='var(--font-heading)' fontSize="2xl"
              color={C.heading} letterSpacing="0.04em" mb={1}>
              {lang === 'en' ? 'Your cart is empty' : 'Tu carrito está vacío'}
            </Text>
            <Text fontFamily='var(--font-body)' fontSize="sm" color={C.textMuted} mb={5}>
              {lang === 'en'
                ? 'Pick a class from the calendar to book your spot.'
                : 'Elige una clase en el calendario para reservar tu plaza.'}
            </Text>
            <Button as="a" href="/calendar" h="44px" className="sk-btn" px={8}
              fontFamily='var(--font-body)'>
              {lang === 'en' ? 'View calendar' : 'Ver calendario'}
            </Button>
          </Box>
        ) : !paymentsOn ? card(
          // Sin pagos online: la invitada reserva sin cuenta y paga en el
          // estudio al llegar (antes solo se le decía que creara una cuenta y
          // comprara créditos en el estudio: no podía reservar).
          <GuestStudioBooking onBooked={() => setGuestBooked(true)} />
        ) : card(
          <>
            <Text fontFamily='var(--font-heading)' fontSize="2xl"
              color={C.heading} letterSpacing="0.04em" mb={4}>
              {guestCreated ? t('checkout.guestStep2') : t('checkout.guestTitle')}
            </Text>
            {!guestCreated ? (
              <VStack as="form" gap={3} align="stretch" onSubmit={handleGuestCheckout}>
                {error && (
                  <Alert.Root status="error" borderRadius="var(--radius-input)">
                    <Alert.Description fontFamily='var(--font-body)'>{error}</Alert.Description>
                  </Alert.Root>
                )}
                <Field.Root required>
                  <Field.Label fontFamily='var(--font-body)' fontSize="sm" color={C.textMuted}>
                    {t('checkout.guestEmail')}
                  </Field.Label>
                  <Input type="email" value={guestEmail}
                    onChange={e => setGuestEmail(e.target.value)}
                    disabled={isEmailLocked} className="sk-input"
                    fontFamily='var(--font-body)' />
                </Field.Root>
                <Field.Root required>
                  <Field.Label fontFamily='var(--font-body)' fontSize="sm" color={C.textMuted}>
                    {t('checkout.guestName')}
                  </Field.Label>
                  <Input type="text" value={name} onChange={e => setName(e.target.value)}
                    className="sk-input"
                    fontFamily='var(--font-body)' />
                </Field.Root>
                <Field.Root required>
                  <Field.Label fontFamily='var(--font-body)' fontSize="sm" color={C.textMuted}>
                    {t('checkout.guestPhone')}
                  </Field.Label>
                  <Box w="full" css={{
                    "& .react-international-phone-input-container": { width: "100% !important" },
                    "& .react-international-phone-input": { width: "100% !important", height: "40px !important" },
                    // Colores del campo de teléfono (librería externa) con los tokens del estilo
                    "--react-international-phone-background-color": "var(--input-bg)",
                    "--react-international-phone-text-color": "var(--page-text)",
                    "--react-international-phone-border-color": "var(--input-border)",
                    "--react-international-phone-border-radius": "var(--radius-input)",
                    "--react-international-phone-country-selector-background-color-hover": "var(--surface-muted)",
                    "--react-international-phone-dropdown-item-background-color": "var(--surface-strong)",
                    "--react-international-phone-dropdown-item-dial-code-color": "var(--text-muted)",
                    "--react-international-phone-selected-dropdown-item-background-color": "var(--accent-soft)",
                    "--react-international-phone-dropdown-shadow": "var(--shadow-float)",
                  }}>
                    <PhoneInput defaultCountry="es" value={phone} onChange={setPhone} />
                  </Box>
                </Field.Root>
                <Button type="submit" w="full" h="44px" className="sk-btn"
                  fontFamily='var(--font-body)'
                  disabled={isSubmitting || totalPrice === 0}>
                  {isSubmitting
                    ? <Spinner size="sm" color="inherit" />
                    : t('checkout.continueBtn', { price: formatPrice(totalPrice, lang) })}
                </Button>
                {totalPrice === 0 && (
                  // Clases solo con precio en créditos: sin cuenta no se pueden pagar
                  <Text fontFamily='var(--font-body)' fontSize="xs" color={C.textMuted}>
                    {lang === 'en'
                      ? 'These classes are booked with credits: log in or create your account below.'
                      : 'Estas clases se reservan con créditos: entra o crea tu cuenta aquí debajo.'}
                  </Text>
                )}
              </VStack>
            ) : (
              <VStack gap={4} align="stretch">
                <Alert.Root status="success" borderRadius="var(--radius-input)">
                  <Alert.Description fontFamily='var(--font-body)'>
                    {t('checkout.guestDataSaved')}
                  </Alert.Description>
                </Alert.Root>
                <StripeEmbeddedForm items={items} currency={getSiteClient().currency.toLowerCase()} name={name}
                  email={guestEmail} phone={phone}
                  couponCode={appliedCoupon?.code} />
              </VStack>
            )}
          </>
        )}
        {card(
          <>
            <Text fontFamily='var(--font-heading)' fontSize="xl"
              color={C.heading} letterSpacing="0.04em" mb={2}>
              {t('checkout.loginPrompt')}
            </Text>
            <Text fontFamily='var(--font-body)' fontSize="sm" color={C.textMuted} mb={4}>
              {t('checkout.loginDesc')}
            </Text>
            <AuthEntrypoint scrolled={false} linkColor="" />
          </>
        )}
      </VStack>
    );

    if (canReserve) return card(
      <Box textAlign="center" py={2}>
        <Box w="56px" h="56px" borderRadius="full" bg="var(--accent-soft)"
          display="flex" alignItems="center" justifyContent="center" mx="auto" mb={3}>
          <Icon name="check-circle" size={24} color={C.accentDark} />
        </Box>
        <Text fontFamily='var(--font-heading)' fontSize="2xl"
          color={C.heading} letterSpacing="0.04em">
          {t('checkout.balanceOk')}
        </Text>
        <Text fontFamily='var(--font-body)' fontSize="sm" color={C.textMuted} mt={1}>
          {t('checkout.balanceOkDesc', { balance: userBalance?.toFixed(2) ?? '0' })}
        </Text>
      </Box>
    );

    // Sin pagos online: los bonos se compran en el estudio
    if (!paymentsOn) return card(<PaymentsDisabledNotice />);

    return card(
      !showPackPayment ? (
        <>
          <FlowStepper step={1} labels={lang === 'en' ? ['Pack', 'Payment', 'Book'] : ['Bono', 'Pago', 'Reservar']} ariaLabel={lang === 'en' ? 'Progress' : 'Progreso'} />
          {/* Regular comprando otro bono: el mejor momento para comparar */}
          <Box mb={4}>
            <MembershipSuggestionCard variant="checkout" balance={userBalance}
              onChoose={(planId, ids) => {
                if (ids.length) {
                  setPreferIds(ids);
                  try { localStorage.setItem('preferIds', ids.join(',')); } catch {}
                }
                setSelectedSubId(String(planId));
                switchTab('subscription');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }} />
          </Box>
          <Text fontFamily='var(--font-heading)' fontSize="2xl"
            color={C.heading} letterSpacing="0.04em" mb={4}>
            {t('checkout.choosePackTitle')}
          </Text>
          {plansLoading ? (
            <Flex justify="center" minH="120px" align="center">
              <Spinner color={C.accent} />
            </Flex>
          ) : packPlans.length === 0 ? (
            <Text fontFamily='var(--font-body)' fontSize="sm" color={C.textMuted} textAlign="center" py={4}>
              {t('checkout.noPacks')}
            </Text>
          ) : (
            <VStack as="form" gap={3} align="stretch" onSubmit={handlePackSubmit}>
              <Stack gap={3}>
                {packPlans.map(plan => (
                  <PlanCard key={plan.id} plan={plan}
                    selected={selectedPackId === plan.id.toString()}
                    onSelect={() => setSelectedPackId(plan.id.toString())} />
                ))}
              </Stack>
              <Button type="submit" w="full" h="46px" className="sk-btn"
                fontFamily='var(--font-body)' mt={2}
                disabled={!selectedPackId}>
                {t('checkout.nextBtn')}
              </Button>
            </VStack>
          )}
        </>
      ) : (
        <>
          <FlowStepper step={2} labels={lang === 'en' ? ['Pack', 'Payment', 'Book'] : ['Bono', 'Pago', 'Reservar']} ariaLabel={lang === 'en' ? 'Progress' : 'Progreso'} />
          <Flex justify="space-between" align="center" mb={4}>
            <Text fontFamily='var(--font-heading)' fontSize="2xl"
              color={C.heading} letterSpacing="0.04em">
              {t('checkout.payTitle')}
            </Text>
            <Button variant="ghost" size="sm"
              onClick={() => { cancelPendingPayment(); setShowPackPayment(false); }}
              color={C.textMuted} fontFamily='var(--font-body)'>
              {t('checkout.back')}
            </Button>
          </Flex>
          {selectedPackId && (
            <StripePlanForm planId={selectedPackId}
              couponCode={appliedCoupon?.code || ''} />
          )}
        </>
      )
    );
  };

  // ── Auto-booking date helpers ─────────────────────────────────────────────
  const autoBookDates = useMemo(() => {
    const today = new Date();
    const dow = today.getDay(); // 0=Sun … 6=Sat
    // Days until next Sunday (the cron night)
    const daysToSunday = dow === 0 ? 7 : 7 - dow;
    const nextSunday = new Date(today.getFullYear(), today.getMonth(), today.getDate() + daysToSunday);
    // Monday after that Sunday = first auto-booked day
    const nextMonday = new Date(nextSunday.getFullYear(), nextSunday.getMonth(), nextSunday.getDate() + 1);
    // Saturday before that Sunday = deadline to update preferences
    const saturday = new Date(nextSunday.getFullYear(), nextSunday.getMonth(), nextSunday.getDate() - 1);
    const locale = lang === 'en' ? 'en-GB' : 'es-ES';
    const fmtShort = (d: Date) => d.toLocaleDateString(locale, { day: 'numeric', month: 'long' });
    const isToday = (d: Date) => d.toDateString() === today.toDateString();
    return {
      nextSunday, nextMonday, saturday,
      nextSundayStr: fmtShort(nextSunday),
      nextMondayStr: fmtShort(nextMonday),
      saturdayStr:   fmtShort(saturday),
      deadlineIsToday: isToday(saturday),
    };
  }, [lang]);

  // ── Subscription tab ──────────────────────────────────────────────────────

  const renderSubscriptionTab = () => {
    if (!isLoggedIn) return card(
      <Box textAlign="center" py={4}>
        <Icon name="crown" size={32} color={C.accent} style={{ margin: '0 auto 12px' }} />
        <Text fontFamily='var(--font-heading)' fontSize="2xl"
          color={C.heading} letterSpacing="0.04em" mb={2}>
          {t('checkout.subTitle')}
        </Text>
        <Text fontFamily='var(--font-body)' fontSize="sm" color={C.textMuted} mb={4}>
          {t('checkout.subLoginDesc')}
        </Text>
        <AuthEntrypoint scrolled={false} linkColor="" />
      </Box>
    );

    // ── Cart booking step (after subscription payment, before enroll) ─────────
    if (subStep === 'cart') return card(
      <VStack gap={5} align="stretch">
        <Box>
          <Text fontFamily='var(--font-heading)' fontSize="2xl"
            color={C.heading} letterSpacing="0.04em" mb={1}>
            {t('checkout.subActivatedCartTitle')}
          </Text>
          <Text fontFamily='var(--font-body)' fontSize="sm" color={C.textMuted}>
            {t('checkout.subActivatedCartDesc', { n: items.length })}
          </Text>
        </Box>

        {/* Cart preview */}
        <Box borderRadius="var(--radius-input)" border={`1px solid ${C.border}`}
          bg="var(--surface-muted)" px={4} py={3}>
          {items.map(item => (
            <Flex key={item.id} align="center" gap={3} py={2}
              borderBottom={`1px solid ${C.border}`}
              _last={{ borderBottom: 'none' }}>
              <img src={optimizedImage(item.image, 256) || '/placeholder-class.svg'} onError={withOriginalFallback(item.image)} alt={tr(item, 'title', lang)}
                style={{ width: '40px', height: '40px', borderRadius: 'var(--radius-input)', flexShrink: 0, objectFit: 'cover' }} />
              <Box flex={1} minW={0}>
                <Text fontFamily='var(--font-body)' fontWeight={700}
                  fontSize="sm" color={C.brown}
                  style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                  {tr(item, 'title', lang)}
                </Text>
                <Text fontFamily='var(--font-body)' fontSize="xs" color={C.textMuted}>
                  {fmtDate(item.sessionDate, lang === 'en' ? 'en-GB' : 'es-ES', { weekday: 'short', day: 'numeric', month: 'short' })}
                  {' · '}
                  {fmtTime(item.sessionDate, lang === 'en' ? 'en-GB' : 'es-ES', { hour: '2-digit', minute: '2-digit' })}
                </Text>
              </Box>
              <Text fontFamily='var(--font-body)' fontSize="xs" fontWeight={700} color={C.accent}>
                {item.credits} {t('checkout.creditsUnit')}
              </Text>
            </Flex>
          ))}
        </Box>

        <VStack gap={2} align="stretch">
          <Button w="full" h="46px" className="sk-btn"
            fontFamily='var(--font-body)'
            disabled={isSubmitting}
            onClick={async () => {
              // Solo avanzar si la reserva se completó de verdad — antes se
              // avanzaba igual y el fallo quedaba invisible.
              const ok = await handleCreditBooking(undefined, true);
              if (ok) setSubStep('enroll');
            }}>
            {isSubmitting ? <Spinner size="sm" color="inherit" /> : (
              <Flex align="center" gap={2}>
                <Icon name="check-circle" size={13} />
                {t('checkout.subActivatedCartBtn')}
              </Flex>
            )}
          </Button>
          <Button w="full" h="40px" borderRadius="var(--radius-button)" variant="ghost"
            color={C.textMuted} fontFamily='var(--font-body)' fontWeight={600} fontSize="sm"
            onClick={() => setSubStep('enroll')}>
            {t('checkout.subActivatedCartSkip')}
          </Button>
        </VStack>
      </VStack>
    );

    if (subStep === 'enroll') return card(
      <>
        <Box mb={5}>
          <Text fontFamily='var(--font-heading)' fontSize="2xl"
            color={C.heading} letterSpacing="0.04em">
            {t('checkout.enrollTitle')}
          </Text>
          <Text fontFamily='var(--font-body)' fontSize="sm" color={C.textMuted} mt={1}>
            {t('checkout.enrollDesc')}
          </Text>
        </Box>
        {authToken && (
          <ClassEnrollmentPicker authToken={authToken}
            onComplete={() => {
              // Preselección usada: no volver a aplicarla en futuras compras
              try { localStorage.removeItem('preferIds'); } catch {}
              setSubStep('done');
            }}
            cartScheduleIds={cartScheduleIds} />
        )}
      </>
    );

    if (subStep === 'done') return card(
      <VStack gap={5} align="stretch">
        {/* Hero */}
        <Box textAlign="center" pt={2}>
          <Box w="64px" h="64px" borderRadius="full"
            bg="var(--accent)"
            display="flex" alignItems="center" justifyContent="center" mx="auto" mb={3}
            boxShadow="var(--shadow-card)">
            <Icon name="check-circle" size={28} color="var(--on-primary)" />
          </Box>
          <Text fontFamily='var(--font-heading)' fontSize="3xl"
            color={C.heading} letterSpacing="0.04em" lineHeight="1">
            {t('checkout.subActivatedTitle')}
          </Text>
          <Text fontFamily='var(--font-body)' fontSize="sm"
            color={C.textMuted} mt={1}>
            {lang === 'en' ? 'Your membership is now active 🎉' : '¡Tu membresía ya está activa 🎉'}
          </Text>
        </Box>

        {/* Aviso de spam — tras activar suscripción se envía email con factura/confirmación */}
        <SpamWarning variant="payment" email={userEmail || undefined} />

        {/* Booked cart classes (only shown when cart was booked) */}
        {bookedCartSnapshot.length > 0 && (
          <Box borderRadius="var(--radius-card)" border={`1px solid ${successMix(22)}`}
            bg={successMix(4)} overflow="hidden">
            <Flex align="center" gap={2} px={4} py={3}
              borderBottom={`1px solid ${successMix(15)}`}>
              <Icon name="check-circle" size={12} color="var(--success)" />
              <Text fontFamily='var(--font-body)' fontSize="xs" fontWeight={700}
                color="var(--success)" textTransform="uppercase" letterSpacing="0.08em">
                {lang === 'en'
                  ? `${bookedCartSnapshot.length} class${bookedCartSnapshot.length > 1 ? 'es' : ''} booked`
                  : `${bookedCartSnapshot.length} clase${bookedCartSnapshot.length > 1 ? 's' : ''} reservada${bookedCartSnapshot.length > 1 ? 's' : ''}`}
              </Text>
            </Flex>
            {bookedCartSnapshot.map((item, idx) => (
              <Flex key={item.id} align="center" gap={3} px={4} py={2.5}
                borderBottom={idx < bookedCartSnapshot.length - 1 ? `1px solid ${successMix(10)}` : 'none'}>
                <img src={optimizedImage(item.image, 256) || '/placeholder-class.svg'} onError={withOriginalFallback(item.image)} alt={tr(item, 'title', lang)}
                  style={{ width: '36px', height: '36px', borderRadius: 'var(--radius-input)',
                    flexShrink: 0, objectFit: 'cover', opacity: 0.85 }} />
                <Box flex={1} minW={0}>
                  <Text fontFamily='var(--font-body)' fontWeight={700}
                    fontSize="xs" color={C.brown}
                    style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {tr(item, 'title', lang)}
                  </Text>
                  <Text fontFamily='var(--font-body)' fontSize="10px" color={C.textMuted}>
                    {fmtDate(item.sessionDate, lang === 'en' ? 'en-GB' : 'es-ES',
                      { weekday: 'short', day: 'numeric', month: 'short' })}
                    {' · '}
                    {fmtTime(item.sessionDate, lang === 'en' ? 'en-GB' : 'es-ES',
                      { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                </Box>
                <Icon name="check-circle" size={11} color="var(--success)" style={{ flexShrink: 0 }} />
              </Flex>
            ))}
          </Box>
        )}

        {/* Auto-booking timeline — how it works from here */}
        <Box borderRadius="var(--radius-card)" border={`1px solid ${C.border}`} overflow="hidden">
          <Box px={4} py={3} bg="var(--accent-soft)"
            borderBottom={`1px solid ${C.border}`}>
            <Flex align="center" gap={2}>
              <Icon name="calendar" size={13} color={C.accentDark} />
              <Text fontFamily='var(--font-heading)' fontSize="md"
                color={C.heading} letterSpacing="0.06em">
                {lang === 'en' ? 'How auto-booking works' : 'Cómo funciona la reserva automática'}
              </Text>
            </Flex>
          </Box>

          {/* Timeline steps */}
          <VStack gap={0} align="stretch" px={4} py={3}>
            {[
              {
                icon: <Icon name="check-circle" size={13} color="var(--success)" />,
                dot: 'var(--success)',
                label: lang === 'en' ? 'Subscription activated' : 'Suscripción activada',
                sub: lang === 'en' ? 'Credits added to your account' : 'Créditos añadidos a tu cuenta',
                done: true,
              },
              {
                icon: <Icon name="calendar" size={13} color={C.accentDark} />,
                dot: C.accentDark,
                label: lang === 'en' ? 'Set your class preferences' : 'Configura tus clases',
                sub: lang === 'en'
                  ? 'Choose which recurring classes you want each week'
                  : 'Elige qué clases recurrentes quieres cada semana',
                done: true,
              },
              {
                icon: <Icon name="calendar" size={13} color={C.accentDark} />,
                dot: autoBookDates.deadlineIsToday ? 'var(--warning)' : C.accentDark,
                label: lang === 'en'
                  ? `Edit deadline: ${autoBookDates.deadlineIsToday ? (lang === 'en' ? 'Today!' : '¡Hoy!') : `Sat. ${autoBookDates.saturdayStr}`}`
                  : `Límite de cambios: ${autoBookDates.deadlineIsToday ? '¡Hoy!' : `Sáb. ${autoBookDates.saturdayStr}`}`,
                sub: lang === 'en'
                  ? 'You can still change your class selection until Saturday'
                  : 'Puedes cambiar tus clases seleccionadas hasta el sábado',
                done: false,
                urgent: autoBookDates.deadlineIsToday,
              },
              {
                icon: <Icon name="calendar" size={13} color={C.accentDark} />,
                dot: C.accentDark,
                label: lang === 'en'
                  ? `Auto-booking: Sun. ${autoBookDates.nextSundayStr}`
                  : `Reserva automática: Dom. ${autoBookDates.nextSundayStr}`,
                sub: lang === 'en'
                  ? `Every Sunday we auto-book your classes for the week ahead`
                  : `Cada domingo reservamos automáticamente tus clases para la semana siguiente`,
                done: false,
              },
              {
                icon: <Icon name="calendar" size={13} color={C.accentDark} />,
                dot: C.accentDark,
                label: lang === 'en'
                  ? `Your classes start: Mon. ${autoBookDates.nextMondayStr}`
                  : `Tus clases empiezan: Lun. ${autoBookDates.nextMondayStr}`,
                sub: lang === 'en'
                  ? 'Check your agenda in the dashboard'
                  : 'Revisa tu agenda en el panel de membresía',
                done: false,
              },
            ].map((step, i, arr) => (
              <Flex key={i} gap={3} align="flex-start" mb={i < arr.length - 1 ? 3 : 0}>
                <Box flexShrink={0} display="flex" flexDirection="column" alignItems="center">
                  <Box w="26px" h="26px" borderRadius="full" flexShrink={0}
                    bg={step.done ? 'var(--success)' : step.urgent ? 'var(--warning-soft)' : 'var(--accent-soft)'}
                    border={`2px solid ${step.done ? 'var(--success)' : step.urgent ? 'color-mix(in srgb, var(--warning) 50%, transparent)' : C.border}`}
                    display="flex" alignItems="center" justifyContent="center">
                    {step.done
                      // Color de la página sobre el verde: contrasta en estilos claros y oscuros
                      ? <Icon name="check-circle" size={11} color="var(--page-bg)" />
                      : <Box w="6px" h="6px" borderRadius="full"
                          bg={step.urgent ? 'var(--warning)' : C.accentDark} />
                    }
                  </Box>
                  {i < arr.length - 1 && (
                    <Box w="1.5px" flex={1} mt={1} minH="16px"
                      bg={step.done ? successMix(25) : C.border} />
                  )}
                </Box>
                <Box pb={i < arr.length - 1 ? 1 : 0}>
                  <Text fontFamily='var(--font-body)' fontWeight={700} fontSize="xs"
                    color={step.urgent ? 'var(--warning)' : C.brown}>
                    {step.label}
                  </Text>
                  <Text fontFamily='var(--font-body)' fontSize="10px"
                    color={C.textMuted} lineHeight="1.55" mt={0.5}>
                    {step.sub}
                  </Text>
                </Box>
              </Flex>
            ))}
          </VStack>
        </Box>

        {/* CTA */}
        <Button w="full" h="46px" className="sk-btn"
          fontFamily='var(--font-body)'
          onClick={() => { window.location.href = '/dashboard?tab=suscripcion'; }}>
          <Flex align="center" gap={2}>
            <Icon name="crown" size={13} />
            {lang === 'en' ? 'Go to my membership' : 'Ir a mi membresía'}
          </Flex>
        </Button>
      </VStack>
    );

    // Sin pagos online no se pueden contratar membresías desde la web
    if (!paymentsOn) return card(<PaymentsDisabledNotice />);

    if (subStep === 'pay' && selectedSubId) return card(
      <>
        <Flex justify="space-between" align="center" mb={4}>
          <Text fontFamily='var(--font-heading)' fontSize="2xl"
            color={C.heading} letterSpacing="0.04em">
            {t('checkout.subPayTitle')}
          </Text>
          <Button variant="ghost" size="sm"
            onClick={() => { cancelPendingPayment(); setSubStep('select'); }}
            color={C.textMuted} fontFamily='var(--font-body)'>
            {t('checkout.back')}
          </Button>
        </Flex>
        <StripePlanForm planId={selectedSubId} couponCode="" />
      </>
    );

    // ── Guard: user already has an active subscription ─────────────────────
    if (activeSubscription) {
      const periodEnd = new Date(activeSubscription.current_period_end)
        .toLocaleDateString(lang === 'en' ? 'en-GB' : 'es-ES', { day: 'numeric', month: 'long', year: 'numeric' });

      return card(
        <VStack gap={4} align="stretch">
          {/* Active plan hero */}
          <Flex align="center" gap={3} p={4} borderRadius="var(--radius-input)"
            bg={successMix(7)} border={`1px solid ${successMix(22)}`}>
            <Box w="44px" h="44px" borderRadius="full" flexShrink={0}
              bg="var(--success-soft)" display="flex" alignItems="center" justifyContent="center">
              <Icon name="crown" size={18} color="var(--success)" />
            </Box>
            <Box flex={1}>
              <Text fontFamily='var(--font-heading)' fontSize="xl"
                color={C.heading} letterSpacing="0.04em">
                {t('checkout.subAlreadyActive')}
              </Text>
              <Text fontFamily='var(--font-body)' fontSize="sm" fontWeight={700} color="var(--success)">
                {planDisplayName(activeSubscription.plan, lang)} · {formatPrice(parseFloat(activeSubscription.plan.price_eur), lang, 0)}{t('plans.subMonth')}
              </Text>
              <Text fontFamily='var(--font-body)' fontSize="xs" color={C.textMuted}>
                {t('dashboard.subscription.periodRenewal')}: {periodEnd}
              </Text>
            </Box>
          </Flex>

          <Text fontFamily='var(--font-body)' fontSize="sm" color={C.textMuted}
            lineHeight="1.65">
            {t('checkout.subAlreadyDesc')}
          </Text>

          {/* Action buttons */}
          <VStack gap={2} align="stretch">
            <Button w="full" h="46px" className="sk-btn"
              fontFamily='var(--font-body)'
              onClick={() => { window.location.href = '/dashboard?tab=suscripcion'; }}>
              <Flex align="center" gap={2}>
                <Icon name="crown" size={13} />
                {t('checkout.subGoAccount')}
              </Flex>
            </Button>

            {/* Change plan — show other plans to pick from */}
            <Text fontFamily='var(--font-body)' fontSize="xs" color={C.textMuted}
              textAlign="center" fontWeight={600} letterSpacing="0.06em"
              textTransform="uppercase" my={1}>
              {t('checkout.subChangePlan')}
            </Text>

            {plansLoading ? (
              <Flex justify="center" py={4}><Spinner color={C.accent} /></Flex>
            ) : (
              <Stack gap={2}>
                {subPlans
                  .filter(p => p.id !== activeSubscription.plan.id)
                  .map(plan => (
                    <PlanCard key={plan.id} plan={plan}
                      selected={selectedSubId === plan.id.toString()}
                      onSelect={() => setSelectedSubId(plan.id.toString())} />
                  ))}
              </Stack>
            )}

            {subPlans.filter(p => p.id !== activeSubscription.plan.id).length > 0 && (
              <>
                <Text fontFamily='var(--font-body)' fontSize="xs" color={C.textMuted}
                  textAlign="center" lineHeight="1.55">
                  {t('checkout.subChangeDesc', { date: periodEnd })}
                </Text>
                <Button w="full" h="44px" className="sk-btn-ghost"
                  variant="outline"
                  fontFamily='var(--font-body)' fontWeight={700}
                  disabled={!selectedSubId || subLoading}
                  onClick={handleSubPayment}>
                  {subLoading
                    ? <Spinner size="sm" color={C.accent} />
                    : t('checkout.subChangeConfirmBtn')
                  }
                </Button>
              </>
            )}
          </VStack>
        </VStack>
      );
    }

    // default: select plan (no active subscription)
    return card(
      <>
        <Text fontFamily='var(--font-heading)' fontSize="2xl"
          color={C.heading} letterSpacing="0.04em" mb={1}>
          {t('checkout.subTitle')}
        </Text>
        <Text fontFamily='var(--font-body)' fontSize="sm" color={C.textMuted} mb={5}>
          {t('checkout.subDesc')}
        </Text>

        {/* ── How it works explainer ── */}
        <Box borderRadius="var(--radius-card)" mb={5}
          border={`1px solid ${C.oliveBorder}`}
          bg={successMix(4)} overflow="hidden">
          {/* Header strip */}
          <Flex align="center" gap={2.5} px={4} py={3}
            bg={successMix(7)}
            borderBottom={`1px solid ${C.oliveBorder}`}>
            <Box w="28px" h="28px" borderRadius="full" flexShrink={0}
              bg="var(--success-soft)"
              display="flex" alignItems="center" justifyContent="center">
              <Icon name="crown" size={12} color={C.olive} />
            </Box>
            <Text fontFamily='var(--font-heading)' fontSize="md"
              color={C.heading} letterSpacing="0.06em">
              {t('dashboard.subscription.howTitle')}
            </Text>
          </Flex>

          {/* Steps */}
          <VStack gap={0} align="stretch" px={4} py={3}>
            {([
              { n: '01', title: t('dashboard.subscription.step01Title'), desc: t('dashboard.subscription.step01Desc') },
              { n: '02', title: t('dashboard.subscription.step02Title'), desc: t('dashboard.subscription.step02Desc') },
              { n: '03', title: t('dashboard.subscription.step03Title'), desc: t('dashboard.subscription.step03Desc') },
            ] as const).map((step, i, arr) => (
              <Flex key={step.n} align="flex-start" gap={3} mb={i < arr.length - 1 ? 3 : 0}>
                {/* Number circle + connecting line */}
                <Box flexShrink={0} display="flex" flexDirection="column" alignItems="center">
                  <Box w="26px" h="26px" borderRadius="full" flexShrink={0}
                    bg={successMix(15)} border={`1.5px solid ${successMix(35)}`}
                    display="flex" alignItems="center" justifyContent="center">
                    <Text fontFamily='var(--font-heading)' fontSize="10px"
                      color={C.olive} letterSpacing="0.04em">{step.n}</Text>
                  </Box>
                  {i < arr.length - 1 && (
                    <Box w="1.5px" flex={1} mt={1} minH="16px" bg={successMix(18)} />
                  )}
                </Box>
                {/* Text */}
                <Box pb={i < arr.length - 1 ? 1 : 0}>
                  <Text fontFamily='var(--font-body)' fontWeight={700}
                    fontSize="sm" color={C.brown}>
                    {step.title}
                  </Text>
                  <Text fontFamily='var(--font-body)' fontSize="xs"
                    color={C.textMuted} lineHeight="1.60" mt={0.5}>
                    {step.desc}
                  </Text>
                </Box>
              </Flex>
            ))}
          </VStack>
        </Box>

        {needsEmailVerify && (
          <Box mb={4}>
            <EmailVerifyCard variant="gate" sendOnMount
              onVerified={() => { setNeedsEmailVerify(false); setTimeout(() => handleSubPayment(), 600); }} />
          </Box>
        )}

        {/* ── Plan selection ── */}
        {plansLoading ? (
          <Flex justify="center" minH="120px" align="center">
            <Spinner color={C.accent} />
          </Flex>
        ) : subPlans.length === 0 ? (
          <Box textAlign="center" py={6}>
            <Icon name="crown" size={28} color={C.accent} style={{ margin: '0 auto 8px' }} />
            <Text fontFamily='var(--font-body)' fontSize="sm" color={C.textMuted}>
              {t('checkout.subNoPlans')}
            </Text>
          </Box>
        ) : (
          <VStack gap={3} align="stretch">
            <Stack gap={3}>
              {subPlans.map(plan => (
                <PlanCard key={plan.id} plan={plan}
                  selected={selectedSubId === plan.id.toString()}
                  onSelect={() => setSelectedSubId(plan.id.toString())} />
              ))}
            </Stack>
            <Button w="full" h="50px" className="sk-btn"
              fontFamily='var(--font-body)' mt={2}
              disabled={!selectedSubId} onClick={handleSubPayment}>
              {t('checkout.subscribeBtn')}
            </Button>
            <Flex justify="center" gap={{ base: 3, md: 5 }} wrap="wrap" mt={1}>
              {(lang === 'en'
                ? ['🔒 Secure payment with Stripe', '↩︎ Cancel anytime', '✓ No commitment']
                : ['🔒 Pago seguro con Stripe', '↩︎ Cancela cuando quieras', '✓ Sin permanencia']
              ).map((txt) => (
                <Text key={txt} fontFamily='var(--font-body)' fontSize="11px"
                  color={C.textMuted} fontWeight={600}>{txt}</Text>
              ))}
            </Flex>
          </VStack>
        )}
      </>
    );
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <Box bg={C.bg}
      pt={{ base: 8, md: 12 }} pb={16} px={{ base: 4, md: 8 }}>
      <Toaster />
      <Box maxW="1200px" mx="auto">

        {/* Header */}
        <MotionBox initial={{ opacity: 0, y: -14 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.44 } as any} mb={8}>
          <Text as="h1" fontFamily='var(--font-heading)'
            fontSize={{ base: '3xl', md: '5xl', lg: '6xl' }}
            color={C.heading} letterSpacing="wide" lineHeight="1">
            {t('checkout.title')}
          </Text>
          <Box mt={3} h="1px" w="120px"
            bg="linear-gradient(90deg, color-mix(in srgb, var(--accent) 60%, transparent), transparent)" />
        </MotionBox>

        {/* Tab selector (only when logged in) */}
        {isLoggedIn && !isAuthLoading && (
          <Flex gap={1.5} mb={7} p={1.5}
            bg={C.card} borderRadius="var(--radius-button)"
            border={`var(--border-width) solid var(--surface-border)`} w="fit-content"
            boxShadow="var(--shadow-card)"
            backdropFilter="var(--surface-blur)"
            style={{ WebkitBackdropFilter: 'var(--surface-blur)' }}>
            {([
              { key: 'credits',      label: t('checkout.tabCredits'), icon: <Icon name="credit-card" size={12} /> },
              { key: 'subscription', label: t('checkout.tabSub'),     icon: <Icon name="crown" size={12} /> },
            ] as const).map(tab => (
              <Button key={tab.key} size="sm" borderRadius="var(--radius-button)" px={4}
                // Pestaña activa = botón principal del estilo (.sk-btn)
                className={activeTab === tab.key ? 'sk-btn' : undefined}
                bg="transparent"
                color={C.textMuted}
                fontFamily='var(--font-body)' fontWeight={700} fontSize="sm"
                _hover={{ bg: 'var(--accent-soft)' }}
                onClick={() => switchTab(tab.key)}>
                <Flex align="center" gap={1.5}>
                  {tab.icon}
                  {tab.label}
                </Flex>
              </Button>
            ))}
          </Flex>
        )}

        <SimpleGrid columns={{ base: 1, lg: 2 }} gap={7}>

          {/* Left: dynamic */}
          <Box>
            {activeTab === 'credits'
              ? renderCreditsTab()
              : (
                <>
                  {isLoggedIn && !(activeSubscription && subStep === 'select') && (
                    <SubscriptionStepper
                      step={subStep === 'select' ? 1 : subStep === 'pay' ? 2 : subStep === 'done' ? 4 : 3}
                      lang={lang}
                    />
                  )}
                  {renderSubscriptionTab()}
                </>
              )}
          </Box>

          {/* Right: cart summary */}
          <Box>
            <Box className="sk-card" p={6}
              position="sticky" top="100px">

              <Text fontFamily='var(--font-heading)' fontSize="xl"
                color={C.heading} letterSpacing="0.04em" mb={4}>
                {t('checkout.summaryTitle', { count: String(items.length), class: items.length === 1 ? t('checkout.summaryClass') : t('checkout.summaryClasses') })}
              </Text>

              {items.length === 0 ? (
                <Text fontFamily='var(--font-body)' fontSize="sm"
                  color={C.textMuted} py={4} textAlign="center">
                  {t('checkout.summaryEmpty')}
                </Text>
              ) : (
                <Box maxH="280px" overflowY="auto" pr={1}>
                  {items.map(item => <CartItemRow key={item.id} item={item} />)}
                </Box>
              )}
              {/* Reservar es un toque en el horario: desde aquí se puede volver a por más */}
              <a className="w-more" href="/calendar" style={{ marginTop: 4 }}>
                + {lang === 'en' ? 'Add another class' : 'Añadir otra clase'}
              </a>

              {/* Totals */}
              <Box my={4} h="1px" bg={C.border} />
              <VStack gap={2} align="stretch">
                <Flex justify="space-between">
                  <Text fontFamily='var(--font-body)' fontSize="sm" color={C.textMuted}>
                    {t('checkout.totalCredits')}
                  </Text>
                  <Text fontFamily='var(--font-body)' fontSize="sm"
                    fontWeight={700} color={C.brown}>
                    {totalCredits} {t('checkout.creditsUnit')}
                  </Text>
                </Flex>
                {!isLoggedIn && (
                  <Flex justify="space-between">
                    <Text fontFamily='var(--font-body)' fontSize="sm" color={C.textMuted}>
                      {t('checkout.totalPrice')}
                    </Text>
                    <Text fontFamily='var(--font-body)' fontSize="sm"
                      fontWeight={700} color={C.brown}>
                      {formatPrice(totalPrice, lang)}
                    </Text>
                  </Flex>
                )}
              </VStack>

              {/* Balance (logged in) */}
              {isLoggedIn && (
                <>
                  <Box my={3} h="1px" bg={C.border} />
                  {balanceLoading ? (
                    <Flex justify="center" py={3}><Spinner color={C.accent} size="sm" /></Flex>
                  ) : userBalance !== null ? (
                    <VStack gap={2} align="stretch">
                      <Flex justify="space-between" align="center">
                        <Text fontFamily='var(--font-body)' fontSize="sm" color={C.textMuted}>
                          {t('checkout.yourBalance')}
                        </Text>
                        <Text fontFamily='var(--font-heading)'
                          fontSize="xl" color={C.accent}>
                          {userBalance.toFixed(2)} {t('checkout.creditsUnit')}
                        </Text>
                      </Flex>
                      {remainingBalance !== null && totalCredits > 0 && (
                        <Flex justify="space-between">
                          <Text fontFamily='var(--font-body)' fontSize="sm" color={C.textMuted}>
                            {t('checkout.afterBooking')}
                          </Text>
                          <Text fontFamily='var(--font-body)' fontSize="sm" fontWeight={700}
                            color={remainingBalance < 0 ? 'var(--danger)' : C.brown}>
                            {remainingBalance.toFixed(2)} {t('checkout.creditsUnit')}
                          </Text>
                        </Flex>
                      )}
                    </VStack>
                  ) : (
                    <Text fontFamily='var(--font-body)' fontSize="sm" color="var(--danger)">
                      {t('checkout.noBalanceError')}
                    </Text>
                  )}
                </>
              )}

              {/* Credit warning */}
              {showCreditWarning && (
                <Flex align="flex-start" gap={2} mt={3} p={3} borderRadius="var(--radius-input)"
                  bg="var(--warning-soft)" border="1px solid color-mix(in srgb, var(--warning) 25%, transparent)">
                  <Icon name="warning" size={14} color="var(--warning)" style={{ flexShrink: 0, marginTop: 2 }} />
                  <Box>
                    <Text fontFamily='var(--font-body)' fontSize="sm"
                      fontWeight={700} color="var(--warning)">
                      {t('checkout.insufficientTitle')}
                    </Text>
                    <Text fontFamily='var(--font-body)' fontSize="xs" color={C.textMuted}>
                      {t('checkout.insufficientDesc', { count: String(Math.ceil(totalCredits - (userBalance || 0))) })}
                    </Text>
                  </Box>
                </Flex>
              )}

              {/* Coupon */}
              <Box mt={4}>
                <Box h="1px" bg={C.border} mb={4} />
                <Text fontFamily='var(--font-body)' fontSize="xs"
                  color={C.textMuted} mb={2}>
                  {t('checkout.couponLabel')}
                </Text>
                {appliedCoupon ? (
                  <Flex align="center" justify="space-between" p={2.5} borderRadius="var(--radius-input)"
                    bg="var(--accent-soft)" border="1px solid var(--accent-border)">
                    <Text fontFamily='var(--font-body)' fontSize="xs"
                      color={C.accent} fontWeight={700}>
                      {t('checkout.couponApplied', { code: appliedCoupon.code })}
                    </Text>
                    <IconButton aria-label={t('checkout.couponRemoveLabel')} variant="ghost" size="xs"
                      color={C.textMuted}
                      onClick={() => {
                        setAppliedCoupon(null);
                        setOfferCode('');
                        setIsEmailLocked(false);
                      }}>
                      <Icon name="trash" size={10} />
                    </IconButton>
                  </Flex>
                ) : (
                  <Flex gap={2}>
                    <Input placeholder={t('checkout.couponPlaceholder')} value={offerCode}
                      onChange={e => setOfferCode(e.target.value.toUpperCase())}
                      size="sm" className="sk-input"
                      fontFamily='var(--font-body)' />
                    <Button size="sm" variant="outline" borderColor="var(--input-border)"
                      color={C.textMuted} borderRadius="var(--radius-input)"
                      disabled={!offerCode || isCouponLoading}
                      onClick={handleApplyCoupon}>
                      {isCouponLoading ? <Spinner size="sm" /> : t('checkout.couponApply')}
                    </Button>
                  </Flex>
                )}
              </Box>

              {/* Reserve button */}
              {isLoggedIn && (
                <Button ref={reserveButtonRef as any} w="full" h="50px" mt={4}
                  // .sk-btn ya atenúa el botón deshabilitado (sin saldo suficiente)
                  className="sk-btn"
                  fontFamily='var(--font-body)' fontSize="sm"
                  cursor={canReserve ? 'pointer' : 'not-allowed'}
                  disabled={!canReserve || isSubmitting}
                  onClick={handleCreditBooking}>
                  {isSubmitting
                    ? <Spinner size="sm" color="inherit" />
                    : (
                      <Flex align="center" gap={2}>
                        <Icon name="check-circle" size={14} />
                        {totalCredits > 0
                          ? t('checkout.reserveBtn', { credits: String(totalCredits) })
                          : t('checkout.reserveBtn', { credits: '0' })}
                      </Flex>
                    )}
                </Button>
              )}
            </Box>
          </Box>
        </SimpleGrid>
      </Box>

      {/* ── Pantalla de éxito post-reserva con aviso de spam ─────────────── */}
      <Dialog.Root
        open={showPostReserveSuccess}
        onOpenChange={d => setShowPostReserveSuccess(d.open)}
        placement="center"
        motionPreset="slide-in-bottom">
        <Portal>
          <Dialog.Backdrop
            bg="var(--overlay)"
            backdropFilter="var(--surface-blur)" />
          <Dialog.Positioner>
            <Dialog.Content
              className="sk-panel"
              overflow="hidden"
              maxW="500px">
              {/* Banda verde de éxito: texto del color de la página (claro sobre
                  el verde oscuro de los estilos claros, oscuro sobre el verde
                  claro de energy/neon) */}
              <Box bg="var(--success)" p={6} textAlign="center">
                <Icon name="check-circle" size={48} color="var(--page-bg)" style={{ margin: '0 auto 8px' }} />
                <Dialog.Title
                  color="var(--page-bg)"
                  fontFamily='var(--font-heading)'
                  fontSize="2xl"
                  letterSpacing="0.04em">
                  {successKind === 'pack'
                    ? (lang === 'en' ? 'Credits added!' : '¡Créditos añadidos!')
                    : t('checkout.reserveSuccess')}
                </Dialog.Title>
                <Text color="var(--page-bg)" opacity={0.9} fontSize="sm"
                  fontFamily='var(--font-body)' mt={1}>
                  {successKind === 'pack'
                    ? (lang === 'en'
                        ? `You now have ${userBalance?.toFixed(0) ?? ''} credits. Last step: choose your class.`
                        : `Ya tienes ${userBalance?.toFixed(0) ?? ''} créditos. Último paso: elige tu clase.`)
                    : t('checkout.reserveSuccessDesc')}
                </Text>
              </Box>

              <Dialog.Body p={5}>
                {successKind === 'pack' && (
                  <FlowStepper step={3} labels={lang === 'en' ? ['Pack', 'Payment', 'Book'] : ['Bono', 'Pago', 'Reservar']} ariaLabel={lang === 'en' ? 'Progress' : 'Progreso'} />
                )}
                <SpamWarning variant={successKind === 'pack' ? 'payment' : 'booking'} email={userEmail || undefined} />
                {successKind === 'booking' && showInstallHint && (
                  <Box mt={3}><InstallInlineHint /></Box>
                )}
                {successKind === 'booking' && (
                  <Box mt={4}><MembershipSuggestionCard variant="success" /></Box>
                )}
              </Dialog.Body>

              <Dialog.Footer p={5} pt={0}>
                <Flex w="100%" gap={2}>
                  <Button
                    flex={1} h="46px" borderRadius="var(--radius-button)"
                    variant="outline" borderColor={C.border} color={C.textMuted}
                    fontFamily='var(--font-body)' fontWeight={700}
                    onClick={() => setShowPostReserveSuccess(false)}>
                    {successKind === 'pack' ? (lang === 'en' ? 'Later' : 'Más tarde') : t('checkout.closeBtn')}
                  </Button>
                  <Button
                    flex={1} h="46px" className="sk-btn"
                    fontFamily='var(--font-body)'
                    onClick={() => {
                      window.location.href = successKind === 'pack' ? '/calendar' : '/dashboard?tab=agenda';
                    }}>
                    {successKind === 'pack'
                      ? (lang === 'en' ? 'Book my class' : 'Reservar mi clase')
                      : t('checkout.goToBookings')}
                  </Button>
                </Flex>
              </Dialog.Footer>
            </Dialog.Content>
          </Dialog.Positioner>
        </Portal>
      </Dialog.Root>

      {/* ── Booking confirmation modal ─────────────────────────────────────── */}
      <Dialog.Root
        open={isModalOpen}
        onOpenChange={d => { if (!isSubmitting) setIsModalOpen(d.open); }}
        placement="center"
        motionPreset="slide-in-bottom">
        <Portal>
          <Dialog.Backdrop
            bg="var(--overlay)"
            backdropFilter="var(--surface-blur)" />
          <Dialog.Positioner>
            <Dialog.Content
              className="sk-panel" overflow="hidden">
              {/* Cabecera con relleno primario (siempre opaco, también en
                  editorial/neón donde --button-bg es transparente o tenue) */}
              <Box bg="var(--accent)" p={6} textAlign="center">
                <Icon name="check-circle" size={40} color="var(--on-primary)"
                  style={{ margin: '0 auto 8px' }} />
                <Dialog.Title
                  color="var(--on-primary)"
                  fontFamily='var(--font-heading)'
                  fontSize="2xl" letterSpacing="0.04em">
                  {t('checkout.confirmTitle')}
                </Dialog.Title>
                <Text color="var(--on-primary)" opacity={0.85} fontSize="sm"
                  fontFamily='var(--font-body)'>
                  {t('checkout.confirmDesc')}
                </Text>
              </Box>

              <Dialog.Body p={6}>
                <Box p={4} borderRadius="var(--radius-input)"
                  bg="var(--surface-muted)" border={`1px solid ${C.border}`}>
                  <Flex justify="space-between" mb={2}>
                    <Text fontFamily='var(--font-body)' fontSize="sm" color={C.textMuted}>
                      {t('checkout.newBalance')}
                    </Text>
                    <Text fontFamily='var(--font-body)' fontWeight={700} color={C.accent}>
                      {userBalance?.toFixed(2)} {t('checkout.creditsUnit')}
                    </Text>
                  </Flex>
                  <Flex justify="space-between" mb={2}>
                    <Text fontFamily='var(--font-body)' fontSize="sm" color={C.textMuted}>
                      {t('checkout.bookingCost')}
                    </Text>
                    <Text fontFamily='var(--font-body)' fontWeight={700} color={C.brown}>
                      -{totalCredits.toFixed(2)} {t('checkout.creditsUnit')}
                    </Text>
                  </Flex>
                  <Box h="1px" bg={C.border} my={2} />
                  <Flex justify="space-between">
                    <Text fontFamily='var(--font-body)' fontSize="sm" color={C.textMuted}>
                      {t('checkout.remaining')}
                    </Text>
                    <Text fontFamily='var(--font-body)' fontWeight={700} color={C.brown}>
                      {userBalance && (userBalance - totalCredits).toFixed(2)} {t('checkout.creditsUnit')}
                    </Text>
                  </Flex>
                </Box>
                <Text fontFamily='var(--font-body)' fontSize="sm"
                  color={C.textMuted} textAlign="center" mt={3}>
                  {t('checkout.confirmQuestion', { count: String(items.length) })}
                </Text>
              </Dialog.Body>

              <Dialog.Footer p={6} pt={2}>
                <Button w="full" h="48px" className="sk-btn"
                  fontFamily='var(--font-body)'
                  onClick={handleCreditBooking} disabled={isSubmitting}>
                  {isSubmitting
                    ? <Spinner size="sm" color="inherit" />
                    : t('checkout.confirmBooking')}
                </Button>
              </Dialog.Footer>

              <Dialog.CloseTrigger asChild
                position="absolute" top="3" right="3"
                disabled={isSubmitting}>
                <CloseButton size="sm" color="var(--on-primary)"
                  _hover={{ bg: 'rgba(255,255,255,0.20)' }} />
              </Dialog.CloseTrigger>
            </Dialog.Content>
          </Dialog.Positioner>
        </Portal>
      </Dialog.Root>
    </Box>
  );
}

// ── Indicador de pasos del alta de membresía ─────────────────────────────────
function SubscriptionStepper({ step, lang }: { step: 1 | 2 | 3 | 4; lang: string }) {
  const labels = lang === 'en'
    ? ['Plan', 'Payment', 'Your classes', 'Done']
    : ['Plan', 'Pago', 'Tus clases', '¡Listo!'];
  return <FlowStepper step={step} labels={labels} ariaLabel={lang === 'en' ? 'Progress' : 'Progreso'} />;
}

function FlowStepper({ step, labels, ariaLabel = 'Progreso' }: { step: number; labels: string[]; ariaLabel?: string }) {
  return (
    <Flex as="ol" listStyleType="none" m={0} p={0} mb={4} align="center"
      aria-label={ariaLabel}>
      {labels.map((label, i) => {
        const n = i + 1;
        const done = n < step;
        const current = n === step;
        return (
          <Flex as="li" key={label} align="center" flex={n < labels.length ? 1 : '0 0 auto'}
            aria-current={current ? 'step' : undefined}>
            <Flex direction="column" align="center" gap={1} minW="56px">
              <Flex w="30px" h="30px" borderRadius="full" align="center" justify="center"
                bg={done ? 'var(--success)' : current ? 'var(--accent)' : 'var(--accent-soft)'}
                // Hecho: color de la página sobre el verde (contrasta en claro y oscuro)
                color={done ? 'var(--page-bg)' : current ? 'var(--on-primary)' : 'var(--text-muted)'}
                boxShadow={current ? '0 3px 10px color-mix(in srgb, var(--accent) 35%, transparent)' : 'none'}
                fontFamily='var(--font-body)' fontWeight={800} fontSize="xs"
                transition="all .25s ease">
                {done ? <Icon name="check-circle" size={13} /> : n}
              </Flex>
              <Text fontFamily='var(--font-body)' fontSize="10px" fontWeight={current ? 800 : 600}
                color={current ? 'var(--page-text)' : 'var(--text-muted)'} whiteSpace="nowrap">
                {label}
              </Text>
            </Flex>
            {n < labels.length && (
              <Box flex={1} h="2px" mx={1} mb="18px" borderRadius="full"
                bg={done ? successMix(45) : 'var(--accent-border)'} />
            )}
          </Flex>
        );
      })}
    </Flex>
  );
}

export default function CheckoutPage() {
  return <Chakra><CheckoutPageInner /></Chakra>;
}
