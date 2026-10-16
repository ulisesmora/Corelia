import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Box, Button, CircularProgress, Stack, TextField, Typography, useTheme } from '@mui/material';
import type { Map as MapLibreMap, Marker } from 'maplibre-gl';
import { useNotify } from '../guide';
import { saveSettings, type StudioSettings } from './api';

/**
 * «Ajusta el punto exacto»: mapa pequeño con el marcador del estudio.
 *
 * - Al guardar la dirección, el API busca sus coordenadas (OpenStreetMap /
 *   Nominatim, api/utils/geocode.py). Si no la encuentra, aquí se pide
 *   colocar el punto a mano.
 * - Arrastra el marcador o toca el mapa; con teclado: mueve el mapa con las
 *   flechas y pulsa «Poner el punto en el centro».
 * - «Guardar punto» manda solo latitude/longitude (no toca el resto del
 *   formulario). «Volver a buscar por la dirección» manda latitude: null.
 * - MapLibre (con teselas gratuitas de OpenFreeMap, sin clave) se descarga
 *   solo al abrir esta pestaña; sin WebGL2 se ofrecen las coordenadas a mano.
 */
const STYLE_URL = 'https://tiles.openfreemap.org/styles/positron';
/** Centro aproximado por país cuando aún no hay punto [lng, lat, zoom]. */
const COUNTRY_VIEW: Record<string, [number, number, number]> = {
  ES: [-3.7, 40.3, 5], MX: [-102, 23.6, 4.2], AR: [-64, -38, 3.6], CO: [-74.1, 4.6, 4.8], CL: [-71, -35.7, 3.8],
  PE: [-75, -9.2, 4.6], US: [-98.6, 39.8, 3.2], GB: [-2.5, 54, 4.6], FR: [2.4, 46.6, 4.8], PT: [-8.2, 39.6, 5.6],
  IT: [12.5, 42.8, 4.8], DE: [10.4, 51.1, 4.8],
};

type Point = { lat: number; lng: number };

interface Props {
  value: StudioSettings;
  onChange: (patch: Partial<StudioSettings>) => void;
}

const toPoint = (s: StudioSettings): Point | null => {
  const lat = s.latitude == null || s.latitude === '' ? NaN : Number(s.latitude);
  const lng = s.longitude == null || s.longitude === '' ? NaN : Number(s.longitude);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
};

function hasWebGL2(): boolean {
  try {
    return !!document.createElement('canvas').getContext('webgl2');
  } catch {
    return false;
  }
}

export default function LocationPicker({ value, onChange }: Props) {
  const notify = useNotify();
  const pinColor = useTheme().palette.primary.main;
  const saved = toPoint(value);
  const hasAddress = !!value.address?.trim() && !!(value.city?.trim() || value.postal_code?.trim());
  const [pending, setPending] = useState<Point | null>(null);
  const [busy, setBusy] = useState(false);
  const [mapState, setMapState] = useState<'loading' | 'ready' | 'nogl' | 'error'>(() => (hasWebGL2() ? 'loading' : 'nogl'));
  const [manual, setManual] = useState({ lat: saved ? String(saved.lat) : '', lng: saved ? String(saved.lng) : '' });
  const box = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const savedKey = saved ? `${saved.lat},${saved.lng}` : '';

  // Montar el mapa una vez (carga diferida de MapLibre)
  useEffect(() => {
    if (mapState === 'nogl' || !box.current) return;
    let cancelled = false;
    (async () => {
      try {
        const [maplibregl, { default: workerUrl }] = await Promise.all([
          import('maplibre-gl'),
          import('maplibre-gl/dist/maplibre-gl-worker.mjs?url'),
          import('maplibre-gl/dist/maplibre-gl.css'),
        ]);
        if (cancelled || !box.current) return;
        maplibregl.setWorkerUrl(workerUrl);
        const start = toPoint(value);
        const view = COUNTRY_VIEW[(value.country || 'ES').toUpperCase()] || [0, 20, 1.5];
        const map = new maplibregl.Map({
          container: box.current,
          style: STYLE_URL,
          center: start ? [start.lng, start.lat] : [view[0], view[1]],
          zoom: start ? 16.5 : view[2],
          maxZoom: 19,
          dragRotate: false,
          pitchWithRotate: false,
          touchPitch: false,
          cooperativeGestures: true,
          attributionControl: { compact: false },
          locale: {
            'Map.Title': 'Mapa: mueve con las flechas, acerca con + y -',
            'Marker.Title': 'Punto del estudio (arrástralo)',
            'NavigationControl.ZoomIn': 'Acercar',
            'NavigationControl.ZoomOut': 'Alejar',
            'CooperativeGesturesHandler.WindowsHelpText': 'Usa Ctrl + rueda para acercar el mapa',
            'CooperativeGesturesHandler.MacHelpText': 'Usa ⌘ + rueda para acercar el mapa',
            'CooperativeGesturesHandler.MobileHelpText': 'Usa dos dedos para mover el mapa',
          },
        });
        map.touchZoomRotate.disableRotation();
        map.keyboard.disableRotation();
        map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
        const marker = new maplibregl.Marker({ draggable: true, color: pinColor })
          .setLngLat(start ? [start.lng, start.lat] : [view[0], view[1]]);
        if (start) marker.addTo(map);
        marker.on('dragend', () => {
          const p = marker.getLngLat();
          setPending({ lat: p.lat, lng: p.lng });
        });
        map.on('click', (e) => {
          marker.setLngLat(e.lngLat).addTo(map);
          setPending({ lat: e.lngLat.lat, lng: e.lngLat.lng });
        });
        map.once('load', () => { if (!cancelled) setMapState('ready'); });
        mapRef.current = map;
        markerRef.current = marker;
      } catch (e) {
        console.warn('LocationPicker', e);
        if (!cancelled) setMapState('error');
      }
    })();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // Solo al montar: los cambios de punto se aplican en el efecto de abajo
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Punto guardado nuevo (al guardar la dirección o el propio punto) → mover el marcador
  useEffect(() => {
    const map = mapRef.current;
    const marker = markerRef.current;
    if (!map || !marker) return;
    if (saved) {
      marker.setLngLat([saved.lng, saved.lat]).addTo(map);
      map.jumpTo({ center: [saved.lng, saved.lat], zoom: Math.max(map.getZoom(), 16) });
    } else {
      marker.remove();
    }
    setPending(null);
    setManual({ lat: saved ? String(saved.lat) : '', lng: saved ? String(saved.lng) : '' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedKey]);

  const save = useCallback(async (patch: { latitude: string | null; longitude: string | null }, okMsg: string) => {
    setBusy(true);
    try {
      const s = await saveSettings(patch);
      onChange({ latitude: s.latitude, longitude: s.longitude });
      if (s.geocode_status === 'not_found') {
        notify('No hemos encontrado la dirección en el mapa: coloca el punto a mano.', 'warning');
      } else notify(okMsg);
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e), 'error');
    } finally {
      setBusy(false);
    }
  }, [notify, onChange]);

  const savePending = () => pending && save(
    { latitude: pending.lat.toFixed(6), longitude: pending.lng.toFixed(6) },
    'Punto guardado ✓ Tu web ya lo muestra en el mapa.',
  );
  const centerPin = () => {
    const map = mapRef.current;
    const marker = markerRef.current;
    if (!map || !marker) return;
    const c = map.getCenter();
    marker.setLngLat(c).addTo(map);
    setPending({ lat: c.lat, lng: c.lng });
  };
  const undo = () => {
    const map = mapRef.current;
    const marker = markerRef.current;
    if (map && marker) {
      if (saved) marker.setLngLat([saved.lng, saved.lat]).addTo(map);
      else marker.remove();
    }
    setPending(null);
  };

  return (
    <Box>
      <Typography fontWeight={600}>Ajusta el punto exacto</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        Es el punto que verán tus clientas en el mapa de la web («Cómo llegar»). Arrastra el marcador hasta la
        puerta de tu estudio o toca el mapa donde está.
      </Typography>

      {!hasAddress && !saved && (
        <Alert severity="info" sx={{ mb: 1.5 }}>
          Escribe la dirección, la ciudad y el código postal y pulsa «Guardar cambios»: buscaremos el punto solos.
        </Alert>
      )}
      {hasAddress && !saved && (
        <Alert severity="warning" sx={{ mb: 1.5 }}>
          No hemos encontrado tu dirección en el mapa (o aún no la has guardado). Toca el mapa o arrastra el
          marcador hasta tu estudio y pulsa «Guardar punto».
        </Alert>
      )}

      {mapState === 'nogl' ? (
        <Stack spacing={1.5}>
          <Typography variant="body2" color="text.secondary">
            Este navegador no puede mostrar el mapa. Puedes escribir las coordenadas a mano (en Google Maps, pulsa
            con el botón derecho en tu estudio y copia los dos números).
          </Typography>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField label="Latitud" value={manual.lat} onChange={(e) => setManual({ ...manual, lat: e.target.value })} placeholder="40.4243" />
            <TextField label="Longitud" value={manual.lng} onChange={(e) => setManual({ ...manual, lng: e.target.value })} placeholder="-3.7016" />
          </Stack>
          <Box>
            <Button variant="outlined" disabled={busy || !manual.lat || !manual.lng}
              onClick={() => save({ latitude: manual.lat.replace(',', '.'), longitude: manual.lng.replace(',', '.') }, 'Punto guardado ✓')}>
              Guardar punto
            </Button>
          </Box>
        </Stack>
      ) : (
        <>
          <Box sx={{ position: 'relative', height: { xs: 260, sm: 320 }, borderRadius: 2, overflow: 'hidden', border: '1px solid', borderColor: 'divider', bgcolor: 'action.hover' }}>
            {/* Alto y ancho explícitos: el CSS de MapLibre pone .maplibregl-map en position: relative */}
            <Box ref={box} sx={{ width: '100%', height: '100%' }} />
            {mapState === 'loading' && (
              <Box sx={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}><CircularProgress size={28} /></Box>
            )}
            {mapState === 'error' && (
              <Box sx={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', p: 2, textAlign: 'center' }}>
                <Typography color="text.secondary">No se ha podido cargar el mapa. Revisa la conexión y vuelve a abrir esta pestaña.</Typography>
              </Box>
            )}
          </Box>
          <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mt: 1.5 }}>
            <Button variant="contained" onClick={savePending} disabled={!pending || busy}
              startIcon={busy ? <CircularProgress size={16} color="inherit" /> : undefined}>
              Guardar punto
            </Button>
            {pending && <Button onClick={undo} disabled={busy}>Deshacer</Button>}
            <Button onClick={centerPin} disabled={mapState !== 'ready' || busy}>Poner el punto en el centro</Button>
            {hasAddress && (
              <Button onClick={() => save({ latitude: null, longitude: null }, 'Hemos vuelto a buscar el punto por la dirección ✓')} disabled={busy}>
                Volver a buscar por la dirección
              </Button>
            )}
          </Stack>
        </>
      )}
    </Box>
  );
}
