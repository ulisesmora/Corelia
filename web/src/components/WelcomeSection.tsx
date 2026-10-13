"use client";
import React from 'react';
import { Box, Button, Flex, Text, VStack } from '@chakra-ui/react';
import { motion } from 'framer-motion';
import Chakra from './ChakraProvider';
import ImageSlider from './ImageSlider/ImageCarrousel';
import { useT } from '../i18n/index';
import { FaArrowRight, FaLeaf } from 'react-icons/fa';
import { lt, useSite } from '../lib/site';
import { useLangStore, withSsrLang } from './stores/lang.store';

const MotionBox = motion(Box as any);
const MotionFlex = motion(Flex as any);
const MotionText = motion(Text as any);

const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.12, delayChildren: 0.1 } },
};
const fadeUp = {
  hidden: { opacity: 0, y: 22 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.55, ease: [0.25, 0.46, 0.45, 0.94] } },
};
const fadeIn = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.7 } },
};

function WelcomeSectionInner({ initialImages }: { initialImages?: string[] | null }) {
  const t = useT();
  const site = useSite();
  const lang = useLangStore((st) => st.lang);

  return (
    <Chakra>
      <Box
        w="100%"
        py={{ base: 16, md: 24 }}
        px={{ base: 5, md: 8, lg: 12 }}
        position="relative"
        overflow="hidden"
        bg="linear-gradient(150deg, color-mix(in srgb, var(--brand-primary) 22%, white) 0%, var(--brand-bg) 45%, color-mix(in srgb, var(--brand-primary) 25%, white) 100%)"
      >
        {/* Grain texture overlay */}
        <Box
          position="absolute" inset={0} zIndex={0} pointerEvents="none"
          opacity={0.025}
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
            backgroundRepeat: 'repeat',
            backgroundSize: '180px 180px',
          }}
        />

        {/* Organic blobs */}
        <Box position="absolute" top="-10%" right="-5%" w={{ base: '260px', md: '420px' }} h={{ base: '260px', md: '420px' }}
          borderRadius="full" bg="color-mix(in srgb, color-mix(in srgb, var(--brand-primary) 70%, white) 14%, transparent)" filter="blur(80px)" zIndex={0} pointerEvents="none" />
        <Box position="absolute" bottom="-8%" left="-8%" w={{ base: '220px', md: '380px' }} h={{ base: '220px', md: '380px' }}
          borderRadius="full" bg="color-mix(in srgb, var(--brand-primary) 10%, transparent)" filter="blur(70px)" zIndex={0} pointerEvents="none" />
        <Box position="absolute" top="35%" left="40%" w="200px" h="200px"
          borderRadius="full" bg="color-mix(in srgb, color-mix(in srgb, var(--brand-primary) 85%, white) 7%, transparent)" filter="blur(50px)" zIndex={0} pointerEvents="none" />

        {/* Main layout */}
        <Flex
          direction={{ base: 'column', lg: 'row' }}
          maxW="1280px" mx="auto"
          align="center"
          gap={{ base: 12, lg: 16 }}
          position="relative" zIndex={1}
        >
          {/* ── Left: Text content ── */}
          <MotionFlex
            direction="column"
            flex={1}
            gap={0}
            variants={stagger}
            initial="hidden"
            animate="visible"
          >
            {/* Etiqueta con la ciudad o el lema del estudio (si los hay) */}
            {(site.contact.city || lt(site, 'tagline', lang)) && (
            <MotionBox variants={fadeUp} mb={5}>
              <Flex
                display="inline-flex" align="center" gap={2}
                px={4} py={1.5} borderRadius="full"
                bg="color-mix(in srgb, var(--brand-primary) 12%, transparent)"
                border="1px solid color-mix(in srgb, var(--brand-primary) 25%, transparent)"
              >
                <FaLeaf size={11} color="var(--brand-primary)" />
                <Text fontSize="11px" fontWeight={700} color="var(--brand-primary)"
                  fontFamily='var(--font-body)' letterSpacing="0.10em" textTransform="uppercase">
                  {site.contact.city || lt(site, 'tagline', lang)}
                </Text>
              </Flex>
            </MotionBox>
            )}

            {/* Main title */}
            <MotionText
              variants={fadeUp}
              as="h2"
              fontSize={{ base: '4xl', sm: '5xl', md: '6xl', lg: '7xl' }}
              fontFamily='var(--font-heading)'
              color="var(--brand-dark)"
              letterSpacing="0.03em"
              lineHeight="0.95"
              mb={3}
            >
              {t("home.welcome.title")}
            </MotionText>

            {/* Decorative line */}
            <MotionBox variants={fadeUp} mb={6}>
              <Box w="56px" h="2px" borderRadius="full"
                bg="linear-gradient(90deg, var(--brand-primary), color-mix(in srgb, var(--brand-primary) 20%, transparent))" />
            </MotionBox>

            {/* Subheading */}
            <MotionText
              variants={fadeUp}
              fontSize={{ base: 'lg', md: 'xl' }}
              fontWeight={600}
              color="var(--brand-primary)"
              fontFamily='var(--font-body)'
              mb={4}
              lineHeight="1.45"
            >
              {lt(site.content, 'about_title', lang) || t("home.welcome.heading")}
            </MotionText>

            {/* Description */}
            <MotionBox variants={fadeUp} mb={6}>
              <Text fontSize={{ base: 'md', md: 'lg' }} color="color-mix(in srgb, var(--brand-secondary) 64%, var(--brand-dark))"
                fontFamily='var(--font-body)' lineHeight="1.75"
                maxW="540px" whiteSpace="pre-line">
                {/* Texto "Sobre nosotros" del panel; si no hay, el genérico */}
                {lt(site.content, 'about_text', lang) || <>{t("home.welcome.intro1")}{' '}{t("home.welcome.intro2")}</>}
              </Text>
            </MotionBox>

            {/* Three pillars */}
            <MotionFlex variants={fadeUp} gap={3} mb={9} wrap="wrap">
              {[t('home.welcome.pillMovement'), t('home.welcome.pillCalm'), t('home.welcome.pillConnection')].map((pill) => (
                <Box key={pill}
                  px={4} py={2} borderRadius="full"
                  bg="rgba(255,255,255,0.55)"
                  backdropFilter="blur(12px)"
                  style={{ WebkitBackdropFilter: 'blur(12px)' }}
                  border="1px solid rgba(255,255,255,0.70)"
                  boxShadow="0 2px 10px color-mix(in srgb, var(--brand-dark) 6%, transparent)"
                >
                  <Text fontSize="sm" fontWeight={600} color="color-mix(in srgb, var(--brand-primary) 28%, var(--brand-dark))"
                    fontFamily='var(--font-body)' letterSpacing="0.02em">
                    {pill}
                  </Text>
                </Box>
              ))}
            </MotionFlex>

            {/* CTA */}
            <MotionBox variants={fadeUp}>
              <Button
                as="a"
                href={t('nav.items.classes.href') || '/classes'}
                size="lg"
                borderRadius="full"
                px={8}
                py={6}
                fontWeight={600}
                fontFamily='var(--font-body)'
                fontSize="md"
                bg="linear-gradient(135deg, var(--brand-primary), color-mix(in srgb, var(--brand-primary) 60%, var(--brand-dark)))"
                color="white"
                boxShadow="0 8px 28px color-mix(in srgb, var(--brand-primary) 35%, transparent)"
                cursor="pointer"
                gap={2}
                _hover={{
                  boxShadow: '0 12px 36px color-mix(in srgb, var(--brand-primary) 45%, transparent)',
                  transform: 'translateY(-2px)',
                }}
                transition="all 0.25s ease"
              >
                {t("home.welcome.cta")}
                <FaArrowRight size={13} />
              </Button>
            </MotionBox>
          </MotionFlex>

          {/* ── Right: Image slider ── */}
          <MotionBox
            flex={1}
            w={{ base: '100%', lg: 'auto' }}
            variants={fadeIn}
            initial="hidden"
            animate="visible"
            position="relative"
          >
            {/* Decorative ring behind slider */}
            <Box
              position="absolute"
              inset="-12px"
              borderRadius="3xl"
              border="1px solid color-mix(in srgb, var(--brand-primary) 15%, transparent)"
              zIndex={0}
              pointerEvents="none"
            />
            <Box
              borderRadius="2xl"
              overflow="hidden"
              boxShadow="0 20px 60px color-mix(in srgb, var(--brand-dark) 14%, transparent), 0 4px 16px color-mix(in srgb, var(--brand-dark) 8%, transparent)"
              position="relative" zIndex={1}
              border="1px solid rgba(255,255,255,0.60)"
            >
              <ImageSlider initialImages={initialImages} />
            </Box>

            {/* Floating detail chip */}
            <Box
              position="absolute"
              bottom="-16px"
              left={{ base: '50%', lg: '24px' }}
              transform={{ base: 'translateX(-50%)', lg: 'none' }}
              px={4} py={2.5}
              borderRadius="full"
              bg="rgba(255,255,255,0.80)"
              backdropFilter="blur(16px)"
              style={{ WebkitBackdropFilter: 'blur(16px)' }}
              border="1px solid rgba(255,255,255,0.75)"
              boxShadow="0 8px 24px color-mix(in srgb, var(--brand-dark) 10%, transparent)"
              zIndex={2}
              whiteSpace="nowrap"
            >
              <Text fontSize="xs" fontWeight={700} color="color-mix(in srgb, var(--brand-primary) 28%, var(--brand-dark))"
                fontFamily='var(--font-body)' letterSpacing="0.04em">
                {t('home.welcome.featureBadge')}
              </Text>
            </Box>
          </MotionBox>
        </Flex>
      </Box>
    </Chakra>
  );
}

// Se renderiza en el servidor (texto "Sobre nosotros" en el HTML inicial) con
// el idioma de la página; `initialImages` = fotos de la galería ya cargadas.
export default withSsrLang(WelcomeSectionInner);
