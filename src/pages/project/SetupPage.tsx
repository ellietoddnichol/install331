import React from 'react';
import type { ProjectJobConditions, ProjectRecord, RoomRecord, SettingsRecord } from '../../shared/types/estimator';
import type { WorkspaceTab } from '../../shared/types/projectWorkflow';
import { ProjectSetupWorkspace } from '../../components/workspace/ProjectSetupWorkspace';
import { SetupStepper } from '../../components/workflow/SetupStepper';
import { formatCurrencySafe, formatNumberSafe } from '../../utils/numberFormat';

interface SummaryLite {
  conditionLaborMultiplier?: number;
  conditionAdjustmentAmount?: number;
  adjustedLaborSubtotal?: number;
  conditionAssumptions?: string[];
  durationDays?: number;
  baseBidTotal?: number;
}

interface SetupPageProps {
  project: ProjectRecord;
  setProject: React.Dispatch<React.SetStateAction<ProjectRecord | null>>;
  jobConditions: ProjectJobConditions;
  patchJobConditions: (patch: Partial<ProjectJobConditions>) => void;
  showMaterial: boolean;
  scopeCategoryOptions: string[];
  selectedScopeCategories: string[];
  toggleScopeCategory: (category: string) => void;
  rooms: RoomRecord[];
  setActiveTab: (tab: WorkspaceTab) => void;
  onOpenEstimateQuantities: () => void;
  summary: SummaryLite | null;
  settings: SettingsRecord | null;
  distanceError: string | null;
  distanceCalculating: boolean;
}

export function SetupPage({ setActiveTab, onOpenEstimateQuantities, ...workspaceProps }: SetupPageProps) {
  const { jobConditions, summary, selectedScopeCategories, rooms } = workspaceProps;

  return (
    <div className="mx-auto grid w-full max-w-[1600px] grid-cols-1 gap-6 xl:grid-cols-[1fr_300px] xl:items-start">
      <div className="min-w-0 space-y-4">
        <SetupStepper activeStep={0} />
        <ProjectSetupWorkspace
          {...workspaceProps}
          setActiveTab={(tab) => {
            if (tab === 'takeoff' || tab === 'estimate') {
              onOpenEstimateQuantities();
              return;
            }
            setActiveTab(tab as WorkspaceTab);
          }}
        />
      </div>

      <aside className="space-y-4 xl:sticky xl:top-[88px]">
        <section className="rounded-2xl border border-slate-200/70 bg-white p-4 shadow-sm">
          <p className="text-[10px] font-semibold uppercase tracking-[0.05em] text-slate-500">At a glance</p>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-lg border border-slate-100 bg-slate-50/80 px-2.5 py-2">
              <p className="text-slate-500">Installers</p>
              <p className="font-semibold text-slate-900">{jobConditions.installerCount}</p>
            </div>
            <div className="rounded-lg border border-slate-100 bg-slate-50/80 px-2.5 py-2">
              <p className="text-slate-500">Distance</p>
              <p className="font-semibold text-slate-900">{jobConditions.travelDistanceMiles !== null ? `${formatNumberSafe(jobConditions.travelDistanceMiles, 1)} mi` : '—'}</p>
            </div>
            <div className="rounded-lg border border-slate-100 bg-slate-50/80 px-2.5 py-2">
              <p className="text-slate-500">Labor mult.</p>
              <p className="font-semibold text-slate-900">×{formatNumberSafe(summary?.conditionLaborMultiplier || 1, 2)}</p>
            </div>
            <div className="rounded-lg border border-slate-100 bg-slate-50/80 px-2.5 py-2">
              <p className="text-slate-500">Cond. adj.</p>
              <p className="font-semibold text-slate-900">{formatCurrencySafe(summary?.conditionAdjustmentAmount)}</p>
            </div>
            <div className="col-span-2 rounded-lg border border-slate-100 bg-slate-50/80 px-2.5 py-2">
              <p className="text-slate-500">Adjusted labor subtotal</p>
              <p className="font-semibold text-slate-900">{formatCurrencySafe(summary?.adjustedLaborSubtotal)}</p>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200/70 bg-white p-4 shadow-sm">
          <p className="text-[10px] font-semibold uppercase tracking-[0.05em] text-slate-500">Active assumptions</p>
          {(summary?.conditionAssumptions || []).length > 0 ? (
            <div className="mt-2 max-h-48 space-y-1.5 overflow-auto pr-1 text-xs text-slate-700">
              {(summary?.conditionAssumptions || []).slice(0, 12).map((assumption) => (
                <p key={assumption} className="leading-4">
                  — {assumption}
                </p>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-xs text-slate-500">No project-level assumptions are active.</p>
          )}
        </section>

        <section className="rounded-2xl border border-slate-200/70 bg-white p-4 shadow-sm">
          <p className="text-[10px] font-semibold uppercase tracking-[0.05em] text-slate-500">Scope included</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {selectedScopeCategories.length > 0 ? (
              selectedScopeCategories.map((category) => (
                <span key={category} className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-700">
                  {category}
                </span>
              ))
            ) : (
              <p className="text-xs text-slate-500">No categories selected yet.</p>
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200/70 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.05em] text-slate-500">Rooms</p>
            <button type="button" onClick={onOpenEstimateQuantities} className="ui-btn-secondary h-8 shrink-0 px-2.5 text-[11px] font-semibold">
              Quantities
            </button>
          </div>
          <p className="mt-1 text-xs text-slate-600">Organize scope by area from the estimate workspace.</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {rooms.slice(0, 6).map((room) => (
              <span key={room.id} className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-700">
                {room.roomName}
              </span>
            ))}
            {rooms.length > 6 ? (
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-500">+{rooms.length - 6} more</span>
            ) : null}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200/70 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.05em] text-slate-500">Proposal</p>
            <button type="button" onClick={() => setActiveTab('proposal')} className="text-[11px] font-medium text-blue-700 hover:text-blue-800">
              Open
            </button>
          </div>
          <p className="mt-2 text-xs text-slate-600">Review wording before export.</p>
        </section>
      </aside>
    </div>
  );
}
