"use client";

import React, { useState, useMemo, useCallback } from "react";
import {
  Box,
  Flex,
  Heading,
  Text,
  VStack,
  Button,
  Field,
  Input,
  Select,
  Spinner,
  Alert, // Use Alert.Root
  Icon,
  InputGroup, // Keep for icons if needed
  Stack, // Keep for layout
  createListCollection,
  Center,
} from "@chakra-ui/react";
import { FaEnvelope, FaUser, FaCheckCircle, FaExclamationTriangle } from "react-icons/fa";
import Chakra from "./ChakraProvider"; // Assuming you have this
import { Toaster, toaster } from "./ui/toaster"; // Assuming you have this
import { useT } from '../i18n/index';
import { API_V1 } from '../config';

// --- Reusable Collections (Copied from HeroWithVideo) ---
// (You might want to extract these into a separate file later)
const useFormCollections = () => {
    const t = useT();
    const interestsCollection = useMemo(() => createListCollection({
        items: [
             { label: t("home.heroVideo.intReformer") || "Pilates Reformer", value: "Reformer" },
        { label: t("home.heroVideo.intSuelo") || "Pilates Suelo (Mat)", value: "Suelo" },
        { label: t("home.heroVideo.intYoga") || "Yoga", value: "Yoga" },
        { label: t("home.heroVideo.intYogaKids") || "Yoga Niños", value: "Yoga niños" },
        { label: t("home.heroVideo.intPrePostParto") || "Pilates Pre/Post Parto", value: "Pre/Post parto" },
        { label: t("home.heroVideo.intSenior") || "Grupo Senior", value: "Senior" },
        ],
    }), [t]);

    const experienceCollection = useMemo(() => createListCollection({
        items: [
                { value: "Nunca", label: t("home.heroVideo.expNever") || "Nunca he hecho Pilates" },
        { value: "Principiante", label: t("home.heroVideo.expBeginner") || "Principiante" },
        { value: "Intermedio", label: t("home.heroVideo.expIntermediate") || "Intermedio" },
        { value: "Avanzado", label: t("home.heroVideo.expAdvanced") || "Avanzado" },
 ],
    }), [t]);

    const daysCollection = useMemo(() => createListCollection({
        items: [
               { label: t("home.heroVideo.dayMonday") || "Lunes", value: "Lunes" },
        { label: t("home.heroVideo.dayTuesday") || "Martes", value: "Martes" },
        { label: t("home.heroVideo.dayWednesday") || "Miércoles", value: "Miércoles" },
        { label: t("home.heroVideo.dayThursday") || "Jueves", value: "Jueves" },
        { label: t("home.heroVideo.dayFriday") || "Viernes", value: "Viernes" },
        { label: t("home.heroVideo.dayWeekend") || "Fin de semana", value: "Fin de semana" },
  
        ],
    }), [t]);

    const scheduleCollection = useMemo(() => createListCollection({
        items: [
          { value: "8:30", label: t("home.heroVideo.schFirst") || "Primera hora (8:30)" },
        { value: "9:30-13:30", label: t("home.heroVideo.schMorning") || "Mañana (9:30 - 13:30)" },
        { value: "13:30-16:30", label: t("home.heroVideo.schMidday") || "Medio día (13:30 - 16:30)" },
        { value: "16:30-20:30", label: t("home.heroVideo.schAfternoon") || "Tarde (16:30 – 20:30)" },
        { value: "20:30", label: t("home.heroVideo.schLast") || "Última hora (20:30)" },
      ],
    }), [t]);

    return { interestsCollection, experienceCollection, daysCollection, scheduleCollection };
};


// --- Main Component ---
export default function UpdatePreferencesForm() {
  const t = useT();
  const { interestsCollection, experienceCollection, daysCollection, scheduleCollection } = useFormCollections();

  // --- State ---
  const [step, setStep] = useState(1);
  const [email, setEmail] = useState("");
  const [isCheckingEmail, setIsCheckingEmail] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Preference States (for Step 2)
  const [interests, setInterests] = useState<string[]>([]);
  const [experienceLevel, setExperienceLevel] = useState<string[]>([]);
  const [birthDate, setBirthDate] = useState<string>(""); // Use string for date input
  const [preferredDays, setPreferredDays] = useState<string[]>([]);
  const [preferredSchedule, setPreferredSchedule] = useState<string[]>([]);

  // API URL base (adjust if needed)
  const API_BASE_URL =  API_V1;

  

  // --- Handlers ---

  // Step 1: Check if email exists
  const handleCheckEmail = useCallback(async () => {
    if (!email) {
      setErrorMessage(t('updatePrefs.errEmailRequired'));
      return;
    }
    setIsCheckingEmail(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const response = await fetch(`${API_BASE_URL}/checkleads/check-email/?email=${encodeURIComponent(email)}`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      });

      if (response.ok) {
        // Email found, proceed to step 2
        setStep(2);
      } else if (response.status === 404) {
        setErrorMessage(t('updatePrefs.errEmailNotFound'));
      } else {
        // Other errors
        const errorData = await response.json();
        setErrorMessage(errorData.error || t('updatePrefs.errEmailCheck'));
      }
    } catch (error) {
      console.error("Network error checking email:", error);
      setErrorMessage(t('updatePrefs.errNetwork'));
    } finally {
      setIsCheckingEmail(false);
    }
  }, [email, API_BASE_URL, t]);

  // Step 2: Update preferences
  const handleUpdatePreferences = useCallback(async () => {
    // Basic validation for Step 2
    if (interests.length === 0 || experienceLevel.length === 0 || !birthDate || preferredDays.length === 0 || preferredSchedule.length === 0) {
        setErrorMessage(t('updatePrefs.errIncomplete'));
        return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    const payload = {
      email, // Include email to identify the user
      whatThinkFeel: interests.join(', '),
      experience_level: experienceLevel[0], // Assuming single selection
      birth_date: birthDate,
      // Combine days and schedule into 'desires' as before
      desires: `Días preferidos: ${preferredDays.join(', ')}. Franja horaria: ${preferredSchedule[0]}.`,
    };

    try {
      const response = await fetch(`${API_BASE_URL}/checkleads/update-by-email/`, {
        method: "PATCH", // Use PATCH for partial updates
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        setSuccessMessage(t('updatePrefs.success'));
        // Optionally reset form or redirect after a delay
        setTimeout(() => {
          // setStep(1); // Go back to step 1
          // setEmail(''); // Clear email
          // // Clear preference states...
        }, 3000);
      } else {
        const errorData = await response.json();
        // Handle specific validation errors from serializer if needed
        if (response.status === 400 && errorData) {
            const firstErrorKey = Object.keys(errorData)[0];
            setErrorMessage(`Error: ${firstErrorKey} - ${errorData[firstErrorKey][0]}`);
        } else {
            setErrorMessage(errorData.error || t('updatePrefs.errUpdate'));
        }
      }
    } catch (error) {
      console.error("Network error updating preferences:", error);
      setErrorMessage(t('updatePrefs.errNetwork'));
    } finally {
      setIsSubmitting(false);
    }
  }, [email, interests, experienceLevel, birthDate, preferredDays, preferredSchedule, API_BASE_URL, t]);

  // Handler to go back to Step 1
  const handleBackStep = useCallback(() => {
    setStep(1);
    setErrorMessage(null); // Clear errors when going back
    setSuccessMessage(null);
  }, []);

  // --- Styles ---
  const inputFocus = useMemo(() => ({ borderColor: "var(--brand-secondary)", boxShadow: "0 0 0 1px var(--brand-secondary)" }), []);

  // --- Render ---
  return (
    <Chakra>
      <Toaster /> {/* Needed for toaster messages */}
      <Center py={12} px={4}>
        <Box
          bg="white"
          p={8}
          rounded="xl"
          shadow="xl"
          w="full"
          maxW="md" // Limit width
        >
          <Heading mb={2} size="lg" textAlign="center" color="#333">
            {t('updatePrefs.title')}
          </Heading>
          <Text mb={6} textAlign="center" color="gray.600">
            {step === 1 ? t('updatePrefs.step1Intro') : t('updatePrefs.step2Intro')} ({t('updatePrefs.stepOf', { step })})
          </Text>

          {/* Display Error/Success Messages */}
          {errorMessage && (
            <Alert.Root status="error" variant="subtle" mb={4} rounded="md">
              <Alert.Content > {t('updatePrefs.errorLabel')}  </Alert.Content>
              <Alert.Description>{errorMessage}</Alert.Description>
            </Alert.Root>
          )}
          {successMessage && (
            <Alert.Root status="success" variant="subtle" mb={4} rounded="md">
              <Alert.Description>{successMessage}</Alert.Description>
            </Alert.Root>
          )}

          {/* --- Step 1: Email Input --- */}
          {step === 1 && (
            <VStack gap={4}>
              <Field.Root id="updateEmail" required>
                <Field.Label>{t('updatePrefs.emailLabel')}</Field.Label>
                <InputGroup>
                   {/* If you want an icon */}
                   {/* <InputLeftElement pointerEvents="none"> <Icon as={FaEnvelope} color="gray.400" /> </InputLeftElement> */}
                   <Input
                     type="email"
                     placeholder={t('updatePrefs.emailPlaceholder')}
                     value={email}
                     onChange={(e) => setEmail(e.target.value)}
                     _focus={inputFocus}
                     disabled={isCheckingEmail} // Disable while checking
                   />
                </InputGroup>
              </Field.Root>
              <Button
                w="full"
                bg="var(--brand-secondary)"
                color="white"
                _hover={{ bg: "color-mix(in srgb, var(--brand-secondary) 74%, var(--brand-dark))" }}
                onClick={handleCheckEmail}
                disabled={isCheckingEmail} // Use correct prop 'disabled'
                loading={isCheckingEmail} // Use correct prop 'loading'
                spinner={<Spinner size="sm" />}
              >
                {t('updatePrefs.checkEmailBtn')}
              </Button>
            </VStack>
          )}

          {/* --- Step 2: Preferences Form --- */}
          {step === 2 && (
            <VStack gap={4}>
              {/* Interests (Multi-select) */}
              <Field.Root>
                <Select.Root
                  collection={interestsCollection}
                  value={interests}
                  onValueChange={({ value }) => setInterests(value as string[])}
                  multiple={true}
                  size="md" // Smaller size might fit better
                >
                  <Select.HiddenSelect />
                  <Select.Label>{t('updatePrefs.interestsLabel')}</Select.Label>
                  <Select.Control>
                    <Select.Trigger _focus={inputFocus}>
                      <Select.ValueText placeholder={t('updatePrefs.interestsPlaceholder')} />
                    </Select.Trigger>
                    {/* Indicator can be removed if preferred */}
                  </Select.Control>
                  <Select.Positioner>
                    <Select.Content>
                      {interestsCollection.items.map((item) => (
                        <Select.Item item={item} key={item.value}>
                          <Select.ItemText>{item.label}</Select.ItemText>
                          <Select.ItemIndicator />
                        </Select.Item>
                      ))}
                    </Select.Content>
                  </Select.Positioner>
                </Select.Root>
              </Field.Root>

              {/* Experience Level (Single select) */}
              <Field.Root>
                 <Select.Root
                    collection={experienceCollection}
                    value={experienceLevel}
                    onValueChange={({ value }) => setExperienceLevel(value)}
                    size="md"
                 >
                    <Select.HiddenSelect />
                    <Select.Label>{t('updatePrefs.experienceLabel')}</Select.Label>
                    <Select.Control>
                      <Select.Trigger _focus={inputFocus}>
                         <Select.ValueText placeholder={t('updatePrefs.selectPlaceholder')} />
                      </Select.Trigger>
                    </Select.Control>
                    <Select.Positioner>
                      <Select.Content>
                        {experienceCollection.items.map((item) => (
                          <Select.Item item={item} key={item.value}>
                            <Select.ItemText>{item.label}</Select.ItemText>
                            <Select.ItemIndicator />
                          </Select.Item>
                        ))}
                      </Select.Content>
                    </Select.Positioner>
                 </Select.Root>
              </Field.Root>

              {/* Birth Date */}
              <Field.Root>
                <Field.Label>{t('updatePrefs.birthDateLabel')}</Field.Label>
                <Input
                  type="date"
                  value={birthDate}
                  onChange={(e) => setBirthDate(e.target.value)}
                  _focus={inputFocus}
                  max={new Date().toISOString().split('T')[0]} // Prevent future dates
                  size="md"
                />
              </Field.Root>

              {/* Preferred Days (Multi-select) */}
              <Field.Root>
                <Select.Root
                  collection={daysCollection}
                  value={preferredDays}
                  onValueChange={({ value }) => setPreferredDays(value as string[])}
                  multiple={true}
                  size="md"
                >
                  <Select.HiddenSelect />
                  <Select.Label>{t('updatePrefs.daysLabel')}</Select.Label>
                  <Select.Control>
                    <Select.Trigger _focus={inputFocus}>
                       <Select.ValueText placeholder={t('updatePrefs.daysPlaceholder')} />
                    </Select.Trigger>
                  </Select.Control>
                  <Select.Positioner>
                    <Select.Content>
                      {daysCollection.items.map((item) => (
                        <Select.Item item={item} key={item.value}>
                          <Select.ItemText>{item.label}</Select.ItemText>
                          <Select.ItemIndicator />
                        </Select.Item>
                      ))}
                    </Select.Content>
                  </Select.Positioner>
                </Select.Root>
              </Field.Root>

              {/* Preferred Schedule (Single select) */}
              <Field.Root>
                 <Select.Root
                    collection={scheduleCollection}
                    value={preferredSchedule}
                    onValueChange={({ value }) => setPreferredSchedule(value)}
                    size="md"
                 >
                    <Select.HiddenSelect />
                    <Select.Label>{t('updatePrefs.scheduleLabel')}</Select.Label>
                    <Select.Control>
                      <Select.Trigger _focus={inputFocus}>
                         <Select.ValueText placeholder={t('updatePrefs.selectPlaceholder')} />
                      </Select.Trigger>
                    </Select.Control>
                    <Select.Positioner>
                      <Select.Content>
                        {scheduleCollection.items.map((item) => (
                          <Select.Item item={item} key={item.value}>
                            <Select.ItemText>{item.label}</Select.ItemText>
                            <Select.ItemIndicator />
                          </Select.Item>
                        ))}
                      </Select.Content>
                    </Select.Positioner>
                 </Select.Root>
              </Field.Root>

              {/* Action Buttons */}
              <Flex w="full" gap={4} mt={4}>
                <Button
                  variant="outline"
                  borderColor="gray.300"
                  onClick={handleBackStep}
                  disabled={isSubmitting} // Disable while submitting
                  flex={1} // Make buttons share space
                >
                  {t('updatePrefs.back')}
                </Button>
                <Button
                  bg="var(--brand-secondary)"
                  color="white"
                  _hover={{ bg: "color-mix(in srgb, var(--brand-secondary) 74%, var(--brand-dark))" }}
                  onClick={handleUpdatePreferences}
                  disabled={isSubmitting} // Use correct prop 'disabled'
                  loading={isSubmitting} // Use correct prop 'loading'
                  spinner={<Spinner size="sm" />}
                  flex={1} // Make buttons share space
                >
                  {t('updatePrefs.submit')}
                </Button>
              </Flex>
            </VStack>
          )}
        </Box>
      </Center>
    </Chakra>
  );
}