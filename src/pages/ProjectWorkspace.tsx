import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowRight, Calculator, Clock3, Download, FileUp, Hammer, Layers3, Paperclip, Sparkles, Trash2, Wallet, CalendarClock } from 'lucide-react';
import { api } from '../services/api';
import { BundleRecord, ModifierRecord, ProjectFileRecord, ProjectJobConditions, ProjectRecord, RoomRecord, SettingsRecord, TakeoffLineRecord } from '../shared/types/estimator';
import { CatalogItem } from '../types';
import { createDefaultProjectJobConditions, normalizeProjectJobConditions } from '../shared/utils/jobConditions';
import {
  DEFAULT_PROPOSAL_ACCEPTANCE_LABEL,
  DEFAULT_PROPOSAL_CLARIFICATIONS,
  DEFAULT_PROPOSAL_EXCLUSIONS,
  DEFAULT_PROPOSAL_INTRO,
  DEFAULT_PROPOSAL_TERMS,
  ensureProposalDefaults,
} from '../shared/utils/proposalDefaults';
import { TopProjectHeader } from '../components/workspace/TopProjectHeader';
import { RoomManager } from '../components/workspace/RoomManager';
import { EstimateGrid } from '../components/workspace/EstimateGrid';
import { ItemPicker } from '../components/workspace/ItemPicker';
import { ModifierPanel } from '../components/workspace/ModifierPanel';
import { ProposalPreview } from '../components/workspace/ProposalPreview';
import { BundlePickerModal } from '../components/workspace/BundlePickerModal';
import { formatCurrencySafe, formatKilobytesSafe, formatNumberSafe } from '../utils/numberFormat';
import { getDistanceInMiles } from '../utils/geo';

interface Summary {
  materialSubtotal: number;
  laborSubtotal: number;
  adjustedLaborSubtotal: number;
  totalLaborHours: number;
  durationDays: number;
  lineSubtotal: number;
  conditionAdjustmentAmount: number;
  conditionLaborMultiplier: number;
  burdenAmount: number;
  overheadAmount: number;
  profitAmount: number;
  taxAmount: number;
  baseBidTotal: number;
  conditionAssumptions: string[];
}

interface RoomCreationDraft {
  roomName: string;
  addStarterLine: boolean;
  starterDescription: string;
  starterQty: number;
  starterUnit: string;
}

type WorkspaceTab = 'overview' | 'setup' | 'rooms' | 'takeoff' | 'estimate' | 'files' | 'proposal';

const WORKSPACE_TABS: WorkspaceTab[] = ['overview', 'setup', 'rooms', 'takeoff', 'estimate', 'files', 'proposal'];

function isWorkspaceTab(value: string | null): value is WorkspaceTab {
  return !!value && WORKSPACE_TABS.includes(value as WorkspaceTab);
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
  const [activeTab, setActiveTab] = useState<WorkspaceTab>(() => {
    const requestedTab = searchParams.get('tab');
    return isWorkspaceTab(requestedTab) ? requestedTab : 'estimate';
  });

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

  const [activeRoomId, setActiveRoomId] = useState('');
  const [selectedLineId, setSelectedLineId] = useState<string | null>(null);

  const [catalogOpen, setCatalogOpen] = useState(false);
  const [bundleModalOpen, setBundleModalOpen] = useState(false);
  const [modifiersModalOpen, setModifiersModalOpen] = useState(false);
  const [takeoffRoomsModalOpen, setTakeoffRoomsModalOpen] = useState(false);
  const [roomCreateModalOpen, setRoomCreateModalOpen] = useState(false);
  const [roomCreationDraft, setRoomCreationDraft] = useState<RoomCreationDraft>(DEFAULT_ROOM_CREATION_DRAFT);
  const [creatingRoom, setCreatingRoom] = useState(false);
  const [catalogSearch, setCatalogSearch] = useState('');
  const [catalogCategory, setCatalogCategory] = useState('all');
  const [proposalDrafting, setProposalDrafting] = useState<null | 'scope_summary' | 'proposal_text' | 'terms_and_conditions' | 'default_short'>(null);
  const [distanceCalculating, setDistanceCalculating] = useState(false);
  const [distanceError, setDistanceError] = useState<string | null>(null);
  const companyWebsite = 'https://www.brightenbuildersllc.com/';

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
    void loadWorkspace(id);
  }, [id]);

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

  async function loadWorkspace(projectId: string) {
    try {
      setLoading(true);
      await api.repriceV1ProjectTakeoff(projectId);
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

      setProject(projectData);
      setRooms(roomData);
      setLines(lineData);
      setCatalog(catalogData);
      setSummary(summaryData);
      setSettings(ensureProposalDefaults(settingsData));
      setModifiers(modifiersData);
      setBundles(bundlesData);
      setProjectFiles(filesData);

      if (roomData[0]) setActiveRoomId(roomData[0].id);
    } catch (error) {
      console.error('Failed to load project workspace', error);
      navigate('/');
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
    const byRoom: Record<string, { count: number; subtotal: number }> = {};
    lines.forEach((line) => {
      if (!byRoom[line.roomId]) byRoom[line.roomId] = { count: 0, subtotal: 0 };
      byRoom[line.roomId].count += 1;
      byRoom[line.roomId].subtotal += line.lineTotal;
    });
    return byRoom;
  }, [lines]);

  const pricingMode = project?.pricingMode || 'labor_and_material';
  const showMaterial = pricingMode !== 'labor_only';
  const showLabor = pricingMode !== 'material_only';
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
      const q = catalogSearch.toLowerCase();
      const searchMatch = item.description.toLowerCase().includes(q) || item.sku.toLowerCase().includes(q);
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
    const saved = await api.updateV1Project(project.id, project);
    setProject(saved);
    setLastSavedAt(new Date().toISOString());
    await refreshTakeoff(saved.id);
  }

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

      patchJobConditions({
        travelDistanceMiles: distance,
        remoteTravel: distance > 50 ? true : jobConditions.remoteTravel,
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

  async function exportProposal() {
    if (!project) return;
    const container = document.querySelector('.print-proposal') as HTMLElement | null;
    if (!container) {
      window.print();
      return;
    }

    const dateStamp = new Date().toISOString().slice(0, 10);
    const number = project.projectNumber || project.id.slice(0, 8);
    const filename = `proposal-${number}-${dateStamp}.html`;
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${filename}</title><style>body{font-family:Arial,sans-serif;padding:24px;color:#0f172a}.print-proposal{max-width:8.5in;margin:0 auto}</style></head><body>${container.outerHTML}</body></html>`;
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
      setProject(updated);
      setLastSavedAt(new Date().toISOString());
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
      setActiveRoomId(room.id);

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
    const saved = await api.updateV1TakeoffLine(lineId, line);
    setLines((prev) => prev.map((item) => (item.id === lineId ? saved : item)));
    await refreshTakeoff(project.id);
  }

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

  if (loading || !project) {
    return <div className="p-8 text-sm text-slate-500">Loading workspace...</div>;
  }

  return (
    <div className="min-h-full bg-[linear-gradient(180deg,#f8fafc_0%,#f1f5f9_100%)]">
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

      <div className="ui-page space-y-2.5">
        <p className="ui-label px-1">Project Workflow</p>
        <div className="ui-surface p-2 flex items-center gap-1 overflow-x-auto whitespace-nowrap shadow-sm">
          <button onClick={() => setActiveTab('overview')} className={`h-8 px-2.5 rounded-md text-[11px] font-semibold transition-colors ${activeTab === 'overview' ? 'bg-blue-700 text-white shadow-sm' : 'hover:bg-slate-100 text-slate-600'}`}>Overview</button>
          <button onClick={() => setActiveTab('setup')} className={`h-8 px-2.5 rounded-md text-[11px] font-semibold transition-colors ${activeTab === 'setup' ? 'bg-blue-700 text-white shadow-sm' : 'hover:bg-slate-100 text-slate-600'}`}>Project Setup</button>
          <button onClick={() => setActiveTab('rooms')} className={`h-8 px-2.5 rounded-md text-[11px] font-semibold transition-colors ${activeTab === 'rooms' ? 'bg-blue-700 text-white shadow-sm' : 'hover:bg-slate-100 text-slate-600'}`}>Rooms</button>
          <button onClick={() => setActiveTab('takeoff')} className={`h-8 px-2.5 rounded-md text-[11px] font-semibold transition-colors ${activeTab === 'takeoff' ? 'bg-blue-700 text-white shadow-sm' : 'hover:bg-slate-100 text-slate-600'}`}>Takeoff</button>
          <button onClick={() => setActiveTab('estimate')} className={`h-8 px-2.5 rounded-md text-[11px] font-semibold transition-colors ${activeTab === 'estimate' ? 'bg-blue-700 text-white shadow-sm' : 'hover:bg-slate-100 text-slate-600'}`}>Estimate</button>
          <button onClick={() => setActiveTab('files')} className={`h-8 px-2.5 rounded-md text-[11px] font-semibold transition-colors ${activeTab === 'files' ? 'bg-blue-700 text-white shadow-sm' : 'hover:bg-slate-100 text-slate-600'}`}>Files</button>
          <button onClick={() => setActiveTab('proposal')} className={`h-8 px-2.5 rounded-md text-[11px] font-semibold transition-colors ${activeTab === 'proposal' ? 'bg-blue-700 text-white shadow-sm' : 'hover:bg-slate-100 text-slate-600'}`}>Proposal</button>
          <div className="ml-auto flex items-center gap-1.5 pl-2">
            <button onClick={() => void syncSheets()} className="ui-btn-secondary h-8 px-2.5 text-[11px] font-semibold">Sync</button>
          </div>
        </div>

        {activeTab === 'overview' && (
          <div className="space-y-4">
            <div className="ui-surface p-4 grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 text-sm">
              <div><p className="text-xs text-slate-500">Project</p><p className="font-semibold">{project.projectName}</p></div>
              <div><p className="text-xs text-slate-500">Client</p><p className="font-semibold">{project.clientName || 'N/A'}</p></div>
              <div><p className="text-xs text-slate-500">Pricing Basis</p><p className="font-semibold">{pricingMode === 'material_only' ? 'Material Only' : pricingMode === 'labor_only' ? 'Install Only' : 'Material + Install'}</p></div>
              <div><p className="text-xs text-slate-500">Rooms / Areas</p><p className="font-semibold">{rooms.length}</p></div>
              <div><p className="text-xs text-slate-500">Scope Categories</p><p className="font-semibold">{selectedScopeCategories.length || scopeCategoryOptions.length || 0}</p></div>
              <div><p className="text-xs text-slate-500">Estimate Total</p><p className="font-semibold">{formatCurrencySafe(summary?.baseBidTotal)}</p></div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-[1.1fr_1fr_320px] gap-4 items-start">
              <section className="rounded-2xl border border-slate-200/80 bg-white/90 shadow-sm p-4 space-y-4">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500 font-semibold">Setup Snapshot</p>
                  <h2 className="mt-1 text-lg font-semibold tracking-tight text-slate-900">Estimator Assumptions</h2>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <p className="text-xs text-slate-500">Labor Basis</p>
                    <p className="font-semibold text-slate-900 mt-1">{jobConditions.laborRateBasis === 'standard' ? 'Standard labor' : jobConditions.laborRateBasis === 'union' ? 'Union labor' : 'Prevailing wage labor'}</p>
                    <p className="text-xs text-slate-500 mt-1">Base multiplier x{formatNumberSafe(jobConditions.laborRateMultiplier, 2)}</p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <p className="text-xs text-slate-500">Delivery</p>
                    <p className="font-semibold text-slate-900 mt-1">{jobConditions.deliveryRequired ? 'Included in scope' : 'Not included'}</p>
                    <p className="text-xs text-slate-500 mt-1">{jobConditions.deliveryRequired ? `${jobConditions.deliveryPricingMode === 'flat' ? formatCurrencySafe(jobConditions.deliveryValue) : jobConditions.deliveryPricingMode === 'percent' ? `${formatNumberSafe(jobConditions.deliveryValue, 2)}% of base` : 'No separate adder'}` : 'No delivery allowance applied'}</p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 md:col-span-2">
                    <p className="text-xs text-slate-500">Included Scope Categories</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {(selectedScopeCategories.length > 0 ? selectedScopeCategories : scopeCategoryOptions).slice(0, 12).map((category) => (
                        <span key={category} className="px-2 py-1 rounded-full bg-white text-slate-700 text-[11px] border border-slate-200">{category}</span>
                      ))}
                      {selectedScopeCategories.length === 0 && scopeCategoryOptions.length === 0 ? <span className="text-xs text-slate-500">No catalog categories loaded yet.</span> : null}
                    </div>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 md:col-span-2">
                    <p className="text-xs text-slate-500">Rooms / Areas</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {rooms.slice(0, 10).map((room) => (
                        <span key={room.id} className="px-2 py-1 rounded-full bg-white text-slate-700 text-[11px] border border-slate-200">{room.roomName}</span>
                      ))}
                    </div>
                  </div>
                </div>
              </section>

              <section className="rounded-2xl border border-slate-200/80 bg-white/90 shadow-sm p-4 space-y-4">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500 font-semibold">Project-Wide Adders</p>
                  <h2 className="mt-1 text-lg font-semibold tracking-tight text-slate-900">Pricing Impact Summary</h2>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <p className="text-xs text-slate-500">Condition Labor Multiplier</p>
                    <p className="font-semibold text-slate-900 mt-1">x{formatNumberSafe(summary?.conditionLaborMultiplier || 1, 2)}</p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <p className="text-xs text-slate-500">Condition Adjustment</p>
                    <p className="font-semibold text-slate-900 mt-1">{formatCurrencySafe(summary?.conditionAdjustmentAmount)}</p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <p className="text-xs text-slate-500">Project Adder %</p>
                    <p className="font-semibold text-slate-900 mt-1">{formatNumberSafe(jobConditions.estimateAdderPercent, 2)}%</p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <p className="text-xs text-slate-500">Project Adder $</p>
                    <p className="font-semibold text-slate-900 mt-1">{formatCurrencySafe(jobConditions.estimateAdderAmount)}</p>
                  </div>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Special Notes</p>
                  <p className="mt-1 text-sm text-slate-700 whitespace-pre-wrap">{project.specialNotes?.trim() || 'No project-wide special notes yet.'}</p>
                </div>
              </section>

              <aside className="space-y-3">
                <section className="rounded-2xl border border-slate-200/80 bg-white/90 shadow-sm p-3.5">
                  <p className="text-[10px] uppercase tracking-[0.12em] text-slate-500 font-semibold">Active Assumptions</p>
                  {(summary?.conditionAssumptions || []).length > 0 ? (
                    <div className="mt-2 space-y-1.5 max-h-64 overflow-auto pr-1">
                      {(summary?.conditionAssumptions || []).slice(0, 12).map((assumption) => (
                        <p key={assumption} className="text-xs text-slate-700 leading-4">- {assumption}</p>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-2 text-xs text-slate-500">No project-level assumptions are active.</p>
                  )}
                </section>
                <section className="rounded-2xl border border-slate-200/80 bg-white/90 shadow-sm p-3.5 space-y-2">
                  <p className="text-[10px] uppercase tracking-[0.12em] text-slate-500 font-semibold">Next Best Action</p>
                  <p className="text-xs text-slate-600">Use Project Setup to confirm pricing basis, included categories, delivery, and job-wide adders before finalizing estimate pricing.</p>
                  <button onClick={() => setActiveTab('setup')} className="ui-btn-secondary h-8 px-3 text-[11px] font-semibold">Open Project Setup</button>
                </section>
              </aside>
            </div>
          </div>
        )}

        {activeTab === 'setup' && (
          <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-4 items-start">
            <section className="rounded-2xl border border-slate-200/70 bg-white/85 backdrop-blur-sm shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-200/80 bg-gradient-to-r from-slate-50 to-white">
                <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500 font-semibold">Estimating Control Center</p>
                <h2 className="mt-1 text-lg font-semibold tracking-tight text-slate-900">Project Setup</h2>
                <p className="mt-1 text-xs text-slate-600 max-w-2xl">Confirm project identity, pricing basis, included scope, and project-wide conditions before you price line items. Item modifiers remain line-specific in the estimate workspace.</p>
              </div>

              <div className="px-5 py-4 space-y-5">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-slate-900">Project Identity</h3>
                    <span className="text-[10px] uppercase tracking-wide text-slate-500">Foundation</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <label className="text-[11px] font-medium text-slate-700">Project Name<input className="ui-input mt-1 h-9" value={project.projectName} onChange={(e) => setProject({ ...project, projectName: e.target.value })} /></label>
                    <label className="text-[11px] font-medium text-slate-700">Client<input className="ui-input mt-1 h-9" value={project.clientName || ''} onChange={(e) => setProject({ ...project, clientName: e.target.value || null })} /></label>
                    <label className="text-[11px] font-medium text-slate-700">Project #<input className="ui-input mt-1 h-9" value={project.projectNumber || ''} onChange={(e) => setProject({ ...project, projectNumber: e.target.value || null })} /></label>
                    <label className="text-[11px] font-medium text-slate-700">Estimator<input className="ui-input mt-1 h-9" value={project.estimator || ''} onChange={(e) => setProject({ ...project, estimator: e.target.value || null })} /></label>
                    <label className="text-[11px] font-medium text-slate-700 md:col-span-2">Address<input className="ui-input mt-1 h-9" value={project.address || ''} onChange={(e) => setProject({ ...project, address: e.target.value || null })} onBlur={() => void refreshProjectDistance()} /></label>
                  </div>
                </div>

                <div className="border-t border-slate-200/80 pt-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-slate-900">Pricing Basis</h3>
                    <span className="text-[10px] uppercase tracking-wide text-slate-500">Material / Install / Rates</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <label className="text-[11px] font-medium text-slate-700">Pricing Basis
                      <select
                        className="ui-input mt-1 h-9"
                        value={project.pricingMode || 'labor_and_material'}
                        onChange={(e) => setProject({ ...project, pricingMode: e.target.value as ProjectRecord['pricingMode'] })}
                      >
                        <option value="material_only">Material Only</option>
                        <option value="labor_only">Install Only</option>
                        <option value="labor_and_material">Material + Install</option>
                      </select>
                    </label>
                    <label className="text-[11px] font-medium text-slate-700">Location / Region<input className="ui-input mt-1 h-9" value={jobConditions.locationLabel} onChange={(e) => patchJobConditions({ locationLabel: e.target.value })} /></label>
                    <label className="text-[11px] font-medium text-slate-700">Material Tax %<input type="number" className="ui-input mt-1 h-9" value={project.taxPercent} onChange={(e) => setProject({ ...project, taxPercent: Number(e.target.value) || 0 })} /></label>
                    <label className="text-[11px] font-medium text-slate-700">Location Tax Override %<input type="number" className="ui-input mt-1 h-9" value={jobConditions.locationTaxPercent ?? ''} onChange={(e) => patchJobConditions({ locationTaxPercent: e.target.value === '' ? null : Number(e.target.value) || 0 })} /></label>
                    <label className="text-[11px] font-medium text-slate-700">Labor Basis
                      <select className="ui-input mt-1 h-9" value={jobConditions.laborRateBasis} onChange={(e) => patchJobConditions({ laborRateBasis: e.target.value as ProjectJobConditions['laborRateBasis'] })}>
                        <option value="standard">Standard</option>
                        <option value="union">Union</option>
                        <option value="prevailing">Prevailing</option>
                      </select>
                    </label>
                    <label className="text-[11px] font-medium text-slate-700">Labor Multiplier<input type="number" step="0.01" className="ui-input mt-1 h-9" value={jobConditions.laborRateMultiplier} onChange={(e) => patchJobConditions({ laborRateMultiplier: Number(e.target.value) || 1 })} /></label>
                    <label className="text-[11px] font-medium text-slate-700">Installers / Crew Size<input type="number" min={1} className="ui-input mt-1 h-9" value={jobConditions.installerCount} onChange={(e) => patchJobConditions({ installerCount: Number(e.target.value) || 1 })} /></label>
                    <label className="text-[11px] font-medium text-slate-700">Labor Burden %<input type="number" className="ui-input mt-1 h-9" value={project.laborBurdenPercent} onChange={(e) => setProject({ ...project, laborBurdenPercent: Number(e.target.value) || 0 })} /></label>
                    <label className="text-[11px] font-medium text-slate-700">Overhead %<input type="number" className="ui-input mt-1 h-9" value={project.overheadPercent} onChange={(e) => setProject({ ...project, overheadPercent: Number(e.target.value) || 0 })} /></label>
                    <label className="text-[11px] font-medium text-slate-700">Profit %<input type="number" className="ui-input mt-1 h-9" value={project.profitPercent} onChange={(e) => setProject({ ...project, profitPercent: Number(e.target.value) || 0 })} /></label>
                  </div>
                  <div className="rounded-xl bg-slate-50/80 border border-slate-200/80 p-3 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600">
                    <div>
                      <p className="font-medium text-slate-900">Job Distance From Office</p>
                      <p className="mt-1">{jobConditions.travelDistanceMiles !== null ? `${formatNumberSafe(jobConditions.travelDistanceMiles, 1)} miles from office` : 'No calculated distance yet.'}</p>
                      {distanceError ? <p className="mt-1 text-red-600">{distanceError}</p> : null}
                    </div>
                    <button onClick={() => void refreshProjectDistance()} disabled={distanceCalculating} className="ui-btn-secondary h-8 px-3 text-[11px] font-semibold disabled:opacity-50">
                      {distanceCalculating ? 'Calculating...' : 'Recalculate Distance'}
                    </button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 rounded-xl bg-slate-50/80 border border-slate-200/80 p-3">
                    <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-2">
                      <label className="text-xs text-slate-700 flex items-center gap-2"><input type="checkbox" checked={jobConditions.unionWage} onChange={(e) => patchJobConditions({ unionWage: e.target.checked })} />Union Wage</label>
                      <label className="text-[11px] font-medium text-slate-700">Labor Multiplier<input type="number" step="0.01" className="ui-input mt-1 h-8" value={jobConditions.unionWageMultiplier} onChange={(e) => patchJobConditions({ unionWageMultiplier: Number(e.target.value) || 0 })} /></label>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-2">
                      <label className="text-xs text-slate-700 flex items-center gap-2"><input type="checkbox" checked={jobConditions.prevailingWage} onChange={(e) => patchJobConditions({ prevailingWage: e.target.checked })} />Prevailing Wage</label>
                      <label className="text-[11px] font-medium text-slate-700">Labor Multiplier<input type="number" step="0.01" className="ui-input mt-1 h-8" value={jobConditions.prevailingWageMultiplier} onChange={(e) => patchJobConditions({ prevailingWageMultiplier: Number(e.target.value) || 0 })} /></label>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-2">
                      <label className="text-xs text-slate-700 flex items-center gap-2"><input type="checkbox" checked={jobConditions.smallJobFactor} onChange={(e) => patchJobConditions({ smallJobFactor: e.target.checked })} />Small Job Factor</label>
                      <label className="text-[11px] font-medium text-slate-700">Labor Multiplier<input type="number" step="0.01" className="ui-input mt-1 h-8" value={jobConditions.smallJobMultiplier} onChange={(e) => patchJobConditions({ smallJobMultiplier: Number(e.target.value) || 0 })} /></label>
                    </div>
                  </div>
                </div>

                <div className="border-t border-slate-200/80 pt-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-slate-900">Rooms / Included Scope</h3>
                    <span className="text-[10px] uppercase tracking-wide text-slate-500">Scope Definition</span>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-slate-900">Rooms / Areas</p>
                      <p className="text-xs text-slate-500 mt-1">{rooms.length} room(s) currently define how takeoff and estimate lines are organized.</p>
                    </div>
                    <button onClick={() => setActiveTab('rooms')} className="ui-btn-secondary h-8 px-3 text-[11px] font-semibold">Manage Rooms</button>
                  </div>
                  <div className="space-y-2">
                    <p className="text-[11px] font-medium text-slate-700">Included Catalog Categories</p>
                    <div className="flex flex-wrap gap-2">
                      {scopeCategoryOptions.map((category) => {
                        const active = selectedScopeCategories.includes(category);
                        return (
                          <button
                            key={category}
                            type="button"
                            onClick={() => toggleScopeCategory(category)}
                            className={`px-2.5 py-1.5 rounded-full border text-[11px] font-medium transition-colors ${active ? 'border-blue-300 bg-blue-50 text-blue-800' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
                          >
                            {category}
                          </button>
                        );
                      })}
                    </div>
                    {scopeCategoryOptions.length === 0 ? <p className="text-xs text-slate-500">Catalog categories will appear here after catalog sync.</p> : null}
                  </div>
                </div>

                <div className="border-t border-slate-200/80 pt-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-slate-900">Project-Wide Adders + Conditions</h3>
                    <span className="text-[10px] uppercase tracking-wide text-slate-500">Execution Reality</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <label className="text-[11px] font-medium text-slate-700">Floors<input type="number" min={1} className="ui-input mt-1 h-9" value={jobConditions.floors} onChange={(e) => patchJobConditions({ floors: Number(e.target.value) || 1 })} /></label>
                    <label className="text-[11px] font-medium text-slate-700">Floor Labor Add / Floor<input type="number" step="0.01" className="ui-input mt-1 h-9" value={jobConditions.floorMultiplierPerFloor} onChange={(e) => patchJobConditions({ floorMultiplierPerFloor: Number(e.target.value) || 0 })} /></label>
                    <label className="text-[11px] font-medium text-slate-700">Delivery Difficulty
                      <select className="ui-input mt-1 h-9" value={jobConditions.deliveryDifficulty} onChange={(e) => patchJobConditions({ deliveryDifficulty: e.target.value as ProjectJobConditions['deliveryDifficulty'] })}>
                        <option value="standard">Standard</option>
                        <option value="constrained">Constrained</option>
                        <option value="difficult">Difficult</option>
                      </select>
                    </label>
                    <label className="text-[11px] font-medium text-slate-700">Mobilization Complexity
                      <select className="ui-input mt-1 h-9" value={jobConditions.mobilizationComplexity} onChange={(e) => patchJobConditions({ mobilizationComplexity: e.target.value as ProjectJobConditions['mobilizationComplexity'] })}>
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                      </select>
                    </label>
                    <label className="text-[11px] font-medium text-slate-700">Project Adder %<input type="number" step="0.01" className="ui-input mt-1 h-9" value={jobConditions.estimateAdderPercent} onChange={(e) => patchJobConditions({ estimateAdderPercent: Number(e.target.value) || 0 })} /></label>
                    <label className="text-[11px] font-medium text-slate-700">Project Adder $<input type="number" step="0.01" className="ui-input mt-1 h-9" value={jobConditions.estimateAdderAmount} onChange={(e) => patchJobConditions({ estimateAdderAmount: Number(e.target.value) || 0 })} /></label>
                    <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 md:col-span-3 grid grid-cols-1 md:grid-cols-[1fr_180px_180px] gap-3 items-end">
                      <label className="text-xs text-slate-700 flex items-center gap-2"><input type="checkbox" checked={jobConditions.deliveryRequired} onChange={(e) => patchJobConditions({ deliveryRequired: e.target.checked })} />Delivery is included in this job</label>
                      <label className="text-[11px] font-medium text-slate-700">Delivery Pricing Mode
                        <select className="ui-input mt-1 h-9" value={jobConditions.deliveryPricingMode} onChange={(e) => patchJobConditions({ deliveryPricingMode: e.target.value as ProjectJobConditions['deliveryPricingMode'] })}>
                          <option value="included">Included / No Charge</option>
                          <option value="flat">Flat Amount</option>
                          <option value="percent">Percent of Base</option>
                        </select>
                      </label>
                      <label className="text-[11px] font-medium text-slate-700">Delivery Value
                        <input type="number" step="0.01" className="ui-input mt-1 h-9" value={jobConditions.deliveryValue} onChange={(e) => patchJobConditions({ deliveryValue: Number(e.target.value) || 0 })} />
                      </label>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 rounded-xl bg-slate-50/80 border border-slate-200/80 p-3">
                    <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-2">
                      <label className="text-xs text-slate-700 flex items-center gap-2"><input type="checkbox" checked={jobConditions.elevatorAvailable} onChange={(e) => patchJobConditions({ elevatorAvailable: e.target.checked })} />Elevator Available</label>
                      <p className="text-[11px] text-slate-500">If unchecked on multi-floor work, labor increases automatically.</p>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-2">
                      <label className="text-xs text-slate-700 flex items-center gap-2"><input type="checkbox" checked={jobConditions.occupiedBuilding} onChange={(e) => patchJobConditions({ occupiedBuilding: e.target.checked })} />Occupied Building</label>
                      <label className="text-[11px] font-medium text-slate-700">Labor Multiplier<input type="number" step="0.01" className="ui-input mt-1 h-8" value={jobConditions.occupiedBuildingMultiplier} onChange={(e) => patchJobConditions({ occupiedBuildingMultiplier: Number(e.target.value) || 0 })} /></label>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-2">
                      <label className="text-xs text-slate-700 flex items-center gap-2"><input type="checkbox" checked={jobConditions.restrictedAccess} onChange={(e) => patchJobConditions({ restrictedAccess: e.target.checked })} />Restricted Access</label>
                      <label className="text-[11px] font-medium text-slate-700">Labor Multiplier<input type="number" step="0.01" className="ui-input mt-1 h-8" value={jobConditions.restrictedAccessMultiplier} onChange={(e) => patchJobConditions({ restrictedAccessMultiplier: Number(e.target.value) || 0 })} /></label>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-2">
                      <label className="text-xs text-slate-700 flex items-center gap-2"><input type="checkbox" checked={jobConditions.remoteTravel} onChange={(e) => patchJobConditions({ remoteTravel: e.target.checked })} />Remote / Travel Job</label>
                      <label className="text-[11px] font-medium text-slate-700">Labor Multiplier<input type="number" step="0.01" className="ui-input mt-1 h-8" value={jobConditions.remoteTravelMultiplier} onChange={(e) => patchJobConditions({ remoteTravelMultiplier: Number(e.target.value) || 0 })} /></label>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-2">
                      <label className="text-xs text-slate-700 flex items-center gap-2"><input type="checkbox" checked={jobConditions.afterHoursWork} onChange={(e) => patchJobConditions({ afterHoursWork: e.target.checked })} />After-hours Work</label>
                      <label className="text-[11px] font-medium text-slate-700">Labor Multiplier<input type="number" step="0.01" className="ui-input mt-1 h-8" value={jobConditions.afterHoursMultiplier} onChange={(e) => patchJobConditions({ afterHoursMultiplier: Number(e.target.value) || 0 })} /></label>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-2">
                      <label className="text-xs text-slate-700 flex items-center gap-2"><input type="checkbox" checked={jobConditions.phasedWork} onChange={(e) => patchJobConditions({ phasedWork: e.target.checked })} />Phased Work</label>
                      <label className="text-[11px] font-medium text-slate-700">Labor Multiplier<input type="number" step="0.01" className="ui-input mt-1 h-8" value={jobConditions.phasedWorkMultiplier} onChange={(e) => patchJobConditions({ phasedWorkMultiplier: Number(e.target.value) || 0 })} /></label>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-2 md:col-span-2 xl:col-span-1">
                      <label className="text-xs text-slate-700 flex items-center gap-2"><input type="checkbox" checked={jobConditions.scheduleCompression} onChange={(e) => patchJobConditions({ scheduleCompression: e.target.checked })} />Schedule Compression</label>
                      <label className="text-[11px] font-medium text-slate-700">Labor Multiplier<input type="number" step="0.01" className="ui-input mt-1 h-8" value={jobConditions.scheduleCompressionMultiplier} onChange={(e) => patchJobConditions({ scheduleCompressionMultiplier: Number(e.target.value) || 0 })} /></label>
                    </div>
                  </div>
                </div>

                <div className="border-t border-slate-200/80 pt-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-slate-900">Special Notes</h3>
                    <span className="text-[10px] uppercase tracking-wide text-slate-500">Clarify Scope</span>
                  </div>
                  <label className="text-[11px] font-medium text-slate-700 block">Project Special Notes
                    <textarea className="ui-input mt-1 min-h-[112px] py-2" value={project.specialNotes || ''} onChange={(e) => setProject({ ...project, specialNotes: e.target.value || null })} placeholder="Delivery restrictions, coordination assumptions, exclusions, alternates, or anything that should be visible in overview and proposal drafting." />
                  </label>
                </div>
              </div>
            </section>

            <aside className="space-y-3 xl:sticky xl:top-[88px]">
              <section className="rounded-2xl border border-slate-200/80 bg-white/90 shadow-sm p-3.5">
                <p className="text-[10px] uppercase tracking-[0.12em] text-slate-500 font-semibold">Assumptions / Impact Summary</p>
                <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5">
                    <p className="text-slate-500">Installers</p>
                    <p className="font-semibold text-slate-900">{jobConditions.installerCount}</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5">
                    <p className="text-slate-500">Distance</p>
                    <p className="font-semibold text-slate-900">{jobConditions.travelDistanceMiles !== null ? `${formatNumberSafe(jobConditions.travelDistanceMiles, 1)} mi` : 'n/a'}</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5">
                    <p className="text-slate-500">Labor Multiplier</p>
                    <p className="font-semibold text-slate-900">x{formatNumberSafe(summary?.conditionLaborMultiplier || 1, 2)}</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5">
                    <p className="text-slate-500">Condition Adj.</p>
                    <p className="font-semibold text-slate-900">{formatCurrencySafe(summary?.conditionAdjustmentAmount)}</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 col-span-2">
                    <p className="text-slate-500">Adjusted Labor Subtotal</p>
                    <p className="font-semibold text-slate-900">{formatCurrencySafe(summary?.adjustedLaborSubtotal)}</p>
                  </div>
                </div>
              </section>

              <section className="rounded-2xl border border-slate-200/80 bg-white/90 shadow-sm p-3.5">
                <p className="text-[10px] uppercase tracking-[0.12em] text-slate-500 font-semibold">Active Assumptions</p>
                {(summary?.conditionAssumptions || []).length > 0 ? (
                  <div className="mt-2 space-y-1.5 max-h-48 overflow-auto pr-1">
                    {(summary?.conditionAssumptions || []).slice(0, 12).map((assumption) => (
                      <p key={assumption} className="text-xs text-slate-700 leading-4">- {assumption}</p>
                    ))}
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-slate-500">No project-level assumptions are active.</p>
                )}
              </section>

              <section className="rounded-2xl border border-slate-200/80 bg-white/90 shadow-sm p-3.5 space-y-2">
                <p className="text-[10px] uppercase tracking-[0.12em] text-slate-500 font-semibold">Scope Included</p>
                <div className="flex flex-wrap gap-1.5">
                  {selectedScopeCategories.length > 0 ? selectedScopeCategories.map((category) => (
                    <span key={category} className="px-2 py-1 rounded-full bg-slate-100 text-slate-700 text-[11px] border border-slate-200">{category}</span>
                  )) : <p className="text-xs text-slate-500">No categories selected yet.</p>}
                </div>
              </section>

              <section className="rounded-2xl border border-slate-200/80 bg-white/90 shadow-sm p-3.5 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] uppercase tracking-[0.12em] text-slate-500 font-semibold">Proposal Notes Preview</p>
                  <button onClick={() => setActiveTab('proposal')} className="text-[11px] font-medium text-blue-700 hover:text-blue-800">Open</button>
                </div>
                <p className="text-xs text-slate-600">Union, prevailing wage, phased work, and special access conditions are available for proposal assumptions and clarifications.</p>
              </section>

              <section className="rounded-2xl border border-slate-200/80 bg-white/90 shadow-sm p-3.5">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.12em] text-slate-500 font-semibold">Rooms Snapshot</p>
                    <p className="text-xs text-slate-600 mt-1">Rooms are managed primarily in the Rooms tab.</p>
                  </div>
                  <button onClick={() => setActiveTab('rooms')} className="ui-btn-secondary h-7 px-2 text-[11px]">Open Rooms</button>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {rooms.slice(0, 6).map((room) => (
                    <span key={room.id} className="px-2 py-1 rounded-full bg-slate-100 text-slate-700 text-[11px] border border-slate-200">{room.roomName}</span>
                  ))}
                  {rooms.length > 6 && <span className="px-2 py-1 rounded-full bg-slate-100 text-slate-500 text-[11px] border border-slate-200">+{rooms.length - 6} more</span>}
                </div>
              </section>
            </aside>
          </div>
        )}

        {activeTab === 'rooms' && (
          <div className="grid grid-cols-[320px_1fr] gap-4">
            <RoomManager
              rooms={rooms}
              activeRoomId={activeRoomId}
              onSelectRoom={setActiveRoomId}
              onOpenCreateRoom={openCreateRoomModal}
              onRenameRoom={(room) => void renameRoom(room)}
              onDuplicateRoom={(room) => void duplicateRoom(room)}
              onDeleteRoom={(room) => void deleteRoom(room)}
            />
            <div className="bg-white border border-slate-200 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-slate-800 mb-2">Room Summary</h3>
              <p className="text-sm text-slate-600">Select a room to manage and verify room-level totals and lines.</p>
            </div>
          </div>
        )}

        {activeTab === 'takeoff' && (
          <div className="space-y-3 min-w-0">
              <div className="relative overflow-hidden rounded-[28px] border border-amber-200/70 bg-[radial-gradient(circle_at_top_left,rgba(255,246,220,0.95)_0%,rgba(255,252,245,0.98)_46%,rgba(255,255,255,0.98)_100%)] p-5 shadow-[0_22px_48px_rgba(180,131,27,0.08)]">
                <div className="pointer-events-none absolute inset-y-0 right-0 w-1/3 bg-[radial-gradient(circle_at_center,rgba(183,121,31,0.08)_0%,rgba(183,121,31,0)_72%)]" />
                <div className="relative flex flex-wrap items-start justify-between gap-4">
                  <div className="max-w-3xl">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="ui-chip-soft">Takeoff workspace</span>
                      <span className="ui-chip-soft">{activeRoomLines.length} visible lines</span>
                      <span className="ui-chip-soft">{rooms.length} rooms</span>
                    </div>
                    <h3 className="mt-3 text-[28px] font-semibold tracking-[-0.04em] text-slate-950 md:text-[34px]">Import, clean up, assign</h3>
                    <p className="mt-2 max-w-2xl text-[13px] leading-6 text-slate-600">This is the cleanup pass before pricing. Normalize descriptions, confirm quantities, keep the active room in focus, and resolve source mapping before you switch to estimate mode.</p>
                    <div className="mt-4 flex flex-wrap gap-2 text-[11px]">
                      <span className="rounded-full bg-white/80 px-3 py-1.5 text-slate-600 shadow-sm ring-1 ring-amber-200/70">Active room {roomNamesById[activeRoomId] || 'Unassigned'}</span>
                      <span className="rounded-full bg-white/80 px-3 py-1.5 text-slate-600 shadow-sm ring-1 ring-amber-200/70">Room subtotal {formatCurrencySafe(roomSubtotal)}</span>
                      <span className="rounded-full bg-white/80 px-3 py-1.5 text-slate-600 shadow-sm ring-1 ring-amber-200/70">Parser-first review</span>
                    </div>
                  </div>
                  <div className="grid min-w-[280px] gap-3 sm:grid-cols-2">
                    <div className="rounded-[24px] border border-amber-200/80 bg-[linear-gradient(180deg,#fff8e6_0%,#fff1cb_100%)] p-4 shadow-sm sm:col-span-2">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-700">Takeoff focus</p>
                      <p className="mt-2 text-[24px] font-semibold tracking-[-0.04em] text-slate-950">{roomNamesById[activeRoomId] || 'Unassigned'}</p>
                      <div className="mt-3 flex items-center justify-between text-[11px] text-slate-600">
                        <span>{activeRoomLines.length} visible lines</span>
                        <span>{formatCurrencySafe(roomSubtotal)}</span>
                      </div>
                    </div>
                    <button onClick={() => void addManualLine()} className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-[linear-gradient(135deg,#b7791f_0%,#8d5b12_100%)] px-4 text-[11px] font-semibold text-white shadow-[0_12px_24px_rgba(183,121,31,0.22)] hover:brightness-[1.03]">
                      <Sparkles className="h-3.5 w-3.5" /> Add Manual Line
                    </button>
                  </div>
                </div>
              </div>

              <div className="space-y-4 rounded-[28px] bg-[linear-gradient(180deg,rgba(255,255,255,0.96)_0%,rgba(255,251,244,0.96)_100%)] p-4 shadow-[0_18px_40px_rgba(15,23,42,0.05)] ring-1 ring-amber-200/60">
                <div className="flex flex-wrap items-center gap-2 justify-between">
                  <div>
                    <p className="text-[13px] font-semibold tracking-[-0.02em] text-slate-900">Scope review workflow</p>
                    <p className="mt-1 text-[12px] text-slate-500">Keep room assignment, source cleanup, and catalog matching close at hand.</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button onClick={() => setCatalogOpen(true)} className="inline-flex h-10 items-center gap-2 rounded-full bg-[linear-gradient(135deg,var(--brand)_0%,var(--brand-strong)_100%)] px-4 text-[11px] font-semibold text-white shadow-[0_12px_24px_rgba(11,61,145,0.22)] hover:brightness-[1.03]">Catalog Match</button>
                    <button onClick={() => setBundleModalOpen(true)} className="ui-btn-secondary h-10 rounded-full px-4 text-[11px]">Scope Bundles</button>
                    <button onClick={() => setTakeoffRoomsModalOpen(true)} className="ui-ghost-btn h-10 px-2 text-[11px]">Manage Rooms</button>
                  </div>
                </div>

                <div className="rounded-[24px] bg-[linear-gradient(180deg,rgba(255,248,230,0.72)_0%,rgba(255,255,255,0.96)_100%)] p-3 ring-1 ring-amber-200/70">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[12px] font-semibold text-slate-900">Rooms</p>
                      <p className="mt-1 text-[11px] text-slate-500">Treat the active room like a workspace lane, not just a filter.</p>
                    </div>
                    <div className="rounded-2xl bg-white px-3 py-2 text-right shadow-sm ring-1 ring-amber-200/70">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-amber-700">Active room total</p>
                      <p className="mt-1 text-[16px] font-semibold tracking-[-0.03em] text-slate-900">{formatCurrencySafe(roomSubtotal)}</p>
                    </div>
                  </div>
                  <div className="flex min-w-0 gap-2 overflow-x-auto pb-1">
                    {rooms.map((room) => {
                      const active = room.id === activeRoomId;
                      const metric = roomMetrics[room.id] || { count: 0, subtotal: 0 };
                      return (
                        <button
                          key={room.id}
                          onClick={() => setActiveRoomId(room.id)}
                          title={`${metric.count} lines · ${formatCurrencySafe(metric.subtotal)}`}
                          className={`shrink-0 rounded-[20px] px-3 py-2 text-left transition-all ${active ? 'bg-[linear-gradient(135deg,#b7791f_0%,#8d5b12_100%)] text-white shadow-[0_12px_28px_rgba(183,121,31,0.22)]' : 'bg-white/92 text-slate-700 shadow-sm ring-1 ring-amber-200/70 hover:-translate-y-0.5 hover:bg-white'}`}
                        >
                          <div className="min-w-[148px]">
                            <div className={`text-[11px] font-semibold ${active ? 'text-white' : 'text-slate-800'}`}>{room.roomName}</div>
                            <div className={`mt-1 flex items-center justify-between text-[10px] ${active ? 'text-amber-100' : 'text-slate-500'}`}>
                              <span>{metric.count} lines</span>
                              <span>{formatCurrencySafe(metric.subtotal)}</span>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  <div className="rounded-[24px] bg-[linear-gradient(180deg,#fff8e6_0%,#fff1cb_100%)] p-4 shadow-sm ring-1 ring-amber-200/80"><div className="flex items-center justify-between"><p className="text-[11px] font-semibold text-amber-700">Active Room</p><Layers3 className="h-4 w-4 text-amber-700" /></div><p className="mt-3 truncate text-[22px] font-semibold tracking-[-0.04em] text-slate-950">{roomNamesById[activeRoomId] || 'Unassigned'}</p><p className="mt-1 text-[11px] text-slate-600">Current cleanup lane</p></div>
                  <div className="rounded-[24px] bg-white p-4 shadow-sm ring-1 ring-slate-200/80"><div className="flex items-center justify-between"><p className="text-[11px] font-semibold text-slate-500">Visible Lines</p><Calculator className="h-4 w-4 text-slate-400" /></div><p className="mt-3 text-[24px] font-semibold tracking-[-0.04em] text-slate-950">{activeRoomLines.length}</p><p className="mt-1 text-[11px] text-slate-500">In active room</p></div>
                  <div className="rounded-[24px] bg-white p-4 shadow-sm ring-1 ring-slate-200/80"><div className="flex items-center justify-between"><p className="text-[11px] font-semibold text-slate-500">Rooms</p><CalendarClock className="h-4 w-4 text-slate-400" /></div><p className="mt-3 text-[24px] font-semibold tracking-[-0.04em] text-slate-950">{rooms.length}</p><p className="mt-1 text-[11px] text-slate-500">Across the project</p></div>
                  <div className="rounded-[24px] bg-[linear-gradient(180deg,#10284f_0%,#0a224d_100%)] p-4 text-white shadow-[0_18px_40px_rgba(10,34,77,0.18)]"><div className="flex items-center justify-between"><p className="text-[11px] font-semibold text-slate-300">Room Total</p><Wallet className="h-4 w-4 text-blue-200" /></div><p className="mt-3 text-[24px] font-semibold tracking-[-0.05em]">{formatCurrencySafe(roomSubtotal)}</p><p className="mt-1 text-[11px] text-slate-300">Current room subtotal</p></div>
                </div>

              <EstimateGrid
                lines={activeRoomLines}
                rooms={rooms}
                categories={categories}
                roomNamesById={roomNamesById}
                pricingMode={pricingMode}
                viewMode="takeoff"
                laborMultiplier={summary?.conditionLaborMultiplier || 1}
                selectedLineId={selectedLineId}
                onSelectLine={openLineEditor}
                onPersistLine={(lineId, updates) => void persistLine(lineId, updates)}
                onDeleteLine={(lineId) => void deleteLine(lineId)}
              />
            </div>
          </div>
        )}

        {activeTab === 'estimate' && (
          <div className="space-y-2 min-w-0">
              <div className="relative overflow-hidden rounded-[28px] border border-slate-200/80 bg-[radial-gradient(circle_at_top_left,rgba(231,239,255,0.92)_0%,rgba(255,255,255,0.98)_42%,rgba(244,248,252,0.95)_100%)] p-5 shadow-[0_24px_56px_rgba(15,23,42,0.08)]">
                <div className="pointer-events-none absolute inset-y-0 right-0 w-1/3 bg-[radial-gradient(circle_at_center,rgba(15,118,110,0.09)_0%,rgba(15,118,110,0)_72%)]" />
                <div className="relative flex flex-wrap items-start justify-between gap-4">
                  <div className="max-w-3xl">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="ui-chip-soft">Estimate workspace</span>
                      <span className="ui-chip-soft">{pricingMode.replaceAll('_', ' ')}</span>
                      <span className="ui-chip-soft">{lines.length} scoped lines</span>
                    </div>
                    <h3 className="mt-3 text-[28px] font-semibold tracking-[-0.04em] text-slate-950 md:text-[34px]">Project Estimate</h3>
                    <p className="mt-2 max-w-2xl text-[13px] leading-6 text-slate-600">Keep scope decisions, pricing adjustments, and room organization in one place. The active room and core estimate drivers stay visible so you can move quickly without losing context.</p>
                    <div className="mt-4 flex flex-wrap gap-2 text-[11px]">
                      <span className="rounded-full bg-white/80 px-3 py-1.5 text-slate-600 shadow-sm ring-1 ring-slate-200/80">Active room {roomNamesById[activeRoomId] || 'Unassigned'}</span>
                      <span className="rounded-full bg-white/80 px-3 py-1.5 text-slate-600 shadow-sm ring-1 ring-slate-200/80">{activeRoomLines.length} line items visible</span>
                      <span className="rounded-full bg-white/80 px-3 py-1.5 text-slate-600 shadow-sm ring-1 ring-slate-200/80">{rooms.length} rooms in scope</span>
                    </div>
                  </div>
                  <div className="grid min-w-[280px] gap-3 self-stretch sm:grid-cols-2">
                    <div className="rounded-[24px] border border-slate-200/70 bg-[linear-gradient(180deg,#0f274f_0%,#0a224d_100%)] p-4 text-white shadow-[0_18px_44px_rgba(10,34,77,0.2)] sm:col-span-2">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-300">Estimated Total</p>
                      <p className="mt-2 text-[30px] font-semibold tracking-[-0.05em]">{formatCurrencySafe(summary?.baseBidTotal)}</p>
                      <div className="mt-3 flex items-center justify-between text-[11px] text-slate-300">
                        <span>Room subtotal {formatCurrencySafe(roomSubtotal)}</span>
                        <span>{formatNumberSafe(summary?.totalLaborHours || 0, 1)} hrs</span>
                      </div>
                    </div>
                    <div className="rounded-2xl bg-white/78 p-3 shadow-sm ring-1 ring-slate-200/80 backdrop-blur">
                      <p className="text-[10px] font-semibold tracking-[0.08em] text-slate-500 uppercase">Assumptions</p>
                      <p className="mt-1 text-[18px] font-semibold tracking-[-0.03em] text-slate-900">{summary?.conditionAssumptions?.length || 0}</p>
                      <p className="mt-1 text-[11px] text-slate-500">Active pricing conditions</p>
                    </div>
                    <div className="rounded-2xl bg-white/78 p-3 shadow-sm ring-1 ring-slate-200/80 backdrop-blur">
                      <p className="text-[10px] font-semibold tracking-[0.08em] text-slate-500 uppercase">Crew plan</p>
                      <p className="mt-1 text-[18px] font-semibold tracking-[-0.03em] text-slate-900">{jobConditions.installerCount}</p>
                      <p className="mt-1 text-[11px] text-slate-500">Installer{jobConditions.installerCount === 1 ? '' : 's'} planned</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-4 rounded-[28px] bg-[linear-gradient(180deg,rgba(255,255,255,0.96)_0%,rgba(248,250,252,0.96)_100%)] p-4 shadow-[0_18px_40px_rgba(15,23,42,0.05)] ring-1 ring-slate-200/70">
                <div className="flex flex-wrap items-center gap-2 justify-between">
                  <div>
                    <p className="text-[13px] font-semibold tracking-[-0.02em] text-slate-900">Pricing workspace</p>
                    <p className="mt-1 text-[12px] text-slate-500">Focused actions, room-based scope navigation, and a live view of the estimate.</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button onClick={() => setCatalogOpen(true)} className="inline-flex h-10 items-center gap-2 rounded-full bg-[linear-gradient(135deg,var(--brand)_0%,var(--brand-strong)_100%)] px-4 text-[11px] font-semibold text-white shadow-[0_12px_24px_rgba(11,61,145,0.22)] hover:brightness-[1.03]">
                      <Sparkles className="h-3.5 w-3.5" /> Bulk Add Items
                    </button>
                    <button onClick={() => setBundleModalOpen(true)} className="ui-btn-secondary h-10 rounded-full px-4 text-[11px]">Add Bundle</button>
                    <button onClick={() => setModifiersModalOpen(true)} disabled={!selectedLine} className="ui-btn-secondary h-10 rounded-full px-4 text-[11px] disabled:opacity-50">Edit Line</button>
                    <button onClick={() => setTakeoffRoomsModalOpen(true)} className="ui-ghost-btn h-10 px-2 text-[11px]">Manage Rooms</button>
                    <button onClick={() => setActiveTab('proposal')} className="ui-ghost-btn h-10 px-2 text-[11px] inline-flex items-center gap-1.5">Proposal <ArrowRight className="h-3.5 w-3.5" /></button>
                  </div>
                </div>

                <div className="rounded-[24px] bg-[linear-gradient(180deg,rgba(242,246,251,0.9)_0%,rgba(255,255,255,0.96)_100%)] p-3 ring-1 ring-slate-200/70">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[12px] font-semibold text-slate-900">Rooms</p>
                      <p className="mt-1 text-[11px] text-slate-500">Switch rooms quickly and keep the active subtotal in view.</p>
                    </div>
                    <div className="rounded-2xl bg-white px-3 py-2 text-right shadow-sm ring-1 ring-slate-200/70">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">Active Room Total</p>
                      <p className="mt-1 text-[16px] font-semibold tracking-[-0.03em] text-slate-900">{formatCurrencySafe(roomSubtotal)}</p>
                    </div>
                  </div>
                  <div className="flex min-w-0 gap-2 overflow-x-auto pb-1">
                    {rooms.map((room) => {
                      const active = room.id === activeRoomId;
                      const metric = roomMetrics[room.id] || { count: 0, subtotal: 0 };
                      return (
                        <button
                          key={room.id}
                          onClick={() => setActiveRoomId(room.id)}
                          title={`${metric.count} lines · ${formatCurrencySafe(metric.subtotal)}`}
                          className={`shrink-0 rounded-[20px] px-3 py-2 text-left transition-all ${active ? 'bg-[linear-gradient(135deg,var(--brand)_0%,#164fa8_100%)] text-white shadow-[0_12px_28px_rgba(11,61,145,0.22)]' : 'bg-white/92 text-slate-700 shadow-sm ring-1 ring-slate-200/80 hover:-translate-y-0.5 hover:bg-white'}`}
                        >
                          <div className="min-w-[148px]">
                            <div className={`text-[11px] font-semibold ${active ? 'text-white' : 'text-slate-800'}`}>{room.roomName}</div>
                            <div className={`mt-1 flex items-center justify-between text-[10px] ${active ? 'text-blue-100' : 'text-slate-500'}`}>
                              <span>{metric.count} lines</span>
                              <span>{formatCurrencySafe(metric.subtotal)}</span>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 xl:grid-cols-6">
                  <div className={`rounded-[24px] p-4 shadow-sm ring-1 ${showMaterial ? 'bg-[linear-gradient(180deg,#ffffff_0%,#f7fbff_100%)] ring-slate-200/80' : 'bg-slate-50 opacity-50 ring-slate-200/80'}`}><div className="flex items-center justify-between"><p className="text-[11px] font-semibold text-slate-500">Material</p><Wallet className="h-4 w-4 text-slate-400" /></div><p className="mt-3 text-[26px] font-semibold tracking-[-0.04em] text-slate-950">{formatCurrencySafe(summary?.materialSubtotal)}</p><p className="mt-1 text-[11px] text-slate-500">Installed material value</p></div>
                  <div className={`rounded-[24px] p-4 shadow-sm ring-1 ${showLabor ? 'bg-[linear-gradient(180deg,#ffffff_0%,#eef8f6_100%)] ring-emerald-200/80' : 'bg-slate-50 opacity-50 ring-slate-200/80'}`}><div className="flex items-center justify-between"><p className="text-[11px] font-semibold text-slate-500">Labor</p><Hammer className="h-4 w-4 text-emerald-600" /></div><p className="mt-3 text-[26px] font-semibold tracking-[-0.04em] text-slate-950">{formatCurrencySafe(summary?.adjustedLaborSubtotal || summary?.laborSubtotal)}</p><p className="mt-1 text-[11px] text-slate-500">Adjusted by project conditions</p></div>
                  <div className="rounded-[24px] bg-[linear-gradient(180deg,#ffffff_0%,#fff8eb_100%)] p-4 shadow-sm ring-1 ring-amber-200/80"><div className="flex items-center justify-between"><p className="text-[11px] font-semibold text-slate-500">Markup + Tax</p><Sparkles className="h-4 w-4 text-amber-600" /></div><p className="mt-3 text-[26px] font-semibold tracking-[-0.04em] text-slate-950">{formatCurrencySafe((summary?.taxAmount || 0) + (summary?.overheadAmount || 0) + (summary?.profitAmount || 0) + (summary?.burdenAmount || 0))}</p><p className="mt-1 text-[11px] text-slate-500">Burden, overhead, profit, and tax</p></div>
                  <div className="rounded-[24px] bg-[linear-gradient(180deg,#ffffff_0%,#f4f8ff_100%)] p-4 shadow-sm ring-1 ring-blue-200/80"><div className="flex items-center justify-between"><p className="text-[11px] font-semibold text-slate-500">Total Hours</p><Clock3 className="h-4 w-4 text-blue-700" /></div><p className="mt-3 text-[28px] font-semibold tracking-[-0.04em] text-slate-950">{formatNumberSafe(summary?.totalLaborHours || 0, 1)}</p><p className="mt-1 text-[11px] text-slate-500">Crew planning metric</p></div>
                  <div className="rounded-[24px] bg-[linear-gradient(180deg,#ffffff_0%,#f7f8fb_100%)] p-4 shadow-sm ring-1 ring-slate-200/80"><div className="flex items-center justify-between"><p className="text-[11px] font-semibold text-slate-500">Duration</p><CalendarClock className="h-4 w-4 text-slate-500" /></div><p className="mt-3 text-[28px] font-semibold tracking-[-0.04em] text-slate-950">{formatNumberSafe(summary?.durationDays || 0, 0)}</p><p className="mt-1 text-[11px] text-slate-500">Estimated field days</p></div>
                  <div className="rounded-[24px] bg-[linear-gradient(180deg,#10284f_0%,#0a224d_100%)] p-4 text-white shadow-[0_18px_40px_rgba(10,34,77,0.2)]"><div className="flex items-center justify-between"><p className="text-[11px] font-semibold text-slate-300">Grand Total</p><Calculator className="h-4 w-4 text-blue-200" /></div><p className="mt-3 text-[30px] font-semibold tracking-[-0.05em]">{formatCurrencySafe(summary?.baseBidTotal)}</p><p className="mt-1 text-[11px] text-slate-300">Active room {formatCurrencySafe(roomSubtotal)}</p></div>
                </div>

                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
                  <span className="rounded-full bg-white px-3 py-1.5 shadow-sm ring-1 ring-slate-200/80">{activeRoomLines.length} line items in active room</span>
                  <span className="rounded-full bg-white px-3 py-1.5 shadow-sm ring-1 ring-slate-200/80">{selectedScopeCategories.length || categories.filter((category) => category !== 'all').length} scope categories active</span>
                  {selectedLine ? <span className="rounded-full bg-[var(--brand-soft)] px-3 py-1.5 text-blue-800 shadow-sm ring-1 ring-blue-200/80">Line in review: {selectedLine.description}</span> : <span className="rounded-full bg-white px-3 py-1.5 shadow-sm ring-1 ring-slate-200/80">Click any row to open the line editor</span>}
                  {(summary?.conditionAssumptions?.length || 0) > 0 ? <span className="rounded-full bg-[var(--accent-teal-soft)] px-3 py-1.5 text-teal-800 shadow-sm ring-1 ring-teal-200/70 inline-flex items-center gap-1"><Layers3 className="h-3.5 w-3.5" /> {summary?.conditionAssumptions?.length} active assumptions</span> : null}
                </div>
              </div>

              <EstimateGrid
                lines={activeRoomLines}
                rooms={rooms}
                categories={categories}
                roomNamesById={roomNamesById}
                pricingMode={pricingMode}
                viewMode="estimate"
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
            <section className="overflow-hidden rounded-[28px] border border-slate-200/80 bg-[linear-gradient(135deg,#ffffff_0%,#f6f9fd_55%,#eef4ff_100%)] p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="max-w-3xl">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Project File Locker</p>
                  <h3 className="mt-1 text-xl font-semibold tracking-tight text-slate-950">Keep takeoff sheets, drawings, and scope docs attached to the job</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">Store source files with the estimate so imports, proposal drafting, and future revisions always have the same reference set.</p>
                </div>
                <label className="inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-full bg-[linear-gradient(135deg,var(--brand)_0%,#164fa8_100%)] px-5 text-[11px] font-semibold text-white shadow-[0_12px_28px_rgba(11,61,145,0.22)] hover:brightness-[1.03]">
                  <FileUp className="h-4 w-4" />
                  {fileUploading ? 'Uploading...' : 'Upload File'}
                  <input type="file" className="hidden" onChange={(e) => void uploadProjectFile(e.target.files?.[0])} disabled={fileUploading} />
                </label>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <div className="rounded-[22px] bg-white/90 p-4 shadow-sm ring-1 ring-slate-200/80">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Files Stored</p>
                  <p className="mt-2 text-[28px] font-semibold tracking-[-0.04em] text-slate-950">{projectFiles.length}</p>
                  <p className="mt-1 text-[11px] text-slate-500">Project-level reference set</p>
                </div>
                <div className="rounded-[22px] bg-[var(--brand-soft)] p-4 shadow-sm ring-1 ring-blue-200/80">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-blue-800">Latest Upload</p>
                  <p className="mt-2 truncate text-sm font-semibold text-slate-950">{projectFiles[0]?.fileName || 'No uploads yet'}</p>
                  <p className="mt-1 text-[11px] text-slate-600">{projectFiles[0] ? new Date(projectFiles[0].createdAt).toLocaleString() : 'Add your first source file to start building the project record.'}</p>
                </div>
                <div className="rounded-[22px] bg-amber-50/80 p-4 shadow-sm ring-1 ring-amber-200/80">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-700">Suggested Use</p>
                  <p className="mt-2 text-sm font-semibold text-slate-950">Import source + proposal backup</p>
                  <p className="mt-1 text-[11px] text-slate-600">Keep parser inputs, markups, and client-facing support files in one place.</p>
                </div>
              </div>
            </section>

            <section className="overflow-hidden rounded-[28px] border border-slate-200/80 bg-white/90 shadow-sm">
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
            <section className="overflow-hidden rounded-[28px] border border-slate-200/80 bg-[linear-gradient(135deg,#ffffff_0%,#f8fbff_60%,#eef4ff_100%)] p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="max-w-3xl">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Proposal Studio</p>
                  <h3 className="mt-1 text-xl font-semibold tracking-tight text-slate-950">Draft, tune, and export the client-facing proposal from the live estimate</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">Use AI to jump-start wording, edit the final language directly, and preview the exact document before export.</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => void generateProposalDraft('scope_summary')}
                    disabled={proposalDrafting !== null}
                    className="inline-flex h-10 items-center justify-center rounded-full border border-slate-200 bg-white px-4 text-[11px] font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
                  >
                    {proposalDrafting === 'scope_summary' ? 'Generating Scope Summary...' : 'AI Scope Summary'}
                  </button>
                  <button
                    onClick={() => void generateProposalDraft('default_short')}
                    disabled={proposalDrafting !== null}
                    className="inline-flex h-10 items-center justify-center rounded-full border border-slate-200 bg-white px-4 text-[11px] font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
                  >
                    {proposalDrafting === 'default_short' ? 'Drafting Short Proposal...' : 'AI Short Proposal Pack'}
                  </button>
                  <button
                    onClick={() => void generateProposalDraft('terms_and_conditions')}
                    disabled={proposalDrafting !== null}
                    className="inline-flex h-10 items-center justify-center rounded-full border border-slate-200 bg-white px-4 text-[11px] font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
                  >
                    {proposalDrafting === 'terms_and_conditions' ? 'Improving Terms + Conditions...' : 'AI Terms + Conditions'}
                  </button>
                  <button
                    onClick={() => void saveProposalWording()}
                    className="inline-flex h-10 items-center justify-center rounded-full border border-emerald-200 bg-emerald-50 px-4 text-[11px] font-semibold text-emerald-700 shadow-sm hover:bg-emerald-100"
                  >
                    Save Proposal Edits
                  </button>
                  <button
                    onClick={() => resetProposalDefaults('all')}
                    className="inline-flex h-10 items-center justify-center rounded-full border border-slate-200 bg-white px-4 text-[11px] font-semibold text-slate-600 shadow-sm hover:bg-slate-50"
                  >
                    Reset To Defaults
                  </button>
                  <button onClick={() => window.print()} className="inline-flex h-10 items-center justify-center rounded-full border border-slate-200 bg-white px-4 text-[11px] font-semibold text-slate-700 shadow-sm hover:bg-slate-50">Print</button>
                  <button onClick={exportProposal} className="inline-flex h-10 items-center gap-1.5 rounded-full bg-[linear-gradient(135deg,var(--brand)_0%,#164fa8_100%)] px-4 text-[11px] font-semibold text-white shadow-[0_12px_28px_rgba(11,61,145,0.22)] hover:brightness-[1.03]"><Download className="h-3.5 w-3.5" />Export</button>
                </div>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <div className="rounded-[22px] bg-white/90 p-4 shadow-sm ring-1 ring-slate-200/80">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Proposal Value</p>
                  <p className="mt-2 text-[28px] font-semibold tracking-[-0.04em] text-slate-950">{formatCurrencySafe(summary?.baseBidTotal)}</p>
                  <p className="mt-1 text-[11px] text-slate-500">Bound to the current estimate output</p>
                </div>
                <div className="rounded-[22px] bg-[var(--brand-soft)] p-4 shadow-sm ring-1 ring-blue-200/80">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-blue-800">Included Lines</p>
                  <p className="mt-2 text-[28px] font-semibold tracking-[-0.04em] text-slate-950">{lines.length}</p>
                  <p className="mt-1 text-[11px] text-slate-600">Proposal content reflects the live takeoff and estimate.</p>
                </div>
                <div className="rounded-[22px] bg-amber-50/80 p-4 shadow-sm ring-1 ring-amber-200/80">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-700">Draft Source</p>
                  <p className="mt-2 text-sm font-semibold text-slate-950">Defaults + AI assist</p>
                  <p className="mt-1 text-[11px] text-slate-600">AI drafting is optional and never overwrites existing wording without confirmation.</p>
                </div>
              </div>
            </section>

            <div className="grid gap-4 xl:grid-cols-[420px_minmax(0,1fr)] items-start">
              <section className="space-y-4">
                <div className="rounded-[28px] border border-slate-200/80 bg-white/90 p-4 shadow-sm">
                  <div className="mb-4">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Editable Proposal Copy</p>
                    <h4 className="mt-1 text-base font-semibold tracking-tight text-slate-900">Control the language block by block</h4>
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
              </section>

              <div className="space-y-4">
                <section className="rounded-[24px] border border-slate-200/80 bg-white/90 p-4 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Live Preview</p>
                      <h4 className="mt-1 text-base font-semibold tracking-tight text-slate-900">Client-ready proposal rendering</h4>
                    </div>
                    <span className="rounded-full bg-slate-100 px-3 py-1.5 text-[11px] font-medium text-slate-600">Print/export uses this layout</span>
                  </div>
                </section>

                <ProposalPreview
                  project={project}
                  settings={settings}
                  website={companyWebsite}
                  lines={lines}
                  summary={summary}
                />
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
        <div className="fixed inset-0 z-50 bg-[radial-gradient(circle_at_top,rgba(10,34,77,0.18)_0%,rgba(15,23,42,0.55)_60%)] p-3 backdrop-blur-sm sm:p-6" onClick={() => setModifiersModalOpen(false)}>
          <div className="mx-auto flex h-[90vh] max-w-5xl flex-col overflow-hidden rounded-[30px] border border-slate-200/80 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] shadow-[0_32px_80px_rgba(15,23,42,0.22)]" onClick={(event) => event.stopPropagation()}>
            <div className="border-b border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(246,248,251,0.96)_100%)] px-5 py-4">
              <div className="flex items-start justify-between gap-4">
                <div className="max-w-3xl">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="ui-chip-soft">Line editor</span>
                    <span className="ui-chip-soft">{selectedLine.category || 'Uncategorized'}</span>
                    <span className="ui-chip-soft">{roomNamesById[selectedLine.roomId] || 'Unassigned room'}</span>
                  </div>
                  <h3 className="mt-3 text-[28px] font-semibold tracking-[-0.04em] text-slate-950">Edit line item</h3>
                  <p className="mt-2 text-[13px] leading-6 text-slate-600">Adjust description, room placement, pricing, notes, and modifiers without losing sight of the line’s sell math.</p>
                </div>
                <button onClick={() => setModifiersModalOpen(false)} className="h-10 rounded-full border border-slate-200 bg-white px-4 text-[11px] font-medium text-slate-700 shadow-sm transition hover:bg-slate-50">Done</button>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-4">
                <div className="rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-200/80"><p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">Qty</p><p className="mt-1 text-[20px] font-semibold tracking-[-0.03em] text-slate-950">{formatNumberSafe(selectedLine.qty, 0)}</p></div>
                <div className="rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-200/80"><p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">Material</p><p className="mt-1 text-[20px] font-semibold tracking-[-0.03em] text-slate-950">{formatCurrencySafe(selectedLine.materialCost)}</p></div>
                <div className="rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-200/80"><p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">Labor</p><p className="mt-1 text-[20px] font-semibold tracking-[-0.03em] text-slate-950">{formatCurrencySafe(selectedLine.laborCost)}</p></div>
                <div className="rounded-2xl bg-[linear-gradient(180deg,#10284f_0%,#0a224d_100%)] p-3 text-white shadow-[0_18px_40px_rgba(10,34,77,0.18)]"><p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-300">Unit Sell</p><p className="mt-1 text-[20px] font-semibold tracking-[-0.03em]">{formatCurrencySafe(selectedLine.unitSell)}</p></div>
              </div>
            </div>

            <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px]">
              <div className="min-h-0 overflow-y-auto p-5">
                <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
                  <div className="space-y-4">
                    <div className="rounded-[24px] bg-white p-4 shadow-sm ring-1 ring-slate-200/80">
                      <p className="text-[12px] font-semibold tracking-[-0.02em] text-slate-900">Line details</p>
                      <p className="mt-1 text-[11px] text-slate-500">Set the identity, room, and descriptive information that appears in the estimate grid.</p>
                      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                        <label className="text-[11px] font-medium text-slate-700 md:col-span-2">Description
                          <input className="ui-input mt-1 h-10 rounded-xl" value={selectedLine.description} onChange={(e) => patchLineLocal(selectedLine.id, { description: e.target.value })} onBlur={() => void persistLine(selectedLine.id)} />
                        </label>
                        <label className="text-[11px] font-medium text-slate-700">Room
                          <select className="ui-input mt-1 h-10 rounded-xl" value={selectedLine.roomId} onChange={(e) => patchLineLocal(selectedLine.id, { roomId: e.target.value })} onBlur={() => void persistLine(selectedLine.id)}>
                      {rooms.map((room) => <option key={room.id} value={room.id}>{room.roomName}</option>)}
                          </select>
                        </label>
                        <label className="text-[11px] font-medium text-slate-700">Category
                          <input className="ui-input mt-1 h-10 rounded-xl" value={selectedLine.category || ''} onChange={(e) => patchLineLocal(selectedLine.id, { category: e.target.value || null })} onBlur={() => void persistLine(selectedLine.id)} />
                        </label>
                        <label className="text-[11px] font-medium text-slate-700">Qty
                          <input type="number" className="ui-input mt-1 h-10 rounded-xl" value={selectedLine.qty} onChange={(e) => patchLineLocal(selectedLine.id, { qty: Number(e.target.value) || 0 })} onBlur={() => void persistLine(selectedLine.id)} />
                        </label>
                        <label className="text-[11px] font-medium text-slate-700">Unit
                          <input className="ui-input mt-1 h-10 rounded-xl" value={selectedLine.unit} onChange={(e) => patchLineLocal(selectedLine.id, { unit: e.target.value })} onBlur={() => void persistLine(selectedLine.id)} />
                        </label>
                        <label className="text-[11px] font-medium text-slate-700 md:col-span-2">Notes
                          <textarea rows={4} className="ui-textarea mt-1 rounded-2xl" value={selectedLine.notes || ''} onChange={(e) => patchLineLocal(selectedLine.id, { notes: e.target.value || null })} onBlur={() => void persistLine(selectedLine.id)} />
                        </label>
                      </div>
                    </div>

                    <div className="rounded-[24px] bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] p-4 shadow-sm ring-1 ring-slate-200/80">
                      <p className="text-[12px] font-semibold tracking-[-0.02em] text-slate-900">Pricing</p>
                      <p className="mt-1 text-[11px] text-slate-500">Base line math before overall estimate markups. Edits update the grid immediately.</p>
                      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                        {showMaterial ? (
                          <label className="text-[11px] font-medium text-slate-700">Material
                            <input type="number" className="ui-input mt-1 h-10 rounded-xl" value={selectedLine.materialCost} onChange={(e) => patchLineLocal(selectedLine.id, { materialCost: Number(e.target.value) || 0 })} onBlur={() => void persistLine(selectedLine.id)} />
                          </label>
                        ) : null}
                        {showLabor ? (
                          <label className="text-[11px] font-medium text-slate-700">Labor
                            <input type="number" className="ui-input mt-1 h-10 rounded-xl" value={selectedLine.laborCost} onChange={(e) => patchLineLocal(selectedLine.id, { laborCost: Number(e.target.value) || 0 })} onBlur={() => void persistLine(selectedLine.id)} />
                            {(summary?.conditionLaborMultiplier || 1) !== 1 ? <p className="mt-1 text-[10px] text-slate-500">Effective labor with project multiplier: {formatCurrencySafe((selectedLine.laborCost || 0) * (summary?.conditionLaborMultiplier || 1))}</p> : null}
                          </label>
                        ) : null}
                        <label className="text-[11px] font-medium text-slate-700">Unit Sell
                          <div className="mt-1 space-y-2">
                            <input type="number" className="ui-input h-10 rounded-xl" value={selectedLine.unitSell} onChange={(e) => patchLineLocal(selectedLine.id, { unitSell: Number(e.target.value) || 0, pricingSource: 'manual' })} onBlur={() => void persistLine(selectedLine.id)} />
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
                        <div className="rounded-2xl bg-white px-3 py-3 shadow-sm ring-1 ring-slate-200/80">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">Base minutes</p>
                          <p className="mt-1 text-[20px] font-semibold tracking-[-0.03em] text-slate-950">{formatNumberSafe(selectedLine.laborMinutes, 1)}</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="rounded-[24px] bg-[linear-gradient(180deg,#ffffff_0%,#f4f8ff_100%)] p-4 shadow-sm ring-1 ring-slate-200/80">
                      <p className="text-[12px] font-semibold tracking-[-0.02em] text-slate-900">Line snapshot</p>
                      <div className="mt-3 space-y-2 text-[11px] text-slate-600">
                        <div className="flex items-center justify-between rounded-2xl bg-white px-3 py-2 shadow-sm ring-1 ring-slate-200/80"><span>Room</span><span className="font-semibold text-slate-900">{roomNamesById[selectedLine.roomId] || 'Unassigned'}</span></div>
                        <div className="flex items-center justify-between rounded-2xl bg-white px-3 py-2 shadow-sm ring-1 ring-slate-200/80"><span>Category</span><span className="font-semibold text-slate-900">{selectedLine.category || 'Uncategorized'}</span></div>
                        <div className="flex items-center justify-between rounded-2xl bg-white px-3 py-2 shadow-sm ring-1 ring-slate-200/80"><span>Line total</span><span className="font-semibold text-slate-900">{formatCurrencySafe(selectedLine.lineTotal)}</span></div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="border-t border-slate-200/80 bg-[linear-gradient(180deg,rgba(248,250,252,0.96)_0%,rgba(241,245,249,0.98)_100%)] p-4 lg:border-l lg:border-t-0">
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

      {takeoffRoomsModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 p-3 sm:p-6" onClick={() => setTakeoffRoomsModalOpen(false)}>
          <div
            className="mx-auto h-[88vh] max-w-4xl rounded-2xl bg-white border border-slate-200 shadow-2xl flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white">
              <div>
                <h2 className="text-base font-semibold text-slate-900">Manage Rooms</h2>
                <p className="text-sm text-slate-500">Keep room setup out of the main takeoff grid, then add or organize rooms with enough space to work comfortably.</p>
              </div>
              <button
                onClick={() => setTakeoffRoomsModalOpen(false)}
                className="h-8 px-3 rounded border border-slate-300 text-xs font-medium hover:bg-slate-50"
              >
                Close
              </button>
            </div>

            <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[320px_minmax(0,1fr)] gap-4 p-5 bg-slate-50/70">
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm min-h-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Workspace Rooms</p>
                <h3 className="mt-1 text-lg font-semibold text-slate-900">Room Library</h3>
                <p className="mt-1 text-sm text-slate-600">Pick a room to focus the grids, duplicate a similar room, or create a new one with a starter line item.</p>
                <div className="mt-4 min-h-0">
                  <RoomManager
                    rooms={rooms}
                    activeRoomId={activeRoomId}
                    onSelectRoom={setActiveRoomId}
                    onOpenCreateRoom={openCreateRoomModal}
                    onRenameRoom={(room) => void renameRoom(room)}
                    onDuplicateRoom={(room) => void duplicateRoom(room)}
                    onDeleteRoom={(room) => void deleteRoom(room)}
                  />
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-4">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Selected Room</p>
                  <h3 className="mt-1 text-lg font-semibold text-slate-900">{roomNamesById[activeRoomId] || 'No room selected'}</h3>
                  <p className="mt-1 text-sm text-slate-600">Use rooms for spaces, phases, alternates, or any grouping that keeps imported and priced scope readable.</p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <p className="text-[10px] uppercase tracking-[0.08em] text-slate-500">Rooms</p>
                    <p className="mt-1 text-lg font-semibold text-slate-900">{rooms.length}</p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <p className="text-[10px] uppercase tracking-[0.08em] text-slate-500">Active Lines</p>
                    <p className="mt-1 text-lg font-semibold text-slate-900">{activeRoomLines.length}</p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <p className="text-[10px] uppercase tracking-[0.08em] text-slate-500">Room Total</p>
                    <p className="mt-1 text-lg font-semibold text-slate-900">{formatCurrencySafe(roomSubtotal)}</p>
                  </div>
                </div>

                <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/60 p-4">
                  <p className="text-sm font-medium text-slate-900">New room flow</p>
                  <p className="mt-1 text-sm text-slate-600">Add Room now opens a proper dialog that asks for the room name and whether you want to auto add a starter line item immediately.</p>
                  <button onClick={openCreateRoomModal} className="mt-3 ui-btn-secondary h-9 px-3 text-[11px] font-semibold">Open Add Room</button>
                </div>
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
