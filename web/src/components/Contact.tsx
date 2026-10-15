"use client";

import React, { useState, useCallback } from 'react';
import { Box, Flex, Input, Textarea, Button, Text, VStack, HStack, Spinner } from '@chakra-ui/react';
import { motion } from 'framer-motion';
import Chakra from './ChakraProvider';
import { Toaster, toaster } from './ui/toaster';
import { useT } from '../i18n';
import { Icon, type IconName } from './ui/Icon';
import { API_V1 } from '../config';
import { addressLine, instagramHandle, instagramUrl, mapsUrl, phoneHref, socialProfiles, useSite, whatsappUrl } from '../lib/site';
import { useLangStore } from './stores/lang.store';
import { withSsrLang } from './stores/lang.store';

const MotionBox = motion(Box as any);
const MotionFlex = motion(Flex as any);

const API_BASE_URL = `${API_V1}/contact-user/`;

// Bloque de contacto = zona profunda: tokens --deep-* del estilo visual (presets.css).
// Los rellenos sutiles salen del propio --deep-text para que funcionen en cualquier estilo.
const C = {
  accent: 'var(--brand-primary-on-dark)',
  text: 'var(--deep-text)', textMuted: 'var(--deep-muted)', textLight: 'color-mix(in srgb, var(--deep-text) 40%, transparent)',
  border: 'var(--deep-border)', borderHover: 'color-mix(in srgb, var(--deep-text) 20%, transparent)',
  inputBg: 'color-mix(in srgb, var(--deep-text) 6%, transparent)',
  fill: (pct: number) => `color-mix(in srgb, var(--deep-text) ${pct}%, transparent)`,
  accentMix: (pct: number) => `color-mix(in srgb, var(--brand-primary-on-dark) ${pct}%, transparent)`,
};

// contactChannels is defined inside ContactInner to access t()

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: (i: number) => ({
    opacity: 1, y: 0,
    transition: { duration: 0.55, delay: i * 0.10, ease: [0.25, 0.46, 0.45, 0.94] },
  }),
};

function ContactInner({ hideHeading = false }: { hideHeading?: boolean }) {
  const t = useT();
  const site = useSite();

  // Canales de contacto de la config del estudio: los vacíos no se muestran
  const wa = whatsappUrl(site);
  const ig = instagramUrl(site);
  const tel = phoneHref(site);
  const address = addressLine(site);
  const contactChannels = [
    wa && { icon: 'whatsapp' as IconName, label: 'WhatsApp', value: site.contact.phone || site.contact.whatsapp, href: wa, color: '#4ADE80' },
    !wa && tel && { icon: 'phone' as IconName, label: t('home.contact.phoneLabel', undefined, 'Teléfono'), value: site.contact.phone, href: tel, color: '#4ADE80' },
    site.contact.email && { icon: 'mail' as IconName, label: 'Email', value: site.contact.email, href: `mailto:${site.contact.email}`, color: C.accent },
    ig && { icon: 'instagram' as IconName, label: 'Instagram', value: `@${instagramHandle(site)}`, href: ig, color: '#F472B6' },
    address && { icon: 'map-pin' as IconName, label: t('home.contact.locationLabel'), value: address, href: mapsUrl(site) || '#', color: C.accent },
  ].filter(Boolean) as { icon: IconName; label: string; value: string; href: string; color: string }[];
  // Otras redes y la ficha de Google (Instagram ya va arriba como canal)
  const lang = useLangStore((st) => st.lang);
  const en = lang === 'en';
  const otherProfiles = socialProfiles(site).filter((p) => p.network !== 'instagram');
  const reviewUrl = site.google_review_url;

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
      // Fondo y texto de la zona profunda (--deep-bg / --deep-text)
      className="sk-deep"
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
        borderRadius="full" bg={C.accentMix(6)} filter="blur(100px)" pointerEvents="none" zIndex={0} />

      <Flex
        maxW="6xl" mx="auto" px={{ base: 6, md: 12 }}
        direction={{ base: 'column', lg: 'row' }}
        gap={{ base: 14, lg: 20 }}
        align={{ base: 'stretch', lg: 'flex-start' }}
        position="relative" zIndex={1}
      >

        {/* ── Left: Editorial info ── */}
        <Box flex={{ base: 'none', lg: '1' }}>
          {!hideHeading && (<>
          {/* Section badge */}
          <MotionBox
            custom={0} variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }}
            display="inline-flex" px={3} py={1} borderRadius="var(--radius-chip)" mb={6}
            bg={C.accentMix(10)} border={`1px solid ${C.accentMix(22)}`}
          >
            <Text fontSize="10px" fontWeight={700} color={C.accent}
              fontFamily='var(--font-body)' letterSpacing="0.12em" textTransform="uppercase">
              {t('home.contact.heading')}
            </Text>
          </MotionBox>

          {/* Big editorial heading */}
          <MotionBox custom={1} variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }}>
            <Text
              className="sk-section-title"
              fontFamily='var(--font-heading)'
              fontSize={{ base: '5xl', md: '7xl', lg: '8xl' }}
              color={C.text}
              letterSpacing="0.03em"
              lineHeight="0.95"
              mb={6}
            >
              {t('home.contact.heading') || 'Hablemos'}
            </Text>
          </MotionBox>

          </>)}
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
                  px={4} py={3.5} borderRadius="var(--radius-card)"
                  bg={C.fill(4)} border={`1px solid ${C.border}`}
                  cursor="pointer" transition="all 0.25s ease"
                  _hover={{ bg: C.fill(8), borderColor: C.borderHover }}
                >
                  <Flex
                    w="40px" h="40px" borderRadius="var(--radius-chip)" flexShrink={0}
                    align="center" justify="center"
                    bg={C.fill(6)} border={`1px solid ${C.border}`}
                  >
                    <Icon name={ch.icon} size={15} color={ch.color} />
                  </Flex>
                  <Box>
                    <Text fontFamily='var(--font-body)'
                      fontSize="10px" fontWeight={700} color={C.textLight}
                      letterSpacing="0.09em" textTransform="uppercase" mb={0.5}>
                      {ch.label}
                    </Text>
                    <Text fontFamily='var(--font-body)'
                      fontSize="sm" color={C.fill(80)} fontWeight={600}>
                      {ch.value}
                    </Text>
                  </Box>
                </Box>
              </MotionBox>
            ))}
          </VStack>

          {/* Redes y ficha de Google (solo las que tenga el estudio) */}
          {otherProfiles.length > 0 && (
            <Flex gap={2.5} mt={4} flexWrap="wrap" aria-label={en ? 'Find us on' : 'Encuéntranos en'} role="list">
              {otherProfiles.map((p) => {
                const label = p.network === 'google-business' ? (en ? 'Google Business Profile' : 'Ficha de Google') : p.label;
                return (
                  <Box key={p.network} role="listitem">
                    <Box
                      as="a" href={p.url} target="_blank" rel="noopener noreferrer"
                      display="inline-flex" alignItems="center" gap={2}
                      px={3.5} h="40px" borderRadius="var(--radius-button)"
                      bg={C.fill(4)} border={`1px solid ${C.border}`}
                      color={C.fill(80)} fontFamily="var(--font-body)" fontSize="sm" fontWeight={600}
                      transition="all 0.25s ease" _hover={{ bg: C.fill(8), borderColor: C.borderHover }}
                    >
                      <Icon name={p.network} size={14} color={C.accent} />
                      {label}
                    </Box>
                  </Box>
                );
              })}
            </Flex>
          )}

          {/* Opinión en Google: el enlace «escribir una reseña» de su ficha */}
          {reviewUrl && (
            <Box
              as="a" href={reviewUrl} target="_blank" rel="noopener noreferrer"
              display="inline-flex" alignItems="center" gap={2.5} mt={5}
              px={5} minH="46px" borderRadius="var(--radius-button)"
              bg="linear-gradient(135deg, var(--brand-primary), var(--brand-primary-2))"
              color="var(--on-primary)" fontFamily="var(--font-body)" fontWeight={700} fontSize="sm"
              textTransform="var(--button-text-transform)" letterSpacing="var(--button-spacing)"
              boxShadow="var(--button-shadow)" _hover={{ boxShadow: 'var(--button-hover-shadow)', opacity: 0.92 }}
            >
              <Icon name="google-business" size={15} />
              {en ? 'Leave us a Google review' : 'Déjanos tu opinión en Google'}
            </Box>
          )}

          {/* Architectural decoration */}
          <MotionBox custom={7} variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }}>
            <Flex align="center" gap={3} mt={12}>
              <Box flex={1} h="1px" bg={C.accentMix(15)} />
              <Text fontFamily='var(--font-heading)'
                fontSize="xs" color={C.accentMix(30)}
                letterSpacing="0.16em" textTransform="uppercase">
                {site.studio_name}
              </Text>
              <Box flex={1} h="1px" bg={C.accentMix(15)} />
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
              p={8} borderRadius="var(--radius-card)"
              bg={C.fill(6)} border={`var(--border-width) solid ${C.border}`}
              backdropFilter="var(--surface-blur)" style={{ WebkitBackdropFilter: 'var(--surface-blur)' }}
            >
              <VStack gap={3} textAlign="center" py={6}>
                <Flex w="56px" h="56px" borderRadius="full"
                  bg={C.accentMix(12)} align="center" justify="center"
                  border={`1px solid ${C.accentMix(20)}`}>
                  <Icon name="mail" size={20} color={C.accent} />
                </Flex>
                <Text fontFamily='var(--font-heading)'
                  fontSize="2xl" color={C.text} letterSpacing="0.04em">
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
              p={{ base: 6, md: 8 }} borderRadius="var(--radius-card)"
              bg={C.fill(5)} border={`var(--border-width) solid ${C.border}`}
              backdropFilter="var(--surface-blur)" style={{ WebkitBackdropFilter: 'var(--surface-blur)' }}
              boxShadow="var(--shadow-card)"
            >
              {/* Form header */}
              <Box mb={6}>
                <Text fontFamily='var(--font-heading)'
                  fontSize="xl" color={C.text} letterSpacing="0.05em" mb={1}>
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
                  borderRadius="var(--radius-input)" color={C.text} fontSize="sm"
                  fontFamily='var(--font-body)'
                  _focus={{ borderColor: C.accentMix(50), bg: C.fill(9), boxShadow: 'none' }}
                  _placeholder={{ color: C.textLight }}
                  h="46px" px={4}
                />
                <Input
                  placeholder={t('home.contact.emailPh2')}
                  type="email" value={email} onChange={e => setEmail(e.target.value)}
                  bg={C.inputBg} border={`1px solid ${C.border}`}
                  borderRadius="var(--radius-input)" color={C.text} fontSize="sm"
                  fontFamily='var(--font-body)'
                  _focus={{ borderColor: C.accentMix(50), bg: C.fill(9), boxShadow: 'none' }}
                  _placeholder={{ color: C.textLight }}
                  h="46px" px={4}
                />
                <Textarea
                  placeholder={t('home.contact.messagePh2')}
                  value={message} onChange={e => setMsg(e.target.value)}
                  bg={C.inputBg} border={`1px solid ${C.border}`}
                  borderRadius="var(--radius-input)" color={C.text} fontSize="sm"
                  fontFamily='var(--font-body)'
                  _focus={{ borderColor: C.accentMix(50), bg: C.fill(9), boxShadow: 'none' }}
                  _placeholder={{ color: C.textLight }}
                  rows={4} px={4} pt={3} resize="none"
                />
                <Button
                  onClick={handleSubmit}
                  disabled={submitting || !name || !email}
                  // Sobre la zona profunda: relleno primario fijo (sk-btn sería un contorno
                  // oscuro en editorial/neón); radio y mayúsculas del estilo
                  w="full" h="50px" borderRadius="var(--radius-button)"
                  bg="linear-gradient(135deg, var(--brand-primary), var(--brand-primary-2))"
                  color="var(--on-primary)" fontWeight={700} fontSize="sm"
                  fontFamily='var(--font-body)'
                  textTransform="var(--button-text-transform)" letterSpacing="var(--button-spacing)"
                  cursor="pointer"
                  boxShadow="var(--button-shadow)"
                  _hover={{ boxShadow: 'var(--button-hover-shadow)', opacity: 0.92 }}
                  _disabled={{ opacity: 0.4, cursor: 'not-allowed' }}
                  transition="all 0.22s ease"
                >
                  {submitting ? <Spinner size="sm" color="var(--on-primary)" /> : t('home.contact.sendBtn')}
                </Button>
              </VStack>
            </Box>
          )}

          {/* Nota de ubicación (solo si el estudio tiene dirección) */}
          <Flex align="center" gap={2} mt={5} px={1} display={address ? 'flex' : 'none'}>
            <Icon name="map-pin" size={11} color={C.accentMix(40)} />
            <Text fontFamily='var(--font-body)'
              fontSize="12px" color={C.textLight}>
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
/** `hideHeading`: en /contacto la página ya tiene su título (sin «Contáctanos» repetido). */
function Contacto({ hideHeading = false }: { hideHeading?: boolean }) {
  return (
    <Chakra>
      <ContactInner hideHeading={hideHeading} />
    </Chakra>
  );
}

export default withSsrLang(Contacto);
