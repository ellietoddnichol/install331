
import { CatalogAliasType, CatalogAttributeType, CatalogDeltaType, CatalogItem, CatalogItemAlias, CatalogItemAttribute } from '../types';
import { BundleRecord, CatalogPostCutoverHealthRecord, CatalogSyncRunHistoryRecord, CatalogSyncStatusRecord, DbPersistenceStatusRecord, EstimateSummary, InstallReviewEmailDraft, ModifierRecord, PeerIntakeDefaultsResponse, ProjectFileRecord, ProjectRecord, RoomRecord, SettingsRecord, TakeoffLineRecord } from '../shared/types/estimator';
import type { CatalogSyncRunAuditSummary } from '../shared/types/catalogSyncAudit.ts';
import type { CatalogReviewQueueKey } from '../shared/catalogReviewQueues.ts';
import { IntakeParseRequest, IntakeParseResult } from '../shared/types/intake';

const API_BASE = '/api';

/** Same-origin API wrapper — sends Supabase auth cookies when configured. */
export function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return fetch(input, { credentials: 'same-origin', ...init, headers: init?.headers });
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let errorMessage = `Request failed with status ${res.status}`;
    try {
      const errorData = await res.json();
      const code = errorData.code ? ` (${errorData.code})` : '';
      errorMessage = (errorData.error || errorData.message || errorMessage) + code;
    } catch (e) {
      // If not JSON, try text
      try {
        const text = await res.text();
        if (text) errorMessage = text.substring(0, 100); // Limit length
      } catch (e2) {}
    }
    throw new Error(errorMessage);
  }
  
  const contentType = res.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    return res.json();
  }
  return {} as T;
}

/** Unwrap `{ data }` from v1 API JSON; throw if a single object was expected but missing. */
function readDataObject<T>(payload: { data?: T | null }, missingMessage: string): T {
  const data = payload?.data;
  if (data === undefined || data === null) {
    throw new Error(missingMessage);
  }
  return data;
}

/** Unwrap `{ data }` as an array; coerce missing or invalid shapes to []. */
function readDataArray<T>(payload: { data?: T[] | null }): T[] {
  const data = payload?.data;
  return Array.isArray(data) ? data : [];
}

export const api = {
  async getV1Projects(): Promise<ProjectRecord[]> {
    const res = await apiFetch(`${API_BASE}/v1/projects`);
    const payload = await handleResponse<{ data: ProjectRecord[] }>(res);
    return readDataArray<ProjectRecord>(payload);
  },
  async getV1Project(id: string): Promise<ProjectRecord> {
    const res = await apiFetch(`${API_BASE}/v1/projects/${id}`);
    const payload = await handleResponse<{ data: ProjectRecord }>(res);
    return readDataObject<ProjectRecord>(payload, 'Project response was missing data.');
  },
  async createV1Project(project: Partial<ProjectRecord>): Promise<ProjectRecord> {
    const res = await apiFetch(`${API_BASE}/v1/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(project),
    });
    const payload = await handleResponse<{ data: ProjectRecord }>(res);
    return readDataObject<ProjectRecord>(payload, 'Project creation response was missing data.');
  },
  async getV1PeerIntakeDefaults(query: {
    clientName?: string;
    generalContractor?: string;
    excludeProjectId?: string;
  }): Promise<PeerIntakeDefaultsResponse | null> {
    const params = new URLSearchParams();
    if (query.clientName) params.set('clientName', query.clientName);
    if (query.generalContractor) params.set('generalContractor', query.generalContractor);
    if (query.excludeProjectId) params.set('excludeProjectId', query.excludeProjectId);
    const res = await apiFetch(`${API_BASE}/v1/projects/peer-intake-defaults?${params.toString()}`);
    const payload = await handleResponse<{ data: PeerIntakeDefaultsResponse | null }>(res);
    return payload.data;
  },
  async postV1IntakeCatalogMemory(body: {
    catalogItemId: string;
    itemCode?: string;
    itemName?: string;
    description?: string;
  }): Promise<void> {
    const res = await apiFetch(`${API_BASE}/v1/settings/intake-catalog-memory`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    await handleResponse<{ data: { ok: boolean } }>(res);
  },
  async updateV1Project(id: string, project: Partial<ProjectRecord>): Promise<ProjectRecord> {
    const res = await apiFetch(`${API_BASE}/v1/projects/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(project),
    });
    const payload = await handleResponse<{ data: ProjectRecord }>(res);
    return readDataObject<ProjectRecord>(payload, 'Project update response was missing data.');
  },
  async archiveV1Project(id: string): Promise<void> {
    const res = await apiFetch(`${API_BASE}/v1/projects/${id}`, { method: 'DELETE' });
    await handleResponse<{ data: { archived: boolean } }>(res);
  },
  async deleteV1Project(id: string): Promise<void> {
    const res = await apiFetch(`${API_BASE}/v1/projects/${id}?permanent=true`, { method: 'DELETE' });
    await handleResponse<{ data: { deleted: boolean } }>(res);
  },
  async getV1ProjectFiles(projectId: string): Promise<ProjectFileRecord[]> {
    const res = await apiFetch(`${API_BASE}/v1/projects/${encodeURIComponent(projectId)}/files`);
    const payload = await handleResponse<{ data: ProjectFileRecord[] }>(res);
    return readDataArray<ProjectFileRecord>(payload);
  },
  async uploadV1ProjectFile(input: {
    projectId: string;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    dataBase64: string;
  }): Promise<ProjectFileRecord> {
    const res = await apiFetch(`${API_BASE}/v1/projects/${encodeURIComponent(input.projectId)}/files`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileName: input.fileName,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        dataBase64: input.dataBase64,
      }),
    });
    const payload = await handleResponse<{ data: ProjectFileRecord }>(res);
    return readDataObject<ProjectFileRecord>(payload, 'Project file upload response was missing data.');
  },
  getV1ProjectFileDownloadUrl(projectId: string, fileId: string): string {
    return `${API_BASE}/v1/projects/${encodeURIComponent(projectId)}/files/${encodeURIComponent(fileId)}/download`;
  },
  async deleteV1ProjectFile(projectId: string, fileId: string): Promise<void> {
    const res = await apiFetch(`${API_BASE}/v1/projects/${encodeURIComponent(projectId)}/files/${encodeURIComponent(fileId)}`, {
      method: 'DELETE',
    });
    await handleResponse<{ data: { deleted: boolean } }>(res);
  },
  async getV1Rooms(projectId: string): Promise<RoomRecord[]> {
    const res = await apiFetch(`${API_BASE}/v1/rooms?projectId=${encodeURIComponent(projectId)}`);
    const payload = await handleResponse<{ data: RoomRecord[] }>(res);
    return readDataArray<RoomRecord>(payload);
  },
  async createV1Room(input: { projectId: string; roomName: string; notes?: string }): Promise<RoomRecord> {
    const res = await apiFetch(`${API_BASE}/v1/rooms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    const payload = await handleResponse<{ data: RoomRecord }>(res);
    return readDataObject<RoomRecord>(payload, 'Room creation response was missing data.');
  },
  async updateV1Room(roomId: string, input: Partial<RoomRecord>): Promise<RoomRecord> {
    const res = await apiFetch(`${API_BASE}/v1/rooms/${roomId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    const payload = await handleResponse<{ data: RoomRecord }>(res);
    return readDataObject<RoomRecord>(payload, 'Room update response was missing data.');
  },
  async duplicateV1Room(roomId: string): Promise<RoomRecord> {
    const res = await apiFetch(`${API_BASE}/v1/rooms/${roomId}/duplicate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    const payload = await handleResponse<{ data: RoomRecord }>(res);
    return readDataObject<RoomRecord>(payload, 'Room duplication response was missing data.');
  },
  async deleteV1Room(roomId: string): Promise<void> {
    const res = await apiFetch(`${API_BASE}/v1/rooms/${roomId}`, { method: 'DELETE' });
    await handleResponse<{ data: { deleted: boolean } }>(res);
  },
  async getV1TakeoffLines(projectId: string, roomId?: string): Promise<TakeoffLineRecord[]> {
    const query = new URLSearchParams({ projectId });
    if (roomId) query.set('roomId', roomId);
    const res = await apiFetch(`${API_BASE}/v1/takeoff/lines?${query.toString()}`);
    const payload = await handleResponse<{ data: TakeoffLineRecord[] }>(res);
    return readDataArray<TakeoffLineRecord>(payload);
  },
  async createV1TakeoffLine(input: Partial<TakeoffLineRecord> & { projectId: string; roomId: string; description: string }): Promise<TakeoffLineRecord> {
    const res = await apiFetch(`${API_BASE}/v1/takeoff/lines`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    const payload = await handleResponse<{ data: TakeoffLineRecord }>(res);
    return readDataObject<TakeoffLineRecord>(payload, 'Takeoff line creation response was missing data.');
  },
  async updateV1TakeoffLine(lineId: string, input: Partial<TakeoffLineRecord>): Promise<TakeoffLineRecord> {
    const res = await apiFetch(`${API_BASE}/v1/takeoff/lines/${lineId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    const payload = await handleResponse<{ data: TakeoffLineRecord }>(res);
    return readDataObject<TakeoffLineRecord>(payload, 'Takeoff line update response was missing data.');
  },
  async bulkMoveV1TakeoffLines(input: { lineIds: string[]; roomId: string }): Promise<TakeoffLineRecord[]> {
    const res = await apiFetch(`${API_BASE}/v1/takeoff/lines/bulk-move`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lineIds: input.lineIds, roomId: input.roomId }),
    });
    const payload = await handleResponse<{ data: TakeoffLineRecord[] }>(res);
    return payload.data;
  },
  async deleteV1TakeoffLine(lineId: string): Promise<void> {
    const res = await apiFetch(`${API_BASE}/v1/takeoff/lines/${lineId}`, { method: 'DELETE' });
    await handleResponse<{ data: { deleted: boolean } }>(res);
  },
  async duplicateV1TakeoffLine(lineId: string, input: { roomId: string }): Promise<TakeoffLineRecord> {
    const res = await apiFetch(`${API_BASE}/v1/takeoff/lines/${encodeURIComponent(lineId)}/duplicate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomId: input.roomId }),
    });
    const payload = await handleResponse<{ data: TakeoffLineRecord }>(res);
    return payload.data;
  },
  async getV1Summary(projectId: string): Promise<EstimateSummary> {
    const res = await apiFetch(`${API_BASE}/v1/takeoff/summary/${projectId}`);
    const payload = await handleResponse<{ data: EstimateSummary }>(res);
    return payload.data;
  },
  async generateV1InstallReviewEmail(projectId: string): Promise<InstallReviewEmailDraft> {
    const res = await apiFetch(`${API_BASE}/v1/takeoff/install-review-email/${encodeURIComponent(projectId)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    const payload = await handleResponse<{ data: InstallReviewEmailDraft }>(res);
    return payload.data;
  },
  async repriceV1ProjectTakeoff(projectId: string): Promise<TakeoffLineRecord[]> {
    const res = await apiFetch(`${API_BASE}/v1/takeoff/reprice/${encodeURIComponent(projectId)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    const payload = await handleResponse<{ data: TakeoffLineRecord[] }>(res);
    return readDataArray<TakeoffLineRecord>(payload);
  },
  async generateV1ProposalDraft(input: {
    mode: 'scope_summary' | 'proposal_text' | 'terms_and_conditions' | 'default_short';
    project: ProjectRecord;
    lines: TakeoffLineRecord[];
    summary: EstimateSummary | null;
    settings: Partial<SettingsRecord>;
  }): Promise<Partial<SettingsRecord>> {
    const res = await apiFetch(`${API_BASE}/v1/settings/proposal-draft`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    const payload = await handleResponse<{ data: Partial<SettingsRecord> }>(res);
    return readDataObject<Partial<SettingsRecord>>(payload, 'Proposal draft response was missing data.');
  },
  async finalizeV1ParserLines(lines: Array<Partial<TakeoffLineRecord>>): Promise<TakeoffLineRecord[]> {
    const res = await apiFetch(`${API_BASE}/v1/takeoff/finalize-parser-lines`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lines }),
    });
    const payload = await handleResponse<{ data: TakeoffLineRecord[] }>(res);
    return readDataArray<TakeoffLineRecord>(payload);
  },
  async getV1Modifiers(): Promise<ModifierRecord[]> {
    const res = await apiFetch(`${API_BASE}/v1/modifiers`);
    const payload = await handleResponse<{ data: ModifierRecord[] }>(res);
    return readDataArray<ModifierRecord>(payload);
  },
  async getV1LineModifiers(lineId: string): Promise<Array<{
    id: string;
    lineId: string;
    modifierId: string;
    name: string;
    addMaterialCost: number;
    addLaborMinutes: number;
    percentMaterial: number;
    percentLabor: number;
    createdAt: string;
  }>> {
    const res = await apiFetch(`${API_BASE}/v1/modifiers/line/${lineId}`);
    const payload = await handleResponse<{ data: Array<{
      id: string;
      lineId: string;
      modifierId: string;
      name: string;
      addMaterialCost: number;
      addLaborMinutes: number;
      percentMaterial: number;
      percentLabor: number;
      createdAt: string;
    }> }>(res);
    return readDataArray(payload);
  },
  async applyV1ModifierToLine(lineId: string, modifierId: string): Promise<{ line: TakeoffLineRecord; modifier: any }> {
    const res = await apiFetch(`${API_BASE}/v1/modifiers/line/${lineId}/apply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ modifierId }),
    });
    const payload = await handleResponse<{ data: { line: TakeoffLineRecord; modifier: any } }>(res);
    return readDataObject<{ line: TakeoffLineRecord; modifier: any }>(payload, 'Modifier application response was missing data.');
  },
  async removeV1LineModifier(lineId: string, lineModifierId: string): Promise<{ line: TakeoffLineRecord; removed: boolean }> {
    const res = await apiFetch(`${API_BASE}/v1/modifiers/line/${lineId}/${lineModifierId}`, { method: 'DELETE' });
    const payload = await handleResponse<{ data: { line: TakeoffLineRecord; removed: boolean } }>(res);
    return readDataObject<{ line: TakeoffLineRecord; removed: boolean }>(payload, 'Modifier removal response was missing data.');
  },
  async getV1Bundles(): Promise<BundleRecord[]> {
    const res = await apiFetch(`${API_BASE}/v1/bundles`);
    const payload = await handleResponse<{ data: BundleRecord[] }>(res);
    return readDataArray<BundleRecord>(payload);
  },
  async getV1BundleItems(bundleId: string): Promise<Array<{
    id: string;
    bundleId: string;
    catalogItemId: string | null;
    sku: string | null;
    description: string;
    qty: number;
    materialCost: number;
    laborMinutes: number;
    laborCost: number;
    sortOrder: number;
    notes: string | null;
  }>> {
    const res = await apiFetch(`${API_BASE}/v1/bundles/${encodeURIComponent(bundleId)}/items`);
    const payload = await handleResponse<{ data: Array<{
      id: string;
      bundleId: string;
      catalogItemId: string | null;
      sku: string | null;
      description: string;
      qty: number;
      materialCost: number;
      laborMinutes: number;
      laborCost: number;
      sortOrder: number;
      notes: string | null;
    }> }>(res);
    return readDataArray(payload);
  },
  async applyV1Bundle(bundleId: string, projectId: string, roomId: string): Promise<TakeoffLineRecord[]> {
    const res = await apiFetch(`${API_BASE}/v1/bundles/${bundleId}/apply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, roomId }),
    });
    const payload = await handleResponse<{ data: TakeoffLineRecord[] }>(res);
    return readDataArray<TakeoffLineRecord>(payload);
  },
  async getV1Settings(): Promise<SettingsRecord> {
    const res = await apiFetch(`${API_BASE}/v1/settings`);
    const payload = await handleResponse<{ data: SettingsRecord }>(res);
    return readDataObject<SettingsRecord>(payload, 'Settings response was missing data.');
  },
  async updateV1Settings(input: Partial<SettingsRecord>): Promise<SettingsRecord> {
    const res = await apiFetch(`${API_BASE}/v1/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    const payload = await handleResponse<{ data: SettingsRecord }>(res);
    return readDataObject<SettingsRecord>(payload, 'Settings update response was missing data.');
  },
  async getCatalogSyncStatus(): Promise<CatalogSyncStatusRecord> {
    const res = await apiFetch(`${API_BASE}/v1/settings/catalog-sync-status`);
    const payload = await handleResponse<{ data: CatalogSyncStatusRecord }>(res);
    return readDataObject<CatalogSyncStatusRecord>(payload, 'Catalog sync status response was missing data.');
  },
  async getV1CatalogPostCutoverHealth(): Promise<CatalogPostCutoverHealthRecord> {
    const res = await apiFetch(`${API_BASE}/v1/settings/catalog-post-cutover-health`);
    const payload = await handleResponse<{ data: CatalogPostCutoverHealthRecord }>(res);
    return payload.data;
  },
  async getCatalogSyncRuns(limit = 10): Promise<CatalogSyncRunHistoryRecord[]> {
    const res = await apiFetch(`${API_BASE}/v1/settings/catalog-sync-runs?limit=${encodeURIComponent(String(limit))}`);
    const payload = await handleResponse<{ data: CatalogSyncRunHistoryRecord[] }>(res);
    return payload.data;
  },

  /** Download `text/csv` for a catalog sync review queue (optional `runId` defaults server-side to latest run). */
  async downloadCatalogSyncReviewCsv(queue: CatalogReviewQueueKey, runId?: string | null): Promise<void> {
    const params = new URLSearchParams({ queue });
    if (runId) params.set('runId', runId);
    const res = await apiFetch(`${API_BASE}/v1/settings/catalog-sync-review-csv?${params.toString()}`);
    if (!res.ok) {
      let errorMessage = `Request failed with status ${res.status}`;
      try {
        const ct = res.headers.get('content-type');
        if (ct?.includes('application/json')) {
          const errorData = (await res.json()) as { error?: string };
          errorMessage = errorData.error || errorMessage;
        } else {
          const text = await res.text();
          if (text) errorMessage = text.trim().slice(0, 400);
        }
      } catch {
        /* ignore */
      }
      throw new Error(errorMessage);
    }
    const blob = await res.blob();
    const href = URL.createObjectURL(blob);
    try {
      const a = document.createElement('a');
      a.href = href;
      a.download = `catalog-review-${queue}.csv`;
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
    } finally {
      URL.revokeObjectURL(href);
    }
  },
  async getV1PersistenceStatus(): Promise<DbPersistenceStatusRecord & { gcsObjectMeta?: any; remoteDurableKind?: 'supabase' | 'gcs' | null }> {
    const res = await apiFetch(`${API_BASE}/v1/settings/persistence-status`);
    const payload = await handleResponse<{ data: DbPersistenceStatusRecord & { gcsObjectMeta?: any; remoteDurableKind?: 'supabase' | 'gcs' | null } }>(res);
    return payload.data;
  },
  async getV1IntegrationHealth(): Promise<{
    dbDriver: string;
    gemini: boolean;
    googleSheets: boolean;
    catalogSheetsSyncEnabled: boolean;
    supabaseAnon: boolean;
    supabaseServiceRole: boolean;
    pdfProvider: string;
    googleDocumentAi: boolean;
    passwordLogin: boolean;
    authRequired: boolean;
    div10BrainAdmin: boolean;
    workspaceTakeoffLinesTable: string;
    catalogAliasesReadTable: string;
    catalogAliasesWriteTable: string;
    catalogAliasesLayout: 'sheet' | 'brain';
    catalogBundlesReadTable: string;
    catalogBundleItemsReadTable: string;
    catalogItemsReadTable: string;
    catalogModifiersReadTable: string;
  }> {
    const res = await apiFetch(`${API_BASE}/v1/settings/integration-health`);
    const payload = await handleResponse<{ data: {
      dbDriver: string;
      gemini: boolean;
      googleSheets: boolean;
      catalogSheetsSyncEnabled: boolean;
      supabaseAnon: boolean;
      supabaseServiceRole: boolean;
      pdfProvider: string;
      googleDocumentAi: boolean;
      passwordLogin: boolean;
      authRequired: boolean;
      div10BrainAdmin: boolean;
      workspaceTakeoffLinesTable: string;
      catalogAliasesReadTable: string;
      catalogAliasesWriteTable: string;
      catalogAliasesLayout: 'sheet' | 'brain';
      catalogBundlesReadTable: string;
      catalogBundleItemsReadTable: string;
      catalogItemsReadTable: string;
      catalogModifiersReadTable: string;
    } }>(res);
    return payload.data;
  },
  async backupV1PersistenceNow(): Promise<{ ok: boolean; message: string; status: DbPersistenceStatusRecord & { gcsObjectMeta?: any; remoteDurableKind?: 'supabase' | 'gcs' | null } }> {
    const res = await apiFetch(`${API_BASE}/v1/settings/persistence-backup-now`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    const payload = await handleResponse<{ data: { ok: boolean; message: string; status: DbPersistenceStatusRecord & { gcsObjectMeta?: any; remoteDurableKind?: 'supabase' | 'gcs' | null } } }>(res);
    return payload.data;
  },
  async syncV1Catalog(): Promise<{
    message: string;
    spreadsheetId: string;
    tabs: { items: string; modifiers: string; bundles: string; aliases: string; attributes: string };
    itemsTabConfigured?: string;
    itemsSynced: number;
    modifiersSynced: number;
    bundlesSynced: number;
    bundleItemsSynced: number;
    aliasesSynced: number;
    attributesSynced: number;
    warnings: string[];
    audit?: CatalogSyncRunAuditSummary;
    syncedAt: string;
  }> {
    const res = await apiFetch(`${API_BASE}/v1/settings/sync-catalog`, { method: 'POST' });
    const payload = await handleResponse<{ data: {
      message: string;
      spreadsheetId: string;
      tabs: { items: string; modifiers: string; bundles: string; aliases: string; attributes: string };
      itemsTabConfigured?: string;
      itemsSynced: number;
      modifiersSynced: number;
      bundlesSynced: number;
      bundleItemsSynced: number;
      aliasesSynced: number;
      attributesSynced: number;
      warnings: string[];
      audit?: CatalogSyncRunAuditSummary;
      syncedAt: string;
    } }>(res);
    return payload.data;
  },
  async backfillV1TakeoffRegistry(): Promise<{
    message: string;
    spreadsheetId: string;
    tabName: string;
    itemsBackfilled: number;
    warnings: string[];
    syncedAt: string;
  }> {
    const res = await apiFetch(`${API_BASE}/v1/settings/backfill-takeoff-registry`, { method: 'POST' });
    const payload = await handleResponse<{ data: {
      message: string;
      spreadsheetId: string;
      tabName: string;
      itemsBackfilled: number;
      warnings: string[];
      syncedAt: string;
    } }>(res);
    return payload.data;
  },
  async extractV1IntakeWithGemini(input: {
    fileName: string;
    mimeType: string;
    sourceType: 'pdf' | 'document' | 'spreadsheet';
    dataBase64?: string;
    extractedText?: string;
    normalizedRows?: Array<Record<string, unknown>>;
  }): Promise<{
    projectName: string;
    projectNumber: string;
    client: string;
    address: string;
    bidDate: string;
    rooms: string[];
    parsedLines: Array<{
      roomArea: string;
      category: string;
      itemCode: string;
      itemName: string;
      description: string;
      quantity: number;
      unit: string;
      notes: string;
    }>;
    warnings: string[];
  }> {
    const res = await apiFetch(`${API_BASE}/v1/intake/extract`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    const payload = await handleResponse<{ data: {
      projectName: string;
      projectNumber: string;
      client: string;
      address: string;
      bidDate: string;
      rooms: string[];
      parsedLines: Array<{
        roomArea: string;
        category: string;
        itemCode: string;
        itemName: string;
        description: string;
        quantity: number;
        unit: string;
        notes: string;
      }>;
      warnings: string[];
    } }>(res);
    return payload.data;
  },
  async parseV1Intake(input: IntakeParseRequest): Promise<IntakeParseResult> {
    const res = await apiFetch(`${API_BASE}/v1/intake/parse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    const payload = await handleResponse<{ data: IntakeParseResult }>(res);
    return payload.data;
  },
  async postV1IntakeDiv10TrainingCapture(body: {
    reviewLineFingerprint: string;
    action: 'accepted' | 'replaced' | 'ignored';
    finalCatalogItemId: string | null;
    lineText: string;
    deterministicSuggestedId?: string | null;
    div10BrainSnapshot?: unknown;
  }): Promise<{ ok: boolean; deduped?: boolean }> {
    const res = await apiFetch(`${API_BASE}/v1/intake/div10-training-capture`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const payload = await handleResponse<{ data: { ok: boolean; deduped?: boolean } }>(res);
    return payload.data;
  },
  async postV1IntakeReviewOverride(body: {
    reviewLineFingerprint: string;
    status: 'ignored';
    reviewLineContentKey?: string | null;
  }): Promise<{ ok: boolean }> {
    const res = await apiFetch(`${API_BASE}/v1/intake/review-override`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const payload = await handleResponse<{ data: { ok: boolean } }>(res);
    return payload.data;
  },
  /** Full catalog list — use only for export/backup or legacy flows. Prefer {@link getV1CatalogItemsPage} for the Catalog UI. */
  async getCatalog(options?: { includeInactive?: boolean }): Promise<CatalogItem[]> {
    const q =
      options?.includeInactive === true
        ? '?includeInactive=1'
        : '';
    const res = await apiFetch(`${API_BASE}/catalog/items${q}`);
    return handleResponse<CatalogItem[]>(res);
  },

  async getV1CatalogCategories(): Promise<string[]> {
    const res = await apiFetch(`${API_BASE}/v1/catalog/categories`);
    const payload = await handleResponse<{ data: string[] }>(res);
    return payload.data ?? [];
  },

  async getV1CatalogFacets(): Promise<{
    categories: string[];
    itemTypes: string[];
    sourceTabs: string[];
    hasUntaggedSource: boolean;
  }> {
    const res = await apiFetch(`${API_BASE}/v1/catalog/facets`);
    const payload = await handleResponse<{
      data: { categories: string[]; itemTypes: string[]; sourceTabs: string[]; hasUntaggedSource: boolean };
    }>(res);
    return payload.data;
  },

  async getV1CatalogItemsPage(input: {
    offset: number;
    limit: number;
    activeFilter: 'all' | 'active' | 'inactive';
    category?: string;
    q?: string;
    typeFilter?: string;
    sourceTabFilter?: string;
    imageSprintOnly?: boolean;
    sortBy?: string;
  }): Promise<{
    items: CatalogItem[];
    total: number;
    offset: number;
    limit: number;
    meta?: {
      catalogItemsReadTable: string;
      dbDriver: string;
      catalogBackend: 'postgres' | 'sqlite';
      emptyUnfiltered: boolean;
      emptyHint: string | null;
    };
  }> {
    const p = new URLSearchParams();
    p.set('offset', String(Math.max(0, input.offset)));
    p.set('limit', String(Math.min(200, Math.max(1, input.limit ?? 75))));
    if (input.activeFilter !== 'all') p.set('act', input.activeFilter);
    if (input.category && input.category !== 'all') p.set('cat', input.category);
    if (input.q?.trim()) p.set('q', input.q.trim());
    if (input.typeFilter && input.typeFilter !== 'all') p.set('itype', input.typeFilter);
    if (input.sourceTabFilter && input.sourceTabFilter !== 'all') p.set('sheet', input.sourceTabFilter);
    if (input.imageSprintOnly) p.set('img', '1');
    if (input.sortBy) p.set('sort', input.sortBy);
    const res = await apiFetch(`${API_BASE}/v1/catalog/items?${p.toString()}`);
    const payload = await handleResponse<{
      data: { items: CatalogItem[]; total: number; offset: number; limit: number };
      meta?: {
        catalogItemsReadTable: string;
        dbDriver: string;
        catalogBackend: 'postgres' | 'sqlite';
        emptyUnfiltered: boolean;
        emptyHint: string | null;
      };
    }>(res);
    return { ...payload.data, meta: payload.meta };
  },

  async getV1CatalogItem(id: string): Promise<CatalogItem> {
    const res = await apiFetch(`${API_BASE}/v1/catalog/items/${encodeURIComponent(id)}`);
    const payload = await handleResponse<{ data: CatalogItem }>(res);
    return payload.data;
  },

  async lookupV1CatalogItemsByIds(ids: string[]): Promise<CatalogItem[]> {
    const res = await apiFetch(`${API_BASE}/v1/catalog/items/lookup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    });
    const payload = await handleResponse<{ data: { items: CatalogItem[] } }>(res);
    return payload.data.items;
  },
  async getV1CatalogInventory(): Promise<{ total: number; active: number; inactive: number }> {
    const res = await apiFetch(`${API_BASE}/v1/settings/catalog-inventory`);
    const payload = await handleResponse<{ data: { total: number; active: number; inactive: number } }>(res);
    return payload.data;
  },
  async activateAllV1CatalogItems(): Promise<{ changed: number; total: number; active: number; inactive: number }> {
    const res = await apiFetch(`${API_BASE}/v1/settings/activate-all-catalog-items`, { method: 'POST' });
    const payload = await handleResponse<{ data: { changed: number; total: number; active: number; inactive: number } }>(res);
    return payload.data;
  },
  async createCatalogItem(item: CatalogItem): Promise<CatalogItem> {
    const res = await apiFetch(`${API_BASE}/catalog/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(item),
    });
    return handleResponse<CatalogItem>(res);
  },
  async updateCatalogItem(item: CatalogItem): Promise<CatalogItem> {
    const res = await apiFetch(`${API_BASE}/catalog/items/${item.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(item),
    });
    return handleResponse<CatalogItem>(res);
  },
  async deleteCatalogItem(id: string): Promise<void> {
    const res = await apiFetch(`${API_BASE}/catalog/items/${id}`, { method: 'DELETE' });
    await handleResponse<void>(res);
  },
  async getCatalogModifiers(): Promise<ModifierRecord[]> {
    const res = await apiFetch(`${API_BASE}/catalog/modifiers`);
    return handleResponse<ModifierRecord[]>(res);
  },
  async updateCatalogModifier(input: Partial<ModifierRecord> & { id: string }): Promise<ModifierRecord> {
    const res = await apiFetch(`${API_BASE}/catalog/modifiers/${input.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    return handleResponse<ModifierRecord>(res);
  },
  async deleteCatalogModifier(id: string): Promise<void> {
    const res = await apiFetch(`${API_BASE}/catalog/modifiers/${id}`, { method: 'DELETE' });
    await handleResponse<void>(res);
  },
  async getCatalogBundles(): Promise<BundleRecord[]> {
    const res = await apiFetch(`${API_BASE}/catalog/bundles`);
    return handleResponse<BundleRecord[]>(res);
  },
  async updateCatalogBundle(input: Partial<BundleRecord> & { id: string }): Promise<BundleRecord> {
    const res = await apiFetch(`${API_BASE}/catalog/bundles/${input.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    return handleResponse<BundleRecord>(res);
  },
  async deleteCatalogBundle(id: string): Promise<void> {
    const res = await apiFetch(`${API_BASE}/catalog/bundles/${id}`, { method: 'DELETE' });
    await handleResponse<void>(res);
  },

  async listCatalogItemAliases(catalogItemId: string): Promise<CatalogItemAlias[]> {
    const res = await apiFetch(`${API_BASE}/catalog/items/${encodeURIComponent(catalogItemId)}/aliases`);
    return handleResponse<CatalogItemAlias[]>(res);
  },

  async createCatalogItemAlias(input: { catalogItemId: string; aliasType: CatalogAliasType; aliasValue: string }): Promise<CatalogItemAlias> {
    const res = await apiFetch(`${API_BASE}/catalog/items/${encodeURIComponent(input.catalogItemId)}/aliases`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ aliasType: input.aliasType, aliasValue: input.aliasValue }),
    });
    return handleResponse<CatalogItemAlias>(res);
  },

  async deleteCatalogItemAlias(aliasId: string): Promise<void> {
    const res = await apiFetch(`${API_BASE}/catalog/item-aliases/${encodeURIComponent(aliasId)}`, { method: 'DELETE' });
    await handleResponse<void>(res);
  },

  async searchCatalogItems(input: {
    query: string;
    category?: string;
    includeInactive?: boolean;
    includeDeprecated?: boolean;
    includeNonCanonical?: boolean;
  }): Promise<CatalogItem[]> {
    const params = new URLSearchParams();
    params.set('q', input.query);
    if (input.category) params.set('category', input.category);
    if (input.includeInactive) params.set('includeInactive', '1');
    if (input.includeDeprecated) params.set('includeDeprecated', '1');
    if (input.includeNonCanonical) params.set('includeNonCanonical', '1');
    const res = await apiFetch(`${API_BASE}/catalog/search?${params.toString()}`);
    return handleResponse<CatalogItem[]>(res);
  },

  async listCatalogItemAttributes(catalogItemId: string, options?: { includeInactive?: boolean }): Promise<CatalogItemAttribute[]> {
    const q = options?.includeInactive ? '?includeInactive=1' : '';
    const res = await apiFetch(`${API_BASE}/catalog/items/${encodeURIComponent(catalogItemId)}/attributes${q}`);
    return handleResponse<CatalogItemAttribute[]>(res);
  },

  async createCatalogItemAttribute(input: {
    catalogItemId: string;
    attributeType: CatalogAttributeType;
    attributeValue: string;
    materialDeltaType?: CatalogDeltaType | null;
    materialDeltaValue?: number | null;
    laborDeltaType?: CatalogDeltaType | null;
    laborDeltaValue?: number | null;
    sortOrder?: number;
  }): Promise<CatalogItemAttribute> {
    const res = await apiFetch(`${API_BASE}/catalog/items/${encodeURIComponent(input.catalogItemId)}/attributes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        attributeType: input.attributeType,
        attributeValue: input.attributeValue,
        materialDeltaType: input.materialDeltaType ?? null,
        materialDeltaValue: input.materialDeltaValue ?? null,
        laborDeltaType: input.laborDeltaType ?? null,
        laborDeltaValue: input.laborDeltaValue ?? null,
        sortOrder: input.sortOrder ?? 0,
      }),
    });
    return handleResponse<CatalogItemAttribute>(res);
  },

  async deleteCatalogItemAttribute(attributeId: string): Promise<void> {
    const res = await apiFetch(`${API_BASE}/catalog/item-attributes/${encodeURIComponent(attributeId)}`, { method: 'DELETE' });
    await handleResponse<void>(res);
  },

  async getV1PipelineCapabilities(): Promise<{ nativeWorkspace: boolean; pg: boolean }> {
    const res = await apiFetch(`${API_BASE}/v1/pipeline/capabilities`);
    const payload = await handleResponse<{ data: { nativeWorkspace: boolean; pg: boolean } }>(res);
    return payload.data;
  },

  async getV1PipelineProposalPreview(
    projectId: string,
    estimateId: string
  ): Promise<{ lines: TakeoffLineRecord[]; summary: EstimateSummary; warnings: string[] }> {
    const params = new URLSearchParams({ estimateId });
    const res = await apiFetch(
      `${API_BASE}/v1/pipeline/projects/${encodeURIComponent(projectId)}/proposal-preview?${params.toString()}`
    );
    const payload = await handleResponse<{
      data: { lines: TakeoffLineRecord[]; summary: EstimateSummary; warnings?: string[] };
    }>(res);
    const d = payload.data;
    if (!d?.summary) {
      throw new Error('Proposal preview response was missing summary.');
    }
    return { lines: Array.isArray(d.lines) ? d.lines : [], summary: d.summary, warnings: d.warnings ?? [] };
  },

  async getV1PipelineTakeoffUploads(projectId: string): Promise<Record<string, unknown>[]> {
    const res = await apiFetch(`${API_BASE}/v1/pipeline/projects/${encodeURIComponent(projectId)}/takeoff-uploads`);
    const payload = await handleResponse<{ data: Record<string, unknown>[] }>(res);
    return readDataArray(payload);
  },

  async getV1PipelineEstimates(projectId: string): Promise<Record<string, unknown>[]> {
    const res = await apiFetch(`${API_BASE}/v1/pipeline/projects/${encodeURIComponent(projectId)}/estimates`);
    const payload = await handleResponse<{ data: Record<string, unknown>[] }>(res);
    return readDataArray(payload);
  },

  async postV1PipelineProcessMatches(takeoffUploadId: string): Promise<void> {
    const res = await apiFetch(`${API_BASE}/v1/pipeline/takeoff-uploads/${encodeURIComponent(takeoffUploadId)}/process-matches`, {
      method: 'POST',
    });
    await handleResponse<{ data: { ok: boolean } }>(res);
  },

  async getV1PipelineReviewQueue(takeoffUploadId: string): Promise<{ reviewQueue: Record<string, unknown>[]; autoMatched: Record<string, unknown>[] }> {
    const res = await apiFetch(`${API_BASE}/v1/pipeline/takeoff-uploads/${encodeURIComponent(takeoffUploadId)}/review-queue`);
    const payload = await handleResponse<{
      data: { reviewQueue: Record<string, unknown>[]; autoMatched: Record<string, unknown>[] };
    }>(res);
    return payload.data;
  },

  async postV1PipelineAcceptMatch(takeoffRowId: string, body: { catalogItemId: string; isReplace?: boolean; confidence?: number }): Promise<void> {
    const res = await apiFetch(`${API_BASE}/v1/pipeline/takeoff-rows/${encodeURIComponent(takeoffRowId)}/accept-match`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        catalogItemId: body.catalogItemId,
        isReplace: Boolean(body.isReplace),
        confidence: body.confidence ?? 1,
      }),
    });
    await handleResponse<{ data: { ok: boolean } }>(res);
  },

  async postV1PipelineRejectMatch(takeoffRowId: string, body: { catalogItemId: string; reasonCode?: string }): Promise<void> {
    const res = await apiFetch(`${API_BASE}/v1/pipeline/takeoff-rows/${encodeURIComponent(takeoffRowId)}/reject-match`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ catalogItemId: body.catalogItemId, reasonCode: body.reasonCode ?? 'rejected' }),
    });
    await handleResponse<{ data: { ok: boolean } }>(res);
  },

  async postV1PipelineClearMatch(takeoffRowId: string): Promise<void> {
    const res = await apiFetch(`${API_BASE}/v1/pipeline/takeoff-rows/${encodeURIComponent(takeoffRowId)}/clear-match`, { method: 'POST' });
    await handleResponse<{ data: { ok: boolean } }>(res);
  },

  async postV1PipelineBuildEstimateFromUpload(body: {
    estimateId: string;
    takeoffUploadId: string;
    laborRate: number;
    locationCode?: string;
    overwriteExisting?: boolean;
  }): Promise<void> {
    const res = await apiFetch(`${API_BASE}/v1/pipeline/estimates/${encodeURIComponent(body.estimateId)}/build-from-upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        takeoffUploadId: body.takeoffUploadId,
        laborRate: body.laborRate,
        locationCode: body.locationCode ?? 'DEFAULT',
        overwriteExisting: Boolean(body.overwriteExisting),
      }),
    });
    await handleResponse<{ data: { ok: boolean } }>(res);
  },

  async getV1PipelineEstimateLinesDetailed(estimateId: string): Promise<Record<string, unknown>[]> {
    const res = await apiFetch(`${API_BASE}/v1/pipeline/estimates/${encodeURIComponent(estimateId)}/lines-detailed`);
    const payload = await handleResponse<{ data: Record<string, unknown>[] }>(res);
    return readDataArray(payload);
  },

  async getV1PipelineEstimateSummary(estimateId: string): Promise<Record<string, unknown> | null> {
    const res = await apiFetch(`${API_BASE}/v1/pipeline/estimates/${encodeURIComponent(estimateId)}/summary`);
    const payload = await handleResponse<{ data: Record<string, unknown> | null }>(res);
    return payload.data ?? null;
  },

  async getV1PipelineEstimateCategoryTotals(estimateId: string): Promise<Record<string, unknown>[]> {
    const res = await apiFetch(`${API_BASE}/v1/pipeline/estimates/${encodeURIComponent(estimateId)}/category-totals`);
    const payload = await handleResponse<{ data: Record<string, unknown>[] }>(res);
    return readDataArray(payload);
  },

  async getV1PipelineEstimateLineRollups(estimateId: string): Promise<Record<string, unknown>[]> {
    const res = await apiFetch(`${API_BASE}/v1/pipeline/estimates/${encodeURIComponent(estimateId)}/line-rollups`);
    const payload = await handleResponse<{ data: Record<string, unknown>[] }>(res);
    return readDataArray(payload);
  },

  async getV1PipelineEstimateReadiness(estimateId: string): Promise<Record<string, unknown> | null> {
    const res = await apiFetch(`${API_BASE}/v1/pipeline/estimates/${encodeURIComponent(estimateId)}/readiness`);
    const payload = await handleResponse<{ data: Record<string, unknown> | null }>(res);
    return payload.data ?? null;
  },

  async getV1PipelineEstimateLinesCustomer(estimateId: string): Promise<Record<string, unknown>[]> {
    const res = await apiFetch(`${API_BASE}/v1/pipeline/estimates/${encodeURIComponent(estimateId)}/lines-customer`);
    const payload = await handleResponse<{ data: Record<string, unknown>[] }>(res);
    return readDataArray(payload);
  },

  async getV1PipelineCatalogSearch(q: string): Promise<Record<string, unknown>[]> {
    const params = new URLSearchParams({ q });
    const res = await apiFetch(`${API_BASE}/v1/pipeline/catalog-search?${params.toString()}`);
    const payload = await handleResponse<{ data: Record<string, unknown>[] }>(res);
    return readDataArray(payload);
  },
};
