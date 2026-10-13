"use client";

import React, { useState, useCallback } from 'react';
import { Box, Flex, Input, Textarea, Button, Text, VStack, HStack, Spinner } from '@chakra-ui/react';
import { motion } from 'framer-motion';
import Chakra from './ChakraProvider';
import { Toaster, toaster } from './ui/toaster';
import { useT } from '../i18n';
import { FaWhatsapp, FaInstagram, FaMapMarkerAlt, FaEnvelope, FaPhone } from 'react-icons/fa';
import { API_V1 } from '../config';
import { addressLine, instagramHandle, instagramUrl, mapsUrl, phoneHref, useSite, whatsappUrl } from '../lib/site';
import { withSsrLang } from './stores/lang.store';

const MotionBox = motion(Box as any);
const MotionFlex = motion(Flex as any);

const API_BASE_URL = `${API_V1}/contact-user/`;

const C = {
  accent: 'color-mix(in srgb, var(--brand-primary) 70%, white)', accentDark: 'var(--brand-primary)', brown: 'color-mix(in srgb, var(--brand-dark) 45%, black)',
  textMuted: 'rgba(255,255,255,0.55)', textLight: 'rgba(255,255,255,0.35)',
  border: 'rgba(255,255,255,0.10)', borderHover: 'rgba(255,255,255,0.20)',
  inputBg: 'rgba(255,255,255,0.06)',
};

// contactChannels is defined inside ContactInner to access t()

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: (i: number) => ({
    opacity: 1, y: 0,
    transition: { duration: 0.55, delay: i * 0.10, ease: [0.25, 0.46, 0.45, 0.94] },
  }),
};

function ContactInner() {
  const t = useT();
  const site = useSite();

  // Canales de contacto de la config del estudio: los vacíos no se muestran
  const wa = whatsappUrl(site);
  const ig = instagramUrl(site);
  const tel = phoneHref(site);
  const address = addressLine(site);
  const contactChannels = [
    wa && { icon: FaWhatsapp, label: 'WhatsApp', value: site.contact.phone || site.contact.whatsapp, href: wa, color: '#4ADE80' },
    !wa && tel && { icon: FaPhone, label: t('home.contact.phoneLabel', undefined, 'Teléfono'), value: site.contact.phone, href: tel, color: '#4ADE80' },
    site.contact.email && { icon: FaEnvelope, label: 'Email', value: site.contact.email, href: `mailto:${site.contact.email}`, color: C.accent },
    ig && { icon: FaInstagram, label: 'Instagram', value: `@${instagramHandle(site)}`, href: ig, color: '#F472B6' },
    address && { icon: FaMapMarkerAlt, label: t('home.contact.locationLabel'), value: address, href: mapsUrl(site) || '#', color: C.accent },
  ].filter(Boolean) as { icon: typeof FaWhatsapp; label: string; value: string; href: string; color: string }[];

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMsg] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = useCallback(async () => {
    if (!name || !email) return;
    setSubmitting(true);
    try {
      const res = await fetch(API_BASE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, subject: message }),
      });
      if (!res.ok) throw new Error();
      setSent(true);
      setName(''); setEmail(''); setMsg('');
      toaster.create({ title: t('home.contact.toastOkTitle'), type: 'success', duration: 5000 });
    } catch {
      toaster.create({ title: t('home.contact.toastErrTitle'), type: 'error', duration: 4000 });
    } finally {
      setSubmitting(false);
    }
  }, [name, email, message, t]);

  return (
    <Box
      as="section"
      id="contact"
      w="full"
      position="relative"
      overflow="hidden"
      bg="linear-gradient(160deg, color-mix(in srgb, var(--brand-dark) 40%, black) 0%, color-mix(in srgb, var(--brand-dark) 45%, black) 45%, color-mix(in srgb, var(--brand-dark) 40%, black) 100%)"
      py={{ base: 16, md: 28 }}
    >
      <Toaster />

      {/* Grain texture overlay */}
      <Box
        position="absolute" inset={0} pointerEvents="none" zIndex={0}
        opacity={0.045}
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 512 512' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
          backgroundRepeat: 'repeat',
          backgroundSize: '200px',
        }}
      />

      {/* Warm glow blobs */}
      <Box position="absolute" top="-10%" left="-5%" w="500px" h="500px"
        borderRadius="full" bg="color-mix(in srgb, var(--brand-primary) 8%, transparent)" filter="blur(120px)" pointerEvents="none" zIndex={0} />
      <Box position="absolute" bottom="-10%" right="-5%" w="400px" h="400px"
        borderRadius="full" bg="color-mix(in srgb, color-mix(in srgb, var(--brand-primary) 70%, white) 6%, transparent)" filter="blur(100px)" pointerEvents="none" zIndex={0} />

      <Flex
        maxW="6xl" mx="auto" px={{ base: 6, md: 12 }}
        direction={{ base: 'column', lg: 'row' }}
        gap={{ base: 14, lg: 20 }}
        align={{ base: 'stretch', lg: 'flex-start' }}
        position="relative" zIndex={1}
      >

        {/* ── Left: Editorial info ── */}
        <Box flex={{ base: 'none', lg: '1' }}>
          {/* Section badge */}
          <MotionBox
            custom={0} variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }}
            display="inline-flex" px={3} py={1} borderRadius="full" mb={6}
            bg="color-mix(in srgb, color-mix(in srgb, var(--brand-primary) 70%, white) 10%, transparent)" border="1px solid color-mix(in srgb, color-mix(in srgb, var(--brand-primary) 70%, white) 22%, transparent)"
          >
            <Text fontSize="10px" fontWeight={700} color={C.accent}
              fontFamily='var(--font-body)' letterSpacing="0.12em" textTransform="uppercase">
              {t('home.contact.heading')}
            </Text>
          </MotionBox>

          {/* Big editorial heading */}
          <MotionBox custom={1} variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }}>
            <Text
              fontFamily='var(--font-heading)'
              fontSize={{ base: '5xl', md: '7xl', lg: '8xl' }}
              color="white"
              letterSpacing="0.03em"
              lineHeight="0.95"
              mb={6}
            >
              {t('home.contact.heading') || 'Hablemos'}
            </Text>
          </MotionBox>

          {/* Thin accent line */}
          <MotionBox custom={2} variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }}>
            <Box w="48px" h="2px" bg={C.accent} borderRadius="full" mb={6} />
            <Text
              fontFamily='var(--font-body)'
              fontSize="md" color={C.textMuted}
              lineHeight="1.75" maxW="360px" mb={10}
            >
              {t('home.contact.tagline')}
            </Text>
          </MotionBox>

          {/* Contact channels */}
          <VStack align="stretch" gap={3}>
            {contactChannels.map((ch, i) => (
              <MotionBox
                key={ch.label}
                custom={3 + i} variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }}
              >
                <Box
                  as="a" href={ch.href} target={ch.href !== '#' ? '_blank' : undefined}
                  rel="noopener noreferrer"
                  display="flex" alignItems="center" gap={4}
                  px={4} py={3.5} borderRadius="16px"
                  bg="rgba(255,255,255,0.04)" border={`1px solid ${C.border}`}
                  cursor="pointer" transition="all 0.25s ease"
                  _hover={{ bg: 'rgba(255,255,255,0.08)', borderColor: C.borderHover }}
                >
                  <Flex
                    w="40px" h="40px" borderRadius="12px" flexShrink={0}
                    align="center" justify="center"
                    bg="rgba(255,255,255,0.06)" border={`1px solid rgba(255,255,255,0.10)`}
                  >
                    <ch.icon size={15} color={ch.color} />
                  </Flex>
                  <Box>
                    <Text fontFamily='var(--font-body)'
                      fontSize="10px" fontWeight={700} color={C.textLight}
                      letterSpacing="0.09em" textTransform="uppercase" mb={0.5}>
                      {ch.label}
                    </Text>
                    <Text fontFamily='var(--font-body)'
                      fontSize="sm" color="rgba(255,255,255,0.80)" fontWeight={600}>
                      {ch.value}
                    </Text>
                  </Box>
                </Box>
              </MotionBox>
            ))}
          </VStack>

          {/* Architectural decoration */}
          <MotionBox custom={7} variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }}>
            <Flex align="center" gap={3} mt={12}>
              <Box flex={1} h="1px" bg="color-mix(in srgb, color-mix(in srgb, var(--brand-primary) 70%, white) 15%, transparent)" />
              <Text fontFamily='var(--font-heading)'
                fontSize="xs" color="color-mix(in srgb, color-mix(in srgb, var(--brand-primary) 70%, white) 30%, transparent)"
                letterSpacing="0.16em" textTransform="uppercase">
                {site.studio_name}
              </Text>
              <Box flex={1} h="1px" bg="color-mix(in srgb, color-mix(in srgb, var(--brand-primary) 70%, white) 15%, transparent)" />
            </Flex>
          </MotionBox>
        </Box>

        {/* ── Right: Form ── */}
        <MotionBox
          custom={2} variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }}
          w={{ base: 'full', lg: '420px' }} flexShrink={0}
        >
          {sent ? (
            <Box
              p={8} borderRadius="24px"
              bg="rgba(255,255,255,0.06)" border={`1px solid ${C.border}`}
              backdropFilter="blur(20px)" style={{ WebkitBackdropFilter: 'blur(20px)' }}
            >
              <VStack gap={3} textAlign="center" py={6}>
                <Flex w="56px" h="56px" borderRadius="full"
                  bg="color-mix(in srgb, color-mix(in srgb, var(--brand-primary) 70%, white) 12%, transparent)" align="center" justify="center"
                  border="1px solid color-mix(in srgb, color-mix(in srgb, var(--brand-primary) 70%, white) 20%, transparent)">
                  <FaEnvelope size={20} color={C.accent} />
                </Flex>
                <Text fontFamily='var(--font-heading)'
                  fontSize="2xl" color="white" letterSpacing="0.04em">
                  {t('home.contact.sentTitle')}
                </Text>
                <Text fontFamily='var(--font-body)'
                  fontSize="sm" color={C.textMuted}>
                  {t('home.contact.sentBody')}
                </Text>
              </VStack>
            </Box>
          ) : (
            <Box
              p={{ base: 6, md: 8 }} borderRadius="24px"
              bg="rgba(255,255,255,0.05)" border={`1px solid ${C.border}`}
              backdropFilter="blur(20px)" style={{ WebkitBackdropFilter: 'blur(20px)' }}
              boxShadow="0 24px 60px rgba(0,0,0,0.30)"
            >
              {/* Form header */}
              <Box mb={6}>
                <Text fontFamily='var(--font-heading)'
                  fontSize="xl" color="white" letterSpacing="0.05em" mb={1}>
                  {t('home.contact.formTitle')}
                </Text>
                <Text fontFamily='var(--font-body)'
                  fontSize="12px" color={C.textMuted}>
                  {t('home.contact.formSub')}
                </Text>
              </Box>

              <VStack gap={3}>
                <Input
                  placeholder={t('home.contact.namePh2')}
                  value={name} onChange={e => setName(e.target.value)}
                  bg={C.inputBg} border={`1px solid ${C.border}`}
                  borderRadius="12px" color="white" fontSize="sm"
                  fontFamily='var(--font-body)'
                  _focus={{ borderColor: 'color-mix(in srgb, color-mix(in srgb, var(--brand-primary) 70%, white) 50%, transparent)', bg: 'rgba(255,255,255,0.09)', boxShadow: 'none' }}
                  _placeholder={{ color: C.textLight }}
                  h="46px" px={4}
                />
                <Input
                  placeholder={t('home.contact.emailPh2')}
                  type="email" value={email} onChange={e => setEmail(e.target.value)}
                  bg={C.inputBg} border={`1px solid ${C.border}`}
                  borderRadius="12px" color="white" fontSize="sm"
                  fontFamily='var(--font-body)'
                  _focus={{ borderColor: 'color-mix(in srgb, color-mix(in srgb, var(--brand-primary) 70%, white) 50%, transparent)', bg: 'rgba(255,255,255,0.09)', boxShadow: 'none' }}
                  _placeholder={{ color: C.textLight }}
                  h="46px" px={4}
                />
                <Textarea
                  placeholder={t('home.contact.messagePh2')}
                  value={message} onChange={e => setMsg(e.target.value)}
                  bg={C.inputBg} border={`1px solid ${C.border}`}
                  borderRadius="12px" color="white" fontSize="sm"
                  fontFamily='var(--font-body)'
                  _focus={{ borderColor: 'color-mix(in srgb, color-mix(in srgb, var(--brand-primary) 70%, white) 50%, transparent)', bg: 'rgba(255,255,255,0.09)', boxShadow: 'none' }}
                  _placeholder={{ color: C.textLight }}
                  rows={4} px={4} pt={3} resize="none"
                />
                <Button
                  onClick={handleSubmit}
                  disabled={submitting || !name || !email}
                  w="full" h="50px" borderRadius="14px"
                  bg={`linear-gradient(135deg, ${C.accent}, ${C.accentDark})`}
                  color="white" fontWeight={700} fontSize="sm"
                  fontFamily='var(--font-body)'
                  cursor="pointer"
                  boxShadow="0 6px 24px color-mix(in srgb, color-mix(in srgb, var(--brand-primary) 70%, white) 25%, transparent)"
                  _hover={{ boxShadow: '0 10px 32px color-mix(in srgb, color-mix(in srgb, var(--brand-primary) 70%, white) 35%, transparent)', opacity: 0.92 }}
                  _disabled={{ opacity: 0.4, cursor: 'not-allowed' }}
                  transition="all 0.22s ease"
                >
                  {submitting ? <Spinner size="sm" color="white" /> : t('home.contact.sendBtn')}
                </Button>
              </VStack>
            </Box>
          )}

          {/* Nota de ubicación (solo si el estudio tiene dirección) */}
          <Flex align="center" gap={2} mt={5} px={1} display={address ? 'flex' : 'none'}>
            <FaMapMarkerAlt size={11} color="color-mix(in srgb, color-mix(in srgb, var(--brand-primary) 70%, white) 40%, transparent)" />
            <Text fontFamily='var(--font-body)'
              fontSize="12px" color="rgba(255,255,255,0.28)">
              {address}
            </Text>
          </Flex>
        </MotionBox>
      </Flex>
    </Box>
  );
}

// Se renderiza en el servidor (datos de contacto en el HTML inicial) con el
// idioma de la página.
function Contacto() {
  return (
    <Chakra>
      <ContactInner />
    </Chakra>
  );
}

export default withSsrLang(Contacto);
