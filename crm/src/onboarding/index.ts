// Puesta en marcha obligatoria (ver ./flow.ts, ./setup/ y api/api/setup_guide.py),
// bloqueos del panel (./locks.ts) y visitas guiadas (./coach/).
export { ProgressProvider, ProgressOutlet } from './ProgressProvider';
export { useSetupProgress } from './progressContext';
export { default as HomeSlot } from './HomeSlot';
export { default as HomeProgressCard } from './HomeProgressCard';
export { default as GuideRedirect } from './GuideRedirect';
export { default as SetupBanner } from './SetupBanner';
export { default as QuickRoomDialog } from './QuickRoomDialog';
export { ClassTemplatesDialog, ClassTemplatesPicker } from './ClassTemplates';
export { default as WebPreview, WebPreviewButton } from './WebPreview';
export { useActionParam } from './useActionParam';
export { GUIDE_PATH, withGuide, stepRoute } from './guide';
export { STEP_COPY, PREREQ, TEMPLATES_UI, UI as GUIDE_UI } from './copy';
export type { StepKey } from './copy';
export { FLOW, SETUP_PATH, setupStepLink, setupUnfinished } from './flow';
export { useLocks } from './locks';
export type { Lock } from './locks';
export { HowItWorks, useCoach } from './coach';
