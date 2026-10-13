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
        bg="linear-gradient(150deg, color-mix(in srgb, var(--brand-primary) 22%, white) 0%, var(--brand-bg) 60%, color-mix(in srgb, var(--brand-primary) 25%, white) 100%)"
        pt={{ base: 8, md: 14 }}
        pb={{ base: 10, md: 16 }}
        px={{ base: 4, md: 6 }}
      >
        <Box maxW="960px" mx="auto">
          {/* Header */}
          <Center mb={10}>
            <VStack gap={2} textAlign="center">
              <Box
                px={4} py={1.5} borderRadius="full"
                bg="color-mix(in srgb, var(--brand-primary) 12%, transparent)" border="1px solid color-mix(in srgb, var(--brand-primary) 25%, transparent)"
              >
                <Text fontSize="11px" fontWeight={700} color="var(--brand-primary)"
                  fontFamily='var(--font-body)' letterSpacing="0.10em" textTransform="uppercase">
                  {site.studio_name}
                </Text>
              </Box>
              <Heading
                fontFamily='var(--font-heading)'
                fontSize={{ base: '3xl', md: '5xl', lg: '6xl' }}
                color="var(--brand-dark)" letterSpacing="wide" lineHeight="1"
              >
                {t('calendarPage.heading')}
              </Heading>
              <Text fontSize="md" color="color-mix(in srgb, var(--brand-secondary) 88%, var(--brand-dark))" fontFamily='var(--font-body)'
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
