// Las pantallas completas de siempre (Tipos de clase, Bonos y precios,
// Instructores, Categorías y Salas) se pueden montar dentro de «Clases y
// precios» en modo `embedded`: entonces solo pintan sus ventanas de crear,
// editar y borrar (con sus avisos y validaciones de siempre) y se manejan
// desde fuera con una ref. Así la pantalla nueva no repite lógica de negocio.

export interface EmbedProps {
  /** Solo las ventanas (sin cabecera ni lista) */
  embedded?: boolean;
  /** Algo se ha creado, guardado o borrado */
  onChanged?: () => void;
}

export interface CatalogHandle {
  /** Abre «Añadir…» (en Bonos: 'pack' o 'sub') */
  create: (kind?: 'pack' | 'sub') => void;
  /** Abre la ventana completa de editar (foto, descripción, inglés…) */
  edit: (item: unknown) => void;
  /** Pregunta y borra (con los avisos de siempre) */
  remove: (item: unknown) => void;
  /** Bonos: mostrar u ocultar en la web (con su aviso) */
  toggle?: (item: unknown) => void;
  /** Tipos de clase: añadir desde plantillas */
  templates?: () => void;
}
