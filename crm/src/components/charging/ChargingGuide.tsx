import { useEffect, useRef, type ComponentType } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Box, Button, ButtonBase, Drawer, IconButton, Typography, useMediaQuery } from '@mui/material';
import StudioIcon from '../../site/StudioIcon';
import { CHAPTERS, GUIDE_PARAM, canonicalChapter, chapterFromLocation, type GuideChapter } from './chapters';
import { InStudioChapter, OnlineChapter, OverviewChapter, RefundsChapter, WaitlistChapter, type ChapterProps } from './ChapterBodies';
import { useChargingFacts } from './facts';

const BODIES: Record<GuideChapter, ComponentType<ChapterProps>> = {
  cobros: OverviewChapter,
  online: OnlineChapter,
  'en-estudio': InStudioChapter,
  'en-mano': InStudioChapter, // nombre antiguo
  reembolsos: RefundsChapter,
  espera: WaitlistChapter,
};

/**
 * «Cómo se cobra» abierto según la dirección (?guia=cobros#capítulo). Va en
 * MainLayout: así cualquier pantalla puede abrirlo con useOpenGuide() o con
 * un enlace (guideHref). Cerrar quita ?guia de la dirección.
 */
export function ChargingGuideHost() {
  const location = useLocation();
  const navigate = useNavigate();
  const chapter = chapterFromLocation(location.search, location.hash);

  const close = () => {
    const params = new URLSearchParams(location.search);
    params.delete(GUIDE_PARAM);
    const q = params.toString();
    navigate({ pathname: location.pathname, search: q ? `?${q}` : '', hash: '' }, { replace: true });
  };
  const open = (c: GuideChapter) => navigate({ pathname: location.pathname, search: location.search, hash: c }, { replace: true });
  const go = (path: string) => navigate(path);

  return <ChargingGuide chapter={chapter} onClose={close} onChapter={open} onGo={go} />;
}

interface Props {
  chapter: GuideChapter | null;
  onClose: () => void;
  onChapter: (c: GuideChapter) => void;
  onGo: (path: string) => void;
}

/** Panel lateral (hoja de abajo en el móvil) con los 5 capítulos. */
export default function ChargingGuide({ chapter, onClose, onChapter, onGo }: Props) {
  const open = chapter !== null;
  const mobile = useMediaQuery('(max-width:599.95px)', { noSsr: true });
  const { facts } = useChargingFacts(open);
  const bodyRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<HTMLHeadingElement>(null);
  const current = canonicalChapter(chapter || 'cobros');
  const idx = CHAPTERS.findIndex((c) => c.key === current);
  const meta = CHAPTERS[idx];
  const Body = BODIES[current];

  // Al cambiar de capítulo: arriba y el foco en su título
  useEffect(() => {
    if (!open) return;
    bodyRef.current?.scrollTo({ top: 0 });
    const id = window.setTimeout(() => headRef.current?.focus({ preventScroll: true }), 60);
    return () => window.clearTimeout(id);
  }, [current, open]);

  const goChapter = (c: GuideChapter) => onChapter(c);
  const onTabsKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const n = CHAPTERS[(idx + (e.key === 'ArrowRight' ? 1 : CHAPTERS.length - 1)) % CHAPTERS.length];
    goChapter(n.key);
    (e.currentTarget.querySelector(`[data-c="${n.key}"]`) as HTMLElement | null)?.focus();
  };

  return (
    <Drawer
      anchor={mobile ? 'bottom' : 'right'}
      open={open}
      onClose={onClose}
      aria-labelledby="cg-title"
      slotProps={{
        paper: {
          sx: {
            width: mobile ? '100%' : 'min(480px, 100vw)', height: mobile ? '92dvh' : '100%', maxWidth: '100vw',
            borderRadius: mobile ? 'var(--studio-radius-xl) var(--studio-radius-xl) 0 0' : 'var(--studio-radius-xl) 0 0 var(--studio-radius-xl)',
            background: 'var(--studio-bg)', color: 'var(--studio-ink)', display: 'flex', flexDirection: 'column', overflow: 'hidden',
          },
        },
      }}
    >
      {/* Cabecera: título y capítulos */}
      <Box sx={{ px: { xs: 2, sm: 2.5 }, pt: { xs: 1.25, sm: 2 }, pb: 1.25, borderBottom: '1px solid var(--studio-border-color)', background: 'var(--studio-surf)' }}>
        {mobile && <Box aria-hidden sx={{ width: 40, height: 5, borderRadius: 9, mx: 'auto', mb: 1, background: 'var(--studio-border-strong)' }} />}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
          <Box aria-hidden sx={{ width: 40, height: 40, flex: 'none', borderRadius: 'var(--studio-radius-md)', display: 'grid', placeItems: 'center', background: 'var(--studio-p-soft)', color: 'var(--studio-primary-text)' }}>
            <StudioIcon name="payments" />
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography id="cg-title" component="h2" sx={{ fontFamily: 'var(--studio-font-heading)', fontWeight: 'var(--studio-heading-weight)', fontSize: '1.25rem', lineHeight: 1.2 }}>
              Cómo se cobra
            </Typography>
            <Typography sx={{ fontSize: '0.8rem', color: 'var(--studio-muted)' }}>{idx + 1} de {CHAPTERS.length} · con tus precios</Typography>
          </Box>
          <IconButton onClick={onClose} aria-label="Cerrar «Cómo se cobra»" sx={{ width: 44, height: 44, color: 'var(--studio-ink)' }}>
            <StudioIcon name="close" />
          </IconButton>
        </Box>
        <Box role="tablist" aria-label="Capítulos" onKeyDown={onTabsKey}
          sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(3, minmax(0, 1fr))', sm: 'repeat(5, minmax(0, 1fr))' }, gap: 0.75, mt: 1.5 }}>
          {CHAPTERS.map((c) => {
            const on = c.key === current;
            return (
              <ButtonBase key={c.key} data-c={c.key} role="tab" aria-selected={on} aria-controls="cg-panel" tabIndex={on ? 0 : -1}
                onClick={() => goChapter(c.key)}
                sx={{
                  display: 'flex', flexDirection: 'column', gap: 0.25, minHeight: 44, px: 1, py: 0.75,
                  borderRadius: 'var(--studio-radius-md)', fontSize: '0.8rem', fontWeight: 700, fontFamily: 'var(--studio-font-body)', lineHeight: 1.15,
                  color: on ? 'var(--studio-on-primary)' : 'var(--studio-ink)', background: on ? 'var(--studio-primary-fill)' : 'var(--studio-surf2)',
                  '&:hover': { background: on ? 'var(--studio-primary-fill)' : 'var(--studio-p-soft)' },
                  '&.Mui-focusVisible': { outline: '2px solid var(--studio-primary-text)', outlineOffset: 2 },
                }}>
                <StudioIcon name={c.icon} aria-hidden sx={{ fontSize: 18 }} />
                <span>{c.short}</span>
              </ButtonBase>
            );
          })}
        </Box>
      </Box>

      {/* Capítulo */}
      <Box ref={bodyRef} id="cg-panel" role="tabpanel" aria-labelledby="cg-chapter" sx={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', px: { xs: 2, sm: 2.5 }, py: 2.25 }}>
        <Typography ref={headRef} id="cg-chapter" tabIndex={-1} component="h3" data-chapter={current}
          sx={{ fontFamily: 'var(--studio-font-heading)', fontWeight: 'var(--studio-heading-weight)', fontSize: '1.4rem', lineHeight: 1.2, mb: 0.75, outline: 'none' }}>
          {meta.title}
        </Typography>
        <Body facts={facts} go={onGo} open={goChapter} />
      </Box>

      {/* Anterior / siguiente */}
      <Box sx={{
        display: 'flex', gap: 1, px: { xs: 2, sm: 2.5 }, pt: 1.25, pb: 'calc(10px + env(safe-area-inset-bottom))',
        borderTop: '1px solid var(--studio-border-color)', background: 'var(--studio-surf)',
      }}>
        {idx > 0 && (
          <Button onClick={() => goChapter(CHAPTERS[idx - 1].key)} startIcon={<StudioIcon name="back" />} sx={{ minHeight: 44, color: 'var(--studio-ink)' }}>
            Anterior
          </Button>
        )}
        {idx < CHAPTERS.length - 1 ? (
          <Button variant="contained" onClick={() => goChapter(CHAPTERS[idx + 1].key)} endIcon={<StudioIcon name="next" />} sx={{ ml: 'auto', minHeight: 44 }}>
            {CHAPTERS[idx + 1].short}
          </Button>
        ) : (
          <Button variant="contained" onClick={onClose} sx={{ ml: 'auto', minHeight: 44 }}>Entendido</Button>
        )}
      </Box>
    </Drawer>
  );
}
