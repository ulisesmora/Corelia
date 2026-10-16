// Estilos compartidos por las pantallas de la puesta en marcha.

export const inputSx = {
  flex: '1 1 160px', minWidth: 0, minHeight: 44, border: 0, outline: 'none', background: 'transparent', color: 'var(--studio-ink)',
  fontSize: '1rem', fontWeight: 600, fontFamily: 'var(--studio-font-body)', px: 1, borderRadius: 'var(--studio-radius-sm, 8px)',
  '&:focus-visible': { boxShadow: '0 0 0 2px var(--studio-primary-fill)' },
} as const;

export const srOnly = {
  position: 'absolute', width: '1px', height: '1px', p: 0, m: '-1px', overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0,
} as const;
