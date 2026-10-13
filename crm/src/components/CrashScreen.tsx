import { Box, Button, Paper, Stack, Typography } from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import HomeIcon from '@mui/icons-material/Home';

/**
 * Pantalla que se ve si una página del CRM falla del todo, en lugar de una
 * página en blanco. El error ya queda registrado en Sentry automáticamente.
 */
export default function CrashScreen({ onRetry }: { onRetry: () => void }) {
  return (
    <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', p: 2 }}>
      <Paper elevation={3} sx={{ p: { xs: 3, sm: 5 }, maxWidth: 480, textAlign: 'center' }}>
        <Typography variant="h3" component="h1" gutterBottom>
          Algo no ha ido bien
        </Typography>
        <Typography sx={{ fontSize: '1.05rem', color: 'text.secondary', mb: 3 }}>
          Esta pantalla ha tenido un problema. No se ha perdido nada: ya nos ha llegado el aviso
          para arreglarlo. Prueba a cargarla de nuevo.
        </Typography>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} justifyContent="center">
          <Button
            variant="contained"
            size="large"
            startIcon={<RefreshIcon />}
            onClick={() => {
              onRetry();
              window.location.reload();
            }}
          >
            Volver a cargar
          </Button>
          <Button
            variant="outlined"
            size="large"
            startIcon={<HomeIcon />}
            onClick={() => {
              window.location.href = '/';
            }}
          >
            Ir al inicio
          </Button>
        </Stack>
      </Paper>
    </Box>
  );
}
