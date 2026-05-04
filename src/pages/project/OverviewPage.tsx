import React from 'react';
import { Download, FileUp, Paperclip, Trash2 } from 'lucide-react';
import type { ProjectFileRecord, ProjectJobConditions, ProjectRecord, ProjectStructuredAssumption, RoomRecord } from '../../shared/types/estimator';
import type { WorkspaceTab } from '../../shared/types/projectWorkflow';
import { isMeaningfulTravelDistanceMiles } from '../../shared/utils/jobConditions';
import { formatCurrencySafe, formatKilobytesSafe, formatNumberSafe } from '../../utils/numberFormat';
import { StatCard } from '../../components/workflow/StatCard';
import { api } from '../../services/api';

interface SummaryLite {
  conditionLaborMultiplier?: number;
  conditionAdjustmentAmount?: number;
  baseBidTotal?: number;
  conditionAssumptions?: string[];
}

interface OverviewPageProps {
  project: ProjectRecord;
  rooms: RoomRecord[];
  summary: SummaryLite | null;
  pricingMode: string;
  scopeCategoryOptions: string[];
  selectedScopeCategories: string[];
  jobConditions: ProjectJobConditions;
  setActiveTab: (tab: WorkspaceTab) => void;
  /** Files (folded into overview) */
  projectFiles: ProjectFileRecord[];
  fileUploading: boolean;
  onUploadFile: (file: File | undefined) => void;
  onRemoveFile: (fileId: string) => void;
  onRemoveStructuredAssumption: (assumptionId: string) => void;
}

export function OverviewPage({
  project,
  rooms,
  summary,
  pricingMode,
  scopeCategoryOptions,
  selectedScopeCategories,
  jobConditions,
  setActiveTab,
  projectFiles,
  fileUploading,
  onUploadFile,
  onRemoveFile,
  onRemoveStructuredAssumption,
}: OverviewPageProps) {
  const structuredAssumptions: ProjectStructuredAssumption[] = project.structuredAssumptions ?? [];

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-8">
      <header className="rounded-2xl border border-slate-200/70 bg-white px-5 py-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-slate-500">Project overview</p>
            <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-900">Dashboard</h2>
            <p className="mt-2 max-w-3xl text-sm text-slate-600">
              Read-only snapshot of identity, scope, and pricing posture. Edit on Setup; build the bid on Estimate.
            </p>
          </div>
          <button type="button" onClick={() => setActiveTab('estimate')} className="ui-btn-primary h-10 shrink-0 rounded-full px-5 text-[11px] font-semibold">
            Open estimate
          </button>
        </div>
        <div className="mt-5 flex flex-wrap gap-x-8 gap-y-4 border-t border-slate-100 pt-5 text-sm">
          <div className="min-w-[140px]">
            <p className="text-xs text-slate-500">Project</p>
            <p className="mt-0.5 font-semibold text-slate-900">{project.projectName}</p>
          </div>
          <div className="min-w-[120px]">
            <p className="text-xs text-slate-500">Client</p>
            <p className="mt-0.5 font-semibold text-slate-900">{project.clientName || '—'}</p>
          </div>
          <div className="min-w-[140px]">
            <p className="text-xs text-slate-500">Price mode</p>
            <p className="mt-0.5 font-semibold text-slate-900">
              {pricingMode === 'material_only'
                ? 'Material only'
                : pricingMode === 'labor_only'
                  ? 'Install only'
                  : pricingMode === 'material_with_optional_install_quote'
                    ? 'Material + install (quoted separately)'
                    : 'Material + install'}
            </p>
          </div>
          <div className="min-w-[100px]">
            <p className="text-xs text-slate-500">Rooms</p>
            <p className="mt-0.5 font-semibold text-slate-900">{rooms.length}</p>
          </div>
          <div className="min-w-[120px]">
            <p className="text-xs text-slate-500">Scope tags</p>
            <p className="mt-0.5 font-semibold text-slate-900">{selectedScopeCategories.length || scopeCategoryOptions.length || 0}</p>
          </div>
          <div className="min-w-[120px]">
            <p className="text-xs text-slate-500">Bid total</p>
            <p className="mt-0.5 font-semibold text-slate-900">{formatCurrencySafe(summary?.baseBidTotal)}</p>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-8 xl:grid-cols-[1fr_340px_280px] xl:items-start">
        <section className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-sm">
          <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-slate-500">Section 1 · Project inputs</p>
          <h3 className="mt-1 text-lg font-semibold text-slate-900">Setup snapshot</h3>
          <p className="mt-2 text-sm text-slate-600">Labor basis, delivery posture, and what is in scope for catalog and takeoff.</p>

          <div className="mt-6 space-y-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <p className="text-xs font-medium text-slate-500">Labor basis</p>
                <p className="mt-1 font-semibold text-slate-900">Union baseline</p>
                <p className="mt-1 text-xs text-slate-500">Multiplier ×{formatNumberSafe(jobConditions.laborRateMultiplier, 2)}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500">Delivery</p>
                <p className="mt-1 font-semibold text-slate-900">
                  {jobConditions.deliveryQuotedSeparately
                    ? 'Travel priced separately'
                    : jobConditions.deliveryRequired
                      ? 'In scope'
                      : 'Not included'}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {jobConditions.deliveryQuotedSeparately && isMeaningfulTravelDistanceMiles(jobConditions.travelDistanceMiles)
                    ? `${formatNumberSafe(jobConditions.travelDistanceMiles, 1)} mi — not in estimate total`
                    : jobConditions.deliveryRequired
                      ? jobConditions.deliveryPricingMode === 'flat'
                        ? formatCurrencySafe(jobConditions.deliveryValue)
                        : jobConditions.deliveryPricingMode === 'percent'
                          ? `${formatNumberSafe(jobConditions.deliveryValue, 2)}% of base`
                          : 'No separate adder'
                      : 'No delivery allowance applied'}
                </p>
              </div>
            </div>

            <div>
              <p className="text-xs font-medium text-slate-500">Scope categories</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {(selectedScopeCategories.length > 0 ? selectedScopeCategories : scopeCategoryOptions).slice(0, 16).map((category) => (
                  <span key={category} className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-700">
                    {category}
                  </span>
                ))}
                {selectedScopeCategories.length === 0 && scopeCategoryOptions.length === 0 ? (
                  <span className="text-xs text-slate-500">No catalog categories loaded yet.</span>
                ) : null}
              </div>
            </div>

            <div>
              <p className="text-xs font-medium text-slate-500">Rooms / areas</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {rooms.slice(0, 12).map((room) => (
                  <span key={room.id} className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-700">
                    {room.roomName}
                  </span>
                ))}
                {rooms.length === 0 ? <span className="text-xs text-slate-500">No rooms yet.</span> : null}
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-sm">
          <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-slate-500">Pricing rollups</p>
          <h3 className="mt-1 text-lg font-semibold text-slate-900">Conditions &amp; adders</h3>
          <p className="mt-2 text-sm text-slate-600">How job conditions and project adders flow into labor dollars.</p>

          <dl className="mt-6 space-y-4 text-sm">
            <div className="flex items-baseline justify-between gap-3 border-b border-slate-100 pb-3">
              <dt className="text-slate-500">Condition labor mult.</dt>
              <dd className="font-semibold tabular-nums text-slate-900">×{formatNumberSafe(summary?.conditionLaborMultiplier || 1, 2)}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-3 border-b border-slate-100 pb-3">
              <dt className="text-slate-500">Condition adjustment</dt>
              <dd className="font-semibold tabular-nums text-slate-900">{formatCurrencySafe(summary?.conditionAdjustmentAmount)}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-3 border-b border-slate-100 pb-3">
              <dt className="text-slate-500">Project adder %</dt>
              <dd className="font-semibold tabular-nums text-slate-900">{formatNumberSafe(jobConditions.estimateAdderPercent, 2)}%</dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-slate-500">Project adder $</dt>
              <dd className="font-semibold tabular-nums text-slate-900">{formatCurrencySafe(jobConditions.estimateAdderAmount)}</dd>
            </div>
          </dl>

          <div className="mt-6 border-t border-slate-100 pt-4">
            <p className="text-xs font-medium text-slate-500">Special notes</p>
            <p className="mt-2 text-sm text-slate-700 whitespace-pre-wrap">{project.specialNotes?.trim() || 'No project-wide notes yet.'}</p>
          </div>
        </section>

        <aside className="space-y-4 xl:sticky xl:top-[88px]">
          <section className="rounded-2xl border border-slate-200/70 bg-white p-4 shadow-sm">
            <p className="text-[10px] font-semibold uppercase tracking-[0.05em] text-slate-500">Recorded assumptions</p>
            <p className="mt-1 text-[11px] text-slate-500">Intake and automation notes stored on the project (proposal / audit).</p>
            {structuredAssumptions.length > 0 ? (
              <ul className="mt-2 max-h-52 space-y-2 overflow-auto pr-1 text-xs text-slate-700">
                {structuredAssumptions.map((a) => (
                  <li key={a.id} className="flex gap-2 rounded-md border border-slate-100 bg-slate-50/80 p-2 leading-snug">
                    <span className="min-w-0 flex-1">
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{a.source}</span>
                      <span className="mt-0.5 block">{a.text}</span>
                    </span>
                    <button
                      type="button"
                      className="shrink-0 self-start rounded border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-medium text-slate-600 hover:bg-slate-100"
                      onClick={() => onRemoveStructuredAssumption(a.id)}
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-xs text-slate-500">No structured assumptions on this project yet.</p>
            )}
          </section>
          <section className="rounded-2xl border border-slate-200/70 bg-white p-4 shadow-sm">
            <p className="text-[10px] font-semibold uppercase tracking-[0.05em] text-slate-500">Active condition assumptions</p>
            {(summary?.conditionAssumptions || []).length > 0 ? (
              <div className="mt-2 max-h-56 space-y-1.5 overflow-auto pr-1 text-xs text-slate-700">
                {(summary?.conditionAssumptions || []).slice(0, 14).map((assumption) => (
                  <p key={assumption} className="leading-4">
                    — {assumption}
                  </p>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-xs text-slate-500">No live condition assumptions from the current estimate.</p>
            )}
          </section>
          <section className="rounded-2xl border border-dashed border-slate-300/80 bg-slate-50/80 p-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.05em] text-slate-500">Next step</p>
            <p className="mt-2 text-xs text-slate-600">Review scope exceptions, then refine lines on the estimate.</p>
            <button type="button" onClick={() => setActiveTab('scope-review')} className="ui-btn-secondary mt-3 h-9 w-full text-[11px] font-semibold">
              Scope review
            </button>
            <button type="button" onClick={() => setActiveTab('setup')} className="ui-btn-secondary mt-2 h-9 w-full text-[11px] font-semibold">
              Project setup
            </button>
          </section>
        </aside>
      </div>

      <section className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="ui-label">Project files</p>
            <h3 className="mt-1 text-lg font-semibold tracking-tight text-slate-950">Source documents</h3>
            <p className="mt-1 text-sm text-slate-600">Takeoff sheets, drawings, and scope — same uploads as before, now on the overview.</p>
          </div>
          <label className="ui-btn-primary inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-full px-5 text-[11px] font-semibold self-start sm:self-auto">
            <FileUp className="h-4 w-4" />
            {fileUploading ? 'Uploading...' : 'Upload file'}
            <input type="file" className="hidden" onChange={(e) => onUploadFile(e.target.files?.[0])} disabled={fileUploading} />
          </label>
        </div>

        <div className="grid gap-2.5 sm:grid-cols-3">
          <StatCard label="Files stored" value={projectFiles.length} hint="Project reference set" />
          <StatCard label="Latest upload" value={projectFiles[0]?.fileName || '—'} hint={projectFiles[0] ? new Date(projectFiles[0].createdAt).toLocaleString() : 'Add your first file'} />
          <StatCard label="Suggested use" value="Parser + backup" hint="Keep intake sources with the bid" />
        </div>

        <div className="overflow-hidden rounded-[20px] border border-slate-200/80 bg-white shadow-sm">
          {projectFiles.length === 0 ? (
            <div className="px-6 py-10 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
                <Paperclip className="h-6 w-6" />
              </div>
              <h4 className="mt-4 text-base font-semibold text-slate-900">No project files yet</h4>
              <p className="mt-2 text-sm text-slate-500">Upload takeoff sheets, reference drawings, scope docs, or proposal support material.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {projectFiles.map((file) => (
                <div key={file.id} className="flex flex-wrap items-center justify-between gap-4 px-5 py-4 hover:bg-slate-50/70">
                  <div className="min-w-0 flex-1">
                    <div className="inline-flex max-w-full items-center gap-2 rounded-full bg-slate-100 px-3 py-1.5 text-[11px] font-medium text-slate-600">
                      <Paperclip className="h-3.5 w-3.5" />
                      <span className="truncate">{file.fileName}</span>
                    </div>
                    <div className="mt-3 grid gap-2 text-[11px] text-slate-500 sm:grid-cols-3">
                      <span>Type: {file.mimeType}</span>
                      <span>Size: {formatKilobytesSafe(file.sizeBytes)}</span>
                      <span>Uploaded: {new Date(file.createdAt).toLocaleString()}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <a
                      href={api.getV1ProjectFileDownloadUrl(project.id, file.id)}
                      className="inline-flex h-9 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3.5 text-[11px] font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
                    >
                      <Download className="h-3.5 w-3.5" />
                      Download
                    </a>
                    <button
                      type="button"
                      onClick={() => onRemoveFile(file.id)}
                      className="inline-flex h-9 items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-3.5 text-[11px] font-semibold text-red-700 shadow-sm hover:bg-red-100"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
