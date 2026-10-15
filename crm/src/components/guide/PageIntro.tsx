import { ReactNode } from 'react';
import { Box, Stack, Typography } from '@mui/material';
import HowItWorks from '../../onboarding/coach/HowItWorks';

/** @deprecated Ya no se usa: el «?» del panel abre la visita guiada de la pantalla. */
export const OPEN_GUIDE_EVENT = 'crm-open-guide';

export interface GuideStep {
  title: string;
  text?: ReactNode;
}

interface Props {
  /** Clave de la pantalla: también la de su visita guiada (onboarding/coach/tours.ts) */
  pageKey: string;
  title: string;
  /** Para qué sirve esta pantalla, en UNA línea corta */
  subtitle: ReactNode;
  /** Botones principales de la pantalla (a la derecha del título) */
  actions?: ReactNode;
  /** @deprecated Las cajas «Cómo se usa esta pantalla» se han sustituido por visitas guiadas. Se ignora. */
  steps?: GuideStep[];
  /** @deprecated Se ignora (ver `steps`). */
  tips?: ReactNode[];
  /** @deprecated Se ignora (ver `steps`). */
  guideTitle?: string;
}

/**
 * Cabecera común de cada pantalla del panel: título, una línea de para qué
 * sirve, la píldora «Cómo funciona» (visita guiada de 3 pasos, si la
 * pantalla tiene) y los botones principales.
 *
 * Antes llevaba debajo una caja grande «Cómo se usa esta pantalla»; ahora
 * esa ayuda son coach marks (onboarding/coach). Las piezas que señalan las
 * visitas llevan data-tour: "page-head" (el título) y "page-actions".
 */
export default function PageIntro({ pageKey, title, subtitle, actions }: Props) {
  return (
    <Box sx={{ mb: { xs: 2.5, md: 3 } }}>
      <Stack
        direction={{ xs: 'column', md: 'row' }}
        spacing={2}
        alignItems={{ xs: 'stretch', md: 'flex-start' }}
        justifyContent="space-between"
      >
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Stack direction="row" alignItems="center" spacing={1.5} useFlexGap flexWrap="wrap">
            <Typography variant="h1" data-tour="page-head" sx={{ fontSize: { xs: '1.6rem', md: '2.1rem' }, minWidth: 0, overflowWrap: 'anywhere' }}>
              {title}
            </Typography>
            <HowItWorks page={pageKey} />
          </Stack>
          <Typography sx={{ mt: 0.75, fontSize: { xs: '0.98rem', md: '1.05rem' }, color: 'text.secondary', maxWidth: 720, lineHeight: 1.55 }}>
            {subtitle}
          </Typography>
        </Box>
        {actions && (
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={1.25}
            data-tour="page-actions"
            sx={{ flexShrink: 0, '& .MuiButton-root': { minHeight: 48 } }}
          >
            {actions}
          </Stack>
        )}
      </Stack>
    </Box>
  );
}
