"use client";
// src/components/OurClasses.tsx

import {
  Box,
  Flex,
  Text,
  Tabs,
  Spinner,
} from '@chakra-ui/react';
import Chakra from './ChakraProvider';
import GlassCarousel from './GlassCaroussel';
import { GiMeditation } from 'react-icons/gi';
import { MdOutlineSportsGymnastics } from 'react-icons/md';
import { GrYoga } from 'react-icons/gr';
import { useState, useEffect } from 'react';
import { useT } from '../i18n/index'; // Aún lo usamos para el fallback y títulos principales
import { useLangStore, withSsrLang } from './stores/lang.store';
import { categoryDescription, categoryIconKind, categoryName, groupClasses, loadClassGroups, type CategoryGroup } from '../utils/classCatalog';

// --- 1. Definición de las Interfaces (sin cambios) ---
export interface ApiClassType {
  id: number;
  category: {
    id: number;
    name: string; // <-- Usaremos esto para el título
    slug: string;
    description: string; // <-- Usaremos esto para la descripción
    name_en?: string;
    description_en?: string;
    translations?: Record<string, { name?: string; description?: string }>;
  };
  instructor: { id: number; name: string; } | null;
  title: string;
  title_en?: string;
  slug: string;
  description: string;
  description_en?: string;
  translations?: Record<string, { title?: string; description?: string } | undefined>;
  duration_minutes: number;
  level: string;
  image: string;
  all_instructors: string[];
}


// --- Componente principal: una pestaña por categoría (las del panel) ---
// `initialClasses`: clases que la página ya cargó en el servidor. Con ellas la
// sección sale en el HTML del servidor (buscadores e IA) y no repite el fetch.
function OurClasses({ initialClasses }: { initialClasses?: ApiClassType[] | null }) {
  const t = useT();
  const lang = useLangStore((s) => s.lang);
  const initialGroups = initialClasses ? groupClasses(initialClasses) : null;
  const [groups, setGroups] = useState<CategoryGroup[]>(initialGroups ?? []);
  const [tab, setTab] = useState<string>(initialGroups?.[0]?.key ?? '');
  const [isLoading, setIsLoading] = useState(!initialGroups);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialGroups) return; // ya vienen del servidor
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      setError(null);
      try {
        const g = await loadClassGroups();
        if (cancelled) return;
        setGroups(g);
        setTab((cur) => cur || g[0]?.key || '');
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : t('common.unknownError'));
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const otherLabel = t('home.classes.tabs.others', undefined, lang === 'en' ? 'Other classes' : 'Otras clases');
  const icon = (g: CategoryGroup) => {
    const k = categoryIconKind(g);
    return k === 'yoga' ? <GrYoga /> : k === 'mind' ? <GiMeditation /> : <MdOutlineSportsGymnastics />;
  };

  const renderContent = () => {
    if (isLoading) {
      return (
        <Flex w="100%" h="400px" justify="center" align="center">
          <Spinner size="xl"  />
        </Flex>
      );
    }
    if (error) {
      return (
        <Flex w="100%" h="400px" justify="center" align="center" direction="column">
          <Text fontSize="2xl" color="red.500">{t('common.errorTitle')}</Text>
          <Text color="var(--brand-secondary)" mt={2}>{error}</Text>
        </Flex>
      );
    }
    if (!groups.length) return null;
    return (
      <Tabs.Root
        w="100%"
        value={tab}
        onValueChange={({ value }) => setTab(value)}
        variant="subtle"
      >
        <Tabs.List display="flex" justifyContent="center" gap={4} flexWrap="wrap">
          {groups.map((g) => (
            <Tabs.Trigger key={g.key} value={g.key}>
              {icon(g)}&nbsp;{categoryName(g, lang, otherLabel)}
            </Tabs.Trigger>
          ))}
        </Tabs.List>

        {groups.map((g) => (
          <Tabs.Content key={g.key} value={g.key} style={{ display: tab === g.key ? 'block' : 'none' }}>
            <GlassCarousel
              title={categoryName(g, lang, otherLabel)}
              description={categoryDescription(g, lang)}
              items={g.items}
            />
          </Tabs.Content>
        ))}
      </Tabs.Root>
    );
  };

  return (
    <Chakra>
      {/* El encabezado principal no cambia */}
      <Flex w="100%" id="classes" justifyContent="center" pt="5rem" pb={2}>
        <Text as="h2" fontSize={{ base: '3xl', md: '5xl' }} color="var(--brand-dark)" fontWeight="bold" fontFamily='var(--font-heading)' letterSpacing="wide">
          {t("home.classes.heading")}
        </Text>
      </Flex>
      <Box textAlign="center" maxW="800px" mx="auto" px={4} pb={10}>
        <Text fontSize="lg" color="color-mix(in srgb, var(--brand-secondary) 88%, var(--brand-dark))" fontFamily='var(--font-body)'>
          {t("home.classes.intro")}
        </Text>
      </Box>

      {/* El contenedor principal llama a renderContent */}
      <Flex align="center" w="100%" flexDir="column" justify="center">
        {renderContent()}
      </Flex>

      <Flex mb="3rem" />
    </Chakra>
  );
}

export default withSsrLang(OurClasses);
