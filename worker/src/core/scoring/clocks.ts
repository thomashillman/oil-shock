import type { Clock, ScoringThresholds } from "../../types";

interface ClockInputs {
  nowIso: string;
  durationInCurrentStateSeconds: number | null;
  firstTransmissionSignalObservedAt: string | null;
  firstMismatchObservedAt: string | null;
  thresholds: ScoringThresholds;
}

function dateToSeconds(iso: string, nowIso: string): number {
  const observedTime = new Date(iso).getTime();
  const nowTime = new Date(nowIso).getTime();
  return Math.max(0, (nowTime - observedTime) / 1000);
}

function formatClockLabel(seconds: number): string {
  if (seconds < 3600) {
    const mins = Math.floor(seconds / 60);
    return `${mins} minute${mins !== 1 ? "s" : ""}`;
  }
  if (seconds < 86400) {
    const hours = Math.floor(seconds / 3600);
    return `${hours} hour${hours !== 1 ? "s" : ""}`;
  }
  const days = Math.floor(seconds / 86400);
  return `${days} day${days !== 1 ? "s" : ""}`;
}

export function computeClocks(inputs: ClockInputs): {
  shock: Clock;
  dislocation: Clock;
  transmission: Clock;
} {
  const nowIso = inputs.nowIso;

  // Shock age: duration since first mismatch detected
  let shockAgeSeconds = 0;
  if (inputs.firstMismatchObservedAt) {
    shockAgeSeconds = dateToSeconds(inputs.firstMismatchObservedAt, nowIso);
  }
  const shockAgeHours = shockAgeSeconds / 3600;
  const shockClockClassification = shockAgeHours < inputs.thresholds.shockAgeThresholdHours ? "acute" : "chronic";

  // Dislocation age: duration in current state
  let dislocationAgeSeconds = inputs.durationInCurrentStateSeconds ?? 0;
  const dislocationAgeHours = dislocationAgeSeconds / 3600;
  const dislocationClockClassification =
    dislocationAgeHours < inputs.thresholds.dislocationPersistenceHours ? "acute" : "chronic";

  // Transmission age: duration since first significant transmission signal
  let transmissionAgeSeconds = 0;
  if (inputs.firstTransmissionSignalObservedAt) {
    transmissionAgeSeconds = dateToSeconds(inputs.firstTransmissionSignalObservedAt, nowIso);
  }
  const transmissionAgeHours = transmissionAgeSeconds / 3600;
  const transmissionClockClassification = transmissionAgeHours === 0 ? "emerging" : "chronic";

  return {
    shock: {
      ageSeconds: shockAgeSeconds,
      label: formatClockLabel(shockAgeSeconds),
      classification: shockClockClassification
    },
    dislocation: {
      ageSeconds: dislocationAgeSeconds,
      label: formatClockLabel(dislocationAgeSeconds),
      classification: dislocationClockClassification
    },
    transmission: {
      ageSeconds: transmissionAgeSeconds,
      label: transmissionAgeSeconds === 0 ? "none yet" : formatClockLabel(transmissionAgeSeconds),
      classification: transmissionClockClassification
    }
  };
}
