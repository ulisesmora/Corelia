"use client";

import React, { useCallback } from 'react';
import { Box, Heading, Text, Center, VStack } from '@chakra-ui/react';
import Chakra from './ChakraProvider';
import AgendaCalendar, { type CalendarEvent } from './AgendaCalendar';
import { useT } from '../i18n';
import { useSite } from '../lib/site';

export default function CalendarViewPage() {
  const t = useT();
  const site = useSite();
  // AgendaCalendar owns cart addition — this callback is a no-op notification hook only
  const handleAddToCart = useCallback((_event: CalendarEvent) => {
    // intentionally empty: AgendaCalendar already called addItemToCart
  }, []);

  return (
    <Chakra>
      <Box
        w="full" minH="100vh"
        bg="var(--section-bg)"
        pt={{ base: 8, md: 14 }}
        pb={{ base: 10, md: 16 }}
        px={{ base: 4, md: 6 }}
      >
        <Box maxW="960px" mx="auto">
          {/* Header */}
          <Center mb={10}>
            <VStack gap={2} textAlign="center">
              <Box className="sk-eyebrow" px={4} py={1.5}>
                <Text fontSize="11px" fontWeight={700}>
                  {site.studio_name}
                </Text>
              </Box>
              <Heading
                className="sk-section-title"
                fontFamily='var(--font-heading)'
                fontSize={{ base: '3xl', md: '5xl', lg: '6xl' }}
                color="var(--heading-color)" letterSpacing="wide" lineHeight="1"
              >
                {t('calendarPage.heading')}
              </Heading>
              <Text fontSize="md" color="var(--text-muted)" fontFamily='var(--font-body)'
                maxW="480px" lineHeight="1.7">
                {t('calendarPage.subtitle')}
              </Text>
            </VStack>
          </Center>

          <AgendaCalendar onSelectEvent={handleAddToCart} />
        </Box>
      </Box>
    </Chakra>
  );
}
