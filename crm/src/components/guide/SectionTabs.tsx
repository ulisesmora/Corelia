import { Tabs, useMediaQuery, useTheme, type TabsProps } from '@mui/material';

/**
 * Pestañas de sección. En ordenador son las pestañas de siempre; en móvil
 * (< 600 px) se colocan en varias filas como botones grandes, así se ven
 * todas a la vez y no hay que deslizar de lado para descubrir que hay más.
 */
export default function SectionTabs({ sx, variant, ...props }: TabsProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  if (!isMobile) return <Tabs variant={variant ?? 'scrollable'} allowScrollButtonsMobile sx={sx} {...props} />;

  return (
    <Tabs
      {...props}
      variant="standard"
      sx={[
        ...(Array.isArray(sx) ? sx : sx ? [sx] : []),
        {
          minHeight: 0,
          pb: 1.5,
          '& .MuiTabs-indicator': { display: 'none' },
          '& .MuiTabs-flexContainer': { flexWrap: 'wrap', gap: 1 },
          '& .MuiTab-root': {
            flex: '1 1 calc(50% - 8px)',
            maxWidth: 'none',
            minHeight: 52,
            px: 1.5,
            borderRadius: 3,
            border: '1.5px solid rgb(var(--studio-primary-rgb) / 0.35)',
            backgroundColor: 'rgb(var(--studio-surface-rgb) / 0.7)',
            color: 'var(--studio-text-strong)',
            fontSize: '0.95rem',
            lineHeight: 1.25,
            textTransform: 'none',
          },
          '& .MuiTab-root.Mui-selected': {
            backgroundColor: 'var(--studio-primary-fill)',
            borderColor: 'var(--studio-primary-fill)',
            color: 'var(--studio-on-primary)',
          },
        },
      ]}
    />
  );
}
