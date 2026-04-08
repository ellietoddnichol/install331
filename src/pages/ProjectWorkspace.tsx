import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowRight,
  Calculator,
  ChevronDown,
  Clock3,
  Download,
  FileUp,
  Gauge,
  Hammer,
  Layers3,
  Paperclip,
  Sparkles,
  Trash2,
  Wallet,
  CalendarClock,
} from 'lucide-react';
import { api } from '../services/api';
import { BundleRecord, InstallReviewEmailDraft, ModifierRecord, ProjectFileRecord, ProjectJobConditions, ProjectRecord, RoomRecord, SettingsRecord, TakeoffLineRecord } from '../shared/types/estimator';
import { CatalogItem } from '../types';
import {
  createDefaultProjectJobConditions,
  isMeaningfulTravelDistanceMiles,
  normalizeProjectJobConditions,
  recommendDeliveryPlan,
} from '../shared/utils/jobConditions';
import {
  DEFAULT_PROPOSAL_ACCEPTANCE_LABEL,
  DEFAULT_PROPOSAL_CLARIFICATIONS,
  DEFAULT_PROPOSAL_EXCLUSIONS,
  DEFAULT_PROPOSAL_INTRO,
  DEFAULT_PROPOSAL_TERMS,
  ensureProposalDefaults,
} from '../shared/utils/proposalDefaults';
import { PROPOSAL_FORMAT_OPTIONS } from '../shared/utils/proposalDocument';
import { TopProjectHeader } from '../components/workspace/TopProjectHeader';
import { ProjectSetupWorkspace } from '../components/workspace/ProjectSetupWorkspace';
import { RoomManager } from '../components/workspace/RoomManager';
import { EstimateGrid } from '../components/workspace/EstimateGrid';
import { ItemPicker } from '../components/workspace/ItemPicker';
import { ModifierPanel } from '../components/workspace/ModifierPanel';
import { ProposalPreview } from '../components/workspace/ProposalPreview';
import { BundlePickerModal } from '../components/workspace/BundlePickerModal';
import { formatCurrencySafe, formatKilobytesSafe, formatLaborDurationMinutes, formatNumberSafe } from '../utils/numberFormat';
import { getDistanceInMiles } from '../utils/geo';
import { catalogItemMatchesQuery } from '../shared/utils/catalogItemSearch';
import { CatalogCategorySelect } from '../components/intake/CatalogCategorySelect';
import { useTransientNumericField } from '../hooks/useTransientNumericField';

interface Summary {
  materialSubtotal: number;
  laborSubtotal: number;
  adjustedLaborSubtotal: number;
  /** Present on newer API; falls back to hours × 60 in UI when missing. */
  totalLaborMinutes?: number;
  totalLaborHours: number;
  durationDays: number;
  lineSubtotal: number;
  conditionAdjustmentAmount: number;
  conditionLaborMultiplier: number;
  conditionLaborHoursMultiplier?: number;
  burdenAmount: number;
  overheadAmount: number;
  profitAmount: number;
  taxAmount: number;
  laborOverheadAmount?: number;
  laborProfitAmount?: number;
  subLaborManagementFeeAmount?: number;
  materialLoadedSubtotal?: number;
  laborLoadedSubtotal?: number;
  laborCompanionProposalTotal?: number;
  baseBidTotal: number;
  conditionAssumptions: string[];
  productiveCrewHoursPerDay?: number;
  materialWasteAllowanceAmount?: number;
  installerFieldSuppliesAmount?: number;
  laborLearningCurveAllowanceAmount?: number;
}

interface RoomCreationDraft {
  roomName: string;
  addStarterLine: boolean;
  starterDescription: string;
  starterQty: number;
  starterUnit: string;
}

type WorkspaceTab = 'overview' | 'setup' | 'takeoff' | 'estimate' | 'files' | 'proposal';

const WORKSPACE_TABS: WorkspaceTab[] = ['overview', 'setup', 'takeoff', 'estimate', 'files', 'proposal'];

/** URL/searchParam value for “show every room’s lines” in takeoff (not a real room id). */
const TAKEOFF_ALL_ROOMS = '__all__';

/** Persist room / takeoff view / selection across reloads and dev HMR so work isn’t reset to “first room”. */
const WORKSPACE_UI_STORAGE_PREFIX = 'estimator:workspaceUi:v1:';

type WorkspaceUiSnapshot = {
  activeRoomId?: string;
  takeoffRoomFilter?: string;
  selectedLineId?: string | null;
};

function readWorkspaceUi(projectId: string): WorkspaceUiSnapshot {
  try {
    const raw = sessionStorage.getItem(`${WORKSPACE_UI_STORAGE_PREFIX}${projectId}`);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as WorkspaceUiSnapshot;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeWorkspaceUi(projectId: string, snapshot: WorkspaceUiSnapshot) {
  try {
    sessionStorage.setItem(`${WORKSPACE_UI_STORAGE_PREFIX}${projectId}`, JSON.stringify(snapshot));
  } catch {
    // ignore quota / private mode
  }
}

function isWorkspaceTab(value: string | null): value is WorkspaceTab {
  return !!value && WORKSPACE_TABS.includes(value as WorkspaceTab);
}

function tabFromSearchParam(value: string | null): WorkspaceTab {
  if (value === 'rooms') return 'takeoff';
  return isWorkspaceTab(value) ? value : 'estimate';
}

/** Canonical JSON for autosave dirty checks — avoids missed saves when key order or nested shapes differ. */
function fingerprintProjectStable(p: ProjectRecord): string {
  const { updatedAt: _u, createdAt: _c, ...rest } = p;
  const normalized = {
    ...rest,
    jobConditions: normalizeProjectJobConditions(rest.jobConditions),
    selectedScopeCategories: [...(rest.selectedScopeCategories || [])].sort(),
  };
  return stableStringify(normalized);
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((v) => stableStringify(v)).join(',')}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
}

const DEFAULT_ROOM_CREATION_DRAFT: RoomCreationDraft = {
  roomName: '',
  addStarterLine: false,
  starterDescription: 'Manual item',
  starterQty: 1,
  starterUnit: 'EA',
};

export function ProjectWorkspace() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [loading, setLoading] = useState(true);
  const [workspaceLoadError, setWorkspaceLoadError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<WorkspaceTab>(() => tabFromSearchParam(searchParams.get('tab')));

  const [project, setProject] = useState<ProjectRecord | null>(null);
  const [rooms, setRooms] = useState<RoomRecord[]>([]);
  const [lines, setLines] = useState<TakeoffLineRecord[]>([]);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [settings, setSettings] = useState<SettingsRecord | null>(null);
  const [modifiers, setModifiers] = useState<ModifierRecord[]>([]);
  const [bundles, setBundles] = useState<BundleRecord[]>([]);
  const [projectFiles, setProjectFiles] = useState<ProjectFileRecord[]>([]);
  const [fileUploading, setFileUploading] = useState(false);
  const [lineModifiers, setLineModifiers] = useState<Array<{
    id: string;
    lineId: string;
    modifierId: string;
    name: string;
    addMaterialCost: number;
    addLaborMinutes: number;
    percentMaterial: number;
    percentLabor: number;
    createdAt: string;
  }>>([]);

  const [syncState, setSyncState] = useState<'idle' | 'syncing' | 'ok' | 'error'>('idle');
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);

  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPersistedFingerprintRef = useRef<string | null>(null);
  const projectRef = useRef<ProjectRecord | null>(null);
  const autosaveGenerationRef = useRef(0);
  const saveProjectRef = useRef<() => Promise<void>>(async () => {});
  projectRef.current = project;

  const [activeRoomId, setActiveRoomId] = useState('');
  /** `TAKEOFF_ALL_ROOMS` = combined view; otherwise a real room id (matches sidebar selection when drilling into one room). */
  const [takeoffRoomFilter, setTakeoffRoomFilter] = useState<string>(TAKEOFF_ALL_ROOMS);
  const [selectedLineId, setSelectedLineId] = useState<string | null>(null);

  const [catalogOpen, setCatalogOpen] = useState(false);
  const [bundleModalOpen, setBundleModalOpen] = useState(false);
  const [modifiersModalOpen, setModifiersModalOpen] = useState(false);
  const [roomCreateModalOpen, setRoomCreateModalOpen] = useState(false);
  const [roomCreationDraft, setRoomCreationDraft] = useState<RoomCreationDraft>(DEFAULT_ROOM_CREATION_DRAFT);
  const [creatingRoom, setCreatingRoom] = useState(false);
  const [catalogSearch, setCatalogSearch] = useState('');
  const [catalogCategory, setCatalogCategory] = useState('all');
  const [proposalDrafting, setProposalDrafting] = useState<null | 'scope_summary' | 'proposal_text' | 'terms_and_conditions' | 'default_short'>(null);
  const [installReviewDraft, setInstallReviewDraft] = useState<InstallReviewEmailDraft | null>(null);
  const [installReviewGenerating, setInstallReviewGenerating] = useState(false);
  const [distanceCalculating, setDistanceCalculating] = useState(false);
  const [distanceError, setDistanceError] = useState<string | null>(null);

  const statusActionLabel = useMemo(() => {
    if (!project) return 'Mark Submitted';
    if (project.status === 'Draft' || project.status === 'Lost') return 'Mark Submitted';
    if (project.status === 'Submitted') return 'Mark Awarded';
    if (project.status === 'Awarded') return 'Archive Project';
    if (project.status === 'Archived') return 'Reopen Draft';
    return 'Mark Submitted';
  }, [project]);

  useEffect(() => {
    if (!id) return;
    setWorkspaceLoadError(null);
    void loadWorkspace(id);
  }, [id]);

  useEffect(() => {
    if (!id || loading) return;
    writeWorkspaceUi(id, { activeRoomId, takeoffRoomFilter, selectedLineId });
  }, [id, loading, activeRoomId, takeoffRoomFilter, selectedLineId]);

  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    if (activeTab === 'estimate') {
      next.delete('tab');
    } else {
      next.set('tab', activeTab);
    }

    if (next.toString() !== searchParams.toString()) {
      setSearchParams(next, { replace: true });
    }
  }, [activeTab, searchParams, setSearchParams]);

  useEffect(() => {
    if (!project) return;
    const address = String(project.address || '').trim();
    if (!address || address.length < 8) return;
    const timer = setTimeout(() => {
      void refreshProjectDistance();
    }, 650);
    return () => clearTimeout(timer);
  }, [project?.address]);

  const projectFingerprint = useMemo(() => (project ? fingerprintProjectStable(project) : ''), [project]);

  useEffect(() => {
    if (!project || loading) return;
    const fp = projectFingerprint;
    if (lastPersistedFingerprintRef.current === null) {
      lastPersistedFingerprintRef.current = fp;
      return;
    }
    if (fp === lastPersistedFingerprintRef.current) return;

    autosaveGenerationRef.current += 1;
    const gen = autosaveGenerationRef.current;
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(() => {
      autosaveTimerRef.current = null;
      void (async () => {
        if (gen !== autosaveGenerationRef.current) return;
        const p = projectRef.current;
        if (!p || loading) return;
        const sent = fingerprintProjectStable(p);
        if (sent === lastPersistedFingerprintRef.current) return;

        setSyncState('syncing');
        try {
          const saved = await api.updateV1Project(p.id, p);
          if (gen !== autosaveGenerationRef.current) return;
          const localNow = projectRef.current;
          const serverFp = fingerprintProjectStable(saved);

          if (localNow && fingerprintProjectStable(localNow) === sent) {
            lastPersistedFingerprintRef.current = serverFp;
            setProject(saved);
            setLastSavedAt(saved.updatedAt);
            /** Project-only save: refresh summary only so the line grid doesn’t reload from the server. */
            const summaryData = await api.getV1Summary(saved.id);
            if (gen !== autosaveGenerationRef.current) return;
            setSummary(summaryData as Summary);
          } else {
            lastPersistedFingerprintRef.current = serverFp;
          }
          setSyncState('ok');
        } catch (error) {
          console.error('Autosave failed', error);
          setSyncState('error');
        }
      })();
    }, 500);
    return () => {
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = null;
      }
    };
  }, [projectFingerprint, project, loading]);

  async function loadWorkspace(projectId: string) {
    try {
      setLoading(true);
      setWorkspaceLoadError(null);
      try {
        await api.repriceV1ProjectTakeoff(projectId);
      } catch (repriceErr) {
        console.warn('Takeoff reprice skipped (workspace still loads)', repriceErr);
      }
      const [projectData, roomData, lineData, catalogData, summaryData, settingsData, modifiersData, bundlesData, filesData] = await Promise.all([
        api.getV1Project(projectId),
        api.getV1Rooms(projectId),
        api.getV1TakeoffLines(projectId),
        api.getCatalog(),
        api.getV1Summary(projectId),
        api.getV1Settings(),
        api.getV1Modifiers(),
        api.getV1Bundles(),
        api.getV1ProjectFiles(projectId),
      ]);

      const normalizedProject = { ...projectData, proposalFormat: projectData.proposalFormat ?? 'standard' };
      setProject(normalizedProject);
      lastPersistedFingerprintRef.current = fingerprintProjectStable(normalizedProject);
      setLastSavedAt(projectData.updatedAt);
      setSyncState('ok');
      setRooms(roomData);
      setLines(lineData);
      setCatalog(catalogData);
      setSummary(summaryData);
      setSettings(ensureProposalDefaults(settingsData));
      setModifiers(modifiersData);
      setBundles(bundlesData);
      setProjectFiles(filesData);

      const ui = readWorkspaceUi(projectId);
      const firstRoomId = roomData[0]?.id ?? '';
      const roomPick =
        ui.activeRoomId && roomData.some((r) => r.id === ui.activeRoomId) ? ui.activeRoomId : firstRoomId;
      setActiveRoomId(roomPick);
      if (
        ui.takeoffRoomFilter === TAKEOFF_ALL_ROOMS ||
        (ui.takeoffRoomFilter && roomData.some((r) => r.id === ui.takeoffRoomFilter))
      ) {
        setTakeoffRoomFilter(ui.takeoffRoomFilter ?? TAKEOFF_ALL_ROOMS);
      } else {
        setTakeoffRoomFilter(TAKEOFF_ALL_ROOMS);
      }
      const linePick =
        ui.selectedLineId && lineData.some((l) => l.id === ui.selectedLineId) ? ui.selectedLineId : null;
      setSelectedLineId(linePick);
    } catch (error: unknown) {
      console.error('Failed to load project workspace', error);
      const message = error instanceof Error ? error.message : 'Failed to load project.';
      const looksNotFound = /404|not found/i.test(message);
      if (looksNotFound) {
        navigate('/');
        return;
      }
      setWorkspaceLoadError(message);
    } finally {
      setLoading(false);
    }
  }

  async function refreshTakeoff(projectId: string) {
    const [lineData, summaryData] = await Promise.all([
      api.getV1TakeoffLines(projectId),
      api.getV1Summary(projectId),
    ]);
    setLines(lineData);
    setSummary(summaryData);
  }

  const activeRoomLines = useMemo(
    () => lines.filter((line) => line.roomId === activeRoomId),
    [lines, activeRoomId]
  );

  const selectedLine = useMemo(
    () => lines.find((line) => line.id === selectedLineId) || null,
    [lines, selectedLineId]
  );

  useEffect(() => {
    if (!selectedLineId) {
      setLineModifiers([]);
      return;
    }

    api.getV1LineModifiers(selectedLineId)
      .then(setLineModifiers)
      .catch(() => setLineModifiers([]));
  }, [selectedLineId]);

  const roomSubtotal = useMemo(
    () => activeRoomLines.reduce((sum, line) => sum + line.lineTotal, 0),
    [activeRoomLines]
  );

  const roomMetrics = useMemo(() => {
    const byRoom: Record<string, { count: number; subtotal: number; totalQty: number; laborMinutes: number }> = {};
    lines.forEach((line) => {
      if (!byRoom[line.roomId]) byRoom[line.roomId] = { count: 0, subtotal: 0, totalQty: 0, laborMinutes: 0 };
      byRoom[line.roomId].count += 1;
      byRoom[line.roomId].subtotal += line.lineTotal;
      byRoom[line.roomId].totalQty += Number(line.qty) || 0;
      byRoom[line.roomId].laborMinutes += Number(line.laborMinutes || 0) * (Number(line.qty) || 0);
    });
    return byRoom;
  }, [lines]);

  useEffect(() => {
    if (!rooms.length) {
      if (activeRoomId) setActiveRoomId('');
      return;
    }
    const exists = rooms.some((r) => r.id === activeRoomId);
    if (!activeRoomId || !exists) {
      setActiveRoomId(rooms[0].id);
    }
  }, [rooms, activeRoomId]);

  useEffect(() => {
    if (takeoffRoomFilter === TAKEOFF_ALL_ROOMS) return;
    const stillThere = rooms.some((r) => r.id === takeoffRoomFilter);
    if (!stillThere) setTakeoffRoomFilter(TAKEOFF_ALL_ROOMS);
  }, [rooms, takeoffRoomFilter]);

  const activeRoomQtyTotal = useMemo(
    () => activeRoomLines.reduce((sum, line) => sum + (Number(line.qty) || 0), 0),
    [activeRoomLines]
  );
  const activeRoomLaborMinutes = useMemo(
    () => activeRoomLines.reduce((sum, line) => sum + Number(line.laborMinutes || 0) * (Number(line.qty) || 0), 0),
    [activeRoomLines]
  );

  const pricingMode = project?.pricingMode || 'labor_and_material';
  const showMaterial = pricingMode !== 'labor_only';
  const showLabor = pricingMode !== 'material_only';

  const baseLaborRatePerHour = useMemo(() => {
    const n = Number(settings?.defaultLaborRatePerHour);
    return Number.isFinite(n) && n > 0 ? n : 100;
  }, [settings?.defaultLaborRatePerHour]);

  const laborCostMultiplier = summary?.conditionLaborMultiplier ?? 1;
  const laborHoursMultiplier = summary?.conditionLaborHoursMultiplier ?? 1;
  const effectiveLaborCostPerHour = useMemo(
    () => Number((baseLaborRatePerHour * laborCostMultiplier).toFixed(2)),
    [baseLaborRatePerHour, laborCostMultiplier]
  );
  const laborRateModifiersActive =
    Math.abs(laborCostMultiplier - 1) > 0.001 || Math.abs(laborHoursMultiplier - 1) > 0.001;
  const selectedScopeCategories = project?.selectedScopeCategories || [];
  const jobConditions = useMemo(
    () => normalizeProjectJobConditions(project?.jobConditions || createDefaultProjectJobConditions()),
    [project?.jobConditions]
  );

  const roomNamesById = useMemo(() => {
    const out: Record<string, string> = {};
    rooms.forEach((room) => {
      out[room.id] = room.roomName;
    });
    return out;
  }, [rooms]);

  const takeoffGridLines = useMemo(() => {
    const filtered =
      takeoffRoomFilter === TAKEOFF_ALL_ROOMS
        ? [...lines]
        : lines.filter((line) => line.roomId === takeoffRoomFilter);
    if (takeoffRoomFilter === TAKEOFF_ALL_ROOMS) {
      filtered.sort((a, b) => {
        const na = roomNamesById[a.roomId] || '';
        const nb = roomNamesById[b.roomId] || '';
        const byRoom = na.localeCompare(nb, undefined, { sensitivity: 'base' });
        if (byRoom !== 0) return byRoom;
        return (a.description || '').localeCompare(b.description || '', undefined, { sensitivity: 'base' });
      });
    }
    return filtered;
  }, [lines, takeoffRoomFilter, roomNamesById]);

  const takeoffViewStats = useMemo(() => {
    return takeoffGridLines.reduce(
      (acc, line) => ({
        lineCount: acc.lineCount + 1,
        totalQty: acc.totalQty + (Number(line.qty) || 0),
        laborMinutes: acc.laborMinutes + Number(line.laborMinutes || 0) * (Number(line.qty) || 0),
      }),
      { lineCount: 0, totalQty: 0, laborMinutes: 0 }
    );
  }, [takeoffGridLines]);

  function selectWorkspaceRoom(roomId: string) {
    setActiveRoomId(roomId);
    setTakeoffRoomFilter(roomId);
  }

  const categories = useMemo(() => {
    const all = new Set<string>();
    catalog.forEach((item) => all.add(item.category));
    return ['all', ...Array.from(all).sort()];
  }, [catalog]);

  const scopeCategoryOptions = useMemo(
    () => categories.filter((category) => category !== 'all'),
    [categories]
  );

  const filteredCatalog = useMemo(() => {
    return catalog.filter((item) => {
      const searchMatch = catalogItemMatchesQuery(item, catalogSearch);
      const categoryMatch = catalogCategory === 'all' || item.category === catalogCategory;
      return searchMatch && categoryMatch;
    });
  }, [catalog, catalogSearch, catalogCategory]);

  function resolveLocalLinePricing(line: TakeoffLineRecord): TakeoffLineRecord {
    const pricingSource = line.pricingSource === 'manual' ? 'manual' : 'auto';
    const calculatedUnitSell = Number((line.materialCost + line.laborCost).toFixed(2));
    const unitSell = pricingSource === 'manual' ? Number(line.unitSell || 0) : calculatedUnitSell;
    return {
      ...line,
      pricingSource,
      unitSell: Number(unitSell.toFixed(2)),
      lineTotal: Number((unitSell * line.qty).toFixed(2)),
    };
  }

  function patchLineLocal(lineId: string, updates: Partial<TakeoffLineRecord>) {
    setLines((prev) =>
      prev.map((line) => {
        if (line.id !== lineId) return line;
        const pricingSource = updates.pricingSource ?? (updates.unitSell !== undefined ? 'manual' : line.pricingSource);
        return resolveLocalLinePricing({ ...line, ...updates, pricingSource });
      })
    );
  }

  async function resetLineToCalculatedPrice(lineId: string) {
    const line = lines.find((entry) => entry.id === lineId);
    if (!line) return;
    const calculatedUnitSell = Number((line.materialCost + line.laborCost).toFixed(2));
    patchLineLocal(lineId, { pricingSource: 'auto', unitSell: calculatedUnitSell });
    await persistLine(lineId, { pricingSource: 'auto', unitSell: calculatedUnitSell });
  }

  function patchJobConditions(updates: Partial<ProjectJobConditions>) {
    setProject((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        jobConditions: normalizeProjectJobConditions({
          ...prev.jobConditions,
          ...updates,
        }),
      };
    });
  }

  function toggleScopeCategory(category: string) {
    setProject((prev) => {
      if (!prev) return prev;
      const current = prev.selectedScopeCategories || [];
      const next = current.includes(category)
        ? current.filter((entry) => entry !== category)
        : [...current, category].sort();
      return {
        ...prev,
        selectedScopeCategories: next,
      };
    });
  }

  async function saveProject() {
    if (!project) return;
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
    setSyncState('syncing');
    try {
      const saved = await api.updateV1Project(project.id, project);
      lastPersistedFingerprintRef.current = fingerprintProjectStable(saved);
      setProject(saved);
      setLastSavedAt(saved.updatedAt);
      setSyncState('ok');
      await refreshTakeoff(saved.id);
    } catch (error) {
      console.error('Failed to save project', error);
      setSyncState('error');
      window.alert(error instanceof Error ? error.message : 'Could not save project.');
    }
  }

  saveProjectRef.current = saveProject;

  useEffect(() => {
    function flushPendingSave() {
      const p = projectRef.current;
      if (!p || loading) return;
      const sent = fingerprintProjectStable(p);
      if (sent === lastPersistedFingerprintRef.current) return;
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = null;
      }
      void saveProjectRef.current();
    }
    function onVisibilityChange() {
      if (document.visibilityState === 'hidden') flushPendingSave();
    }
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('pagehide', flushPendingSave);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('pagehide', flushPendingSave);
    };
  }, [loading]);

  async function deleteProjectPermanently() {
    if (!project) return;
    const confirmed = window.confirm(`Delete project "${project.projectName}" permanently? This removes rooms, takeoff lines, and attached files.`);
    if (!confirmed) return;

    try {
      await api.deleteV1Project(project.id);
      navigate('/projects');
    } catch (error) {
      console.error('Failed to delete project', error);
      window.alert('Unable to delete this project right now.');
    }
  }

  async function refreshProjectDistance() {
    if (!project?.address || !project.address.trim()) {
      patchJobConditions({ travelDistanceMiles: null });
      setDistanceError(null);
      return;
    }

    setDistanceCalculating(true);
    setDistanceError(null);
    try {
      const distance = await getDistanceInMiles(project.address);
      if (distance === null) {
        patchJobConditions({ travelDistanceMiles: null });
        setDistanceError('Unable to calculate distance from the current address.');
        return;
      }

      setProject((prev) => {
        if (!prev) return prev;
        const jc = prev.jobConditions;
        const autoDelivery =
          jc.deliveryAutoCalculated && distance !== null
            ? recommendDeliveryPlan(distance, jc.deliveryDifficulty)
            : {};
        return {
          ...prev,
          jobConditions: normalizeProjectJobConditions({
            ...jc,
            travelDistanceMiles: distance,
            remoteTravel: distance > 50 ? true : jc.remoteTravel,
            ...autoDelivery,
          }),
        };
      });
    } catch (error) {
      console.error('Distance lookup failed', error);
      setDistanceError('Distance lookup failed.');
    } finally {
      setDistanceCalculating(false);
    }
  }

  async function previewProposal() {
    setActiveTab('proposal');
  }

  function collectProposalStyles(): string {
    const cssChunks: string[] = [];
    for (const sheet of Array.from(document.styleSheets)) {
      try {
        const rules = Array.from(sheet.cssRules || []);
        if (!rules.length) continue;
        cssChunks.push(rules.map((rule) => rule.cssText).join('\n'));
      } catch (_error) {
        // Ignore cross-origin or restricted stylesheets.
      }
    }

    cssChunks.push(`
      @page { size: A4; margin: 0.55in; }
      html, body { background: #ffffff !important; margin: 0; padding: 0; }
      body { color: #0f172a; }
      .print-proposal { max-width: 100% !important; margin: 0 auto !important; box-shadow: none !important; }
      .proposal-document { box-shadow: none !important; }
    `);

    return cssChunks.join('\n');
  }

  function buildProposalHtml(container: HTMLElement, title: string): string {
    const styles = collectProposalStyles();
    return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title><style>${styles}</style></head><body>${container.outerHTML}</body></html>`;
  }

  function getProposalContainer(): HTMLElement | null {
    return document.querySelector('[data-proposal-document="true"]') as HTMLElement | null;
  }

  function printProposalDocument() {
    if (!project) return;
    const container = getProposalContainer();
    if (!container) return;

    const title = `proposal-${project.projectNumber || project.id.slice(0, 8)}`;
    const html = buildProposalHtml(container, title);

    const triggerPrintInWindow = (win: Window) => {
      const go = () => {
        win.focus();
        win.print();
      };
      if (win.document.readyState === 'complete') {
        setTimeout(go, 0);
      } else {
        win.addEventListener('load', () => setTimeout(go, 0), { once: true });
      }
    };

    // `noopener` in the features string makes `window.open` return `null` in Chromium 88+ and
    // Firefox 79+ even when popups are allowed — do not use it here; we need the Window handle.
    const printWindow = window.open('about:blank', '_blank', 'popup=yes,width=1100,height=900');
    if (printWindow) {
      printWindow.document.open();
      printWindow.document.write(html);
      printWindow.document.close();
      triggerPrintInWindow(printWindow);
      return;
    }

    const iframe = document.createElement('iframe');
    iframe.setAttribute('title', 'Print proposal');
    iframe.style.cssText =
      'position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none';
    document.body.appendChild(iframe);
    const idoc = iframe.contentDocument;
    const iwin = iframe.contentWindow;
    if (!idoc || !iwin) {
      iframe.remove();
      window.alert('Unable to prepare printing. Use Export to save HTML, then open it and print.');
      return;
    }
    idoc.open();
    idoc.write(html);
    idoc.close();
    const removeIframe = () => {
      if (iframe.parentNode) iframe.remove();
    };
    iwin.addEventListener('afterprint', removeIframe, { once: true });
    setTimeout(removeIframe, 120_000);
    triggerPrintInWindow(iwin);
  }

  async function exportProposal() {
    if (!project) return;
    const container = getProposalContainer();
    if (!container) return;

    const dateStamp = new Date().toISOString().slice(0, 10);
    const number = project.projectNumber || project.id.slice(0, 8);
    const filename = `proposal-${number}-${dateStamp}.html`;
    const html = buildProposalHtml(container, filename);
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  async function submitBid() {
    if (!project) return;
    const nextStatus =
      project.status === 'Draft' || project.status === 'Lost'
        ? 'Submitted'
        : project.status === 'Submitted'
          ? 'Awarded'
          : project.status === 'Awarded'
            ? 'Archived'
            : 'Draft';

    try {
      const updated = await api.updateV1Project(project.id, { status: nextStatus });
      lastPersistedFingerprintRef.current = fingerprintProjectStable(updated);
      setProject(updated);
      setLastSavedAt(updated.updatedAt);
      setSyncState('ok');
    } catch (error) {
      console.error('Failed to update project status', error);
      window.alert('Unable to update project status right now.');
    }
  }

  async function saveProposalWording() {
    if (!settings) return;
    const saved = await api.updateV1Settings(settings);
    setSettings(ensureProposalDefaults(saved));
    setLastSavedAt(new Date().toISOString());
  }

  async function syncSheets() {
    setSyncState('syncing');
    try {
      await api.syncSheets();
      setCatalog(await api.getCatalog());
      setSyncState('ok');
    } catch (error) {
      console.error(error);
      setSyncState('error');
    }
  }

  function openCreateRoomModal() {
    setRoomCreationDraft(DEFAULT_ROOM_CREATION_DRAFT);
    setRoomCreateModalOpen(true);
  }

  function closeCreateRoomModal(force = false) {
    if (creatingRoom && !force) return;
    setRoomCreateModalOpen(false);
    setRoomCreationDraft(DEFAULT_ROOM_CREATION_DRAFT);
  }

  async function createRoom() {
    if (!project || !roomCreationDraft.roomName.trim() || creatingRoom) return;

    setCreatingRoom(true);
    try {
      const room = await api.createV1Room({ projectId: project.id, roomName: roomCreationDraft.roomName.trim() });
      setRooms((prev) => [...prev, room]);
      selectWorkspaceRoom(room.id);

      if (roomCreationDraft.addStarterLine && roomCreationDraft.starterDescription.trim()) {
        await api.createV1TakeoffLine({
          projectId: project.id,
          roomId: room.id,
          sourceType: 'manual',
          description: roomCreationDraft.starterDescription.trim(),
          qty: roomCreationDraft.starterQty > 0 ? roomCreationDraft.starterQty : 1,
          unit: roomCreationDraft.starterUnit.trim() || 'EA',
          materialCost: 0,
          laborMinutes: 0,
          laborCost: 0,
          notes: 'Starter line added during room creation',
        });
        await refreshTakeoff(project.id);
      }

      closeCreateRoomModal(true);
    } finally {
      setCreatingRoom(false);
    }
  }

  async function renameRoom(room: RoomRecord) {
    const nextName = window.prompt('Rename room', room.roomName);
    if (!nextName || nextName === room.roomName) return;
    const updated = await api.updateV1Room(room.id, { roomName: nextName });
    setRooms((prev) => prev.map((r) => (r.id === room.id ? updated : r)));
  }

  async function duplicateRoom(room: RoomRecord) {
    if (!project) return;
    const duplicated = await api.duplicateV1Room(room.id);
    setRooms((prev) => [...prev, duplicated]);
    selectWorkspaceRoom(duplicated.id);
    await refreshTakeoff(project.id);
  }

  async function deleteRoom(room: RoomRecord) {
    if (!project) return;
    if (rooms.length <= 1) {
      window.alert('A project needs at least one room.');
      return;
    }
    if (!window.confirm('Delete this room and its items?')) return;

    await api.deleteV1Room(room.id);
    const nextRooms = rooms.filter((r) => r.id !== room.id);
    setRooms(nextRooms);
    if (activeRoomId === room.id && nextRooms.length) setActiveRoomId(nextRooms[0].id);
    await refreshTakeoff(project.id);
  }

  async function addManualLine() {
    if (!project || !activeRoomId) return;
    const created = await api.createV1TakeoffLine({
      projectId: project.id,
      roomId: activeRoomId,
      sourceType: 'manual',
      description: 'Manual item',
      qty: 1,
      unit: 'EA',
      materialCost: 0,
      laborMinutes: 0,
      laborCost: 0,
      notes: ''
    });
    setLines((prev) => [...prev, created]);
    await refreshTakeoff(project.id);
  }

  async function persistLine(lineId: string, overrides?: Partial<TakeoffLineRecord>) {
    if (!project) return;
    const currentLine = lines.find((l) => l.id === lineId);
    const line = currentLine ? { ...currentLine, ...(overrides || {}) } : null;
    if (!line) return;
    try {
      const saved = await api.updateV1TakeoffLine(lineId, line);
      setLines((prev) => prev.map((item) => (item.id === lineId ? saved : item)));
      await refreshTakeoff(project.id);
    } catch (e) {
      console.error('Failed to save line', e);
      window.alert(e instanceof Error ? e.message : 'Could not save line changes.');
    }
  }

  const lineEditorId = selectedLine?.id ?? '';
  const lineQtyField = useTransientNumericField({
    syncKey: `${lineEditorId}-qty`,
    committed: selectedLine?.qty ?? 0,
    onLive: (n) => {
      if (lineEditorId) patchLineLocal(lineEditorId, { qty: n });
    },
    onCommit: (n) => {
      if (lineEditorId) {
        patchLineLocal(lineEditorId, { qty: n });
        void persistLine(lineEditorId);
      }
    },
  });
  const lineMaterialField = useTransientNumericField({
    syncKey: `${lineEditorId}-material`,
    committed: selectedLine?.materialCost ?? 0,
    onLive: (n) => {
      if (lineEditorId) patchLineLocal(lineEditorId, { materialCost: n });
    },
    onCommit: (n) => {
      if (lineEditorId) {
        patchLineLocal(lineEditorId, { materialCost: n });
        void persistLine(lineEditorId);
      }
    },
  });
  const lineLaborField = useTransientNumericField({
    syncKey: `${lineEditorId}-labor`,
    committed: selectedLine?.laborCost ?? 0,
    onLive: (n) => {
      if (lineEditorId) patchLineLocal(lineEditorId, { laborCost: n });
    },
    onCommit: (n) => {
      if (lineEditorId) {
        patchLineLocal(lineEditorId, { laborCost: n });
        void persistLine(lineEditorId);
      }
    },
  });
  const lineUnitSellField = useTransientNumericField({
    syncKey: `${lineEditorId}-unitsell`,
    committed: selectedLine?.unitSell ?? 0,
    onLive: (n) => {
      if (lineEditorId) patchLineLocal(lineEditorId, { unitSell: n, pricingSource: 'manual' });
    },
    onCommit: (n) => {
      if (lineEditorId) {
        patchLineLocal(lineEditorId, { unitSell: n, pricingSource: 'manual' });
        void persistLine(lineEditorId);
      }
    },
  });

  async function deleteLine(lineId: string) {
    if (!project) return;
    await api.deleteV1TakeoffLine(lineId);
    setLines((prev) => prev.filter((line) => line.id !== lineId));
    if (selectedLineId === lineId) setSelectedLineId(null);
    await refreshTakeoff(project.id);
  }

  function openLineEditor(lineId: string) {
    setSelectedLineId(lineId);
    setModifiersModalOpen(true);
  }

  async function applyModifier(modifierId: string) {
    if (!project || !selectedLineId) return;
    const result = await api.applyV1ModifierToLine(selectedLineId, modifierId);
    setLines((prev) => prev.map((line) => (line.id === selectedLineId ? result.line : line)));
    setLineModifiers(await api.getV1LineModifiers(selectedLineId));
    await refreshTakeoff(project.id);
  }

  async function removeModifier(lineModifierId: string) {
    if (!project || !selectedLineId) return;
    const result = await api.removeV1LineModifier(selectedLineId, lineModifierId);
    setLines((prev) => prev.map((line) => (line.id === selectedLineId ? result.line : line)));
    setLineModifiers(await api.getV1LineModifiers(selectedLineId));
    await refreshTakeoff(project.id);
  }

  async function applyBundle(bundleId: string, roomId = activeRoomId) {
    if (!project || !roomId) return;
    const created = await api.applyV1Bundle(bundleId, project.id, roomId);
    setLines((prev) => [...prev, ...created]);
    await refreshTakeoff(project.id);
  }

  async function addDraftItems(items: Array<{
    roomId: string;
    description: string;
    unit: string;
    qty: number;
    notes: string;
    sourceType: 'catalog' | 'manual';
    sku?: string | null;
    category?: string | null;
    subcategory?: string | null;
    materialCost: number;
    laborMinutes: number;
    catalogItemId?: string | null;
  }>) {
    if (!project) return;

    const created = await Promise.all(items.map((item) => api.createV1TakeoffLine({
      projectId: project.id,
      roomId: item.roomId,
      sourceType: item.sourceType,
      sourceRef: item.sku || null,
      description: item.description,
      sku: item.sku || null,
      category: item.category || null,
      subcategory: item.subcategory || null,
      qty: item.qty,
      unit: item.unit,
      materialCost: item.materialCost,
      laborMinutes: item.laborMinutes,
      laborCost: 0,
      catalogItemId: item.catalogItemId || null,
      notes: item.notes,
    })));

    setLines((prev) => [...prev, ...created]);
    await refreshTakeoff(project.id);
  }

  function toBase64Payload(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = typeof reader.result === 'string' ? reader.result : '';
        const commaIndex = result.indexOf(',');
        if (commaIndex < 0) {
          reject(new Error('Invalid file payload.'));
          return;
        }
        resolve(result.slice(commaIndex + 1));
      };
      reader.onerror = () => reject(new Error('Failed to read file.'));
      reader.readAsDataURL(file);
    });
  }

  async function uploadProjectFile(file: File | undefined) {
    if (!project || !file) return;
    setFileUploading(true);
    try {
      const dataBase64 = await toBase64Payload(file);
      await api.uploadV1ProjectFile({
        projectId: project.id,
        fileName: file.name,
        mimeType: file.type || 'application/octet-stream',
        sizeBytes: file.size,
        dataBase64,
      });
      setProjectFiles(await api.getV1ProjectFiles(project.id));
    } catch (error: any) {
      window.alert(error.message || 'File upload failed.');
    } finally {
      setFileUploading(false);
    }
  }

  async function removeProjectFile(fileId: string) {
    if (!project) return;
    if (!window.confirm('Delete this project file?')) return;
    await api.deleteV1ProjectFile(project.id, fileId);
    setProjectFiles((prev) => prev.filter((file) => file.id !== fileId));
  }

  async function generateProposalDraft(mode: 'scope_summary' | 'proposal_text' | 'terms_and_conditions' | 'default_short') {
    if (!project || !settings || !summary) return;

    setProposalDrafting(mode);
    try {
      const draft = await api.generateV1ProposalDraft({
        mode,
        project,
        lines,
        summary,
        settings,
      });

      const updates = Object.entries(draft).filter(([, value]) => typeof value === 'string' && value.trim().length > 0) as Array<[keyof SettingsRecord, string]>;
      const wouldOverwrite = updates.some(([key, value]) => String(settings[key] || '').trim().length > 0 && String(settings[key]).trim() !== value.trim());

      if (wouldOverwrite && !window.confirm('This will replace existing proposal text in one or more fields. Continue?')) {
        return;
      }

      const next = { ...settings } as SettingsRecord;
      updates.forEach(([key, value]) => {
        (next as any)[key] = value;
      });

      setSettings(ensureProposalDefaults(next));
      setActiveTab('proposal');
    } catch (error: any) {
      window.alert(error.message || 'Unable to generate proposal draft right now.');
    } finally {
      setProposalDrafting(null);
    }
  }

  async function generateInstallReviewEmail() {
    if (!project || !summary || lines.length === 0) {
      window.alert('Add scope lines before generating install review email.');
      return;
    }
    setInstallReviewGenerating(true);
    try {
      const draft = await api.generateV1InstallReviewEmail(project.id);
      setInstallReviewDraft(draft);
      setActiveTab('proposal');
    } catch (error: any) {
      window.alert(error.message || 'Unable to generate install review email right now.');
    } finally {
      setInstallReviewGenerating(false);
    }
  }

  async function copyInstallReviewEmailBody() {
    if (!installReviewDraft) return;
    try {
      await navigator.clipboard.writeText(`Subject: ${installReviewDraft.subject}\n\n${installReviewDraft.body}`);
    } catch (_error) {
      window.alert('Unable to copy the install review email.');
    }
  }

  function resetProposalDefaults(scope: 'all' | 'intro' | 'terms' | 'exclusions' | 'clarifications' | 'acceptance') {
    if (!settings) return;

    const next = { ...settings };
    if (scope === 'all' || scope === 'intro') next.proposalIntro = DEFAULT_PROPOSAL_INTRO;
    if (scope === 'all' || scope === 'terms') next.proposalTerms = DEFAULT_PROPOSAL_TERMS;
    if (scope === 'all' || scope === 'exclusions') next.proposalExclusions = DEFAULT_PROPOSAL_EXCLUSIONS;
    if (scope === 'all' || scope === 'clarifications') next.proposalClarifications = DEFAULT_PROPOSAL_CLARIFICATIONS;
    if (scope === 'all' || scope === 'acceptance') next.proposalAcceptanceLabel = DEFAULT_PROPOSAL_ACCEPTANCE_LABEL;
    setSettings(ensureProposalDefaults(next));
  }

  if (loading) {
    return <div className="flex min-h-[40vh] items-center justify-center p-8 text-sm text-slate-500">Loading workspace…</div>;
  }

  if (workspaceLoadError) {
    return (
      <div className="ui-page flex min-h-[50vh] flex-col items-center justify-center gap-4 p-8 text-center">
        <p className="text-sm font-semibold text-slate-900">Could not open this project</p>
        <p className="max-w-md text-sm text-slate-600">{workspaceLoadError}</p>
        <p className="max-w-md text-xs text-slate-500">
          The project is still in your library unless it was deleted. Try again, or go back and open it from the list.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <button type="button" className="ui-btn-primary h-9 px-4 text-sm" onClick={() => id && void loadWorkspace(id)}>
            Retry
          </button>
          <button type="button" className="ui-btn-secondary h-9 px-4 text-sm" onClick={() => navigate('/projects')}>
            All projects
          </button>
        </div>
      </div>
    );
  }

  if (!project) {
    return <div className="flex min-h-[40vh] items-center justify-center p-8 text-sm text-slate-500">Loading workspace…</div>;
  }

  return (
    <div className="min-h-full bg-slate-50">
      <TopProjectHeader
        project={project}
        baseBidTotal={summary?.baseBidTotal || 0}
        syncState={syncState}
        lastSavedAt={lastSavedAt}
        onSave={saveProject}
        onPreviewProposal={previewProposal}
        onExport={exportProposal}
        onSubmitBid={submitBid}
        onDeleteProject={deleteProjectPermanently}
        statusActionLabel={statusActionLabel}
      />

      <div className="ui-page space-y-2">
        <p className="ui-label px-1">Project Workflow</p>
        <div className="ui-surface flex items-center gap-1 overflow-x-auto whitespace-nowrap p-1.5 shadow-sm">
          <button type="button" onClick={() => setActiveTab('overview')} className={`ui-wtab ${activeTab === 'overview' ? 'ui-wtab-blue' : 'ui-wtab-idle'}`}>Overview</button>
          <button type="button" onClick={() => setActiveTab('setup')} className={`ui-wtab ${activeTab === 'setup' ? 'ui-wtab-blue' : 'ui-wtab-idle'}`}>Project Setup</button>
          <button
            type="button"
            title="Manage rooms and line-item takeoff in one place. Use Estimate for dollars and rollups."
            onClick={() => setActiveTab('takeoff')}
            className={`ui-wtab ${activeTab === 'takeoff' ? 'ui-wtab-blue' : 'ui-wtab-idle'}`}
          >
            Rooms &amp; takeoff
          </button>
          <button
            type="button"
            title="Review dollars, labor stack, markups, and project totals after the takeoff is complete."
            onClick={() => setActiveTab('estimate')}
            className={`ui-wtab ${activeTab === 'estimate' ? 'ui-wtab-blue' : 'ui-wtab-idle'}`}
          >
            Estimate
          </button>
          <button type="button" onClick={() => setActiveTab('files')} className={`ui-wtab ${activeTab === 'files' ? 'ui-wtab-blue' : 'ui-wtab-idle'}`}>Files</button>
          <button type="button" onClick={() => setActiveTab('proposal')} className={`ui-wtab ${activeTab === 'proposal' ? 'ui-wtab-blue' : 'ui-wtab-idle'}`}>Proposal</button>
          <div className="ml-auto flex items-center gap-1.5 pl-2">
            <button onClick={() => void syncSheets()} className="ui-btn-secondary h-8 px-2.5 text-[11px] font-semibold">Sync</button>
          </div>
        </div>

        {activeTab === 'overview' && (
          <div className="mx-auto w-full max-w-[1600px] space-y-8">
            <header className="rounded-2xl border border-slate-200/70 bg-white px-5 py-5 shadow-sm">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Project overview</p>
              <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-900">Read-only snapshot</h2>
              <p className="mt-2 max-w-3xl text-sm text-slate-600">
                High-level context for this bid — same structure as Project Setup, without editing controls. Adjust details on the Setup tab.
              </p>
              <div className="mt-5 flex flex-wrap gap-x-8 gap-y-4 border-t border-slate-100 pt-5 text-sm">
                <div className="min-w-[140px]">
                  <p className="text-xs text-slate-500">Project</p>
                  <p className="mt-0.5 font-semibold text-slate-900">{project.projectName}</p>
                </div>
                <div className="min-w-[120px]">
                  <p className="text-xs text-slate-500">Client</p>
                  <p className="mt-0.5 font-semibold text-slate-900">{project.clientName || '—'}</p>
                </div>
                <div className="min-w-[140px]">
                  <p className="text-xs text-slate-500">Price mode</p>
                  <p className="mt-0.5 font-semibold text-slate-900">
                    {pricingMode === 'material_only' ? 'Material only' : pricingMode === 'labor_only' ? 'Install only' : 'Material + install'}
                  </p>
                </div>
                <div className="min-w-[100px]">
                  <p className="text-xs text-slate-500">Rooms</p>
                  <p className="mt-0.5 font-semibold text-slate-900">{rooms.length}</p>
                </div>
                <div className="min-w-[120px]">
                  <p className="text-xs text-slate-500">Scope tags</p>
                  <p className="mt-0.5 font-semibold text-slate-900">{selectedScopeCategories.length || scopeCategoryOptions.length || 0}</p>
                </div>
                <div className="min-w-[120px]">
                  <p className="text-xs text-slate-500">Bid total</p>
                  <p className="mt-0.5 font-semibold text-slate-900">{formatCurrencySafe(summary?.baseBidTotal)}</p>
                </div>
              </div>
            </header>

            <div className="grid grid-cols-1 gap-8 xl:grid-cols-[1fr_340px_280px] xl:items-start">
              <section className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-sm">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Section 1 · Project inputs</p>
                <h3 className="mt-1 text-lg font-semibold text-slate-900">Setup snapshot</h3>
                <p className="mt-2 text-sm text-slate-600">Labor basis, delivery posture, and what is in scope for catalog and takeoff.</p>

                <div className="mt-6 space-y-5">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <p className="text-xs font-medium text-slate-500">Labor basis</p>
                      <p className="mt-1 font-semibold text-slate-900">Union baseline</p>
                      <p className="mt-1 text-xs text-slate-500">Multiplier ×{formatNumberSafe(jobConditions.laborRateMultiplier, 2)}</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-slate-500">Delivery</p>
                      <p className="mt-1 font-semibold text-slate-900">
                        {jobConditions.deliveryQuotedSeparately
                          ? 'Travel priced separately'
                          : jobConditions.deliveryRequired
                            ? 'In scope'
                            : 'Not included'}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {jobConditions.deliveryQuotedSeparately && isMeaningfulTravelDistanceMiles(jobConditions.travelDistanceMiles)
                          ? `${formatNumberSafe(jobConditions.travelDistanceMiles, 1)} mi — not in estimate total`
                          : jobConditions.deliveryRequired
                            ? jobConditions.deliveryPricingMode === 'flat'
                              ? formatCurrencySafe(jobConditions.deliveryValue)
                              : jobConditions.deliveryPricingMode === 'percent'
                                ? `${formatNumberSafe(jobConditions.deliveryValue, 2)}% of base`
                                : 'No separate adder'
                            : 'No delivery allowance applied'}
                      </p>
                    </div>
                  </div>

                  <div>
                    <p className="text-xs font-medium text-slate-500">Scope categories</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {(selectedScopeCategories.length > 0 ? selectedScopeCategories : scopeCategoryOptions).slice(0, 16).map((category) => (
                        <span
                          key={category}
                          className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-700"
                        >
                          {category}
                        </span>
                      ))}
                      {selectedScopeCategories.length === 0 && scopeCategoryOptions.length === 0 ? (
                        <span className="text-xs text-slate-500">No catalog categories loaded yet.</span>
                      ) : null}
                    </div>
                  </div>

                  <div>
                    <p className="text-xs font-medium text-slate-500">Rooms / areas</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {rooms.slice(0, 12).map((room) => (
                        <span
                          key={room.id}
                          className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-700"
                        >
                          {room.roomName}
                        </span>
                      ))}
                      {rooms.length === 0 ? <span className="text-xs text-slate-500">No rooms yet.</span> : null}
                    </div>
                  </div>
                </div>
              </section>

              <section className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-sm">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Pricing rollups</p>
                <h3 className="mt-1 text-lg font-semibold text-slate-900">Conditions &amp; adders</h3>
                <p className="mt-2 text-sm text-slate-600">How job conditions and project adders flow into labor dollars.</p>

                <dl className="mt-6 space-y-4 text-sm">
                  <div className="flex items-baseline justify-between gap-3 border-b border-slate-100 pb-3">
                    <dt className="text-slate-500">Condition labor mult.</dt>
                    <dd className="font-semibold tabular-nums text-slate-900">×{formatNumberSafe(summary?.conditionLaborMultiplier || 1, 2)}</dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-3 border-b border-slate-100 pb-3">
                    <dt className="text-slate-500">Condition adjustment</dt>
                    <dd className="font-semibold tabular-nums text-slate-900">{formatCurrencySafe(summary?.conditionAdjustmentAmount)}</dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-3 border-b border-slate-100 pb-3">
                    <dt className="text-slate-500">Project adder %</dt>
                    <dd className="font-semibold tabular-nums text-slate-900">{formatNumberSafe(jobConditions.estimateAdderPercent, 2)}%</dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-3">
                    <dt className="text-slate-500">Project adder $</dt>
                    <dd className="font-semibold tabular-nums text-slate-900">{formatCurrencySafe(jobConditions.estimateAdderAmount)}</dd>
                  </div>
                </dl>

                <div className="mt-6 border-t border-slate-100 pt-4">
                  <p className="text-xs font-medium text-slate-500">Special notes</p>
                  <p className="mt-2 text-sm text-slate-700 whitespace-pre-wrap">
                    {project.specialNotes?.trim() || 'No project-wide notes yet.'}
                  </p>
                </div>
              </section>

              <aside className="space-y-4 xl:sticky xl:top-[88px]">
                <section className="rounded-2xl border border-slate-200/70 bg-white p-4 shadow-sm">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Active assumptions</p>
                  {(summary?.conditionAssumptions || []).length > 0 ? (
                    <div className="mt-2 max-h-56 space-y-1.5 overflow-auto pr-1 text-xs text-slate-700">
                      {(summary?.conditionAssumptions || []).slice(0, 14).map((assumption) => (
                        <p key={assumption} className="leading-4">
                          — {assumption}
                        </p>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-2 text-xs text-slate-500">No project-level assumptions are active.</p>
                  )}
                </section>
                <section className="rounded-2xl border border-dashed border-slate-300/80 bg-slate-50/80 p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Next step</p>
                  <p className="mt-2 text-xs text-slate-600">Refine inputs and defaults on Project Setup before locking the estimate.</p>
                  <button type="button" onClick={() => setActiveTab('setup')} className="ui-btn-secondary mt-3 h-9 w-full text-[11px] font-semibold">
                    Open Project Setup
                  </button>
                </section>
              </aside>
            </div>
          </div>
        )}

        {activeTab === 'setup' && (
          <div className="mx-auto grid w-full max-w-[1600px] grid-cols-1 gap-8 xl:grid-cols-[1fr_300px] items-start">
            <ProjectSetupWorkspace
              project={project}
              setProject={setProject}
              jobConditions={jobConditions}
              patchJobConditions={patchJobConditions}
              showMaterial={showMaterial}
              scopeCategoryOptions={scopeCategoryOptions}
              selectedScopeCategories={selectedScopeCategories}
              toggleScopeCategory={toggleScopeCategory}
              rooms={rooms}
              setActiveTab={setActiveTab}
              summary={summary}
              settings={settings}
              distanceError={distanceError}
              distanceCalculating={distanceCalculating}
            />

            <aside className="space-y-4 xl:sticky xl:top-[88px]">
              <section className="rounded-2xl border border-slate-200/70 bg-white p-4 shadow-sm">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">At a glance</p>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-lg border border-slate-100 bg-slate-50/80 px-2.5 py-2">
                    <p className="text-slate-500">Installers</p>
                    <p className="font-semibold text-slate-900">{jobConditions.installerCount}</p>
                  </div>
                  <div className="rounded-lg border border-slate-100 bg-slate-50/80 px-2.5 py-2">
                    <p className="text-slate-500">Distance</p>
                    <p className="font-semibold text-slate-900">{jobConditions.travelDistanceMiles !== null ? `${formatNumberSafe(jobConditions.travelDistanceMiles, 1)} mi` : '—'}</p>
                  </div>
                  <div className="rounded-lg border border-slate-100 bg-slate-50/80 px-2.5 py-2">
                    <p className="text-slate-500">Labor mult.</p>
                    <p className="font-semibold text-slate-900">×{formatNumberSafe(summary?.conditionLaborMultiplier || 1, 2)}</p>
                  </div>
                  <div className="rounded-lg border border-slate-100 bg-slate-50/80 px-2.5 py-2">
                    <p className="text-slate-500">Cond. adj.</p>
                    <p className="font-semibold text-slate-900">{formatCurrencySafe(summary?.conditionAdjustmentAmount)}</p>
                  </div>
                  <div className="col-span-2 rounded-lg border border-slate-100 bg-slate-50/80 px-2.5 py-2">
                    <p className="text-slate-500">Adjusted labor subtotal</p>
                    <p className="font-semibold text-slate-900">{formatCurrencySafe(summary?.adjustedLaborSubtotal)}</p>
                  </div>
                </div>
              </section>

              <section className="rounded-2xl border border-slate-200/70 bg-white p-4 shadow-sm">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Active assumptions</p>
                {(summary?.conditionAssumptions || []).length > 0 ? (
                  <div className="mt-2 max-h-48 space-y-1.5 overflow-auto pr-1 text-xs text-slate-700">
                    {(summary?.conditionAssumptions || []).slice(0, 12).map((assumption) => (
                      <p key={assumption} className="leading-4">— {assumption}</p>
                    ))}
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-slate-500">No project-level assumptions are active.</p>
                )}
              </section>

              <section className="rounded-2xl border border-slate-200/70 bg-white p-4 shadow-sm">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Scope included</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {selectedScopeCategories.length > 0 ? (
                    selectedScopeCategories.map((category) => (
                      <span key={category} className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-700">
                        {category}
                      </span>
                    ))
                  ) : (
                    <p className="text-xs text-slate-500">No categories selected yet.</p>
                  )}
                </div>
              </section>

              <section className="rounded-2xl border border-slate-200/70 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Proposal</p>
                  <button type="button" onClick={() => setActiveTab('proposal')} className="text-[11px] font-medium text-blue-700 hover:text-blue-800">
                    Open
                  </button>
                </div>
                <p className="mt-2 text-xs text-slate-600">Review wording and assumptions before export.</p>
              </section>

              <section className="rounded-2xl border border-slate-200/70 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Rooms</p>
                    <p className="mt-1 text-xs text-slate-600">Organize scope by area on Rooms &amp; takeoff.</p>
                  </div>
                  <button type="button" onClick={() => setActiveTab('takeoff')} className="ui-btn-secondary h-8 shrink-0 px-2.5 text-[11px] font-semibold">
                    Open
                  </button>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {rooms.slice(0, 6).map((room) => (
                    <span key={room.id} className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-700">
                      {room.roomName}
                    </span>
                  ))}
                  {rooms.length > 6 ? (
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-500">+{rooms.length - 6} more</span>
                  ) : null}
                </div>
              </section>
            </aside>
          </div>
        )}

        {activeTab === 'takeoff' && (
          <div className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-[minmax(260px,300px)_1fr]">
            <RoomManager
              rooms={rooms}
              activeRoomId={activeRoomId}
              onSelectRoom={selectWorkspaceRoom}
              onOpenCreateRoom={openCreateRoomModal}
              onRenameRoom={(room) => void renameRoom(room)}
              onDuplicateRoom={(room) => void duplicateRoom(room)}
              onDeleteRoom={(room) => void deleteRoom(room)}
            />
            <div className="min-w-0 space-y-2">
              <div className="ui-panel-muted px-3 py-2.5">
                <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="text-xs font-semibold text-slate-900">Rooms &amp; takeoff</span>
                    <span className="ui-typo-muted font-medium text-slate-600">
                      Qty here ·{' '}
                      <button
                        type="button"
                        onClick={() => setActiveTab('estimate')}
                        className="font-semibold text-blue-800 underline decoration-slate-300 underline-offset-2 hover:text-blue-950"
                      >
                        Estimate
                      </button>{' '}
                      for $
                    </span>
                    <span className="hidden h-3 w-px bg-slate-200 lg:inline" aria-hidden />
                    <span className="rounded-md border border-slate-200/90 bg-white px-2 py-0.5 text-[11px] font-medium tabular-nums text-slate-700">
                      {takeoffViewStats.lineCount} ln
                    </span>
                    <span className="rounded-md border border-slate-200/90 bg-white px-2 py-0.5 text-[11px] font-medium tabular-nums text-slate-700">
                      {formatNumberSafe(takeoffViewStats.totalQty, 1)} qty
                    </span>
                    <span className="rounded-md border border-slate-200/90 bg-white px-2 py-0.5 text-[11px] font-medium tabular-nums text-slate-700">
                      {formatLaborDurationMinutes(takeoffViewStats.laborMinutes)}
                    </span>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setActiveTab('estimate')}
                      className="ui-btn-secondary inline-flex h-8 items-center gap-1 rounded-md px-2.5 text-xs font-semibold"
                    >
                      Estimate <ArrowRight className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void addManualLine()}
                      disabled={!activeRoomId}
                      className="ui-btn-primary inline-flex h-8 items-center gap-1 rounded-md px-2.5 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Sparkles className="h-3 w-3" /> Add line
                    </button>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                  <label className="block min-w-0 flex-1 text-xs font-medium text-slate-700">
                    <span className="mb-0.5 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">View</span>
                    <select
                      className="ui-input h-9 w-full max-w-md text-xs font-medium text-slate-900"
                      value={takeoffRoomFilter}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v === TAKEOFF_ALL_ROOMS) setTakeoffRoomFilter(TAKEOFF_ALL_ROOMS);
                        else selectWorkspaceRoom(v);
                      }}
                    >
                      <option value={TAKEOFF_ALL_ROOMS}>
                        All rooms ({lines.length} line{lines.length === 1 ? '' : 's'})
                      </option>
                      {rooms.map((room) => {
                        const metric = roomMetrics[room.id] || { count: 0, subtotal: 0, totalQty: 0, laborMinutes: 0 };
                        return (
                          <option key={room.id} value={room.id}>
                            {room.roomName} ({metric.count} ln)
                          </option>
                        );
                      })}
                    </select>
                  </label>
                  <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                    <button type="button" onClick={() => setCatalogOpen(true)} className="ui-btn-primary inline-flex h-8 items-center gap-1 rounded-md px-2.5 text-xs font-semibold">
                      Catalog
                    </button>
                    <button type="button" onClick={() => setBundleModalOpen(true)} className="ui-btn-secondary h-8 rounded-md px-2.5 text-xs font-medium">
                      Bundles
                    </button>
                  </div>
                </div>
                {takeoffRoomFilter === TAKEOFF_ALL_ROOMS ? (
                  <p className="text-xs leading-snug text-slate-500">
                    <span className="font-medium text-slate-700">Combined across rooms:</span> lines that match the same catalog item or SKU are rolled into one row (qty and install time are summed). Room names are listed under each item.{' '}
                    <span className="text-slate-600">
                      New lines and bundles still go to the room selected in the left sidebar (
                      <span className="font-medium text-slate-800">{roomNamesById[activeRoomId] || 'select a room'}</span>
                      ). Use a single room in the view menu to edit or delete a specific line.
                    </span>
                  </p>
                ) : null}

                <EstimateGrid
                  lines={takeoffGridLines}
                  rooms={rooms}
                  categories={categories}
                  roomNamesById={roomNamesById}
                  pricingMode={pricingMode}
                  viewMode="takeoff"
                  organizeBy={takeoffRoomFilter === TAKEOFF_ALL_ROOMS ? 'item' : 'room'}
                  takeoffShowRoom={takeoffRoomFilter === TAKEOFF_ALL_ROOMS}
                  laborMultiplier={summary?.conditionLaborMultiplier || 1}
                  selectedLineId={selectedLineId}
                  onSelectLine={openLineEditor}
                  onPersistLine={(lineId, updates) => void persistLine(lineId, updates)}
                  onDeleteLine={(lineId) => void deleteLine(lineId)}
                />
              </div>
            </div>
          </div>
        )}

        {activeTab === 'estimate' && (
          <div className="flex min-w-0 flex-col gap-1">
              <div className="ui-panel-muted px-3 py-2 sm:py-2.5">
                <div className="grid gap-3 sm:gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
                  <div className="min-w-0">
                    <h2 className="ui-typo-page-title">Estimate</h2>
                    <p className="ui-typo-body mt-1 max-w-3xl">
                      <span className="font-semibold text-slate-800">{roomNamesById[activeRoomId] || 'Unassigned'}</span>
                      <span className="text-slate-500"> — pricing this room&apos;s lines. Quantities and scope come from </span>
                      <button
                        type="button"
                        onClick={() => setActiveTab('takeoff')}
                        className="font-semibold text-blue-800 underline decoration-blue-300/70 underline-offset-2 hover:text-blue-950"
                      >
                        Takeoff
                      </button>
                      <span className="text-slate-500">.</span>
                    </p>
                  </div>
                  <div className="w-full shrink-0 rounded-lg border border-slate-200/90 bg-white px-3 py-2 shadow-sm sm:min-w-[220px] lg:w-auto">
                    <p className="ui-label !normal-case tracking-wide text-slate-500">Project total</p>
                    <p className="text-lg font-semibold tabular-nums tracking-tight text-slate-950">{formatCurrencySafe(summary?.baseBidTotal)}</p>
                    <div className="mt-1.5 flex flex-wrap items-center justify-between gap-x-2 gap-y-1 border-t border-slate-200/80 pt-1.5 text-xs text-slate-600">
                      <span>
                        This room{' '}
                        <span className="font-semibold tabular-nums text-slate-900">{formatCurrencySafe(roomSubtotal)}</span>
                      </span>
                      <span className="tabular-nums text-right" title="Project labor time (after multipliers)">
                        <span className="font-semibold text-slate-900">{formatNumberSafe(summary?.totalLaborHours || 0, 1)} hr</span>
                        <span className="text-slate-400"> · </span>
                        <span>{formatNumberSafe(Math.round(summary?.totalLaborMinutes ?? (summary?.totalLaborHours || 0) * 60), 0)} min</span>
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-slate-200/80 bg-white p-2.5 shadow-sm">
                <div className="grid gap-3 lg:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] lg:items-start lg:gap-5">
                  <div className="flex min-w-0 gap-2">
                    <div
                      className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-white"
                      style={{ background: 'var(--brand)' }}
                    >
                      <Gauge className="h-3.5 w-3.5" aria-hidden />
                    </div>
                    <div className="min-w-0">
                      <p className="ui-label !normal-case tracking-wide text-slate-500">Labor rate (sub)</p>
                      <p className="mt-0.5 text-base font-semibold tabular-nums tracking-tight text-slate-950">
                        {formatCurrencySafe(effectiveLaborCostPerHour)}
                        <span className="text-sm font-semibold text-slate-600">/hr</span>
                        <span className="ml-1.5 text-xs font-medium text-slate-500">effective</span>
                      </p>
                      <p className="mt-1 text-xs text-slate-600">
                        Base <span className="font-semibold tabular-nums text-slate-900">{formatCurrencySafe(baseLaborRatePerHour)}/hr</span>
                        <span className="text-slate-400"> · </span>
                        ×<span className="font-semibold tabular-nums text-slate-900">{formatNumberSafe(laborCostMultiplier, 2)}</span> cost
                      </p>
                      {Math.abs(laborHoursMultiplier - 1) > 0.001 ? (
                        <p className="ui-callout mt-2 border-blue-200/50 bg-blue-50/60 text-slate-800">
                          Time multiplier <span className="font-semibold tabular-nums text-slate-900">×{formatNumberSafe(laborHoursMultiplier, 2)}</span>{' '}
                          (hours, separate from $/hr).
                        </p>
                      ) : (
                        <p className="ui-typo-muted mt-0.5">Labor time ×1.00 (no schedule multiplier).</p>
                      )}
                    </div>
                  </div>
                  <div className="min-w-0 rounded-lg border border-slate-200 bg-slate-50/90 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-slate-800">Project condition notes</p>
                      <button
                        type="button"
                        onClick={() => setActiveTab('setup')}
                        className="text-xs font-semibold text-blue-700 hover:text-blue-800"
                      >
                        Edit in Setup
                      </button>
                    </div>
                    {laborRateModifiersActive ? (
                      <p className="mt-2 text-xs leading-relaxed text-slate-600">
                        Multipliers above come from job conditions (e.g. labor factor, night work, floors, adders).
                      </p>
                    ) : null}
                    {(summary?.conditionAssumptions?.length || 0) > 0 ? (
                      <ul className="mt-2 list-disc space-y-2 pl-5 text-sm leading-relaxed text-slate-700">
                        {(summary?.conditionAssumptions || []).map((line, idx) => (
                          <li key={idx}>{line}</li>
                        ))}
                      </ul>
                    ) : laborRateModifiersActive ? (
                      <p className="mt-2 text-sm leading-relaxed text-slate-600">Adjust job conditions in Setup to see narrative notes here.</p>
                    ) : (
                      <p className="mt-2 text-sm leading-relaxed text-slate-600">
                        Turn on job conditions in Setup if this job needs productivity or cost adjustments.
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <div className="ui-panel space-y-2 p-2 sm:p-2.5">
                <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-200/80 pb-1.5">
                    <button onClick={() => setCatalogOpen(true)} className="ui-btn-primary inline-flex h-8 items-center gap-1 rounded-md px-2.5 text-[11px] font-semibold">
                      <Sparkles className="h-3 w-3" /> Bulk add
                    </button>
                    <button onClick={() => setBundleModalOpen(true)} className="ui-btn-secondary h-8 rounded-md px-2.5 text-[11px] font-medium">Bundle</button>
                    <button onClick={() => setModifiersModalOpen(true)} disabled={!selectedLine} className="ui-btn-secondary h-8 rounded-md px-2.5 text-[11px] font-medium disabled:opacity-50">Edit line</button>
                    <button onClick={() => setActiveTab('proposal')} className="ui-btn-secondary h-8 rounded-md px-2.5 text-[11px] font-medium inline-flex items-center gap-0.5">Proposal <ArrowRight className="h-3 w-3" /></button>
                </div>

                <div>
                  <div className="mb-1.5 flex flex-col gap-1.5 sm:flex-row sm:items-end sm:justify-between">
                    <p className="text-xs font-medium text-slate-700">Room · one at a time</p>
                    <div className="ui-panel-muted px-3 py-1.5 text-right">
                      <p className="ui-label !normal-case tracking-wide text-slate-500">Room total</p>
                      <p className="text-base font-semibold tabular-nums text-slate-900">{formatCurrencySafe(roomSubtotal)}</p>
                    </div>
                  </div>
                  <div className="flex min-w-0 gap-1.5 overflow-x-auto pb-0.5">
                    {rooms.map((room) => {
                      const active = room.id === activeRoomId;
                      const metric = roomMetrics[room.id] || { count: 0, subtotal: 0, totalQty: 0, laborMinutes: 0 };
                      return (
                        <button
                          key={room.id}
                          onClick={() => selectWorkspaceRoom(room.id)}
                          title={`${metric.count} lines · ${formatCurrencySafe(metric.subtotal)}`}
                          className={`shrink-0 rounded-lg px-3 py-2 text-left transition-all ${
                            active
                              ? 'text-white shadow-md ring-1 ring-blue-900/30'
                              : 'bg-white text-slate-800 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50'
                          }`}
                          style={active ? { background: 'var(--brand)' } : undefined}
                        >
                          <div className="min-w-[118px]">
                            <div className={`text-xs font-semibold ${active ? 'text-white' : 'text-slate-900'}`}>{room.roomName}</div>
                            <div className={`mt-0.5 flex items-center justify-between text-[10px] ${active ? 'text-slate-200' : 'text-slate-500'}`}>
                              <span>{metric.count} lines</span>
                              <span className="tabular-nums font-medium">{formatCurrencySafe(metric.subtotal)}</span>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="flex flex-col gap-2 lg:flex-row lg:items-stretch lg:gap-3">
                  <div className="min-w-0 flex-1">
                  <p className="ui-label mb-1 px-0.5 !normal-case text-slate-600">Rollup</p>
                  <div className="-mx-0.5 flex gap-2 overflow-x-auto pb-1 pt-0.5 [scrollbar-width:thin]">
                    <div className={`min-w-[9.25rem] shrink-0 rounded-lg p-2 shadow-sm ring-1 ${showMaterial ? 'bg-white ring-slate-200/80' : 'bg-slate-50 opacity-50 ring-slate-200/80'}`}><div className="flex items-center justify-between gap-1"><p className="text-[10px] font-semibold text-slate-600">Material</p><Wallet className="h-3.5 w-3.5 shrink-0 text-slate-400" /></div><p className="mt-1 text-sm font-semibold tabular-nums text-slate-950">{formatCurrencySafe(summary?.materialLoadedSubtotal ?? summary?.materialSubtotal)}</p><p className="mt-0.5 text-[10px] leading-snug text-slate-500">Tax + mat O&amp;P</p></div>
                    <div
                      className={`min-w-[9.25rem] shrink-0 rounded-lg p-2 shadow-sm ring-1 ${
                        showLabor || (pricingMode === 'material_only' && (summary?.laborCompanionProposalTotal ?? 0) > 0)
                          ? 'bg-white ring-slate-200/80'
                          : 'bg-slate-50 opacity-50 ring-slate-200/80'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <p className="text-[10px] font-semibold text-slate-600">{pricingMode === 'material_only' ? 'Sub labor' : 'Labor'}</p>
                        <Hammer className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                      </div>
                      <p className="mt-1 text-sm font-semibold tabular-nums text-slate-950">
                        {formatCurrencySafe(
                          showLabor
                            ? summary?.laborLoadedSubtotal ?? summary?.adjustedLaborSubtotal ?? summary?.laborSubtotal
                            : summary?.laborCompanionProposalTotal ?? 0
                        )}
                      </p>
                      <p className="mt-0.5 text-[10px] leading-snug text-slate-500">
                        {showLabor ? 'Burden + labor O&amp;P' : 'Not in mat. total'}
                      </p>
                    </div>
                    <div className="min-w-[9.25rem] shrink-0 rounded-lg bg-white p-2 shadow-sm ring-1 ring-slate-200/80">
                      <div className="flex items-center justify-between gap-1">
                        <p className="text-[10px] font-semibold text-slate-600">Markup + tax</p>
                        <Sparkles className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                      </div>
                      <p className="mt-1 text-sm font-semibold tabular-nums text-slate-950">
                        {formatCurrencySafe(
                          (summary?.taxAmount || 0) +
                            (summary?.overheadAmount || 0) +
                            (summary?.profitAmount || 0) +
                            (summary?.burdenAmount || 0) +
                            (summary?.laborOverheadAmount || 0) +
                            (summary?.laborProfitAmount || 0) +
                            (summary?.subLaborManagementFeeAmount || 0)
                        )}
                      </p>
                      <p className="mt-0.5 text-[10px] text-slate-500">Stack</p>
                    </div>
                    <div className="min-w-[10rem] shrink-0 rounded-lg bg-white p-2 shadow-sm ring-1 ring-slate-200/80">
                      <div className="flex items-center justify-between gap-1">
                        <p className="text-[10px] font-semibold text-slate-600">Labor time</p>
                        <Clock3 className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                      </div>
                      <p className="mt-1 text-sm font-semibold tabular-nums text-slate-950">{formatNumberSafe(summary?.totalLaborHours || 0, 1)} hr</p>
                      <p className="mt-0.5 text-[10px] font-medium tabular-nums text-slate-600">{formatNumberSafe(Math.round(summary?.totalLaborMinutes ?? (summary?.totalLaborHours || 0) * 60), 0)} min</p>
                      <p className="mt-0.5 text-[9px] leading-snug text-slate-500">
                        After mult. · {formatNumberSafe(summary?.productiveCrewHoursPerDay ?? jobConditions.installerCount * 8, 1)} crew-hr/d
                      </p>
                    </div>
                    <div className="min-w-[7.5rem] shrink-0 rounded-lg bg-white p-2 shadow-sm ring-1 ring-slate-200/80">
                      <div className="flex items-center justify-between gap-1">
                        <p className="text-[10px] font-semibold text-slate-600">Days</p>
                        <CalendarClock className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                      </div>
                      <p className="mt-1 text-sm font-semibold tabular-nums text-slate-950">{formatNumberSafe(summary?.durationDays || 0, 0)}</p>
                      <p className="mt-0.5 text-[10px] text-slate-500">Field</p>
                    </div>
                    <div className="min-w-[9.5rem] shrink-0 rounded-lg border-2 border-blue-200/80 bg-[var(--brand-soft)] p-2 shadow-sm ring-1 ring-blue-200/60">
                      <div className="flex items-center justify-between gap-1">
                        <p className="text-[10px] font-semibold text-[var(--brand-strong)]">Grand total</p>
                        <Calculator className="h-3.5 w-3.5 shrink-0 text-blue-700/80" />
                      </div>
                      <p className="mt-1 text-sm font-semibold tabular-nums text-slate-950">{formatCurrencySafe(summary?.baseBidTotal)}</p>
                      <p className="mt-0.5 text-[10px] text-slate-600">Room {formatCurrencySafe(roomSubtotal)}</p>
                    </div>
                  </div>
                  </div>

                  <div className="flex shrink-0 flex-wrap content-start items-center gap-1.5 border-t border-slate-200/70 pt-2 text-[11px] text-slate-600 lg:max-w-[14rem] lg:border-l lg:border-t-0 lg:pl-3 lg:pt-0 xl:max-w-none xl:flex-nowrap">
                    <span className="rounded-full bg-slate-50 px-2 py-1 font-medium ring-1 ring-slate-200/80">{activeRoomLines.length} lines</span>
                    <span className="rounded-full bg-slate-50 px-2 py-1 font-medium ring-1 ring-slate-200/80">{selectedScopeCategories.length || categories.filter((category) => category !== 'all').length} categories</span>
                    {selectedLine ? (
                      <span className="max-w-[min(100%,20rem)] truncate rounded-full bg-blue-50 px-2 py-1 font-medium text-blue-900 ring-1 ring-blue-200/80">{selectedLine.description}</span>
                    ) : (
                      <span className="rounded-full bg-slate-50 px-2 py-1 font-medium ring-1 ring-slate-200/80">Select a row</span>
                    )}
                    {(summary?.conditionAssumptions?.length || 0) > 0 ? (
                      <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-100 px-2 py-1 text-xs font-medium text-slate-800">
                        <Layers3 className="h-3.5 w-3.5 text-slate-500" /> {summary?.conditionAssumptions?.length}
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>

              <EstimateGrid
                lines={activeRoomLines}
                rooms={rooms}
                categories={categories}
                roomNamesById={roomNamesById}
                pricingMode={pricingMode}
                viewMode="estimate"
                organizeBy="room"
                laborMultiplier={summary?.conditionLaborMultiplier || 1}
                selectedLineId={selectedLineId}
                onSelectLine={openLineEditor}
                onPersistLine={(lineId, updates) => void persistLine(lineId, updates)}
                onDeleteLine={(lineId) => void deleteLine(lineId)}
              />
          </div>
        )}

        {activeTab === 'files' && (
          <div className="space-y-4">
            <section className="overflow-hidden rounded-[20px] border border-slate-200/80 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="max-w-3xl">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Project Files</p>
                  <h3 className="mt-1 text-xl font-semibold tracking-tight text-slate-950">Keep source files with this project</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">Upload takeoff sheets, drawings, and scope documents.</p>
                </div>
                <label className="ui-btn-primary inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-full px-5 text-[11px] font-semibold">
                  <FileUp className="h-4 w-4" />
                  {fileUploading ? 'Uploading...' : 'Upload File'}
                  <input type="file" className="hidden" onChange={(e) => void uploadProjectFile(e.target.files?.[0])} disabled={fileUploading} />
                </label>
              </div>

              <div className="mt-4 grid gap-2.5 sm:grid-cols-3">
                <div className="rounded-[14px] bg-white p-3 shadow-sm ring-1 ring-slate-200/80">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Files Stored</p>
                  <p className="mt-1 text-[22px] font-semibold tracking-[-0.03em] text-slate-950">{projectFiles.length}</p>
                  <p className="mt-1 text-[10px] text-slate-500">Project reference set</p>
                </div>
                <div className="rounded-[14px] bg-white p-3 shadow-sm ring-1 ring-slate-200/80">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Latest Upload</p>
                  <p className="mt-2 truncate text-sm font-semibold text-slate-950">{projectFiles[0]?.fileName || 'No uploads yet'}</p>
                  <p className="mt-1 text-[11px] text-slate-600">{projectFiles[0] ? new Date(projectFiles[0].createdAt).toLocaleString() : 'Add your first source file to start building the project record.'}</p>
                </div>
                <div className="rounded-[14px] bg-white p-3 shadow-sm ring-1 ring-slate-200/80">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Suggested Use</p>
                  <p className="mt-2 text-sm font-semibold text-slate-950">Import source + proposal backup</p>
                  <p className="mt-1 text-[11px] text-slate-600">Keep parser inputs, markups, and client-facing support files in one place.</p>
                </div>
              </div>
            </section>

            <section className="overflow-hidden rounded-[20px] border border-slate-200/80 bg-white shadow-sm">
              {projectFiles.length === 0 ? (
                <div className="px-6 py-10 text-center">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
                    <Paperclip className="h-6 w-6" />
                  </div>
                  <h4 className="mt-4 text-base font-semibold text-slate-900">No project files yet</h4>
                  <p className="mt-2 text-sm text-slate-500">Upload takeoff sheets, reference drawings, scope docs, or proposal support material to keep this estimate self-contained.</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {projectFiles.map((file) => (
                    <div key={file.id} className="flex flex-wrap items-center justify-between gap-4 px-5 py-4 hover:bg-slate-50/70">
                      <div className="min-w-0 flex-1">
                        <div className="inline-flex max-w-full items-center gap-2 rounded-full bg-slate-100 px-3 py-1.5 text-[11px] font-medium text-slate-600">
                          <Paperclip className="h-3.5 w-3.5" />
                          <span className="truncate">{file.fileName}</span>
                        </div>
                        <div className="mt-3 grid gap-2 text-[11px] text-slate-500 sm:grid-cols-3">
                          <span>Type: {file.mimeType}</span>
                          <span>Size: {formatKilobytesSafe(file.sizeBytes)}</span>
                          <span>Uploaded: {new Date(file.createdAt).toLocaleString()}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <a
                          href={api.getV1ProjectFileDownloadUrl(project.id, file.id)}
                          className="inline-flex h-9 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3.5 text-[11px] font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
                        >
                          <Download className="h-3.5 w-3.5" />
                          Download
                        </a>
                        <button
                          onClick={() => void removeProjectFile(file.id)}
                          className="inline-flex h-9 items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-3.5 text-[11px] font-semibold text-red-700 shadow-sm hover:bg-red-100"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}

        {activeTab === 'proposal' && (
          <div className="space-y-4">
            <section className="ui-surface overflow-hidden p-4 sm:p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <p className="ui-label">Client proposal</p>
                  <h3 className="ui-title mt-1 text-[22px] sm:text-[26px]">Review, edit, export</h3>
                  <p className="ui-subtitle mt-2 max-w-xl">
                    The preview matches print and export. Edit wording in the left column; optional AI tools stay tucked away below.
                  </p>
                </div>
                <div className="flex flex-shrink-0 flex-wrap items-center gap-2 lg:justify-end">
                  <button
                    type="button"
                    onClick={() => void saveProposalWording()}
                    className="ui-btn-secondary inline-flex h-9 items-center justify-center rounded-full px-4 text-[11px] font-semibold"
                  >
                    Save edits
                  </button>
                  <button
                    type="button"
                    onClick={() => void printProposalDocument()}
                    className="ui-btn-secondary inline-flex h-9 items-center justify-center rounded-full px-4 text-[11px] font-semibold"
                  >
                    Print
                  </button>
                  <button
                    type="button"
                    onClick={exportProposal}
                    className="ui-btn-primary inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-[11px] font-semibold"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Export
                  </button>
                </div>
              </div>

              <div className="mt-5 grid gap-2.5 sm:grid-cols-3">
                <div className="rounded-xl bg-slate-50/90 p-3 ring-1 ring-slate-200/70">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Proposal total</p>
                  <p className="mt-1 text-xl font-semibold tracking-tight text-slate-950 tabular-nums">{formatCurrencySafe(summary?.baseBidTotal)}</p>
                  <p className="mt-1 text-[10px] text-slate-500">From current estimate</p>
                </div>
                <div className="rounded-xl bg-slate-50/90 p-3 ring-1 ring-slate-200/70">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Included lines</p>
                  <p className="mt-1 text-xl font-semibold tracking-tight text-slate-950 tabular-nums">{lines.length}</p>
                  <p className="mt-1 text-[10px] text-slate-500">In this bid</p>
                </div>
                <div className="rounded-xl bg-slate-50/90 p-3 ring-1 ring-slate-200/70">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Duration (est.)</p>
                  <p className="mt-1 text-xl font-semibold tracking-tight text-slate-950 tabular-nums">
                    {summary?.durationDays != null && summary.durationDays > 0
                      ? `${formatNumberSafe(summary.durationDays, 1)} d`
                      : '—'}
                  </p>
                  <p className="mt-1 text-[10px] text-slate-500">Schedule model</p>
                </div>
              </div>

              <label className="mt-4 block max-w-md">
                <span className="text-[11px] font-medium text-slate-700">Proposal layout</span>
                <select
                  className="ui-input mt-1.5 h-10 w-full"
                  value={project.proposalFormat || 'standard'}
                  onChange={(e) =>
                    setProject((prev) =>
                      prev ? { ...prev, proposalFormat: e.target.value as ProjectRecord['proposalFormat'] } : prev
                    )
                  }
                >
                  {PROPOSAL_FORMAT_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value} title={opt.hint}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <span className="mt-1 block text-[10px] text-slate-500">
                  {PROPOSAL_FORMAT_OPTIONS.find((o) => o.value === (project.proposalFormat || 'standard'))?.hint}
                </span>
              </label>
            </section>

            <details className="ui-surface group overflow-hidden open:shadow-md [&_summary::-webkit-details-marker]:hidden">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5 text-left hover:bg-slate-50/80 sm:px-5">
                <div className="flex min-w-0 items-center gap-2.5">
                  <span
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ring-1 ring-blue-200/70"
                    style={{ background: 'color-mix(in srgb, var(--brand) 12%, white)', color: 'var(--brand-strong)' }}
                  >
                    <Sparkles className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-slate-900">AI writing assist</p>
                    <p className="text-[11px] text-slate-500">Optional — confirms before replacing existing text</p>
                  </div>
                </div>
                <ChevronDown className="h-4 w-4 shrink-0 text-slate-400 transition group-open:rotate-180" />
              </summary>
              <div className="border-t border-slate-200/80 px-4 pb-4 pt-1 sm:px-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                  <button
                    type="button"
                    onClick={() => void generateProposalDraft('scope_summary')}
                    disabled={proposalDrafting !== null}
                    className="inline-flex h-9 flex-1 items-center justify-center rounded-full border border-slate-200 bg-white px-4 text-[11px] font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50 sm:min-w-[10rem]"
                  >
                    {proposalDrafting === 'scope_summary' ? 'Generating…' : 'Scope summary'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void generateProposalDraft('default_short')}
                    disabled={proposalDrafting !== null}
                    className="inline-flex h-9 flex-1 items-center justify-center rounded-full border border-slate-200 bg-white px-4 text-[11px] font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50 sm:min-w-[10rem]"
                  >
                    {proposalDrafting === 'default_short' ? 'Drafting…' : 'Short proposal pack'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void generateProposalDraft('terms_and_conditions')}
                    disabled={proposalDrafting !== null}
                    className="inline-flex h-9 flex-1 items-center justify-center rounded-full border border-slate-200 bg-white px-4 text-[11px] font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50 sm:min-w-[10rem]"
                  >
                    {proposalDrafting === 'terms_and_conditions' ? 'Working…' : 'Terms & conditions'}
                  </button>
                </div>
              </div>
            </details>

            <div className="grid gap-4 xl:grid-cols-[minmax(340px,460px)_minmax(0,1fr)] xl:items-start">
              <section className="space-y-4">
                <div className="ui-surface p-4 sm:p-5">
                  <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="ui-label">Proposal wording</p>
                      <h4 className="mt-1 text-base font-semibold tracking-tight text-slate-900">Edit by section</h4>
                      <p className="mt-1 text-xs text-slate-500">Company defaults load from Settings; use the reset link under each heading for one section at a time.</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => resetProposalDefaults('all')}
                      className="text-[11px] font-medium text-slate-600 underline decoration-slate-300 underline-offset-2 hover:text-slate-900"
                    >
                      Reset all to company defaults
                    </button>
                  </div>

                  <div className="space-y-3">
                    <label className="block rounded-[22px] border border-slate-200/80 bg-slate-50/65 p-3 text-xs text-slate-600">
                      <span className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-slate-700">Scope Summary / Intro</span>
                        <button type="button" onClick={() => resetProposalDefaults('intro')} className="text-[11px] font-semibold text-blue-700 hover:text-blue-800">Reset Default</button>
                      </span>
                      <textarea
                        rows={6}
                        className="mt-2 w-full rounded-[18px] border border-slate-200 bg-white px-3 py-3 text-sm text-slate-700 outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
                        value={settings?.proposalIntro || ''}
                        onChange={(e) => settings && setSettings({ ...settings, proposalIntro: e.target.value })}
                      />
                    </label>

                    <label className="block rounded-[22px] border border-slate-200/80 bg-slate-50/65 p-3 text-xs text-slate-600">
                      <span className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-slate-700">Terms</span>
                        <button type="button" onClick={() => resetProposalDefaults('terms')} className="text-[11px] font-semibold text-blue-700 hover:text-blue-800">Reset Default</button>
                      </span>
                      <textarea
                        rows={5}
                        className="mt-2 w-full rounded-[18px] border border-slate-200 bg-white px-3 py-3 text-sm text-slate-700 outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
                        value={settings?.proposalTerms || ''}
                        onChange={(e) => settings && setSettings({ ...settings, proposalTerms: e.target.value })}
                      />
                    </label>

                    <label className="block rounded-[22px] border border-slate-200/80 bg-slate-50/65 p-3 text-xs text-slate-600">
                      <span className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-slate-700">Exclusions</span>
                        <button type="button" onClick={() => resetProposalDefaults('exclusions')} className="text-[11px] font-semibold text-blue-700 hover:text-blue-800">Reset Default</button>
                      </span>
                      <textarea
                        rows={5}
                        className="mt-2 w-full rounded-[18px] border border-slate-200 bg-white px-3 py-3 text-sm text-slate-700 outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
                        value={settings?.proposalExclusions || ''}
                        onChange={(e) => settings && setSettings({ ...settings, proposalExclusions: e.target.value })}
                      />
                    </label>

                    <label className="block rounded-[22px] border border-slate-200/80 bg-slate-50/65 p-3 text-xs text-slate-600">
                      <span className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-slate-700">Clarifications</span>
                        <button type="button" onClick={() => resetProposalDefaults('clarifications')} className="text-[11px] font-semibold text-blue-700 hover:text-blue-800">Reset Default</button>
                      </span>
                      <textarea
                        rows={5}
                        className="mt-2 w-full rounded-[18px] border border-slate-200 bg-white px-3 py-3 text-sm text-slate-700 outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
                        value={settings?.proposalClarifications || ''}
                        onChange={(e) => settings && setSettings({ ...settings, proposalClarifications: e.target.value })}
                      />
                    </label>

                    <label className="block rounded-[22px] border border-slate-200/80 bg-slate-50/65 p-3 text-xs text-slate-600">
                      <span className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-slate-700">Acceptance Label</span>
                        <button type="button" onClick={() => resetProposalDefaults('acceptance')} className="text-[11px] font-semibold text-blue-700 hover:text-blue-800">Reset Default</button>
                      </span>
                      <input
                        className="mt-2 h-10 w-full rounded-[16px] border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
                        value={settings?.proposalAcceptanceLabel || ''}
                        onChange={(e) => settings && setSettings({ ...settings, proposalAcceptanceLabel: e.target.value })}
                      />
                    </label>
                  </div>
                </div>

                <details className="ui-surface group overflow-hidden open:shadow-md [&_summary::-webkit-details-marker]:hidden">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5 text-left hover:bg-slate-50/80 sm:px-5">
                    <div className="min-w-0">
                      <p className="ui-label">Internal — not on the client PDF</p>
                      <p className="mt-1 text-sm font-semibold text-slate-900">Install handoff email</p>
                      <p className="mt-0.5 text-[11px] text-slate-500">Estimator summary for crews (optional)</p>
                    </div>
                    <ChevronDown className="h-4 w-4 shrink-0 text-slate-400 transition group-open:rotate-180" />
                  </summary>
                  <div className="border-t border-slate-200/80 px-3 pb-4 pt-1 sm:px-4">
                    <div className="flex flex-wrap items-center justify-end gap-2 pb-3">
                      <button
                        type="button"
                        onClick={() => void generateInstallReviewEmail()}
                        disabled={installReviewGenerating}
                        className="inline-flex h-9 items-center justify-center rounded-full border border-slate-200 bg-white px-3.5 text-[11px] font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
                      >
                        {installReviewGenerating ? 'Generating...' : installReviewDraft ? 'Regenerate' : 'Generate'}
                      </button>
                      <button
                        type="button"
                        onClick={() => void copyInstallReviewEmailBody()}
                        disabled={!installReviewDraft}
                        className="ui-btn-primary h-9 rounded-full px-3.5 text-[11px] font-semibold disabled:opacity-50"
                      >
                        Copy Email
                      </button>
                    </div>
                    {installReviewDraft ? (
                      <div className="space-y-2.5">
                        <div className="rounded-[14px] bg-slate-50 p-3 ring-1 ring-slate-200/80">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Subject</p>
                          <p className="mt-1 text-sm font-semibold text-slate-900">{installReviewDraft.subject}</p>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="rounded-[14px] bg-slate-50 p-3 ring-1 ring-slate-200/80">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Location</p>
                            <p className="mt-1 text-sm font-semibold text-slate-900">{installReviewDraft.summary.location || 'Location TBD'}</p>
                          </div>
                          <div className="rounded-[14px] bg-slate-50 p-3 ring-1 ring-slate-200/80">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Timeline</p>
                            <p className="mt-1 text-sm font-semibold text-slate-900">{installReviewDraft.summary.timeline || 'Verify schedule with GC'}</p>
                          </div>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-3">
                          <div className="rounded-[22px] bg-slate-50/80 p-3 ring-1 ring-slate-200/80">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Crew</p>
                            <p className="mt-1 text-[22px] font-semibold tracking-[-0.04em] text-slate-950">{installReviewDraft.summary.crewSize ?? 'TBD'}</p>
                          </div>
                          <div className="rounded-[22px] bg-slate-50/80 p-3 ring-1 ring-slate-200/80">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Hours</p>
                            <p className="mt-1 text-[22px] font-semibold tracking-[-0.04em] text-slate-950">{formatNumberSafe(installReviewDraft.summary.estimatedHours || 0, 1)}</p>
                          </div>
                          <div className="rounded-[22px] bg-slate-50/80 p-3 ring-1 ring-slate-200/80">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Days</p>
                            <p className="mt-1 text-[22px] font-semibold tracking-[-0.04em] text-slate-950">{formatNumberSafe(installReviewDraft.summary.estimatedDays || 0, 1)}</p>
                          </div>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-3">
                          <div className="rounded-[22px] bg-slate-50/80 p-3 ring-1 ring-slate-200/80">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Material</p>
                            <p className="mt-1 text-base font-semibold text-slate-900">{formatCurrencySafe(installReviewDraft.summary.materialTotal || 0)}</p>
                          </div>
                          <div className="rounded-[22px] bg-slate-50/80 p-3 ring-1 ring-slate-200/80">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Labor</p>
                            <p className="mt-1 text-base font-semibold text-slate-900">{formatCurrencySafe(installReviewDraft.summary.laborTotal || 0)}</p>
                          </div>
                          <div className="rounded-[22px] bg-slate-50/80 p-3 ring-1 ring-slate-200/80">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Project Modifiers</p>
                            <p className="mt-1 text-base font-semibold text-slate-900">{installReviewDraft.summary.projectConditions.length}</p>
                          </div>
                        </div>
                        <textarea
                          readOnly
                          rows={14}
                          className="w-full rounded-[22px] border border-slate-200 bg-white px-4 py-4 text-sm leading-6 text-slate-700 outline-none"
                          value={installReviewDraft.body}
                        />
                      </div>
                    ) : (
                      <div className="rounded-[22px] border border-dashed border-slate-300 bg-slate-50/70 px-4 py-6 text-sm text-slate-500">
                        Generate after scope and project conditions are set.
                      </div>
                    )}
                  </div>
                </details>
              </section>

              <div className="space-y-3 xl:sticky xl:top-4">
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200/80 bg-white/95 px-3 py-2.5 shadow-sm backdrop-blur-sm">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Live preview</p>
                    <p className="text-xs font-medium text-slate-700">What the client sees</p>
                  </div>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-medium text-slate-600">Print / export</span>
                </div>
                <div className="overflow-hidden rounded-2xl ring-1 ring-slate-200/80">
                  <ProposalPreview
                    project={project}
                    settings={settings}
                    lines={lines}
                    summary={summary}
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <ItemPicker
        open={catalogOpen}
        rooms={rooms}
        bundles={bundles}
        activeRoomId={activeRoomId}
        categories={categories}
        search={catalogSearch}
        category={catalogCategory}
        items={filteredCatalog}
        onClose={() => setCatalogOpen(false)}
        onSearch={setCatalogSearch}
        onCategory={setCatalogCategory}
        onAddItems={addDraftItems}
        onApplyBundle={applyBundle}
      />

      <BundlePickerModal
        open={bundleModalOpen}
        bundles={bundles}
        rooms={rooms}
        activeRoomId={activeRoomId}
        onClose={() => setBundleModalOpen(false)}
        onApplyBundle={applyBundle}
      />

      {modifiersModalOpen && selectedLine && (
        <div className="fixed inset-0 z-50 bg-[radial-gradient(circle_at_top,rgba(10,34,77,0.18)_0%,rgba(15,23,42,0.55)_60%)] p-2 backdrop-blur-sm sm:p-4" onClick={() => setModifiersModalOpen(false)}>
          <div className="mx-auto flex max-h-[min(92vh,880px)] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] shadow-[0_24px_48px_rgba(15,23,42,0.18)]" onClick={(event) => event.stopPropagation()}>
            <div className="border-b border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(246,248,251,0.96)_100%)] px-3 py-2.5 sm:px-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 max-w-[min(100%,42rem)]">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="ui-chip-soft">Line editor</span>
                    <span className="ui-chip-soft">{selectedLine.category || 'Uncategorized'}</span>
                    <span className="ui-chip-soft">{roomNamesById[selectedLine.roomId] || 'Unassigned room'}</span>
                  </div>
                  <h3 className="mt-1 text-base font-semibold tracking-tight text-slate-950">Edit line</h3>
                </div>
                <button onClick={() => setModifiersModalOpen(false)} className="h-9 shrink-0 rounded-full border border-slate-200 bg-white px-3 text-[11px] font-medium text-slate-700 shadow-sm transition hover:bg-slate-50">Done</button>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <div className="rounded-lg bg-white p-2 shadow-sm ring-1 ring-slate-200/80"><p className="text-[9px] font-semibold uppercase tracking-[0.08em] text-slate-500">Qty</p><p className="mt-0.5 text-base font-semibold tabular-nums text-slate-950">{formatNumberSafe(selectedLine.qty, 0)}</p></div>
                <div className="rounded-lg bg-white p-2 shadow-sm ring-1 ring-slate-200/80"><p className="text-[9px] font-semibold uppercase tracking-[0.08em] text-slate-500">Material</p><p className="mt-0.5 text-base font-semibold tabular-nums text-slate-950">{formatCurrencySafe(selectedLine.materialCost)}</p></div>
                <div className="rounded-lg bg-white p-2 shadow-sm ring-1 ring-slate-200/80"><p className="text-[9px] font-semibold uppercase tracking-[0.08em] text-slate-500">Labor</p><p className="mt-0.5 text-base font-semibold tabular-nums text-slate-950">{formatCurrencySafe(selectedLine.laborCost)}</p></div>
                <div className="rounded-lg bg-[linear-gradient(180deg,#10284f_0%,#0a224d_100%)] p-2 text-white shadow-sm sm:col-span-1 col-span-2"><p className="text-[9px] font-semibold uppercase tracking-[0.08em] text-slate-300">Unit Sell</p><p className="mt-0.5 text-base font-semibold tabular-nums">{formatCurrencySafe(selectedLine.unitSell)}</p></div>
              </div>
            </div>

            <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[1fr_280px]">
              <div className="min-h-0 overflow-y-auto p-3 sm:p-4">
                <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
                  <div className="space-y-3">
                    <div className="rounded-xl bg-white p-3 shadow-sm ring-1 ring-slate-200/80">
                      <p className="text-[11px] font-semibold text-slate-900">Line details</p>
                      <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
                        <label className="text-[11px] font-medium text-slate-700 md:col-span-2">Description
                          <input className="ui-input mt-1 h-9 rounded-lg" value={selectedLine.description} onChange={(e) => patchLineLocal(selectedLine.id, { description: e.target.value })} onBlur={() => void persistLine(selectedLine.id)} />
                        </label>
                        <label className="text-[11px] font-medium text-slate-700">Room
                          <select className="ui-input mt-1 h-9 rounded-lg" value={selectedLine.roomId} onChange={(e) => patchLineLocal(selectedLine.id, { roomId: e.target.value })} onBlur={() => void persistLine(selectedLine.id)}>
                      {rooms.map((room) => <option key={room.id} value={room.id}>{room.roomName}</option>)}
                          </select>
                        </label>
                        <label className="text-[11px] font-medium text-slate-700">Category
                          <CatalogCategorySelect
                            className="ui-input mt-1 h-9 rounded-lg"
                            value={selectedLine.category}
                            options={scopeCategoryOptions}
                            onChange={(v) => patchLineLocal(selectedLine.id, { category: v })}
                            onBlur={() => void persistLine(selectedLine.id)}
                          />
                        </label>
                        <label className="text-[11px] font-medium text-slate-700">Qty
                          <input className="ui-input mt-1 h-9 rounded-lg" {...lineQtyField.inputProps} />
                        </label>
                        <label className="text-[11px] font-medium text-slate-700">Unit
                          <input className="ui-input mt-1 h-9 rounded-lg" value={selectedLine.unit} onChange={(e) => patchLineLocal(selectedLine.id, { unit: e.target.value })} onBlur={() => void persistLine(selectedLine.id)} />
                        </label>
                        {activeTab !== 'estimate' ? (
                          <label className="text-[11px] font-medium text-slate-700 md:col-span-2">Notes
                            <textarea rows={3} className="ui-textarea mt-1 rounded-xl min-h-[72px]" value={selectedLine.notes || ''} onChange={(e) => patchLineLocal(selectedLine.id, { notes: e.target.value || null })} onBlur={() => void persistLine(selectedLine.id)} />
                          </label>
                        ) : null}
                      </div>
                    </div>

                    <div className="rounded-xl bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] p-3 shadow-sm ring-1 ring-slate-200/80">
                      <p className="text-[11px] font-semibold text-slate-900">Pricing</p>
                      <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
                        {showMaterial ? (
                          <label className="text-[11px] font-medium text-slate-700">Material
                            <input className="ui-input mt-1 h-9 rounded-lg" {...lineMaterialField.inputProps} />
                          </label>
                        ) : null}
                        {showLabor ? (
                          <label className="text-[11px] font-medium text-slate-700">Labor
                            <input className="ui-input mt-1 h-9 rounded-lg" {...lineLaborField.inputProps} />
                            {(summary?.conditionLaborMultiplier || 1) !== 1 ? <p className="mt-1 text-[10px] text-slate-500">Effective labor with project multiplier: {formatCurrencySafe((selectedLine.laborCost || 0) * (summary?.conditionLaborMultiplier || 1))}</p> : null}
                          </label>
                        ) : null}
                        <label className="text-[11px] font-medium text-slate-700">Unit Sell
                          <div className="mt-1 space-y-1.5">
                            <input className="ui-input h-9 rounded-lg" {...lineUnitSellField.inputProps} />
                            <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-slate-500">
                              <span>
                                {selectedLine.pricingSource === 'manual'
                                  ? 'Manual override preserved during repricing.'
                                  : `Calculated from material + labor: ${formatCurrencySafe(selectedLine.materialCost + selectedLine.laborCost)}`}
                              </span>
                              <button
                                type="button"
                                onClick={() => void resetLineToCalculatedPrice(selectedLine.id)}
                                disabled={selectedLine.pricingSource !== 'manual'}
                                className="rounded-full border border-slate-200 px-2.5 py-1 text-[10px] font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                Reset To Calculated
                              </button>
                            </div>
                          </div>
                        </label>
                        <div className="rounded-lg bg-white px-2.5 py-2 shadow-sm ring-1 ring-slate-200/80 md:col-span-2">
                          <p className="text-[9px] font-semibold uppercase tracking-[0.08em] text-slate-500">Install time (per unit)</p>
                          <p className="mt-0.5 text-base font-semibold tabular-nums text-slate-950">{formatNumberSafe(selectedLine.laborMinutes, 1)} min/unit</p>
                          <p className="mt-1 text-[10px] leading-snug text-slate-600">
                            Extended for this line:{' '}
                            <span className="font-semibold tabular-nums text-slate-900">
                              {formatLaborDurationMinutes(Number(selectedLine.laborMinutes || 0) * Number(selectedLine.qty || 0))}
                            </span>
                            {Number(selectedLine.qty || 0) !== 1 ? (
                              <span className="text-slate-500">
                                {' '}
                                ({formatNumberSafe(selectedLine.qty, 0)} × {formatNumberSafe(selectedLine.laborMinutes, 1)} min)
                              </span>
                            ) : null}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="rounded-xl bg-[linear-gradient(180deg,#ffffff_0%,#f4f8ff_100%)] p-3 shadow-sm ring-1 ring-slate-200/80">
                      <p className="text-[11px] font-semibold text-slate-900">Line snapshot</p>
                      <div className="mt-2 space-y-1.5 text-[10px] text-slate-600">
                        <div className="flex items-center justify-between rounded-lg bg-white px-2.5 py-1.5 shadow-sm ring-1 ring-slate-200/80"><span>Room</span><span className="font-semibold text-slate-900">{roomNamesById[selectedLine.roomId] || 'Unassigned'}</span></div>
                        <div className="flex items-center justify-between rounded-lg bg-white px-2.5 py-1.5 shadow-sm ring-1 ring-slate-200/80"><span>Category</span><span className="font-semibold text-slate-900">{selectedLine.category || 'Uncategorized'}</span></div>
                        <div className="flex items-center justify-between rounded-lg bg-white px-2.5 py-1.5 shadow-sm ring-1 ring-slate-200/80"><span>Line total</span><span className="font-semibold text-slate-900">{formatCurrencySafe(selectedLine.lineTotal)}</span></div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="border-t border-slate-200/80 bg-[linear-gradient(180deg,rgba(248,250,252,0.96)_0%,rgba(241,245,249,0.98)_100%)] p-3 lg:border-l lg:border-t-0">
                <ModifierPanel
                  modifiers={modifiers}
                  activeModifiers={lineModifiers}
                  selectedLinePresent={!!selectedLine}
                  onApplyModifier={(modifierId) => void applyModifier(modifierId)}
                  onRemoveModifier={(lineModifierId) => void removeModifier(lineModifierId)}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {roomCreateModalOpen && (
        <div className="fixed inset-0 z-[60] bg-slate-900/45 p-3 sm:p-6" onClick={closeCreateRoomModal}>
          <div className="mx-auto max-w-xl rounded-2xl border border-slate-200 bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="border-b border-slate-200 bg-gradient-to-r from-blue-50 to-white px-5 py-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-blue-700">Add Room</p>
              <h2 className="mt-1 text-lg font-semibold text-slate-900">Create a New Room or Area</h2>
              <p className="mt-1 text-sm text-slate-600">Name the room first, then choose whether to start it with a line item right away.</p>
            </div>

            <div className="space-y-4 px-5 py-5">
              <label className="block text-[11px] font-medium text-slate-700">
                Room Name
                <input
                  autoFocus
                  className="ui-input mt-1 h-10"
                  value={roomCreationDraft.roomName}
                  onChange={(e) => setRoomCreationDraft((prev) => ({ ...prev, roomName: e.target.value }))}
                  placeholder="Restroom A, Lobby, Exterior Entry, Phase 2..."
                />
              </label>

              <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4 space-y-3">
                <label className="flex items-start gap-3 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={roomCreationDraft.addStarterLine}
                    onChange={(e) => setRoomCreationDraft((prev) => ({ ...prev, addStarterLine: e.target.checked }))}
                  />
                  <span>
                    <span className="block font-medium text-slate-900">Auto add a starter item</span>
                    <span className="block text-slate-500">Turn this on when you want the new room to open with a first manual line already in place.</span>
                  </span>
                </label>

                {roomCreationDraft.addStarterLine ? (
                  <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_100px_90px] gap-3">
                    <label className="text-[11px] font-medium text-slate-700">
                      Item Description
                      <input
                        className="ui-input mt-1 h-10"
                        value={roomCreationDraft.starterDescription}
                        onChange={(e) => setRoomCreationDraft((prev) => ({ ...prev, starterDescription: e.target.value }))}
                        placeholder="Grab bar, mirror, partition panel..."
                      />
                    </label>
                    <label className="text-[11px] font-medium text-slate-700">
                      Qty
                      <input
                        type="number"
                        min={1}
                        className="ui-input mt-1 h-10"
                        value={roomCreationDraft.starterQty}
                        onChange={(e) => setRoomCreationDraft((prev) => ({ ...prev, starterQty: Number(e.target.value) || 1 }))}
                      />
                    </label>
                    <label className="text-[11px] font-medium text-slate-700">
                      Unit
                      <input
                        className="ui-input mt-1 h-10"
                        value={roomCreationDraft.starterUnit}
                        onChange={(e) => setRoomCreationDraft((prev) => ({ ...prev, starterUnit: e.target.value.toUpperCase() || 'EA' }))}
                      />
                    </label>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-4">
              <button onClick={closeCreateRoomModal} disabled={creatingRoom} className="h-9 px-3 rounded-md border border-slate-300 text-[11px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">Cancel</button>
              <button onClick={() => void createRoom()} disabled={creatingRoom || !roomCreationDraft.roomName.trim()} className="h-9 px-4 rounded-md bg-blue-700 text-[11px] font-semibold text-white hover:bg-blue-800 disabled:opacity-50">
                {creatingRoom ? 'Creating...' : roomCreationDraft.addStarterLine ? 'Create Room + Item' : 'Create Room'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
