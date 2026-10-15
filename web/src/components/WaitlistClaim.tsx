"use client";

/**
 * Página /lista-espera?token=… (y /en/waitlist?token=…): el enlace del email
 * «¡Se ha liberado una plaza!» (api/utils/waitlist.py → claim_url).
 *
 * - Sin sesión: pide entrar y vuelve aquí (/login?next=…).
 * - Con sesión: un botón «Quiero la plaza» → POST /api/v1/waitlist/claim/.
 *   No se acepta sola al abrir el enlace (los antivirus del correo abren los
 *   enlaces y gastarían su clase sin que lo sepa).
 * - Estados claros: reservada, ya la tenías, plazo terminado, sin plaza aún,
 *   sin clases en el bono (con enlace a precios) y errores de red.
 */

import React, { useEffect, useRef, useState } from 'react';
import { Box, Flex, Text, chakra } from '@chakra-ui/react';
import { Icon } from './ui/Icon';
import Chakra from './ChakraProvider';
import { AUTH_C as C, PrimaryButton, StatusView, useAuthLang } from './AuthPage';
import BrandLogo from './BrandLogo';
import { claimWaitlist, loginUrl } from '../lib/booking';

const T = {
  es: {
    askTitle: 'Tienes una plaza guardada',
    askText: 'Se ha liberado una plaza de la clase en la que estabas en lista de espera. Acéptala y quedará reservada con una clase de tu bono.',
    claim: 'Quiero la plaza',
    claiming: 'Reservando…',
    loginTitle: 'Entra para aceptar tu plaza',
    loginText: 'Entra con la cuenta con la que te apuntaste a la lista de espera.',
    login: 'Entrar en mi cuenta',
    okTitle: '¡Plaza reservada!',
    okText: 'Ya tienes tu sitio. Te esperamos en clase.',
    goBookings: 'Ver mis reservas',
    alreadyTitle: 'Ya tenías esta plaza',
    alreadyText: 'La aceptaste antes: está en tus reservas.',
    expiredTitle: 'Se acabó el plazo',
    expiredText: 'No llegaste a tiempo y la plaza ha pasado a la siguiente persona de la lista. Mira si hay otra clase que te venga bien.',
    waitingTitle: 'Aún no hay plaza para ti',
    waitingText: 'Sigues en la lista de espera. Te avisaremos si se libera una plaza.',
    creditsTitle: 'No te quedan clases en tu bono',
    creditsText: 'Compra un bono y vuelve a abrir este enlace antes de que termine el plazo para aceptar la plaza.',
    buy: 'Ver bonos y precios',
    notFoundTitle: 'Este enlace no es válido',
    notFoundText: 'Puede que sea de otra cuenta o que esté incompleto. Entra con tu cuenta y mira tus listas de espera.',
    goAccount: 'Ir a mi cuenta',
    errTitle: 'No hemos podido reservar la plaza',
    errNetwork: 'No hay conexión. Revisa tu internet e inténtalo otra vez.',
    errServer: 'Algo ha fallado por nuestra parte. Inténtalo en unos minutos.',
    retry: 'Reintentar',
    calendar: 'Ver el horario',
    home: 'Volver al inicio',
  },
  en: {
    askTitle: 'A spot is being held for you',
    askText: 'A spot opened up in the class you were waiting for. Accept it and it will be booked with one credit from your pack.',
    claim: 'I want the spot',
    claiming: 'Booking…',
    loginTitle: 'Sign in to accept your spot',
    loginText: 'Use the account you joined the waitlist with.',
    login: 'Sign in',
    okTitle: 'Spot booked!',
    okText: "You're in. See you in class.",
    goBookings: 'See my bookings',
    alreadyTitle: 'This spot is already yours',
    alreadyText: 'You accepted it earlier: it is in your bookings.',
    expiredTitle: 'Time ran out',
    expiredText: 'The spot has gone to the next person on the list. Have a look for another class that suits you.',
    waitingTitle: 'No spot for you yet',
    waitingText: "You're still on the waitlist. We'll let you know if a spot opens up.",
    creditsTitle: 'You have no credits left',
    creditsText: 'Buy a pack and open this link again before the time to accept runs out.',
    buy: 'See packs and prices',
    notFoundTitle: 'This link is not valid',
    notFoundText: 'It may belong to another account or be incomplete. Sign in and check your waitlists.',
    goAccount: 'Go to my account',
    errTitle: "We couldn't book the spot",
    errNetwork: 'No connection. Check your internet and try again.',
    errServer: 'Something went wrong on our side. Please try again in a few minutes.',
    retry: 'Try again',
    calendar: 'See the timetable',
    home: 'Back to home',
  },
};

type Status = 'ask' | 'claiming' | 'login' | 'booked' | 'already' | 'expired' | 'waiting' | 'credits'
  | 'not_found' | 'network' | 'server';

function hasSession(): boolean {
  try { return !!localStorage.getItem('accessToken'); } catch { return false; }
}

export default function WaitlistClaim() {
  const lang = useAuthLang();
  const tx = T[lang];
  const en = lang === 'en';
  const [token, setToken] = useState('');
  const [status, setStatus] = useState<Status>('ask');
  const [detail, setDetail] = useState('');
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const tk = (new URLSearchParams(window.location.search).get('token') || '').trim();
    setToken(tk);
    if (!tk) setStatus('not_found');
    else if (!hasSession()) setStatus('login');
  }, []);

  useEffect(() => {
    if (status !== 'claiming') setTimeout(() => headingRef.current?.focus(), 30);
  }, [status]);

  const claim = async () => {
    setStatus('claiming');
    setDetail('');
    const r = await claimWaitlist(token);
    if (r.kind === 'booked') { setStatus('booked'); return; }
    if (r.kind === 'already') { setStatus('already'); return; }
    if (r.kind === 'login') { setStatus('login'); return; }
    setDetail(r.message);
    switch (r.code) {
      case 'already_claimed': setStatus('already'); break;
      case 'offer_expired': setStatus('expired'); break;
      case 'not_offered': case 'not_active': setStatus('waiting'); break;
      case 'insufficient_credits': setStatus('credits'); break;
      case 'not_found': setStatus('not_found'); break;
      case 'network': setStatus('network'); break;
      case 'server': setStatus('server'); break;
      default: setStatus('server');
    }
  };

  const go = (href: string) => () => { window.location.href = href; };
  const link = (href: string, label: string) => (
    <chakra.a href={href} minH="44px" display="inline-flex" alignItems="center" color={C.brandDark} fontWeight={700}
      fontFamily={C.font} fontSize="14px" textTransform="none" letterSpacing="normal" textDecoration="underline" textUnderlineOffset="3px">
      {label}
    </chakra.a>
  );
  const para = (text: string) => (
    <Text fontSize="15px" color={C.muted} fontWeight={500} lineHeight="1.5">{text}</Text>
  );
  const calendarHref = en ? '/en/classes' : '/calendar';

  let content: React.ReactNode;
  if (status === 'ask' || status === 'claiming') {
    content = (
      <StatusView title={tx.askTitle} headingRef={headingRef} icon={<Icon name="calendar-check" />}>
        {para(tx.askText)}
        <Box w="full" mt={3}>
          <PrimaryButton type="button" onClick={claim} loading={status === 'claiming'} loadingText={tx.claiming}>{tx.claim}</PrimaryButton>
        </Box>
      </StatusView>
    );
  } else if (status === 'login') {
    content = (
      <StatusView title={tx.loginTitle} headingRef={headingRef} icon={<Icon name="user" />}>
        {para(tx.loginText)}
        <Box w="full" mt={3}>
          <PrimaryButton type="button" onClick={go(loginUrl())}>{tx.login}</PrimaryButton>
        </Box>
      </StatusView>
    );
  } else if (status === 'booked' || status === 'already') {
    content = (
      <StatusView title={status === 'booked' ? tx.okTitle : tx.alreadyTitle} headingRef={headingRef} icon={<Icon name="check-circle" />}>
        {para(status === 'booked' ? tx.okText : tx.alreadyText)}
        <Box w="full" mt={3}>
          <PrimaryButton type="button" onClick={go('/dashboard?tab=agenda')}>{tx.goBookings}</PrimaryButton>
        </Box>
      </StatusView>
    );
  } else if (status === 'credits') {
    content = (
      <StatusView title={tx.creditsTitle} headingRef={headingRef} tone="warn" icon={<Icon name="warning" />}>
        {para(tx.creditsText)}
        <Flex direction="column" gap={2} w="full" mt={3}>
          <PrimaryButton type="button" onClick={go(en ? '/en/prices' : '/prices')}>{tx.buy}</PrimaryButton>
          <Flex justify="center">
            <chakra.button type="button" onClick={claim} minH="44px" color={C.brandDark} fontWeight={700}
              fontFamily={C.font} fontSize="14px" textTransform="none" textDecoration="underline" textUnderlineOffset="3px" bg="transparent">
              {tx.retry}
            </chakra.button>
          </Flex>
        </Flex>
      </StatusView>
    );
  } else if (status === 'expired' || status === 'waiting') {
    content = (
      <StatusView title={status === 'expired' ? tx.expiredTitle : tx.waitingTitle} headingRef={headingRef}
        tone={status === 'expired' ? 'warn' : 'ok'} icon={<Icon name={status === 'expired' ? 'clock' : 'history'} />}>
        {para(status === 'expired' ? tx.expiredText : tx.waitingText)}
        <Box w="full" mt={3}>
          <PrimaryButton type="button" onClick={go(status === 'expired' ? calendarHref : '/dashboard?tab=agenda')}>
            {status === 'expired' ? tx.calendar : tx.goAccount}
          </PrimaryButton>
        </Box>
      </StatusView>
    );
  } else if (status === 'not_found') {
    content = (
      <StatusView title={tx.notFoundTitle} headingRef={headingRef} tone="warn" icon={<Icon name="warning" />}>
        {para(tx.notFoundText)}
        <Box w="full" mt={3}>
          <PrimaryButton type="button" onClick={go(hasSession() ? '/dashboard?tab=agenda' : loginUrl('/dashboard?tab=agenda'))}>
            {tx.goAccount}
          </PrimaryButton>
        </Box>
      </StatusView>
    );
  } else {
    content = (
      <StatusView title={tx.errTitle} headingRef={headingRef} tone="warn" icon={<Icon name="warning" />}>
        <Text fontSize="15px" color={C.brown} fontWeight={600} lineHeight="1.5">
          {status === 'network' ? tx.errNetwork : (detail || tx.errServer)}
        </Text>
        <Box w="full" mt={3}>
          <PrimaryButton type="button" onClick={claim}>{tx.retry}</PrimaryButton>
        </Box>
      </StatusView>
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
          <Box aria-live="polite">{content}</Box>
          <Flex justify="center" mt={2}>{link(en ? '/en' : '/', tx.home)}</Flex>
        </Box>
      </Flex>
    </Chakra>
  );
}
