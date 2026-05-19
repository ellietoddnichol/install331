import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { __setGcsProjectFilesIoForTests } from '../services/gcsProjectFilesStorage.ts';
import {
  __setSheetsProjectFilesIoForTests,
  buildProjectFileSheetRow,
  mapProjectFileFromSheetRow,
} from './sheetsProjectFilesRepo.ts';

function withEnv(patch: Record<string, string | undefined>, fn: () => Promise<void>): Promise<void> {
  const saved: Record<string, string | undefined> = {};
  for (const key of Object.keys(patch)) {
    saved[key] = process.env[key];
    const value = patch[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  return fn().finally(() => {
    for (const key of Object.keys(saved)) {
      const value = saved[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
}

test('mapProjectFileFromSheetRow ignores deleted rows and maps active metadata', () => {
  const active = mapProjectFileFromSheetRow({
    FileID: 'f1',
    ProjectID: 'p1',
    Filename: 'quote.pdf',
    MimeType: 'application/pdf',
    SizeBytes: '1200',
    UploadedAt: '2026-05-19T12:00:00.000Z',
    Status: 'active',
  });
  assert.ok(active);
  assert.equal(active?.id, 'f1');
  assert.equal(active?.fileName, 'quote.pdf');

  const deleted = mapProjectFileFromSheetRow({
    FileID: 'f2',
    ProjectID: 'p1',
    Filename: 'gone.pdf',
    Status: 'deleted',
    DeletedAt: '2026-05-19T13:00:00.000Z',
  });
  assert.equal(deleted, null);
});

test('buildProjectFileSheetRow includes GCS fields for vendor intake tab', () => {
  const row = buildProjectFileSheetRow({
    record: {
      id: 'file-1',
      projectId: 'proj-1',
      fileName: 'bobrick.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 4096,
      createdAt: '2026-05-19T12:00:00.000Z',
    },
    bucket: 'brightenlabor518',
    objectName: 'project-files/proj-1/file-1/bobrick.pdf',
  });
  assert.equal(row.FileID, 'file-1');
  assert.equal(row.GcsBucket, 'brightenlabor518');
  assert.equal(row.StorageProvider, 'gcs');
  assert.equal(row.Status, 'active');
});

test('Sheets-first createProjectFile writes metadata to Sheets and not SQLite project_files_v1', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'install331-pf-sheets-'));
  const sheetRows: Array<Record<string, string>> = [];
  let gcsUploaded = false;
  let gcsDeleted = false;

  __setSheetsProjectFilesIoForTests({
    readRowsWithLegacyTab: async () => sheetRows,
    ensureGoogleSheetTab: async () => undefined,
    upsertRowById: async (_tab, _idCol, row) => {
      const id = String(row.FileID || '');
      const idx = sheetRows.findIndex((r) => String(r.FileID) === id);
      const normalized: Record<string, string> = {};
      for (const [k, v] of Object.entries(row)) normalized[k] = String(v ?? '');
      if (idx >= 0) sheetRows[idx] = normalized;
      else sheetRows.push(normalized);
      return idx >= 0 ? 'updated' : 'inserted';
    },
    updateRowById: async (_tab, idCol, idValue, patch) => {
      const idx = sheetRows.findIndex((r) => String(r[idCol]) === idValue);
      if (idx < 0) return false;
      sheetRows[idx] = { ...sheetRows[idx], ...Object.fromEntries(Object.entries(patch).map(([k, v]) => [k, String(v ?? '')])) };
      return true;
    },
  });

  await withEnv(
    {
      DATABASE_PATH: path.join(tmpDir, 'pf-sheets.test.db'),
      DATA_BACKEND: 'sheets',
      PROJECT_FILES_STORAGE: 'gcs',
      GCS_PROJECT_FILES_BUCKET: 'brightenlabor518',
      GOOGLE_SERVICE_ACCOUNT_EMAIL: 'test@example.com',
      GOOGLE_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----\nTEST\n-----END PRIVATE KEY-----\n',
      VENDOR_INTAKE_BACKEND_SPREADSHEET_ID: 'vendor-sheet-id',
    },
    async () => {
      __setGcsProjectFilesIoForTests({
        upload: async () => {
          gcsUploaded = true;
        },
        download: async () => Buffer.from('hello'),
        delete: async () => {
          gcsDeleted = true;
        },
      });

      try {
        const { getEstimatorDb } = await import('../db/connection.ts');
        getEstimatorDb();

        const { createProjectFile, getProjectFile, deleteProjectFile, useSheetsForProjectFileMetadata } = await import(
          './projectFilesRepo.ts'
        );
        assert.equal(useSheetsForProjectFileMetadata(), true);

        const created = await createProjectFile({
          projectId: 'sheets-proj-1',
          fileName: 'smoke-quote.txt',
          mimeType: 'text/plain',
          sizeBytes: 5,
          dataBase64: Buffer.from('hello').toString('base64'),
        });
        assert.ok(gcsUploaded);
        assert.equal(sheetRows.length, 1);
        assert.equal(sheetRows[0]?.FileID, created.id);
        assert.equal(sheetRows[0]?.GcsBucket, 'brightenlabor518');

        const { dbAll } = await import('../db/query.ts');
        const sqliteRows = await dbAll('SELECT id FROM project_files_v1 WHERE project_id = ?', ['sheets-proj-1']);
        assert.equal(sqliteRows.length, 0);

        const downloaded = await getProjectFile('sheets-proj-1', created.id);
        assert.ok(downloaded);
        assert.equal(downloaded?.dataBase64, Buffer.from('hello').toString('base64'));

        const removed = await deleteProjectFile('sheets-proj-1', created.id);
        assert.equal(removed, true);
        assert.equal(sheetRows[0]?.Status, 'deleted');
        assert.equal(gcsDeleted, true);
      } finally {
        __setGcsProjectFilesIoForTests(null);
        __setSheetsProjectFilesIoForTests(null);
      }
    }
  );
});

test('Sheets-first createProjectFile cleans up GCS object when metadata write fails', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'install331-pf-sheets-cleanup-'));
  let gcsUploaded = false;
  let gcsDeleted = false;

  __setSheetsProjectFilesIoForTests({
    readRowsWithLegacyTab: async () => [],
    ensureGoogleSheetTab: async () => undefined,
    upsertRowById: async () => {
      throw new Error('Sheets metadata write failed');
    },
    updateRowById: async () => false,
  });

  await withEnv(
    {
      DATABASE_PATH: path.join(tmpDir, 'pf-sheets-cleanup.test.db'),
      DATA_BACKEND: 'sheets',
      PROJECT_FILES_STORAGE: 'gcs',
      GCS_PROJECT_FILES_BUCKET: 'brightenlabor518',
      GOOGLE_SERVICE_ACCOUNT_EMAIL: 'test@example.com',
      GOOGLE_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----\nTEST\n-----END PRIVATE KEY-----\n',
      VENDOR_INTAKE_BACKEND_SPREADSHEET_ID: 'vendor-sheet-id',
    },
    async () => {
      __setGcsProjectFilesIoForTests({
        upload: async () => {
          gcsUploaded = true;
        },
        download: async () => Buffer.alloc(0),
        delete: async () => {
          gcsDeleted = true;
        },
      });

      try {
        const { getEstimatorDb } = await import('../db/connection.ts');
        getEstimatorDb();
        const { createProjectFile } = await import('./projectFilesRepo.ts');

        await assert.rejects(
          () =>
            createProjectFile({
              projectId: 'sheets-proj-2',
              fileName: 'fail.txt',
              mimeType: 'text/plain',
              sizeBytes: 4,
              dataBase64: Buffer.from('fail').toString('base64'),
            }),
          /Sheets metadata write failed/
        );
        assert.equal(gcsUploaded, true);
        assert.equal(gcsDeleted, true);
      } finally {
        __setGcsProjectFilesIoForTests(null);
        __setSheetsProjectFilesIoForTests(null);
      }
    }
  );
});

test('DB-backed GCS createProjectFile still inserts SQLite metadata row', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'install331-pf-db-gcs-'));
  let gcsUploaded = false;

  await withEnv(
    {
      DATABASE_PATH: path.join(tmpDir, 'pf-db-gcs.test.db'),
      DATA_BACKEND: 'db',
      DB_DRIVER: 'sqlite',
      PROJECT_FILES_STORAGE: 'gcs',
      GCS_PROJECT_FILES_BUCKET: 'brightenlabor518',
      GOOGLE_SERVICE_ACCOUNT_EMAIL: 'test@example.com',
      GOOGLE_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----\nTEST\n-----END PRIVATE KEY-----\n',
    },
    async () => {
      __setGcsProjectFilesIoForTests({
        upload: async () => {
          gcsUploaded = true;
        },
        download: async () => Buffer.from('db!'),
        delete: async () => undefined,
      });

      try {
        const { getEstimatorDb } = await import('../db/connection.ts');
        getEstimatorDb();
        const { dbRun } = await import('../db/query.ts');
        const now = new Date().toISOString();
        await dbRun(
          `INSERT INTO projects_v1 (id, project_name, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
          ['db-proj-1', 'DB Project', 'Draft', now, now]
        );
        const { createProjectFile, useSheetsForProjectFileMetadata } = await import('./projectFilesRepo.ts');
        assert.equal(useSheetsForProjectFileMetadata(), false);

        const created = await createProjectFile({
          projectId: 'db-proj-1',
          fileName: 'db.txt',
          mimeType: 'text/plain',
          sizeBytes: 3,
          dataBase64: Buffer.from('db!').toString('base64'),
        });
        assert.ok(gcsUploaded);

        const { dbGet } = await import('../db/query.ts');
        const row = (await dbGet('SELECT id, gcs_bucket, gcs_object FROM project_files_v1 WHERE id = ?', [
          created.id,
        ])) as { id: string; gcs_bucket: string; gcs_object: string } | undefined;
        assert.ok(row);
        assert.equal(row?.gcs_bucket, 'brightenlabor518');
        assert.ok(String(row?.gcs_object || '').includes('db-proj-1'));
      } finally {
        __setGcsProjectFilesIoForTests(null);
      }
    }
  );
});

