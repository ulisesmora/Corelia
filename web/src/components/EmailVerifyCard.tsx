"use client";

import { useEffect, useId, useRef, useState } from 'react';
import { FaCheckCircle, FaEnvelope } from 'react-icons/fa';
import { useLangStore } from './stores/lang.store';
import { API_ROOT } from '../config';
import { getSiteClient } from '../lib/site';

const API = `${API_ROOT}/`;

const C = {
  brand: 'var(--brand-primary)',
  brandDark: 'color-mix(in srgb, var(--brand-primary) 48%, var(--brand-dark))',
  brown: 'var(--brand-dark)',
  muted: 'color-mix(in srgb, var(--brand-secondary) 64%, var(--brand-dark))',
  ok: '#2D7D46',
  warn: '#B7791F',
  err: '#B42318',
};

function token(): string | null {
  try { return localStorage.getItem('accessToken'); } catch { return null; }
}

/** Mapa de erratas frecuentes en dominios de email → sugerencia. */
const DOMAIN_FIXES: Record<string, string> = {
  'gmial.com': 'gmail.com', 'gmai.com': 'gmail.com', 'gmal.com': 'gmail.com', 'gamil.com': 'gmail.com',
  'gmail.co': 'gmail.com', 'gmail.es': 'gmail.com', 'gmail.con': 'gmail.com', 'gnail.com': 'gmail.com',
  'hotmial.com': 'hotmail.com', 'hotmal.com': 'hotmail.com', 'hotmail.co': 'hotmail.com', 'hotmail.con': 'hotmail.com',
  'hotmai.com': 'hotmail.com', 'hotmail.es.': 'hotmail.es', 'outlok.com': 'outlook.com', 'outlook.co': 'outlook.com',
  'outllok.com': 'outlook.com', 'yaho.com': 'yahoo.com', 'yahoo.co': 'yahoo.com', 'yahooo.com': 'yahoo.com',
  'iclod.com': 'icloud.com', 'icloud.co': 'icloud.com', 'icoud.com': 'icloud.com', 'icluod.com': 'icloud.com',
};

/** "ana@gmial.com" → "ana@gmail.com"; null si no hay errata conocida. */
export function suggestEmailFix(email: string): string | null {
  const at = email.lastIndexOf('@');
  if (at < 1) return null;
  const domain = email.slice(at + 1).trim().toLowerCase();
  const fix = DOMAIN_FIXES[domain];
  return fix ? `${email.slice(0, at)}@${fix}` : null;
}

const T = {
  es: {
    title: 'Confirma tu email',
    desc: (email: string) => <>Te hemos enviado un código de 6 números{email ? <> a <b>{email}</b></> : ''}. Escríbelo aquí:</>,
    descGate: 'Para activar la membresía necesitamos confirmar tu email. Te hemos enviado un código de 6 números:',
    codeLabel: 'Código de 6 números',
    confirm: 'Confirmar',
    confirming: 'Comprobando…',
    resend: 'Reenviar código',
    resendIn: (s: number) => `Reenviar en ${s} s`,
    sent: 'Código enviado. Mira también en spam o promociones.',
    later: 'Lo haré luego',
    done: '¡Email confirmado!',
    hint: `¿No lo encuentras? Busca "${getSiteClient().studio_name}" en tu correo o revisa spam.`,
    errIncomplete: 'Escribe los 6 números del código.',
    errWrong: (left: number) => `Código incorrecto. Te quedan ${left} ${left === 1 ? 'intento' : 'intentos'}.`,
    errWrongPlain: 'Código incorrecto. Revísalo e inténtalo de nuevo.',
    errExpired: 'El código ha caducado. Pide uno nuevo con "Reenviar código".',
    errNoCode: 'No hay ningún código activo. Pide uno nuevo con "Reenviar código".',
    errTooMany: 'Demasiados intentos. Pide un código nuevo con "Reenviar código".',
    errWait: (s: number) => `Espera ${s} s para pedir otro código.`,
    errSendFailed: 'No hemos podido enviar el código. Inténtalo en un momento.',
    errSession: 'Tu sesión ha caducado. Vuelve a entrar para confirmar tu email.',
    errNetwork: 'No hay conexión. Revisa tu internet e inténtalo de nuevo.',
    errGeneric: 'No hemos podido comprobarlo. Inténtalo de nuevo.',
  },
  en: {
    title: 'Confirm your email',
    desc: (email: string) => <>We've sent you a 6-digit code{email ? <> to <b>{email}</b></> : ''}. Type it here:</>,
    descGate: 'To activate the membership we need to confirm your email. We sent you a 6-digit code:',
    codeLabel: '6-digit code',
    confirm: 'Confirm',
    confirming: 'Checking…',
    resend: 'Resend code',
    resendIn: (s: number) => `Resend in ${s}s`,
    sent: 'Code sent. Check spam or promotions too.',
    later: "I'll do it later",
    done: 'Email confirmed!',
    hint: `Can't find it? Search your inbox for "${getSiteClient().studio_name}" or check spam.`,
    errIncomplete: 'Enter all 6 digits of the code.',
    errWrong: (left: number) => `Wrong code. You have ${left} ${left === 1 ? 'attempt' : 'attempts'} left.`,
    errWrongPlain: 'Wrong code. Check it and try again.',
    errExpired: 'The code has expired. Tap "Resend code" to get a new one.',
    errNoCode: 'There is no active code. Tap "Resend code" to get a new one.',
    errTooMany: 'Too many attempts. Tap "Resend code" to get a new one.',
    errWait: (s: number) => `Please wait ${s}s before requesting another code.`,
    errSendFailed: "We couldn't send the code. Please try again in a moment.",
    errSession: 'Your session has expired. Log in again to confirm your email.',
    errNetwork: 'No connection. Check your internet and try again.',
    errGeneric: "We couldn't check it. Please try again.",
  },
};
type Tx = typeof T.es;

/** Traduce los mensajes del backend (llegan en español, api/utils/verification.py). */
function mapVerifyError(status: number, msg: string, tx: Tx): string {
  if (status === 401) return tx.errSession;
  const m = (msg || '').toLowerCase();
  const left = /quedan\s+(\d+)/.exec(m);
  if (left) return tx.errWrong(Number(left[1]));
  if (m.includes('incorrecto')) return tx.errWrongPlain;
  if (m.includes('caducado')) return tx.errExpired;
  if (m.includes('ningún código') || m.includes('ningun codigo')) return tx.errNoCode;
  if (m.includes('demasiados')) return tx.errTooMany;
  if (m.includes('6 números') || m.includes('6 numeros')) return tx.errIncomplete;
  return tx.errGeneric;
}

/**
 * Tarjeta para confirmar el email con el código de 6 dígitos, sin salir de la
 * pantalla (funciona dentro de la app instalada, donde un enlace abriría otro
 * navegador). Se autooculta si el email ya está confirmado.
 *
 * - `variant="gate"`: se usa al contratar la membresía (texto explicativo).
 * - `onVerified`: se llama al confirmar.
 * - `onLater`: si se pasa, muestra el botón "Lo haré luego".
 * - `justRegistered`: recién creada la cuenta (sabemos que no está verificada
 *   y que el backend acaba de enviar el código): no consulta /me y arranca la
 *   cuenta atrás del reenvío.
 */
export default function EmailVerifyCard({
  email: emailProp, variant = 'default', onVerified, onLater, sendOnMount = false, justRegistered = false,
}: {
  email?: string;
  variant?: 'default' | 'gate';
  onVerified?: () => void;
  onLater?: () => void;
  sendOnMount?: boolean;
  justRegistered?: boolean;
}) {
  const lang = useLangStore((s) => s.lang);
  const tx = lang === 'en' ? T.en : T.es;

  const [state, setState] = useState<'checking' | 'pending' | 'verified' | 'hidden'>(justRegistered ? 'pending' : 'checking');
  const [email, setEmail] = useState(emailProp || '');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [wait, setWait] = useState(justRegistered ? 60 : 0);
  const inputRef = useRef<HTMLInputElement>(null);
  const uid = useId();
  const inputId = `evc-code-${uid}`;
  const errId = `evc-err-${uid}`;
  const descId = `evc-desc-${uid}`;

  // ¿Está ya verificada?
  useEffect(() => {
    if (justRegistered) return;
    const t = token();
    if (!t) { setState('hidden'); return; }
    fetch(`${API}v1/me/`, { headers: { Authorization: `Bearer ${t}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((me) => {
        if (!me) { setState('hidden'); return; }
        if (me.is_verified) { setState('hidden'); return; }
        if (me.email && !emailProp) setEmail(me.email);
        setState('pending');
      })
      .catch(() => setState('hidden'));
  }, [emailProp, justRegistered]);

  // Cuenta atrás del reenvío
  useEffect(() => {
    if (wait <= 0) return;
    const id = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(id);
  }, [wait]);

  const resend = async (silent = false) => {
    const t = token();
    if (!t) { if (!silent) setError(tx.errSession); return; }
    setError(null);
    setInfo(null);
    try {
      const r = await fetch(`${API}v1/auth/resend-verification/`, {
        method: 'POST', headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
      });
      const d = await r.json().catch(() => ({}));
      if (r.status === 429) {
        const s = Number(d.retry_in) || 60;
        setWait(s);
        if (!silent) setError(tx.errWait(s));
        return;
      }
      if (r.status === 401) { if (!silent) setError(tx.errSession); return; }
      if (!r.ok) { if (!silent) setError(r.status === 503 ? tx.errSendFailed : tx.errGeneric); return; }
      if (d.is_verified) { setState('verified'); onVerified?.(); return; }
      setWait(Number(d.retry_in) || 60);
      if (!silent) setInfo(tx.sent);
    } catch { if (!silent) setError(tx.errNetwork); }
  };

  useEffect(() => {
    if (state === 'pending' && sendOnMount) resend(true);
    if (state === 'pending') setTimeout(() => inputRef.current?.focus(), 150);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const submit = async (value = code) => {
    const t = token();
    if (!t) { setError(tx.errSession); return; }
    if (value.length !== 6) { setError(tx.errIncomplete); inputRef.current?.focus(); return; }
    setBusy(true); setError(null); setInfo(null);
    try {
      const r = await fetch(`${API}v1/auth/verify-code/`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: value }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setError(mapVerifyError(r.status, d.error || '', tx));
        setCode('');
        setTimeout(() => inputRef.current?.focus(), 0);
        return;
      }
      setState('verified');
      onVerified?.();
    } catch {
      setError(tx.errNetwork);
    } finally { setBusy(false); }
  };

  if (state === 'checking' || state === 'hidden') return null;

  if (state === 'verified') {
    return (
      <div role="status" style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        padding: '14px 16px', borderRadius: 16, background: 'rgba(45,125,70,0.08)',
        border: '1px solid rgba(45,125,70,0.25)', color: C.ok, fontWeight: 700,
        fontFamily: 'var(--font-body)', textAlign: 'center',
      }}>
        <FaCheckCircle aria-hidden /> {tx.done}
      </div>
    );
  }

  const canSubmit = !busy && code.length === 6;

  return (
    <div style={{
      padding: 18, borderRadius: 20, background: '#fff',
      border: '1px solid color-mix(in srgb, var(--brand-primary) 30%, white)', boxShadow: '0 6px 24px color-mix(in srgb, var(--brand-dark) 8%, transparent)',
      fontFamily: 'var(--font-body)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
        <span aria-hidden style={{
          width: 36, height: 36, borderRadius: 999, background: 'color-mix(in srgb, var(--brand-primary) 18%, white)', color: C.brandDark,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <FaEnvelope />
        </span>
        <div style={{ fontWeight: 800, fontSize: '1.05rem', color: C.brown }}>{tx.title}</div>
      </div>
      <div id={descId} style={{ fontSize: '0.9rem', color: C.muted, lineHeight: 1.5, marginBottom: 12 }}>
        {variant === 'gate' ? tx.descGate : tx.desc(email)}
      </div>

      <label htmlFor={inputId} style={{ display: 'block', fontWeight: 700, fontSize: '0.85rem', color: C.brown, marginBottom: 6 }}>
        {tx.codeLabel}
      </label>
      <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
        <input
          id={inputId}
          ref={inputRef}
          value={code}
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, '').slice(0, 6);
            setCode(v);
            setError(null);
            if (v.length === 6) submit(v); // se confirma solo al completar
          }}
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]*"
          maxLength={6}
          placeholder="••••••"
          aria-invalid={error ? true : undefined}
          aria-describedby={[descId, error ? errId : null].filter(Boolean).join(' ')}
          disabled={busy}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } }}
          style={{
            flex: 1, minWidth: 0, height: 56, borderRadius: 14, textAlign: 'center',
            fontSize: '1.6rem', letterSpacing: '0.4em', fontWeight: 800, color: C.brown,
            border: `2px solid ${error ? C.err : 'var(--brand-primary)'}`,
            fontFamily: '"Courier New", monospace', background: 'color-mix(in srgb, var(--brand-bg) 55%, white)',
          }}
        />
        <button
          type="button"
          onClick={() => submit()}
          disabled={!canSubmit}
          aria-busy={busy || undefined}
          style={{
            flexShrink: 0, minWidth: 116, minHeight: 56, borderRadius: 14, border: 'none',
            cursor: canSubmit ? 'pointer' : 'not-allowed',
            background: C.brandDark, color: '#fff',
            fontWeight: 800, fontSize: '0.95rem', opacity: canSubmit ? 1 : 0.6,
            fontFamily: 'var(--font-body)',
          }}
        >
          {busy ? tx.confirming : tx.confirm}
        </button>
      </div>

      <div aria-live="polite">
        {error && <div id={errId} role="alert" style={{ color: C.err, fontSize: '0.85rem', marginTop: 8, fontWeight: 600 }}>{error}</div>}
        {info && !error && <div role="status" style={{ color: C.ok, fontSize: '0.85rem', marginTop: 8, fontWeight: 600 }}>{info}</div>}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, gap: 8, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={() => resend()}
          disabled={wait > 0}
          aria-disabled={wait > 0}
          style={{
            background: 'none', border: 'none', padding: '10px 4px', minHeight: 44, cursor: wait > 0 ? 'default' : 'pointer',
            color: wait > 0 ? C.muted : C.brandDark, fontWeight: 700, fontSize: '0.9rem', fontFamily: 'var(--font-body)',
            textDecoration: wait > 0 ? 'none' : 'underline', textUnderlineOffset: 3,
          }}
        >
          {wait > 0 ? tx.resendIn(wait) : tx.resend}
        </button>
        {onLater && (
          <button
            type="button"
            onClick={onLater}
            style={{
              background: 'none', border: 'none', padding: '10px 4px', minHeight: 44, cursor: 'pointer',
              color: C.muted, fontWeight: 700, fontSize: '0.9rem', fontFamily: 'var(--font-body)',
            }}
          >
            {tx.later}
          </button>
        )}
      </div>
      <div style={{ fontSize: '0.8rem', color: C.muted, lineHeight: 1.45 }}>{tx.hint}</div>
    </div>
  );
}
