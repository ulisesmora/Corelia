'use client';

/**
 * Página /recover-password?email=…&token=… (enlace del email de recuperación).
 *
 * - Nueva contraseña + repetir, ambas con mostrar/ocultar, requisito de
 *   longitud (MIN_PASSWORD, igual que el backend) y aviso en vivo si no coinciden.
 * - Al guardarla entra sola (signinClient con la nueva contraseña) y redirige.
 *   Si no pudiera, muestra el formulario de acceso con el email ya puesto.
 * - Enlace caducado/no válido: permite pedir uno nuevo sin salir de la página.
 */

import React, { useEffect, useRef, useState } from 'react';
import { Box, Flex, Text, chakra } from '@chakra-ui/react';
import { Icon } from './ui/Icon';
import Chakra from './ChakraProvider';
import BrandLogo from './BrandLogo';
import AuthPage, {
  AUTH_C as C, MIN_PASSWORD, TextField, Requirement, PrimaryButton, FormAlert, StatusView,
  postJson, commonError, saveSession, useAuthCopy, useAuthLang,
} from './AuthPage';

const T = {
  es: {
    title: 'Crea una contraseña nueva',
    forAccount: 'Para la cuenta',
    newLabel: 'Nueva contraseña',
    newPh: `Mínimo ${MIN_PASSWORD} caracteres`,
    confirmLabel: 'Repite la nueva contraseña',
    submit: 'Guardar contraseña',
    submitting: 'Guardando…',
    okTitle: '¡Contraseña actualizada!',
    okLoggingIn: 'Entrando en tu cuenta…',
    okLogin: 'Ya puedes entrar con tu nueva contraseña.',
    invalidTitle: 'Este enlace ya no funciona',
    invalidText: 'Puede que haya caducado o que ya lo hayas usado. Pide uno nuevo: tarda un minuto.',
    requestNew: 'Pedir un enlace nuevo',
    goHome: 'Volver al inicio',
  },
  en: {
    title: 'Create a new password',
    forAccount: 'For the account',
    newLabel: 'New password',
    newPh: `At least ${MIN_PASSWORD} characters`,
    confirmLabel: 'Repeat new password',
    submit: 'Save password',
    submitting: 'Saving…',
    okTitle: 'Password updated!',
    okLoggingIn: 'Logging you in…',
    okLogin: 'You can now log in with your new password.',
    invalidTitle: 'This link no longer works',
    invalidText: "It may have expired or already been used. Request a new one — it only takes a minute.",
    requestNew: 'Request a new link',
    goHome: 'Back to home',
  },
};

type View = 'loading' | 'form' | 'invalid' | 'requestNew' | 'success' | 'login';

interface ResetPasswordPageProps {
  isInModal?: boolean;
}

export default function ResetPasswordPage(_props: ResetPasswordPageProps) {
  const lang = useAuthLang();
  const tx = T[lang];
  const t = useAuthCopy();

  const [view, setView] = useState<View>('loading');
  const [token, setToken] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [touched, setTouched] = useState<{ password?: boolean; confirm?: boolean }>({});
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [autoLogin, setAutoLogin] = useState(false);

  const passRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLInputElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tk = params.get('token') || '';
    const em = params.get('email') || '';
    if (tk && em) { setToken(tk); setEmail(em); setView('form'); }
    else setView('invalid');
  }, []);

  useEffect(() => {
    if (view === 'success' || view === 'invalid') setTimeout(() => headingRef.current?.focus(), 30);
  }, [view]);

  // Validación
  const passErr = !password ? t.errPasswordRequired : password.length < MIN_PASSWORD ? t.errPasswordShort : null;
  const confErr = !confirmPassword ? t.errConfirmRequired : password !== confirmPassword ? t.errMismatch : null;
  const confirmLive = confirmPassword.length > 0 && (touched.confirm || confirmPassword.length >= password.length);
  const showPassErr = (submitted || touched.password) ? passErr : null;
  const showConfErr = (submitted || touched.confirm) ? confErr : (confirmLive && password !== confirmPassword ? t.errMismatch : null);
  const confirmOk = confirmLive && password.length > 0 && password === confirmPassword;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setSubmitted(true);
    setFormError(null);
    if (passErr) { passRef.current?.focus(); return; }
    if (confErr) { confirmRef.current?.focus(); return; }

    setIsSubmitting(true);
    try {
      const res = await postJson('reset-password/', { email, reset_token: token, new_password: password });
      if (!res.ok) {
        const common = commonError(res, t);
        if (common) { setFormError(common); return; }
        const msg = String(res.data?.error || '');
        if (/al menos|caracteres/i.test(msg)) { setFormError(t.errPasswordShort); passRef.current?.focus(); return; }
        // Token caducado / no válido / email o token mal formados en el enlace
        setView('invalid');
        return;
      }

      // Contraseña cambiada: entramos directamente con ella.
      setView('success');
      setAutoLogin(true);
      const login = await postJson('signinClient/', { email, password });
      if (login.ok && login.data?.access) {
        saveSession(login.data);
        setTimeout(() => { window.location.href = '/'; }, 1200);
      } else {
        setAutoLogin(false);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  let content: React.ReactNode;

  if (view === 'loading') {
    content = <Box h="200px" />;
  } else if (view === 'requestNew') {
    return <AuthPage initialMode="reset" initialEmail={email} />;
  } else if (view === 'login') {
    return <AuthPage initialMode="login" initialEmail={email} />;
  } else if (view === 'invalid') {
    content = (
      <StatusView title={tx.invalidTitle} headingRef={headingRef} tone="warn" icon={<Icon name="warning" />}>
        <Text fontSize="15px" color={C.muted} fontWeight={500} lineHeight="1.5">{tx.invalidText}</Text>
        <Box w="full" mt={3}>
          <PrimaryButton type="button" onClick={() => setView('requestNew')}>{tx.requestNew}</PrimaryButton>
        </Box>
        <chakra.a href="/" minH="44px" display="inline-flex" alignItems="center" color={C.brandDark} fontWeight={700} fontFamily={C.font} textTransform="none"
          fontSize="14px" textDecoration="underline" textUnderlineOffset="3px">
          {tx.goHome}
        </chakra.a>
      </StatusView>
    );
  } else if (view === 'success') {
    content = (
      <StatusView title={tx.okTitle} headingRef={headingRef} icon={<Icon name="check-circle" />}>
        <Text role="status" fontSize="15px" color={C.muted} fontWeight={500} lineHeight="1.5">
          {autoLogin ? tx.okLoggingIn : tx.okLogin}
        </Text>
        {autoLogin ? (
          <Box mt={2} w="28px" h="28px" borderRadius="full" border={`3px solid ${C.line}`} borderTopColor={C.brandDark}
            animation="spin 0.8s linear infinite" aria-hidden />
        ) : (
          <Box w="full" mt={3}>
            <PrimaryButton type="button" onClick={() => setView('login')}>{t.submitLogin}</PrimaryButton>
          </Box>
        )}
      </StatusView>
    );
  } else {
    content = (
      <chakra.form noValidate onSubmit={handleSubmit} display="flex" flexDirection="column" gap={4} w="full">
        <Box>
          <chakra.h1 fontFamily={C.font} fontWeight={700} fontSize={{ base: '24px', md: '26px' }} color={C.heading} lineHeight="1.2">
            {tx.title}
          </chakra.h1>
          <Text mt={1.5} fontSize="15px" color={C.muted} fontWeight={500}>
            {tx.forAccount} <Text as="strong" color={C.brown} wordBreak="break-all">{email}</Text>
          </Text>
        </Box>

        {/* Para gestores de contraseñas: asocia la nueva clave a esta cuenta */}
        <input type="email" name="username" autoComplete="username" value={email} readOnly hidden />

        <TextField
          id="reset-new-password" label={tx.newLabel} type="password" value={password} placeholder={tx.newPh}
          onChange={(v) => { setPassword(v); setFormError(null); }} onBlur={() => setTouched((s) => ({ ...s, password: true }))}
          autoComplete="new-password" icon={<Icon name="lock" />} error={showPassErr} inputRef={passRef}
          name="new-password" describedBy="reset-req-length"
        >
          <Requirement id="reset-req-length" met={password.length >= MIN_PASSWORD}>{t.reqLength}</Requirement>
        </TextField>

        <TextField
          id="reset-confirm-password" label={tx.confirmLabel} type="password" value={confirmPassword}
          onChange={(v) => { setConfirmPassword(v); setFormError(null); }} onBlur={() => setTouched((s) => ({ ...s, confirm: true }))}
          autoComplete="new-password" icon={<Icon name="lock" />} error={showConfErr} inputRef={confirmRef}
          name="confirm-password" describedBy={confirmOk ? 'reset-confirm-ok' : undefined}
        >
          {confirmOk && !showConfErr && <Requirement id="reset-confirm-ok" met>{t.matchOk}</Requirement>}
        </TextField>

        {formError && <FormAlert>{formError}</FormAlert>}

        <Box mt={1}>
          <PrimaryButton loading={isSubmitting} loadingText={tx.submitting}>{tx.submit}</PrimaryButton>
        </Box>
      </chakra.form>
    );
  }

  return (
    <Chakra>
      <Flex translate="no" className="notranslate" w="full" minH="100dvh" pt="60px" bg={C.cream}
        fontFamily={C.font} justify="center" align={{ base: 'flex-start', md: 'center' }} px={4} pb={10}>
        <Box className="sk-card" w="full" maxW="480px" mt={{ base: 6, md: 10 }}
          px={{ base: 5, md: 8 }} py={{ base: 6, md: 8 }}>
          <Flex justify="center" mb={5}>
            <BrandLogo width={120} maxHeight={72} />
          </Flex>
          {content}
        </Box>
      </Flex>
    </Chakra>
  );
}
