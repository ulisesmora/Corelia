import { useState } from 'react';
import { Alert, Box, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { useSite } from '../../site/SiteProvider';
import { formatMoney } from '../../site/money';
import type { StudioSettings } from './api';

interface Props {
  value: StudioSettings;
  onChange: (patch: Partial<StudioSettings>) => void;
}

/**
 * País y moneda del estudio. El país decide cómo se escriben los importes
 * (1.234,50 € en España, $1,234.50 en México) y propone su moneda; la moneda
 * es la que se cobra con tarjeta y la que se ve en la web y en el panel.
 */
export default function LocaleSection({ value, onChange }: Props) {
  const { config } = useSite();
  // Moneda guardada (la de la config pública, que se recarga al guardar): si la cambian, avisamos
  const initialCurrency = (config.currency || 'EUR').toUpperCase();
  const [proposed, setProposed] = useState('');
  const options = value.locale_options || { currencies: [], countries: [] };
  const currency = (value.currency || 'EUR').toUpperCase();
  const country = (value.country || 'ES').toUpperCase();
  const countryInfo = options.countries.find((c) => c.code === country);
  const currencyInfo = options.currencies.find((c) => c.code === currency);
  const currencyLabel = (code: string) => {
    const c = options.currencies.find((x) => x.code === code);
    return c ? `${c.name} (${c.code})` : code;
  };

  const pickCountry = (code: string) => {
    const info = options.countries.find((c) => c.code === code);
    const patch: Partial<StudioSettings> = { country: code };
    if (info?.currency && info.currency !== currency) {
      patch.currency = info.currency;
      setProposed(info.currency);
    } else {
      setProposed('');
    }
    onChange(patch);
  };

  // Pagos ya cobrados en otra moneda: no se convierten nunca
  const otherPayments = (value.payment_currencies || [])
    .filter((p) => p.currency !== currency)
    .reduce((n, p) => n + p.count, 0);
  const changed = currency !== initialCurrency;
  const tzHint = Boolean(countryInfo?.timezone && config.timezone && countryInfo.timezone !== config.timezone);

  return (
    <Stack spacing={2}>
      <Typography variant="h6" sx={{ pt: 1 }}>País y moneda</Typography>
      <Typography color="text.secondary" sx={{ mt: '-8px !important' }}>
        La moneda es en la que cobras y la que ven tus clientas en la web. El país decide cómo se escriben los
        precios (con coma o con punto, el símbolo delante o detrás).
      </Typography>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
        <TextField
          select
          fullWidth
          label="País del estudio"
          value={countryInfo ? country : ''}
          onChange={(e) => pickCountry(e.target.value)}
          SelectProps={{ MenuProps: { slotProps: { paper: { sx: { maxHeight: 360 } } } } }}
        >
          {options.countries.map((c) => (
            <MenuItem key={c.code} value={c.code} sx={{ minHeight: 44 }}>{c.name}</MenuItem>
          ))}
        </TextField>
        <TextField
          select
          fullWidth
          label="Moneda"
          value={currencyInfo ? currency : ''}
          onChange={(e) => { setProposed(''); onChange({ currency: e.target.value }); }}
          helperText={currencyInfo ? `Así se verán tus precios: ${formatMoney(1234.5, currency, { country })}` : undefined}
        >
          {options.currencies.map((c) => (
            <MenuItem key={c.code} value={c.code} sx={{ minHeight: 44 }}>
              {c.name} ({c.code}){c.decimals === 0 ? ' · sin decimales' : ''}
            </MenuItem>
          ))}
        </TextField>
      </Stack>

      {proposed && (
        <Typography variant="body2" color="text.secondary">
          Hemos puesto la moneda de {countryInfo?.name}: <b>{currencyLabel(proposed)}</b>. Puedes elegir otra si cobras en otra moneda.
        </Typography>
      )}
      {countryInfo && !countryInfo.currency && (
        <Typography variant="body2" color="text.secondary">
          La moneda de {countryInfo.name} todavía no está en la lista: elige la moneda en la que vas a cobrar (por ejemplo, dólares).
        </Typography>
      )}

      {changed && (
        <Alert severity="warning">
          <b>Cambiar la moneda no convierte los precios.</b> Si un bono costaba 50 en {currencyLabel(initialCurrency)},
          pasará a costar 50 en {currencyLabel(currency)}. Después de guardar, revisa los precios de tus bonos,
          membresías, clases sueltas y cupones de descuento.
          {otherPayments > 0 && (
            <> Los {otherPayments} pagos que ya cobraste se quedan como estaban, con su moneda.</>
          )}
        </Alert>
      )}
      {!changed && otherPayments > 0 && (
        <Alert severity="info">
          Tienes {otherPayments} {otherPayments === 1 ? 'pago' : 'pagos'} en otra moneda (de antes de cambiarla).
          Se siguen viendo con su moneda en Pagos y no se suman en las ventas de este mes.
        </Alert>
      )}
      {value.has_stripe && changed && (
        <Alert severity="info">
          Comprueba que tu cuenta de Stripe acepta cobros en {currencyLabel(currency)}. Si tu banco recibe el dinero
          en otra moneda, Stripe lo convierte y cobra una pequeña comisión por el cambio.
        </Alert>
      )}
      {tzHint && (
        <Box>
          <Typography variant="body2" color="text.secondary">
            Las horas de las clases se muestran con la zona horaria <b>{config.timezone}</b>. Si tu estudio usa
            otra (en {countryInfo?.name} suele ser <b>{countryInfo?.timezone}</b>), pide a quien instaló tu panel que la
            cambie: es el ajuste <code>STUDIO_TIMEZONE</code> del servidor.
          </Typography>
        </Box>
      )}
    </Stack>
  );
}
