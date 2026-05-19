import type { Div10LogicalWorkbookKey } from '../../../shared/sheets/div10LogicalWorkbooks.ts';
import { DIV10_LOGICAL_WORKBOOK_KEYS } from '../../../shared/sheets/div10LogicalWorkbooks.ts';
import {
  DIV10_VENDOR_INTAKE_VALIDATION_HEADER_ROWS,
  div10WorkbookTabValidationSpecs,
} from '../../../shared/sheets/div10WorkbookValidationSpecs.ts';
import { isSheetsDataBackend } from '../../repos/dataBackend.ts';
import {
  peekSpreadsheetIdForDiv10Workbook,
  primarySpreadsheetEnvVarForWorkbook,
  vendorIntakeTabParserProfiles,
  vendorIntakeTabProjectFiles,
  vendorIntakeTabQuoteAdjustments,
  vendorIntakeTabQuoteTerms,
  vendorIntakeTabSourceQuotes,
  vendorIntakeTabStagedQuoteRows,
  vendorIntakeTabVendorAliases,
} from '../../config/div10SheetsWorkbooks.ts';
import { buildGoogleServiceAccountJwt } from '../googleSheetsCatalogSync.ts';
import { fetchTabValues, findHeaderRowIndex, getSheetsClient } from './headerGridIo.ts';
import {
  collectMissingHeadersFromFirstRow,
  findMissingTabs,
  maskSpreadsheetId,
} from './div10SheetsValidationHelpers.ts';

export type Div10SheetsHealthTabResult = {
  tabName: string;
  ok: boolean;
  missingHeaders: string[];
};

export type Div10SheetsHealthWorkbookResult = {
  key: Div10LogicalWorkbookKey;
  spreadsheetIdMasked: string;
  ok: boolean;
  missingTabs: string[];
  tabs: Div10SheetsHealthTabResult[];
  error?: string;
};

export type Div10SheetsHealthResult = {
  dataBackend: string;
  sheetsBackendActive: boolean;
  message?: string;
  googleAuthConfigured: boolean;
  googleAuthError?: string;
  ok: boolean;
  workbooks: Div10SheetsHealthWorkbookResult[];
  missingEnvVars: string[];
  errors: string[];
};

function resolveVendorIntakeTabValidationRows(): { tabName: string; requiredHeaders: readonly string[] }[] {
  const tabNames = [
    vendorIntakeTabSourceQuotes(),
    vendorIntakeTabProjectFiles(),
    vendorIntakeTabStagedQuoteRows(),
    vendorIntakeTabQuoteAdjustments(),
    vendorIntakeTabQuoteTerms(),
    vendorIntakeTabParserProfiles(),
    vendorIntakeTabVendorAliases(),
  ];
  return DIV10_VENDOR_INTAKE_VALIDATION_HEADER_ROWS.map((row, i) => ({
    tabName: tabNames[i]!,
    requiredHeaders: row.requiredHeaders,
  }));
}

function resolveTabSpecsForWorkbook(key: Div10LogicalWorkbookKey): { tabName: string; requiredHeaders: readonly string[] }[] {
  if (key === 'vendorIntakeBackend') return resolveVendorIntakeTabValidationRows();
  const staticSpecs = div10WorkbookTabValidationSpecs(key);
  return staticSpecs ? [...staticSpecs] : [];
}

async function listSheetTitles(spreadsheetId: string): Promise<string[]> {
  const sheets = await getSheetsClient();
  const res = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: 'sheets.properties.title',
  });
  return (res.data.sheets || [])
    .map((s) => String(s.properties?.title || '').trim())
    .filter(Boolean);
}

function collectMissingSpreadsheetEnvVars(): string[] {
  const out: string[] = [];
  for (const key of DIV10_LOGICAL_WORKBOOK_KEYS) {
    if (!peekSpreadsheetIdForDiv10Workbook(key)) {
      if (key === 'catalogLaborBackend') {
        out.push(
          'CATALOG_LABOR_BACKEND_SPREADSHEET_ID (legacy: GOOGLE_CATALOG_SPREADSHEET_ID, GOOGLE_SHEETS_SPREADSHEET_ID, GOOGLE_SHEETS_ID)'
        );
      } else {
        out.push(primarySpreadsheetEnvVarForWorkbook(key));
      }
    }
  }
  return out;
}

async function validateOneWorkbook(params: {
  key: Div10LogicalWorkbookKey;
  spreadsheetId: string;
  errors: string[];
}): Promise<Div10SheetsHealthWorkbookResult> {
  const { key, spreadsheetId, errors } = params;
  const masked = maskSpreadsheetId(spreadsheetId);
  const tabSpecs = resolveTabSpecsForWorkbook(key);
  const expectedTabNames = tabSpecs.map((t) => t.tabName);

  let titles: string[] = [];
  try {
    titles = await listSheetTitles(spreadsheetId);
  } catch (err: unknown) {
    const detail = err instanceof Error ? err.message : String(err);
    errors.push(`[${key}] ${detail}`);
    return {
      key,
      spreadsheetIdMasked: masked,
      ok: false,
      missingTabs: [...expectedTabNames],
      tabs: expectedTabNames.map((tabName) => ({ tabName, ok: false, missingHeaders: [] as string[] })),
      error: `Spreadsheet not readable: ${detail}`,
    };
  }

  const missingTabs = findMissingTabs(expectedTabNames, titles);
  const tabs: Div10SheetsHealthTabResult[] = [];

  for (const spec of tabSpecs) {
    if (missingTabs.includes(spec.tabName)) {
      tabs.push({ tabName: spec.tabName, ok: false, missingHeaders: [] });
      continue;
    }
    let values: string[][];
    try {
      values = await fetchTabValues(spreadsheetId, spec.tabName);
    } catch (err: unknown) {
      const detail = err instanceof Error ? err.message : String(err);
      errors.push(`[${key}] tab "${spec.tabName}": ${detail}`);
      tabs.push({ tabName: spec.tabName, ok: false, missingHeaders: [] });
      continue;
    }
    const headerRow = (values[findHeaderRowIndex(values)] || []).map((c) => String(c ?? '').trim());
    const missingHeaders = collectMissingHeadersFromFirstRow(headerRow, spec.requiredHeaders);
    tabs.push({
      tabName: spec.tabName,
      ok: missingHeaders.length === 0,
      missingHeaders,
    });
  }

  const ok = missingTabs.length === 0 && tabs.every((t) => t.ok);
  return {
    key,
    spreadsheetIdMasked: masked,
    ok,
    missingTabs,
    tabs,
  };
}

/**
 * Validates Div 10 Google Sheets workbooks (tabs + row-1 headers) when `DATA_BACKEND=sheets`.
 * Does not throw for normal validation failures; aggregates into the returned structure.
 */
export async function validateDiv10SheetsBackendHealth(): Promise<Div10SheetsHealthResult> {
  const dataBackend = String(process.env.DATA_BACKEND || '').trim() || '(unset)';
  const sheetsBackendActive = isSheetsDataBackend();
  const errors: string[] = [];

  if (!sheetsBackendActive) {
    return {
      dataBackend,
      sheetsBackendActive: false,
      message: 'Sheets data backend is not active. Set DATA_BACKEND=sheets to validate Div 10 workbooks.',
      googleAuthConfigured: false,
      ok: true,
      workbooks: [],
      missingEnvVars: [],
      errors: [],
    };
  }

  const missingEnvVars = collectMissingSpreadsheetEnvVars();

  let googleAuthConfigured = false;
  let googleAuthError: string | undefined;
  try {
    buildGoogleServiceAccountJwt();
    googleAuthConfigured = true;
  } catch (err: unknown) {
    googleAuthError = err instanceof Error ? err.message : String(err);
    errors.push(googleAuthError);
  }

  const workbooks: Div10SheetsHealthWorkbookResult[] = [];

  for (const key of DIV10_LOGICAL_WORKBOOK_KEYS) {
    const id = peekSpreadsheetIdForDiv10Workbook(key);
    if (!id) {
      workbooks.push({
        key,
        spreadsheetIdMasked: '(unset)',
        ok: false,
        missingTabs: resolveTabSpecsForWorkbook(key).map((s) => s.tabName),
        tabs: resolveTabSpecsForWorkbook(key).map((s) => ({
          tabName: s.tabName,
          ok: false,
          missingHeaders: [],
        })),
        error: 'Spreadsheet id is not configured for this workbook.',
      });
      continue;
    }

    if (!googleAuthConfigured) {
      const specs = resolveTabSpecsForWorkbook(key);
      workbooks.push({
        key,
        spreadsheetIdMasked: maskSpreadsheetId(id),
        ok: false,
        missingTabs: specs.map((s) => s.tabName),
        tabs: specs.map((s) => ({ tabName: s.tabName, ok: false, missingHeaders: [] })),
        error: googleAuthError || 'Google Sheets credentials are not configured.',
      });
      continue;
    }

    workbooks.push(await validateOneWorkbook({ key, spreadsheetId: id, errors }));
  }

  const ok =
    missingEnvVars.length === 0 &&
    googleAuthConfigured &&
    workbooks.every((w) => w.ok);

  return {
    dataBackend,
    sheetsBackendActive: true,
    googleAuthConfigured,
    googleAuthError,
    ok,
    workbooks,
    missingEnvVars,
    errors,
  };
}
