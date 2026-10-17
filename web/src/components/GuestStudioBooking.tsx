"use client";
// «Pagar en el estudio»: guardar la plaza ahora y pagar al llegar, si el
// estudio lo tiene encendido en Ajustes → Cobros («Formas de cobro»).
//  - Invitado (sin cuenta): deja email, nombre y teléfono.
//    API: POST /api/v1/checkout/guest-reserve/
//  - Cliente con cuenta (`account`): sin formulario.
//    API: POST /api/v1/checkout/studio-reserve/
// (api/api/views_guest.py). Enseña las formas de pago y la nota del estudio.
import React, { useState } from 'react';
import { Alert, Box, Button, Field, Input, Spinner, Text, VStack } from '@chakra-ui/react';
import { PhoneInput } from 'react-international-phone';
import 'react-international-phone/style.css';
import { Icon } from './ui/Icon';
import Turnstile from './Turnstile';
import SpamWarning from './SpamWarning';
import { useCartStore, type CartItem } from './stores/car.store';
import { useT, formatPrice } from '../i18n';
import { useLangStore } from './stores/lang.store';
import { API_V1 } from '../config';
import { getSiteClient } from '../lib/site';
import { fmtDate, fmtTime } from '../utils/formatDate';
import { tr } from '../utils/localized';
import { track } from '../lib/tracking';
import { studioMethodsText, studioPayNote } from '../utils/payments';

const COPY = {
  es: {
    title: 'Reserva sin cuenta',
    intro: 'Guarda tu plaza ahora y paga en el estudio al llegar.',
    submit: (p: string) => `Reservar y pagar en el estudio · ${p}`,
    submitFree: 'Reservar mi plaza',
    payAt: 'Pagas en el estudio al llegar.',
    payAtHow: (m: string) => `Pagas en el estudio al llegar, en ${m}.`,
    clientTitle: 'Pagar en el estudio',
    clientIntro: 'Guardamos tu plaza y pagas al llegar.',
    mine: 'Ver mis reservas',
    doneTitle: '¡Plaza reservada!',
    doneDesc: (email: string) => `Te hemos enviado la confirmación a ${email}.`,
    toPay: (p: string) => `A pagar en el estudio: ${p}`,
    more: 'Reservar otra clase',
    account: 'Crear mi cuenta (opcional)',
    accountHint: 'Con cuenta puedes ver y cancelar tus reservas y comprar bonos.',
    error: 'No se ha podido reservar. Inténtalo de nuevo.',
    payOnline: 'Este estudio ya no admite pagar en el estudio. Recarga la página para ver cómo reservar.',
  },
  en: {
    title: 'Book without an account',
    intro: 'Save your spot now and pay at the studio when you arrive.',
    submit: (p: string) => `Book and pay at the studio · ${p}`,
    submitFree: 'Book my spot',
    payAt: 'You pay at the studio when you arrive.',
    payAtHow: (m: string) => `You pay at the studio when you arrive, by ${m}.`,
    clientTitle: 'Pay at the studio',
    clientIntro: "We'll save your spot and you pay when you arrive.",
    mine: 'See my bookings',
    doneTitle: 'Spot booked!',
    doneDesc: (email: string) => `We've sent the confirmation to ${email}.`,
    toPay: (p: string) => `To pay at the studio: ${p}`,
    more: 'Book another class',
    account: 'Create my account (optional)',
    accountHint: 'With an account you can see and cancel your bookings and buy class packs.',
    error: "We couldn't book it. Please try again.",
    payOnline: "This studio doesn't take payment at the studio any more. Reload the page to see how to book.",
  },
};

interface Done { email: string; total: number; items: CartItem[] }

export default function GuestStudioBooking({ onBooked, account, hideTitle = false }: {
  onBooked?: () => void;
  /** Cliente con sesión: reserva a su nombre, sin formulario */
  account?: { token: string; email?: string | null };
  /** Sin título propio (va debajo de «¿Cómo quieres pagar?») */
  hideTitle?: boolean;
} = {}) {
  const t = useT();
  const lang = useLangStore((s) => s.lang) === 'en' ? 'en' : 'es';
  const L = COPY[lang];
  const locale = lang === 'en' ? 'en-GB' : 'es-ES';
  const items = useCartStore((s) => s.items);
  const clearCart = useCartStore((s) => s.clearCart);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<Done | null>(null);
  const captchaKey = getSiteClient().turnstile_site_key;
  const [captcha, setCaptcha] = useState('');
  const [captchaReset, setCaptchaReset] = useState(0);

  const total = items.reduce((a, i) => a + (Number(i.price) || 0), 0);
  const methods = studioMethodsText(lang);
  const note = studioPayNote(lang);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (account) return submitAccount();
    if (!name.trim() || name.trim().length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) {
      setError(t('checkout.guestAllFields'));
      return;
    }
    if (phone.replace(/\D/g, '').length < 7) {
      setError(t('checkout.guestPhoneInvalid'));
      return;
    }
    if (captchaKey && !captcha) return;
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`${API_V1}/checkout/guest-reserve/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(), name: name.trim(), phone, cart_items: items,
          ...(captcha ? { turnstile_token: captcha } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.code === 'pay_at_studio_disabled' || data.code === 'pay_online' ? L.payOnline : (data.error || L.error));
        return;
      }
      const snapshot = [...items];
      for (const it of snapshot) track('book', { class_name: it.title });
      onBooked?.();
      clearCart();
      setDone({ email: String(data.email || email.trim()), total: Number(data.total) || 0, items: snapshot });
    } catch {
      setError(L.error);
    } finally {
      setBusy(false);
      if (captchaKey) { setCaptcha(''); setCaptchaReset((n) => n + 1); }
    }
  };

  // Cliente con cuenta: mismas reservas, a su nombre
  const submitAccount = async () => {
    if (!account) return;
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`${API_V1}/checkout/studio-reserve/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${account.token}` },
        body: JSON.stringify({ cart_items: items }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.code === 'pay_at_studio_disabled' ? L.payOnline : (data.error || data.detail || L.error));
        return;
      }
      const snapshot = [...items];
      for (const it of snapshot) track('book', { class_name: it.title });
      onBooked?.();
      clearCart();
      setDone({ email: String(data.email || account.email || ''), total: Number(data.total) || 0, items: snapshot });
    } catch {
      setError(L.error);
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <Box role="status" textAlign="center" py={2} data-testid="guest-studio-done">
        <Box w="56px" h="56px" borderRadius="full" bg="var(--success-soft)" color="var(--success)"
          display="flex" alignItems="center" justifyContent="center" mx="auto" mb={3}>
          <Icon name="check-circle" size={26} aria-hidden />
        </Box>
        <Text as="h2" fontFamily="var(--font-heading)" fontSize="2xl" color="var(--heading-color)" mb={1}>{L.doneTitle}</Text>
        <Text fontSize="sm" color="var(--text-muted)" mb={4}>{L.doneDesc(done.email)}</Text>
        <Box as="ul" listStyleType="none" m={0} p={0} textAlign="left" mb={4}>
          {done.items.map((it) => (
            <Box as="li" key={it.id} py={2} borderBottom="1px solid var(--border-neutral)">
              <Text fontWeight={700} fontSize="sm" color="var(--page-text)">{tr(it, 'title', lang) || it.title}</Text>
              <Text fontSize="xs" color="var(--text-muted)">
                {fmtDate(it.sessionDate, locale, { weekday: 'long', day: 'numeric', month: 'short' })} · {fmtTime(it.sessionDate, locale, { hour: '2-digit', minute: '2-digit' })}
              </Text>
            </Box>
          ))}
        </Box>
        {done.total > 0 && (
          <Text fontWeight={700} color="var(--accent-text)" mb={1}>{L.toPay(formatPrice(done.total, lang))}</Text>
        )}
        {(methods || note) && (
          <Text fontSize="sm" color="var(--text-muted)" mb={4}>{[methods && (lang === 'en' ? `By ${methods}.` : `En ${methods}.`), note].filter(Boolean).join(' ')}</Text>
        )}
        {done.email && <SpamWarning variant="booking" email={done.email} />}
        <VStack gap={2} mt={5}>
          <a className="w-btn w-btn--block sk-btn" href="/calendar">{L.more}</a>
          {account
            ? <a className="w-btn w-btn--block sk-btn-ghost" href="/dashboard?tab=agenda">{L.mine}</a>
            : <>
              <a className="w-btn w-btn--block sk-btn-ghost" href="/login">{L.account}</a>
              <Text fontSize="xs" color="var(--text-muted)">{L.accountHint}</Text>
            </>}
        </VStack>
      </Box>
    );
  }

  const payAtLine = (
    <Text fontSize="xs" color="var(--text-muted)" display="flex" gap={2} alignItems="flex-start" data-testid="pay-at-studio-how">
      <Icon name="store" size={14} aria-hidden style={{ flexShrink: 0, marginTop: 2 }} />
      <span>{methods ? L.payAtHow(methods) : L.payAt}{note ? ` ${note}` : ''}</span>
    </Text>
  );

  if (account) {
    return (
      <VStack as="form" gap={3} align="stretch" onSubmit={submit} noValidate>
        {!hideTitle && <Text as="h2" fontFamily="var(--font-heading)" fontSize="2xl" color="var(--heading-color)">{L.clientTitle}</Text>}
        {!hideTitle && <Text fontSize="sm" color="var(--text-muted)">{L.clientIntro}</Text>}
        {error && (
          <Alert.Root status="error" borderRadius="var(--radius-input)">
            <Alert.Description fontFamily="var(--font-body)">{error}</Alert.Description>
          </Alert.Root>
        )}
        {!hideTitle && payAtLine}
        <Button type="submit" w="full" h="48px" className="sk-btn" fontFamily="var(--font-body)"
          disabled={busy || items.length === 0} aria-busy={busy} data-testid="studio-reserve-btn">
          {busy ? <Spinner size="sm" color="inherit" /> : total > 0 ? L.submit(formatPrice(total, lang)) : L.submitFree}
        </Button>
      </VStack>
    );
  }

  return (
    <>
      {!hideTitle && <Text as="h2" fontFamily="var(--font-heading)" fontSize="2xl" color="var(--heading-color)" mb={1}>{L.title}</Text>}
      {!hideTitle && <Text fontSize="sm" color="var(--text-muted)" mb={4}>{L.intro}</Text>}
      <VStack as="form" gap={3} align="stretch" onSubmit={submit} noValidate>
        {error && (
          <Alert.Root status="error" borderRadius="var(--radius-input)">
            <Alert.Description fontFamily="var(--font-body)">{error}</Alert.Description>
          </Alert.Root>
        )}
        <Field.Root required>
          <Field.Label fontSize="sm" color="var(--text-muted)">{t('checkout.guestEmail')}</Field.Label>
          <Input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)}
            className="sk-input" name="email" />
        </Field.Root>
        <Field.Root required>
          <Field.Label fontSize="sm" color="var(--text-muted)">{t('checkout.guestName')}</Field.Label>
          <Input type="text" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)}
            className="sk-input" name="name" />
        </Field.Root>
        <Field.Root required>
          <Field.Label fontSize="sm" color="var(--text-muted)">{t('checkout.guestPhone')}</Field.Label>
          <Box w="full" css={{
            '& .react-international-phone-input-container': { width: '100% !important' },
            '& .react-international-phone-input': { width: '100% !important', height: '40px !important' },
            '--react-international-phone-background-color': 'var(--input-bg)',
            '--react-international-phone-text-color': 'var(--page-text)',
            '--react-international-phone-border-color': 'var(--input-border)',
            '--react-international-phone-border-radius': 'var(--radius-input)',
            '--react-international-phone-country-selector-background-color-hover': 'var(--surface-muted)',
            '--react-international-phone-dropdown-item-background-color': 'var(--surface-strong)',
            '--react-international-phone-dropdown-item-dial-code-color': 'var(--text-muted)',
            '--react-international-phone-selected-dropdown-item-background-color': 'var(--accent-soft)',
            '--react-international-phone-dropdown-shadow': 'var(--shadow-float)',
          }}>
            <PhoneInput defaultCountry={(getSiteClient().country || 'es').toLowerCase()} value={phone} onChange={setPhone}
              inputProps={{ name: 'phone', autoComplete: 'tel', 'aria-label': t('checkout.guestPhone') }} />
          </Box>
        </Field.Root>
        {captchaKey && <Turnstile siteKey={captchaKey} lang={lang} onToken={setCaptcha} resetKey={captchaReset} />}
        {/* Con «¿Cómo quieres pagar?» encima, las formas y la nota ya se ven ahí */}
        {!hideTitle && payAtLine}
        <Button type="submit" w="full" h="48px" className="sk-btn" fontFamily="var(--font-body)"
          disabled={busy || items.length === 0 || (!!captchaKey && !captcha)} aria-busy={busy}>
          {busy ? <Spinner size="sm" color="inherit" /> : total > 0 ? L.submit(formatPrice(total, lang)) : L.submitFree}
        </Button>
      </VStack>
    </>
  );
}
