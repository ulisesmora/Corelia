'use client';

import { Box, Flex, Text, SimpleGrid } from '@chakra-ui/react';
import { motion } from 'framer-motion';
import Chakra from './ChakraProvider';
import { FaInstagram, FaWhatsapp, FaMapMarkerAlt, FaEnvelope, FaPhone } from 'react-icons/fa';
import { useMemo } from 'react';
import { useT } from '../i18n';
import BrandLogo from './BrandLogo';
import { useLangStore, withSsrLang } from './stores/lang.store';
import { addressLine, instagramHandle, instagramUrl, mapsUrl, phoneHref, useSite, whatsappUrl } from '../lib/site';

const C = {
  accent: 'color-mix(in srgb, var(--brand-primary) 70%, white)', border: 'rgba(255,255,255,0.09)',
  textMuted: 'rgba(255,255,255,0.50)', textLight: 'rgba(255,255,255,0.28)',
};

function FooterInner() {
  const t = useT();
  const site = useSite();
  const lang = useLangStore((st) => st.lang);
  const year = useMemo(() => new Date().getFullYear(), []);
  const homeHref = t('nav.items.home.href') || '/';
  const classesHref = t('nav.items.classes.href') || '/classes';

  // Contacto y redes desde la config del estudio: lo que esté vacío no se muestra
  const wa = whatsappUrl(site);
  const ig = instagramUrl(site);
  const tel = phoneHref(site);
  const address = addressLine(site);
  const socialLinks = [
    ig && { icon: FaInstagram, href: ig, label: 'Instagram', color: '#F472B6' },
    wa && { icon: FaWhatsapp, href: wa, label: 'WhatsApp', color: '#4ADE80' },
  ].filter(Boolean) as { icon: typeof FaInstagram; href: string; label: string; color: string }[];
  const contactItems = [
    site.contact.email && { icon: FaEnvelope, text: site.contact.email, href: `mailto:${site.contact.email}` },
    wa && { icon: FaWhatsapp, text: site.contact.phone || 'WhatsApp', href: wa },
    !wa && tel && { icon: FaPhone, text: site.contact.phone, href: tel },
    ig && !wa && { icon: FaInstagram, text: `@${instagramHandle(site)}`, href: ig },
    address && { icon: FaMapMarkerAlt, text: address, href: mapsUrl(site) || '#' },
  ].filter(Boolean) as { icon: typeof FaEnvelope; text: string; href: string }[];
  const tagline = site.tagline || site.contact.city;

  return (
    <Box
      as="footer"
      position="relative"
      w="100%"
      bg="linear-gradient(160deg, color-mix(in srgb, var(--brand-dark) 30%, black) 0%, color-mix(in srgb, var(--brand-dark) 45%, black) 60%, color-mix(in srgb, var(--brand-dark) 30%, black) 100%)"
      borderTop="1px solid color-mix(in srgb, color-mix(in srgb, var(--brand-primary) 70%, white) 12%, transparent)"
      color="white"
      overflow="hidden"
    >
      {/* Grain texture */}
      <Box position="absolute" inset={0} pointerEvents="none" opacity={0.030}
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 512 512' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
          backgroundSize: '200px',
        }} />

      {/* Warm ambient glow */}
      <Box position="absolute" top="-30%" left="20%" w="400px" h="300px"
        borderRadius="full" bg="color-mix(in srgb, color-mix(in srgb, var(--brand-primary) 70%, white) 5%, transparent)" filter="blur(100px)" pointerEvents="none" />

      {/* ── Main content ── */}
      <Box maxW="6xl" mx="auto" px={{ base: 6, md: 12 }} pt={{ base: 14, md: 20 }} pb={{ base: 10, md: 14 }}
        position="relative" zIndex={1}>

        {/* Big logo / brand statement */}
        <Box mb={14} pb={10} borderBottom={`1px solid ${C.border}`}>
          <Flex direction={{ base: 'column', md: 'row' }} align={{ base: 'flex-start', md: 'flex-end' }}
            justify="space-between" gap={6}>
            <Box>
              {(site.logo_light_url || site.logo_url) && (
                <BrandLogo variant="light" width={120} maxHeight={80} alt={site.studio_name}
                  style={{ marginBottom: '16px', opacity: 0.90 }} />
              )}
              <Text
                fontFamily='var(--font-heading)'
                fontSize={{ base: '3xl', md: '5xl' }}
                color="white" letterSpacing="0.04em" lineHeight="1"
              >
                {site.studio_name}
              </Text>
              <Text fontFamily='var(--font-body)'
                fontSize="md" color={C.textMuted} mt={2} maxW="340px" lineHeight="1.65">
                {t('home.footer.brandBlurb')}
              </Text>
            </Box>

            {/* Redes (solo las que tenga el estudio) */}
            <Flex gap={3} display={socialLinks.length ? 'flex' : 'none'}>
              {socialLinks.map(({ icon: Icon, href, label, color }) => (
                <Box
                  key={label}
                  as="a" href={href} target="_blank" rel="noopener noreferrer"
                  w="48px" h="48px" borderRadius="14px"
                  display="flex" alignItems="center" justifyContent="center"
                  bg="rgba(255,255,255,0.05)" border={`1px solid ${C.border}`}
                  cursor="pointer" transition="all 0.22s"
                  _hover={{ bg: 'rgba(255,255,255,0.10)', borderColor: 'rgba(255,255,255,0.18)' }}
                  title={label}
                >
                  <Icon size={18} color={color} />
                </Box>
              ))}
            </Flex>
          </Flex>
        </Box>

        {/* Columns */}
        <SimpleGrid columns={{ base: 1, sm: 2, md: 3 }} gap={10} mb={14}>

          {/* Navigation */}
          <Box>
            <Text fontFamily='var(--font-body)' fontSize="11px" fontWeight={700}
              color={C.accent} letterSpacing="0.12em" textTransform="uppercase" mb={5}>
              {t('home.footer.navTitle') || 'Navegación'}
            </Text>
            <Flex direction="column" gap={3}>
              {[
                { label: t('home.footer.nav.home') || 'Inicio', href: homeHref },
                { label: t('nav.items.calendar.label') || 'Horario', href: '/calendar' },
                { label: t('nav.items.prices.label') || 'Precios', href: '/prices' },
                { label: t('home.footer.nav.contact') || 'Contacto', href: `${homeHref}#contacto` },
                { label: lang === 'en' ? 'Terms & conditions' : 'Términos y condiciones', href: t('links.terms') || '/terminos-condiciones' },
              ].map(({ label, href }) => (
                <Box as="a" key={label} href={href}
                  fontFamily='var(--font-body)'
                  fontSize="md" color={C.textMuted} fontWeight={500}
                  transition="color 0.18s"
                  _hover={{ color: 'white' }}
                  display="block"
                >
                  {label}
                </Box>
              ))}
            </Flex>
          </Box>

          {/* Classes */}
          <Box>
            <Text fontFamily='var(--font-body)' fontSize="11px" fontWeight={700}
              color={C.accent} letterSpacing="0.12em" textTransform="uppercase" mb={5}>
              {t('home.footer.classesTitle')}
            </Text>
            <Flex direction="column" gap={3}>
              {['pilates', 'yoga', 'meditation', 'dance'].map(k => t(`home.footer.classList.${k}`)).map(c => (
                <Box as="a" key={c} href={classesHref}
                  fontFamily='var(--font-body)'
                  fontSize="md" color={C.textMuted} fontWeight={500}
                  transition="color 0.18s"
                  _hover={{ color: 'white' }}
                  display="block"
                >
                  {c}
                </Box>
              ))}
            </Flex>
          </Box>

          {/* Contact */}
          <Box>
            <Text fontFamily='var(--font-body)' fontSize="11px" fontWeight={700}
              color={C.accent} letterSpacing="0.12em" textTransform="uppercase" mb={5}>
              {t('home.footer.contactTitle') || 'Contacto'}
            </Text>
            <Flex direction="column" gap={3}>
              {contactItems.map(({ icon: Icon, text, href }) => (
                <Box as="a" key={text} href={href}
                  target={href.startsWith('http') ? '_blank' : undefined}
                  rel="noopener noreferrer"
                  display="flex" alignItems="center" gap={2.5}
                  fontFamily='var(--font-body)'
                  fontSize="md" color={C.textMuted}
                  transition="color 0.18s" _hover={{ color: 'white' }}
                  cursor="pointer"
                >
                  <Icon size={13} color={C.accent} />
                  {text}
                </Box>
              ))}
            </Flex>
          </Box>
        </SimpleGrid>

        {/* Bottom bar */}
        <Flex
          direction={{ base: 'column', sm: 'row' }}
          align="center" justify="space-between"
          pt={6} borderTop={`1px solid ${C.border}`}
          gap={3}
        >
          <Text fontFamily='var(--font-body)' fontSize="sm" color={C.textLight}>
            © {year} {site.legal.name || site.studio_name}. {t('home.footer.copyright')}
          </Text>
          {tagline && (
            <Flex align="center" gap={2}>
              <Box w="6px" h="6px" borderRadius="full" bg={C.accent}
                boxShadow={`0 0 8px ${C.accent}`} />
              <Text fontFamily='var(--font-heading)' textTransform="uppercase"
                fontSize="sm" color="color-mix(in srgb, color-mix(in srgb, var(--brand-primary) 70%, white) 35%, transparent)" letterSpacing="0.12em">
                {[site.studio_name, tagline].join(' · ')}
              </Text>
            </Flex>
          )}
        </Flex>
      </Box>
    </Box>
  );
}

function Footer() {
  return <Chakra><FooterInner /></Chakra>;
}

export default withSsrLang(Footer);
