import type { ProjectFileRecord } from '../../shared/types/estimator.ts';
import { PROJECT_FILES_SHEET_HEADERS } from '../../shared/sheets/estimatorWorkbookHeaders.ts';
import {
  ensureGoogleSheetTab,
  readRowsWithLegacyTab,
  updateRowById,
  upsertRowById,
  type SheetsRow,
} from '../integrations/googleSheets.ts';
import { vendorIntakeTabProjectFiles } from '../config/div10SheetsWorkbooks.ts';
import { assertSheetsWorkbookId, getVendorIntakeSpreadsheetIdForWorkspace } from './dataBackend.ts';

const LEGACY_PROJECT_FILES_TAB = 'QuoteFiles';

const FILE_ID_COLUMN = 'FileID';
const STATUS_ACTIVE = 'active';
const STATUS_DELETED = 'deleted';

export type SheetsProjectFileStoredRow = ProjectFileRecord & {
  gcsBucket: string;
  gcsObject: string;
  storageProvider: string;
  sourceQuoteId: string | null;
};

type SheetsIo = {
  readRowsWithLegacyTab: typeof readRowsWithLegacyTab;
  ensureGoogleSheetTab: typeof ensureGoogleSheetTab;
  upsertRowById: typeof upsertRowById;
  updateRowById: typeof updateRowById;
};

let sheetsIo: SheetsIo = {
  readRowsWithLegacyTab,
  ensureGoogleSheetTab,
  upsertRowById,
  updateRowById,
};

/** Test hook: inject in-memory or stubbed Sheets I/O. */
export function __setSheetsProjectFilesIoForTests(io: SheetsIo | null): void {
  sheetsIo = io ?? { readRowsWithLegacyTab, ensureGoogleSheetTab, upsertRowById, updateRowById };
}

function projectFilesTab(): string {
  return vendorIntakeTabProjectFiles();
}

function vendorIntakeWorkbookId(): string {
  return assertSheetsWorkbookId(getVendorIntakeSpreadsheetIdForWorkspace(), 'VENDOR_INTAKE_BACKEND_SPREADSHEET_ID');
}

function toNumber(value: string | undefined, defaultValue = 0): number {
  const n = Number(String(value || '').trim());
  return Number.isFinite(n) ? n : defaultValue;
}

function rowStatus(row: Record<string, string>): string {
  return String(row.Status || '').trim().toLowerCase();
}

function isActiveRow(row: Record<string, string>): boolean {
  const status = rowStatus(row);
  if (status === STATUS_DELETED || status === 'deleted') return false;
  if (String(row.DeletedAt || '').trim()) return false;
  return true;
}

export function mapProjectFileFromSheetRow(row: Record<string, string>): ProjectFileRecord | null {
  const id = String(row.FileID || '').trim();
  if (!id || !isActiveRow(row)) return null;
  const uploadedAt = String(row.UploadedAt || row.CreatedAt || '').trim();
  return {
    id,
    projectId: String(row.ProjectID || '').trim(),
    fileName: String(row.Filename || row.FileName || '').trim(),
    mimeType: String(row.MimeType || 'application/octet-stream').trim() || 'application/octet-stream',
    sizeBytes: toNumber(row.SizeBytes, 0),
    createdAt: uploadedAt || new Date().toISOString(),
  };
}

export function mapStoredProjectFileFromSheetRow(row: Record<string, string>): SheetsProjectFileStoredRow | null {
  const base = mapProjectFileFromSheetRow(row);
  if (!base) return null;
  return {
    ...base,
    gcsBucket: String(row.GcsBucket || '').trim(),
    gcsObject: String(row.GcsObject || '').trim(),
    storageProvider: String(row.StorageProvider || 'gcs').trim() || 'gcs',
    sourceQuoteId: String(row.SourceQuoteID || '').trim() || null,
  };
}

export function buildProjectFileSheetRow(input: {
  record: ProjectFileRecord;
  bucket: string;
  objectName: string;
  sourceQuoteId?: string | null;
  uploadedBy?: string | null;
  fileType?: string | null;
  notes?: string | null;
}): SheetsRow {
  return {
    FileID: input.record.id,
    ProjectID: input.record.projectId,
    SourceQuoteID: input.sourceQuoteId || '',
    Filename: input.record.fileName,
    MimeType: input.record.mimeType,
    SizeBytes: input.record.sizeBytes,
    StorageProvider: 'gcs',
    GcsBucket: input.bucket,
    GcsObject: input.objectName,
    UploadedAt: input.record.createdAt,
    UploadedBy: input.uploadedBy || '',
    FileType: input.fileType || '',
    Notes: input.notes || '',
    Status: STATUS_ACTIVE,
    DeletedAt: '',
  };
}

async function ensureProjectFilesTabReady(): Promise<void> {
  await sheetsIo.ensureGoogleSheetTab(projectFilesTab(), [...PROJECT_FILES_SHEET_HEADERS], vendorIntakeWorkbookId());
}

async function readAllProjectFileRows(): Promise<Array<Record<string, string>>> {
  return sheetsIo.readRowsWithLegacyTab(projectFilesTab(), LEGACY_PROJECT_FILES_TAB, vendorIntakeWorkbookId());
}

export async function listProjectFilesFromSheets(projectId: string): Promise<ProjectFileRecord[]> {
  const rows = await readAllProjectFileRows();
  return rows
    .map((row) => mapProjectFileFromSheetRow(row))
    .filter((row): row is ProjectFileRecord => row !== null && row.projectId === projectId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getProjectFileFromSheets(
  projectId: string,
  fileId: string
): Promise<SheetsProjectFileStoredRow | null> {
  const rows = await readAllProjectFileRows();
  for (const row of rows) {
    if (String(row.FileID || '').trim() !== fileId) continue;
    const stored = mapStoredProjectFileFromSheetRow(row);
    if (!stored || stored.projectId !== projectId) return null;
    return stored;
  }
  return null;
}

export async function upsertProjectFileMetadataInSheets(input: {
  record: ProjectFileRecord;
  bucket: string;
  objectName: string;
  sourceQuoteId?: string | null;
  uploadedBy?: string | null;
  fileType?: string | null;
  notes?: string | null;
}): Promise<ProjectFileRecord> {
  await ensureProjectFilesTabReady();
  const sheetRow = buildProjectFileSheetRow(input);
  await sheetsIo.upsertRowById(projectFilesTab(), FILE_ID_COLUMN, sheetRow, vendorIntakeWorkbookId());
  return input.record;
}

export async function softDeleteProjectFileInSheets(projectId: string, fileId: string): Promise<boolean> {
  const existing = await getProjectFileFromSheets(projectId, fileId);
  if (!existing) return false;
  const updated = await sheetsIo.updateRowById(
    projectFilesTab(),
    FILE_ID_COLUMN,
    fileId,
    { Status: STATUS_DELETED, DeletedAt: new Date().toISOString() },
    vendorIntakeWorkbookId()
  );
  return updated;
}

export async function listGcsBackedProjectFilesFromSheets(projectId: string): Promise<
  Array<{ gcsBucket: string; gcsObject: string }>
> {
  const rows = await readAllProjectFileRows();
  return rows
    .filter((row) => String(row.ProjectID || '').trim() === projectId && isActiveRow(row))
    .map((row) => ({
      gcsBucket: String(row.GcsBucket || '').trim(),
      gcsObject: String(row.GcsObject || '').trim(),
    }))
    .filter((r) => r.gcsBucket && r.gcsObject);
}
