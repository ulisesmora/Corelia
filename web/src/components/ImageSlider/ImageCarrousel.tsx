"use client";
import { Box, IconButton, Image as ChakraImage } from "@chakra-ui/react";
import { motion, AnimatePresence } from "framer-motion";
import React from "react";
import { useT } from "../../i18n";
import { API_V1 } from "../../config";
import { cachedFetch } from "../../utils/fetchCache";
import { useSite } from "../../lib/site";
import { Icon } from "../ui/Icon";

const MotionImage = motion(ChakraImage);

// Fotos del estudio: las de la sección "Galería" del panel (o "Sobre nosotros").
// Sin fotos se muestra un fondo con los colores y el nombre del estudio.
async function loadSliderImages(): Promise<string[]> {
  for (const section of ['gallery', 'about']) {
    try {
      const d = await cachedFetch<any>(`${API_V1}/site-images/?section=${section}&is_active=true&ordering=order`, { ttl: 600 });
      const list = (Array.isArray(d) ? d : d?.results || [])
        .map((x: { image?: string }) => x.image)
        .filter((x: unknown): x is string => typeof x === 'string' && !!x);
      if (list.length) return list;
    } catch { /* sin fotos en esa sección */ }
  }
  return [];
}

// Preload cache básico en memoria
function useImagePreloader() {
  const cacheRef = React.useRef<Map<string, boolean>>(new Map());

  const preload = React.useCallback((src: string) => {
    if (!src || cacheRef.current.get(src)) return;

    // ✅ usa el constructor nativo, no el componente de Chakra
    const img = new (globalThis.Image || window.Image)() as HTMLImageElement;

    // Props opcionales (algunos no están tipados en TS DOM, así que castea o usa setAttribute)
    img.decoding = "async";
    img.loading = "eager";
    // (img as any).fetchPriority = "low";
    img.setAttribute("fetchpriority", "low");

    img.src = src;
    img.onload = () => cacheRef.current.set(src, true);
    img.onerror = () => cacheRef.current.set(src, false);
  }, []);

  const isLoaded = React.useCallback((src: string) => !!cacheRef.current.get(src), []);

  return { preload, isLoaded };
}

export default function ImageSlider({ initialImages }: { initialImages?: string[] | null }) {
  const t = useT();
  const [[current, direction], setCurrent] = React.useState<[number, number]>([
    0, 0,
  ]);
  const [animating, setAnimating] = React.useState(false);
  const { preload } = useImagePreloader();
  const site = useSite();
  // Sin galería: la foto de "Sobre nosotros" del panel, si la hay
  const fallback = site.content.about_image_url ? [site.content.about_image_url] : [];
  // Con fotos del servidor no hay fetch y el HTML inicial ya trae la imagen
  const [images, setImages] = React.useState<string[]>(
    initialImages ? (initialImages.length ? initialImages : fallback) : [],
  );
  React.useEffect(() => {
    if (initialImages) return;
    let cancelled = false;
    loadSliderImages().then((list) => {
      if (cancelled) return;
      setImages(list.length ? list : fallback);
    });
    return () => { cancelled = true; };
  }, []);

  const len = images.length;

  // Pre-carga: actual + vecino anterior/siguiente
  React.useEffect(() => {
    if (!len) return;
    const next = (current + 1 + len) % len;
    const prev = (current - 1 + len) % len;
    preload(images[current]);
    preload(images[next]);
    preload(images[prev]);
  }, [current, len, preload]);

  const paginate = (newDirection: number) => {
    if (animating) return; // bloqueo durante animación
    setAnimating(true);
    setCurrent(([prev]) => {
      const nextIndex = (prev + newDirection + len) % len;
      return [nextIndex, newDirection];
    });
  };

  // Desbloquea al terminar animación de salida/entrada
  const handleAnimationComplete = () => {
    // pequeño buffer para evitar doble disparo
    requestAnimationFrame(() => setAnimating(false));
  };

  const variants = {
    enter: (direction: number) => ({
      x: direction > 0 ? 300 : -300,
      opacity: 0,
      scale: 0.98,
    }),
    center: {
      zIndex: 1,
      x: 0,
      opacity: 1,
      scale: 1,
      transition: {
        duration: 0.6,
        ease: "easeInOut",
      },
    },
    exit: (direction: number) => ({
      zIndex: 0,
      x: direction < 0 ? 300 : -300,
      opacity: 0,
      scale: 0.98,
      transition: {
        duration: 0.45,
        ease: "easeOut",
      },
    }),
  } as const;

  const src = images[current];

  // Sin fotos: degradado de la marca con el nombre del estudio
  if (!len) {
    return (
      <Box
        w="100%"
        h={{ base: "50vh", md: "70vh" }}
        borderRadius="var(--radius-card-lg)"
        overflow="hidden"
        display="flex"
        alignItems="center"
        justifyContent="center"
        bg="linear-gradient(135deg, var(--brand-primary) 0%, var(--brand-secondary) 55%, var(--brand-dark) 100%)"
      >
        <Box as="span" color="white" fontFamily="var(--font-heading)" fontSize={{ base: "4xl", md: "6xl" }}
          textAlign="center" px={6} lineHeight="1.1" opacity={0.92}>
          {site.studio_name}
        </Box>
      </Box>
    );
  }

  return (
    <Box
      w={{ base: "100%", md: "100%" }}
      h={{ base: "50vh", md: "70vh" }}
      position="relative"
      borderRadius="var(--radius-card-lg)"
      overflow="hidden"
      bg="var(--surface-muted)"
      backdropFilter="var(--surface-blur)"
      WebkitBackdropFilter="var(--surface-blur)"
      boxShadow="var(--shadow-card)"
      border="var(--border-width) solid var(--surface-border)"
    >
      <AnimatePresence initial={false} custom={direction} mode="popLayout">
        <MotionImage
          key={src} // se mantiene por src; el cache y preload evitan nuevas descargas
          src={src}
          alt={t('common.slideAlt', { n: current + 1 })}
          custom={direction}
          variants={variants}
          initial="enter"
          animate="center"
          exit="exit"
          objectFit="cover"
          w="100%"
          h="100%"
          filter="sepia(20%)"
          position="absolute"
          draggable={false}
          loading="eager"
          decoding="async"
          fetchPriority="high"
          onAnimationComplete={handleAnimationComplete}
          // evita selección/drag
          style={{ userSelect: "none", pointerEvents: "none" }}
        />
      </AnimatePresence>

      {/* Botones de navegación (solo con más de una foto) */}
      {len > 1 && <>
      <IconButton
        aria-label={t('common.prev')}
        onClick={() => paginate(-1)}
        position="absolute"
        top="50%"
        left="4"
        transform="translateY(-50%)"
        zIndex="2"
        // Relleno primario con su texto legible (contraste garantizado en cualquier estilo)
        bg="var(--accent)"
        _hover={{ bg: "var(--brand-primary-2)" }}
        color="var(--on-primary)"
        rounded="full"
      >
        <Icon name="chevron-left" />
      </IconButton>

      <IconButton
        aria-label={t('common.next')}
        onClick={() => paginate(1)}
        position="absolute"
        top="50%"
        right="4"
        transform="translateY(-50%)"
        zIndex="2"
        // Relleno primario con su texto legible (contraste garantizado en cualquier estilo)
        bg="var(--accent)"
        _hover={{ bg: "var(--brand-primary-2)" }}
        color="var(--on-primary)"
        rounded="full"
      >
        <Icon name="chevron-right" />
      </IconButton>
      </>}
    </Box>
  );
}
