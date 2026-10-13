"use client"

import React, { useState, useCallback, useEffect } from 'react';
import {
  Button,
  Dialog,
  Portal,
  CloseButton,
  Flex,
  Box,
  Heading,
  Text,
  Spinner,
  VStack,
  Center,
} from '@chakra-ui/react';
import { PhoneInput } from 'react-international-phone';
import 'react-international-phone/style.css'; 
import { Toaster, toaster } from './ui/toaster';
import Chakra from './ChakraProvider';
import { useLangStore } from './stores/lang.store';
import { API_V1 } from '../config';

const TXT = {
  es: {
    incompleteTitle: 'Número incompleto',
    incompleteDesc: 'Introduce al menos 7 dígitos.',
    sessionExpired: 'Sesión expirada',
    saveError: 'Error al guardar el teléfono',
    thanks: '¡Gracias!',
    saved: 'Teléfono guardado correctamente.',
    saveErrorShort: 'Error al guardar',
    title: 'Mantente informado 📱',
    body: 'Añade tu número de teléfono para recibir notificaciones importantes sobre tus clases, cambios de horario o confirmaciones de reservas.',
    label: 'Tu número móvil',
    later: 'Quizás luego',
    save: 'Guardar Teléfono',
  },
  en: {
    incompleteTitle: 'Incomplete number',
    incompleteDesc: 'Enter at least 7 digits.',
    sessionExpired: 'Session expired',
    saveError: 'Could not save your phone number',
    thanks: 'Thank you!',
    saved: 'Phone number saved.',
    saveErrorShort: 'Could not save',
    title: 'Stay in the loop 📱',
    body: 'Add your phone number to get important updates about your classes, timetable changes and booking confirmations.',
    label: 'Your mobile number',
    later: 'Maybe later',
    save: 'Save phone number',
  },
};

// FIX 403: /users/{id}/ exige admin — el endpoint propio /me permite al
// usuario leer y actualizar SU teléfono con su propio token.
const ME_URL = `${API_V1}/me/`;
const USER_ID_KEY = 'iduser';
const ACCESS_TOKEN_KEY = 'accessToken';

export default function PhoneUpdateDialog() {
  const L = TXT[useLangStore((st) => st.lang)] ?? TXT.es;

  const [phone, setPhone] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [isFetching, setIsFetching] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // Helper: cuenta solo dígitos, ignora el código de país visible (+34 etc.)
  // react-international-phone retorna mínimo "+34" aunque esté vacío.
  const digitCount = (p: string) => p.replace(/\D/g, '').length;

  // --- Lógica GET ---
  useEffect(() => {
    const userIdFromStorage = localStorage.getItem(USER_ID_KEY);
    const token = localStorage.getItem(ACCESS_TOKEN_KEY);
    setCurrentUserId(userIdFromStorage);

    // Con /me solo hace falta el token (funciona aunque iduser esté ausente,
    // p. ej. logins de Google antiguos).
    if (!token) {
        setIsFetching(false);
        return;
    }

    const fetchUserPhone = async (userId: string) => {
        setIsFetching(true);
        try {
            const response = await fetch(ME_URL, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
            });

            if (!response.ok) throw new Error(`Error al obtener usuario (${response.status})`);

            const userData = await response.json();
            const currentPhone = userData.phone || '';

            setPhone(currentPhone);

            // Si no tiene teléfono válido (cuenta dígitos, no longitud bruta),
            // abrir el modal para que lo añada.
            if (digitCount(currentPhone) < 7) {
                setIsOpen(true);
            } else {
                setIsOpen(false);
            }

        } catch (error) {
            console.error('Error GET usuario:', error);
            setIsOpen(false);
        } finally {
            setIsFetching(false);
        }
    };

    fetchUserPhone(userIdFromStorage || '');
  }, []);

  // --- Lógica PATCH (Guardar) ---
  const handleUpdatePhone = useCallback(async () => {

    // Validación REAL: contar dígitos. Mínimo 7 (estándar internacional).
    if (digitCount(phone) < 7) {
        toaster.create({
          title: L.incompleteTitle,
          description: L.incompleteDesc,
          type: 'warning',
          duration: 3000,
        });
        return;
    }

    const token = localStorage.getItem(ACCESS_TOKEN_KEY);
    if (!token) {
        toaster.create({ title: L.sessionExpired, type: 'error', duration: 3000 });
        return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(ME_URL, {
        method: 'PATCH',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ phone: phone }),
      });

      if (!response.ok) {
        // Intenta leer el error del backend para mostrarlo útil
        let msg = L.saveError;
        try {
          const d = await response.json();
          msg = d.phone?.[0] || d.detail || d.error || msg;
        } catch {}
        throw new Error(msg);
      }

      toaster.create({
          title: L.thanks,
          description: L.saved,
          type: 'success',
          duration: 3000,
      });

      setIsOpen(false);

    } catch (error: any) {
      toaster.create({
        title: error.message || L.saveErrorShort,
        type: 'error',
        duration: 4000,
      });
    } finally {
      setIsLoading(false);
    }
  }, [phone, currentUserId, L]);

  // Función para cerrar simplemente
  const handleClose = () => setIsOpen(false);
  
  if (isFetching) {
      // Opcional: Puedes quitar este spinner si prefieres que cargue en silencio
      // return null; 
      return (
        <Chakra>
          <Center h="100vh" w="100vw" position="fixed" top={0} left={0} bg="rgba(0,0,0,0.1)" zIndex={1000} pointerEvents="none">
              {/* Spinner invisible o muy sutil si prefieres */}
          </Center>
        </Chakra>
      );
  }

  if (!isOpen) return null;
  
  return (
    <Chakra>
        <Toaster />
        <Dialog.Root 
            open={isOpen} 
            // ✅ IMPORTANTE: Esto permite cerrar al hacer click fuera o pulsar ESC
            onOpenChange={(details) => setIsOpen(details.open)} 
            size="md"
            motionPreset="slide-in-bottom"
        >
        <Portal>
            <Dialog.Backdrop />
            <Dialog.Positioner>
            <Dialog.Content>
                
                {/* Botón de cierre (X) arriba a la derecha */}
                <Dialog.CloseTrigger asChild>
                    <CloseButton 
                        position="absolute" 
                        top="2" 
                        right="2" 
                        size="sm" 
                        onClick={handleClose}
                    />
                </Dialog.CloseTrigger>

                <Dialog.Header>
                    <Heading size="md" fontWeight="bold">
                        {L.title}
                    </Heading>
                </Dialog.Header>

                <Dialog.Body>
                    <style>
                        {`
                            .phone-input-chakra-override .react-international-phone-input-container { width: 100%; }
                            .phone-input-chakra-override .react-international-phone__input {
                                width: 100% !important;
                                height: 40px !important; 
                                border-radius: 0 4px 4px 0 !important;
                                border-color: #E2E8F0 !important;
                            }
                            .phone-input-chakra-override .react-international-phone__input:focus {
                                border-color: var(--brand-secondary) !important;
                                box-shadow: 0 0 0 1px var(--brand-secondary) !important;
                            }
                        `}
                    </style>
                
                    {/* ✅ Texto actualizado: Tono amable y explicativo */}
                    <Text fontSize="sm" color="gray.600" mb={4}>
                        {L.body}
                    </Text>
                
                    <Box mb={4}>
                        <label htmlFor="phone-input" style={{ fontWeight: 600, fontSize: '0.875rem' }}>
                            {L.label}
                        </label>
                        <Box mt={2} className="phone-input-chakra-override">
                            <PhoneInput
                                defaultCountry="es" 
                                value={phone}
                                onChange={(newPhone) => setPhone(newPhone)}
                                inputProps={{ id: "phone-input" }}
                            />
                        </Box>
                    </Box>
                </Dialog.Body>

                <Dialog.Footer>
                    <Flex justify="space-between" w="100%" gap={3}>
                        {/* ✅ Botón Secundario: Cerrar sin guardar */}
                        <Button 
                            variant="ghost" 
                            colorScheme="gray" 
                            onClick={handleClose}
                            disabled={isLoading}
                        >
                            {L.later}
                        </Button>

                        {/* Botón Primario: Guardar */}
                        <Button
                            bg="var(--brand-secondary)"
                            color="white"
                            _hover={{ bg: 'color-mix(in srgb, var(--brand-secondary) 76%, white)' }}
                            loading={isLoading}
                            onClick={handleUpdatePhone}
                            // BUG FIX: contar dígitos, no longitud bruta — antes la
                            // librería retornaba mínimo "+34" así el botón parecía
                            // habilitado con 0 dígitos reales.
                            disabled={digitCount(phone) < 7}
                        >
                            {L.save}
                        </Button>
                    </Flex>
                </Dialog.Footer>

            </Dialog.Content>
            </Dialog.Positioner>
        </Portal>
        </Dialog.Root>
    </Chakra>
  );
}