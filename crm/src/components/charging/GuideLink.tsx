import { ButtonBase, type SxProps, type Theme } from '@mui/material';
import StudioIcon from '../../site/StudioIcon';
import { useOpenGuide, type GuideChapter } from './chapters';

/**
 * Enlace corto a un capítulo de «Cómo se cobra» (se abre al lado, sin salir
 * de la pantalla). Solo dentro de MainLayout (ahí está <ChargingGuideHost/>).
 *   <GuideLink chapter="reembolsos">¿Qué se devuelve?</GuideLink>
 * `iconOnly`: solo el «?» (con su etiqueta para lectores de pantalla).
 */
export default function GuideLink({ chapter, children, iconOnly = false, sx }: {
  chapter: GuideChapter;
  children: string;
  iconOnly?: boolean;
  sx?: SxProps<Theme>;
}) {
  const openGuide = useOpenGuide();
  return (
    <ButtonBase
      onClick={(e) => { e.stopPropagation(); openGuide(chapter); }}
      aria-label={iconOnly ? children : undefined}
      title={iconOnly ? children : undefined}
      data-guide-link={chapter}
      sx={[{
        display: 'inline-flex', alignItems: 'center', gap: 0.5, minHeight: 44, minWidth: 44, px: iconOnly ? 0 : 1, borderRadius: 999,
        justifyContent: 'center', color: 'var(--studio-primary-text)', fontWeight: 600, fontSize: '0.88rem',
        fontFamily: 'var(--studio-font-body)', verticalAlign: 'middle', textAlign: 'left',
        '&:hover': { background: 'var(--studio-p-soft)' },
        '&.Mui-focusVisible': { outline: '2px solid var(--studio-primary-text)', outlineOffset: 2 },
      }, ...(Array.isArray(sx) ? sx : [sx])]}
    >
      <StudioIcon name="help" aria-hidden sx={{ fontSize: 20 }} />
      {!iconOnly && <span>{children}</span>}
    </ButtonBase>
  );
}
