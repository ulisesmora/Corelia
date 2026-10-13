'use client';

import React, { useEffect, useState } from 'react';
import { Box, Flex, Text, Tabs, Spinner } from '@chakra-ui/react';
import Chakra from './ChakraProvider';
import GlassGrid from './GlassGrid';
import { GiMeditation } from 'react-icons/gi';
import { MdOutlineSportsGymnastics } from 'react-icons/md';
import { GrYoga } from 'react-icons/gr';
import { useLangStore } from './stores/lang.store';
import { useT } from '../i18n';
import type { ApiClassType } from './OurClasses';
import FirstClassGuide from './FirstClassGuide';
import { categoryDescription, categoryIconKind, categoryName, loadClassGroups, type CategoryGroup } from '../utils/classCatalog';

// Listado de clases (/classes): una pestaña por categoría del panel.
export default function ClassesSection() {
  const lang = useLangStore((s) => s.lang);
  const t = useT();
  const [groups, setGroups] = useState<CategoryGroup[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
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

  const accent = 'var(--brand-secondary)';
  // controlamos la pestaña activa (clave de la categoría)
  const [tab, setTab] = useState<string>('');
  const otherLabel = t('home.classes.tabs.others', undefined, lang === 'en' ? 'Other classes' : 'Otras clases');
  const icon = (g: CategoryGroup) => {
    const k = categoryIconKind(g);
    return k === 'yoga' ? <GrYoga /> : k === 'mind' ? <GiMeditation /> : <MdOutlineSportsGymnastics />;
  };
  const selectedStyle = {
    boxShadow: '0 8px 32px color-mix(in srgb, color-mix(in srgb, var(--brand-primary) 35%, white) 35%, transparent)',
    bg: 'color-mix(in srgb, color-mix(in srgb, var(--brand-primary) 35%, white) 62%, transparent)',
    backdropFilter: 'blur(18px) saturate(180%)',
    borderBottom: '1px solid rgba(255,255,255,0.2)',
  };

  return (
    <Chakra>
      <Flex w="100%" id="classes" justifyContent="center" pt="4rem">
        <Text as="h2" fontSize="5xl" color={accent} fontWeight="bold">
           {t("home.classes.heading")}
        </Text>
      </Flex>

      <Box textAlign="center" maxW="800px" mx="auto" px={4} pb={8}>
        <Text fontSize="lg" color={accent}>
        {t("home.classes.intro")}
        </Text>
      </Box>

      {/* Guía para quien llega por primera vez: qué clase elegir y cómo reservarla */}
      <FirstClassGuide />

      <Flex align="center" w="100%" flexDir="column">
        {/* Tabs controladas: solo montamos el contenido de la pestaña activa */}
        {isLoading && (
          <Flex w="100%" h="300px" justify="center" align="center"><Spinner size="xl" /></Flex>
        )}
        {error && !isLoading && (
          <Text color="red.500" textAlign="center">{error}</Text>
        )}
        {!isLoading && !error && groups.length > 0 && (
        <Tabs.Root
          w="100%"
          value={tab}
          onValueChange={({ value }) => setTab(value)}
          variant="subtle"
          lazyMount  // no monta contenidos no activos
        >
          <Tabs.List display="flex" justifyContent="center" gap={4} flexWrap="wrap">
            {groups.map((g) => (
              <Tabs.Trigger
                key={g.key}
                value={g.key}
                transition="all .25s ease"
                _hover={{ transform: 'translateY(-1px)' }}
                _selected={selectedStyle}
              >
                {icon(g)} {categoryName(g, lang, otherLabel)}
              </Tabs.Trigger>
            ))}
          </Tabs.List>

          {/* Solo renderizamos el panel activo */}
          {groups.filter((g) => g.key === tab).map((g) => (
            <Tabs.Content key={g.key} value={g.key}>
              <GlassGrid
                title={categoryName(g, lang, otherLabel)}
                description={categoryDescription(g, lang)}
                items={g.items}
              />
            </Tabs.Content>
          ))}
        </Tabs.Root>
        )}
      </Flex>

      <Flex mb="3rem" />
    </Chakra>
  );
}
