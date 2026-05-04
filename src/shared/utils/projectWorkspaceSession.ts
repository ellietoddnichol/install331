import type { EstimateWorkspaceView, WorkspaceTab } from '../types/projectWorkflow';

/** Persist room / takeoff view / selection across reloads and dev HMR so work isn’t reset to “first room”. */
export const WORKSPACE_UI_STORAGE_PREFIX = 'estimator:workspaceUi:v2:';

export type WorkspaceUiSnapshot = {
  activeRoomId?: string;
  takeoffRoomFilter?: string;
  selectedLineId?: string | null;
  estimateView?: EstimateWorkspaceView;
  /** Pricing tab: horizontal chips by room vs by category. */
  pricingOrganizeMode?: 'rooms' | 'categories';
  /** When `categories`, filter key or PRICING_ALL_CATEGORIES sentinel (stored as string). */
  pricingCategoryFilter?: string;
};

export function readWorkspaceUi(projectId: string): WorkspaceUiSnapshot {
  try {
    const raw = sessionStorage.getItem(`${WORKSPACE_UI_STORAGE_PREFIX}${projectId}`);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as WorkspaceUiSnapshot;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function writeWorkspaceUi(projectId: string, snapshot: WorkspaceUiSnapshot) {
  try {
    sessionStorage.setItem(`${WORKSPACE_UI_STORAGE_PREFIX}${projectId}`, JSON.stringify(snapshot));
  } catch {
    // ignore quota / private mode
  }
}

const KNOWN_TABS = new Set<string>(['overview', 'setup', 'scope-review', 'estimate', 'proposal']);

export function tabFromSearchParam(value: string | null): WorkspaceTab {
  if (!value) return 'estimate';
  if (value === 'files') return 'overview';
  if (value === 'takeoff' || value === 'rooms') return 'estimate';
  if (value === 'handoff') return 'proposal';
  if (KNOWN_TABS.has(value)) return value as WorkspaceTab;
  return 'estimate';
}

export function estimateViewFromSearchParams(searchParams: URLSearchParams): EstimateWorkspaceView {
  if (searchParams.get('view') === 'quantities') return 'quantities';
  const tab = searchParams.get('tab');
  if (tab === 'takeoff' || tab === 'rooms') return 'quantities';
  return 'pricing';
}
