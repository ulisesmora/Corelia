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


interface StripeEmbeddedFormProps {
  // Pass the necessary data to create the session (e.g., amount, items)
  // For this simple example, just the amount
  items: CartItem[]; // Amount in the smallest currency unit (e.g., cents for EUR)
  currency?: string;
  email: string;
  name: string;
  phone: string;
  couponCode: string;
}

const StripeEmbeddedForm = ({ items, currency = 'eur', email, name, phone, couponCode }: StripeEmbeddedFormProps) => {
  const t = useT();
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Pagos desactivados (config del estudio o 503 payments_disabled del backend)
  const [disabled, setDisabled] = useState(() => !paymentsEnabled());
  // Contador de petición: si el cupón cambia mientras hay una petición en
  // vuelo, la respuesta obsoleta se descarta (gana siempre la última).
  const requestSeqRef = useRef(0);

  const fetchClientSecret = useCallback(async () => {
    const seq = ++requestSeqRef.current;
    setLoading(true);
    setError(null);
    try {
      // Replace with your actual backend endpoint URL
      const response = await fetch(`${API_V1}/checkout/create-session/`, { // Using relative URL assuming proxy or same domain
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // Add authentication headers if required (e.g., JWT token)
          // 'Authorization': `Bearer ${yourAuthToken}`
        },
        // Send data needed by the backend to calculate the total
        body: JSON.stringify({
           cart_items: items, // Pass amount in cents/smallest unit
           email,
           name,
           phone,
           couponCode
           // TODO: Send actual cart items if your backend needs them
           // items: cartItems.map(item => ({ id: item.id, quantity: 1 }))
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

    } catch (err) {
      if (seq !== requestSeqRef.current) return;
      console.error("Error fetching client secret:", err);
      setError(err instanceof Error ? err.message : t('common.unknownError'));
    } finally {
      if (seq === requestSeqRef.current) setLoading(false);
    }
    // BUG FIX: couponCode/email/name/phone estaban fuera de las dependencias y
    // un fetchedRef bloqueaba cualquier refetch: si el usuario aplicaba el cupón
    // con este formulario ya montado, la sesión de Stripe se quedaba SIN el
    // descuento. Ahora un cambio de cupón regenera la sesión de pago.
  }, [items, currency, email, name, phone, couponCode]);

  useEffect(() => {
    if (disabled) return; // sin pagos online no se crea sesión de Stripe
    setClientSecret(null); // fuerza remontar el checkout con la nueva sesión
    fetchClientSecret();
  }, [fetchClientSecret]); // Run fetch on mount and when fetchClientSecret changes

  // --- Render Logic ---

  if (disabled) return <PaymentsDisabledNotice />;

  if (loading) {
    return (
      <Center py={10}>
        <Spinner size="xl" color="var(--brand-secondary)" />
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
    return <Text color="red.500">{t('checkout.payFormError')}</Text>;
  }

  return (
    <Box id="checkout" w="full">
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