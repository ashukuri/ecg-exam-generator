/**
 * Conduction Network Engine
 *
 * Manages state and propagation of electrical impulses across:
 *   SA_EXIT -> ATRIA -> AV_NODE -> HIS -> (RIGHT_BUNDLE / LEFT_BUNDLE / LAF / LPF) -> PURKINJE -> VENTRICULAR_MYOCARDIUM
 *
 * Key physiological models:
 * - FIXED: Constant conduction delay if outside absolute refractory period
 * - DECREMENTAL (Wenckebach): Recovery-dependent fatigue accumulation and nonlinear delay prolongation
 *   leading to periodic conduction block without hardcoded PR arrays.
 * - INTERMITTENT_BLOCK (Mobitz II / SA Exit Block): Fixed conduction delay on conducted beats with
 *   scheduled intermittent non-conduction.
 */

import { ConductionPathConfig } from '../resolver/modifiers';
import { ConductionNodeId } from '../timeline/events';

export type PathRuntimeState = {
  lastAttemptTimeMs: number;
  lastConductedTimeMs: number;
  fatigueLevel: number;
  attemptCounter: number;
  consecutiveConducted: number;
};

export type ConductionEvaluationResult =
  | {
      conducted: true;
      delayMs: number;
    }
  | {
      conducted: false;
      reason:
        | 'PATH_DISABLED'
        | 'REFRACTORY'
        | 'DECREMENTAL_EXHAUSTION'
        | 'MOBITZ_II_DROP';
    };

export class ConductionNetworkRuntime {
  private readonly configs: Record<ConductionNodeId, ConductionPathConfig>;
  private readonly states: Record<ConductionNodeId, PathRuntimeState>;

  constructor(configs: Record<ConductionNodeId, ConductionPathConfig>) {
    this.configs = structuredClone(configs);
    this.states = {} as Record<ConductionNodeId, PathRuntimeState>;

    const keys = Object.keys(this.configs) as ConductionNodeId[];
    for (const k of keys) {
      this.states[k] = {
        lastAttemptTimeMs: -10000,
        lastConductedTimeMs: -10000,
        fatigueLevel: 0,
        attemptCounter: 0,
        consecutiveConducted: 0,
      };
    }
  }

  getPathConfig(id: ConductionNodeId): ConductionPathConfig {
    return this.configs[id];
  }

  getPathState(id: ConductionNodeId): PathRuntimeState {
    return this.states[id];
  }

  /**
   * Forces a node into absolute refractoriness at `timeMs` (e.g., concealed retrograde penetration from a PVC).
   */
  imposeConcealedRefractoriness(id: ConductionNodeId, timeMs: number): void {
    const st = this.states[id];
    if (st) {
      st.lastConductedTimeMs = Math.max(st.lastConductedTimeMs, timeMs);
    }
  }

  /**
   * Evaluates whether an impulse arriving at `pathId` at `timestampMs` conducts or blocks,
   * updating the node's physiological recovery/fatigue state.
   */
  attemptConduction(
    pathId: ConductionNodeId,
    timestampMs: number
  ): ConductionEvaluationResult {
    const cfg = this.configs[pathId];
    const st = this.states[pathId];

    st.attemptCounter += 1;

    if (!cfg.enabled) {
      st.lastAttemptTimeMs = timestampMs;
      st.consecutiveConducted = 0;
      return { conducted: false, reason: 'PATH_DISABLED' };
    }

    const elapsedSinceConducted = timestampMs - st.lastConductedTimeMs;

    // Check absolute refractory period
    if (elapsedSinceConducted < cfg.refractoryPeriodMs) {
      st.lastAttemptTimeMs = timestampMs;
      st.consecutiveConducted = 0;
      return { conducted: false, reason: 'REFRACTORY' };
    }

    if (cfg.behavior === 'INTERMITTENT_BLOCK' && cfg.intermittentBlockConfig) {
      const { conductionRatioN, dropEveryKthAttempt } =
        cfg.intermittentBlockConfig;
      const mod = ((st.attemptCounter - 1) % conductionRatioN) + 1;
      if (mod === dropEveryKthAttempt) {
        st.lastAttemptTimeMs = timestampMs;
        st.consecutiveConducted = 0;
        return { conducted: false, reason: 'MOBITZ_II_DROP' };
      }
      st.lastAttemptTimeMs = timestampMs;
      st.lastConductedTimeMs = timestampMs;
      st.consecutiveConducted += 1;
      return { conducted: true, delayMs: cfg.baseDelayMs };
    }

    if (cfg.behavior === 'DECREMENTAL' && cfg.decrementalConfig) {
      const {
        fatigueIncrementPerImpulse,
        fatigueRecoveryTauMs,
        maxDelayIncrementMs,
        blockFatigueThreshold,
      } = cfg.decrementalConfig;

      // Exponential recovery of AV nodal excitability during diastolic interval
      const dtSinceLastAttempt = Math.max(
        0,
        timestampMs - st.lastAttemptTimeMs
      );
      const recoveredFatigue =
        st.fatigueLevel * Math.exp(-dtSinceLastAttempt / fatigueRecoveryTauMs);

      const projectedFatigue = recoveredFatigue + fatigueIncrementPerImpulse;

      st.lastAttemptTimeMs = timestampMs;

      if (projectedFatigue >= blockFatigueThreshold) {
        // Impulse blocks in AV node; recovery during the dropped beat clears fatigue for next impulse
        st.fatigueLevel = recoveredFatigue * 0.22;
        st.consecutiveConducted = 0;
        return { conducted: false, reason: 'DECREMENTAL_EXHAUSTION' };
      }

      // Conducted with progressive decremental delay
      const normalizedFatigue = Math.max(
        0,
        recoveredFatigue / Math.max(0.01, blockFatigueThreshold)
      );
      const extraDelay =
        maxDelayIncrementMs * Math.pow(normalizedFatigue, 0.95);
      const totalDelay = cfg.baseDelayMs + extraDelay;

      st.fatigueLevel = projectedFatigue;
      st.lastConductedTimeMs = timestampMs;
      st.consecutiveConducted += 1;

      return { conducted: true, delayMs: totalDelay };
    }

    // Default FIXED conduction
    st.lastAttemptTimeMs = timestampMs;
    st.lastConductedTimeMs = timestampMs;
    st.consecutiveConducted += 1;
    return { conducted: true, delayMs: cfg.baseDelayMs };
  }
}
