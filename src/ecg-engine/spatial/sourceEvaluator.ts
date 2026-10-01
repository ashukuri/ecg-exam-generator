/**
 * Spatial Cardiac Source Evaluator
 *
 * Evaluates the instantaneous 8-dimensional `CardiacSourceState` (global XYZ + 5 regional modes)
 * at any timestamp `tMs` by summing active physiological episodes on the Master Timeline.
 * Also applies:
 * - Atrial repolarization / PR segment injury dipole (Acute Pericarditis PR depression & aVR PR elevation)
 * - Beat-to-beat electrical alternans (Large Pericardial Effusion pendular cardiac motion)
 * - Anatomical geometry transforms (e.g., Dextrocardia situs inversus)
 */

import {
  AnatomyConfig,
  CardiacSourceState,
  createZeroCardiacSourceState,
} from '../core/types';
import { degToRad } from '../core/units';
import {
  evaluateBetaKernel,
  evaluateSmoothSegmentKernel,
  evaluateTemporalKernel,
} from '../morphology/kernels';
import {
  ActivationRecipe,
  ECTOPIC_ATRIAL_RECIPE,
  ECTOPIC_LV_QRS_RECIPE,
  ECTOPIC_RV_QRS_RECIPE,
  LAFB_QRS_RECIPE,
  LBBB_QRS_RECIPE,
  LPFB_QRS_RECIPE,
  PACED_RV_APEX_QRS_RECIPE,
  RBBB_QRS_RECIPE,
  SpatialSourceComponent,
  WPW_PREEXCITED_QRS_RECIPE,
} from '../morphology/recipes';
import { ResolvedSimulationConfig } from '../resolver/resolvedConfig';
import {
  MasterTimeline,
  VentricularActivationEpisode,
} from '../timeline/events';

function addScaledSource(
  accum: CardiacSourceState,
  dir: CardiacSourceState,
  weight: number,
  frontalRotationRad = 0,
  zBias = 0
): void {
  if (weight === 0 || !Number.isFinite(weight)) return;

  let gx = dir.global.x;
  let gy = dir.global.y;
  const gz = dir.global.z + zBias;

  if (frontalRotationRad !== 0) {
    const c = Math.cos(frontalRotationRad);
    const s = Math.sin(frontalRotationRad);
    const rx = gx * c - gy * s;
    const ry = gx * s + gy * c;
    gx = rx;
    gy = ry;
  }

  accum.global.x += weight * gx;
  accum.global.y += weight * gy;
  accum.global.z += weight * gz;

  accum.regional.septal += weight * dir.regional.septal;
  accum.regional.rvAnterior += weight * (dir.regional.rvAnterior + zBias * 0.6);
  accum.regional.lvLateral += weight * dir.regional.lvLateral;
  accum.regional.inferior += weight * dir.regional.inferior;
  accum.regional.posterobasal += weight * dir.regional.posterobasal;
}

function selectVentricularRecipeForEpisode(
  ep: VentricularActivationEpisode,
  config: ResolvedSimulationConfig
): ActivationRecipe {
  switch (ep.recipeVariant) {
    case 'RBBB':
      return RBBB_QRS_RECIPE;
    case 'LBBB':
      return LBBB_QRS_RECIPE;
    case 'LAFB':
      return LAFB_QRS_RECIPE;
    case 'LPFB':
      return LPFB_QRS_RECIPE;
    case 'WPW_PREEXCITED':
      return WPW_PREEXCITED_QRS_RECIPE;
    case 'PACED_RV_APEX':
      return PACED_RV_APEX_QRS_RECIPE;
    case 'ECTOPIC_RV':
    case 'ESCAPE_IDIOVENTRICULAR':
    case 'TORSADES_POLYMORPHIC':
      return ECTOPIC_RV_QRS_RECIPE;
    case 'ECTOPIC_LV':
      return ECTOPIC_LV_QRS_RECIPE;
    case 'NORMAL_PURKINJE':
    default:
      return config.ventricularRecipe;
  }
}

function evaluateComponentsAtTime(
  accum: CardiacSourceState,
  components: SpatialSourceComponent[],
  epStartMs: number,
  epDurationMs: number,
  tMs: number,
  amplitudeScale: number,
  frontalRotationRad: number,
  zBias = 0
): void {
  if (tMs <= epStartMs || tMs >= epStartMs + epDurationMs || epDurationMs <= 0) {
    return;
  }

  const normalizedEpTime = (tMs - epStartMs) / epDurationMs;

  for (const comp of components) {
    const localX =
      (normalizedEpTime - comp.startFraction) /
      Math.max(1e-6, comp.durationFraction);
    if (localX <= 0 || localX >= 1) continue;

    const kVal = evaluateTemporalKernel(comp.kernel, localX, tMs);
    if (kVal === 0) continue;

    const totalWeight = kVal * comp.magnitude * amplitudeScale;
    addScaledSource(
      accum,
      comp.spatialDirection,
      totalWeight,
      frontalRotationRad,
      zBias
    );
  }
}

function applyAnatomyTransform(
  state: CardiacSourceState,
  anatomy: AnatomyConfig
): CardiacSourceState {
  let { x, y, z } = state.global;
  let { septal, rvAnterior, lvLateral, inferior, posterobasal } = state.regional;

  if (anatomy.frontalAxisRotationDeg !== 0) {
    const rad = degToRad(anatomy.frontalAxisRotationDeg);
    const c = Math.cos(rad);
    const s = Math.sin(rad);
    const nx = x * c - y * s;
    const ny = x * s + y * c;
    x = nx;
    y = ny;
  }

  if (anatomy.orientation === 'DEXTROCARDIA') {
    x = -x;
  }

  return {
    global: { x, y, z },
    regional: {
      septal,
      rvAnterior,
      lvLateral,
      inferior,
      posterobasal,
    },
  };
}

/**
 * Evaluates the composite CardiacSourceState at `tMs` (in ms) from the MasterTimeline.
 */
export function evaluateCardiacSourceAtTime(
  tMs: number,
  timeline: MasterTimeline,
  config: ResolvedSimulationConfig
): CardiacSourceState {
  const accum = createZeroCardiacSourceState();

  let qrsBeatCounter = 0;

  // 1. Evaluate active physiological episodes
  for (const ep of timeline.episodes) {
    const isQrs = ep.type === 'VENTRICULAR_ACTIVATION';
    const currentQrsOrdinal = isQrs ? qrsBeatCounter++ : -1;

    if (tMs < ep.startTime - 20 || tMs > ep.endTime + 220) {
      continue;
    }

    switch (ep.type) {
      case 'ATRIAL_ACTIVATION': {
        const recipe =
          ep.recipeVariant === 'ECTOPIC_ATRIAL'
            ? ECTOPIC_ATRIAL_RECIPE
            : config.atrialRecipe;
        const targetAxis = config.pAxisDeg + ep.axisOffsetDeg;
        const rotRad = degToRad(targetAxis - recipe.referenceAxisDeg);

        evaluateComponentsAtTime(
          accum,
          recipe.components,
          ep.startTime,
          ep.duration,
          tMs,
          ep.amplitudeScale,
          rotRad
        );
        break;
      }

      case 'ATRIAL_REPOLARIZATION': {
        // Explicit Atrial Repolarization / PR Segment Source (e.g. Acute Pericarditis atrial injury current)
        // Directed superior-rightward-posterior (-X, -Y, -Z), producing PR depression in I/II/III/aVF/V3-V6 and PR elevation in aVR
        if (
          config.atrialRepolarization.enabled &&
          config.atrialRepolarization.magnitudeMv > 0 &&
          tMs > ep.startTime &&
          tMs < ep.endTime
        ) {
          const prX = (tMs - ep.startTime) / Math.max(10, ep.duration);
          const prEnv = evaluateSmoothSegmentKernel(
            {
              type: 'SMOOTH_SEGMENT',
              riseFraction: 0.18,
              fallFraction: 0.22,
              plateauSlope: 0.0,
            },
            prX
          );
          const atrialRepolDir: CardiacSourceState = {
            global: { x: -0.64, y: -0.78, z: -0.26 },
            regional: {
              septal: -0.22,
              rvAnterior: -0.25,
              lvLateral: -0.38,
              inferior: -0.45,
              posterobasal: +0.15,
            },
          };
          addScaledSource(
            accum,
            atrialRepolDir,
            prEnv * config.atrialRepolarization.magnitudeMv
          );
        }
        break;
      }

      case 'VENTRICULAR_ACTIVATION': {
        const recipe = selectVentricularRecipeForEpisode(ep, config);
        // Rotate relative to the recipe's own referenceAxisDeg so specialized recipes (LBBB, LAFB, LPFB, PACED_RV_APEX, RVH, Pediatric)
        // never suffer from double rotation
        const explicitAxisDeltaDeg = ep.axisTargetDeg - recipe.referenceAxisDeg;
        let rotRad = degToRad(explicitAxisDeltaDeg);
        let ampScale = ep.amplitudeScale;
        let zBias = 0;

        // Beat-to-beat Electrical Alternans (Large Pericardial Effusion pendular cardiac motion)
        if (config.electricalAlternans.enabled) {
          const parity = currentQrsOrdinal % 2 === 0 ? 1 : -1;
          rotRad += degToRad(parity * config.electricalAlternans.axisSwingDeg);
          ampScale *=
            1.0 + parity * config.electricalAlternans.amplitudeSwingRatio;
          zBias = parity * config.electricalAlternans.anteriorSwingZ;
        }

        if (ep.torsadesPhaseRad !== undefined) {
          rotRad += ep.torsadesPhaseRad;
          ampScale *= 0.65 + 0.45 * Math.sin(ep.torsadesPhaseRad * 0.7);
        }

        evaluateComponentsAtTime(
          accum,
          recipe.components,
          ep.startTime,
          ep.duration,
          tMs,
          ampScale,
          rotRad,
          zBias
        );
        break;
      }

      case 'VENTRICULAR_REPOLARIZATION': {
        // 3A. Evaluate ST Segment Recipe (bridges from J-point into early/mid repolarization)
        if (
          config.stRecipe.enabled &&
          tMs >= ep.startTime - 12 &&
          tMs <= ep.endTime
        ) {
          const stDuration = ep.duration * 0.52;
          const stX = (tMs - (ep.startTime - 8)) / Math.max(10, stDuration);
          if (stX > 0 && stX < 1) {
            const stEnv = evaluateSmoothSegmentKernel(
              {
                type: 'SMOOTH_SEGMENT',
                riseFraction: 0.12,
                fallFraction: 0.35,
                plateauSlope: config.stRecipe.plateauSlope,
              },
              stX
            );
            addScaledSource(
              accum,
              config.stRecipe.injurySource,
              stEnv * config.stRecipe.magnitudeMv
            );
          }

          const jWave = config.stRecipe.jWaveComponent;
          if (jWave && jWave.enabled) {
            const jDur = ep.duration * jWave.durationFraction;
            const jX = (tMs - (ep.startTime - 6)) / Math.max(10, jDur);
            if (jX > 0 && jX < 1) {
              const jVal = evaluateTemporalKernel(jWave.kernel, jX, tMs);
              addScaledSource(
                accum,
                jWave.spatialDirection,
                jVal * jWave.magnitude
              );
            }
          }
        }

        // 3B. Evaluate Primary T Wave Recipe
        if (tMs > ep.startTime && tMs < ep.endTime) {
          const tRecipe = config.repolarizationRecipe;
          const tRotRad = degToRad(
            ep.tAxisTargetDeg - tRecipe.referenceTAxisDeg
          );
          // LV ectopy uses its own secondary T source below, rather than the
          // background sinus T template, so its T opposes the ectopic QRS.
          if (ep.recipeVariant !== 'ECTOPIC_LV') {
            evaluateComponentsAtTime(
              accum,
              tRecipe.components,
              ep.startTime,
              ep.duration,
              tMs,
              ep.amplitudeScale,
              tRotRad
            );
          }

          // Secondary ST-T Discordance (opposes terminal activation vector in LBBB/RBBB/Brugada/PVC/Paced/RVH)
          if (ep.secondaryDiscordanceFactor > 0.01) {
            const localX = (tMs - ep.startTime) / ep.duration;
            const discEnv = evaluateBetaKernel(
              { type: 'BETA', alpha: 3.0, beta: 2.2 },
              localX
            );
            const isRightPrecordialNegativeT =
              ep.recipeVariant === 'RBBB' ||
              config.stRecipe.id === 'ST_BRUGADA_COVED' ||
              config.stRecipe.id === 'ST_RVH_STRAIN';
            const discordanceDir: CardiacSourceState =
              ep.recipeVariant === 'ECTOPIC_LV'
                ? {
                    global: { x: -0.45, y: +0.78, z: -0.88 },
                    regional: {
                      septal: -0.72,
                      rvAnterior: -0.85,
                      lvLateral: +1.1,
                      inferior: +0.55,
                      posterobasal: +0.45,
                    },
                  }
                : isRightPrecordialNegativeT
                ? {
                    global: { x: +0.35, y: +0.1, z: -0.75 },
                    regional: {
                      septal: -0.65,
                      rvAnterior: -0.95,
                      lvLateral: +0.25,
                      inferior: 0,
                      posterobasal: 0,
                    },
                  }
                : {
                    global: { x: -0.72, y: -0.28, z: +0.62 },
                    regional: {
                      septal: +0.48,
                      rvAnterior: +0.52,
                      lvLateral: -0.88,
                      inferior: -0.2,
                      posterobasal: -0.25,
                    },
                  };
            addScaledSource(
              accum,
              discordanceDir,
              discEnv * 0.55 * ep.secondaryDiscordanceFactor
            );
          }
        }

        // 3C. Evaluate Independent U Wave Recipe (post-T wave)
        if (config.uWaveRecipe.enabled && config.uWaveRecipe.magnitude > 0) {
          const uOnset = ep.endTime + config.uWaveRecipe.delayAfterTEndMs;
          const uDur = config.uWaveRecipe.durationMs;
          if (tMs > uOnset && tMs < uOnset + uDur) {
            const uX = (tMs - uOnset) / uDur;
            const uVal = evaluateBetaKernel(
              { type: 'BETA', alpha: 2.5, beta: 2.8 },
              uX
            );
            addScaledSource(
              accum,
              config.uWaveRecipe.spatialDirection,
              uVal * config.uWaveRecipe.magnitude
            );
          }
        }
        break;
      }

      case 'FIBRILLATORY_BACKGROUND': {
        if (ep.waveType === 'FLUTTER_SAWTOOTH') {
          const cycleSec = 1 / Math.max(2, ep.dominantFreqHz);
          const phase = ((tMs / 1000) % cycleSec) / cycleSec;
          const saw =
            Math.sin(2 * Math.PI * phase) -
            0.38 * Math.sin(4 * Math.PI * phase);
          const flutterDir: CardiacSourceState = {
            global: { x: -0.15, y: -0.88, z: +0.32 },
            regional: {
              septal: +0.2,
              rvAnterior: +0.35,
              lvLateral: -0.1,
              inferior: -0.45,
              posterobasal: 0,
            },
          };
          addScaledSource(accum, flutterDir, saw * ep.amplitudeMv);
        } else {
          const fVal = evaluateTemporalKernel(
            {
              type: 'STOCHASTIC_SOURCE',
              baseFrequencyHz: ep.dominantFreqHz,
              harmonicsCount: 5,
              irregularity: 0.75,
              seedOffset: 17,
            },
            0.5,
            tMs
          );
          const afDir: CardiacSourceState = {
            global: { x: +0.25, y: +0.78, z: +0.48 },
            regional: {
              septal: +0.25,
              rvAnterior: +0.42,
              lvLateral: +0.1,
              inferior: +0.35,
              posterobasal: 0,
            },
          };
          addScaledSource(accum, afDir, fVal * ep.amplitudeMv);
        }
        break;
      }

      case 'ATRIAL_CONTRACTION':
      case 'VENTRICULAR_CONTRACTION':
        break;
    }
  }

  // 2. Evaluate dedicated Device Electrical Pacing Pulse (PACEMAKER_STIMULUS) near tMs
  for (const ev of timeline.events) {
    if (ev.type === 'PACEMAKER_STIMULUS') {
      const dt = tMs - ev.timestamp;
      if (dt >= -1.0 && dt <= 3.0) {
        const spikeProfile = dt <= 1.2 ? 1.0 : -0.35;
        const spikeWeight = spikeProfile * (ev.outputMv * 0.45);
        const spikeDir: CardiacSourceState =
          ev.chamber === 'ATRIUM'
            ? {
                global: { x: +0.42, y: +0.65, z: +0.52 },
                regional: {
                  septal: +0.35,
                  rvAnterior: +0.48,
                  lvLateral: 0,
                  inferior: +0.28,
                  posterobasal: 0,
                },
              }
            : {
                // RV Apical Stimulus: directed posteriorly/superiorly/leftward so V1 spike does not create a false positive r wave
                global: { x: +0.52, y: -0.78, z: -0.68 },
                regional: {
                  septal: -0.58,
                  rvAnterior: -0.75,
                  lvLateral: +0.42,
                  inferior: -0.48,
                  posterobasal: 0,
                },
              };
        addScaledSource(accum, spikeDir, spikeWeight);
      }
    }
  }

  return applyAnatomyTransform(accum, config.anatomy);
}
