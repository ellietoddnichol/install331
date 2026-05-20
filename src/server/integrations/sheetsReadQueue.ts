import type { sheets_v4 } from 'googleapis';
import { getGaxiosLikeHttpStatus } from '../http/jsonErrors.ts';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isGoogleSheetsRateLimitedError(err: unknown): boolean {
  return getGaxiosLikeHttpStatus(err) === 429;
}

/** Minimum delay between Sheets read API calls to reduce 429 bursts (0 = off). */
export function sheetsReadMinIntervalMs(): number {
  const raw = String(process.env.GOOGLE_SHEETS_READ_MIN_INTERVAL_MS ?? '1100').trim();
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : 1100;
}

let lastSheetsValuesReadAt = 0;
/** Serial tail so concurrent reads wait in line and respect min spacing (reduces 429 bursts). */
let sheetsReadTail: Promise<unknown> = Promise.resolve();

/** Queue Sheets values/metadata reads so bursts stay under ~60 reads/min per GCP project. */
export async function runSheetsValuesRead<T>(op: () => Promise<T>): Promise<T> {
  const run = sheetsReadTail.then(async () => {
    const minGap = sheetsReadMinIntervalMs();
    if (minGap > 0) {
      const now = Date.now();
      const wait = Math.max(0, minGap - (now - lastSheetsValuesReadAt));
      if (wait > 0) await sleep(wait);
    }
    lastSheetsValuesReadAt = Date.now();
    return op();
  });
  sheetsReadTail = run.then(
    () => undefined,
    () => undefined,
  );
  return run as Promise<T>;
}

export async function spreadsheetsValuesGetWithRetry(params: {
  sheets: sheets_v4.Sheets;
  spreadsheetId: string;
  range: string;
  logLabel?: string;
}): Promise<string[][]> {
  const { sheets, spreadsheetId, range, logLabel = range } = params;
  const maxAttempts = 5;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const response = await runSheetsValuesRead(() =>
        sheets.spreadsheets.values.get({
          spreadsheetId,
          range,
        }),
      );
      return (response.data.values as string[][]) || [];
    } catch (err) {
      if (isGoogleSheetsRateLimitedError(err) && attempt < maxAttempts - 1) {
        const backoffMs = 2500 * 2 ** attempt + Math.floor(Math.random() * 400);
        console.warn(
          `[googleSheets] read rate limited (429), backing off ${backoffMs}ms (attempt ${attempt + 1}/${maxAttempts}) label=${logLabel}`,
        );
        await sleep(backoffMs);
        continue;
      }
      throw err;
    }
  }

  throw new Error(`spreadsheetsValuesGetWithRetry: exhausted retries for ${logLabel}`);
}
