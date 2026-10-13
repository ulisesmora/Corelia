"use client";

import type { ReactNode } from 'react';
import { ChakraProvider, defaultSystem } from "@chakra-ui/react";

interface Props {
  children: ReactNode;
}

const Chakra = ({ children }: Props) => {
  return (
    // Sin proveedor de modo oscuro (next-themes): la web es siempre clara y
    // así el HTML del servidor coincide con el del navegador al hidratar.
    <ChakraProvider value={defaultSystem}>
      {children}
    </ChakraProvider>
  );
};

export default Chakra;
