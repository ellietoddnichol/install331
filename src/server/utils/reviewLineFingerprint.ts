import { createHash } from 'crypto';

/** Canonical fields only — stable when row order changes if content is unchanged. */
export interface ReviewLineFingerprintInput {
  roomName: string;
  itemCode: string;
  itemName: string;
  description: string;
  quantity: number;
  unit: string;
}

function stableScalar(value: unknown): string {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * SHA-256 hex digest of a deterministic JSON payload (sorted keys).
 * Used for correction logs and draft rows when `lineId` is ephemeral.
 */
export function computeReviewLineFingerprint(input: ReviewLineFingerprintInput): string {
  const payload = {
    description: stableScalar(input.description),
    itemCode: stableScalar(input.itemCode),
    itemName: stableScalar(input.itemName),
    quantity: Number.isFinite(input.quantity) ? input.quantity : 0,
    roomName: stableScalar(input.roomName),
    unit: stableScalar(input.unit),
  };
  const json = JSON.stringify(payload);
  return createHash('sha256').update(json, 'utf8').digest('hex');
}

/** Same canonical fields as the fingerprint, but without quantity or unit (volatile across re-parses). */
export type ReviewLineContentKeyInput = Pick<
  ReviewLineFingerprintInput,
  'roomName' | 'itemCode' | 'itemName' | 'description'
>;

/**
 * Hash for matching durable actions (e.g. Ignore) when `computeReviewLineFingerprint` changes
 * because quantity or unit changed between document passes.
 */
export function computeReviewLineContentKey(input: ReviewLineContentKeyInput): string {
  const payload = {
    description: stableScalar(input.description),
    itemCode: stableScalar(input.itemCode),
    itemName: stableScalar(input.itemName),
    roomName: stableScalar(input.roomName),
  };
  return createHash('sha256').update(JSON.stringify(payload), 'utf8').digest('hex');
}
