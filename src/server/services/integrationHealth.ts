import { resolveCatalogBackendSetting } from '../db/catalogBackend.ts';
import { getPublicSupabaseClientConfig } from '../publicSupabaseConfig.ts';

/**
 * Non-secret integration readiness flags for Settings / diagnostics.
 * Never include API keys or tokens in responses.
 */
export type IntegrationHealthSnapshot = {
  dbDriver: string;
  databaseUrl: boolean;
  catalogBackend: string;
  catalogAutoSyncOnStart: boolean;
  googleSheetsSpreadsheetId: boolean;
  gemini: boolean;
  googleSheets: boolean;
  supabaseAnon: boolean;
  supabaseServiceRole: boolean;
  publicSupabaseClient: boolean;
  supabaseStorageBucket: boolean;
  pdfProvider: string;
  googleDocumentAi: boolean;
  defaultLaborRatePerHour: number;
  passwordLogin: boolean;
  authRequired: boolean;
  div10BrainAdmin: boolean;
};

function readDefaultLaborRatePerHour(): number {
  const raw = parseFloat(String(process.env.DEFAULT_LABOR_RATE_PER_HOUR || 100).trim());
  return Number.isFinite(raw) && raw > 0 ? raw : 100;
}

/**
 * Mirrors server startup behavior.
 * Defaults to enabled in production/Cloud Run unless AUTO_SYNC_CATALOG_ON_START explicitly disables it.
 */
function shouldAutoSyncCatalogOnStart(): boolean {
  const raw = String(process.env.AUTO_SYNC_CATALOG_ON_START ?? '').trim().toLowerCase();
  if (raw === '0' || raw === 'false' || raw === 'no' || raw === 'off') return false;
  if (raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on') return true;
  return process.env.NODE_ENV === 'production' || Boolean(process.env.K_SERVICE || process.env.K_REVISION);
}

export function getIntegrationHealthSnapshot(): IntegrationHealthSnapshot {
  const sheets =
    Boolean(String(process.env.GOOGLE_SERVICE_ACCOUNT || '').trim()) ||
    Boolean(String(process.env.GOOGLE_SERVICE_ACCOUNT_FILE || '').trim()) ||
    Boolean(String(process.env.GOOGLE_APPLICATION_CREDENTIALS || '').trim());
  const spreadsheetId = Boolean(
    String(process.env.GOOGLE_SHEETS_SPREADSHEET_ID || process.env.GOOGLE_SHEETS_ID || '').trim()
  );
  const publicSupabaseClient = Boolean(getPublicSupabaseClientConfig());
  return {
    dbDriver: String(process.env.DB_DRIVER || 'sqlite').trim() || 'sqlite',
    databaseUrl: Boolean(String(process.env.DATABASE_URL || process.env.DIRECT_URL || '').trim()),
    catalogBackend: String(resolveCatalogBackendSetting()),
    catalogAutoSyncOnStart: shouldAutoSyncCatalogOnStart(),
    googleSheetsSpreadsheetId: spreadsheetId,
    gemini: Boolean(
      String(process.env.GEMINI_API_KEY || '').trim() || String(process.env.GOOGLE_GEMINI_API_KEY || '').trim()
    ),
    googleSheets: sheets,
    supabaseAnon: Boolean(
      String(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim() &&
        String(
          process.env.SUPABASE_ANON_KEY ||
            process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
            ''
        ).trim()
    ),
    supabaseServiceRole: Boolean(String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()),
    publicSupabaseClient,
    supabaseStorageBucket: Boolean(String(process.env.SUPABASE_STORAGE_BUCKET || '').trim()),
    pdfProvider: String(process.env.UPLOAD_PDF_PROVIDER || 'fallback-text').trim() || 'fallback-text',
    googleDocumentAi: Boolean(
      String(process.env.GOOGLE_CLOUD_PROJECT_ID || '').trim() && String(process.env.DOCUMENT_AI_PROCESSOR_ID || '').trim()
    ),
    defaultLaborRatePerHour: readDefaultLaborRatePerHour(),
    passwordLogin: Boolean(String(process.env.AUTH_LOGIN_PASSWORD || '').trim()),
    authRequired: ['1', 'true', 'yes'].includes(String(process.env.AUTH_REQUIRED || '').trim().toLowerCase()),
    div10BrainAdmin: Boolean(String(process.env.DIV10_BRAIN_ADMIN_SECRET || '').trim()),
  };
}
