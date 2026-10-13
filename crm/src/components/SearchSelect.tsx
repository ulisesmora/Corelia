import { Autocomplete, TextField } from '@mui/material';

export interface SearchOption {
  id: number | string;
  label: string;
}

interface Props {
  label: string;
  options: SearchOption[];
  value: number | string | null | '';
  onChange: (id: number | string | null) => void;
  helperText?: string;
  placeholder?: string;
  disabled?: boolean;
  allowEmpty?: boolean; // muestra opción "Ninguno"
  emptyLabel?: string;
  sx?: object;
}

/**
 * Select con buscador (Autocomplete) — sustituye a los <Select> de lista larga.
 * Pensado para usuarios no técnicos: se puede escribir para filtrar, pero
 * también desplegar y elegir con el ratón como un select normal.
 */
export default function SearchSelect({
  label, options, value, onChange, helperText, placeholder,
  disabled, allowEmpty, emptyLabel = '— Ninguno —', sx,
}: Props) {
  const allOptions: SearchOption[] = allowEmpty
    ? [{ id: '', label: emptyLabel }, ...options]
    : options;

  const current = allOptions.find((o) => String(o.id) === String(value ?? '')) || null;

  return (
    <Autocomplete
      options={allOptions}
      value={current}
      onChange={(_, opt) => onChange(opt ? (opt.id === '' ? null : opt.id) : null)}
      getOptionLabel={(o) => o.label}
      isOptionEqualToValue={(a, b) => String(a.id) === String(b.id)}
      disabled={disabled}
      noOptionsText="Sin resultados — prueba con otra palabra"
      openText="Abrir"
      closeText="Cerrar"
      clearText="Borrar"
      sx={sx}
      renderInput={(params) => (
        <TextField
          {...params}
          label={label}
          placeholder={placeholder || 'Escribe para buscar…'}
          helperText={helperText}
        />
      )}
      slotProps={{
        listbox: { sx: { '& .MuiAutocomplete-option': { minHeight: 44, fontSize: '0.95rem' } } },
      }}
    />
  );
}
