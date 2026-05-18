/** Line-level install assumption key/value pairs persisted in takeoff line notes. */
export const LINE_INSTALL_ASSUMPTIONS_PREFIX = 'Install assumptions:';

export function parseLineInstallAssumptionsFromNotes(
  notes: string | null | undefined,
): Record<string, string> {
  const parts = String(notes || '')
    .split(' | ')
    .map((p) => p.trim())
    .filter(Boolean);
  for (const part of parts) {
    if (!part.startsWith(LINE_INSTALL_ASSUMPTIONS_PREFIX)) continue;
    const body = part.slice(LINE_INSTALL_ASSUMPTIONS_PREFIX.length).trim();
    const out: Record<string, string> = {};
    for (const segment of body.split(';')) {
      const eq = segment.indexOf('=');
      if (eq <= 0) continue;
      const key = segment.slice(0, eq).trim();
      const value = segment.slice(eq + 1).trim();
      if (key && value) out[key] = value;
    }
    return out;
  }
  return {};
}

export function serializeLineInstallAssumptions(assumptions: Record<string, string>): string {
  const entries = Object.entries(assumptions)
    .map(([k, v]) => [k, String(v || '').trim()] as const)
    .filter(([, v]) => v);
  if (entries.length === 0) return '';
  return `${LINE_INSTALL_ASSUMPTIONS_PREFIX} ${entries.map(([k, v]) => `${k}=${v}`).join('; ')}`;
}

export function upsertLineInstallAssumptionsInNotes(
  notes: string | null | undefined,
  assumptions: Record<string, string>,
): string {
  const parts = String(notes || '')
    .split(' | ')
    .map((p) => p.trim())
    .filter(Boolean)
    .filter((p) => !p.startsWith(LINE_INSTALL_ASSUMPTIONS_PREFIX));
  const serialized = serializeLineInstallAssumptions(assumptions);
  if (serialized) parts.push(serialized);
  return parts.join(' | ').trim();
}

/** Remove install-intelligence markers so they can be rebuilt after assumption updates. */
export function stripInstallIntelligenceMarkersFromNotes(notes: string | null | undefined): string {
  return String(notes || '')
    .split(' | ')
    .map((p) => p.trim())
    .filter(Boolean)
    .filter(
      (p) =>
        p !== 'Needs Review'
        && !/^Install questions:/i.test(p)
        && !/^Install review:/i.test(p)
        && !/auto-price labor blocked/i.test(p)
        && !/^Proposal clause:/i.test(p),
    )
    .join(' | ')
    .trim();
}
