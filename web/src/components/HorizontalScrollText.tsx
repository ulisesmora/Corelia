"use client";

import { Box, Text, useToken } from '@chakra-ui/react';
import { motion, useScroll, useTransform } from 'framer-motion';
import Chakra from './ChakraProvider';
import { withSsrLang } from './stores/lang.store';
import { useT } from '../i18n/index';
import { useMemo } from 'react';

// `phrases`: nombres de las clases reales (los pasa la página desde el
// servidor). Sin clases, la frase genérica del diccionario.
const HorizontalScrollText = ({ phrases }: { phrases?: string[] | null }) => {
  const { scrollY } = useScroll();
  const t = useT();
  // Mueve el texto hacia la izquierda a medida que se hace scroll hacia abajo
  const x = useTransform(scrollY, [0, 142600], [0, -142600], { clamp: false });

  const phrase = phrases && phrases.length ? phrases.join(' · ') : t("home.scroller.phrase");
  const ariaLabel = t("home.scroller.ariaLabel", undefined, phrase);
  const repeatCount = useMemo(
    () => parseInt(t("home.scroller.repeatCount", undefined, "5"), 10) || 5,
    [t]
  );

  return (
    <Chakra>
      <Box
        height="auto"
        position="relative"
        overflow="hidden"
        marginTop={'2rem'}
        pb="3rem"
      >
        {/* Contenedor sticky para mantener el texto centrado verticalmente */}
        <Box
          position="sticky"
          top="40vh"
          zIndex={10}
        >
          <motion.div style={{ x }}>
            <Box
              width="max-content"
              whiteSpace="nowrap"
              px={8}
            >
               {Array.from({ length: repeatCount }).map((_, i) => (
                <Text
                  key={i}
                  as="span"
                  aria-hidden={i > 0 ? true : undefined}
                  fontSize={{ base: "12vw", md: "12vw" }}
                  fontWeight="extrabold"
                  letterSpacing="tight"
                  lineHeight="1"
                  textTransform="uppercase"
                  color="var(--text-muted)"
                  display="inline-block"
                  mr={8}
                >
                  {phrase}
                </Text>
              ))}
            </Box>
          </motion.div>
        </Box>
      </Box>
    </Chakra>
  );
};

export default withSsrLang(HorizontalScrollText);
