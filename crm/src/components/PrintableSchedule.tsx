import { useState } from 'react';
import { Box, Button, Typography, Alert, Paper, Stack, TextField } from '@mui/material';
import PrintIcon from '@mui/icons-material/Print';
import { EmptyState, HelpTip } from './guide';
import { useSite, useStudioWebUrl } from '../site/SiteProvider';
import StudioLogo from '../site/StudioLogo';
import {
  WEEKDAYS, madridToday, firstOfNextMonth, fmtLong, fmtDayMonth, type ScheduleOption,
} from './Blackouts';

const C = {
  brand: 'var(--studio-primary)',
  brandDark: 'var(--studio-primary-dark)',
  brown: 'var(--studio-dark)',
  muted: 'var(--studio-text-muted)',
  line: 'rgb(var(--studio-primary-rgb) / 0.35)',
  soft: 'var(--studio-bg)',
};

interface PrintSchedule extends ScheduleOption {
  end_time: string;
  is_active: boolean;
  end_date: string | null;
  override_instructor: { id: number; name: string } | null;
  class_type: { id: number; title: string; instructor?: { name: string } | null };
}

interface Props {
  schedules: PrintSchedule[];
}

/**
 * Horario semanal del estudio, listo para imprimir y colgar.
 * Botón "Imprimir" → diálogo del navegador; el CSS de impresión oculta el
 * resto del CRM y deja solo la hoja, con los colores de marca.
 */
export default function PrintableSchedule({ schedules }: Props) {
  const { config } = useSite();
  const webUrl = useStudioWebUrl();
  // Pie de la hoja: web y WhatsApp/teléfono del estudio (lo que tenga puesto)
  const phone = config.contact.whatsapp || config.contact.phone;
  const contactLine = [
    webUrl && `Reservas: ${webUrl.replace(/^https?:\/\//, '')}`,
    phone && `${config.contact.whatsapp ? 'WhatsApp' : 'Teléfono'} ${phone}`,
  ].filter(Boolean).join(' · ');
  const today = madridToday();
  const nextMonth = firstOfNextMonth();
  // ¿Para qué fecha es el horario? Si hay cambios programados (una clase que
  // termina y otra que empieza), sin esto salían las dos a la vez en la hoja.
  const [refDate, setRefDate] = useState(today);
  const ref = refDate && refDate >= today ? refDate : today;

  // Solo clases semanales activas y vigentes en esa fecha
  const active = schedules.filter(
    (s) =>
      s.is_recurrent &&
      s.is_active &&
      s.weekday != null &&
      (!s.end_date || s.end_date >= ref) &&
      (!s.start_date || s.start_date <= ref)
  );

  // Cambios programados en el futuro (para avisar de que elija la fecha)
  const hasScheduledChanges = schedules.some(
    (s) => s.is_recurrent && s.is_active && ((s.end_date && s.end_date >= today) || (s.start_date && s.start_date > today))
  );
  const startingLater = schedules.filter(
    (s) => s.is_recurrent && s.is_active && s.start_date && s.start_date > ref
  ).length;

  const byDay: PrintSchedule[][] = WEEKDAYS.map((_, day) =>
    active
      .filter((s) => s.weekday === day)
      .sort((a, b) => a.start_time.localeCompare(b.start_time))
  );

  const instructorOf = (s: PrintSchedule) =>
    s.override_instructor?.name || s.class_type.instructor?.name || '';

  const updated = new Date().toLocaleDateString('es-ES', {
    day: 'numeric', month: 'long', year: 'numeric',
  });

  return (
    <Box mt={3}>
      {/* Estilos de impresión: solo la hoja, en color, apaisada */}
      <style>{`
        @media print {
          @page { size: A4 landscape; margin: 10mm; }
          body * { visibility: hidden; }
          #hoja-horario, #hoja-horario * { visibility: visible; }
          #hoja-horario {
            position: absolute; left: 0; top: 0; width: 100%;
            -webkit-print-color-adjust: exact; print-color-adjust: exact;
          }
        }
      `}</style>

      <Paper className="no-print" elevation={0}
        sx={{ p: { xs: 2, md: 2.5 }, mb: 2.5, borderRadius: 4, border: '1.5px solid rgb(var(--studio-line-rgb) / 0.3)' }}>
        <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" gap={2}>
          <Box sx={{ maxWidth: 640 }}>
            <Typography variant="h6">Horario semanal para imprimir</Typography>
            <Typography sx={{ color: 'text.secondary', fontSize: '0.98rem', mb: 1 }}>
              Una hoja con todas tus clases semanales, lista para colgar en el estudio o enviar por WhatsApp.
            </Typography>
            <Box component="ol" sx={{ m: 0, pl: 2.5, fontSize: '0.98rem', lineHeight: 1.7, color: 'var(--studio-dark)' }}>
              <li>Mira la hoja de abajo y comprueba que las clases están bien.</li>
              <li>Pulsa el botón <b>«Imprimir horario»</b>.</li>
              <li>
                En la ventana que se abre, elige tu <b>impresora</b>. Si prefieres un archivo para enviarlo, elige
                <b> «Guardar como PDF»</b> en la lista de impresoras.
              </li>
              <li>Pulsa «Imprimir» (o «Guardar»). La hoja sale en horizontal.</li>
            </Box>
          </Box>
          <Stack gap={1.5} sx={{ minWidth: { md: 260 } }}>
            <Button
              variant="contained"
              size="large"
              startIcon={<PrintIcon />}
              onClick={() => window.print()}
              disabled={active.length === 0}
              sx={{ minHeight: 52, px: 4 }}
            >
              Imprimir horario
            </Button>
            <Box>
              <Stack direction="row" alignItems="center">
                <TextField
                  label="Horario válido desde"
                  type="date"
                  value={refDate}
                  onChange={(e) => setRefDate(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                  inputProps={{ min: today }}
                  size="small"
                  fullWidth
                />
                <HelpTip title="¿Para qué sirve esta fecha?">
                  Si has programado cambios (una clase que cambia de hora o que deja de darse), elige desde qué día es
                  el horario y la hoja saldrá con las clases de ese día en adelante. Normalmente, hoy.
                </HelpTip>
              </Stack>
              <Stack direction="row" gap={1} sx={{ mt: 1 }}>
                <Button size="small" variant={ref === today ? 'contained' : 'outlined'} onClick={() => setRefDate(today)} sx={{ minHeight: 40 }}>
                  Hoy
                </Button>
                <Button size="small" variant={ref === nextMonth ? 'contained' : 'outlined'} onClick={() => setRefDate(nextMonth)} sx={{ minHeight: 40 }}>
                  Desde el {fmtDayMonth(nextMonth)}
                </Button>
              </Stack>
            </Box>
          </Stack>
        </Stack>
        {hasScheduledChanges && (
          <Alert severity="info" sx={{ mt: 2 }}>
            Tienes cambios programados en el horario. La hoja muestra las clases tal y como estarán el{' '}
            <b>{fmtLong(ref)}</b>.
            {startingLater > 0 && ` Hay ${startingLater} ${startingLater === 1 ? 'clase que empieza' : 'clases que empiezan'} más adelante y no ${startingLater === 1 ? 'sale' : 'salen'}: cambia la fecha si quieres incluirlas.`}
          </Alert>
        )}
        <Typography sx={{ mt: 1.5, fontSize: '0.92rem', color: 'text.secondary' }}>
          Solo salen las clases semanales que se están ofreciendo. No salen las pausadas, las que ya terminaron ni
          las clases de un solo día.
        </Typography>
      </Paper>

      {active.length === 0 && (
        <Paper className="no-print" variant="outlined" sx={{ mb: 2, borderRadius: 3 }}>
          <EmptyState
            compact
            icon={<PrintIcon />}
            title="No hay clases semanales que imprimir"
            text="Añade tus clases en la pestaña «Mis clases semanales» y aparecerán aquí."
          />
        </Paper>
      )}

      {/* ── La hoja ── */}
      <Box
        id="hoja-horario"
        sx={{
          background: '#fff',
          borderRadius: '14px',
          border: `1px solid ${C.line}`,
          p: { xs: 2, md: 4 },
          boxShadow: '0 4px 20px rgb(var(--studio-dark-rgb) / 0.08)',
        }}
      >
        {/* Cabecera de marca */}
        <Box textAlign="center" mb={3}>
          <StudioLogo
            height={72}
            fontSize={{ xs: '1.8rem', md: '2.4rem' }}
            sx={{ mx: 'auto', mb: 0.5, letterSpacing: '0.04em', lineHeight: 1.1 }}
          />
          {config.tagline && (
            <Typography
              sx={{
                fontFamily: 'var(--studio-font-body)',
                fontSize: '0.75rem',
                color: C.brand,
                letterSpacing: '0.28em',
                textTransform: 'uppercase',
                mb: 0.5,
              }}
            >
              {config.tagline}
            </Typography>
          )}
          <Typography
            sx={{
              fontFamily: 'var(--studio-font-heading)',
              fontSize: { xs: '1.05rem', md: '1.3rem' },
              color: C.brandDark,
            }}
          >
            Horario semanal de clases
          </Typography>
          {ref > today && (
            <Typography sx={{ fontFamily: 'var(--studio-font-body)', fontSize: '0.85rem', color: C.muted, mt: 0.5 }}>
              A partir del {fmtDayMonth(ref)}
            </Typography>
          )}
        </Box>

        {/* Rejilla semanal */}
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(4, 1fr)', md: 'repeat(7, 1fr)' },
            gap: 1.2,
            '@media print': { gridTemplateColumns: 'repeat(7, 1fr)' },
          }}
        >
          {WEEKDAYS.map((dayName, day) => (
            <Box key={dayName}>
              <Box
                sx={{
                  background: `linear-gradient(135deg, ${C.brand}, ${C.brandDark})`,
                  color: '#fff',
                  textAlign: 'center',
                  borderRadius: '10px 10px 0 0',
                  py: 0.8,
                  fontFamily: 'var(--studio-font-body)',
                  fontWeight: 600,
                  fontSize: '0.85rem',
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                }}
              >
                {dayName}
              </Box>
              <Box
                sx={{
                  border: `1px solid ${C.line}`,
                  borderTop: 'none',
                  borderRadius: '0 0 10px 10px',
                  minHeight: 120,
                  p: 0.8,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 0.8,
                  background: C.soft,
                }}
              >
                {byDay[day].length === 0 && (
                  <Typography
                    sx={{ fontSize: '0.72rem', color: C.muted, textAlign: 'center', mt: 2,
                          fontFamily: 'var(--studio-font-body)' }}
                  >
                    —
                  </Typography>
                )}
                {byDay[day].map((s) => (
                  <Box
                    key={s.id}
                    sx={{
                      background: '#fff',
                      border: `1px solid ${C.line}`,
                      borderLeft: `4px solid ${C.brand}`,
                      borderRadius: '8px',
                      px: 1,
                      py: 0.7,
                    }}
                  >
                    <Typography sx={{ fontFamily: 'var(--studio-font-body)', fontWeight: 700,
                                      fontSize: '0.8rem', color: C.brandDark, lineHeight: 1.2 }}>
                      {s.start_time.substring(0, 5)}–{s.end_time.substring(0, 5)}
                    </Typography>
                    <Typography sx={{ fontFamily: 'var(--studio-font-body)', fontWeight: 600,
                                      fontSize: '0.78rem', color: C.brown, lineHeight: 1.25 }}>
                      {s.class_type.title}
                    </Typography>
                    {instructorOf(s) && (
                      <Typography sx={{ fontFamily: 'var(--studio-font-body)', fontSize: '0.68rem',
                                        color: C.muted, lineHeight: 1.2 }}>
                        {instructorOf(s)}
                      </Typography>
                    )}
                    <Typography sx={{ fontFamily: 'var(--studio-font-body)', fontSize: '0.66rem',
                                      color: C.muted }}>
                      {s.room.name}
                    </Typography>
                  </Box>
                ))}
              </Box>
            </Box>
          ))}
        </Box>

        {/* Pie */}
        <Box display="flex" justifyContent="space-between" mt={2.5} flexWrap="wrap" gap={1}>
          <Typography sx={{ fontFamily: 'var(--studio-font-body)', fontSize: '0.7rem', color: C.muted }}>
            {contactLine}
          </Typography>
          <Typography sx={{ fontFamily: 'var(--studio-font-body)', fontSize: '0.7rem', color: C.muted }}>
            Actualizado el {updated}
          </Typography>
        </Box>
      </Box>
    </Box>
  );
}
