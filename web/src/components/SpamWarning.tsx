"use client";

import React from 'react';
import { Box, Flex, Text, Icon } from '@chakra-ui/react';
import { FaExclamationTriangle, FaEnvelope } from 'react-icons/fa';
import { useLangStore } from './stores/lang.store';
import { getSiteClient } from '../lib/site';

/**
 * Aviso fuerte e imposible de ignorar para que el usuario revise la
 * bandeja de SPAM tras una compra o reserva exitosa.
 *
 * Muchos usuarios (sobre todo en Outlook / Hotmail / Live / Microsoft)
 * reciben emails de confirmación que el filtro Outlook marca como spam,
 * lo que genera dudas: piensan que el pago no se procesó.
 *
 * Diseño: borde rojo-naranja con icono prominente, texto en español/inglés,
 * mención explícita de los proveedores donde más pasa.
 */
interface SpamWarningProps {
  /** Email del destinatario (si lo sabemos, lo mostramos para que sepan dónde mirar) */
  email?: string;
  /** Tipo de operación: 'booking' (reserva) | 'payment' (pago/recarga) */
  variant?: 'booking' | 'payment';
}

export default function SpamWarning({ email, variant = 'payment' }: SpamWarningProps) {
  const lang = useLangStore((s) => s.lang);
  const isEn = lang === 'en';

  const title = isEn
    ? '⚠️ Important: check your SPAM / Junk folder'
    : '⚠️ Importante: revisa tu carpeta de SPAM / Correo no deseado';

  const main = isEn
    ? 'We just sent you a confirmation email. If you don\'t see it in your inbox within 2 minutes, please check your SPAM, Junk or Promotions folder.'
    : 'Te acabamos de enviar un email de confirmación. Si no lo ves en tu bandeja de entrada en los próximos 2 minutos, revisa tu carpeta de SPAM, Correo no deseado o Promociones.';

  const providers = isEn
    ? 'This happens especially with Outlook, Hotmail, Live and Microsoft accounts.'
    : 'Esto ocurre sobre todo con cuentas de Outlook, Hotmail, Live y Microsoft.';

  // Email del estudio (config): si no hay, el consejo va sin dirección
  const studioEmail = getSiteClient().contact.email;
  const action = isEn
    ? `Tip: mark our email as "Not spam"${studioEmail ? ` and add ${studioEmail} to your contacts` : ''} so it never happens again.`
    : `Tip: marca nuestro email como "No es spam"${studioEmail ? ` y añade ${studioEmail} a tus contactos` : ''} para que no vuelva a pasar.`;

  const reassurance = isEn
    ? (variant === 'booking'
        ? 'Your booking is already confirmed in our system — the email is just a copy for your records.'
        : 'Your credits are already loaded in your account — the email is just a copy for your records.')
    : (variant === 'booking'
        ? 'Tu reserva ya está confirmada en nuestro sistema — el email es solo una copia para tu registro.'
        : 'Tus créditos ya están cargados en tu cuenta — el email es solo una copia para tu registro.');

  return (
    <Box
      mt={4}
      p={4}
      borderRadius="14px"
      bg="linear-gradient(135deg, #FFF4E5 0%, #FFE8D6 100%)"
      border="2px solid #F59E0B"
      boxShadow="0 4px 14px rgba(245,158,11,0.20)"
    >
      <Flex gap={3} align="flex-start">
        <Icon as={FaExclamationTriangle} boxSize={6} color="#B7791F" mt={0.5} flexShrink={0} />
        <Box flex={1}>
          <Text
            fontWeight={800}
            fontSize="sm"
            color="#7C2D12"
            textTransform="uppercase"
            letterSpacing="0.04em"
            mb={1.5}
          >
            {title}
          </Text>

          <Text fontSize="sm" color="#7C2D12" lineHeight="1.6" mb={2}>
            {main}
          </Text>

          {email && (
            <Flex
              align="center" gap={2}
              p={2} mb={2}
              borderRadius="8px"
              bg="rgba(255,255,255,0.55)"
              border="1px solid rgba(183,121,31,0.30)"
            >
              <Icon as={FaEnvelope} boxSize={3.5} color="#7C2D12" />
              <Text fontSize="xs" fontWeight={700} color="#7C2D12">
                {email}
              </Text>
            </Flex>
          )}

          <Text fontSize="xs" color="#92400E" lineHeight="1.55" mb={1.5}>
            <strong>{providers}</strong>
          </Text>

          <Text fontSize="xs" color="#92400E" lineHeight="1.55" mb={2}>
            {action}
          </Text>

          <Text fontSize="xs" color="#15803D" fontWeight={700} lineHeight="1.55">
            ✓ {reassurance}
          </Text>
        </Box>
      </Flex>
    </Box>
  );
}
