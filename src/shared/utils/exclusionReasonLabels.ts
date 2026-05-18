export const SCOPE_EXCLUSION_NOTE_PREFIX = 'Scope exclusion:';

export type ExclusionReason =
  | 'duplicate'
  | 'vendor_subtotal'
  | 'freight_note'
  | 'terms'
  | 'owner_supplied'
  | 'alternate'
  | 'internal_note'
  | 'not_in_scope'
  | 'other';

export interface ExclusionReasonOption {
  value: ExclusionReason;
  label: string;
}

export const EXCLUSION_REASON_OPTIONS: ExclusionReasonOption[] = [
  { value: 'duplicate', label: 'Duplicate' },
  { value: 'vendor_subtotal', label: 'Vendor subtotal' },
  { value: 'freight_note', label: 'Freight / shipping note' },
  { value: 'terms', label: 'Terms or conditions' },
  { value: 'owner_supplied', label: 'Owner supplied' },
  { value: 'alternate', label: 'Alternate' },
  { value: 'internal_note', label: 'Internal estimating note' },
  { value: 'not_in_scope', label: 'Not in scope' },
  { value: 'other', label: 'Other' },
];

export function exclusionReasonLabel(reason: ExclusionReason | string): string {
  return EXCLUSION_REASON_OPTIONS.find((o) => o.value === reason)?.label || String(reason);
}

export interface ParsedScopeExclusionNote {
  action: 'hide_from_proposal' | 'exclude_from_estimate';
  reason: ExclusionReason;
  note: string;
}

export function parseScopeExclusionFromNotes(notes: string | null | undefined): ParsedScopeExclusionNote | null {
  const parts = String(notes || '')
    .split(' | ')
    .map((p) => p.trim())
    .filter(Boolean);
  for (const part of parts) {
    if (!part.startsWith(SCOPE_EXCLUSION_NOTE_PREFIX)) continue;
    const body = part.slice(SCOPE_EXCLUSION_NOTE_PREFIX.length).trim();
    const actionMatch = body.match(/action=([a-z_]+)/i);
    const reasonMatch = body.match(/reason=([a-z_]+)/i);
    const noteMatch = body.match(/note=(.+)$/i);
    const action = actionMatch?.[1] === 'exclude_from_estimate' ? 'exclude_from_estimate' : 'hide_from_proposal';
    const reason = (reasonMatch?.[1] || 'other') as ExclusionReason;
    const note = noteMatch?.[1]?.trim() || '';
    return { action, reason, note };
  }
  return null;
}

export function formatScopeExclusionNote(input: {
  action: 'hide_from_proposal' | 'exclude_from_estimate';
  reason: ExclusionReason;
  note?: string;
}): string {
  const notePart = input.note?.trim() ? `; note=${input.note.trim()}` : '';
  return `${SCOPE_EXCLUSION_NOTE_PREFIX} action=${input.action}; reason=${input.reason}${notePart}`;
}

export function appendScopeExclusionNote(
  notes: string | null | undefined,
  input: {
    action: 'hide_from_proposal' | 'exclude_from_estimate';
    reason: ExclusionReason;
    note?: string;
  },
): string {
  const withoutPrior = String(notes || '')
    .split(' | ')
    .map((p) => p.trim())
    .filter(Boolean)
    .filter((p) => !p.startsWith(SCOPE_EXCLUSION_NOTE_PREFIX));
  const next = formatScopeExclusionNote(input);
  return [...withoutPrior, next].join(' | ').trim();
}
