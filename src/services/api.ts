
import { CatalogAliasType, CatalogAttributeType, CatalogDeltaType, CatalogItem, CatalogItemAlias, CatalogItemAttribute } from '../types';
import { BundleRecord, CatalogPostCutoverHealthRecord, CatalogSyncStatusRecord, DbPersistenceStatusRecord, EstimateSummary, InstallReviewEmailDraft, ModifierRecord, PeerIntakeDefaultsResponse, ProjectFileRecord, ProjectRecord, RoomRecord, SettingsRecord, TakeoffLineRecord } from '../shared/types/estimator';
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
      errorMessage = errorData.error || errorData.message || errorMessage;
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

export const api = {
  async getV1Projects(): Promise<ProjectRecord[]> {
    const res = await apiFetch(`${API_BASE}/v1/projects`);
    const payload = await handleResponse<{ data: ProjectRecord[] }>(res);
    return payload.data;
  },
  async getV1Project(id: string): Promise<ProjectRecord> {
    const res = await apiFetch(`${API_BASE}/v1/projects/${id}`);
    const payload = await handleResponse<{ data: ProjectRecord }>(res);
    return payload.data;
  },
  async createV1Project(project: Partial<ProjectRecord>): Promise<ProjectRecord> {
    const res = await apiFetch(`${API_BASE}/v1/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(project),
    });
    const payload = await handleResponse<{ data: ProjectRecord }>(res);
    return payload.data;
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
    return payload.data;
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
    return payload.data;
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
    return payload.data;
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
    return payload.data;
  },
  async createV1Room(input: { projectId: string; roomName: string; notes?: string }): Promise<RoomRecord> {
    const res = await apiFetch(`${API_BASE}/v1/rooms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    const payload = await handleResponse<{ data: RoomRecord }>(res);
    return payload.data;
  },
  async updateV1Room(roomId: string, input: Partial<RoomRecord>): Promise<RoomRecord> {
    const res = await apiFetch(`${API_BASE}/v1/rooms/${roomId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    const payload = await handleResponse<{ data: RoomRecord }>(res);
    return payload.data;
  },
  async duplicateV1Room(roomId: string): Promise<RoomRecord> {
    const res = await apiFetch(`${API_BASE}/v1/rooms/${roomId}/duplicate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    const payload = await handleResponse<{ data: RoomRecord }>(res);
    return payload.data;
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
    return payload.data;
  },
  async createV1TakeoffLine(input: Partial<TakeoffLineRecord> & { projectId: string; roomId: string; description: string }): Promise<TakeoffLineRecord> {
    const res = await apiFetch(`${API_BASE}/v1/takeoff/lines`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    const payload = await handleResponse<{ data: TakeoffLineRecord }>(res);
    return payload.data;
  },
  async updateV1TakeoffLine(lineId: string, input: Partial<TakeoffLineRecord>): Promise<TakeoffLineRecord> {
    const res = await apiFetch(`${API_BASE}/v1/takeoff/lines/${lineId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    const payload = await handleResponse<{ data: TakeoffLineRecord }>(res);
    return payload.data;
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
    return payload.data;
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
    return payload.data;
  },
  async finalizeV1ParserLines(lines: Array<Partial<TakeoffLineRecord>>): Promise<TakeoffLineRecord[]> {
    const res = await apiFetch(`${API_BASE}/v1/takeoff/finalize-parser-lines`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lines }),
    });
    const payload = await handleResponse<{ data: TakeoffLineRecord[] }>(res);
    return payload.data;
  },
  async getV1Modifiers(): Promise<ModifierRecord[]> {
    const res = await apiFetch(`${API_BASE}/v1/modifiers`);
    const payload = await handleResponse<{ data: ModifierRecord[] }>(res);
    return payload.data;
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
    return payload.data;
  },
  async applyV1ModifierToLine(lineId: string, modifierId: string): Promise<{ line: TakeoffLineRecord; modifier: any }> {
    const res = await apiFetch(`${API_BASE}/v1/modifiers/line/${lineId}/apply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ modifierId }),
    });
    const payload = await handleResponse<{ data: { line: TakeoffLineRecord; modifier: any } }>(res);
    return payload.data;
  },
  async removeV1LineModifier(lineId: string, lineModifierId: string): Promise<{ line: TakeoffLineRecord; removed: boolean }> {
    const res = await apiFetch(`${API_BASE}/v1/modifiers/line/${lineId}/${lineModifierId}`, { method: 'DELETE' });
    const payload = await handleResponse<{ data: { line: TakeoffLineRecord; removed: boolean } }>(res);
    return payload.data;
  },
  async getV1Bundles(): Promise<BundleRecord[]> {
    const res = await apiFetch(`${API_BASE}/v1/bundles`);
    const payload = await handleResponse<{ data: BundleRecord[] }>(res);
    return payload.data;
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
    return payload.data;
  },
  async applyV1Bundle(bundleId: string, projectId: string, roomId: string): Promise<TakeoffLineRecord[]> {
    const res = await apiFetch(`${API_BASE}/v1/bundles/${bundleId}/apply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, roomId }),
    });
    const payload = await handleResponse<{ data: TakeoffLineRecord[] }>(res);
    return payload.data;
  },
  async getV1Settings(): Promise<SettingsRecord> {
    const res = await apiFetch(`${API_BASE}/v1/settings`);
    const payload = await handleResponse<{ data: SettingsRecord }>(res);
    return payload.data;
  },
  async updateV1Settings(input: Partial<SettingsRecord>): Promise<SettingsRecord> {
    const res = await apiFetch(`${API_BASE}/v1/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    const payload = await handleResponse<{ data: SettingsRecord }>(res);
    return payload.data;
  },
  async getCatalogSyncStatus(): Promise<CatalogSyncStatusRecord> {
    const res = await apiFetch(`${API_BASE}/v1/settings/catalog-sync-status`);
    const payload = await handleResponse<{ data: CatalogSyncStatusRecord }>(res);
    return payload.data;
  },
  async getV1CatalogPostCutoverHealth(): Promise<CatalogPostCutoverHealthRecord> {
    const res = await apiFetch(`${API_BASE}/v1/settings/catalog-post-cutover-health`);
    const payload = await handleResponse<{ data: CatalogPostCutoverHealthRecord }>(res);
    return payload.data;
  },
  async getCatalogSyncRuns(limit = 10): Promise<Array<{
    id: string;
    attemptedAt: string;
    status: 'success' | 'failed';
    message: string | null;
    itemsSynced: number;
    modifiersSynced: number;
    bundlesSynced: number;
    bundleItemsSynced: number;
    aliasesSynced: number;
    attributesSynced: number;
    warnings: string[];
  }>> {
    const res = await apiFetch(`${API_BASE}/v1/settings/catalog-sync-runs?limit=${encodeURIComponent(String(limit))}`);
    const payload = await handleResponse<{ data: Array<{
      id: string;
      attemptedAt: string;
      status: 'success' | 'failed';
      message: string | null;
      itemsSynced: number;
      modifiersSynced: number;
      bundlesSynced: number;
      bundleItemsSynced: number;
      aliasesSynced: number;
      attributesSynced: number;
      warnings: string[];
    }> }>(res);
    return payload.data;
  },
  async getV1PersistenceStatus(): Promise<DbPersistenceStatusRecord & { gcsObjectMeta?: any; remoteDurableKind?: 'supabase' | 'gcs' | null }> {
    const res = await apiFetch(`${API_BASE}/v1/settings/persistence-status`);
    const payload = await handleResponse<{ data: DbPersistenceStatusRecord & { gcsObjectMeta?: any; remoteDurableKind?: 'supabase' | 'gcs' | null } }>(res);
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
    tabs: { items: string; modifiers: string; bundles: string };
    itemsSynced: number;
    modifiersSynced: number;
    bundlesSynced: number;
    bundleItemsSynced: number;
    aliasesSynced: number;
    attributesSynced: number;
    warnings: string[];
    syncedAt: string;
  }> {
    const res = await apiFetch(`${API_BASE}/v1/settings/sync-catalog`, { method: 'POST' });
    const payload = await handleResponse<{ data: {
      message: string;
      spreadsheetId: string;
      tabs: { items: string; modifiers: string; bundles: string };
      itemsSynced: number;
      modifiersSynced: number;
      bundlesSynced: number;
      bundleItemsSynced: number;
      aliasesSynced: number;
      attributesSynced: number;
      warnings: string[];
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
  async getCatalog(options?: { includeInactive?: boolean }): Promise<CatalogItem[]> {
    const q =
      options?.includeInactive === true
        ? '?includeInactive=1'
        : '';
    const res = await apiFetch(`${API_BASE}/catalog/items${q}`);
    return handleResponse<CatalogItem[]>(res);
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
};
