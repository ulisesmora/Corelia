import { ReactNode, useEffect, useRef, useState } from 'react';
import { Box, Button, Collapse, Paper, Stack, Typography } from '@mui/material';
import StudioIcon from '../../site/StudioIcon';

export const OPEN_GUIDE_EVENT = 'crm-open-guide';

export interface GuideStep {
  /** Frase corta en imperativo: "Busca a la clienta" */
  title: string;
  /** Explicación de una o dos frases, sin palabras técnicas */
  text?: ReactNode;
}

interface Props {
  /** Clave única de la pantalla (recuerda si la guía está oculta) */
  pageKey: string;
  title: string;
  /** Para qué sirve esta pantalla, en una frase */
  subtitle: ReactNode;
  /** Botones principales de la pantalla (a la derecha del título) */
  actions?: ReactNode;
  /** Pasos numerados de "Cómo se hace" */
  steps?: GuideStep[];
  /** Consejos o avisos importantes debajo de los pasos */
  tips?: ReactNode[];
  /** Título de la caja de guía (por defecto "Cómo se usa esta pantalla") */
  guideTitle?: string;
}

const storageKey = (k: string) => `crmGuideHidden_${k}`;

function readHidden(k: string): boolean {
  try {
    return localStorage.getItem(storageKey(k)) === '1';
  } catch {
    return false;
  }
}

/**
 * Cabecera común de cada pantalla del CRM: título grande, para qué sirve y
 * una guía paso a paso que se puede ocultar ("Entendido") y volver a abrir
 * con el botón "Ayuda" de la barra superior (siempre en el mismo sitio).
 */
export default function PageIntro({
  pageKey, title, subtitle, actions, steps, tips, guideTitle,
}: Props) {
  const hasGuide = Boolean(steps?.length || tips?.length);
  const [open, setOpen] = useState(() => hasGuide && !readHidden(pageKey));
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onOpen = () => {
      if (!hasGuide) return;
      setOpen(true);
      setTimeout(() => boxRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
    };
    window.addEventListener(OPEN_GUIDE_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_GUIDE_EVENT, onOpen);
  }, [hasGuide]);

  const hide = () => {
    setOpen(false);
    try { localStorage.setItem(storageKey(pageKey), '1'); } catch { /* sin almacenamiento */ }
  };

  return (
    <Box sx={{ mb: { xs: 2.5, md: 3 } }} ref={boxRef}>
      <Stack
        direction={{ xs: 'column', md: 'row' }}
        spacing={2}
        alignItems={{ xs: 'stretch', md: 'flex-start' }}
        justifyContent="space-between"
      >
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography variant="h1" sx={{ fontSize: { xs: '1.6rem', md: '2.1rem' } }}>
            {title}
          </Typography>
          <Typography sx={{ mt: 0.75, fontSize: { xs: '0.98rem', md: '1.05rem' }, color: 'text.secondary', maxWidth: 720, lineHeight: 1.6 }}>
            {subtitle}
          </Typography>
        </Box>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={1.25}
          sx={{ flexShrink: 0, '& .MuiButton-root': { minHeight: 48 } }}
        >
          {hasGuide && !open && (
            <Button variant="text" startIcon={<StudioIcon name="help" />} onClick={() => setOpen(true)}>
              Ver cómo se usa
            </Button>
          )}
          {actions}
        </Stack>
      </Stack>

      {hasGuide && (
        <Collapse in={open} unmountOnExit>
          <Paper
            elevation={0}
            sx={{
              mt: { xs: 2, md: 2.5 },
              p: { xs: 1.5, md: 3 },
              borderRadius: 4,
              border: '1.5px solid rgb(var(--studio-primary-rgb) / 0.35)',
              backgroundColor: 'rgb(var(--studio-bg-light-rgb) / 0.92)',
            }}
          >
            <Stack direction="row" spacing={1.25} alignItems="center" sx={{ mb: { xs: 1.25, md: 2 } }}>
              <StudioIcon name="tip" sx={{ color: '#B8883C' }} />
              <Typography sx={{ fontWeight: 600, fontSize: { xs: '1rem', md: '1.1rem' }, color: 'var(--studio-dark)' }}>
                {guideTitle || 'Cómo se usa esta pantalla'}
              </Typography>
            </Stack>

            {steps && steps.length > 0 && (
              <Box
                component="ol"
                sx={{
                  listStyle: 'none', p: 0, m: 0,
                  display: 'grid',
                  gap: { xs: 1, md: 1.5 },
                  gridTemplateColumns: { xs: '1fr', md: steps.length > 2 ? 'repeat(auto-fit, minmax(220px, 1fr))' : '1fr 1fr' },
                }}
              >
                {steps.map((s, i) => (
                  <Box
                    component="li"
                    key={i}
                    sx={{
                      display: 'flex', gap: { xs: 1.25, md: 1.5 }, p: { xs: 1.25, md: 1.75 }, borderRadius: 3,
                      backgroundColor: 'rgb(var(--studio-surface-rgb) / 0.85)',
                      border: '1px solid rgb(var(--studio-line-rgb) / 0.25)',
                    }}
                  >
                    <Box
                      aria-hidden
                      sx={{
                        flexShrink: 0, width: { xs: 28, md: 34 }, height: { xs: 28, md: 34 }, borderRadius: '50%',
                        display: 'grid', placeItems: 'center',
                        backgroundColor: 'var(--studio-primary-fill)', color: 'var(--studio-on-primary)', fontWeight: 600, fontSize: { xs: '0.9rem', md: '1rem' },
                      }}
                    >
                      {i + 1}
                    </Box>
                    <Box sx={{ minWidth: 0 }}>
                      <Typography sx={{ fontWeight: 600, color: 'var(--studio-dark)', fontSize: { xs: '0.95rem', md: '1rem' }, lineHeight: 1.4 }}>
                        <Box component="span" sx={{ position: 'absolute', width: '1px', height: '1px', m: '-1px', overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' }}>
                          Paso {i + 1}:{' '}
                        </Box>
                        {s.title}
                      </Typography>
                      {s.text && (
                        <Typography sx={{ mt: 0.4, color: 'var(--studio-text-strong)', fontSize: { xs: '0.9rem', md: '0.95rem' }, lineHeight: 1.5 }}>
                          {s.text}
                        </Typography>
                      )}
                    </Box>
                  </Box>
                ))}
              </Box>
            )}

            {tips && tips.length > 0 && (
              <Stack spacing={0.9} sx={{ mt: steps?.length ? { xs: 1.5, md: 2 } : 0 }}>
                {tips.map((t, i) => (
                  <Stack key={i} direction="row" spacing={1} alignItems="flex-start">
                    <Box aria-hidden sx={{ mt: '9px', width: 7, height: 7, borderRadius: '50%', backgroundColor: 'var(--studio-primary)', flexShrink: 0 }} />
                    <Typography sx={{ color: 'var(--studio-text-strong)', fontSize: { xs: '0.9rem', md: '0.95rem' }, lineHeight: 1.55 }}>{t}</Typography>
                  </Stack>
                ))}
              </Stack>
            )}

            <Stack direction="row" justifyContent="flex-end" sx={{ mt: { xs: 1.5, md: 2 } }}>
              <Button variant="outlined" startIcon={<StudioIcon name="done" />} onClick={hide} sx={{ minHeight: 44, width: { xs: '100%', sm: 'auto' } }}>
                Entendido, ocultar guía
              </Button>
            </Stack>
          </Paper>
        </Collapse>
      )}
    </Box>
  );
}
