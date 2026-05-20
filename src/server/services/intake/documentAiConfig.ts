/**
 * Google Document AI (processDocument) — matches Cloud sample:
 *   project_id, location, processor_id, file bytes, mime_type
 */

export type DocumentAiProcessorRef = {
  projectId: string;
  location: string;
  processorId: string;
  processorName: string;
};

const PROVIDER_ALIASES = new Set(['google-document-ai', 'document-ai', 'documentai']);

export function documentAiLocation(): string {
  return String(process.env.DOCUMENT_AI_LOCATION || 'us').trim() || 'us';
}

export function documentAiProjectId(): string {
  return (
    String(process.env.DOCUMENT_AI_PROJECT_ID || '').trim() ||
    String(process.env.GOOGLE_CLOUD_PROJECT_ID || '').trim() ||
    String(process.env.GOOGLE_CLOUD_PROJECT || '').trim() ||
    String(process.env.GCLOUD_PROJECT || '').trim()
  );
}

export function documentAiProcessorId(): string {
  return String(process.env.DOCUMENT_AI_PROCESSOR_ID || '').trim();
}

export function isDocumentAiConfigured(): boolean {
  return Boolean(documentAiProjectId() && documentAiProcessorId());
}

/** Effective PDF provider: explicit env, or auto Document AI when processor + project are set. */
export function resolveUploadPdfProvider(): 'fallback-text' | 'google-document-ai' {
  const explicit = String(process.env.UPLOAD_PDF_PROVIDER || '').trim().toLowerCase();
  if (explicit === 'fallback-text' || explicit === 'off' || explicit === 'false' || explicit === 'none') {
    return 'fallback-text';
  }
  if (PROVIDER_ALIASES.has(explicit)) return 'google-document-ai';
  if (isDocumentAiConfigured()) return 'google-document-ai';
  return 'fallback-text';
}

export function resolveDocumentAiProcessorName(): DocumentAiProcessorRef {
  const projectId = documentAiProjectId();
  const processorId = documentAiProcessorId();
  const location = documentAiLocation();

  if (!projectId || !processorId) {
    throw new Error(
      'Document AI requires GOOGLE_CLOUD_PROJECT_ID (or DOCUMENT_AI_PROJECT_ID) and DOCUMENT_AI_PROCESSOR_ID.',
    );
  }

  const processorName = processorId.includes('/processors/')
    ? processorId
    : `projects/${projectId}/locations/${location}/processors/${processorId}`;

  return { projectId, location, processorId, processorName };
}

export function resolveDocumentMimeType(fileName: string, mimeType?: string): string {
  const mime = String(mimeType || '').trim().toLowerCase();
  if (mime) return mime;
  const lower = String(fileName || '').toLowerCase();
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.docx')) {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  }
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.tiff') || lower.endsWith('.tif')) return 'image/tiff';
  return 'application/pdf';
}
