"use client";

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  EmbeddedCheckoutProvider,
  EmbeddedCheckout
} from '@stripe/react-stripe-js';
import { Box, Spinner, Center, Text, Alert, Icon } from '@chakra-ui/react';
import { FaExclamationTriangle } from 'react-icons/fa';
import { useT } from '../i18n';
import PaymentsDisabledNotice from './PaymentsDisabledNotice';
import { getStripe, isPaymentsDisabled, paymentsEnabled } from '../utils/payments';
import { API_ROOT } from '../config';


// --- URL de la API (asumiendo que está en variables de entorno) ---
const API_BASE_URL = `${API_ROOT}/`;

// --- Props para este nuevo componente ---
interface StripePlanFormProps {
  planId: string; // Recibe el ID del plan seleccionado
  couponCode: string;
}

const StripePlanForm = ({ planId, couponCode }: StripePlanFormProps) => {
  const t = useT();
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Pagos desactivados (config del estudio o 503 payments_disabled del backend)
  const [disabled, setDisabled] = useState(() => !paymentsEnabled());
  // Contador de petición: descarta respuestas obsoletas si el cupón o el plan
  // cambian con una petición en vuelo.
  const requestSeqRef = useRef(0);

  const fetchClientSecret = useCallback(async () => {
    const seq = ++requestSeqRef.current;
    setLoading(true);
    setError(null);

    // 1. Obtener el token de autenticación
    const token = localStorage.getItem('accessToken');
    if (!token) {
      setError(t('checkout.payAuthError'));
      setLoading(false);
      return;
    }

    try {
      // 2. Llamar al NUEVO endpoint
      const response = await fetch(`${API_BASE_URL}v1/checkout/pay-plan/`, { 
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // 3. Enviar el JWT en el header Authorization
          'Authorization': `Bearer ${token}` 
        },
        // 4. Enviar el plan_id en el body
        body: JSON.stringify({
           plan_id: planId,
           couponCode 
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
    // BUG FIX: couponCode no estaba en las dependencias y fetchedRef bloqueaba
    // el refetch — si el usuario aplicaba el cupón con el formulario ya montado,
    // la sesión de pago se creaba SIN descuento. Ahora se regenera.
  }, [planId, couponCode]);

  useEffect(() => {
    if (disabled) return; // sin pagos online no se crea sesión de Stripe
    setClientSecret(null); // fuerza remontar el checkout con la nueva sesión
    fetchClientSecret();
  }, [fetchClientSecret]); // Se ejecuta al montar y cuando planId/cupón cambian

  // --- Render Logic (igual que antes) ---

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
       <Alert.Root status="error" rounded="md">
        <Alert.Indicator> <Icon as={FaExclamationTriangle} /> </Alert.Indicator>
        <Alert.Title>
          {error}
        </Alert.Title>
      </Alert.Root>
    );
  }

  if (!clientSecret) {
    return <Text color="red.500">{t('checkout.payFormError')}</Text>;
  }

  return (
    <Box id="checkout" w="full">
      {/* key: el provider de Stripe no admite cambiar el clientSecret una vez
          montado — al regenerar la sesión (cupón aplicado) se remonta entero. */}
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

export default StripePlanForm;