"use client"; // Directiva para indicar que es un Client Component

import React, { useState, useMemo, useCallback, useEffect, useRef } from "react";
import {
  Button,
  Dialog,
  Field,
  Flex,
  Input,
  Portal,
  Stack,
  Text,
  VStack,
  Heading,
  Icon,
  InputGroup,
  Spinner,
  Checkbox,
  Link,
  Select,
  createListCollection,
  HStack,
  Box,
} from "@chakra-ui/react";
import { Icon as SiteIcon } from "./ui/Icon";
import Chakra from "./ChakraProvider";
import { Toaster, toaster } from "./ui/toaster";
import { useT } from '../i18n/index';
import { useLangStore } from './stores/lang.store';
import { trStrict } from '../utils/localized';
import { API_ROOT, API_V1 } from '../config';
import { scheduleOptions, useInterestOptions } from '../utils/preferenceOptions';
import { lt, useSite } from '../lib/site';



export default function HeroWithVideo() {
  const [name, setName] = useState("");
  const t = useT();
  const lang = useLangStore((s) => s.lang);
  const [email, setEmail] = useState("");
  const [heroTitle, setHeroTitle] = useState('');
  const [heroSubtitle, setHeroSubtitle] = useState('');

  // Imagen del hero: la primera foto activa de la sección "hero" del panel.
  // Sin foto, fondo con el degradado de la marca.
  const site = useSite();
  const [heroImage, setHeroImage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [acceptGeneralTerms, setAcceptGeneralTerms] = useState(false);
  const [acceptPromoTerms, setAcceptPromoTerms] = useState(false);
   const [step, setStep] = useState(1); // 👈 NUEVO: Estado para el paso
  const [gender, setGender] = useState<string[]>([]) // 👈 NUEVO: Género
   const [interests, setInterests] = useState<string[]>([]); 
  const [experienceLevel, setExperienceLevel] = useState<string[]>([])// 👈 NUEVO: Nivel de experiencia
  const [birthDate, setBirthDate] = useState<string[]>([]) // 👈 NUEVO: Fecha de nacimiento
  const [preferredSchedule, setPreferredSchedule] = useState<string[]>([]) // 👈 NUEVO: Horario preferido
   const [preferredDays, setPreferredDays] = useState<string[]>([]); // ✅ NUEVO: Días de la semana preferidos

  // Título y subtítulo del hero: los del panel (Ajustes → Contenido de la web)
  // mandan; si no hay, los de la foto del hero o el texto del diccionario.
  const panelTitle = lt(site.content, 'hero_title', lang);
  const panelSubtitle = lt(site.content, 'hero_subtitle', lang);

  useEffect(() => {
    const BASE = API_ROOT;
    fetch(`${BASE}/v1/site-images/?section=hero&is_active=true&ordering=order&limit=1`)
      .then(r => r.json())
      .then(d => {
        const imgs = Array.isArray(d) ? d : d.results || [];
        if (imgs.length > 0) {
          const img = imgs[0];
          if (img.image) setHeroImage(img.image);
          const enTitle = lang === 'en' ? trStrict(img, 'title', lang) : '';
          if (enTitle) setHeroTitle(enTitle);
          // Sin traducción en el CMS: en inglés no mostramos el título en
          // español, usamos el titular del diccionario.
          else if (lang !== 'es') setHeroTitle(t('home.hero.h1'));
          else if (img.title) setHeroTitle(img.title);
          // Siempre se reasigna: antes, al volver a ES se quedaba el subtítulo inglés.
          setHeroSubtitle(lang === 'en' ? trStrict(img, 'subtitle', lang) : '');
        }
      })
      .catch(() => {});
  }, [lang, t]);

  const genderCollection = useMemo(() => createListCollection({
    items: [
      { label: t("home.heroVideo.genderFemale") || "Femenino", value: "Femenino" },
      { label: t("home.heroVideo.genderMale") || "Masculino", value: "Masculino" },
      { label: t("home.heroVideo.genderOther") || "Otro/Prefiero no decirlo", value: "Otro" },
    ],
}), [t]);

const interestOptions = useInterestOptions(lang);
    const interestsCollection = useMemo(() => createListCollection({ items: interestOptions }), [interestOptions]);

const experienceCollection = useMemo(() => createListCollection({
    items: [
        { value: "Nunca", label: t("home.heroVideo.expNever") || "Primera vez" },
        { value: "Principiante", label: t("home.heroVideo.expBeginner") || "Principiante" },
        { value: "Intermedio", label: t("home.heroVideo.expIntermediate") || "Intermedio" },
        { value: "Avanzado", label: t("home.heroVideo.expAdvanced") || "Avanzado" },
    ],
}), [t]);


const daysCollection = useMemo(() => createListCollection({
    items: [
        { label: t("home.heroVideo.dayMonday") || "Lunes", value: "Lunes" },
        { label: t("home.heroVideo.dayTuesday") || "Martes", value: "Martes" },
        { label: t("home.heroVideo.dayWednesday") || "Miércoles", value: "Miércoles" },
        { label: t("home.heroVideo.dayThursday") || "Jueves", value: "Jueves" },
        { label: t("home.heroVideo.dayFriday") || "Viernes", value: "Viernes" },
        { label: t("home.heroVideo.dayWeekend") || "Fin de semana", value: "Fin de semana" },
    ],
}), [t]);

// ✅ COLECCIÓN MODIFICADA: Horarios
const scheduleCollection = useMemo(() => createListCollection({ items: scheduleOptions(t) }), [t]);


  // ➡️ Handler para avanzar al Paso 2 (NUEVO)
  const handleNextStep = useCallback(() => {
    if (name.length > 0 && email.length > 0 && acceptGeneralTerms && acceptPromoTerms) {
        setStep(2);
    } else {
        toaster.create({
            description: t("home.heroVideo.step1Validation"),
            type: "error",
            duration: 3000,
        });
    }
  }, [name, email, acceptGeneralTerms, acceptPromoTerms, t]);

  // ⬅️ Handler para volver al Paso 1 (NUEVO)
  const handleBackStep = useCallback(() => {
    setStep(1);
  }, []);

  // URL del API para guardar el lead (relativa: pasa por el proxy /api)
  const API_BASE_URL = `${API_V1}/leads/`;

  // ✅ estilos inline memorizados (evita nuevas referencias en cada render)
  const rootStyle = useMemo(
    () => ({
      position: "relative" as const,
      width: "100vw",
      height: "100vh",
      overflow: "hidden" as const,
    }),
    []
  );

  const videoStyle = useMemo(
    () => ({
      position: "absolute" as const,
      top: "50%",
      left: "50%",
      minWidth: "100%",
      minHeight: "100%",
      width: "auto",
      height: "auto",
      transform: "translate(-50%, -50%)",
      objectFit: "cover" as const,
      zIndex: 0,
    }),
    []
  );

  const overlayStyle = useMemo(
    () => ({
      position: "absolute" as const,
      top: 0,
      left: 0,
      width: "100%",
      height: "100%",
      backgroundColor: "rgba(0,0,0,0.5)",
      zIndex: 1,
    }),
    []
  );

  const buttonHover = useMemo(
    () => ({
      transform: "translateY(-2px)",
      boxShadow: "lg",
      color: "black",
    }),
    []
  );

  const inputFocus = useMemo(
    () => ({
      borderColor: "var(--brand-secondary)",
      boxShadow: "0 0 0 1px var(--brand-secondary)",
    }),
    []
  );

  // ✅ handlers estables (misma referencia entre renders)
  const onChangeName = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value),
    []
  );
  const onChangeEmail = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value),
    []
  );


  const handleSubmit = useCallback(async () => {
    // Validar Paso 2 antes de enviar (¡ESTA ES LA CLAVE!)
    if (interests.length === 0 || experienceLevel.length === 0 || birthDate.length === 0 || preferredSchedule.length === 0 || preferredDays.length === 0) {
        toaster.create({
            description: t("home.heroVideo.step2Validation"),
            type: "error",
            duration: 5000,
        });
        return;
    }
    
    setIsSubmitting(true);
    
    const payload = {
        name,
        email,
        interests: interests.join(', '), 
        experience_level: experienceLevel[0],
        birth_date: birthDate,
        desires: `Días preferidos: ${preferredDays.join(', ')}. Franja horaria: ${preferredSchedule[0]}.`, 
        consent: acceptGeneralTerms && acceptPromoTerms,
    };

    try {
      const response = await fetch(`${API_BASE_URL}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      // ... el resto de la lógica de envío y limpieza
    } catch (error) {
      // ... manejo de errores
    } finally {
      setIsSubmitting(false);
      setStep(1); // Volver al Paso 1 al terminar
    }
  }, [API_BASE_URL, name, email, gender, experienceLevel, birthDate, preferredSchedule, acceptGeneralTerms, acceptPromoTerms, t]);

  return (
    <Chakra>
      <Toaster />
      <div id="menu" style={rootStyle}>
        {/* Fondo: foto del hero (panel → Imágenes) o degradado de la marca */}
        <div
          aria-hidden="true"
          style={{
            position: 'absolute', inset: 0, zIndex: 0,
            background: heroImage
              ? `center / cover no-repeat url("${heroImage.replace(/"/g, '%22')}")`
              : 'linear-gradient(135deg, var(--brand-dark) 0%, var(--brand-secondary) 55%, var(--brand-primary) 100%)',
          }}
        />

        {/* Superposición */}
        <div style={overlayStyle} />

        {/* Contenido */}
        <Flex
          position="relative"
          zIndex={2}
          width="100%"
          height="100%"
          justify="center"
          align="center"
          padding="0 24px"
        >
          <VStack gap={5}>
            {/* H1 para buscadores y lectores de pantalla (el titular visible es el logo) */}
            {/* H1: el titular del hero; si no hay, uno oculto con el nombre del estudio */}
            {!(panelTitle || heroTitle) && (
              <h1 style={{ position: 'absolute', width: 1, height: 1, margin: -1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' }}>
                {[site.studio_name, site.tagline].filter(Boolean).join(' · ')}
              </h1>
            )}
            {site.logo_light_url ? (
              <img src={site.logo_light_url} width={'280px'} style={{ maxWidth: '70vw', height: 'auto' }} alt={site.studio_name} />
            ) : (
              <Text as="span" aria-hidden="true" color="white" textAlign="center" fontFamily="var(--font-heading)"
                fontSize={{ base: '5xl', md: '7xl' }} lineHeight="1" letterSpacing="wide"
                textShadow="0 2px 20px rgba(0,0,0,0.3)">
                {site.studio_name}
              </Text>
            )}

            {(panelTitle || heroTitle) && (
              <Text as="h1" fontSize={{ base: '3xl', md: '6xl' }} fontWeight="bold" color="white" textAlign="center"
                fontFamily="var(--font-heading)" letterSpacing="wide"
                textShadow="0 2px 20px rgba(0,0,0,0.3)" lineHeight="1.1">
                {panelTitle || heroTitle}
              </Text>
            )}
            {(panelSubtitle || heroSubtitle) && (
              <Text fontSize={{ base: 'md', md: 'xl' }} color="whiteAlpha.900" textAlign="center"
                fontFamily="var(--font-body)" maxW="600px"
                textShadow="0 1px 10px rgba(0,0,0,0.2)">
                {panelSubtitle || heroSubtitle}
              </Text>
            )}

            {/* UX: UN solo CTA primario — la conversión es reservar. Antes
                "Reserva Ya" era el botón más débil de los tres. */}
            <VStack gap={3} mt={2}>
              <Button
                as="a"
                href="/calendar"
                size="lg"
                px={10}
                py={7}
                // Sobre la foto: relleno primario fijo en todos los estilos (sk-btn sería un
                // contorno oscuro en editorial/neón); radio y mayúsculas del estilo
                bg="linear-gradient(135deg, var(--brand-primary), var(--brand-primary-2))"
                border="1px solid rgba(255,255,255,0.35)"
                color="var(--on-primary)"
                fontSize="lg"
                fontWeight="700"
                borderRadius="var(--radius-button)"
                textTransform="var(--button-text-transform)"
                letterSpacing="var(--button-spacing)"
                boxShadow="0 8px 30px color-mix(in srgb, var(--brand-primary) 45%, transparent)"
                _hover={{ transform: 'translateY(-2px)', boxShadow: '0 12px 40px color-mix(in srgb, var(--brand-primary) 55%, transparent)' }}
                transition="all 0.3s ease"
              >
                {t("home.heroVideo.comingSoon")}
                <Box as="span" ml={2}><SiteIcon name="arrow-right" /></Box>
              </Button>

              <HStack gap={3} flexWrap="wrap" justify="center">
                <Button
                  as="a"
                  href={t("nav.items.classes.href") || "/classes"}
                  variant="outline"
                  size="md"
                  px={6}
                  border="1.5px solid rgba(255,255,255,0.55)"
                  backdropFilter="var(--surface-blur)"
                  color="white"
                  fontSize="sm"
                  fontWeight="600"
                  borderRadius="var(--radius-button)"
                  textTransform="var(--button-text-transform)"
                  letterSpacing="var(--button-spacing)"
                  bg="rgba(255,255,255,0.10)"
                  _hover={{ bg: 'rgba(255,255,255,0.18)', borderColor: 'white' }}
                  transition="all 0.3s ease"
                >
                  {t("home.heroVideo.exploreBtn")}
                </Button>
                <Button
                  as="a"
                  href="/prices"
                  variant="outline"
                  size="md"
                  px={6}
                  border="1.5px solid rgba(255,255,255,0.55)"
                  backdropFilter="var(--surface-blur)"
                  color="white"
                  fontSize="sm"
                  fontWeight="600"
                  borderRadius="var(--radius-button)"
                  textTransform="var(--button-text-transform)"
                  letterSpacing="var(--button-spacing)"
                  bg="rgba(255,255,255,0.10)"
                  _hover={{ bg: 'rgba(255,255,255,0.18)', borderColor: 'white' }}
                  transition="all 0.3s ease"
                >
                  {t("home.heroVideo.pricesBtn")}
                </Button>
              </HStack>
            </VStack>

          </VStack>
        </Flex>
      </div>
    </Chakra>
  );
}
