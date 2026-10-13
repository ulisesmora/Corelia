"use client";

import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  Box, Heading, Text, VStack, Button, Spinner, Icon, Progress,
} from '@chakra-ui/react';
import { FaCheckCircle, FaExclamationTriangle, FaEnvelope } from 'react-icons/fa';
import Chakra from './ChakraProvider';
import { useCartStore } from './stores/car.store';
import SpamWarning from './SpamWarning';
import { requestInstallPrompt, InstallInlineHint } from './InstallAppBanner';
import { useT } from '../i18n';
import { API_ROOT } from '../config';

const API_BASE = `${API_ROOT}/`;
const POLL_INTERVAL = 3000;
const POLL_TIMEOUT = 30000;

export default function CheckoutSuccessPage() {
  const t = useT();
  const homeHref = t('nav.items.home.href') || '/';
  const clearCart = useCartStore((s) => s.clearCart);
  const [status, setStatus] = useState<'loading' | 'polling' | 'success' | 'timeout' | 'error'>('loading');
  const [showInstallHint, setShowInstallHint] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timedOutRef = useRef(false);

  const verifyOnce = useCallback(async (sessionId: string): Promise<'success' | 'pending'> => {
    try {
      const res = await fetch(`${API_BASE}v1/checkout/verify-checkout/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId }),
      });
      const data = await res.json();
      if (data.status === 'success') return 'success';
      return 'pending';
    } catch {
      return 'pending';
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get('session_id');

    if (!sessionId) {
      setStatus('error');
      setErrorMessage('noSession');
      return;
    }

    const startPolling = async () => {
      const first = await verifyOnce(sessionId);
      if (first === 'success') {
        setStatus('success');
        clearCart();
        setTimeout(() => { if (requestInstallPrompt('booking') === 'inline') setShowInstallHint(true); }, 1500);
        return;
      }

      setStatus('polling');
      const startTime = Date.now();

      pollingRef.current = setInterval(async () => {
        if (timedOutRef.current) return;

        const elapsed = Date.now() - startTime;
        if (elapsed >= POLL_TIMEOUT) {
          timedOutRef.current = true;
          if (pollingRef.current) clearInterval(pollingRef.current);
          setStatus('timeout');
          // BUG FIX: NO limpiar el carrito aquí. En timeout no hay confirmación
          // real (pago asíncrono aún procesándose, o backend/webhook caído):
          // vaciar el carrito destruía datos del usuario sin garantía de reserva.
          // Solo se limpia cuando verify devuelve 'success'.
          return;
        }

        const result = await verifyOnce(sessionId);
        if (result === 'success') {
          if (pollingRef.current) clearInterval(pollingRef.current);
          setStatus('success');
          clearCart();
          setTimeout(() => { if (requestInstallPrompt('booking') === 'inline') setShowInstallHint(true); }, 1500);
        }
      }, POLL_INTERVAL);
    };

    startPolling();

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [verifyOnce, clearCart]);

  return (
    <Chakra>
      <Box bg="gray.50" minH="100vh" py={12} px={{ base: 4, md: 8 }}>
        <Box maxW="md" mx="auto" bg="white" p={8} rounded="lg" shadow="base">
          {status === 'success' && (
            <VStack gap={4} textAlign="center">
              <Icon as={FaCheckCircle} boxSize={16} color="green.500" />
              <Heading size="lg" color="gray.800">{t('paymentFinish.successTitle')}</Heading>
              <Text fontSize="md" color="gray.600">
                {t('paymentFinish.successDesc')}
              </Text>
              <SpamWarning variant="booking" />
              {showInstallHint && <InstallInlineHint />}
              <Button colorScheme="purple" mt={6} onClick={() => window.location.href = homeHref}>
                {t('paymentFinish.backHome')}
              </Button>
            </VStack>
          )}

          {status === 'timeout' && (
            <VStack gap={4} textAlign="center">
              <Icon as={FaEnvelope} boxSize={16} color="orange.400" />
              <Heading size="lg" color="gray.800">{t('paymentFinish.timeoutTitle')}</Heading>
              <Text fontSize="md" color="gray.600">
                {t('paymentFinish.timeoutDesc')}
              </Text>
              <Text fontSize="sm" color="gray.500">
                {t('paymentFinish.timeoutHint')}
              </Text>
              <SpamWarning variant="booking" />
              <Button colorScheme="purple" mt={6} onClick={() => window.location.href = homeHref}>
                {t('paymentFinish.backHome')}
              </Button>
            </VStack>
          )}

          {status === 'error' && (
            <VStack gap={4} textAlign="center">
              <Icon as={FaExclamationTriangle} boxSize={16} color="red.500" />
              <Heading size="lg" color="gray.800">{t('paymentFinish.errorTitle')}</Heading>
              <Text fontSize="sm" color="red.700">{errorMessage === 'noSession' ? t('paymentFinish.noSession') : errorMessage || t('common.unknownError')}</Text>
              <Text fontSize="sm" color="gray.600" mt={2}>
                {t('paymentFinish.errorHint')}
              </Text>
              <Button variant="outline" mt={6} onClick={() => window.location.href = '/checkout'}>
                {t('paymentFinish.backCheckout')}
              </Button>
            </VStack>
          )}

          {(status === 'loading' || status === 'polling') && (
            <VStack gap={4} textAlign="center">
              <Spinner color="var(--brand-secondary)" size="xl" />
              <Heading size="md" color="gray.800" mt={4}>
                {status === 'loading' ? t('checkout.verifying') : t('paymentFinish.processing')}
              </Heading>
              <Text color="gray.600">
                {status === 'loading'
                  ? t('paymentFinish.dontClose')
                  : t('paymentFinish.processingDesc')}
              </Text>
              {status === 'polling' && <Progress size="xs" width="100%" colorScheme="purple" isIndeterminate mt={2} />}
            </VStack>
          )}
        </Box>
      </Box>
    </Chakra>
  );
}
