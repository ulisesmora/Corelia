// «Cómo se cobra»: guía visual en 4 capítulos con los datos reales del estudio.
// Ver ./chapters.ts (cómo se abre) y api/api/views_guide.py (los datos).
export { default as ChargingGuide, ChargingGuideHost } from './ChargingGuide';
export { default as GuideLink } from './GuideLink';
export { default as HowYouCharge } from './HowYouCharge';
export { CHAPTERS, guideHref, useOpenGuide, chapterFromLocation } from './chapters';
export type { GuideChapter } from './chapters';
export { useChargingFacts, invalidateChargingFacts } from './facts';
export type { ChargingFacts } from './facts';
