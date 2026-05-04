/**
 * Advisory “field-style” crew/days vs strict schedule math from Setup `installerCount`.
 * Does not change estimate totals — only clarifies install realism for PMs/estimators.
 */
export type FieldScheduleHint = {
  mathCrew: number;
  mathDays: number;
  fieldCrew: number;
  fieldDays: number;
  reason: string | null;
};

const HR_PER_INSTALLER_DAY = 8;

function clampCrew(n: number): number {
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(8, Math.max(1, Math.round(n)));
}

/**
 * Returns null when the hint matches schedule math (no extra UI noise).
 */
export function computeFieldScheduleHint(input: {
  installerCount: number;
  totalLaborHours: number;
  /** Days from the estimate engine (authoritative vs. recomputing from hours). */
  engineDurationDays: number;
  roomCount: number;
}): FieldScheduleHint | null {
  const mathCrew = clampCrew(Number(input.installerCount) || 1);
  const h = Number(input.totalLaborHours);
  const hours = Number.isFinite(h) && h > 0 ? h : 0;
  const engineDays = Number(input.engineDurationDays);
  const mathDays =
    hours > 0
      ? Number.isFinite(engineDays) && engineDays > 0
        ? Math.max(1, Math.round(engineDays))
        : Math.max(1, Math.ceil(hours / (mathCrew * HR_PER_INSTALLER_DAY)))
      : 0;

  const rooms = Math.max(0, Math.round(Number(input.roomCount) || 0));

  let floor = 1;
  if (rooms >= 4 && hours >= 24) floor = Math.max(floor, 2);
  if (hours >= 72) floor = Math.max(floor, 2);
  if (hours >= 140) floor = Math.max(floor, 3);

  const fieldCrew = clampCrew(Math.max(mathCrew, floor));
  const fieldDays =
    hours > 0 ? Math.max(1, Math.ceil(hours / (fieldCrew * HR_PER_INSTALLER_DAY))) : mathDays > 0 ? mathDays : 0;

  /** Suppress noise unless crew differs by ≥1 or calendar days differ by ≥1 full day. */
  const crewDelta = fieldCrew - mathCrew;
  const dayDelta = Math.abs(Math.round(fieldDays) - Math.round(mathDays));
  if (crewDelta < 1 && dayDelta < 1) return null;

  let reason: string | null = null;
  if (fieldCrew > mathCrew) {
    const parts: string[] = [];
    if (rooms >= 4) parts.push(`${rooms} rooms/areas`);
    if (hours >= 72) parts.push(`${hours.toFixed(0)} install hours`);
    reason =
      parts.length > 0
        ? `Parallel staffing is often more realistic than one installer for the full calendar stretch (${parts.join(' · ')}).`
        : 'Parallel staffing is often more realistic than a single installer for the full calendar stretch.';
  }

  return { mathCrew, mathDays, fieldCrew, fieldDays, reason };
}
