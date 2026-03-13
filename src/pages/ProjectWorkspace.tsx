import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Download, FileUp, Paperclip, Trash2 } from 'lucide-react';
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
import { ImportParsePanel } from '../components/workspace/ImportParsePanel';
import { ItemPicker } from '../components/workspace/ItemPicker';
import { ModifierPanel } from '../components/workspace/ModifierPanel';
import { ProposalPreview } from '../components/workspace/ProposalPreview';
import { BundlePickerModal } from '../components/workspace/BundlePickerModal';
import { formatCurrencySafe, formatKilobytesSafe, formatNumberSafe } from '../utils/numberFormat';

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

  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'setup' | 'rooms' | 'takeoff' | 'estimate' | 'files' | 'proposal'>('estimate');

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
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [modifiersModalOpen, setModifiersModalOpen] = useState(false);
  const [takeoffRoomsModalOpen, setTakeoffRoomsModalOpen] = useState(false);
  const [roomCreateModalOpen, setRoomCreateModalOpen] = useState(false);
  const [roomCreationDraft, setRoomCreationDraft] = useState<RoomCreationDraft>(DEFAULT_ROOM_CREATION_DRAFT);
  const [creatingRoom, setCreatingRoom] = useState(false);
  const [catalogSearch, setCatalogSearch] = useState('');
  const [catalogCategory, setCatalogCategory] = useState('all');
  const [proposalDrafting, setProposalDrafting] = useState<null | 'scope_summary' | 'proposal_text' | 'terms_and_conditions'>(null);
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

  async function loadWorkspace(projectId: string) {
    try {
      setLoading(true);
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

  function patchLineLocal(lineId: string, updates: Partial<TakeoffLineRecord>) {
    setLines((prev) =>
      prev.map((line) => {
        if (line.id !== lineId) return line;
        const next = { ...line, ...updates };
        const unitSell = updates.unitSell ?? next.unitSell ?? next.materialCost + next.laborCost;
        const lineTotal = unitSell * next.qty;
        return { ...next, unitSell, lineTotal };
      })
    );
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

  async function finalizeParsedLines(parsedLines: Array<Partial<TakeoffLineRecord>>) {
    if (!project) return;
    const created = await api.finalizeV1ParserLines(parsedLines);
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

  async function generateProposalDraft(mode: 'scope_summary' | 'proposal_text' | 'terms_and_conditions') {
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
                    <label className="text-[11px] font-medium text-slate-700 md:col-span-2">Address<input className="ui-input mt-1 h-9" value={project.address || ''} onChange={(e) => setProject({ ...project, address: e.target.value || null })} /></label>
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
                    <label className="text-[11px] font-medium text-slate-700">Labor Burden %<input type="number" className="ui-input mt-1 h-9" value={project.laborBurdenPercent} onChange={(e) => setProject({ ...project, laborBurdenPercent: Number(e.target.value) || 0 })} /></label>
                    <label className="text-[11px] font-medium text-slate-700">Overhead %<input type="number" className="ui-input mt-1 h-9" value={project.overheadPercent} onChange={(e) => setProject({ ...project, overheadPercent: Number(e.target.value) || 0 })} /></label>
                    <label className="text-[11px] font-medium text-slate-700">Profit %<input type="number" className="ui-input mt-1 h-9" value={project.profitPercent} onChange={(e) => setProject({ ...project, profitPercent: Number(e.target.value) || 0 })} /></label>
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
          <div className="space-y-2 min-w-0">
              <div className="rounded-2xl border border-amber-200/70 bg-gradient-to-r from-amber-50 to-white p-3 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.11em] text-amber-700 font-semibold">Takeoff Review</p>
                    <h3 className="text-[16px] font-semibold text-slate-900 mt-0.5">Import, Clean Up, Assign</h3>
                    <p className="text-xs text-slate-600 mt-1">Prioritize quantity accuracy and room placement before applying pricing logic.</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => setImportModalOpen(true)} className="h-8 px-3 rounded-md border border-amber-300 bg-amber-100/70 text-amber-900 text-[11px] font-semibold hover:bg-amber-100">Import Scope</button>
                    <button onClick={() => void addManualLine()} className="h-8 px-3 rounded-md border border-slate-300 bg-white text-[11px] font-medium hover:bg-slate-50">Add Manual Line</button>
                  </div>
                </div>
              </div>

              <div className="ui-surface p-2 flex items-center gap-1.5 flex-wrap shadow-sm">
                <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto pr-1">
                  {rooms.map((room) => {
                    const active = room.id === activeRoomId;
                    return (
                      <button
                        key={room.id}
                        onClick={() => setActiveRoomId(room.id)}
                        className={`h-7 shrink-0 rounded-full border px-2.5 text-[11px] font-medium transition-colors ${active ? 'border-blue-300 bg-blue-50 text-blue-800' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
                      >
                        {room.roomName}
                      </button>
                    );
                  })}
                </div>
                <button onClick={() => setCatalogOpen(true)} className="ui-btn-secondary h-7 px-2.5 text-[11px]">Catalog Match</button>
                <button onClick={() => setBundleModalOpen(true)} className="ui-btn-secondary h-7 px-2.5 text-[11px]">Scope Bundles</button>
                <button onClick={() => setTakeoffRoomsModalOpen(true)} className="ui-btn-secondary h-7 px-2.5 text-[11px]">Manage Rooms</button>
                <div className="ml-auto text-right pr-0.5 rounded-lg bg-slate-50 px-2 py-1 border border-slate-200">
                  <p className="text-[10px] text-slate-500">Active Room Total</p>
                  <p className="text-[13px] font-semibold text-slate-900">{formatCurrencySafe(roomSubtotal)}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
                <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3">
                  <p className="text-[10px] uppercase tracking-[0.08em] text-amber-700">Active Room</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900 truncate">{roomNamesById[activeRoomId] || 'Unassigned'}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-3">
                  <p className="text-[10px] uppercase tracking-[0.08em] text-slate-500">Visible Lines</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">{activeRoomLines.length}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-3">
                  <p className="text-[10px] uppercase tracking-[0.08em] text-slate-500">Rooms</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">{rooms.length}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-3">
                  <p className="text-[10px] uppercase tracking-[0.08em] text-slate-500">Room Total</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">{formatCurrencySafe(roomSubtotal)}</p>
                </div>
              </div>

              <EstimateGrid
                lines={activeRoomLines}
                rooms={rooms}
                categories={categories}
                roomNamesById={roomNamesById}
                pricingMode={pricingMode}
                viewMode="takeoff"
                selectedLineId={selectedLineId}
                onSelectLine={openLineEditor}
                onPersistLine={(lineId, updates) => void persistLine(lineId, updates)}
                onDeleteLine={(lineId) => void deleteLine(lineId)}
              />
          </div>
        )}

        {activeTab === 'estimate' && (
          <div className="space-y-2 min-w-0">
              <div className="rounded-2xl border border-slate-200 bg-gradient-to-r from-white to-slate-50 p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.11em] text-slate-500 font-semibold">Estimate Overview</p>
                    <h3 className="mt-1 text-lg font-semibold text-slate-900">Project Estimate</h3>
                    <p className="mt-1 text-sm text-slate-600">Review pricing, keep room-based scope organized, and open focused tools only when you need them.</p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-900 px-4 py-3 text-right text-slate-100">
                    <p className="text-[10px] uppercase tracking-[0.1em] text-slate-300">Estimated Total</p>
                    <p className="mt-1 text-2xl font-bold">{formatCurrencySafe(summary?.baseBidTotal)}</p>
                    <p className="mt-1 text-[11px] text-slate-300">Active room: {roomNamesById[activeRoomId] || 'Unassigned'}</p>
                  </div>
                </div>
              </div>

              <div className="ui-surface p-3 shadow-sm space-y-3">
                <div className="flex flex-wrap items-center gap-2 justify-between">
                  <div className="flex flex-wrap items-center gap-2">
                    <button onClick={() => setCatalogOpen(true)} className="h-9 rounded-md bg-slate-900 px-3 text-[11px] font-semibold text-white hover:bg-slate-800">Bulk Add Items</button>
                    <button onClick={() => setBundleModalOpen(true)} className="ui-btn-secondary h-9 px-3 text-[11px]">Add Bundle</button>
                    <button onClick={() => setModifiersModalOpen(true)} disabled={!selectedLine} className="ui-btn-secondary h-9 px-3 text-[11px] disabled:opacity-50">Edit Line</button>
                    <button onClick={() => setTakeoffRoomsModalOpen(true)} className="ui-btn-secondary h-9 px-3 text-[11px]">Manage Rooms</button>
                    <button onClick={() => setActiveTab('proposal')} className="ui-btn-secondary h-9 px-3 text-[11px]">Edit Proposal</button>
                  </div>
                  <p className="text-[11px] text-slate-500">Rooms, items, modifiers, and bundles open in focused tools so the line grid keeps the width.</p>
                </div>

                <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">Active Room</span>
                  <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto">
                    {rooms.map((room) => {
                      const active = room.id === activeRoomId;
                      return (
                        <button
                          key={room.id}
                          onClick={() => setActiveRoomId(room.id)}
                          className={`h-8 shrink-0 rounded-full border px-3 text-[11px] font-medium transition-colors ${active ? 'border-blue-300 bg-blue-50 text-blue-800' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100'}`}
                        >
                          {room.roomName}
                        </button>
                      );
                    })}
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-right">
                    <p className="text-[10px] text-slate-500">Room Total</p>
                    <p className="text-[13px] font-semibold text-slate-900">{formatCurrencySafe(roomSubtotal)}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 lg:grid-cols-6">
                  <div className={`rounded-xl border p-3 ${showMaterial ? 'border-slate-200 bg-white' : 'border-slate-200 bg-slate-50 opacity-50'}`}><p className="text-[10px] uppercase tracking-[0.08em] text-slate-500">Material</p><p className="mt-1 text-lg font-semibold text-slate-900">{formatCurrencySafe(summary?.materialSubtotal)}</p><p className="mt-1 text-[11px] text-slate-500">Installed material value</p></div>
                  <div className={`rounded-xl border p-3 ${showLabor ? 'border-slate-200 bg-white' : 'border-slate-200 bg-slate-50 opacity-50'}`}><p className="text-[10px] uppercase tracking-[0.08em] text-slate-500">Labor</p><p className="mt-1 text-lg font-semibold text-slate-900">{formatCurrencySafe(summary?.adjustedLaborSubtotal || summary?.laborSubtotal)}</p><p className="mt-1 text-[11px] text-slate-500">Adjusted for project conditions</p></div>
                  <div className="rounded-xl border border-slate-200 bg-white p-3"><p className="text-[10px] uppercase tracking-[0.08em] text-slate-500">Markup + Tax</p><p className="mt-1 text-lg font-semibold text-slate-900">{formatCurrencySafe((summary?.taxAmount || 0) + (summary?.overheadAmount || 0) + (summary?.profitAmount || 0) + (summary?.burdenAmount || 0))}</p><p className="mt-1 text-[11px] text-slate-500">Burden, overhead, profit, tax</p></div>
                  <div className="rounded-xl border border-slate-200 bg-white p-3"><p className="text-[10px] uppercase tracking-[0.08em] text-slate-500">Total Hours</p><p className="mt-1 text-lg font-semibold text-slate-900">{formatNumberSafe(summary?.totalLaborHours || 0, 1)} hrs</p><p className="mt-1 text-[11px] text-slate-500">Crew planning metric</p></div>
                  <div className="rounded-xl border border-slate-200 bg-white p-3"><p className="text-[10px] uppercase tracking-[0.08em] text-slate-500">Duration</p><p className="mt-1 text-lg font-semibold text-slate-900">{formatNumberSafe(summary?.durationDays || 0, 0)} day{(summary?.durationDays || 0) === 1 ? '' : 's'}</p><p className="mt-1 text-[11px] text-slate-500">Estimated field duration</p></div>
                  <div className="rounded-xl border border-slate-900 bg-slate-900 p-3 text-white"><p className="text-[10px] uppercase tracking-[0.08em] text-slate-300">Grand Total</p><p className="mt-1 text-xl font-bold">{formatCurrencySafe(summary?.baseBidTotal)}</p><p className="mt-1 text-[11px] text-slate-300">Active room {formatCurrencySafe(roomSubtotal)}</p></div>
                </div>

                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">{activeRoomLines.length} line items in active room</span>
                  {selectedLine ? <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-blue-800">Line in review: {selectedLine.description}</span> : <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">Click any row to open the line editor</span>}
                </div>
              </div>

              <EstimateGrid
                lines={activeRoomLines}
                rooms={rooms}
                categories={categories}
                roomNamesById={roomNamesById}
                pricingMode={pricingMode}
                viewMode="estimate"
                selectedLineId={selectedLineId}
                onSelectLine={openLineEditor}
                onPersistLine={(lineId, updates) => void persistLine(lineId, updates)}
                onDeleteLine={(lineId) => void deleteLine(lineId)}
              />
          </div>
        )}

        {activeTab === 'files' && (
          <div className="space-y-3">
            <section className="bg-white border border-slate-200 rounded-lg p-3">
              <div className="flex flex-wrap items-center gap-2 justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-slate-800">Project Files</h3>
                  <p className="text-xs text-slate-500">Upload and keep takeoff sheets, scope docs, and references with this project.</p>
                </div>
                <label className="h-8 px-3 rounded border border-slate-300 text-xs font-medium hover:bg-slate-50 inline-flex items-center gap-1.5 cursor-pointer">
                  <FileUp className="w-3.5 h-3.5" />
                  {fileUploading ? 'Uploading...' : 'Upload File'}
                  <input type="file" className="hidden" onChange={(e) => void uploadProjectFile(e.target.files?.[0])} disabled={fileUploading} />
                </label>
              </div>
            </section>

            <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
              {projectFiles.length === 0 ? (
                <div className="p-6 text-sm text-slate-500">No files saved for this project yet.</div>
              ) : (
                <table className="w-full text-xs">
                  <thead className="bg-slate-100 border-b border-slate-200">
                    <tr>
                      <th className="px-3 py-2 text-left text-[11px] uppercase tracking-wide text-slate-600">File</th>
                      <th className="px-3 py-2 text-left text-[11px] uppercase tracking-wide text-slate-600">Type</th>
                      <th className="px-3 py-2 text-right text-[11px] uppercase tracking-wide text-slate-600">Size</th>
                      <th className="px-3 py-2 text-left text-[11px] uppercase tracking-wide text-slate-600">Uploaded</th>
                      <th className="px-3 py-2 text-right text-[11px] uppercase tracking-wide text-slate-600">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {projectFiles.map((file) => (
                      <tr key={file.id} className="border-b border-slate-100">
                        <td className="px-3 py-2">
                          <div className="inline-flex items-center gap-1.5 text-slate-800 font-medium">
                            <Paperclip className="w-3.5 h-3.5 text-slate-500" />
                            {file.fileName}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-slate-600">{file.mimeType}</td>
                        <td className="px-3 py-2 text-right text-slate-600">{formatKilobytesSafe(file.sizeBytes)}</td>
                        <td className="px-3 py-2 text-slate-600">{new Date(file.createdAt).toLocaleString()}</td>
                        <td className="px-3 py-2">
                          <div className="flex items-center justify-end gap-1.5">
                            <a
                              href={api.getV1ProjectFileDownloadUrl(project.id, file.id)}
                              className="h-7 px-2 rounded border border-slate-300 text-[11px] hover:bg-slate-50 inline-flex items-center gap-1"
                            >
                              <Download className="w-3.5 h-3.5" />
                              Download
                            </a>
                            <button
                              onClick={() => void removeProjectFile(file.id)}
                              className="h-7 px-2 rounded border border-red-200 text-red-700 text-[11px] hover:bg-red-50 inline-flex items-center gap-1"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          </div>
        )}

        {activeTab === 'proposal' && (
          <div className="space-y-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.12em] text-slate-500 font-semibold">Proposal Editor</p>
                  <h3 className="mt-1 text-lg font-semibold text-slate-900">Draft, Edit, And Finalize Proposal Text</h3>
                  <p className="mt-1 text-sm text-slate-600">Professional defaults are prefilled automatically. AI drafting is optional and never replaces existing content without confirmation.</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => void generateProposalDraft('scope_summary')}
                    disabled={proposalDrafting !== null}
                    className="h-8 px-3 rounded border border-slate-300 text-xs font-medium hover:bg-slate-50 disabled:opacity-50"
                  >
                    {proposalDrafting === 'scope_summary' ? 'Generating Scope Summary...' : 'AI Scope Summary'}
                  </button>
                  <button
                    onClick={() => void generateProposalDraft('proposal_text')}
                    disabled={proposalDrafting !== null}
                    className="h-8 px-3 rounded border border-slate-300 text-xs font-medium hover:bg-slate-50 disabled:opacity-50"
                  >
                    {proposalDrafting === 'proposal_text' ? 'Drafting Proposal Text...' : 'AI Full Draft'}
                  </button>
                  <button
                    onClick={() => void generateProposalDraft('terms_and_conditions')}
                    disabled={proposalDrafting !== null}
                    className="h-8 px-3 rounded border border-slate-300 text-xs font-medium hover:bg-slate-50 disabled:opacity-50"
                  >
                    {proposalDrafting === 'terms_and_conditions' ? 'Improving Terms + Conditions...' : 'AI Terms + Conditions'}
                  </button>
                  <button
                    onClick={() => void saveProposalWording()}
                    className="h-8 px-3 rounded border border-slate-300 text-xs font-medium hover:bg-slate-50"
                  >
                    Save Proposal Edits
                  </button>
                  <button
                    onClick={() => resetProposalDefaults('all')}
                    className="h-8 px-3 rounded border border-slate-300 text-xs font-medium hover:bg-slate-50"
                  >
                    Reset To Defaults
                  </button>
                  <button onClick={() => window.print()} className="h-8 px-3 rounded border border-slate-300 text-xs font-medium hover:bg-slate-50">Print</button>
                  <button onClick={exportProposal} className="h-8 px-3 rounded bg-blue-700 text-white text-xs font-medium hover:bg-blue-800 flex items-center gap-1"><Download className="w-3.5 h-3.5" />Export</button>
                </div>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-4 grid grid-cols-1 md:grid-cols-2 gap-3 shadow-sm">
              <label className="text-xs text-slate-600 block">
                <span className="flex items-center justify-between gap-2">
                  <span>Scope Summary / Intro</span>
                  <button type="button" onClick={() => resetProposalDefaults('intro')} className="text-[11px] font-medium text-blue-700 hover:text-blue-800">Reset Default</button>
                </span>
                <textarea
                  rows={4}
                  className="mt-1 w-full rounded border border-slate-300 px-2 py-2 text-sm"
                  value={settings?.proposalIntro || ''}
                  onChange={(e) => settings && setSettings({ ...settings, proposalIntro: e.target.value })}
                />
              </label>
              <label className="text-xs text-slate-600 block">
                <span className="flex items-center justify-between gap-2">
                  <span>Terms</span>
                  <button type="button" onClick={() => resetProposalDefaults('terms')} className="text-[11px] font-medium text-blue-700 hover:text-blue-800">Reset Default</button>
                </span>
                <textarea
                  rows={4}
                  className="mt-1 w-full rounded border border-slate-300 px-2 py-2 text-sm"
                  value={settings?.proposalTerms || ''}
                  onChange={(e) => settings && setSettings({ ...settings, proposalTerms: e.target.value })}
                />
              </label>
              <label className="text-xs text-slate-600 block">
                <span className="flex items-center justify-between gap-2">
                  <span>Exclusions</span>
                  <button type="button" onClick={() => resetProposalDefaults('exclusions')} className="text-[11px] font-medium text-blue-700 hover:text-blue-800">Reset Default</button>
                </span>
                <textarea
                  rows={4}
                  className="mt-1 w-full rounded border border-slate-300 px-2 py-2 text-sm"
                  value={settings?.proposalExclusions || ''}
                  onChange={(e) => settings && setSettings({ ...settings, proposalExclusions: e.target.value })}
                />
              </label>
              <label className="text-xs text-slate-600 block">
                <span className="flex items-center justify-between gap-2">
                  <span>Clarifications</span>
                  <button type="button" onClick={() => resetProposalDefaults('clarifications')} className="text-[11px] font-medium text-blue-700 hover:text-blue-800">Reset Default</button>
                </span>
                <textarea
                  rows={4}
                  className="mt-1 w-full rounded border border-slate-300 px-2 py-2 text-sm"
                  value={settings?.proposalClarifications || ''}
                  onChange={(e) => settings && setSettings({ ...settings, proposalClarifications: e.target.value })}
                />
              </label>
              <label className="text-xs text-slate-600 block md:col-span-2">
                <span className="flex items-center justify-between gap-2">
                  <span>Acceptance Label</span>
                  <button type="button" onClick={() => resetProposalDefaults('acceptance')} className="text-[11px] font-medium text-blue-700 hover:text-blue-800">Reset Default</button>
                </span>
                <input
                  className="mt-1 h-9 w-full rounded border border-slate-300 px-2 text-sm"
                  value={settings?.proposalAcceptanceLabel || ''}
                  onChange={(e) => settings && setSettings({ ...settings, proposalAcceptanceLabel: e.target.value })}
                />
              </label>
            </div>

            <ProposalPreview
              project={project}
              settings={settings}
              website={companyWebsite}
              lines={lines}
              summary={summary}
            />
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
        <div className="fixed inset-0 z-50 bg-slate-900/40 p-3 sm:p-6" onClick={() => setModifiersModalOpen(false)}>
          <div className="mx-auto flex h-[88vh] max-w-4xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-3">
              <div>
                <p className="text-[10px] uppercase tracking-[0.12em] text-slate-500 font-semibold">Line Editor</p>
                <h3 className="mt-1 text-sm font-semibold text-slate-900">Edit Line Item In A Popup</h3>
                <p className="mt-1 text-xs text-slate-600">Clicking a row opens this editor so you can adjust description, room, pricing, notes, and modifiers without editing directly in the table.</p>
              </div>
              <button onClick={() => setModifiersModalOpen(false)} className="h-8 rounded-md border border-slate-300 px-3 text-xs font-medium hover:bg-slate-50">Close</button>
            </div>

            <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px]">
              <div className="min-h-0 overflow-y-auto p-4">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <label className="text-[11px] font-medium text-slate-700 md:col-span-2">Description
                    <input className="ui-input mt-1 h-9" value={selectedLine.description} onChange={(e) => patchLineLocal(selectedLine.id, { description: e.target.value })} onBlur={() => void persistLine(selectedLine.id)} />
                  </label>
                  <label className="text-[11px] font-medium text-slate-700">Room
                    <select className="ui-input mt-1 h-9" value={selectedLine.roomId} onChange={(e) => patchLineLocal(selectedLine.id, { roomId: e.target.value })} onBlur={() => void persistLine(selectedLine.id)}>
                      {rooms.map((room) => <option key={room.id} value={room.id}>{room.roomName}</option>)}
                    </select>
                  </label>
                  <label className="text-[11px] font-medium text-slate-700">Category
                    <input className="ui-input mt-1 h-9" value={selectedLine.category || ''} onChange={(e) => patchLineLocal(selectedLine.id, { category: e.target.value || null })} onBlur={() => void persistLine(selectedLine.id)} />
                  </label>
                  <label className="text-[11px] font-medium text-slate-700">Qty
                    <input type="number" className="ui-input mt-1 h-9" value={selectedLine.qty} onChange={(e) => patchLineLocal(selectedLine.id, { qty: Number(e.target.value) || 0 })} onBlur={() => void persistLine(selectedLine.id)} />
                  </label>
                  <label className="text-[11px] font-medium text-slate-700">Unit
                    <input className="ui-input mt-1 h-9" value={selectedLine.unit} onChange={(e) => patchLineLocal(selectedLine.id, { unit: e.target.value })} onBlur={() => void persistLine(selectedLine.id)} />
                  </label>
                  {showMaterial ? (
                    <label className="text-[11px] font-medium text-slate-700">Material
                      <input type="number" className="ui-input mt-1 h-9" value={selectedLine.materialCost} onChange={(e) => patchLineLocal(selectedLine.id, { materialCost: Number(e.target.value) || 0 })} onBlur={() => void persistLine(selectedLine.id)} />
                    </label>
                  ) : null}
                  {showLabor ? (
                    <label className="text-[11px] font-medium text-slate-700">Labor
                      <input type="number" className="ui-input mt-1 h-9" value={selectedLine.laborCost} onChange={(e) => patchLineLocal(selectedLine.id, { laborCost: Number(e.target.value) || 0 })} onBlur={() => void persistLine(selectedLine.id)} />
                    </label>
                  ) : null}
                  <label className="text-[11px] font-medium text-slate-700">Unit Sell
                    <input type="number" className="ui-input mt-1 h-9" value={selectedLine.unitSell} onChange={(e) => patchLineLocal(selectedLine.id, { unitSell: Number(e.target.value) || 0 })} onBlur={() => void persistLine(selectedLine.id)} />
                  </label>
                  <label className="text-[11px] font-medium text-slate-700 md:col-span-2">Notes
                    <textarea rows={4} className="ui-textarea mt-1" value={selectedLine.notes || ''} onChange={(e) => patchLineLocal(selectedLine.id, { notes: e.target.value || null })} onBlur={() => void persistLine(selectedLine.id)} />
                  </label>
                </div>
              </div>

              <div className="border-t border-slate-200 bg-slate-50/70 p-4 lg:border-l lg:border-t-0">
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

      {importModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 p-3 sm:p-6" onClick={() => setImportModalOpen(false)}>
          <div
            className="mx-auto h-[92vh] max-w-6xl rounded-xl bg-white border border-slate-200 shadow-2xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">Import Scope Lines</h2>
                <p className="text-xs text-slate-500">Review parsed rows in a full-size workspace before adding them to the estimate.</p>
              </div>
              <button
                onClick={() => setImportModalOpen(false)}
                className="h-8 px-3 rounded border border-slate-300 text-xs font-medium hover:bg-slate-50"
              >
                Close
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto p-4">
              <ImportParsePanel
                variant="expanded"
                catalog={catalog}
                projectId={project.id}
                roomId={activeRoomId}
                onFinalize={async (parsedLines) => {
                  await finalizeParsedLines(parsedLines);
                  setImportModalOpen(false);
                }}
              />
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
