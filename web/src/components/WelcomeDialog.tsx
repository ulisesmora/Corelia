"use client";

import { useState, useEffect } from "react";
import {
  DialogRoot, DialogContent, DialogHeader, DialogTitle,
  DialogBody, DialogFooter, Button, Text, SimpleGrid,
  Box, Flex,
} from "@chakra-ui/react";
import { Icon } from "./ui/Icon";
import { useT } from "../i18n";
import { useLangStore } from "./stores/lang.store";

// Only ES and EN are supported natively
const LANGUAGES = [
  { value: "es", label: "Español", flag: "🇪🇸" },
  { value: "en", label: "English", flag: "🇬🇧" },
];

// Paleta del diálogo: solo tokens del estilo (presets.css)
const C = {
  accent: "var(--accent)",
  brown: "var(--page-text)",
  heading: "var(--heading-color)",
  textMuted: "var(--text-muted)",
  border: "var(--border-neutral)",
  borderStrong: "var(--accent-border)",
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
          className="sk-panel"
        >
          <DialogHeader
            borderBottom={`1px solid ${C.border}`} pb={4}
            bg="var(--surface-muted)" backdropFilter="var(--surface-blur)"
            borderTopRadius="var(--radius-card)"
          >
            <DialogTitle
              fontFamily='var(--font-heading)'
              fontSize="2xl" color={C.heading} letterSpacing="0.04em"
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
                    p={4} borderRadius="var(--radius-card)" textAlign="left"
                    bg={active ? "var(--accent-soft)" : "var(--surface)"}
                    border={`1px solid ${active ? C.borderStrong : C.border}`}
                    boxShadow={active ? "var(--shadow-card)" : "none"}
                    cursor="pointer"
                    transition="all 0.18s ease"
                    _hover={{ bg: "var(--accent-soft)", borderColor: C.borderStrong }}>
                    <Flex align="center" justify="space-between">
                      <Flex align="center" gap={3}>
                        <Text fontSize="2xl" lineHeight="1">{l.flag}</Text>
                        <Text fontFamily='var(--font-body)' fontWeight={700}
                          fontSize="md" color={C.brown}>{l.label}</Text>
                      </Flex>
                      {active && <Icon name="check-circle" size={16} color={C.accent} />}
                    </Flex>
                  </Box>
                );
              })}
            </SimpleGrid>
          </DialogBody>

          <DialogFooter
            borderTop={`1px solid ${C.border}`} pt={4}
            bg="var(--surface-muted)" backdropFilter="var(--surface-blur)"
            borderBottomRadius="var(--radius-card)"
          >
            <Button variant="ghost" onClick={handleClose}
              fontFamily='var(--font-body)' fontWeight={700}
              color={C.textMuted} _hover={{ bg: "var(--accent-soft)" }}>
              {t("langModal.cancelBtn")}
            </Button>
            <Button onClick={handleSave}
              h="40px" px={6}
              className="sk-btn"
              fontFamily='var(--font-body)'>
              {t("langModal.applyBtn")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </DialogRoot>
    </>
  );
};
