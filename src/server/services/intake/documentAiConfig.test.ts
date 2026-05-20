import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isDocumentAiConfigured,
  resolveDocumentAiProcessorName,
  resolveUploadPdfProvider,
} from './documentAiConfig.ts';

test('resolveDocumentAiProcessorName builds us processor resource path', () => {
  const snap = {
    GOOGLE_CLOUD_PROJECT_ID: process.env.GOOGLE_CLOUD_PROJECT_ID,
    DOCUMENT_AI_PROCESSOR_ID: process.env.DOCUMENT_AI_PROCESSOR_ID,
    DOCUMENT_AI_LOCATION: process.env.DOCUMENT_AI_LOCATION,
  };
  try {
    process.env.GOOGLE_CLOUD_PROJECT_ID = 'gen-lang-client-0568373820';
    process.env.DOCUMENT_AI_PROCESSOR_ID = '7d47225afa5fabe8';
    process.env.DOCUMENT_AI_LOCATION = 'us';
    const ref = resolveDocumentAiProcessorName();
    assert.equal(ref.processorName, 'projects/gen-lang-client-0568373820/locations/us/processors/7d47225afa5fabe8');
  } finally {
    for (const [k, v] of Object.entries(snap)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
});

test('resolveUploadPdfProvider auto-enables Document AI when processor env is set', () => {
  const snap = { UPLOAD_PDF_PROVIDER: process.env.UPLOAD_PDF_PROVIDER, DOCUMENT_AI_PROCESSOR_ID: process.env.DOCUMENT_AI_PROCESSOR_ID, GOOGLE_CLOUD_PROJECT_ID: process.env.GOOGLE_CLOUD_PROJECT_ID };
  try {
    delete process.env.UPLOAD_PDF_PROVIDER;
    process.env.GOOGLE_CLOUD_PROJECT_ID = 'gen-lang-client-0568373820';
    process.env.DOCUMENT_AI_PROCESSOR_ID = '7d47225afa5fabe8';
    assert.equal(resolveUploadPdfProvider(), 'google-document-ai');
    assert.equal(isDocumentAiConfigured(), true);
  } finally {
    for (const [k, v] of Object.entries(snap)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
});
