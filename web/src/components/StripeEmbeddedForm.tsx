"use client";

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  EmbeddedCheckoutProvider,
  EmbeddedCheckout
} from '@stripe/react-stripe-js';
import { Box, Spinner, Center, Text, Alert } from '@chakra-ui/react';
import type { CartItem } from './stores/car.store';
import { useT } from '../i18n';
import PaymentsDisabledNotice from './PaymentsDisabledNotice';
import { getStripe, isPaymentsDisabled, paymentsEnabled } from '../utils/payments';
import { API_V1 } from '../config';
import { getSiteClient } from '../lib/site';
import { useLangStore } from './stores/lang.store';
import Turnstile from './Turnstile';


interface StripeEmbeddedFormProps {
  // Pass the necessary data to create the session (e.g., amount, items)
  // For this simple example, just the amount
  items: CartItem[];
  /** Moneda del estudio (solo informativa: el servidor cobra siempre en la suya). */
  currency?: string;
  email: string;
  name: string;
  phone: string;
  couponCode: string;
}

const StripeEmbeddedForm = ({ items, currency, email, name, phone, couponCode }: StripeEmbeddedFormProps) => {
  const t = useT();
  const lang = useLangStore((s) => s.lang) === 'en' ? 'en' : 'es';
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Pagos desactivados (config del estudio o 503 payments_disabled del backend)
  const [disabled, setDisabled] = useState(() => !paymentsEnabled());
  // Contador de petición: si el cupón cambia mientras hay una petición en
  // vuelo, la respuesta obsoleta se descarta (gana siempre la última).
  const requestSeqRef = useRef(0);
  // Casilla de seguridad (Turnstile) antes de crear la sesión de pago como
  // invitada, si el estudio la tiene configurada. Cada token vale una vez.
  const captchaKey = getSiteClient().turnstile_site_key;
  const [captchaToken, setCaptchaToken] = useState('');
  const [captchaReset, setCaptchaReset] = useState(0);
  // Datos con los que se creó la sesión actual: si cambian (p. ej. se aplica
  // un cupón) hay que crear otra.
  const signature = JSON.stringify([items, currency, email, name, phone, couponCode]);
  const [sessionFor, setSessionFor] = useState('');
  const inFlightFor = useRef('');

  const fetchClientSecret = useCallback(async (token: string) => {
    const seq = ++requestSeqRef.current;
    inFlightFor.current = signature;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_V1}/checkout/create-session/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // El servidor calcula el total a partir de los IDs del carrito
        body: JSON.stringify({
           cart_items: items,
           email,
           name,
           phone,
           couponCode,
           ...(token ? { turnstile_token: token } : {}),
        }),
      });

      if (await isPaymentsDisabled(response)) {
        if (seq === requestSeqRef.current) setDisabled(true);
        return;
      }
      if (!response.ok) {
        // La respuesta de error puede no ser JSON (502/timeout del servidor)
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `${t('checkout.paySessionError')} (${response.status})`);
      }

      const data = await response.json();
      if (!data.clientSecret) {
          throw new Error(t('checkout.paySessionError'));
      }
      if (seq !== requestSeqRef.current) return; // respuesta obsoleta, descartar
      setClientSecret(data.clientSecret);
      setSessionFor(signature);

    } catch (err) {
      if (seq !== requestSeqRef.current) return;
      console.error("Error fetching client secret:", err);
      setError(err instanceof Error ? err.message : t('common.unknownError'));
    } finally {
      if (seq === requestSeqRef.current) {
        setLoading(false);
        inFlightFor.current = '';
      }
    }
    // BUG FIX: couponCode/email/name/phone estaban fuera de las dependencias y
    // un fetchedRef bloqueaba cualquier refetch: si el usuario aplicaba el cupón
    // con este formulario ya montado, la sesión de Stripe se quedaba SIN el
    // descuento. Ahora un cambio de cupón regenera la sesión de pago.
  }, [items, currency, email, name, phone, couponCode, signature]);

  useEffect(() => {
    if (disabled) return; // sin pagos online no se crea sesión de Stripe
    if (signature === sessionFor) return; // ya hay sesión para estos datos
    if (inFlightFor.current === signature) return; // ya se está creando
    setClientSecret(null); // fuerza remontar el checkout con la nueva sesión
    if (captchaKey && !captchaToken) { setLoading(false); return; } // espera a la casilla
    const token = captchaToken;
    if (token) { setCaptchaToken(''); setCaptchaReset((n) => n + 1); }
    fetchClientSecret(token);
  }, [fetchClientSecret, signature, sessionFor, captchaKey, captchaToken, disabled]);

  // --- Render Logic ---

  if (disabled) return <PaymentsDisabledNotice />;

  // Falta la casilla de seguridad para crear la sesión de pago
  if (captchaKey && !clientSecret && !loading && signature !== sessionFor) {
    return (
      <Box w="full" display="flex" flexDirection="column" gap={3}>
        {error && (
          <Alert.Root status="error">
            <Alert.Indicator />
            <Alert.Title>{error}</Alert.Title>
          </Alert.Root>
        )}
        <Turnstile siteKey={captchaKey} lang={lang} onToken={setCaptchaToken} resetKey={captchaReset} />
      </Box>
    );
  }

  if (loading) {
    return (
      <Center py={10}>
        <Spinner size="xl" color="var(--accent)" />
      </Center>
    );
  }

  if (error) {
    return (
       <Alert.Root status="error">
        <Alert.Indicator />
        <Alert.Title>
          {error}
        </Alert.Title>
      </Alert.Root>
    );
  }

  if (!clientSecret) {
    // This state should ideally not be reached if error handling is correct
    return <Text color="var(--danger)">{t('checkout.payFormError')}</Text>;
  }

  return (
    // El iframe de Stripe no se puede oscurecer: va SIEMPRE sobre una
    // superficie clara fija (también en energy/neon) para que se lea.
    <Box id="checkout" w="full" bg="#fff" color="#1a1a1a" borderRadius="var(--radius-input)" overflow="hidden">
      {/* key: EmbeddedCheckoutProvider no admite cambiar el clientSecret una
          vez montado — al regenerar la sesión (p. ej. cupón aplicado) hay que
          remontar el provider entero. */}
      <EmbeddedCheckoutProvider
        key={clientSecret}
        stripe={getStripe()}
        options={{ clientSecret }} // Pass the fetched clientSecret
      >
        <EmbeddedCheckout /> {/* This renders the Stripe form */}
      </EmbeddedCheckoutProvider>
    </Box>
  );
};

export default StripeEmbeddedForm;