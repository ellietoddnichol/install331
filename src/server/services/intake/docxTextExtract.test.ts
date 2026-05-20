import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { extractDocxTextFromBuffer } from './docxTextExtract.ts';

test('extractDocxTextFromBuffer reads word/document.xml text nodes', async () => {
  const zip = new JSZip();
  zip.file(
    'word/document.xml',
    '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
      '<w:body><w:p><w:r><w:t>Vendor quote line</w:t></w:r></w:p>' +
      '<w:p><w:r><w:t>Qty 12 EA</w:t></w:r></w:p></w:body></w:document>',
  );
  const buffer = await zip.generateAsync({ type: 'nodebuffer' });
  const text = await extractDocxTextFromBuffer(buffer);
  assert.match(text, /Vendor quote line/);
  assert.match(text, /Qty 12 EA/);
});
