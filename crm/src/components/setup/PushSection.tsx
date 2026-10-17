import { useEffect, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Alert, Box, Button, Paper, Stack, Typography } from '@mui/material';
import NotificationsActiveOutlinedIcon from '@mui/icons-material/NotificationsActiveOutlined';
import PrintOutlinedIcon from '@mui/icons-material/PrintOutlined';
import CampaignOutlinedIcon from '@mui/icons-material/CampaignOutlined';
import QRCode from 'qrcode';
import { useSite } from '../../site/SiteProvider';
import type { StudioSettings } from './api';

const AUTOMATIC = [
  ['✅', 'Reserva confirmada', 'En cuanto reserva una clase.'],
  ['⏰', 'Recordatorio', 'Unas 2 horas antes de cada clase.'],
  ['☀️', 'Resumen del día', 'A las 8:00, a quien tiene clase hoy.'],
  ['🔁', 'Cambio de horario', 'Si mueves su clase a otra hora, con la hora nueva.'],
  ['❌', 'Clase cancelada', 'Si cancelas o cierras una clase, con la devolución.'],
  ['📅', 'Semana lista', 'Cuando sus clases fijas se reservan solas.'],
  ['✨', 'Clase nueva', 'Cuando añades una clase nueva al horario.'],
];

/**
 * Avisos al móvil (notificaciones push). Funcionan solos y gratis: aquí se
 * explican, se ve cuántos clientes los tienen y se imprime un cartel con QR
 * para que instalen la app desde el estudio.
 */
export default function PushSection({ value }: { value: StudioSettings }) {
  const { config } = useSite();
  const [qr, setQr] = useState('');
  const web = (value.web_url || '').replace(/\/+$/, '');

  useEffect(() => {
    if (!web) return;
    QRCode.toDataURL(web, { width: 480, margin: 1, color: { dark: config.theme?.dark || '#111111', light: '#FFFFFF' } })
      .then(setQr).catch(() => setQr(''));
  }, [web, config.theme?.dark]);

  const printPoster = () => {
    const w = window.open('', '_blank', 'width=700,height=900');
    if (!w) return;
    const name = value.studio_name || 'Mi Estudio';
    w.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Cartel · ${name}</title>
      <style>
        @page { size: A4; margin: 18mm; }
        body { font-family: "${value.font_body}", system-ui, sans-serif; color: ${value.color_dark}; text-align: center; margin: 0; }
        h1 { font-family: "${value.font_heading}", Georgia, serif; font-size: 40px; margin: 10mm 0 4mm; }
        p { font-size: 20px; line-height: 1.5; margin: 0 0 6mm; }
        .qr { width: 95mm; height: 95mm; margin: 6mm auto; }
        .steps { font-size: 17px; text-align: left; display: inline-block; margin-top: 6mm; }
        .url { font-size: 18px; font-weight: 700; color: ${value.color_primary}; }
      </style></head><body>
      ${value.logo_url ? `<img src="${value.logo_url}" alt="" style="max-height:28mm;max-width:90mm;margin-top:6mm">` : ''}
      <h1>Reserva desde el móvil</h1>
      <p>Escanea con la cámara, instala la app de <b>${name}</b><br>y recibe un aviso antes de cada clase.</p>
      <img class="qr" src="${qr}" alt="">
      <div class="url">${web.replace(/^https?:\/\//, '')}</div>
      <ol class="steps">
        <li>Abre la cámara y apunta al código.</li>
        <li>Entra en tu cuenta o créala en un minuto.</li>
        <li>Pulsa «Instalar la app» y acepta los avisos.</li>
      </ol>
      <script>window.onload = () => setTimeout(() => window.print(), 300);</${'script'}>
      </body></html>`);
    w.document.close();
  };

  return (
    <Stack spacing={3}>
      <Stack direction="row" spacing={1.5} alignItems="flex-start">
        <NotificationsActiveOutlinedIcon color="primary" sx={{ fontSize: 36, mt: 0.5 }} />
        <Box>
          <Typography variant="h6">Tus clientes reciben avisos en el móvil</Typography>
          <Typography color="text.secondary">
            Como los de WhatsApp, pero de tu estudio. <b>Ya están funcionando</b>: no tienes que configurar nada y son
            gratis (no son SMS). Solo hace falta que cada cliente instale la app desde tu web y acepte los avisos;
            la web se lo ofrece y le explica cómo, en iPhone y en Android.
          </Typography>
        </Box>
      </Stack>

      <Alert severity={value.push_clients ? 'success' : 'info'}>
        {value.push_clients
          ? <><b>{value.push_clients}</b> {value.push_clients === 1 ? 'cliente tiene' : 'clientes tienen'} los avisos activados ({value.push_devices} {value.push_devices === 1 ? 'dispositivo' : 'dispositivos'}).</>
          : <>Todavía ningún cliente ha activado los avisos. El cartel de abajo ayuda mucho: ponlo en la recepción.</>}
      </Alert>

      <Box>
        <Typography fontWeight={700} sx={{ mb: 1 }}>Avisos que se envían solos</Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' }, gap: 1.5 }}>
          {AUTOMATIC.map(([icon, title, text]) => (
            <Paper key={title} variant="outlined" sx={{ p: 1.5, borderRadius: 2, display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
              <Typography fontSize="1.4rem" aria-hidden>{icon}</Typography>
              <Box>
                <Typography fontWeight={700}>{title}</Typography>
                <Typography variant="body2" color="text.secondary">{text}</Typography>
              </Box>
            </Paper>
          ))}
        </Box>
      </Box>

      <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 3 }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={3} alignItems="center">
          {qr && <Box component="img" src={qr} alt="Código QR de tu web" sx={{ width: 140, height: 140, borderRadius: 1 }} />}
          <Box sx={{ flex: 1 }}>
            <Typography fontWeight={700}>Cartel para el estudio</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
              Un A4 con tu logo y un código QR: tus clientes lo escanean con la cámara, instalan la app y activan los avisos.
            </Typography>
            <Button variant="contained" startIcon={<PrintOutlinedIcon />} onClick={printPoster} disabled={!qr}>Imprimir cartel</Button>
          </Box>
        </Stack>
      </Paper>

      <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 3 }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ sm: 'center' }}>
          <CampaignOutlinedIcon color="primary" sx={{ fontSize: 32 }} />
          <Box sx={{ flex: 1 }}>
            <Typography fontWeight={700}>¿Quieres avisar de algo a todo el mundo?</Typography>
            <Typography variant="body2" color="text.secondary">
              Un taller, unas vacaciones, una plaza libre… En «Avisos a clientes» escribes el mensaje y eliges si sale
              por email, al móvil o por los dos.
            </Typography>
          </Box>
          <Button component={RouterLink} to="/mails" variant="outlined">Enviar un aviso</Button>
        </Stack>
      </Paper>
    </Stack>
  );
}
