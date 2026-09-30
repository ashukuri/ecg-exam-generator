/**
 * Master Timeline Events, Episodes, and Annotations
 *
 * Central unit of the Master Timeline is Event (instantaneous occurrence) and
 * Episode (duration-bearing physiological process), NOT "beat" and NOT P/QRS/T.
 * P wave, QRS complex, and T wave are surface ECG annotations/observations.
 */

export type ConductionNodeId =
  | 'SA_NODE'
  | 'SA_EXIT'
  | 'ATRIA'
  | 'AV_NODE'
  | 'HIS'
  | 'RIGHT_BUNDLE'
  | 'LEFT_BUNDLE'
  | 'LAF'
  | 'LPF'
  | 'PURKINJE'
  | 'VENTRICULAR_MYOCARDIUM'
  | 'ACCESSORY_PATHWAY';

export interface BaseTimelineEvent {
  id: string;
  timestamp: number; // ms
  priority: number; // Lower number = higher priority at identical timestamp
  insertionOrder: number;
  parentEventId?: string;
  triggerEventId?: string;
}

export type SinusImpulseEvent = BaseTimelineEvent & {
  type: 'SINUS_IMPULSE';
  sourceId: string;
  cycleLengthMs: number;
};

export type AtrialEctopicImpulseEvent = BaseTimelineEvent & {
  type: 'ATRIAL_ECTOPIC_IMPULSE';
  sourceId: string;
  focusRegion: 'HIGH_RA' | 'LOW_ATRIA' | 'PULMONARY_VEIN';
};

export type JunctionalImpulseEvent = BaseTimelineEvent & {
  type: 'JUNCTIONAL_IMPULSE';
  sourceId: string;
  isEscape: boolean;
};

export type VentricularEctopicImpulseEvent = BaseTimelineEvent & {
  type: 'VENTRICULAR_ECTOPIC_IMPULSE';
  sourceId: string;
  originFocus: 'RV_OUTFLOW' | 'LV_POSTERIOR' | 'POLYMORPHIC';
  phaseAngleRad?: number;
};

export type EscapeImpulseEvent = BaseTimelineEvent & {
  type: 'ESCAPE_IMPULSE';
  sourceId: string;
  escapeFocus: 'JUNCTIONAL' | 'VENTRICULAR';
};

export type ConductionAttemptEvent = BaseTimelineEvent & {
  type: 'CONDUCTION_ATTEMPT';
  pathId: ConductionNodeId;
  fromNode: ConductionNodeId;
  toNode: ConductionNodeId;
  originImpulseType:
    | 'SINUS'
    | 'ATRIAL_ECTOPIC'
    | 'FLUTTER'
    | 'AF'
    | 'JUNCTIONAL'
    | 'VENTRICULAR_ECTOPIC'
    | 'VENTRICULAR_ESCAPE'
    | 'PACEMAKER';
};

export type ConductionSuccessEvent = BaseTimelineEvent & {
  type: 'CONDUCTION_SUCCESS';
  pathId: ConductionNodeId;
  fromNode: ConductionNodeId;
  toNode: ConductionNodeId;
  delayMs: number;
  originImpulseType: ConductionAttemptEvent['originImpulseType'];
  bundleState?: {
    rightBundleBlocked: boolean;
    leftBundleBlocked: boolean;
    lafBlocked: boolean;
    lpfBlocked: boolean;
    preexcitationRatio: number;
  };
};

export type ConductionBlockedEvent = BaseTimelineEvent & {
  type: 'CONDUCTION_BLOCKED';
  pathId: ConductionNodeId;
  reason: 'REFRACTORY' | 'DECREMENTAL_EXHAUSTION' | 'MOBITZ_II_DROP' | 'PATH_DISABLED';
};

export type PacemakerStimulusEvent = BaseTimelineEvent & {
  type: 'PACEMAKER_STIMULUS';
  chamber: 'ATRIUM' | 'VENTRICLE';
  outputMv: number;
  pulseWidthMs: number;
};

export type PacemakerSenseEvent = BaseTimelineEvent & {
  type: 'PACEMAKER_SENSE';
  chamber: 'ATRIUM' | 'VENTRICLE';
  sensedEventId: string;
};

export type VviInhibitEvent = BaseTimelineEvent & {
  type: 'VVI_INHIBIT';
  chamber: 'VENTRICLE';
  sensedEventId: string;
  nextScheduledEscapeMs: number;
};

export type CaptureSuccessEvent = BaseTimelineEvent & {
  type: 'CAPTURE_SUCCESS';
  chamber: 'ATRIUM' | 'VENTRICLE';
  stimulusEventId: string;
};

export type CaptureFailureEvent = BaseTimelineEvent & {
  type: 'CAPTURE_FAILURE';
  chamber: 'ATRIUM' | 'VENTRICLE';
  stimulusEventId: string;
  reason: 'REFRACTORY_MYOCARDIUM' | 'SUBTHRESHOLD_OUTPUT';
};

export type PhysiologicalEvent =
  | SinusImpulseEvent
  | AtrialEctopicImpulseEvent
  | JunctionalImpulseEvent
  | VentricularEctopicImpulseEvent
  | EscapeImpulseEvent
  | ConductionAttemptEvent
  | ConductionSuccessEvent
  | ConductionBlockedEvent
  | PacemakerStimulusEvent
  | PacemakerSenseEvent
  | VviInhibitEvent
  | CaptureSuccessEvent
  | CaptureFailureEvent;

export interface BaseTimelineEpisode {
  id: string;
  startTime: number; // ms
  duration: number; // ms
  endTime: number; // ms (startTime + duration)
  sourceEventId: string;
  rootImpulseEventId: string;
}

export type AtrialActivationEpisode = BaseTimelineEpisode & {
  type: 'ATRIAL_ACTIVATION';
  recipeVariant: 'NORMAL_SINUS' | 'ECTOPIC_ATRIAL' | 'RETROGRADE' | 'FLUTTER_WAVE';
  amplitudeScale: number;
  axisOffsetDeg: number;
};

export type AtrialRepolarizationEpisode = BaseTimelineEpisode & {
  type: 'ATRIAL_REPOLARIZATION';
  amplitudeScale: number;
};

export type VentricularActivationEpisode = BaseTimelineEpisode & {
  type: 'VENTRICULAR_ACTIVATION';
  recipeVariant:
    | 'NORMAL_PURKINJE'
    | 'RBBB'
    | 'LBBB'
    | 'LAFB'
    | 'LPFB'
    | 'WPW_PREEXCITED'
    | 'ECTOPIC_RV'
    | 'ECTOPIC_LV'
    | 'PACED_RV_APEX'
    | 'ESCAPE_IDIOVENTRICULAR'
    | 'TORSADES_POLYMORPHIC';
  amplitudeScale: number;
  axisTargetDeg: number;
  torsadesPhaseRad?: number;
};

export type VentricularRepolarizationEpisode = BaseTimelineEpisode & {
  type: 'VENTRICULAR_REPOLARIZATION';
  qrsStartTime: number;
  qrsEndTime: number;
  qrsDuration: number;
  recipeVariant: VentricularActivationEpisode['recipeVariant'];
  amplitudeScale: number;
  tAxisTargetDeg: number;
  secondaryDiscordanceFactor: number; // e.g., in LBBB/RBBB/PVC/Paced where T opposes terminal QRS
};

export type AtrialContractionEpisode = BaseTimelineEpisode & {
  type: 'ATRIAL_CONTRACTION';
  electricalEpisodeId: string;
};

export type VentricularContractionEpisode = BaseTimelineEpisode & {
  type: 'VENTRICULAR_CONTRACTION';
  electricalEpisodeId: string;
};

export type FibrillatoryBackgroundEpisode = BaseTimelineEpisode & {
  type: 'FIBRILLATORY_BACKGROUND';
  waveType: 'FINE_AF' | 'COARSE_AF' | 'FLUTTER_SAWTOOTH';
  dominantFreqHz: number;
  amplitudeMv: number;
};

export type PhysiologicalEpisode =
  | AtrialActivationEpisode
  | AtrialRepolarizationEpisode
  | VentricularActivationEpisode
  | VentricularRepolarizationEpisode
  | AtrialContractionEpisode
  | VentricularContractionEpisode
  | FibrillatoryBackgroundEpisode;

/**
 * Surface ECG observation annotations derived from episodes/events
 */
export type ECGAnnotation = {
  id: string;
  label:
    | 'P'
    | 'QRS'
    | 'T'
    | 'U'
    | 'ST'
    | 'PACE_SPIKE'
    | 'BLOCKED_P'
    | 'VVI_INHIBIT';
  onsetMs: number;
  peakMs: number;
  offsetMs: number;
  linkedEpisodeId?: string;
  linkedEventId?: string;
  description?: string;
};

export type MasterTimeline = {
  durationMs: number;
  events: PhysiologicalEvent[];
  episodes: PhysiologicalEpisode[];
  annotations: ECGAnnotation[];
};
