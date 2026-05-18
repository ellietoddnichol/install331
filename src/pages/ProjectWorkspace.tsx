import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  ChevronDown,
  Download,
  Hammer,
  Layers3,
  Sparkles,
  CalendarClock,
  X,
} from 'lucide-react';
import { api } from '../services/api';
import {
  BundleRecord,
  InstallReviewEmailDraft,
  LineModifierRecord,
  ModifierRecord,
  PricingMode,
  ProjectFileRecord,
  ProjectJobConditions,
  ProjectRecord,
  SourceQuoteLineRecord,
  SourceQuoteRecord,
  RoomRecord,
  SettingsRecord,
  TakeoffLineRecord,
  EstimateSummary,
  isMaterialOnlyMainBid,
} from '../shared/types/estimator';
import { CatalogItem } from '../types';
import { createDefaultProjectJobConditions, normalizeProjectJobConditions, recommendDeliveryPlan, recommendedPhasedWorkMultiplier } from '../shared/utils/jobConditions';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  DEFAULT_PROPOSAL_ACCEPTANCE_LABEL,
  DEFAULT_PROPOSAL_CLARIFICATIONS,
  DEFAULT_PROPOSAL_EXCLUSIONS,
  DEFAULT_PROPOSAL_INTRO,
  DEFAULT_PROPOSAL_TERMS,
  ensureProposalDefaults,
} from '../shared/utils/proposalDefaults';
import type { EstimateWorkspaceView, WorkspaceTab } from '../shared/types/projectWorkflow';
import { fingerprintProjectStable } from '../shared/utils/projectRecordFingerprint';
import {
  estimateViewFromSearchParams,
  readWorkspaceUi,
  tabFromSearchParam,
  writeWorkspaceUi,
} from '../shared/utils/projectWorkspaceSession';
import {
  isValidWorkspaceStep,
  projectWorkspacePath,
  workspaceTabFromPathSegment,
} from '../shared/utils/projectWorkspaceRoutes.ts';
import { getErrorMessage } from '../shared/utils/errorMessage';
import { computeFieldScheduleHint } from '../shared/utils/fieldScheduleHint';
import type { PartitionLayoutGeneratedLine } from '../shared/utils/partitionLayoutBuilder';
import { toggleBulkSelectionForVisibleConcrete } from '../shared/utils/estimateBulkSelection';
import { deriveEstimateLineHealth, type EstimateHealthFocus } from '../shared/utils/estimateLineHealth';
import { PRICING_ALL_CATEGORIES, TAKEOFF_ALL_ROOMS } from '../shared/constants/workspaceUi';
import { WorkspaceProjectHeader } from '../components/workflow/WorkspaceProjectHeader';
import { ProjectWorkflowReadinessBar } from '../components/workflow/ProjectWorkflowReadinessBar';
import {
  EstimateTabSummaryCard,
  QuotesTabSummaryCard,
} from '../components/workflow/ProjectWorkspaceTabSummaries';
import { ProjectStepNav } from '../components/workflow/ProjectStepNav.tsx';
import { WorkflowRightDrawer } from '../components/workflow/WorkflowRightDrawer';
import { EstimateToolbar, type EstimateToolbarBidBucketStat } from '../components/workflow/EstimateToolbar';
import { classifyBidBucketKind, compareBidBucketKeys } from '../shared/utils/intakeEstimateReview';
import { RoomManager } from '../components/workspace/RoomManager';
import { ProposalSectionEditor } from '../components/workflow/ProposalSectionEditor';
import { ProposalSettingsRail } from '../components/workflow/ProposalSettingsRail';
import { ProposalPreview } from '../components/workflow/ProposalPreview';
import { buildProposalReadinessItems, ProposalReadinessRail } from '../components/workflow/ProposalReadinessRail';
import { FieldOpsPageHeader } from '../components/fieldops/FieldOpsPrimitives';
import { EstimateGrid } from '../components/workspace/EstimateGrid';
import { EstimateHealthStrip } from '../components/workspace/EstimateHealthStrip';
import { LaborPlanPanel } from '../components/workspace/LaborPlanPanel';
import { EstimateWorkspaceFooter } from '../components/workspace/EstimateWorkspaceFooter';
import { EstimateReviewShell } from '../components/workspace/estimate/EstimateReviewShell';
import { deriveInstallAssumptionGateUi } from '../shared/utils/installIntelligenceLineUi';
import { EstimateCockpitSummaryBar } from '../components/workspace/estimate/EstimateCockpitSummaryBar';
import { EstimateCockpitTable } from '../components/workspace/estimate/EstimateCockpitTable';
import { EstimateCockpitLinePanel } from '../components/workspace/estimate/EstimateCockpitLinePanel';
import { ItemPicker } from '../components/workspace/ItemPicker';
import { ModifierPanel } from '../components/workspace/ModifierPanel';
import { BundlePickerModal } from '../components/workspace/BundlePickerModal';
import { PartitionLayoutBuilderModal } from '../components/workspace/PartitionLayoutBuilderModal';
import { ProjectOverviewMvpPage } from './project/ProjectOverviewMvpPage';
import { ProjectSetupPage } from './project/ProjectSetupPage';
import { QuotesPage } from './project/QuotesPage';
import { QuoteImportResultModal } from '../components/quotes/QuoteImportResultModal';
import {
  InstallAssumptionsDrawer,
  type InstallAssumptionApplyScope,
} from '../components/workspace/estimate/InstallAssumptionsDrawer';
import { buildProjectBlockingAssumptions } from '../components/project/ProjectSetupReadiness';
import {
  buildQuoteImportResultSummary,
  type QuoteImportResultSummary,
} from '../shared/utils/quoteImportResultSummary';
import { HandoffSummary } from '../components/workflow/HandoffSummary';
import { ActionFeedbackBanner } from '../components/feedback/ActionFeedbackBanner';
import { formatCurrencySafe, formatLaborDurationMinutes, formatNumberSafe } from '../utils/numberFormat';
import { getDistanceInMiles } from '../utils/geo';
import { CatalogCategorySelect } from '../components/intake/CatalogCategorySelect';
import { useTransientNumericField } from '../hooks/useTransientNumericField';
import {
  buildProposalScheduleSections,
  filterLinesForClientProposal,
  splitProposalTextLines,
} from '../shared/utils/proposalDocument';
import { computeNextBestAction, computeWorkflowBarSteps } from '../shared/utils/projectWorkspaceReadiness';
import { calculateWorkDuration, formatWorkWeeksLabel } from '../shared/utils/workDuration';

interface RoomCreationDraft {
  roomName: string;
  addStarterLine: boolean;
  starterDescription: string;
  starterQty: number;
  starterUnit: string;
}

const DEFAULT_ROOM_CREATION_DRAFT: RoomCreationDraft = {
  roomName: '',
  addStarterLine: false,
  starterDescription: 'Manual item',
  starterQty: 1,
  starterUnit: 'EA',
};

export function ProjectWorkspace() {
  const { id, workspaceStep } = useParams<{ id: string; workspaceStep: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { userEmail } = useAuth();

  const [loading, setLoading] = useState(true);
  const [workspaceLoadError, setWorkspaceLoadError] = useState<string | null>(null);
  const location = useLocation();

  const activeTab: WorkspaceTab = useMemo(() => {
    const fromPath = workspaceTabFromPathSegment(workspaceStep);
    return fromPath ?? 'overview';
  }, [workspaceStep]);

  const goToTab = useCallback(
    (tab: WorkspaceTab) => {
      if (!id) return;
      navigate(projectWorkspacePath(id, tab));
    },
    [id, navigate]
  );
  const [estimateView, setEstimateView] = useState<EstimateWorkspaceView>(() => estimateViewFromSearchParams(searchParams));

  const [project, setProject] = useState<ProjectRecord | null>(null);
  const [rooms, setRooms] = useState<RoomRecord[]>([]);
  const [lines, setLines] = useState<TakeoffLineRecord[]>([]);
  const linesRef = useRef<TakeoffLineRecord[]>([]);
  linesRef.current = lines;
  /** Catalog rows for takeoff lines that already reference a catalog item (server lookup; not the full catalog). */
  const [referencedCatalogItems, setReferencedCatalogItems] = useState<CatalogItem[]>([]);
  /** Category names for pickers (distinct from Postgres; not derived from a full client catalog download). */
  const [workspaceCatalogCategories, setWorkspaceCatalogCategories] = useState<string[]>(['all']);
  /** Server-backed list for add-items flows (search API or first page when search is empty). */
  const [catalogBrowseItems, setCatalogBrowseItems] = useState<CatalogItem[]>([]);
  const [summary, setSummary] = useState<EstimateSummary | null>(null);
  const [settings, setSettings] = useState<SettingsRecord | null>(null);
  const [modifiers, setModifiers] = useState<ModifierRecord[]>([]);
  const [bundles, setBundles] = useState<BundleRecord[]>([]);
  const [projectFiles, setProjectFiles] = useState<ProjectFileRecord[]>([]);
  const [sourceQuotes, setSourceQuotes] = useState<SourceQuoteRecord[]>([]);
  const [allQuoteLines, setAllQuoteLines] = useState<SourceQuoteLineRecord[]>([]);
  const [activeQuoteId, setActiveQuoteId] = useState('');
  const [sourceQuoteLines, setSourceQuoteLines] = useState<SourceQuoteLineRecord[]>([]);
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
  const [lineModifiersByLineId, setLineModifiersByLineId] = useState<Record<string, LineModifierRecord[]>>({});

  const [syncState, setSyncState] = useState<'idle' | 'syncing' | 'ok' | 'error'>('idle');
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = useState<{ tone: 'success' | 'error' | 'info' | 'warning'; message: string } | null>(null);

  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPersistedFingerprintRef = useRef<string | null>(null);
  const projectRef = useRef<ProjectRecord | null>(null);
  const autosaveGenerationRef = useRef(0);
  const saveProjectRef = useRef<() => Promise<void>>(async () => {});
  projectRef.current = project;

  const [activeRoomId, setActiveRoomId] = useState('');
  /** `TAKEOFF_ALL_ROOMS` = combined view; otherwise a real room id (matches working room / takeoff filter when drilling into one room). */
  const [takeoffRoomFilter, setTakeoffRoomFilter] = useState<string>(TAKEOFF_ALL_ROOMS);
  const [selectedLineId, setSelectedLineId] = useState<string | null>(null);
  /** Concrete takeoff line ids selected for bulk delete (takeoff single-room + pricing grids only). */
  const [bulkSelectedLineIds, setBulkSelectedLineIds] = useState<string[]>([]);
  const [bulkMoveTargetRoomId, setBulkMoveTargetRoomId] = useState('');
  /** ISO time when takeoff lines were last loaded from the API (workspace load or refresh). */
  const [takeoffLinesLoadedAt, setTakeoffLinesLoadedAt] = useState<string | null>(null);
  const [healthStripFocus, setHealthStripFocus] = useState<EstimateHealthFocus | null>(null);
  const [pricingOrganizeMode, setPricingOrganizeMode] = useState<'rooms' | 'categories'>('rooms');
  const [pricingCategoryFilter, setPricingCategoryFilter] = useState<string>(PRICING_ALL_CATEGORIES);

  const [workspaceScopeMode, setWorkspaceScopeMode] = useState<'all' | 'active_room'>('all');
  const [takeoffSearch, setTakeoffSearch] = useState('');
  const [takeoffMatchStatus, setTakeoffMatchStatus] = useState<'all' | 'matched' | 'unmatched'>('all');
  const [takeoffUnresolvedOnly, setTakeoffUnresolvedOnly] = useState(false);
  const [estimateSearch, setEstimateSearch] = useState('');
  const [estimateSourceFilter, setEstimateSourceFilter] = useState<'all' | 'manual' | 'catalog' | 'vendor_quote'>('all');

  const [catalogOpen, setCatalogOpen] = useState(false);
  const [quoteImportResultOpen, setQuoteImportResultOpen] = useState(false);
  const [quoteImportResult, setQuoteImportResult] = useState<QuoteImportResultSummary | null>(null);
  const [installAssumptionsDrawerOpen, setInstallAssumptionsDrawerOpen] = useState(false);
  const [installAssumptionsBusy, setInstallAssumptionsBusy] = useState(false);
  const [bundleModalOpen, setBundleModalOpen] = useState(false);
  const [partitionBuilderOpen, setPartitionBuilderOpen] = useState(false);
  const [modifiersModalOpen, setModifiersModalOpen] = useState(false);
  const [addToCatalogOpen, setAddToCatalogOpen] = useState(false);
  const [addToCatalogBusy, setAddToCatalogBusy] = useState(false);
  const [addToCatalogDraft, setAddToCatalogDraft] = useState<null | {
    sku: string;
    category: string;
    description: string;
    uom: CatalogItem['uom'];
    baseMaterialCost: number;
    baseLaborMinutes: number;
    installLaborFamily: string;
  }>(null);
  const [roomCreateModalOpen, setRoomCreateModalOpen] = useState(false);
  const [roomManagerOpen, setRoomManagerOpen] = useState(false);
  const [roomCreationDraft, setRoomCreationDraft] = useState<RoomCreationDraft>(DEFAULT_ROOM_CREATION_DRAFT);
  const [creatingRoom, setCreatingRoom] = useState(false);
  const [catalogSearch, setCatalogSearch] = useState('');
  const [catalogCategory, setCatalogCategory] = useState('all');
  const [proposalDrafting, setProposalDrafting] = useState<null | 'scope_summary' | 'proposal_text' | 'terms_and_conditions' | 'default_short'>(null);
  const [installReviewDraft, setInstallReviewDraft] = useState<InstallReviewEmailDraft | null>(null);
  const [installReviewGenerating, setInstallReviewGenerating] = useState(false);
  const [distanceCalculating, setDistanceCalculating] = useState(false);
  const [distanceError, setDistanceError] = useState<string | null>(null);

  /** When true, Proposal tab reads `v_estimate_lines_customer` + `v_estimate_summary` via `/api/v1/pipeline/...`. */
  const [pipelineNativeEnabled, setPipelineNativeEnabled] = useState(false);
  const [proposalNativeEstimateId, setProposalNativeEstimateId] = useState('');
  const [pipelineProposalEstimates, setPipelineProposalEstimates] = useState<Record<string, unknown>[]>([]);
  const [nativeProposalLines, setNativeProposalLines] = useState<TakeoffLineRecord[] | null>(null);
  const [nativeProposalSummary, setNativeProposalSummary] = useState<EstimateSummary | null>(null);
  const [nativeProposalWarnings, setNativeProposalWarnings] = useState<string[]>([]);
  const [nativeProposalLoading, setNativeProposalLoading] = useState(false);

  const statusActionLabel = useMemo(() => {
    if (!project) return 'Mark Submitted';
    if (project.status === 'Draft' || project.status === 'Lost') return 'Mark Submitted';
    if (project.status === 'Submitted') return 'Mark Awarded';
    if (project.status === 'Awarded') return 'Archive Project';
    if (project.status === 'Archived') return 'Reopen Draft';
    return 'Mark Submitted';
  }, [project]);

  const stepNavItems = useMemo(
    () => [
      { id: 'overview' as const, label: 'Overview', tier: 'primary' as const },
      { id: 'setup' as const, label: 'Setup', tier: 'primary' as const },
      { id: 'quotes' as const, label: 'Quotes', tier: 'primary' as const },
      { id: 'estimate' as const, label: 'Estimate', tier: 'primary' as const },
      { id: 'proposal' as const, label: 'Proposal', tier: 'primary' as const },
    ],
    []
  );

  useEffect(() => {
    void api
      .getV1PipelineCapabilities()
      .then((c) => setPipelineNativeEnabled(Boolean(c?.nativeWorkspace && c?.pg)))
      .catch(() => setPipelineNativeEnabled(false));
  }, []);

  useEffect(() => {
    if (pipelineNativeEnabled) return;
    setNativeProposalLines(null);
    setNativeProposalSummary(null);
    setNativeProposalWarnings([]);
    setNativeProposalLoading(false);
    setPipelineProposalEstimates([]);
  }, [pipelineNativeEnabled]);

  useEffect(() => {
    if (!id) return;
    setWorkspaceLoadError(null);
    void loadWorkspace(id);
  }, [id]);

  /**
   * Resolve legacy `?tab=` on path-based URLs: if it disagrees with the path segment, navigate to the tab path;
   * if it matches, strip the redundant query param.
   */
  useLayoutEffect(() => {
    if (!id) return;
    const tabQ = searchParams.get('tab');
    if (!tabQ) return;
    const fromQuery = tabFromSearchParam(tabQ);
    const next = new URLSearchParams(searchParams);
    next.delete('tab');
    const qs = next.toString() ? `?${next.toString()}` : '';
    if (fromQuery === activeTab) {
      navigate(`${location.pathname}${qs}`, { replace: true });
      return;
    }
    navigate(`${projectWorkspacePath(id, fromQuery)}${qs}`, { replace: true });
  }, [id, activeTab, searchParams, navigate, location.pathname]);

  useEffect(() => {
    if (!id || !workspaceStep) return;
    if (!isValidWorkspaceStep(workspaceStep)) {
      navigate(projectWorkspacePath(id, 'overview'), { replace: true });
    }
  }, [id, workspaceStep, navigate]);

  const hydrateReferencedCatalogItems = useCallback(async (lineList: TakeoffLineRecord[]) => {
    const ids = [...new Set(lineList.map((l) => String(l.catalogItemId || '').trim()).filter(Boolean))];
    if (ids.length === 0) {
      setReferencedCatalogItems([]);
      return;
    }
    try {
      const rows = await api.lookupV1CatalogItemsByIds(ids);
      setReferencedCatalogItems(rows);
    } catch (err) {
      console.warn('Referenced catalog lookup failed', err);
    }
  }, []);

  useEffect(() => {
    void hydrateReferencedCatalogItems(lines);
  }, [lines, hydrateReferencedCatalogItems]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const q = catalogSearch.trim();
      try {
        if (q) {
          const rows = await api.searchCatalogItems({
            query: q,
            category: catalogCategory === 'all' ? undefined : catalogCategory,
            includeDeprecated: false,
            includeNonCanonical: false,
            includeInactive: false,
          });
          if (!cancelled) setCatalogBrowseItems(rows);
        } else {
          const { items } = await api.getV1CatalogItemsPage({
            offset: 0,
            limit: 100,
            activeFilter: 'active',
            category: catalogCategory === 'all' ? undefined : catalogCategory,
            sortBy: 'sku-asc',
          });
          if (!cancelled) setCatalogBrowseItems(items);
        }
      } catch (err) {
        console.warn('Catalog browse load failed', err);
        if (!cancelled) setCatalogBrowseItems([]);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [catalogSearch, catalogCategory]);

  useEffect(() => {
    const onCatalogSynced = () => {
      void api.getV1CatalogCategories().then((catList) => {
        setWorkspaceCatalogCategories([
          'all',
          ...catList.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })),
        ]);
      });
      void hydrateReferencedCatalogItems(linesRef.current);
    };
    window.addEventListener('catalog-synced', onCatalogSynced);
    return () => window.removeEventListener('catalog-synced', onCatalogSynced);
  }, [hydrateReferencedCatalogItems]);

  useEffect(() => {
    if (!id || loading) return;
    writeWorkspaceUi(id, {
      activeRoomId,
      takeoffRoomFilter,
      selectedLineId,
      pricingOrganizeMode,
      pricingCategoryFilter,
      proposalNativeEstimateId: proposalNativeEstimateId || undefined,
    });
  }, [
    id,
    loading,
    activeRoomId,
    takeoffRoomFilter,
    selectedLineId,
    pricingOrganizeMode,
    pricingCategoryFilter,
    proposalNativeEstimateId,
  ]);

  /** Keep `?view=quantities` in sync for the Estimate step only; path carries the workspace tab. */
  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    let changed = false;
    if (next.has('tab')) {
      next.delete('tab');
      changed = true;
    }
    if (activeTab === 'estimate') {
      if (estimateView === 'quantities') {
        if (next.get('view') !== 'quantities') {
          next.set('view', 'quantities');
          changed = true;
        }
      } else if (next.has('view')) {
        next.delete('view');
        changed = true;
      }
    } else if (next.has('view')) {
      next.delete('view');
      changed = true;
    }
    if (changed && next.toString() !== searchParams.toString()) {
      setSearchParams(next, { replace: true });
    }
  }, [activeTab, estimateView, searchParams, setSearchParams]);

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
            /** Project-only save: refresh summary only so the line grid doesn't reload from the server. */
            const summaryData = await api.getV1Summary(saved.id);
            if (gen !== autosaveGenerationRef.current) return;
            setSummary(summaryData);
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
      const [projectData, roomData, lineData, catalogCategories, summaryData, settingsData, modifiersData, bundlesData, filesData, quoteData] = await Promise.all([
        api.getV1Project(projectId),
        api.getV1Rooms(projectId),
        api.getV1TakeoffLines(projectId),
        api.getV1CatalogCategories(),
        api.getV1Summary(projectId),
        api.getV1Settings(),
        api.getV1Modifiers(),
        api.getV1Bundles(),
        api.getV1ProjectFiles(projectId),
        api.getV1SourceQuotes(projectId),
      ]);

      const normalizedProject = {
        ...projectData,
        proposalFormat: projectData.proposalFormat ?? 'standard',
        proposalIncludeCatalogImages: projectData.proposalIncludeCatalogImages ?? false,
        structuredAssumptions: projectData.structuredAssumptions ?? [],
      };
      setProject(normalizedProject);
      lastPersistedFingerprintRef.current = fingerprintProjectStable(normalizedProject);
      setLastSavedAt(projectData.updatedAt);
      setSyncState('ok');
      setRooms(roomData);
      setLines(lineData);
      setTakeoffLinesLoadedAt(new Date().toISOString());
      setWorkspaceCatalogCategories([
        'all',
        ...catalogCategories.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })),
      ]);
      setSummary(summaryData);
      setSettings(ensureProposalDefaults(settingsData));
      setModifiers(modifiersData);
      setBundles(bundlesData);
      setProjectFiles(filesData);
      setSourceQuotes(quoteData);

      const ui = readWorkspaceUi(projectId);
      setProposalNativeEstimateId(typeof ui.proposalNativeEstimateId === 'string' ? ui.proposalNativeEstimateId : '');
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
      if (ui.estimateView === 'quantities' || ui.estimateView === 'pricing') {
        setEstimateView(ui.estimateView);
      }
      if (ui.pricingOrganizeMode === 'categories' || ui.pricingOrganizeMode === 'rooms') {
        setPricingOrganizeMode(ui.pricingOrganizeMode);
      } else {
        setPricingOrganizeMode('rooms');
      }
      const roomLinesForUi = lineData.filter((l) => l.roomId === roomPick);
      const categoryKeys = new Set(
        roomLinesForUi.map((l) => String(l.category || '').trim() || 'Uncategorized')
      );
      let nextPricingCat = ui.pricingCategoryFilter || PRICING_ALL_CATEGORIES;
      if (nextPricingCat !== PRICING_ALL_CATEGORIES && !categoryKeys.has(nextPricingCat)) {
        nextPricingCat = PRICING_ALL_CATEGORIES;
      }
      setPricingCategoryFilter(nextPricingCat);

      const nextQuoteId = quoteData.some((quote) => quote.id === activeQuoteId)
        ? activeQuoteId
        : quoteData[0]?.id || '';
      setActiveQuoteId(nextQuoteId);
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

  useEffect(() => {
    if (!activeQuoteId) {
      setSourceQuoteLines([]);
      return;
    }
    let cancelled = false;
    void api.getV1SourceQuoteLines(activeQuoteId)
      .then((rows) => {
        if (!cancelled) setSourceQuoteLines(rows);
      })
      .catch((error) => {
        console.warn('Failed to load quote lines', error);
        if (!cancelled) setSourceQuoteLines([]);
      });
    return () => {
      cancelled = true;
    };
  }, [activeQuoteId]);

  useEffect(() => {
    let cancelled = false;
    if (sourceQuotes.length === 0) {
      setAllQuoteLines([]);
      return;
    }
    void (async () => {
      try {
        const batches = await Promise.all(sourceQuotes.map((q) => api.getV1SourceQuoteLines(q.id)));
        if (!cancelled) setAllQuoteLines(batches.flat());
      } catch {
        if (!cancelled) setAllQuoteLines([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sourceQuotes]);

  async function refreshTakeoff(projectId: string) {
    const [lineData, summaryData] = await Promise.all([
      api.getV1TakeoffLines(projectId),
      api.getV1Summary(projectId),
    ]);
    setLines(lineData);
    setTakeoffLinesLoadedAt(new Date().toISOString());
    setSummary(summaryData);
  }

  async function refreshSourceQuotes(projectId: string, preferredQuoteId?: string | null) {
    const quotes = await api.getV1SourceQuotes(projectId);
    setSourceQuotes(quotes);
    const nextQuoteId = preferredQuoteId && quotes.some((quote) => quote.id === preferredQuoteId)
      ? preferredQuoteId
      : quotes[0]?.id || '';
    setActiveQuoteId(nextQuoteId);
    if (!nextQuoteId) setSourceQuoteLines([]);
  }

  const refreshProposalTabFresh = useCallback(
    async (projectId: string) => {
      if (pipelineNativeEnabled) {
        let list: Record<string, unknown>[] = [];
        try {
          list = await api.getV1PipelineEstimates(projectId);
        } catch {
          list = [];
        }
        setPipelineProposalEstimates(list);
        let eid = proposalNativeEstimateId;
        if (!eid) {
          eid = String((list[0] as { id?: unknown })?.id || '');
          if (eid) setProposalNativeEstimateId(eid);
        }
        if (!eid) {
          setNativeProposalLines(null);
          setNativeProposalSummary(null);
          setNativeProposalWarnings([]);
          return;
        }
        setNativeProposalLoading(true);
        try {
          const pack = await api.getV1PipelineProposalPreview(projectId, eid);
          setNativeProposalLines(pack.lines);
          setNativeProposalSummary(pack.summary);
          setNativeProposalWarnings(pack.warnings || []);
        } catch {
          setNativeProposalLines(null);
          setNativeProposalSummary(null);
          setNativeProposalWarnings([]);
        } finally {
          setNativeProposalLoading(false);
        }
      } else {
        await refreshTakeoff(projectId);
      }
    },
    [pipelineNativeEnabled, proposalNativeEstimateId]
  );

  const useNativeProposalBundle =
    pipelineNativeEnabled && nativeProposalLines !== null && nativeProposalSummary !== null;
  const proposalScheduleLines = useNativeProposalBundle ? nativeProposalLines! : lines;
  const proposalScheduleSummary = useNativeProposalBundle ? nativeProposalSummary! : summary;
  const clientProposalLineCount = useMemo(
    () => filterLinesForClientProposal(proposalScheduleLines).length,
    [proposalScheduleLines]
  );

  const proposalReadinessItems = useMemo(
    () => (project ? buildProposalReadinessItems(project, settings, proposalScheduleLines) : []),
    [project, settings, proposalScheduleLines],
  );

  useEffect(() => {
    if (loading) return;
    if (activeTab !== 'proposal') return;
    if (!project) return;
    void refreshProposalTabFresh(project.id);
  }, [activeTab, loading, project?.id, refreshProposalTabFresh]);

  const activeRoomLines = useMemo(
    () => lines.filter((line) => line.roomId === activeRoomId),
    [lines, activeRoomId]
  );

  const selectedLine = useMemo(
    () => lines.find((line) => line.id === selectedLineId) || null,
    [lines, selectedLineId]
  );

  const selectedLineModifierCount = useMemo(() => {
    if (!selectedLineId) return 0;
    return (lineModifiersByLineId[selectedLineId] || lineModifiers).length;
  }, [lineModifiers, lineModifiersByLineId, selectedLineId]);

  const scopedWorkspaceLines = useMemo(
    () => (workspaceScopeMode === 'all' ? lines : activeRoomLines),
    [activeRoomLines, lines, workspaceScopeMode]
  );

  const takeoffFilteredLines = useMemo(() => {
    return scopedWorkspaceLines.filter((line) => {
      const query = takeoffSearch.trim().toLowerCase();
      const roomLabel = rooms.find((room) => room.id === line.roomId)?.roomName || '';
      const matchesSearch = !query || [
        line.description,
        line.sku || '',
        line.category || '',
        line.notes || '',
        roomLabel,
      ].some((value) => value.toLowerCase().includes(query));
      const matched = !!line.catalogItemId;
      const matchesStatus = takeoffMatchStatus === 'all'
        ? true
        : takeoffMatchStatus === 'matched'
          ? matched
          : !matched;
      const matchesUnresolved = takeoffUnresolvedOnly ? !matched : true;
      return matchesSearch && matchesStatus && matchesUnresolved;
    });
  }, [rooms, scopedWorkspaceLines, takeoffMatchStatus, takeoffSearch, takeoffUnresolvedOnly]);

  const estimateFilteredLines = useMemo(() => {
    return scopedWorkspaceLines.filter((line) => {
      const matchesSource = estimateSourceFilter === 'all' ? true : line.sourceType === estimateSourceFilter;
      const query = estimateSearch.trim().toLowerCase();
      if (!query) return matchesSource;

      const roomLabel = rooms.find((room) => room.id === line.roomId)?.roomName || '';

      const matchesSearch = [
        line.description,
        line.sku || '',
        line.category || '',
        roomLabel,
      ].some((value) => value.toLowerCase().includes(query));
      return matchesSource && matchesSearch;
    });
  }, [estimateSearch, estimateSourceFilter, rooms, scopedWorkspaceLines]);

  const takeoffSubtotal = useMemo(
    () => takeoffFilteredLines.reduce((sum, line) => sum + line.lineTotal, 0),
    [takeoffFilteredLines]
  );

  const takeoffQuantity = useMemo(
    () => takeoffFilteredLines.reduce((sum, line) => sum + Number(line.qty || 0), 0),
    [takeoffFilteredLines]
  );

  const takeoffUnresolvedCount = useMemo(
    () => takeoffFilteredLines.filter((line) => !line.catalogItemId).length,
    [takeoffFilteredLines]
  );

  const estimateSubtotal = useMemo(
    () => estimateFilteredLines.reduce((sum, line) => sum + line.lineTotal, 0),
    [estimateFilteredLines]
  );

  useEffect(() => {
    if (!modifiersModalOpen || !selectedLine) return;
    const allowed = scopeCategoryOptions.length ? scopeCategoryOptions : [selectedLine.category || 'Uncategorized'];
    const safeCategory = String(selectedLine.category || '').trim() || String(allowed[0] || 'Uncategorized').trim();
    const unit = (String(selectedLine.unit || 'EA').trim() || 'EA') as CatalogItem['uom'];
    setAddToCatalogDraft({
      sku: String(selectedLine.sku || '').trim() || `NEW-${Math.floor(Math.random() * 100000)}`,
      category: safeCategory,
      description: String(selectedLine.description || '').trim() || 'New catalog item',
      uom: unit,
      baseMaterialCost: Number.isFinite(selectedLine.materialCost) ? Number(selectedLine.materialCost) : 0,
      baseLaborMinutes: Number.isFinite(selectedLine.laborMinutes) ? Number(selectedLine.laborMinutes) : 0,
      installLaborFamily: String((selectedLine as any).installLaborFamily || '').trim(),
    });
    setAddToCatalogOpen(false);
  }, [modifiersModalOpen, selectedLine?.id]);

  useEffect(() => {
    if (!selectedLineId) {
      setLineModifiers([]);
      return;
    }

    api.getV1LineModifiers(selectedLineId)
      .then(setLineModifiers)
      .catch(() => setLineModifiers([]));
  }, [selectedLineId]);

  useEffect(() => {
    setBulkSelectedLineIds((prev) => prev.filter((id) => lines.some((l) => l.id === id)));
  }, [lines]);

  useEffect(() => {
    if (activeTab !== 'estimate') {
      setBulkSelectedLineIds([]);
      return;
    }
    if (estimateView === 'quantities' && takeoffRoomFilter === TAKEOFF_ALL_ROOMS) {
      setBulkSelectedLineIds([]);
    }
  }, [activeTab, estimateView, takeoffRoomFilter]);

  useEffect(() => {
    if (bulkSelectedLineIds.length === 0) setBulkMoveTargetRoomId('');
  }, [bulkSelectedLineIds.length]);

  useEffect(() => {
    setHealthStripFocus(null);
  }, [activeTab, estimateView, takeoffRoomFilter, pricingOrganizeMode, pricingCategoryFilter, activeRoomId]);

  const roomSubtotal = useMemo(
    () => activeRoomLines.reduce((sum, line) => sum + line.lineTotal, 0),
    [activeRoomLines]
  );

  const pricingCategoryMetrics = useMemo(() => {
    const map = new Map<string, { count: number; subtotal: number }>();
    activeRoomLines.forEach((line) => {
      const cat = String(line.category || '').trim() || 'Uncategorized';
      const cur = map.get(cat) ?? { count: 0, subtotal: 0 };
      cur.count += 1;
      cur.subtotal += Number(line.lineTotal) || 0;
      map.set(cat, cur);
    });
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [activeRoomLines]);

  const pricingGridLines = useMemo(() => {
    if (pricingOrganizeMode !== 'categories' || pricingCategoryFilter === PRICING_ALL_CATEGORIES) {
      return activeRoomLines;
    }
    return activeRoomLines.filter((line) => {
      const cat = String(line.category || '').trim() || 'Uncategorized';
      return cat === pricingCategoryFilter;
    });
  }, [activeRoomLines, pricingOrganizeMode, pricingCategoryFilter]);

  const sortedPricingGridLines = useMemo(() => {
    if (pricingOrganizeMode !== 'categories' || pricingCategoryFilter !== PRICING_ALL_CATEGORIES) {
      return pricingGridLines;
    }
    return [...pricingGridLines].sort((a, b) => {
      const ca = String(a.category || '').trim() || 'Uncategorized';
      const cb = String(b.category || '').trim() || 'Uncategorized';
      const cmp = ca.localeCompare(cb);
      if (cmp !== 0) return cmp;
      return String(a.description || '').localeCompare(String(b.description || ''));
    });
  }, [pricingGridLines, pricingOrganizeMode, pricingCategoryFilter]);

  const pricingChipSubtotal = useMemo(
    () => pricingGridLines.reduce((sum, line) => sum + line.lineTotal, 0),
    [pricingGridLines]
  );

  useEffect(() => {
    if (estimateView !== 'pricing') return;
    if (!selectedLineId) return;
    if (!sortedPricingGridLines.some((l) => l.id === selectedLineId)) {
      setSelectedLineId(null);
    }
  }, [estimateView, sortedPricingGridLines, selectedLineId]);

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

  const pricingMode: PricingMode = project?.pricingMode || 'labor_and_material';
  const showMaterial = pricingMode !== 'labor_only';
  const showLabor = !isMaterialOnlyMainBid(pricingMode);

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

  const fieldScheduleHint = useMemo(
    () =>
      computeFieldScheduleHint({
        installerCount: jobConditions.installerCount,
        totalLaborHours: summary?.totalLaborHours ?? 0,
        engineDurationDays: summary?.durationDays ?? 0,
        roomCount: rooms.length,
      }),
    [jobConditions.installerCount, summary?.totalLaborHours, summary?.durationDays, rooms.length]
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

  const estimateHealthLines = useMemo(
    () => (estimateView === 'quantities' ? takeoffGridLines : sortedPricingGridLines),
    [estimateView, takeoffGridLines, sortedPricingGridLines]
  );

  const estimateHealthDerived = useMemo(
    () => deriveEstimateLineHealth(estimateHealthLines, pricingMode),
    [estimateHealthLines, pricingMode]
  );

  const healthHighlightLineIds = useMemo(() => {
    if (!healthStripFocus) return null;
    const src =
      healthStripFocus === 'material'
        ? estimateHealthDerived.missingMaterial.lineIds
        : healthStripFocus === 'labor'
          ? estimateHealthDerived.missingLabor.lineIds
          : estimateHealthDerived.missingInstallFamily.lineIds;
    const visible = new Set(estimateHealthLines.map((l) => l.id));
    const out = new Set<string>();
    for (const id of src) {
      if (visible.has(id)) out.add(id);
    }
    return out.size > 0 ? out : null;
  }, [healthStripFocus, estimateHealthDerived, estimateHealthLines]);

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

  const estimateProjectLineStats = useMemo(
    () =>
      lines.reduce(
        (acc, line) => ({
          lineCount: acc.lineCount + 1,
          totalQty: acc.totalQty + (Number(line.qty) || 0),
          laborMinutes: acc.laborMinutes + Number(line.laborMinutes || 0) * (Number(line.qty) || 0),
        }),
        { lineCount: 0, totalQty: 0, laborMinutes: 0 }
      ),
    [lines]
  );

  /**
   * Bid-bucket tally for the estimate workspace toolbar. Mirrors the intake review
   * bid-split banner so the user keeps visibility of base vs. alternate splits after
   * finalize. Only lines that carry `sourceBidBucket` contribute; lines without a
   * bucket are ignored (they normally already roll into the main total).
   */
  const bidBucketStatsForToolbar = useMemo<EstimateToolbarBidBucketStat[]>(() => {
    type Acc = { key: string; kind: EstimateToolbarBidBucketStat['kind']; lineCount: number; laborMinutes: number };
    const map = new Map<string, Acc>();
    for (const line of lines) {
      const raw = (line.sourceBidBucket || '').trim();
      if (!raw) continue;
      const key = raw;
      const kind = classifyBidBucketKind(raw) as EstimateToolbarBidBucketStat['kind'];
      const qty = Number(line.qty || 0);
      const minutes = Number(line.laborMinutes || 0) * qty;
      const existing = map.get(key) || { key, kind, lineCount: 0, laborMinutes: 0 };
      existing.lineCount += 1;
      existing.laborMinutes += minutes;
      map.set(key, existing);
    }
    return Array.from(map.values()).sort((a, b) =>
      compareBidBucketKeys({ key: a.key, kind: a.kind, label: a.key }, { key: b.key, kind: b.kind, label: b.key })
    );
  }, [lines]);

  function selectWorkspaceRoom(roomId: string) {
    setActiveRoomId(roomId);
    setTakeoffRoomFilter(roomId);
  }

  const categories = workspaceCatalogCategories;

  const scopeCategoryOptions = useMemo(
    () => categories.filter((category) => category !== 'all'),
    [categories]
  );

  const catalogImageById = useMemo(() => {
    const m = new Map<string, string>();
    for (const item of referencedCatalogItems) {
      const u = item.imageUrl?.trim();
      if (u) m.set(item.id, u);
    }
    return m;
  }, [referencedCatalogItems]);

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

  function patchProjectDate(value: string) {
    if (!project) return;
    setProject({ ...project, bidDate: value || null, proposalDate: value || null, dueDate: value || null });
  }

  function applyWorkspaceDeliveryRecommendation(distance: number | null, options?: { difficulty?: ProjectJobConditions['deliveryDifficulty']; force?: boolean }) {
    const current = normalizeProjectJobConditions(project?.jobConditions || createDefaultProjectJobConditions());
    if (!options?.force && !current.deliveryAutoCalculated && current.deliveryValue > 0) {
      return;
    }

    patchJobConditions({
      ...recommendDeliveryPlan(distance, options?.difficulty ?? current.deliveryDifficulty),
      deliveryAutoCalculated: true,
    });
  }

  function promptForPhasedWork(enable: boolean) {
    if (!enable) {
      patchJobConditions({ phasedWork: false, phasedWorkPhases: 1, phasedWorkMultiplier: 0 });
      return;
    }

    const response = window.prompt('How many phases should this job be split into?', String(Math.max(2, jobConditions.phasedWorkPhases || 2)));
    if (response === null) return;
    const phaseCount = Math.max(2, Number(response) || 2);
    patchJobConditions({
      phasedWork: true,
      phasedWorkPhases: phaseCount,
      phasedWorkMultiplier: recommendedPhasedWorkMultiplier(phaseCount),
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
      patchJobConditions({ travelDistanceMiles: null, deliveryRequired: false, deliveryPricingMode: 'included', deliveryValue: 0, deliveryLeadDays: 0 });
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
      applyWorkspaceDeliveryRecommendation(distance, { force: jobConditions.deliveryAutoCalculated });
    } catch (error) {
      console.error('Distance lookup failed', error);
      setDistanceError('Distance lookup failed.');
    } finally {
      setDistanceCalculating(false);
    }
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
      @page { size: Letter; margin: 0.5in; }
      html, body { background: #ffffff !important; margin: 0; padding: 0; }
      body { color: #0f172a; }
      .print-proposal { max-width: 100% !important; margin: 0 auto !important; box-shadow: none !important; }
      .proposal-document { box-shadow: none !important; }
      .proposal-document header { display: block !important; }
      .proposal-document img { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .workspace-top-header { display: none !important; }
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

  async function ensureProposalIsFresh(): Promise<void> {
    if (!project) return;
    await refreshProposalTabFresh(project.id);
    // Let React flush the updated proposal DOM before we capture it.
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
  }

  async function printProposalDocument() {
    if (!project) return;
    await ensureProposalIsFresh();
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
    // Firefox 79+ even when popups are allowed ? do not use it here; we need the Window handle.
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
      window.alert('Unable to prepare printing. Use Export HTML to save a file, then open it and print.');
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
    await ensureProposalIsFresh();
    const container = getProposalContainer();
    if (!container) return;

    const proposalSettings = ensureProposalDefaults(settings);
    const getProposalFileStem = () => {
      const base = [project.projectNumber, project.projectName].filter(Boolean).join(' - ').trim();
      return base.replace(/[\\/:*?"<>|]+/g, '').slice(0, 120) || `proposal-${project.id}`;
    };
    const doc = new jsPDF({ unit: 'pt', format: 'letter' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const marginX = 46;
    const marginTop = 52;
    const maxTextWidth = pageWidth - (marginX * 2);
    const showMaterialPricing = pricingMode !== 'labor_only';
    const showLaborPricing = pricingMode !== 'material_only';
    const schedSummary = proposalScheduleSummary;
    if (!schedSummary) return;
    const clientProposalLines = filterLinesForClientProposal(proposalScheduleLines);
    const scheduleSections = buildProposalScheduleSections(
      clientProposalLines,
      showMaterialPricing,
      showLaborPricing,
      schedSummary.conditionLaborHoursMultiplier || 1,
      null,
      'cost_bucket'
    );
    const introSource = (proposalSettings.proposalIntro || DEFAULT_PROPOSAL_INTRO)
      .split(/\n\n+/)
      .map((paragraph) => paragraph.trim())
      .filter(Boolean)[0] || DEFAULT_PROPOSAL_INTRO;
    const introLines = doc.splitTextToSize(introSource, maxTextWidth);
    const terms = splitProposalTextLines(proposalSettings.proposalTerms || DEFAULT_PROPOSAL_TERMS);
    const exclusions = splitProposalTextLines(proposalSettings.proposalExclusions || DEFAULT_PROPOSAL_EXCLUSIONS);
    const clarifications = splitProposalTextLines(proposalSettings.proposalClarifications || DEFAULT_PROPOSAL_CLARIFICATIONS);
    const acceptanceLabel = proposalSettings.proposalAcceptanceLabel || DEFAULT_PROPOSAL_ACCEPTANCE_LABEL;
    const activeProjectDate = project.bidDate || project.proposalDate || project.dueDate;
    const proposalDate = activeProjectDate ? new Date(activeProjectDate).toLocaleDateString() : new Date().toLocaleDateString();
    const companyName = proposalSettings.companyName || 'Brighten Builders';
    const companyAddress = proposalSettings.companyAddress || '';
    const companyPhone = proposalSettings.companyPhone || '';
    const companyEmail = proposalSettings.companyEmail || '';
    const companyWebsite = '';
    const clientName = project.clientName || 'Client';
    const writeSectionTitle = (title: string, top: number) => {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(100, 116, 139);
      doc.text(title.toUpperCase(), marginX, top);
    };
    const ensurePageSpace = (cursor: number, required: number): number => {
      if (cursor + required <= pageHeight - 48) return cursor;
      doc.addPage();
      return marginTop;
    };

    let cursorY = marginTop;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(24);
    doc.setTextColor(15, 23, 42);
    doc.text(companyName, marginX, cursorY);

    cursorY += 18;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(71, 85, 105);
    [companyAddress, companyPhone, companyEmail, companyWebsite].filter(Boolean).forEach((line) => {
      doc.text(String(line), marginX, cursorY);
      cursorY += 13;
    });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(22);
    doc.setTextColor(15, 23, 42);
    doc.text('Project Proposal', pageWidth - marginX, marginTop, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(71, 85, 105);
    doc.text(`Prepared for ${clientName}`, pageWidth - marginX, marginTop + 18, { align: 'right' });
    doc.text(`Proposal date ${proposalDate}`, pageWidth - marginX, marginTop + 31, { align: 'right' });
    if (project.projectNumber) {
      doc.text(`Project #${project.projectNumber}`, pageWidth - marginX, marginTop + 44, { align: 'right' });
    }

    cursorY = Math.max(cursorY, marginTop + 72) + 16;
    writeSectionTitle('Introduction', cursorY);
    cursorY += 16;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.setTextColor(51, 65, 85);
    introLines.forEach((line: string) => {
      cursorY = ensurePageSpace(cursorY, 16);
      doc.text(line, marginX, cursorY);
      cursorY += 15;
    });

    scheduleSections.forEach((section, index) => {
      cursorY += index === 0 ? 18 : 22;
      cursorY = ensurePageSpace(cursorY, 180);
      writeSectionTitle(section.section, cursorY);
      cursorY += 14;
      autoTable(doc, {
        startY: cursorY,
        theme: 'grid',
        styles: { fontSize: 8.75, cellPadding: 5, textColor: [15, 23, 42], lineColor: [226, 232, 240] },
        headStyles: { fillColor: [248, 250, 252], textColor: [71, 85, 105], fontStyle: 'bold' },
        bodyStyles: { fillColor: [255, 255, 255] },
        margin: { left: marginX, right: marginX },
        head: [['Item / Description', 'Qty', 'Material', 'Labor']],
        body: section.items.map((item) => [
          item.description,
          formatNumberSafe(item.quantity, Number.isInteger(item.quantity) ? 0 : 2),
          formatCurrencySafe(item.materialCost),
          formatCurrencySafe(item.laborCost),
        ]),
        columnStyles: {
          0: { cellWidth: 286 },
          1: { halign: 'right', cellWidth: 55 },
          2: { halign: 'right', cellWidth: 90 },
          3: { halign: 'right', cellWidth: 90 },
        },
        didDrawPage: ({ pageNumber }) => {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(9);
          doc.setTextColor(148, 163, 184);
          doc.text(`Proposal ${getProposalFileStem()} ? Page ${pageNumber}`, pageWidth - marginX, pageHeight - 22, { align: 'right' });
        },
      });
      cursorY = ((doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || cursorY) + 12;

      const totalsRows = [
        ['Material', formatCurrencySafe(section.totalMaterialCost)],
        ['Labor', formatCurrencySafe(section.totalLaborCost)],
        ['Estimated Install Duration', formatWorkWeeksLabel(calculateWorkDuration(section.totalLaborHours, project.jobConditions).durationWeeks)],
        ['Section Total', formatCurrencySafe(section.sectionTotal)],
      ];

      cursorY = ensurePageSpace(cursorY, 110);
      autoTable(doc, {
        startY: cursorY,
        theme: 'grid',
        styles: { fontSize: 9, cellPadding: 5, textColor: [15, 23, 42], lineColor: [226, 232, 240] },
        bodyStyles: { fillColor: [248, 250, 252] },
        margin: { left: pageWidth - marginX - 240, right: marginX },
        body: totalsRows,
        columnStyles: {
          0: { cellWidth: 150 },
          1: { halign: 'right', cellWidth: 90 },
        },
      });
      cursorY = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || cursorY;
    });

    const writeBulletSection = (title: string, items: string[], minimumHeight = 80) => {
      cursorY += 20;
      cursorY = ensurePageSpace(cursorY, minimumHeight);
      writeSectionTitle(title, cursorY);
      cursorY += 16;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(51, 65, 85);

      items.forEach((item) => {
        const wrapped = doc.splitTextToSize(`? ${item}`, maxTextWidth - 8);
        cursorY = ensurePageSpace(cursorY, wrapped.length * 12 + 4);
        doc.text(wrapped, marginX, cursorY);
        cursorY += wrapped.length * 12;
      });
    };

    if (project.specialNotes?.trim()) {
      writeBulletSection('Additional Notes', [project.specialNotes.trim()], 72);
    }

    cursorY += 20;
    cursorY = ensurePageSpace(cursorY, 140);
    writeSectionTitle('Project Totals', cursorY);
    cursorY += 14;
    autoTable(doc, {
      startY: cursorY,
      theme: 'grid',
      styles: { fontSize: 9.5, cellPadding: 5, textColor: [15, 23, 42], lineColor: [226, 232, 240] },
      headStyles: { fillColor: [248, 250, 252], textColor: [71, 85, 105], fontStyle: 'bold' },
      margin: { left: marginX, right: marginX },
      head: [['Line', 'Amount']],
      body: [
        ['Total Material', formatCurrencySafe(showMaterialPricing ? schedSummary.materialSubtotal : 0)],
        ['Total Labor', formatCurrencySafe(showLaborPricing ? schedSummary.adjustedLaborSubtotal || schedSummary.laborSubtotal : 0)],
        ['Estimated Install Duration', formatWorkWeeksLabel(schedSummary.durationWeeks || 0)],
        ['Total Proposal Amount', formatCurrencySafe(schedSummary.baseBidTotal)],
      ],
      columnStyles: {
        0: { cellWidth: 330 },
        1: { halign: 'right', cellWidth: 120 },
      },
    });
    cursorY = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || cursorY;

    writeBulletSection('Terms', terms, 96);
    writeBulletSection('Exclusions', exclusions, 96);
    writeBulletSection('Clarifications', clarifications, 96);

    cursorY += 26;
    cursorY = ensurePageSpace(cursorY, 92);
    writeSectionTitle('Acceptance', cursorY);
    cursorY += 24;
    doc.setDrawColor(148, 163, 184);
    doc.line(marginX, cursorY, marginX + 220, cursorY);
    doc.line(pageWidth - marginX - 180, cursorY, pageWidth - marginX, cursorY);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(71, 85, 105);
    doc.text(acceptanceLabel, marginX, cursorY + 14);
    doc.text('Date', pageWidth - marginX - 180, cursorY + 14);

    doc.save(`${getProposalFileStem()}.pdf`);
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
    try {
      const saved = await api.updateV1Settings(settings);
      setSettings(ensureProposalDefaults(saved));
      setLastSavedAt(new Date().toISOString());
    } catch (error) {
      console.error('Failed to save proposal wording', error);
      window.alert('Unable to save proposal wording right now.');
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
    setSelectedLineId(created.id);
    await refreshTakeoff(project.id);
  }

  async function addCatalogItemQuick(item: CatalogItem, qty = 1, roomId = activeRoomId) {
    if (!project || !roomId) return;
    const created = await api.createV1TakeoffLine({
      projectId: project.id,
      roomId,
      sourceType: 'catalog',
      sourceRef: item.sku || null,
      description: item.description,
      sku: item.sku,
      category: item.category,
      subcategory: item.subcategory || null,
      qty,
      unit: item.uom,
      materialCost: item.baseMaterialCost,
      laborMinutes: item.baseLaborMinutes,
      laborCost: 0,
      catalogItemId: item.id,
      notes: '',
    });
    setLines((prev) => [...prev, created]);
    setSelectedLineId(created.id);
    await refreshTakeoff(project.id);
  }

  async function addPartitionLayoutLines(roomId: string, generated: PartitionLayoutGeneratedLine[]) {
    if (!project) return;
    for (const line of generated) {
      const base = {
        projectId: project.id,
        roomId,
        sourceType: 'manual' as const,
        description: line.description,
        qty: line.qty,
        unit: line.unit,
        category: line.category,
        materialCost: 0,
        laborCost: 0,
        laborMinutes: line.laborMinutes,
        notes: line.notes,
        isInstallableScope: line.isInstallableScope,
      };
      await api.createV1TakeoffLine({
        ...base,
        ...(line.installLaborFamily ? { installLaborFamily: line.installLaborFamily } : {}),
        ...(line.installScopeType ? { installScopeType: line.installScopeType } : {}),
        ...(line.laborOrigin ? { laborOrigin: line.laborOrigin } : {}),
        ...(line.generatedLaborMinutes != null ? { generatedLaborMinutes: line.generatedLaborMinutes } : {}),
        ...(line.catalogItemId ? { catalogItemId: line.catalogItemId, sku: line.sku ?? null } : {}),
      });
    }
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
  /**
   * Labor minutes per unit field ? lets the estimator adjust the install timer
   * directly rather than only through labor dollars. Clearing this to a new
   * number re-drives labor cost via the server's labor-rate ? minutes rule on
   * the next persist (takeoffRepo.updateTakeoffLine re-derives labor cost from
   * minutes when the caller omits a labor-cost override or provides zero).
   */
  const lineLaborMinutesField = useTransientNumericField({
    syncKey: `${lineEditorId}-labor-minutes`,
    committed: selectedLine?.laborMinutes ?? 0,
    onLive: (n) => {
      if (lineEditorId) patchLineLocal(lineEditorId, { laborMinutes: n });
    },
    onCommit: (n) => {
      if (lineEditorId) {
        patchLineLocal(lineEditorId, { laborMinutes: n, laborCost: 0, baseLaborCost: 0 });
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
    setBulkSelectedLineIds((prev) => prev.filter((id) => id !== lineId));
    if (selectedLineId === lineId) setSelectedLineId(null);
    await refreshTakeoff(project.id);
  }

  function toggleBulkLine(lineId: string) {
    setBulkSelectedLineIds((prev) => {
      const next = new Set(prev);
      if (next.has(lineId)) next.delete(lineId);
      else next.add(lineId);
      return Array.from(next);
    });
  }

  function applyBulkHeaderVisible(visibleConcreteIds: string[]) {
    setBulkSelectedLineIds((prev) =>
      Array.from(toggleBulkSelectionForVisibleConcrete(new Set(prev), visibleConcreteIds))
    );
  }

  async function bulkDeleteSelectedLines() {
    if (!project || bulkSelectedLineIds.length === 0) return;
    const ids = Array.from(new Set<string>(bulkSelectedLineIds));
    if (!window.confirm(`Delete ${ids.length} line item(s)? This cannot be undone.`)) return;
    try {
      await Promise.all(ids.map((lineId) => api.deleteV1TakeoffLine(lineId)));
      setBulkSelectedLineIds([]);
      if (selectedLineId !== null && ids.includes(selectedLineId)) setSelectedLineId(null);
    } catch (error) {
      console.error('Bulk delete failed', error);
      window.alert(error instanceof Error ? error.message : 'Could not delete all lines.');
    }
    await refreshTakeoff(project.id);
  }

  async function bulkMoveSelectedLinesToRoom(targetRoomId: string) {
    if (!project || bulkSelectedLineIds.length === 0) return;
    const trimmed = String(targetRoomId || '').trim();
    if (!trimmed) return;
    const ids = Array.from(new Set<string>(bulkSelectedLineIds));
    const targetRoom = rooms.find((r) => r.id === trimmed);
    if (!targetRoom || targetRoom.projectId !== project.id) {
      window.alert('Choose a valid room in this project.');
      return;
    }
    if (rooms.length < 2) {
      window.alert('Add at least two rooms to move lines between them.');
      return;
    }
    if (!window.confirm(`Move ${ids.length} line item(s) to "${targetRoom.roomName}"?`)) return;
    try {
      await api.bulkMoveV1TakeoffLines({ lineIds: ids, roomId: trimmed });
      setBulkSelectedLineIds([]);
      setBulkMoveTargetRoomId('');
    } catch (error) {
      console.error('Bulk move failed', error);
      window.alert(error instanceof Error ? error.message : 'Could not move lines.');
    }
    await refreshTakeoff(project.id);
  }

  async function duplicateLine(lineId: string) {
    if (!project) return;
    if (!activeRoomId) {
      window.alert('Choose a room under "Room for new lines" first.');
      return;
    }
    try {
      const created = await api.duplicateV1TakeoffLine(lineId, { roomId: activeRoomId });
      await refreshTakeoff(project.id);
      setSelectedLineId(created.id);
    } catch (error) {
      console.error('Failed to duplicate line', error);
      window.alert(error instanceof Error ? error.message : 'Could not duplicate line.');
    }
  }

  async function createCatalogItemFromSelectedLine() {
    if (!project || !selectedLine || !addToCatalogDraft || addToCatalogBusy) return;
    const draft = addToCatalogDraft;
    if (!draft.description.trim()) {
      window.alert('Description is required.');
      return;
    }
    if (!draft.sku.trim()) {
      window.alert('SKU is required.');
      return;
    }
    if (!draft.category.trim()) {
      window.alert('Category is required.');
      return;
    }

    setAddToCatalogBusy(true);
    try {
      const created = await api.createCatalogItem({
        id: crypto.randomUUID(),
        sku: draft.sku.trim(),
        canonicalSku: draft.sku.trim(),
        isCanonical: true,
        category: draft.category.trim(),
        description: draft.description.trim(),
        uom: draft.uom,
        baseMaterialCost: Number.isFinite(draft.baseMaterialCost) ? draft.baseMaterialCost : 0,
        baseLaborMinutes: Number.isFinite(draft.baseLaborMinutes) ? draft.baseLaborMinutes : 0,
        installLaborFamily: draft.installLaborFamily.trim() ? draft.installLaborFamily.trim() : null,
        taxable: true,
        adaFlag: false,
        active: true,
        tags: [],
      } as CatalogItem);

      setReferencedCatalogItems((prev) => {
        const m = new Map(prev.map((i) => [i.id, i]));
        m.set(created.id, created);
        return Array.from(m.values());
      });
      setCatalogBrowseItems((prev) => {
        const m = new Map(prev.map((i) => [i.id, i]));
        m.set(created.id, created);
        return Array.from(m.values());
      });
      await persistLine(selectedLine.id, {
        catalogItemId: created.id,
        sku: created.sku,
        category: created.category,
      });
      window.dispatchEvent(new CustomEvent('catalog-synced'));
      setAddToCatalogOpen(false);
    } catch (e) {
      console.error('Add to catalog failed', e);
      window.alert(e instanceof Error ? e.message : 'Add to catalog failed.');
    } finally {
      setAddToCatalogBusy(false);
    }
  }

  function selectEstimateLine(lineId: string) {
    setSelectedLineId(lineId);
  }

  const openInstallAssumptionsDrawer = useCallback((lineId: string) => {
    setSelectedLineId(lineId);
    setInstallAssumptionsDrawerOpen(true);
    if (activeTab !== 'estimate') goToTab('estimate');
  }, [activeTab, goToTab]);

  const focusInstallAssumptionsForLine = useCallback((lineId: string) => {
    openInstallAssumptionsDrawer(lineId);
  }, [openInstallAssumptionsDrawer]);

  async function applyModifier(modifierId: string) {
    if (!project) {
      window.alert('No project loaded.');
      return;
    }
    if (!selectedLineId) {
      window.alert('Select a line item first before applying a modifier.');
      return;
    }
    try {
      const result = await api.applyV1ModifierToLine(selectedLineId, modifierId);
      setLines((prev) => prev.map((line) => (line.id === selectedLineId ? result.line : line)));
      setLineModifiers(await api.getV1LineModifiers(selectedLineId));
      await refreshTakeoff(project.id);
    } catch (error) {
      console.error('Failed to apply modifier', error);
      window.alert(error instanceof Error ? error.message : 'Could not apply modifier.');
    }
  }

  async function removeModifier(lineModifierId: string) {
    if (!project || !selectedLineId) return;
    try {
      const result = await api.removeV1LineModifier(selectedLineId, lineModifierId);
      setLines((prev) => prev.map((line) => (line.id === selectedLineId ? result.line : line)));
      setLineModifiers(await api.getV1LineModifiers(selectedLineId));
      await refreshTakeoff(project.id);
    } catch (error) {
      console.error('Failed to remove modifier', error);
      window.alert(error instanceof Error ? error.message : 'Could not remove modifier.');
    }
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

  async function uploadProjectFileRecord(file: File): Promise<ProjectFileRecord> {
    if (!project) {
      throw new Error('Project is required before uploading files.');
    }
    const dataBase64 = await toBase64Payload(file);
    const created = await api.uploadV1ProjectFile({
      projectId: project.id,
      fileName: file.name,
      mimeType: file.type || 'application/octet-stream',
      sizeBytes: file.size,
      dataBase64,
    });
    setProjectFiles((prev) => [created, ...prev]);
    return created;
  }

  async function uploadProjectFile(file: File | undefined) {
    if (!project || !file) return;
    setFileUploading(true);
    try {
      await uploadProjectFileRecord(file);
    } catch (error: unknown) {
      window.alert(getErrorMessage(error, 'File upload failed.'));
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

  async function removeStructuredAssumption(assumptionId: string) {
    if (!project) return;
    const next = (project.structuredAssumptions || []).filter((a) => a.id !== assumptionId);
    try {
      const saved = await api.updateV1Project(project.id, { structuredAssumptions: next });
      setProject(saved);
    } catch (error: unknown) {
      window.alert(getErrorMessage(error, 'Could not update assumptions.'));
    }
  }

  async function createSourceQuote(input: {
    vendorName: string;
    quoteNumber: string;
    quoteDate: string;
    notes: string;
    file: File | null;
  }) {
    if (!project) return;
    setFileUploading(Boolean(input.file));
    try {
      let sourceFileId: string | null = null;
      if (input.file) {
        const fileRecord = await uploadProjectFileRecord(input.file);
        sourceFileId = fileRecord.id;
      }
      const created = await api.createV1SourceQuote({
        projectId: project.id,
        vendorName: input.vendorName,
        quoteNumber: input.quoteNumber || null,
        quoteDate: input.quoteDate || null,
        deliveryDate: null,
        shipTo: null,
        notes: input.notes || null,
        sourceFileId,
      });
      await refreshSourceQuotes(project.id, created.id);
      if (sourceFileId) {
        const extracted = await api.extractV1SourceQuoteFromFile(created.id, { replaceExisting: true });
        await refreshSourceQuotes(project.id, created.id);
        setActionFeedback({
          tone: 'success',
          message: extracted.rowsCreated > 0
            ? `Quote created and parsed ${extracted.rowsCreated} staged row${extracted.rowsCreated === 1 ? '' : 's'}.`
            : 'Quote created. No priced table rows were detected; add lines manually.',
        });
        return;
      }
      setActionFeedback({ tone: 'success', message: 'Quote record created.' });
    } catch (error) {
      window.alert(getErrorMessage(error, 'Could not create quote.'));
    } finally {
      setFileUploading(false);
    }
  }

  async function updateSourceQuote(quoteId: string, updates: Partial<SourceQuoteRecord>) {
    if (!project) return;
    try {
      const updated = await api.updateV1SourceQuote(quoteId, updates);
      setSourceQuotes((prev) => prev.map((quote) => (quote.id === quoteId ? updated : quote)));
    } catch (error) {
      window.alert(getErrorMessage(error, 'Could not update quote.'));
    }
  }

  async function deleteSourceQuote(quoteId: string) {
    if (!project) return;
    if (!window.confirm('Delete this quote and all staged quote lines?')) return;
    try {
      await api.deleteV1SourceQuote(quoteId);
      const remainingQuotes = sourceQuotes.filter((quote) => quote.id !== quoteId);
      setSourceQuotes(remainingQuotes);
      const nextQuoteId = remainingQuotes[0]?.id || '';
      setActiveQuoteId(nextQuoteId);
      if (!nextQuoteId) setSourceQuoteLines([]);
      setActionFeedback({ tone: 'info', message: 'Quote removed.' });
    } catch (error) {
      window.alert(getErrorMessage(error, 'Could not delete quote.'));
    }
  }

  async function addSourceQuoteLine(quoteId: string, draft: {
    rawDescription: string;
    manufacturer: string;
    skuModel: string;
    qty: number;
    unit: string;
    unitCost?: number | null;
    totalCost?: number | null;
    materialCost: number;
    notes: string;
    rowType?: SourceQuoteLineRecord['rowType'];
  }) {
    try {
      const created = await api.createV1SourceQuoteLine(quoteId, {
        rawDescription: draft.rawDescription,
        normalizedDescription: draft.rawDescription,
        manufacturer: draft.manufacturer || null,
        skuModel: draft.skuModel || null,
        qty: draft.qty,
        unit: draft.unit,
        unitCost: draft.unitCost ?? null,
        totalCost: draft.totalCost ?? null,
        materialCost: draft.materialCost,
        rowType: draft.rowType || 'material',
        notes: draft.notes || null,
        importSelected: true,
      });
      setSourceQuoteLines((prev) => [...prev, created]);
      await refreshSourceQuotes(project!.id, quoteId);
    } catch (error) {
      window.alert(getErrorMessage(error, 'Could not add quote line.'));
    }
  }

  async function addSourceQuoteLinesBulk(quoteId: string, drafts: Array<{
    rawDescription: string;
    manufacturer: string;
    skuModel: string;
    qty: number;
    unit: string;
    unitCost?: number | null;
    totalCost?: number | null;
    materialCost: number;
    notes: string;
    rowType?: SourceQuoteLineRecord['rowType'];
  }>) {
    if (!project || drafts.length === 0) return;
    try {
      const created = await api.createV1SourceQuoteLinesBulk(
        quoteId,
        drafts.map((draft) => ({
          rawDescription: draft.rawDescription,
          normalizedDescription: draft.rawDescription,
          manufacturer: draft.manufacturer || null,
          skuModel: draft.skuModel || null,
          qty: draft.qty,
          unit: draft.unit,
          unitCost: draft.unitCost ?? null,
          totalCost: draft.totalCost ?? null,
          materialCost: draft.materialCost,
          rowType: draft.rowType || 'material',
          notes: draft.notes || null,
          importSelected: true,
        }))
      );
      if (created.length > 0) {
        setSourceQuoteLines((prev) => [...prev, ...created]);
      }
      await refreshSourceQuotes(project.id, quoteId);
      if (created.length > 0) {
        setActionFeedback({ tone: 'success', message: `Added ${created.length} quote line${created.length === 1 ? '' : 's'}.` });
      }
    } catch (error) {
      window.alert(getErrorMessage(error, 'Could not add quote lines in bulk.'));
    }
  }

  async function updateSourceQuoteLine(quoteId: string, lineId: string, updates: Partial<SourceQuoteLineRecord>) {
    try {
      const updated = await api.updateV1SourceQuoteLine(quoteId, lineId, updates);
      setSourceQuoteLines((prev) => prev.map((line) => (line.id === lineId ? updated : line)));
      if (project) await refreshSourceQuotes(project.id, quoteId);
    } catch (error) {
      window.alert(getErrorMessage(error, 'Could not update quote line.'));
    }
  }

  async function deleteSourceQuoteLine(quoteId: string, lineId: string) {
    if (!project) return;
    try {
      await api.deleteV1SourceQuoteLine(quoteId, lineId);
      setSourceQuoteLines((prev) => prev.filter((line) => line.id !== lineId));
      await refreshSourceQuotes(project.id, quoteId);
    } catch (error) {
      window.alert(getErrorMessage(error, 'Could not delete quote line.'));
    }
  }

  async function importSelectedQuoteLines(quoteId: string) {
    if (!project) return;
    try {
      const quote = sourceQuotes.find((entry) => entry.id === quoteId);
      const created = await api.importV1SelectedQuoteLines(quoteId);
      if (created.length === 0) {
        setActionFeedback({ tone: 'warning', message: 'No selected quote lines were imported.' });
        return;
      }
      await Promise.all([
        refreshTakeoff(project.id),
        refreshSourceQuotes(project.id, quoteId),
      ]);
      if (quote) {
        const quoteLinesForSummary = await api.getV1SourceQuoteLines(quoteId);
        setSourceQuoteLines(quoteLinesForSummary);
        const summary = buildQuoteImportResultSummary({
          quote,
          quoteLines: quoteLinesForSummary,
          createdEstimateLines: created,
          pricingMode: project.pricingMode,
          project,
        });
        setQuoteImportResult(summary);
        setQuoteImportResultOpen(true);
      }
      setActionFeedback({
        tone: 'success',
        message: `Imported ${created.length} quote line${created.length === 1 ? '' : 's'} into the estimate.`,
      });
    } catch (error) {
      window.alert(getErrorMessage(error, 'Could not import selected quote lines.'));
    }
  }

  function closeQuoteImportResultModal() {
    setQuoteImportResultOpen(false);
  }

  function goToEstimateFromImportResult(selectPausedLine = false) {
    closeQuoteImportResultModal();
    goToTab('estimate');
    if (selectPausedLine && quoteImportResult?.laborPaused[0]) {
      openInstallAssumptionsDrawer(quoteImportResult.laborPaused[0].id);
      setHealthStripFocus('labor');
    }
  }

  async function saveInstallAssumptions(input: {
    scope: InstallAssumptionApplyScope;
    lineAssumptions: Record<string, string>;
    projectBlockingStatus?: '' | 'included' | 'by_others' | 'unknown';
    projectWallSubstrate?: string | null;
    recalculateLabor: boolean;
  }) {
    if (!project || !selectedLineId) return;
    setInstallAssumptionsBusy(true);
    try {
      if (input.scope === 'project') {
        const updates: Partial<ProjectRecord> = {};
        if (input.projectWallSubstrate !== undefined) {
          updates.wallSubstrate = input.projectWallSubstrate;
        }
        if (input.projectBlockingStatus !== undefined) {
          updates.structuredAssumptions = buildProjectBlockingAssumptions(project, input.projectBlockingStatus);
        }
        if (Object.keys(updates).length > 0) {
          const saved = await api.updateV1Project(project.id, updates);
          setProject(saved);
        }
      }
      await api.applyV1TakeoffInstallAssumptions(selectedLineId, {
        lineAssumptions: input.scope === 'line' ? input.lineAssumptions : {},
        replaceLineAssumptions: input.scope === 'project',
        recalculateLabor: input.recalculateLabor,
      });
      await refreshTakeoff(project.id);
      setInstallAssumptionsDrawerOpen(false);
      setActionFeedback({
        tone: 'success',
        message: input.recalculateLabor
          ? 'Install assumptions saved and labor recalculated.'
          : 'Install assumptions saved.',
      });
    } catch (error) {
      window.alert(getErrorMessage(error, 'Could not save install assumptions.'));
    } finally {
      setInstallAssumptionsBusy(false);
    }
  }

  async function extractSourceQuoteFromFile(quoteId: string, replaceExisting = true) {
    if (!project) return;
    try {
      const extracted = await api.extractV1SourceQuoteFromFile(quoteId, { replaceExisting });
      await refreshSourceQuotes(project.id, quoteId);
      if (extracted.rowsCreated > 0) {
        setActionFeedback({ tone: 'success', message: `Parsed ${extracted.rowsCreated} staged row${extracted.rowsCreated === 1 ? '' : 's'} from the source file.` });
      } else {
        setActionFeedback({ tone: 'warning', message: 'No usable priced rows were detected. You can still stage rows manually.' });
      }
    } catch (error) {
      window.alert(getErrorMessage(error, 'Could not parse attached quote file.'));
    }
  }

  async function promoteQuoteLinesToCatalogCandidates(
    quoteId: string,
    selectedLineIds: string[],
    includeNonCatalogTypes = false
  ): Promise<{ promotedCount: number; skippedCount: number }> {
    if (!project) return { promotedCount: 0, skippedCount: 0 };
    try {
      const result = await api.promoteV1QuoteLinesToCatalogCandidates(quoteId, {
        selectedLineIds,
        includeNonCatalogTypes,
      });
      await refreshSourceQuotes(project.id, quoteId);
      setActionFeedback({
        tone: result.promotedCount > 0 ? 'success' : 'warning',
        message: result.promotedCount > 0
          ? `Promoted ${result.promotedCount} line${result.promotedCount === 1 ? '' : 's'} to catalog review.${result.skippedCount > 0 ? ` Skipped ${result.skippedCount} non-catalog row${result.skippedCount === 1 ? '' : 's'}.` : ''}`
          : 'No lines were promoted to catalog review.',
      });
      return result;
    } catch (error) {
      window.alert(getErrorMessage(error, 'Could not promote lines to catalog review.'));
      return { promotedCount: 0, skippedCount: 0 };
    }
  }

  async function generateProposalDraft(mode: 'scope_summary' | 'proposal_text' | 'terms_and_conditions' | 'default_short') {
    if (!project || !settings || !proposalScheduleSummary) return;

    setProposalDrafting(mode);
    try {
      const draft = await api.generateV1ProposalDraft({
        mode,
        project,
        lines: proposalScheduleLines,
        summary: proposalScheduleSummary,
        settings,
      });

      const updates = Object.entries(draft).filter(([, value]) => typeof value === 'string' && value.trim().length > 0) as Array<[keyof SettingsRecord, string]>;
      const wouldOverwrite = updates.some(([key, value]) => String(settings[key] || '').trim().length > 0 && String(settings[key]).trim() !== value.trim());

      if (wouldOverwrite && !window.confirm('This will replace existing proposal text in one or more fields. Continue?')) {
        return;
      }

      const mergedFields = Object.fromEntries(updates) as Partial<SettingsRecord>;
      setSettings(ensureProposalDefaults({ ...settings, ...mergedFields }));
      goToTab('proposal');
    } catch (error: unknown) {
      window.alert(getErrorMessage(error, 'Unable to generate proposal draft right now.'));
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
      goToTab('proposal');
    } catch (error: unknown) {
      window.alert(getErrorMessage(error, 'Unable to generate install review email right now.'));
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

  const lineHealth = useMemo(
    () => deriveEstimateLineHealth(lines, project?.pricingMode ?? 'labor_and_material'),
    [lines, project?.pricingMode],
  );

  const workflowSteps = useMemo(
    () =>
      computeWorkflowBarSteps({
        project,
        defaultLaborRatePerHour: Number(settings?.defaultLaborRatePerHour || 0),
        sourceQuotes,
        allQuoteLines,
        takeoffLines: lines,
        summary,
        lineHealth,
      }),
    [project, settings?.defaultLaborRatePerHour, sourceQuotes, allQuoteLines, lines, summary, lineHealth],
  );

  const nextBest = useMemo(() => computeNextBestAction(workflowSteps), [workflowSteps]);

  const quoteRollup = useMemo(
    () => ({
      stagedRowCount: allQuoteLines.length,
      quotesNeedingReview: sourceQuotes.filter((q) => q.importStatus === 'manual_review').length,
      quotesReadyToImport: sourceQuotes.filter(
        (q) => q.importStatus === 'ready_to_import' || q.importStatus === 'partially_imported',
      ).length,
      quotesImported: sourceQuotes.filter((q) => q.importStatus === 'imported').length,
    }),
    [allQuoteLines, sourceQuotes],
  );

  const effectiveLaborRatePerHour = useMemo(() => {
    const base = Number(settings?.defaultLaborRatePerHour || 100);
    return Number((base * (project?.jobConditions?.laborRateMultiplier || 1)).toFixed(2));
  }, [settings?.defaultLaborRatePerHour, project?.jobConditions?.laborRateMultiplier]);

  const importedFromQuoteLineCount = useMemo(
    () => lines.filter((l) => l.sourceType === 'vendor_quote').length,
    [lines],
  );

  const importedQuoteLineIds = useMemo(
    () =>
      new Set(lines.filter((l) => l.sourceType === 'vendor_quote' && l.sourceRef).map((l) => String(l.sourceRef))),
    [lines],
  );

  const alternatesCount = useMemo(
    () => lines.filter((l) => l.intakeScopeBucket === 'deduction_alternate').length,
    [lines],
  );

  const { clarificationsCount, exclusionsCount } = useMemo(() => {
    const s = ensureProposalDefaults(settings);
    return {
      clarificationsCount: splitProposalTextLines(s.proposalClarifications || DEFAULT_PROPOSAL_CLARIFICATIONS).length,
      exclusionsCount: splitProposalTextLines(s.proposalExclusions || DEFAULT_PROPOSAL_EXCLUSIONS).length,
    };
  }, [settings]);

  if (loading) {
    return <div className="flex min-h-[40vh] items-center justify-center p-8 text-sm text-slate-500">Loading workspace?</div>;
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
    return <div className="flex min-h-[40vh] items-center justify-center p-8 text-sm text-slate-500">Loading workspace?</div>;
  }

  const lastUpdatedLabel = project.updatedAt
    ? new Date(project.updatedAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
    : null;
  const lastSavedLabel = lastSavedAt
    ? new Date(lastSavedAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
    : null;

  return (
    <div className="min-h-full bg-slate-50/80">
      <div className="ui-page-wide space-y-3 pt-3 md:pt-4">
        <WorkspaceProjectHeader
          project={project}
          proposalTotal={summary?.baseBidTotal || 0}
          lastUpdatedLabel={lastUpdatedLabel}
          lastSavedLabel={lastSavedLabel}
          saveBusy={syncState === 'syncing'}
          onBackToProjects={() => navigate('/projects')}
          onSave={saveProject}
          onPreviewProposal={() => goToTab('proposal')}
          onExportPdf={exportProposal}
          onPrint={printProposalDocument}
          onStatusAction={submitBid}
          statusActionLabel={statusActionLabel}
          onDeleteProject={deleteProjectPermanently}
          estimateLineCount={lines.length}
        />
        {actionFeedback ? (
          <ActionFeedbackBanner
            tone={actionFeedback.tone}
            message={actionFeedback.message}
            onDismiss={() => setActionFeedback(null)}
          />
        ) : null}
      </div>

      <div className="ui-page-wide space-y-4 pb-8">
        <ProjectWorkflowReadinessBar steps={workflowSteps} onSelectStep={goToTab} />
        <ProjectStepNav projectId={project.id} items={stepNavItems} />
        <div className="flex flex-col gap-3">
          <div className="min-w-0 flex-1 space-y-3">
        {activeTab === 'overview' && (
          <ProjectOverviewMvpPage
            project={project}
            summary={summary}
            quotes={sourceQuotes}
            settings={settings}
            quoteRollup={quoteRollup}
            nextBestAction={nextBest}
            effectiveLaborRatePerHour={effectiveLaborRatePerHour}
            lineModifierRowCount={lineModifiers.length}
            estimateLinesCount={lines.length}
            importedFromQuoteLineCount={importedFromQuoteLineCount}
            alternatesCount={alternatesCount}
            clarificationsCount={clarificationsCount}
            exclusionsCount={exclusionsCount}
            onGoToTab={goToTab}
          />
        )}

        {activeTab === 'setup' && (
          <ProjectSetupPage
            project={project}
            settings={settings}
            setProject={setProject}
            patchJobConditions={patchJobConditions}
            onSave={saveProject}
            saveBusy={syncState === 'syncing'}
          />
        )}

        {activeTab === 'quotes' && (
          <>
            <QuotesTabSummaryCard
              quoteCount={sourceQuotes.length}
              stagedRows={quoteRollup.stagedRowCount}
              needingReviewQuotes={quoteRollup.quotesNeedingReview}
              readyToImportQuotes={quoteRollup.quotesReadyToImport}
              importedQuoteCount={quoteRollup.quotesImported}
            />
            <QuotesPage
            quotes={sourceQuotes}
            activeQuoteId={activeQuoteId}
            setActiveQuoteId={setActiveQuoteId}
            quoteLines={sourceQuoteLines}
            importedQuoteLineIds={importedQuoteLineIds}
            projectFiles={projectFiles}
            fileUploading={fileUploading}
            onCreateQuote={(draft) => createSourceQuote(draft)}
            onUpdateQuote={(quoteId, updates) => updateSourceQuote(quoteId, updates)}
            onDeleteQuote={(quoteId) => deleteSourceQuote(quoteId)}
            onAddQuoteLine={(quoteId, draft) => addSourceQuoteLine(quoteId, draft)}
            onAddQuoteLinesBulk={(quoteId, drafts) => addSourceQuoteLinesBulk(quoteId, drafts)}
            onUpdateQuoteLine={(quoteId, lineId, updates) => updateSourceQuoteLine(quoteId, lineId, updates)}
            onDeleteQuoteLine={(quoteId, lineId) => deleteSourceQuoteLine(quoteId, lineId)}
            onImportSelected={(quoteId) => importSelectedQuoteLines(quoteId)}
            onExtractSourceFile={(quoteId, replaceExisting) => {
              const fromSetup = project.jobConditions.sourceQuoteExtractMode === 'replace_existing';
              const effectiveReplace = fromSetup ? (sourceQuoteLines.length > 0 || replaceExisting) : false;
              return extractSourceQuoteFromFile(quoteId, effectiveReplace);
            }}
            onPromoteToCatalogCandidates={(quoteId, selectedLineIds, includeNonCatalogTypes) =>
              promoteQuoteLinesToCatalogCandidates(quoteId, selectedLineIds, includeNonCatalogTypes)
            }
          />
          </>
        )}

        {activeTab === 'estimate' && (() => {
          /**
           * Pricing view uses the Estimate cockpit (table + side panel). Detailed catalog /
           * ?line + add-ins? tools remain in the modifiers drawer opened from the toolbar or panel.
           */
          const estimateGridClass = 'isolate grid min-h-0 min-w-0 flex-1 grid-cols-1 gap-4';
          const takeoffBulkSelectEnabled = takeoffRoomFilter !== TAKEOFF_ALL_ROOMS;
          const estimateBulkActionBar =
            bulkSelectedLineIds.length > 0 ? (
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-200/80 bg-amber-50/90 px-3 py-2 text-[11px] text-amber-950">
                <span className="font-semibold tabular-nums">{bulkSelectedLineIds.length} selected</span>
                <span className="inline-flex flex-wrap items-center gap-1.5 border-l border-amber-300/60 pl-2">
                  <label className="inline-flex items-center gap-1.5 font-medium text-amber-950">
                    <span className="shrink-0 text-amber-900/80">Move to</span>
                    <select
                      className="max-w-[11rem] rounded-md border border-amber-300/90 bg-white px-1.5 py-1 text-[11px] font-medium text-amber-950 disabled:cursor-not-allowed disabled:opacity-50"
                      value={bulkMoveTargetRoomId}
                      onChange={(e) => setBulkMoveTargetRoomId(e.target.value)}
                      disabled={rooms.length < 2}
                      aria-label="Target room for bulk move"
                    >
                      <option value="">Room?</option>
                      {rooms.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.roomName}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    className="rounded-md border border-amber-700/50 bg-white px-2.5 py-1 font-semibold text-amber-950 shadow-sm hover:bg-amber-100/80 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={rooms.length < 2 || !bulkMoveTargetRoomId}
                    onClick={() => void bulkMoveSelectedLinesToRoom(bulkMoveTargetRoomId)}
                  >
                    Move to room
                  </button>
                </span>
                <button
                  type="button"
                  className="rounded-md bg-red-600 px-2.5 py-1 font-semibold text-white shadow-sm hover:bg-red-700"
                  onClick={() => void bulkDeleteSelectedLines()}
                >
                  Delete selected?
                </button>
                <button
                  type="button"
                  className="rounded-md border border-amber-300/90 bg-white px-2.5 py-1 font-semibold text-amber-950 hover:bg-amber-100/80"
                  onClick={() => setBulkSelectedLineIds([])}
                >
                  Clear selection
                </button>
              </div>
            ) : null;
          return (
          <>
          <EstimateTabSummaryCard
            material={summary?.materialLoadedSubtotal ?? summary?.materialSubtotal ?? 0}
            labor={summary?.laborLoadedSubtotal ?? summary?.adjustedLaborSubtotal ?? summary?.laborSubtotal ?? 0}
            modifierAddOnCount={lineModifiers.length}
            total={summary?.baseBidTotal ?? 0}
          />
          <div className="flex min-w-0 flex-col gap-1">
          <div className={estimateGridClass}>
            <div className="flex min-w-0 flex-col gap-1">
              {searchParams.get('scopeChecked') === '1' ? (
                <div className="mb-1 flex items-start gap-2 rounded-lg border border-emerald-200/90 bg-emerald-50/70 px-3 py-2 text-sm text-emerald-950">
                  <p className="min-w-0 flex-1 leading-snug">
                    <span className="font-semibold">Import checked:</span> no scope exceptions found. You are clear to build pricing and proposal output.
                  </p>
                  <button
                    type="button"
                    className="shrink-0 rounded-md p-1 text-emerald-800 hover:bg-emerald-100/80"
                    aria-label="Dismiss"
                    onClick={() =>
                      setSearchParams(
                        (prev) => {
                          const next = new URLSearchParams(prev);
                          next.delete('scopeChecked');
                          return next;
                        },
                        { replace: true }
                      )
                    }
                  >
                    <X className="h-4 w-4" aria-hidden />
                  </button>
                </div>
              ) : null}
              <EstimateToolbar
                view={estimateView}
                onViewChange={setEstimateView}
                takeoffRoomFilter={takeoffRoomFilter}
                onTakeoffRoomFilterChange={(v) => {
                  if (v === TAKEOFF_ALL_ROOMS) setTakeoffRoomFilter(TAKEOFF_ALL_ROOMS);
                  else selectWorkspaceRoom(v);
                }}
                rooms={rooms}
                lineCountForFilter={lines.length}
                takeoffStats={takeoffViewStats}
                onAddManualLine={() => void addManualLine()}
                onOpenCatalog={() => setCatalogOpen(true)}
                onOpenBundles={() => setBundleModalOpen(true)}
                onOpenPartitionBuilder={() => setPartitionBuilderOpen(true)}
                onOpenLineAddIns={() => setModifiersModalOpen(true)}
                canOpenLineAddIns={!!selectedLineId}
                selectedLineLabel={selectedLine?.description ?? null}
                activeRoomId={activeRoomId}
                activeRoomLabel={roomNamesById[activeRoomId] || 'select a room'}
                onWorkingRoomChange={selectWorkspaceRoom}
                onOpenCreateRoom={openCreateRoomModal}
                onOpenManageRooms={() => setRoomManagerOpen(true)}
                projectTotal={summary?.baseBidTotal}
                formatCurrency={(n) => formatCurrencySafe(n)}
                disabledAdd={!activeRoomId}
                bidBucketStats={bidBucketStatsForToolbar}
              />
              <EstimateHealthStrip
                health={estimateHealthDerived}
                pricingMode={pricingMode}
                bulkSelectedCount={bulkSelectedLineIds.length}
                dataLoadedAt={takeoffLinesLoadedAt}
                focus={healthStripFocus}
                onFocusChange={setHealthStripFocus}
              />
              {estimateView === 'quantities' ? (
                <div className="space-y-3">
                  {summary ? (
                    <LaborPlanPanel
                      compact
                      installerCount={jobConditions.installerCount}
                      productiveCrewHoursPerDay={summary.productiveCrewHoursPerDay ?? jobConditions.installerCount * 8}
                      totalLaborHours={summary.totalLaborHours}
                      durationDays={summary.durationDays}
                      baseLaborRatePerHour={baseLaborRatePerHour}
                      effectiveLaborCostPerHour={effectiveLaborCostPerHour}
                      laborCostMultiplier={laborCostMultiplier}
                      laborHoursMultiplier={laborHoursMultiplier}
                      deliveryDifficulty={jobConditions.deliveryDifficulty}
                    />
                  ) : null}
                  {takeoffRoomFilter === TAKEOFF_ALL_ROOMS ? (
                    <p className="text-xs leading-snug text-slate-500">
                      <span className="font-medium text-slate-700">Combined across rooms:</span> lines that match the same catalog item or SKU are rolled into one row (qty and install time are summed). Room names are listed under each item.{' '}
                      <span className="text-slate-600">
                        New lines and bundles go to the room chosen under <span className="font-medium text-slate-800">Room for new lines</span> (
                        <span className="font-medium text-slate-800">{roomNamesById[activeRoomId] || 'select a room'}</span>
                        ). Use <span className="font-medium text-slate-800">Takeoff view</span> for one room to edit or delete a specific line.
                      </span>
                    </p>
                  ) : null}
                  {estimateBulkActionBar}
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
                    onSelectLine={selectEstimateLine}
                    onPersistLine={(lineId, updates) => void persistLine(lineId, updates)}
                    onDeleteLine={(lineId) => void deleteLine(lineId)}
                    onDuplicateLine={(lineId) => void duplicateLine(lineId)}
                    multiSelectEnabled={takeoffBulkSelectEnabled}
                    bulkSelectedLineIds={bulkSelectedLineIds}
                    onBulkToggleLine={toggleBulkLine}
                    onBulkHeaderApplyVisibleToggle={applyBulkHeaderVisible}
                    healthHighlightLineIds={healthHighlightLineIds}
                  />
                </div>
              ) : (
              <EstimateReviewShell
                projectName={project?.projectName || 'Project'}
                lines={sortedPricingGridLines}
                pricingMode={pricingMode}
                materialTotal={summary?.materialLoadedSubtotal ?? summary?.materialSubtotal ?? 0}
                laborTotal={summary?.laborLoadedSubtotal ?? summary?.adjustedLaborSubtotal ?? summary?.laborSubtotal ?? 0}
                grandTotal={summary?.baseBidTotal ?? pricingChipSubtotal ?? 0}
                onReviewInstallAssumptions={() => {
                  const firstGated = sortedPricingGridLines.find((l) =>
                    deriveInstallAssumptionGateUi(l, pricingMode).isGated,
                  );
                  if (firstGated) focusInstallAssumptionsForLine(firstGated.id);
                  else if (selectedLineId) focusInstallAssumptionsForLine(selectedLineId);
                }}
                onOpenProjectSetup={() => goToTab('setup')}
              >
              <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
              <div className="ui-panel space-y-2 p-2 sm:p-2.5">
                <div>
                  <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                    <div className="min-w-0">
                      <p className="mb-0.5 text-[11px] font-semibold uppercase tracking-wide text-app-muted">Group by</p>
                      <div className="inline-flex rounded-lg border border-app-line bg-app-surface p-0.5">
                        <button
                          type="button"
                          onClick={() => {
                            setPricingOrganizeMode('rooms');
                            setPricingCategoryFilter(PRICING_ALL_CATEGORIES);
                          }}
                          className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition ${
                            pricingOrganizeMode === 'rooms'
                              ? 'bg-app-brand-deep text-white'
                              : 'text-app hover:bg-app-surface-soft'
                          }`}
                        >
                          Rooms
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setPricingOrganizeMode('categories');
                            setPricingCategoryFilter(PRICING_ALL_CATEGORIES);
                          }}
                          className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition ${
                            pricingOrganizeMode === 'categories'
                              ? 'bg-app-brand-deep text-white'
                              : 'text-app hover:bg-app-surface-soft'
                          }`}
                        >
                          Categories
                        </button>
                      </div>
                      <p className="mt-1.5 text-[11px] leading-snug text-app-muted">
                        {pricingOrganizeMode === 'rooms'
                          ? 'Jump between rooms (same as the room chips below).'
                          : 'Filter the table by catalog category for this room; All keeps every line.'}
                      </p>
                    </div>
                    <div className="ui-panel-muted shrink-0 rounded-lg px-3 py-1.5 text-right">
                      <p className="ui-label !normal-case tracking-wide text-slate-500">
                        {pricingOrganizeMode === 'categories' && pricingCategoryFilter !== PRICING_ALL_CATEGORIES
                          ? 'Category total'
                          : 'Room total'}
                      </p>
                      <p className="text-base font-semibold tabular-nums text-slate-900">{formatCurrencySafe(pricingChipSubtotal)}</p>
                    </div>
                  </div>
                  <div className="flex min-w-0 gap-1.5 overflow-x-auto pb-0.5">
                    {pricingOrganizeMode === 'rooms'
                      ? rooms.map((room) => {
                          const active = room.id === activeRoomId;
                          const metric = roomMetrics[room.id] || { count: 0, subtotal: 0, totalQty: 0, laborMinutes: 0 };
                          return (
                            <button
                              key={room.id}
                              type="button"
                              onClick={() => selectWorkspaceRoom(room.id)}
                              title={`${metric.count} lines ? ${formatCurrencySafe(metric.subtotal)}`}
                              className={`shrink-0 rounded-lg px-3 py-2 text-left transition-all ${
                                active
                                  ? 'text-white shadow-md ring-1 ring-blue-900/30'
                                  : 'bg-white text-slate-800 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50'
                              }`}
                              style={active ? { background: 'var(--brand, #1d4ed8)' } : undefined}
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
                        })
                      : (
                          <>
                            <button
                              type="button"
                              onClick={() => setPricingCategoryFilter(PRICING_ALL_CATEGORIES)}
                              title={`${activeRoomLines.length} lines in this room`}
                              className={`shrink-0 rounded-lg px-3 py-2 text-left transition-all ${
                                pricingCategoryFilter === PRICING_ALL_CATEGORIES
                                  ? 'text-white shadow-md ring-1 ring-blue-900/30'
                                  : 'bg-white text-slate-800 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50'
                              }`}
                              style={pricingCategoryFilter === PRICING_ALL_CATEGORIES ? { background: 'var(--brand, #1d4ed8)' } : undefined}
                            >
                              <div className="min-w-[132px]">
                                <div
                                  className={`text-xs font-semibold ${
                                    pricingCategoryFilter === PRICING_ALL_CATEGORIES ? 'text-white' : 'text-slate-900'
                                  }`}
                                >
                                  All categories
                                </div>
                                <div
                                  className={`mt-0.5 flex items-center justify-between text-[10px] ${
                                    pricingCategoryFilter === PRICING_ALL_CATEGORIES ? 'text-slate-200' : 'text-slate-500'
                                  }`}
                                >
                                  <span>{activeRoomLines.length} lines</span>
                                  <span className="tabular-nums font-medium">{formatCurrencySafe(roomSubtotal)}</span>
                                </div>
                              </div>
                            </button>
                            {pricingCategoryMetrics.map(([cat, metric]) => {
                              const active = pricingCategoryFilter === cat;
                              return (
                                <button
                                  key={cat}
                                  type="button"
                                  onClick={() => setPricingCategoryFilter(cat)}
                                  title={`${metric.count} lines ? ${formatCurrencySafe(metric.subtotal)}`}
                                  className={`shrink-0 rounded-lg px-3 py-2 text-left transition-all ${
                                    active
                                      ? 'text-white shadow-md ring-1 ring-blue-900/30'
                                      : 'bg-white text-slate-800 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50'
                                  }`}
                                  style={active ? { background: 'var(--brand, #1d4ed8)' } : undefined}
                                >
                                  <div className="min-w-[118px] max-w-[14rem]">
                                    <div className={`truncate text-xs font-semibold ${active ? 'text-white' : 'text-slate-900'}`}>{cat}</div>
                                    <div className={`mt-0.5 flex items-center justify-between text-[10px] ${active ? 'text-slate-200' : 'text-slate-500'}`}>
                                      <span>{metric.count} lines</span>
                                      <span className="tabular-nums font-medium">{formatCurrencySafe(metric.subtotal)}</span>
                                    </div>
                                  </div>
                                </button>
                              );
                            })}
                          </>
                        )}
                        <label className="space-y-1 text-[11px] font-semibold uppercase tracking-wide text-app-muted">
                          <span>Source</span>
                          <select
                            className="ui-input h-9 min-w-[10rem] text-sm"
                            value={estimateSourceFilter}
                            onChange={(event) => setEstimateSourceFilter(event.target.value as 'all' | 'manual' | 'catalog' | 'vendor_quote')}
                          >
                            <option value="all">All sources</option>
                            <option value="manual">Manual</option>
                            <option value="catalog">Catalog</option>
                            <option value="vendor_quote">Vendor quote</option>
                          </select>
                        </label>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-app-line pt-1.5 text-[11px] text-app">
                  <span className="inline-flex items-center gap-1 rounded-md bg-app-surface-soft px-2 py-1 font-medium ring-app-line-muted">
                    <Sparkles className="h-3 w-3 text-app-muted" aria-hidden />
                    <span className="text-app-muted">Markup / tax stack</span>
                    <span className="font-semibold tabular-nums text-app">
                      {formatCurrencySafe(
                        (summary?.taxAmount || 0) +
                          (summary?.overheadAmount || 0) +
                          (summary?.profitAmount || 0) +
                          (summary?.burdenAmount || 0) +
                          (summary?.laborOverheadAmount || 0) +
                          (summary?.laborProfitAmount || 0) +
                          (summary?.subLaborManagementFeeAmount || 0)
                      )}
                    </span>
                  </span>
                  {isMaterialOnlyMainBid(pricingMode) && (summary?.laborCompanionProposalTotal ?? 0) > 0 ? (
                    <span className="inline-flex items-center gap-1 rounded-md bg-app-surface-soft px-2 py-1 font-medium ring-app-line-muted">
                      <Hammer className="h-3 w-3 text-app-muted" aria-hidden />
                      <span className="text-app-muted">
                        {pricingMode === 'material_with_optional_install_quote'
                          ? 'Install (quoted separately)'
                          : 'Sub labor (companion)'}
                      </span>
                      <span className="font-semibold tabular-nums text-slate-900">{formatCurrencySafe(summary?.laborCompanionProposalTotal ?? 0)}</span>
                    </span>
                  ) : null}
                  {fieldScheduleHint ? (
                    <span className="inline-flex items-center gap-1 rounded-md border border-blue-200/70 bg-blue-50/60 px-2 py-1 font-medium text-blue-900">
                      <CalendarClock className="h-3 w-3 text-blue-700/80" aria-hidden />
                      Field hint: {fieldScheduleHint.fieldCrew} crew ? ~{formatNumberSafe(fieldScheduleHint.fieldDays, 1)} d (advisory)
                    </span>
                  ) : null}
                  {(summary?.conditionAssumptions?.length || 0) > 0 ? (
                    <span className="inline-flex items-center gap-1 rounded-md bg-slate-50 px-2 py-1 font-medium ring-1 ring-slate-200/80">
                      <Layers3 className="h-3 w-3 text-slate-500" aria-hidden />
                      {summary?.conditionAssumptions?.length} condition note{summary?.conditionAssumptions?.length === 1 ? '' : 's'}
                    </span>
                  ) : null}
                  <span className="ml-auto inline-flex items-center gap-1 rounded-md bg-slate-50 px-2 py-1 font-medium ring-1 ring-slate-200/80">
                    <span className="text-slate-500">Room total</span>
                    <span className="font-semibold tabular-nums text-slate-900">{formatCurrencySafe(roomSubtotal)}</span>
                  </span>
                  {pricingOrganizeMode === 'categories' && pricingCategoryFilter !== PRICING_ALL_CATEGORIES ? (
                    <span className="inline-flex items-center gap-1 rounded-md bg-slate-50 px-2 py-1 font-medium ring-1 ring-slate-200/80">
                      <span className="text-slate-500">Shown</span>
                      <span className="font-semibold tabular-nums text-slate-900">{formatCurrencySafe(pricingChipSubtotal)}</span>
                    </span>
                  ) : null}
                  <span className="inline-flex items-center gap-1 rounded-md bg-slate-50 px-2 py-1 font-medium ring-1 ring-slate-200/80">
                    {pricingGridLines.length} line{pricingGridLines.length === 1 ? '' : 's'}
                    {pricingOrganizeMode === 'categories' && pricingCategoryFilter !== PRICING_ALL_CATEGORIES ? ' shown' : ''}
                  </span>
                  {selectedLine ? (
                    <span className="max-w-[min(100%,22rem)] truncate inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-1 font-medium text-blue-900 ring-1 ring-blue-200/80">
                      <span className="text-blue-700/80">Selected:</span>
                      <span className="truncate">{selectedLine.description}</span>
                    </span>
                  ) : null}
                </div>
              </div>

              {estimateBulkActionBar}

              <div className="flex min-h-[min(70vh,560px)] min-h-0 min-w-0 flex-1 flex-col gap-3 pb-20 lg:flex-row">
                {sortedPricingGridLines.length === 0 ? (
                  <div className="flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-app-line bg-app-surface-soft/40 px-6 py-16 text-center">
                    <p className="max-w-md text-sm leading-relaxed text-app-muted">
                      Import included quote rows or add a manual estimate line to start pricing this project.
                    </p>
                  </div>
                ) : (
                  <>
                    <EstimateCockpitTable
                      lines={sortedPricingGridLines}
                      pricingMode={pricingMode}
                      laborMultiplier={summary?.conditionLaborMultiplier || 1}
                      selectedLineId={selectedLineId}
                      healthHighlightLineIds={healthHighlightLineIds}
                      onSelectLine={selectEstimateLine}
                      onToggleInclude={(lineId, nextIncluded) =>
                        void persistLine(lineId, {
                          proposalVisibility: nextIncluded ? 'customer_visible' : 'internal_only',
                        })
                      }
                      onReviewInstallAssumptions={focusInstallAssumptionsForLine}
                    />
                    <EstimateCockpitLinePanel
                      linePanelId="estimate-cockpit-line-panel"
                      projectWallSubstrate={project?.wallSubstrate}
                      onOpenProjectSetup={() => goToTab('setup')}
                      onFocusInstallAssumptions={() => {
                        if (selectedLineId) focusInstallAssumptionsForLine(selectedLineId);
                      }}
                      line={
                        selectedLine && sortedPricingGridLines.some((l) => l.id === selectedLine.id)
                          ? selectedLine
                          : null
                      }
                      rooms={rooms}
                      categories={categories}
                      pricingMode={pricingMode}
                      jobConditions={jobConditions}
                      catalogModifiers={modifiers}
                      lineModifiers={lineModifiers}
                      showMaterial={showMaterial}
                      showLabor={showLabor}
                      projectLaborMultiplier={summary?.conditionLaborMultiplier || 1}
                      onSave={async (lineId, updates) => {
                        await persistLine(lineId, updates);
                      }}
                      onClearSelection={() => setSelectedLineId(null)}
                      onApplyModifier={(modifierId) => void applyModifier(modifierId)}
                      onRemoveModifier={(id) => void removeModifier(id)}
                      onOpenAdvancedTools={() => setModifiersModalOpen(true)}
                    />
                  </>
                )}
              </div>
              </div>
              </EstimateReviewShell>
              )}
            </div>
          </div>
          {estimateView === 'quantities' ? (
            <EstimateWorkspaceFooter
              estimateView={estimateView}
              lineStats={estimateProjectLineStats}
              baseBidTotal={summary?.baseBidTotal}
              pricingMode={pricingMode}
              materialLoadedSubtotal={summary?.materialLoadedSubtotal ?? summary?.materialSubtotal}
              laborLoadedSubtotal={summary?.laborLoadedSubtotal ?? summary?.adjustedLaborSubtotal ?? summary?.laborSubtotal}
            />
          ) : null}
          </div>
          </>
          );
        })()}

        {activeTab === 'proposal' && (
          <>
          <div className="space-y-4">
            <FieldOpsPageHeader
              kicker="Proposal"
              title="Proposal Preview"
              subtitle="Client-facing document ? preview matches print and export. Internal review flags never appear here."
              actions={
                <>
                  <button type="button" onClick={() => void saveProposalWording()} className="ui-fo-btn-secondary h-10 px-4">
                    Save edits
                  </button>
                  <button type="button" onClick={() => void printProposalDocument()} className="ui-fo-btn-secondary h-10 px-4">
                    Print
                  </button>
                  <button
                    type="button"
                    onClick={exportProposal}
                    title="Downloads HTML. Open in a browser, then Print to Save as PDF."
                    className="ui-fo-btn-primary inline-flex items-center gap-1.5"
                  >
                    <Download className="h-4 w-4" />
                    Print / PDF
                  </button>
                </>
              }
            />

            <details className="ui-surface group mt-5 overflow-hidden open:shadow-md [&_summary::-webkit-details-marker]:hidden">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5 text-left hover:bg-slate-50/80 sm:px-5">
                <div className="flex min-w-0 items-center gap-2.5">
                  <span
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ring-1 ring-slate-200/80 bg-slate-50 text-slate-700"
                  >
                    <Hammer className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-slate-900">Internal install email</p>
                    <p className="text-[11px] text-slate-500">Crew-facing draft ? not shown on the client proposal</p>
                  </div>
                </div>
                <ChevronDown className="h-4 w-4 shrink-0 text-slate-400 transition group-open:rotate-180" />
              </summary>
              <div className="border-t border-slate-200/80 px-4 pb-4 pt-3 sm:px-5">
                <HandoffSummary
                  draft={installReviewDraft}
                  generating={installReviewGenerating}
                  onGenerate={() => void generateInstallReviewEmail()}
                  onCopy={() => void copyInstallReviewEmailBody()}
                  fieldScheduleHint={fieldScheduleHint}
                />
              </div>
            </details>

            <details className="ui-surface group overflow-hidden open:shadow-md [&_summary::-webkit-details-marker]:hidden">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5 text-left hover:bg-slate-50/80 sm:px-5">
                <div className="flex min-w-0 items-center gap-2.5">
                  <span
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ring-1 ring-blue-200/70"
                    style={{
                      background: 'color-mix(in srgb, var(--brand, #1d4ed8) 12%, white)',
                      color: 'var(--brand-strong, #1e40af)',
                    }}
                  >
                    <Sparkles className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-slate-900">AI writing assist</p>
                    <p className="text-[11px] text-slate-500">Optional ? confirms before replacing existing text</p>
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
                    {proposalDrafting === 'scope_summary' ? 'Generating?' : 'Scope summary'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void generateProposalDraft('default_short')}
                    disabled={proposalDrafting !== null}
                    className="inline-flex h-9 flex-1 items-center justify-center rounded-full border border-slate-200 bg-white px-4 text-[11px] font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50 sm:min-w-[10rem]"
                  >
                    {proposalDrafting === 'default_short' ? 'Drafting?' : 'Short proposal pack'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void generateProposalDraft('terms_and_conditions')}
                    disabled={proposalDrafting !== null}
                    className="inline-flex h-9 flex-1 items-center justify-center rounded-full border border-slate-200 bg-white px-4 text-[11px] font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50 sm:min-w-[10rem]"
                  >
                    {proposalDrafting === 'terms_and_conditions' ? 'Working?' : 'Terms & conditions'}
                  </button>
                </div>
              </div>
            </details>

            <div className="grid gap-6 xl:grid-cols-[1fr_minmax(17rem,20rem)] xl:items-start">
              <div className="space-y-4">
              <details className="ui-fo-card group overflow-hidden [&_summary::-webkit-details-marker]:hidden">
                <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-slate-900 hover:bg-slate-50">
                  Edit proposal wording and document settings
                </summary>
                <div className="grid gap-4 border-t border-slate-100 p-4 lg:grid-cols-[minmax(200px,240px)_1fr]">
                  <ProposalSettingsRail
                proposalFormat={project.proposalFormat || 'standard'}
                onProposalFormatChange={(value) =>
                  setProject((prev) => (prev ? { ...prev, proposalFormat: value } : prev))
                }
                proposalIncludeCatalogImages={project.proposalIncludeCatalogImages}
                onProposalIncludeCatalogImagesChange={(value) =>
                  setProject((prev) => (prev ? { ...prev, proposalIncludeCatalogImages: value } : prev))
                }
                baseBidTotal={proposalScheduleSummary?.baseBidTotal}
                lineCount={clientProposalLineCount}
                durationDays={proposalScheduleSummary?.durationDays}
              />
                  {settings ? (
                    <ProposalSectionEditor
                      settings={settings}
                      setSettings={setSettings}
                      onResetSection={(scope) => resetProposalDefaults(scope)}
                      onResetAll={() => resetProposalDefaults('all')}
                    />
                  ) : (
                    <p className="text-sm text-slate-500">Loading proposal defaults</p>
                  )}
                </div>
              </details>

              <section className="rounded-xl border border-slate-200/80 bg-gradient-to-b from-slate-200/60 to-slate-100/80 p-4 sm:p-6 shadow-inner">
                <p className="mb-3 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Client document preview</p>
                <div className="max-h-[calc(100vh-240px)] overflow-auto">
                  {pipelineNativeEnabled ? (
                    <div className="mb-3 space-y-2 rounded-lg border border-slate-200 bg-white/90 p-3 text-[11px] text-slate-700">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-slate-900">Linked estimate</span>
                        {nativeProposalLoading ? <span className="text-slate-500">Loading</span> : null}
                      </div>
                      <label className="flex flex-col gap-1">
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Estimate record</span>
                        <select
                          className="max-w-md rounded border border-slate-300 bg-white px-2 py-1.5 text-[11px]"
                          value={proposalNativeEstimateId}
                          onChange={(e) => {
                            const next = e.target.value;
                            setProposalNativeEstimateId(next);
                            setNativeProposalLines(null);
                            setNativeProposalSummary(null);
                          }}
                        >
                          <option value="">Select estimate</option>
                          {pipelineProposalEstimates.map((e) => (
                            <option key={String((e as { id: string }).id)} value={String((e as { id: string }).id)}>
                              {String((e as { name?: string }).name || (e as { id: string }).id)}
                            </option>
                          ))}
                        </select>
                      </label>
                      {nativeProposalWarnings.length > 0 ? (
                        <ul className="list-inside list-disc text-amber-900">
                          {nativeProposalWarnings.map((w) => (
                            <li key={w}>{w}</li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  ) : null}
                  <ProposalPreview
                    project={project}
                    settings={settings}
                    lines={proposalScheduleLines}
                    summary={proposalScheduleSummary}
                    catalogImageById={catalogImageById}
                  />
                </div>
              </section>
              </div>
              <ProposalReadinessRail items={proposalReadinessItems} />
            </div>
          </div>
          </>
        )}

          </div>
        </div>
      </div>

      <ItemPicker
        open={catalogOpen}
        rooms={rooms}
        bundles={bundles}
        activeRoomId={activeRoomId}
        categories={categories}
        search={catalogSearch}
        category={catalogCategory}
        items={catalogBrowseItems}
        onClose={() => setCatalogOpen(false)}
        onSearch={setCatalogSearch}
        onCategory={setCatalogCategory}
        onAddItems={addDraftItems}
        onApplyBundle={applyBundle}
      />

      <InstallAssumptionsDrawer
        open={installAssumptionsDrawerOpen}
        line={lines.find((l) => l.id === selectedLineId) ?? null}
        project={project}
        pricingMode={pricingMode}
        busy={installAssumptionsBusy}
        onClose={() => setInstallAssumptionsDrawerOpen(false)}
        onSave={saveInstallAssumptions}
      />

      <QuoteImportResultModal
        open={quoteImportResultOpen}
        summary={quoteImportResult}
        onClose={closeQuoteImportResultModal}
        onGoToEstimate={() => goToEstimateFromImportResult(false)}
        onReviewInstallAssumptions={() => goToEstimateFromImportResult(true)}
        onBackToQuotes={() => {
          closeQuoteImportResultModal();
          goToTab('quotes');
        }}
        onImportAnotherQuote={() => {
          closeQuoteImportResultModal();
          goToTab('quotes');
        }}
      />

      <BundlePickerModal
        open={bundleModalOpen}
        bundles={bundles}
        rooms={rooms}
        activeRoomId={activeRoomId}
        onClose={() => setBundleModalOpen(false)}
        onApplyBundle={applyBundle}
        presentation="drawer"
      />

      <PartitionLayoutBuilderModal
        open={partitionBuilderOpen}
        rooms={rooms}
        activeRoomId={activeRoomId}
        onClose={() => setPartitionBuilderOpen(false)}
        onAddLines={(roomId, plan) => addPartitionLayoutLines(roomId, plan)}
      />

      {modifiersModalOpen && selectedLine && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40 backdrop-blur-[2px]" onClick={() => setModifiersModalOpen(false)}>
          <div
            className="flex h-full w-full max-w-[min(100vw-0.5rem,56rem)] flex-col overflow-hidden border-l border-slate-200/90 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] shadow-[-12px_0_40px_rgba(15,23,42,0.14)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="border-b border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(246,248,251,0.96)_100%)] px-3 py-2.5 sm:px-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 max-w-[min(100%,42rem)]">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="ui-chip-soft">Line + add-ins</span>
                    <span className="ui-chip-soft">{selectedLine.category || 'Uncategorized'}</span>
                    <span className="ui-chip-soft">{roomNamesById[selectedLine.roomId] || 'Unassigned room'}</span>
                  </div>
                  <h3 className="mt-1 text-base font-semibold tracking-tight text-slate-950">Line, pricing, and add-ons</h3>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setAddToCatalogOpen((v) => !v)}
                    className="h-9 rounded-full border border-slate-200 bg-white px-3 text-[11px] font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
                    title="Create a catalog item from this line and match it"
                  >
                    Add to catalog
                  </button>
                  <button onClick={() => setModifiersModalOpen(false)} className="h-9 rounded-full border border-slate-200 bg-white px-3 text-[11px] font-medium text-slate-700 shadow-sm transition hover:bg-slate-50">Done</button>
                </div>
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
                      {addToCatalogOpen && addToCatalogDraft ? (
                        <div className="mt-2 rounded-xl border border-blue-200/70 bg-blue-50/60 p-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-[11px] font-semibold text-blue-950">Add this line to the catalog</p>
                            <button
                              type="button"
                              className="rounded-full border border-blue-200 bg-white px-2.5 py-1 text-[10px] font-semibold text-blue-800 hover:bg-blue-50"
                              onClick={() => setAddToCatalogOpen(false)}
                              disabled={addToCatalogBusy}
                            >
                              Close
                            </button>
                          </div>
                          <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
                            <label className="text-[11px] font-medium text-slate-700">
                              SKU
                              <input
                                className="ui-input mt-1 h-9 rounded-lg"
                                value={addToCatalogDraft.sku}
                                onChange={(e) => setAddToCatalogDraft((prev) => (prev ? { ...prev, sku: e.target.value } : prev))}
                              />
                            </label>
                            <label className="text-[11px] font-medium text-slate-700">
                              Category
                              <CatalogCategorySelect
                                className="ui-input mt-1 h-9 rounded-lg"
                                value={addToCatalogDraft.category}
                                options={scopeCategoryOptions}
                                onChange={(v) => setAddToCatalogDraft((prev) => (prev ? { ...prev, category: v } : prev))}
                              />
                            </label>
                            <label className="text-[11px] font-medium text-slate-700 md:col-span-2">
                              Description
                              <input
                                className="ui-input mt-1 h-9 rounded-lg"
                                value={addToCatalogDraft.description}
                                onChange={(e) => setAddToCatalogDraft((prev) => (prev ? { ...prev, description: e.target.value } : prev))}
                              />
                            </label>
                            <label className="text-[11px] font-medium text-slate-700">
                              Unit
                              <input
                                className="ui-input mt-1 h-9 rounded-lg"
                                value={addToCatalogDraft.uom}
                                onChange={(e) => setAddToCatalogDraft((prev) => (prev ? { ...prev, uom: (e.target.value || 'EA') as CatalogItem['uom'] } : prev))}
                              />
                            </label>
                            <label className="text-[11px] font-medium text-slate-700">
                              Base material ($)
                              <input
                                className="ui-input mt-1 h-9 rounded-lg tabular-nums"
                                inputMode="decimal"
                                value={String(addToCatalogDraft.baseMaterialCost)}
                                onChange={(e) =>
                                  setAddToCatalogDraft((prev) =>
                                    prev ? { ...prev, baseMaterialCost: Number(String(e.target.value).replace(/,/g, '')) || 0 } : prev
                                  )
                                }
                              />
                            </label>
                            <label className="text-[11px] font-medium text-slate-700">
                              Base labor (min)
                              <input
                                className="ui-input mt-1 h-9 rounded-lg tabular-nums"
                                inputMode="decimal"
                                value={String(addToCatalogDraft.baseLaborMinutes)}
                                onChange={(e) =>
                                  setAddToCatalogDraft((prev) =>
                                    prev ? { ...prev, baseLaborMinutes: Number(String(e.target.value).replace(/,/g, '')) || 0 } : prev
                                  )
                                }
                              />
                            </label>
                            <label className="text-[11px] font-medium text-slate-700 md:col-span-2">
                              Install labor family (optional)
                              <input
                                className="ui-input mt-1 h-9 rounded-lg"
                                value={addToCatalogDraft.installLaborFamily}
                                onChange={(e) =>
                                  setAddToCatalogDraft((prev) => (prev ? { ...prev, installLaborFamily: e.target.value } : prev))
                                }
                                placeholder="locker, fire_extinguisher_cabinet, wall_protection..."
                              />
                              <p className="mt-1 text-[10px] text-slate-600">
                                Use when labor minutes are missing/zero on future matched lines so the estimate can fall back safely.
                              </p>
                            </label>
                          </div>
                          <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
                            <button
                              type="button"
                              className="ui-btn-secondary h-9 px-3 text-xs"
                              onClick={() => void createCatalogItemFromSelectedLine()}
                              disabled={addToCatalogBusy}
                            >
                              {addToCatalogBusy ? 'Creating?' : 'Create & Match'}
                            </button>
                          </div>
                        </div>
                      ) : null}
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
                        <label className="text-[11px] font-medium text-slate-700 md:col-span-2">Notes
                          <textarea rows={3} className="ui-textarea mt-1 rounded-xl min-h-[72px]" value={selectedLine.notes || ''} onChange={(e) => patchLineLocal(selectedLine.id, { notes: e.target.value || null })} onBlur={() => void persistLine(selectedLine.id)} />
                        </label>
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
                        <label className="text-[11px] font-medium text-slate-700 md:col-span-2">
                          <span className="flex items-center justify-between">
                            <span>Install time (per unit)</span>
                            <span className="font-mono text-[9px] font-medium uppercase tracking-[0.08em] text-slate-400">min / unit</span>
                          </span>
                          <input
                            className="ui-input mt-1 h-9 rounded-lg tabular-nums"
                            inputMode="decimal"
                            {...lineLaborMinutesField.inputProps}
                          />
                          <p className="mt-1 text-[10px] leading-snug text-slate-600">
                            Extended for this line:{' '}
                            <span className="font-semibold tabular-nums text-slate-900">
                              {formatLaborDurationMinutes(Number(selectedLine.laborMinutes || 0) * Number(selectedLine.qty || 0))}
                            </span>
                            {Number(selectedLine.qty || 0) !== 1 ? (
                              <span className="text-slate-500">
                                {' '}
                                ({formatNumberSafe(selectedLine.qty, 0)} ? {formatNumberSafe(selectedLine.laborMinutes, 1)} min)
                              </span>
                            ) : null}
                            <span className="ml-1 text-slate-400">?</span>
                            <span className="ml-1 text-[10px] text-slate-500">
                              Saving re-drives labor cost from minutes ? subcontractor rate.
                            </span>
                          </p>
                        </label>
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

      {roomManagerOpen ? (
        <div
          className="fixed inset-0 z-[55] flex items-center justify-center bg-slate-900/45 p-3 sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="room-manager-dialog-title"
          onClick={() => setRoomManagerOpen(false)}
        >
          <div className="relative w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 flex items-center justify-between gap-2 px-0.5">
              <p id="room-manager-dialog-title" className="text-sm font-semibold text-white drop-shadow-sm">
                Rooms and areas
              </p>
              <button
                type="button"
                onClick={() => setRoomManagerOpen(false)}
                className="rounded-lg bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur-sm transition hover:bg-white/20"
              >
                Close
              </button>
            </div>
            <RoomManager
              rooms={rooms}
              activeRoomId={activeRoomId}
              onSelectRoom={(roomId) => {
                selectWorkspaceRoom(roomId);
              }}
              onOpenCreateRoom={() => {
                setRoomManagerOpen(false);
                openCreateRoomModal();
              }}
              onRenameRoom={(room) => void renameRoom(room)}
              onDuplicateRoom={(room) => void duplicateRoom(room)}
              onDeleteRoom={(room) => void deleteRoom(room)}
            />
          </div>
        </div>
      ) : null}

      {roomCreateModalOpen && (
        <div className="fixed inset-0 z-[60] bg-slate-900/45 p-3 sm:p-6" onClick={() => closeCreateRoomModal()}>
          <div className="mx-auto max-w-xl rounded-2xl border border-slate-200 bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="border-b border-slate-200 bg-gradient-to-r from-blue-50 to-white px-5 py-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.05em] text-blue-700">Add Room</p>
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
              <button type="button" onClick={() => closeCreateRoomModal()} disabled={creatingRoom} className="h-9 px-3 rounded-md border border-slate-300 text-[11px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">Cancel</button>
              <button type="button" onClick={() => void createRoom()} disabled={creatingRoom || !roomCreationDraft.roomName.trim()} className="h-9 px-4 rounded-md bg-blue-700 text-[11px] font-semibold text-white hover:bg-blue-800 disabled:opacity-50">
                {creatingRoom ? 'Creating...' : roomCreationDraft.addStarterLine ? 'Create Room + Item' : 'Create Room'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


