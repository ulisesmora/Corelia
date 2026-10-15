import { ButtonBase } from '@mui/material';
import StudioIcon from '../../site/StudioIcon';
import { useCoach } from './context';

/**
 * Píldora «Cómo funciona» de la cabecera de cada pantalla: lanza su visita
 * guiada de 3 pasos. No se pinta si la pantalla no tiene visita.
 * Uso: <HowItWorks page="calendar" /> (PageIntro ya la pone sola).
 */
export default function HowItWorks({ page }: { page: string }) {
  const { hasPageTour, startPage } = useCoach();
  if (!hasPageTour(page)) return null;
  return (
    <ButtonBase
      onClick={() => startPage(page)}
      aria-label="Cómo funciona esta pantalla"
      data-tour="how"
      sx={{
        display: 'inline-flex', alignItems: 'center', gap: 0.75, minHeight: 36, pl: 1.25, pr: 1.5, borderRadius: 999,
        background: 'var(--studio-surf)', border: '1px solid var(--studio-border-color)', color: 'var(--studio-ink)',
        fontSize: '0.82rem', fontWeight: 600, fontFamily: 'var(--studio-font-body)', flex: 'none',
        '&:hover': { background: 'var(--studio-surf2)' },
        '&.Mui-focusVisible': { outline: '2px solid var(--studio-primary-fill)', outlineOffset: 2 },
        '@media (pointer: coarse)': { minHeight: 44 },
        '@media (max-width: 599.95px)': { width: 44, height: 44, p: 0, justifyContent: 'center', '& .how-t': { display: 'none' } },
      }}
    >
      <StudioIcon name="play" sx={{ fontSize: 18 }} />
      <span className="how-t">Cómo funciona</span>
    </ButtonBase>
  );
}
