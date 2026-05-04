/**
 * Heuristic pilaster / jamb counts for **order-of-magnitude** takeoff and hardware planning.
 * Real shop drawings can differ; values are documented on generated lines.
 */

export type PartitionLayoutShape = 'linear' | 'l_shape' | 'u_shape' | 'unspecified';

export interface PilasterCountResult {
  /** Estimated pilaster / vertical support members for layout-driven accessories or rough labor. */
  count: number;
  /** Human-readable formula for estimators. */
  formula: string;
}

/**
 * Single straight run: `n` compartments in one row → `n + 1` pilaster lines (ends + between stalls).
 * Source: common field rule-of-thumb; verify against manufacturer elevation.
 */
const LINEAR_PILASTERS = (n: number) => (n > 0 ? n + 1 : 0);

/**
 * L-shape: two runs meeting at one corner. One pilaster is shared at the corner.
 * Leg counts must sum to total compartments in that restroom bank.
 */
const L_PILASTERS = (a: number, b: number) => (a > 0 && b > 0 ? LINEAR_PILASTERS(a) + LINEAR_PILASTERS(b) - 1 : Math.max(LINEAR_PILASTERS(a + b), 0));

/**
 * U-shape: three runs, two internal corners (each shared by two legs) → subtract 2 from naive sum of three linear ends.
 */
const U_PILASTERS = (a: number, b: number, c: number) => {
  const sum = a + b + c;
  if (sum === 0) return 0;
  if (a > 0 && b > 0 && c > 0) {
    return LINEAR_PILASTERS(a) + LINEAR_PILASTERS(b) + LINEAR_PILASTERS(c) - 2;
  }
  return LINEAR_PILASTERS(sum);
};

export function estimatePilasterCount(input: {
  shape: PartitionLayoutShape;
  totalCompartments: number;
  lLegA: number;
  lLegB: number;
  uLegA: number;
  uLegB: number;
  uLegC: number;
}): PilasterCountResult {
  const n = Math.max(0, Math.floor(input.totalCompartments));
  switch (input.shape) {
    case 'unspecified':
      return { count: 0, formula: 'Layout not set — add pilaster count from shop drawings or set layout above.' };
    case 'linear':
      return {
        count: LINEAR_PILASTERS(n),
        formula: n > 0 ? `Linear run: ${n} compartments → ${LINEAR_PILASTERS(n)} pilasters (n+1).` : 'No compartments.',
      };
    case 'l_shape': {
      const a = Math.max(0, Math.floor(input.lLegA));
      const b = Math.max(0, Math.floor(input.lLegB));
      if (a + b === 0 && n > 0) {
        return {
          count: LINEAR_PILASTERS(n),
          formula: 'L-shape legs not set — using single-run (linear) estimate. Enter stalls per leg for a corner-adjusted count.',
        };
      }
      if (a + b !== n && n > 0) {
        return {
          count: L_PILASTERS(a, b || Math.max(0, n - a)),
          formula: `L-shape: leg A=${a}, leg B=${b} (sum should equal ${n} total); pilasters ≈ ${L_PILASTERS(a, b || 1)}. Verify on plan.`,
        };
      }
      return {
        count: L_PILASTERS(a, b),
        formula: `L-shape: leg A=${a}, leg B=${b} → shared corner pilaster subtracted once.`,
      };
    }
    case 'u_shape': {
      const a = Math.max(0, Math.floor(input.uLegA));
      const b = Math.max(0, Math.floor(input.uLegB));
      const c = Math.max(0, Math.floor(input.uLegC));
      if (a + b + c === 0 && n > 0) {
        return {
          count: LINEAR_PILASTERS(n),
          formula:
            'U-shape legs not set — using a single-run (linear) pilaster count. Enter stalls on each of the three runs for a U-shaped layout.',
        };
      }
      if (a + b + c !== n && n > 0) {
        return {
          count: U_PILASTERS(a, b, c),
          formula: `U-shape: legs ${a}+${b}+${c} (total compartments ${n}) — sum should match. Pilasters are heuristic; verify on plan.`,
        };
      }
      return {
        count: U_PILASTERS(a, b, c),
        formula: `U-shape: three runs ${a} + ${b} + ${c} → two inside corners shared.`,
      };
    }
    default:
      return { count: 0, formula: '' };
  }
}

export type PartitionHardwareMode = 'per_door' | 'continuous_hinge';
