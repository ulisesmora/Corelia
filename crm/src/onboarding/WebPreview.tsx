import { useEffect, useRef, useState } from 'react';
import {
  Alert, AppBar, Box, Button, Dialog, IconButton, Stack, ToggleButton, ToggleButtonGroup, Toolbar, Tooltip, Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import RefreshIcon from '@mui/icons-material/Refresh';
import PhoneIphoneIcon from '@mui/icons-material/PhoneIphone';
import DesktopWindowsIcon from '@mui/icons-material/DesktopWindows';
import { useStudioWebUrl } from '../site/SiteProvider';
import StudioIcon from '../site/StudioIcon';
import { UI } from './copy';

type Device = 'mobile' | 'desktop';
const DESKTOP_WIDTH = 1280;

interface Props {
  /** Página de la web: '/', '/calendar', '/prices'… */
  path?: string;
  /** Cambia el número para recargar (p. ej. después de guardar) */
  reloadKey?: number;
  /** Alto del marco */
  height?: number | string;
}

/**
 * La web pública de verdad dentro de un marco (la web deja que el panel la
 * enmarque: frame-ancestors en web/src/middleware.ts). Enseña lo GUARDADO;
 * para ver al momento lo que aún se está eligiendo está StylePreview.
 */
export default function WebPreview({ path = '/', reloadKey = 0, height = 640 }: Props) {
  const webUrl = useStudioWebUrl();
  const [device, setDevice] = useState<Device>('mobile');
  const [manualReload, setManualReload] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const [boxWidth, setBoxWidth] = useState(400);
  const [boxHeight, setBoxHeight] = useState(640);

  useEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([entry]) => {
      setBoxWidth(entry.contentRect.width);
      setBoxHeight(entry.contentRect.height);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [webUrl]);

  if (!webUrl) return <Alert severity="info">{UI.previewUnknown}</Alert>;

  const src = `${webUrl}${path}`;
  const scale = device === 'desktop' ? Math.min(1, boxWidth / DESKTOP_WIDTH) : 1;

  return (
    <Stack spacing={1.25}>
      <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between" flexWrap="wrap" useFlexGap>
        <ToggleButtonGroup
          size="small" exclusive value={device} onChange={(_, v: Device | null) => v && setDevice(v)}
          aria-label="Tamaño de la vista previa"
        >
          <ToggleButton value="mobile" aria-label={UI.previewMobile} sx={{ minHeight: 44, px: 1.5 }}>
            <PhoneIphoneIcon fontSize="small" sx={{ mr: 0.5 }} />{UI.previewMobile}
          </ToggleButton>
          <ToggleButton value="desktop" aria-label={UI.previewDesktop} sx={{ minHeight: 44, px: 1.5 }}>
            <DesktopWindowsIcon fontSize="small" sx={{ mr: 0.5 }} />{UI.previewDesktop}
          </ToggleButton>
        </ToggleButtonGroup>
        <Stack direction="row" spacing={0.5}>
          <Tooltip title={UI.previewReload}>
            <IconButton onClick={() => setManualReload((n) => n + 1)} aria-label={UI.previewReload} sx={{ width: 44, height: 44 }}>
              <RefreshIcon />
            </IconButton>
          </Tooltip>
          <Tooltip title={UI.previewNewTab}>
            <IconButton component="a" href={src} target="_blank" rel="noopener" aria-label={UI.previewNewTab} sx={{ width: 44, height: 44 }}>
              <OpenInNewIcon />
            </IconButton>
          </Tooltip>
        </Stack>
      </Stack>
      <Box
        ref={box}
        sx={{
          width: '100%', height, overflow: 'hidden', borderRadius: 3, border: '1px solid', borderColor: 'divider',
          backgroundColor: 'background.paper', display: 'flex', justifyContent: 'center',
        }}
      >
        <Box
          component="iframe"
          key={`${reloadKey}-${manualReload}-${device}`}
          src={src}
          title={UI.previewTitle}
          loading="lazy"
          sx={{
            border: 0, flexShrink: 0, backgroundColor: '#fff',
            width: device === 'desktop' ? DESKTOP_WIDTH : Math.min(390, boxWidth),
            height: device === 'desktop' ? boxHeight / scale : '100%',
            transform: device === 'desktop' ? `scale(${scale})` : undefined,
            transformOrigin: 'top center',
          }}
        />
      </Box>
    </Stack>
  );
}

/** Botón «Ver mi web» que abre la vista previa a pantalla completa (móvil). */
export function WebPreviewButton({ path, reloadKey }: { path?: string; reloadKey?: number }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outlined" startIcon={<StudioIcon name="photos" />} onClick={() => setOpen(true)} sx={{ minHeight: 44 }}>
        {UI.previewOpen}
      </Button>
      <Dialog fullScreen open={open} onClose={() => setOpen(false)} aria-labelledby="web-preview-title">
        <AppBar position="sticky" elevation={0} color="inherit" sx={{ borderBottom: '1px solid', borderColor: 'divider' }}>
          <Toolbar sx={{ gap: 1 }}>
            <IconButton edge="start" onClick={() => setOpen(false)} aria-label="Cerrar" sx={{ width: 44, height: 44 }}>
              <CloseIcon />
            </IconButton>
            <Typography id="web-preview-title" sx={{ fontWeight: 600 }}>{UI.previewTitle}</Typography>
          </Toolbar>
        </AppBar>
        <Box sx={{ p: 2 }}>
          <WebPreview path={path} reloadKey={reloadKey} height="calc(100vh - 150px)" />
        </Box>
      </Dialog>
    </>
  );
}
