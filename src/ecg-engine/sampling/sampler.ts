/**
 * Clean 12-Lead ECG Sampler
 *
 * Samples the continuous biophysical pipeline at fixed intervals (default 500 Hz, dt = 2.0 ms):
 *   CardiacSourceState(t)
 *     -> LeadFieldModel (ElectrodePotentials)
 *     -> CableMapping (ElectrodeReversal)
 *     -> LeadDerivation (12 leads: I, II, III, aVR, aVL, aVF, V1..V6)
 *
 * Guarantees that all 12 leads share the exact same timestamp sequence `t`.
 */

import { LEAD_NAMES, LeadName, TwelveLeadSignals } from '../core/types';
import {
  applyCableMapping,
  ElectrodeReversalMode,
  MissingElectrodeId,
} from '../electrodes/cableMapping';
import {
  CANONICAL_LEAD_FIELD_V1,
  projectSourceToElectrodes,
} from '../leadfield/leadFieldModel';
import { deriveInstantaneousLeads } from '../leads/leadDerivation';
import { ResolvedSimulationConfig } from '../resolver/resolvedConfig';
import { evaluateCardiacSourceAtTime } from '../spatial/sourceEvaluator';
import { MasterTimeline } from '../timeline/events';

export function sampleCleanTwelveLeadECG(
  timeline: MasterTimeline,
  config: ResolvedSimulationConfig,
  samplingRateHz: number,
  electrodeReversal: ElectrodeReversalMode,
  missingElectrodes?: readonly MissingElectrodeId[]
): TwelveLeadSignals {
  const dtMs = 1000 / Math.max(100, samplingRateHz);
  const numSamples = Math.floor(timeline.durationMs / dtMs) + 1;

  const cleanSignals = {} as TwelveLeadSignals;
  for (const lead of LEAD_NAMES) {
    cleanSignals[lead] = new Array(numSamples);
  }

  for (let i = 0; i < numSamples; i++) {
    const t = i * dtMs;
    const sourceState = evaluateCardiacSourceAtTime(t, timeline, config);
    const rawPotentials = projectSourceToElectrodes(
      sourceState,
      CANONICAL_LEAD_FIELD_V1,
      config.anatomy.orientation
    );
    const mappedPotentials = applyCableMapping(rawPotentials, electrodeReversal);
    const derivedLeads = deriveInstantaneousLeads(
      mappedPotentials,
      missingElectrodes,
      t
    );

    for (const lead of LEAD_NAMES) {
      cleanSignals[lead]![i] = {
        t,
        v: derivedLeads[lead],
      };
    }
  }

  return cleanSignals;
}
