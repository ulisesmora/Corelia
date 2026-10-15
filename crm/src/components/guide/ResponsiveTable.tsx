import { forwardRef, useCallback, useLayoutEffect, useRef } from 'react';
import { TableContainer, type TableContainerProps } from '@mui/material';
import type { SxProps, Theme } from '@mui/material/styles';

/**
 * Sustituye a <TableContainer>. En ordenador es la tabla de siempre; en
 * móvil y tablet (< 900 px) cada fila se convierte en una tarjeta con el
 * nombre de cada dato a la izquierda ("Teléfono", "Saldo"…), así no hay que
 * deslizar de lado para ver columnas escondidas.
 *
 * Los nombres salen solos de la cabecera de la tabla: no hay que tocar las
 * filas. La columna de botones (cabecera vacía o "Acciones") va al pie de la
 * tarjeta, ocupando todo el ancho.
 */

const ACTIONS_LABEL = /^(acci[oó]n(es)?|opciones|)$/i;

function headerLabels(table: HTMLTableElement): string[] {
  const labels: string[] = [];
  const headRow = table.tHead?.rows[table.tHead.rows.length - 1];
  if (!headRow) return labels;
  for (const th of Array.from(headRow.cells)) {
    const text = (th.textContent || '').replace(/\s+/g, ' ').trim();
    for (let i = 0; i < (th.colSpan || 1); i++) labels.push(text);
  }
  return labels;
}

function labelTable(table: HTMLTableElement) {
  const labels = headerLabels(table);
  const columns = labels.length;
  for (const body of Array.from(table.tBodies)) {
    for (const row of Array.from(body.rows)) {
      const cells = Array.from(row.cells);
      // Una sola celda que ocupa toda la fila: aviso "No hay…" o detalle desplegable
      const full = cells.length === 1 && (cells[0].colSpan > 1 || columns <= 1);
      row.toggleAttribute('data-full', full);
      let col = 0;
      for (const cell of cells) {
        const label = full || cell.colSpan > 1 ? '' : labels[col] ?? '';
        col += cell.colSpan || 1;
        // Sin cabecera (p. ej. la lista de cierres pasados) no se adivina nada
        const isActions = columns > 0 && !full && ACTIONS_LABEL.test(label) && cells.length > 1;
        cell.toggleAttribute('data-actions', isActions);
        if (label && !isActions) {
          if (cell.getAttribute('data-label') !== label) cell.setAttribute('data-label', label);
        } else if (cell.hasAttribute('data-label')) {
          cell.removeAttribute('data-label');
        }
      }
    }
  }
}

const mobileCards: SxProps<Theme> = (theme) => ({
  [theme.breakpoints.down('md')]: {
    overflow: 'visible',
    backgroundColor: 'transparent',
    backdropFilter: 'none',
    WebkitBackdropFilter: 'none',
    border: 'none',
    boxShadow: 'none',
    borderRadius: 0,
    '& table, & tbody, & tr, & td': { display: 'block', width: '100%' },
    '& table': { minWidth: '0 !important' },
    '& thead': { display: 'none' },
    '& tbody tr': {
      mb: 1.5,
      px: 1.75,
      py: 1.25,
      borderRadius: 3,
      backgroundColor: 'rgb(var(--studio-surface-rgb) / 0.9)',
      border: '1px solid rgb(var(--studio-line-rgb) / 0.3)',
      boxShadow: '0 2px 10px rgb(var(--studio-shadow-rgb) / 0.05)',
    },
    '& tbody tr[data-full]': {
      p: 0, mb: 1.5, backgroundColor: 'transparent', border: 'none', boxShadow: 'none',
    },
    '& tbody td': {
      border: 'none',
      px: 0,
      py: 0.75,
      display: 'flex',
      // align="right" de MUI invierte la fila: aquí se mantiene el orden normal
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 1.5,
      textAlign: 'right',
      minHeight: 40,
      maxWidth: 'none',
      fontSize: '0.95rem',
      overflowWrap: 'anywhere',
    },
    '& tbody td + td': { borderTop: '1px solid rgb(var(--studio-line-rgb) / 0.15)' },
    // Celdas vacías (p. ej. sin botón en un cierre pasado): sin hueco en la tarjeta
    '& tbody td:empty': { display: 'none' },
    '& tbody td[data-label]::before': {
      content: 'attr(data-label)',
      flexShrink: 0,
      maxWidth: '42%',
      textAlign: 'left',
      fontSize: '0.8rem',
      fontWeight: 600,
      letterSpacing: '0.03em',
      color: 'var(--studio-primary-shade)',
    },
    // Sin nombre de columna (casilla, foto…): contenido a la izquierda
    '& tbody td:not([data-label])': { justifyContent: 'flex-start', textAlign: 'left' },
    // Botones al pie de la tarjeta, grandes y a todo el ancho si caben
    '& tbody td[data-actions]': {
      flexWrap: 'wrap',
      justifyContent: 'flex-start',
      gap: 1,
      pt: 1.25,
      '& .MuiButton-root': { minHeight: 44, flex: '1 1 auto' },
      '& .MuiIconButton-root': { width: 44, height: 44 },
    },
    '& tbody tr[data-full] td': { display: 'block', p: 0, textAlign: 'center', minHeight: 0 },
  },
});

type Props = TableContainerProps & { component?: React.ElementType; variant?: string; elevation?: number };

const ResponsiveTable = forwardRef<HTMLDivElement, Props>(function ResponsiveTable({ sx, ...props }, forwardedRef) {
  const ref = useRef<HTMLDivElement | null>(null);

  const setRef = useCallback((node: HTMLDivElement | null) => {
    ref.current = node;
    if (typeof forwardedRef === 'function') forwardedRef(node);
    else if (forwardedRef) forwardedRef.current = node;
  }, [forwardedRef]);

  // Pone las etiquetas y las actualiza cuando cambian las filas (búsqueda, páginas…)
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const apply = () => node.querySelectorAll('table').forEach((t) => labelTable(t));
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(node, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, []);

  return (
    <TableContainer
      ref={setRef}
      {...props}
      // Los estilos de móvil van al final para que ganen a los de cada pantalla
      sx={[...(Array.isArray(sx) ? sx : sx ? [sx] : []), mobileCards] as SxProps<Theme>}
    />
  );
});

export default ResponsiveTable;
