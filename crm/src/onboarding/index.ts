// Guía de puesta en marcha (ver GuidePage y api/api/setup_guide.py)
export { ProgressProvider, ProgressOutlet } from './ProgressProvider';
export { useSetupProgress } from './progressContext';
export { default as StepGuide } from './StepGuide';
export { default as HomeProgressCard } from './HomeProgressCard';
export { default as GuidePage } from './GuidePage';
export { default as QuickRoomDialog } from './QuickRoomDialog';
export { ClassTemplatesDialog, ClassTemplatesPicker } from './ClassTemplates';
export { default as WebPreview, WebPreviewButton } from './WebPreview';
export { useActionParam } from './useActionParam';
export { GUIDE_PATH, withGuide, stepRoute } from './guide';
export { STEP_COPY, PREREQ, TEMPLATES_UI, UI as GUIDE_UI } from './copy';
export type { StepKey } from './copy';
