"use client"; // Es un componente de React que maneja estado

import React, { useEffect, useState } from 'react';
import {
  IconButton,
  Badge,
} from '@chakra-ui/react';
import { Icon } from './ui/Icon';
import { useCartStore } from './stores/car.store';
import { CartDrawer } from './CartDrawer'; // El drawer v3 que ya creamos
import { useT } from '../i18n';

/**
 * Este componente es el único que necesitas "inyectar" en tu layout.
 * Se encarga de mostrar el botón flotante Y de controlar el drawer.
 */
export const GlobalCart = () => {
  const t = useT();
  // 1. Controla el estado de apertura/cierre del drawer
  const [isOpen, setIsOpen] = useState(false);
  
  // 2. Trae el contador de items para el badge
  const itemsCount = useCartStore((s) => s.items.length);

  // 3. --- EL LISTENER AUTOMÁTICO ---
  // Este useEffect escucha los cambios en el store de Zustand
  useEffect(() => {
    
    // Nos subscribimos a CUALQUIER cambio en el store
    const unsubscribe = useCartStore.subscribe(
      (state, prevState) => {
        
        // Comparamos el número de items
        // Si la nueva longitud es MAYOR que la anterior, es que se AÑADIÓ un item
        if (state.items.length > prevState.items.length) {
          setIsOpen(true); // ¡Abre el drawer automáticamente!
        }
        
        // Nota: Si quisiéramos, podríamos añadir lógica para
        // state.items.length < prevState.items.length (se eliminó un item)
        // state.items.length === 0 (se vació el carrito)
      }
    );
    
    // Limpiamos la subscripción cuando el componente se desmonta
    return unsubscribe; 
  }, []); // El array vacío [] asegura que la subscripción se haga una sola vez

  return (
    <>
      <IconButton
        aria-label={t('cart.open')}
        onClick={() => setIsOpen(true)} // <-- Trigger manual
        size="lg"
        bg="color-mix(in srgb, var(--brand-secondary) 44%, transparent)"
        color="white"
        _hover={{ bg: "color-mix(in srgb, var(--brand-secondary) 74%, var(--brand-dark))" }}
        position="fixed"
        right={8}
        bottom={{base: 1.5, md: 6}}
        // Móvil: oculto — el carrito vive en el botón "Reservar" de la bottom
        // nav (con badge). Antes este FAB quedaba tapado por el de WhatsApp.
        display={{ base: 'none', md: 'flex' }}
        zIndex="tooltip"
        boxShadow="var(--shadow-float)"
      >
        <Icon name="cart" />
        {itemsCount > 0 && (
          <Badge
            pos="absolute"
            top="-1px"
            right="-1px"
            bg="var(--danger)"
            // Texto del color de la página: claro sobre el rojo oscuro de los
            // estilos claros y oscuro sobre el rojo claro de energy/neon.
            color="var(--page-bg)"
            borderRadius="full"
            px={itemsCount > 9 ? "1.5" : "2"}
            fontSize="0.7em"
          >
            {itemsCount}
          </Badge>
        )}
      </IconButton>

      {/* --- 5. EL DRAWER (Controlado) --- */}
      {/* BUG FIX: el drawer vivía DENTRO del IconButton — los clicks dentro
          del drawer burbujeaban (por el árbol de React, aunque haya Portal)
          hasta el onClick del botón y lo reabrían. Ahora es hermano. */}
      <CartDrawer
        open={isOpen}
        onClose={() => setIsOpen(false)}
      />
    </>
  );
};