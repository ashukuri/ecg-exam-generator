/**
 * Public API Barrel (`ecg-engine`)
 *
 * External applications (including ECG Heart Simulator) must ONLY import from this
 * public barrel (`src/ecg-engine/index.ts` or `src/ecg-engine`) and must NEVER deep-import
 * internal modules (`leadFieldModel.ts`, `recipes.ts`, `timelineBuilder.ts`, `sourceEvaluator.ts`).
 */

export * from './version';
export * from './core/units';
export * from './core/random';
export * from './core/types';
export * from './timeline/events';
export * from './timeline/eventQueue';
export * from './timeline/timelineBuilder';
export * from './scenario/types';
export * from './resolver/modifiers';
export * from './resolver/resolvedConfig';
export * from './conduction/conductionEngine';
export * from './morphology/kernels';
export * from './morphology/recipes';
export * from './spatial/sourceEvaluator';
export * from './spatial/animationState';
export * from './leadfield/leadFieldModel';
export * from './leadfield/calibration';
export * from './electrodes/cableMapping';
export * from './leads/leadDerivation';
export * from './presets/clinicalPresets';
export * from './sampling/sampler';
export * from './artifacts/artifactEngine';
export * from './features/featureExtractor';
export * from './validation/validator';
export * from './simulation/simulateECG';
export * from './diagnostics/diagnosticMatrix';
export * from './diagnostics/svgExporter';

import { ECGPoint } from './core/types';
import { ValidationReport } from './validation/validator';

export type ECGLeadSignal = ECGPoint[];
export type ValidationResult = ValidationReport;

