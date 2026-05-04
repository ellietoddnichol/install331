/**
 * Non-secret integration readiness flags for Settings / diagnostics.
 * Never include API keys or tokens in responses.
 */
export type IntegrationHealthSnapshot = {
  dbDriver: string;
  gemini: boolean;
  googleSheets: boolean;
  supabaseAnon: boolean;
  supabaseServiceRole: boolean;
  pdfProvider: string;
  googleDocumentAi: boolean;
  passwordLogin: boolean;
  authRequired: boolean;
  div10BrainAdmin: boolean;
};

export function getIntegrationHealthSnapshot(): IntegrationHealthSnapshot {
  const sheets =
    Boolean(String(process.env.GOOGLE_SERVICE_ACCOUNT || '').trim()) ||
    Boolean(String(process.env.GOOGLE_SERVICE_ACCOUNT_FILE || '').trim()) ||
    Boolean(String(process.env.GOOGLE_APPLICATION_CREDENTIALS || '').trim());
  return {
    dbDriver: String(process.env.DB_DRIVER || 'sqlite').trim() || 'sqlite',
    gemini: Boolean(
      String(process.env.GEMINI_API_KEY || '').trim() || String(process.env.GOOGLE_GEMINI_API_KEY || '').trim()
    ),
    googleSheets: sheets,
    supabaseAnon: Boolean(String(process.env.SUPABASE_URL || '').trim() && String(process.env.SUPABASE_ANON_KEY || '').trim()),
    supabaseServiceRole: Boolean(String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()),
    pdfProvider: String(process.env.UPLOAD_PDF_PROVIDER || 'fallback-text').trim() || 'fallback-text',
    googleDocumentAi: Boolean(
      String(process.env.GOOGLE_CLOUD_PROJECT_ID || '').trim() && String(process.env.DOCUMENT_AI_PROCESSOR_ID || '').trim()
    ),
    passwordLogin: Boolean(String(process.env.AUTH_LOGIN_PASSWORD || '').trim()),
    authRequired: ['1', 'true', 'yes'].includes(String(process.env.AUTH_REQUIRED || '').trim().toLowerCase()),
    div10BrainAdmin: Boolean(String(process.env.DIV10_BRAIN_ADMIN_SECRET || '').trim()),
  };
}
