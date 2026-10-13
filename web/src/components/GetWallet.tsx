"use client";

import React, { useState, useEffect } from 'react';
import { Text, Spinner, Icon, Tooltip, TooltipContent } from '@chakra-ui/react';
import { FaExclamationTriangle } from 'react-icons/fa'; // Para el ícono de error
import { useT } from '../i18n';
import { API_ROOT } from '../config';

// Tu URL de la API
const API_BASE_URL = `${API_ROOT}/`;

interface UserBalanceProps {
  /**
   * Tamaño de la fuente (ej: 'sm', 'md', 'lg', '2xl').
   * @default 'md'
   */
  fontSize?: string;
  /**
   * Color del texto (ej: 'red.500', 'var(--brand-secondary)', 'white').
   * @default 'gray.800'
   */
  color?: string;
  /**
   * Añade 'créd.' al final.
   * @default true
   */
  showUnit?: boolean;
}

/**
 * Componente aislado que busca y muestra el saldo del usuario
 * al montarse.
 */
export default function UserBalanceDisplay({ 
  fontSize = 'md', 
  color = 'gray.800', 
  showUnit = true 
}: UserBalanceProps) {
  const t = useT();

  // 1. Estados internos del componente
  const [balance, setBalance] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 2. Lógica de fetch al cargar el componente
  useEffect(() => {
    const fetchBalance = async () => {
      setIsLoading(true);
      setError(null);

      // Obtenemos el token de localStorage
      const token = localStorage.getItem('accessToken');

      if (!token) {
        setError("Usuario no autenticado.");
        setIsLoading(false);
        return;
      }

      try {
        const res = await fetch(`${API_BASE_URL}wallet/my-balance/`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!res.ok) {
          throw new Error("No se pudo cargar el balance.");
        }

        const data = await res.json();
        setBalance(Number(data.balance) || 0);
        
      } catch (e: any) {
        setError(e.message || "Error al cargar balance.");
        setBalance(null);
      } finally {
        setIsLoading(false);
      }
    };

    fetchBalance();
  }, []); // El array vacío [] asegura que se ejecuta solo una vez al montar

  // 3. Renderizado condicional

  if (isLoading) {
    return <Spinner color={color} />;
  }

  if (error) {
    return (
    <></>
    );
  }

  // Si no hay error y no está cargando (incluso si el balance es 0)
  const formattedBalance = (balance ?? 0).toFixed(2);
  
  return (
    <Text fontSize={fontSize} color={color} fontWeight="bold">
      {formattedBalance} {showUnit && t('checkout.creditsUnit')}
    </Text>
  );
}