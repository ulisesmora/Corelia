"use client";

/**
 * Página /verify-account?token=…&userid=… (enlace del email de verificación).
 * El código de 6 dígitos es la vía principal; este enlace sigue funcionando.
 *
 * - "La cuenta ya ha sido verificada" se trata como éxito (no es un error
 *   para la clienta; además React StrictMode puede lanzar la petición dos veces).
 * - Enlace caducado/no válido: si hay sesión, se ofrece el código de 6 dígitos
 *   (EmailVerifyCard); si no, entrar para recibir uno nuevo.
 */

import React, { useEffect, useRef, useState } from 'react';
import { Box, Flex, Text, chakra } from '@chakra-ui/react';
import { Icon } from './ui/Icon';
import Chakra from './ChakraProvider';
import EmailVerifyCard from './EmailVerifyCard';
import { AUTH_C as C, PrimaryButton, StatusView, postJson, useAuthLang } from './AuthPage';
import BrandLogo from './BrandLogo';

const T = {
  es: {
    loadingTitle: 'Confirmando tu email…',
    loadingText: 'Un momento, no cierres esta ventana.',
    okTitle: '¡Email confirmado!',
    okText: 'Tu cuenta está lista: ya recibirás tus avisos y puedes contratar membresías.',
    alreadyTitle: 'Tu email ya estaba confirmado',
    alreadyText: 'No tienes que hacer nada más.',
    errTitle: 'No hemos podido confirmar tu email',
    errExpired: 'El enlace ha caducado.',
    errInvalid: 'El enlace no es válido o está incompleto.',
    errNetwork: 'No hay conexión. Revisa tu internet y recarga la página.',
    errServer: 'Algo ha fallado por nuestra parte. Inténtalo en unos minutos.',
    withSession: 'Puedes confirmarlo ahora con el código de 6 números: pulsa "Reenviar código" y te llegará al momento.',
    noSession: 'Entra en tu cuenta y te enviaremos un código nuevo para confirmarlo.',
    goCalendar: 'Ir a mis clases',
    goLogin: 'Entrar en mi cuenta',
    goHome: 'Volver al inicio',
    retry: 'Reintentar',
  },
  en: {
    loadingTitle: 'Confirming your email…',
    loadingText: "One moment, please don't close this window.",
    okTitle: 'Email confirmed!',
    okText: "Your account is ready: you'll get your notifications and can buy memberships.",
    alreadyTitle: 'Your email was already confirmed',
    alreadyText: "There's nothing else you need to do.",
    errTitle: "We couldn't confirm your email",
    errExpired: 'The link has expired.',
    errInvalid: 'The link is invalid or incomplete.',
    errNetwork: 'No connection. Check your internet and reload the page.',
    errServer: 'Something went wrong on our side. Please try again in a few minutes.',
    withSession: 'You can confirm it now with the 6-digit code: tap "Resend code" and it will arrive right away.',
    noSession: "Log in and we'll send you a new code to confirm it.",
    goCalendar: 'Go to my classes',
    goLogin: 'Log in to my account',
    goHome: 'Back to home',
    retry: 'Try again',
  },
};

type Status = 'loading' | 'success' | 'already' | 'expired' | 'invalid' | 'network' | 'server';

function hasSession(): boolean {
  try { return !!localStorage.getItem('accessToken'); } catch { return false; }
}

export default function VerifyAccountPage() {
  const lang = useAuthLang();
  const tx = T[lang];
  const [status, setStatus] = useState<Status>('loading');
  const [loggedIn, setLoggedIn] = useState(false);
  const started = useRef(false);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const verify = async () => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    const userId = params.get('userid');
    if (!token || !userId || Number.isNaN(parseInt(userId, 10))) { setStatus('invalid'); return; }

    setStatus('loading');
    const res = await postJson('verify-email/', { token, user_id: parseInt(userId, 10) });
    if (res.ok) { setStatus('success'); return; }
    if (res.network) { setStatus('network'); return; }
    if (res.status >= 500) { setStatus('server'); return; }
    // Errores del serializer (en español): non_field_errors / token / user_id
    const all = JSON.stringify(res.data || {}).toLowerCase();
    if (all.includes('ya ha sido verificada')) setStatus('already');
    else if (all.includes('expirado') || all.includes('caducado')) setStatus('expired');
    else setStatus('invalid');
  };

  useEffect(() => {
    setLoggedIn(hasSession());
    if (started.current) return; // evita la doble petición de StrictMode
    started.current = true;
    verify();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (status !== 'loading') setTimeout(() => headingRef.current?.focus(), 30);
  }, [status]);

  const go = (href: string) => () => { window.location.href = href; };
  const secondaryLink = (href: string, label: string) => (
    <chakra.a href={href} minH="44px" display="inline-flex" alignItems="center" color={C.brandDark} fontWeight={700} fontFamily={C.font} textTransform="none"
      fontSize="14px" textDecoration="underline" textUnderlineOffset="3px">
      {label}
    </chakra.a>
  );

  let content: React.ReactNode;
  if (status === 'loading') {
    content = (
      <Flex direction="column" align="center" textAlign="center" gap={3} py={6} role="status">
        <Box w="40px" h="40px" borderRadius="full" border={`4px solid ${C.line}`} borderTopColor={C.brandDark}
          animation="spin 0.8s linear infinite" aria-hidden />
        <chakra.h1 fontFamily={C.font} fontWeight={700} fontSize="22px" color={C.heading}>{tx.loadingTitle}</chakra.h1>
        <Text fontSize="15px" color={C.muted} fontWeight={500}>{tx.loadingText}</Text>
      </Flex>
    );
  } else if (status === 'success' || status === 'already') {
    content = (
      <StatusView title={status === 'success' ? tx.okTitle : tx.alreadyTitle} headingRef={headingRef} icon={<Icon name="check-circle" />}>
        <Text fontSize="15px" color={C.muted} fontWeight={500} lineHeight="1.5">
          {status === 'success' ? tx.okText : tx.alreadyText}
        </Text>
        <Box w="full" mt={3}>
          {loggedIn
            ? <PrimaryButton type="button" onClick={go('/dashboard')}>{tx.goCalendar}</PrimaryButton>
            : <PrimaryButton type="button" onClick={go('/login')}>{tx.goLogin}</PrimaryButton>}
        </Box>
        {secondaryLink('/', tx.goHome)}
      </StatusView>
    );
  } else {
    const reason = status === 'expired' ? tx.errExpired
      : status === 'network' ? tx.errNetwork
      : status === 'server' ? tx.errServer
      : tx.errInvalid;
    const canRetry = status === 'network' || status === 'server';
    content = (
      <Flex direction="column" gap={4} w="full">
        <StatusView title={tx.errTitle} headingRef={headingRef} tone="warn" icon={<Icon name="warning" />}>
          <Text fontSize="15px" color={C.brown} fontWeight={600} lineHeight="1.5">{reason}</Text>
          {!canRetry && (
            <Text fontSize="15px" color={C.muted} fontWeight={500} lineHeight="1.5">
              {loggedIn ? tx.withSession : tx.noSession}
            </Text>
          )}
        </StatusView>
        {canRetry ? (
          <PrimaryButton type="button" onClick={verify}>{tx.retry}</PrimaryButton>
        ) : loggedIn ? (
          <EmailVerifyCard onVerified={() => setStatus('success')} />
        ) : (
          <PrimaryButton type="button" onClick={go('/login')}>{tx.goLogin}</PrimaryButton>
        )}
        <Flex justify="center">{secondaryLink('/', tx.goHome)}</Flex>
      </Flex>
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
