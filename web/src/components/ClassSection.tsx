'use client';

import React, { useEffect, useState } from 'react';
import { Box, Flex, Text, Tabs, Spinner } from '@chakra-ui/react';
import Chakra from './ChakraProvider';
import GlassGrid from './GlassGrid';
import { Icon } from './ui/Icon';
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

  // controlamos la pestaña activa (clave de la categoría)
  const [tab, setTab] = useState<string>('');
  const otherLabel = t('home.classes.tabs.others', undefined, lang === 'en' ? 'Other classes' : 'Otras clases');
  const icon = (g: CategoryGroup) => {
    const k = categoryIconKind(g);
    return <Icon name={k === 'yoga' ? 'yoga' : k === 'mind' ? 'meditation' : 'pilates'} />;
  };
  // Pestaña activa: relleno suave del acento con el acabado del estilo
  const selectedStyle = {
    boxShadow: 'var(--shadow-card)',
    bg: 'var(--accent-soft)',
    color: 'var(--accent-text)',
    backdropFilter: 'var(--surface-blur)',
    WebkitBackdropFilter: 'var(--surface-blur)',
    borderBottom: '1px solid var(--accent-border)',
  };

  return (
    <Chakra>
      {/* Cabecera corta (como el resto de páginas) y las clases primero; la
          guía «¿Qué clase elijo?» va después, para quien la necesite */}
      <header className="w-wrap w-pagehead" id="classes">
        <h1 className="w-h1">{t("home.classes.heading")}</h1>
        <p className="w-lead">{t("home.classes.intro")}</p>
      </header>

      <Flex align="center" w="100%" flexDir="column">
        {/* Tabs controladas: solo montamos el contenido de la pestaña activa */}
        {isLoading && (
          <Flex w="100%" h="300px" justify="center" align="center"><Spinner size="xl" /></Flex>
        )}
        {error && !isLoading && (
          <Text color="var(--danger)" textAlign="center">{error}</Text>
        )}
        {!isLoading && !error && groups.length > 0 && (
        <Tabs.Root
          w="100%"
          value={tab}
          onValueChange={({ value }) => setTab(value)}
          variant="subtle"
          lazyMount  // no monta contenidos no activos
        >
          <Tabs.List display="flex" justifyContent="flex-start" gap={2} flexWrap="wrap" maxW="var(--w-max)" mx="auto" px="var(--w-gutter)">
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

      {/* Guía para quien llega por primera vez: qué clase elegir y cómo reservarla */}
      <FirstClassGuide />

      <Flex mb="3rem" />
    </Chakra>
  );
}
