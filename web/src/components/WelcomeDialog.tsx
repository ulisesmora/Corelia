"use client";

import { useState, useEffect } from "react";
import {
  DialogRoot, DialogContent, DialogHeader, DialogTitle,
  DialogBody, DialogFooter, Button, Text, SimpleGrid,
  Box, Flex,
} from "@chakra-ui/react";
import { FaCheckCircle } from "react-icons/fa";
import { useT } from "../i18n";
import { useLangStore } from "./stores/lang.store";

// Only ES and EN are supported natively
const LANGUAGES = [
  { value: "es", label: "Español", flag: "🇪🇸" },
  { value: "en", label: "English", flag: "🇬🇧" },
];

const C = {
  accent: "var(--brand-primary)",
  accentDark: "color-mix(in srgb, var(--brand-primary) 60%, var(--brand-dark))",
  brown: "var(--brand-dark)",
  textMuted: "color-mix(in srgb, var(--brand-secondary) 88%, var(--brand-dark))",
  border: "color-mix(in srgb, var(--brand-primary) 20%, transparent)",
  borderStrong: "color-mix(in srgb, var(--brand-primary) 35%, transparent)",
  btnGrad: "linear-gradient(135deg, var(--brand-primary) 0%, color-mix(in srgb, var(--brand-primary) 60%, var(--brand-dark)) 100%)",
  bg: "linear-gradient(160deg, color-mix(in srgb, var(--brand-primary) 22%, white) 0%, var(--brand-bg) 100%)",
};

export const LanguageModal = () => {
  const t = useT();
  const { lang, setLang } = useLangStore();
  const [selected, setSelected] = useState<string>(lang);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setSelected(lang);
    const hasConfigured = localStorage.getItem("language_setup_complete");
    if (!hasConfigured) {
      // UX: NO interrumpir la primera visita con un modal. Autodetectamos el
      // idioma del navegador y aplicamos; el selector sigue en el menú para
      // cambiarlo cuando se quiera.
      try {
        const browserLang = (navigator.language || "es").toLowerCase();
        setLang(browserLang.startsWith("en") ? "en" : "es");
        localStorage.setItem("language_setup_complete", "true");
      } catch {}
    }
  }, [lang]);

  const applyLanguage = (langCode: string) => {
    setLang(langCode as "es" | "en");
    localStorage.setItem("language_setup_complete", "true");
    setOpen(false);
  };

  const handleSave = () => applyLanguage(selected);

  const handleClose = () => {
    localStorage.setItem("language_setup_complete", "true");
    setOpen(false);
  };

  return (
    <>
      <DialogRoot
        open={open}
        onOpenChange={e => !e.open && handleClose()}
        placement="center"
        size="sm"
      >

        <DialogContent
          maxH="85vh" overflow="hidden" my="auto"
          borderRadius="24px"
          bg={C.bg}
          border={`1px solid ${C.border}`}
          boxShadow="0 24px 72px color-mix(in srgb, var(--brand-dark) 18%, transparent)"
        >
          <DialogHeader
            borderBottom={`1px solid ${C.border}`} pb={4}
            bg="rgba(255,255,255,0.60)" backdropFilter="blur(8px)"
            borderTopRadius="24px"
          >
            <DialogTitle
              fontFamily='var(--font-heading)'
              fontSize="2xl" color={C.brown} letterSpacing="0.04em"
            >
              {t("langModal.title")}
            </DialogTitle>
          </DialogHeader>

          <DialogBody py={6}>
            <Text fontFamily='var(--font-body)' fontSize="11px" fontWeight={700}
              color={C.textMuted} textTransform="uppercase" letterSpacing="0.10em" mb={4}>
              {t("langModal.nativeSection")}
            </Text>
            <SimpleGrid columns={2} gap={3}>
              {LANGUAGES.map(l => {
                const active = selected === l.value;
                return (
                  <Box key={l.value} as="button"
                    onClick={() => setSelected(l.value)}
                    p={4} borderRadius="16px" textAlign="left"
                    bg={active ? "color-mix(in srgb, var(--brand-primary) 12%, transparent)" : "rgba(255,255,255,0.70)"}
                    border={`1px solid ${active ? C.borderStrong : C.border}`}
                    boxShadow={active ? "0 2px 12px color-mix(in srgb, color-mix(in srgb, var(--brand-primary) 60%, var(--brand-dark)) 18%, transparent)" : "none"}
                    cursor="pointer"
                    transition="all 0.18s ease"
                    _hover={{ bg: "color-mix(in srgb, var(--brand-primary) 8%, transparent)", borderColor: C.borderStrong }}>
                    <Flex align="center" justify="space-between">
                      <Flex align="center" gap={3}>
                        <Text fontSize="2xl" lineHeight="1">{l.flag}</Text>
                        <Text fontFamily='var(--font-body)' fontWeight={700}
                          fontSize="md" color={C.brown}>{l.label}</Text>
                      </Flex>
                      {active && <FaCheckCircle size={16} color={C.accentDark} />}
                    </Flex>
                  </Box>
                );
              })}
            </SimpleGrid>
          </DialogBody>

          <DialogFooter
            borderTop={`1px solid ${C.border}`} pt={4}
            bg="rgba(255,255,255,0.60)" backdropFilter="blur(8px)"
            borderBottomRadius="24px"
          >
            <Button variant="ghost" onClick={handleClose}
              fontFamily='var(--font-body)' fontWeight={700}
              color={C.textMuted} _hover={{ bg: "color-mix(in srgb, var(--brand-primary) 8%, transparent)" }}>
              {t("langModal.cancelBtn")}
            </Button>
            <Button onClick={handleSave}
              h="40px" borderRadius="full" px={6}
              bg={C.btnGrad} color="white"
              fontFamily='var(--font-body)' fontWeight={700}
              boxShadow="0 4px 14px color-mix(in srgb, color-mix(in srgb, var(--brand-primary) 60%, var(--brand-dark)) 22%, transparent)"
              _hover={{ opacity: 0.90 }}>
              {t("langModal.applyBtn")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </DialogRoot>
    </>
  );
};
