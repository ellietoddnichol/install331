import React, { useEffect, useMemo, useState } from 'react';
import type { PricingMode, ProjectRecord, TakeoffLineRecord } from '../../../shared/types/estimator';
import { WorkflowRightDrawer } from '../../workflow/WorkflowRightDrawer';
import {
  buildInstallAssumptionDrawerModel,
  mergeDraftInstallAssumptions,
  projectWallSubstrateToInstallValue,
  type InstallAssumptionFieldKey,
} from '../../../shared/utils/installAssumptionDrawer';
import type { InstallBlockingStatus } from '../../../shared/utils/projectBlockingAssumptions';

export type InstallAssumptionApplyScope = 'line' | 'project';

interface InstallAssumptionsDrawerProps {
  open: boolean;
  line: TakeoffLineRecord | null;
  project: ProjectRecord | null;
  pricingMode: PricingMode;
  onClose: () => void;
  onSave: (input: {
    scope: InstallAssumptionApplyScope;
    lineAssumptions: Record<string, string>;
    projectBlockingStatus?: InstallBlockingStatus | '';
    projectWallSubstrate?: string | null;
    recalculateLabor: boolean;
  }) => Promise<void>;
  busy?: boolean;
}

function initialDraft(
  model: ReturnType<typeof buildInstallAssumptionDrawerModel>,
): Record<string, string> {
  const draft: Record<string, string> = { ...model.lineAssumptions };
  for (const field of model.editableFields) {
    if (draft[field.key]) continue;
    if (field.key === 'blocking_status' && model.projectApplied.blockingStatus) {
      draft[field.key] = model.projectApplied.blockingStatus;
    }
    if (field.key === 'wall_substrate') {
      const fromProject = projectWallSubstrateToInstallValue(model.projectApplied.wallSubstrate);
      if (fromProject) draft[field.key] = fromProject;
    }
  }
  return draft;
}

export function InstallAssumptionsDrawer({
  open,
  line,
  project,
  pricingMode,
  onClose,
  onSave,
  busy = false,
}: InstallAssumptionsDrawerProps) {
  const model = useMemo(() => {
    if (!line || !project) return null;
    return buildInstallAssumptionDrawerModel(line, project, pricingMode);
  }, [line, project, pricingMode]);

  const [scope, setScope] = useState<InstallAssumptionApplyScope>('line');
  const [draft, setDraft] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open || !model) return;
    setScope('line');
    setDraft(initialDraft(model));
  }, [open, model?.lineId]);

  if (!open || !model || !line || !project) return null;

  const merged = mergeDraftInstallAssumptions(model, draft);

  function setField(key: InstallAssumptionFieldKey, value: string) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave(recalculateLabor: boolean) {
    const lineAssumptions = scope === 'line' ? merged : {};
    const projectBlockingStatus =
      scope === 'project' && merged.blocking_status
        ? (merged.blocking_status as InstallBlockingStatus)
        : undefined;
    let projectWallSubstrate: string | null | undefined;
    if (scope === 'project' && merged.wall_substrate) {
      const map: Record<string, string> = {
        tile: 'Tile',
        gypsum: 'Drywall',
        cmu: 'CMU',
        concrete: 'Concrete',
        metal: 'Metal panels',
        other: 'Other',
      };
      projectWallSubstrate = map[merged.wall_substrate] || project.wallSubstrate;
    }
    await onSave({
      scope,
      lineAssumptions,
      projectBlockingStatus,
      projectWallSubstrate,
      recalculateLabor,
    });
  }

  return (
    <WorkflowRightDrawer
      open={open}
      title="Install assumptions"
      subtitle="Confirm scope details so labor can price accurately."
      widthClassName="max-w-[min(100vw-1rem,28rem)]"
      onClose={onClose}
      footer={
        <div className="flex flex-wrap gap-2">
          <button type="button" className="ui-fo-btn-primary h-10 flex-1 px-3" disabled={busy} onClick={() => void handleSave(true)}>
            Save and recalculate labor
          </button>
          <button type="button" className="ui-btn-secondary h-10 px-3 text-[12px] font-semibold" disabled={busy} onClick={() => void handleSave(false)}>
            Save assumptions
          </button>
          <button type="button" className="ui-btn-secondary h-10 px-3 text-[12px] font-semibold" disabled={busy} onClick={onClose}>
            Cancel
          </button>
        </div>
      }
    >
      <div className="space-y-5 px-4 py-4">
        <section className="rounded-lg border border-slate-200 bg-white px-3 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Estimate line</p>
          <p className="mt-1 text-[13px] font-semibold text-slate-900">{model.description}</p>
          <p className="mt-0.5 text-[11px] text-slate-600">
            {model.qty} {model.unit}
            {model.category ? ` · ${model.category}` : ''}
          </p>
          <span
            className={`mt-2 inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
              model.laborPaused
                ? 'border-amber-200 bg-amber-50 text-amber-950'
                : 'border-emerald-200 bg-emerald-50 text-emerald-900'
            }`}
          >
            {model.laborStatusLabel}
          </span>
        </section>

        {model.laborPaused ? (
          <div className="rounded-lg border border-amber-200/80 bg-amber-50/60 px-3 py-2.5 text-[12px] leading-relaxed text-amber-950">
            {model.pauseMessage}
          </div>
        ) : null}

        <section className="rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Project defaults</p>
          <ul className="mt-2 space-y-1 text-[12px] text-slate-700">
            <li>
              <span className="font-medium text-slate-800">Wall substrate:</span>{' '}
              {model.projectApplied.wallSubstrate || 'Not set'}
            </li>
            <li>
              <span className="font-medium text-slate-800">Blocking / backing:</span>{' '}
              {model.projectApplied.blockingStatus
                ? model.projectApplied.blockingStatus.replace('_', ' ')
                : 'Not set'}
            </li>
            <li>
              <span className="font-medium text-slate-800">Work condition:</span>{' '}
              {model.projectApplied.occupiedBuilding ? 'Occupied space' : 'Standard access'}
              {model.projectApplied.restrictedAccess ? ' · Access constraints' : ''}
            </li>
          </ul>
        </section>

        <section className="space-y-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Apply changes to</p>
            <div className="mt-2 flex flex-col gap-2">
              <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[12px]">
                <input
                  type="radio"
                  name="install-assumption-scope"
                  checked={scope === 'line'}
                  onChange={() => setScope('line')}
                  className="mt-0.5"
                />
                <span>
                  <span className="font-semibold text-slate-900">This line only</span>
                  <span className="mt-0.5 block text-slate-600">Overrides project defaults for this estimate row.</span>
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[12px]">
                <input
                  type="radio"
                  name="install-assumption-scope"
                  checked={scope === 'project'}
                  onChange={() => setScope('project')}
                  className="mt-0.5"
                />
                <span>
                  <span className="font-semibold text-slate-900">Project default</span>
                  <span className="mt-0.5 block text-slate-600">Updates Setup and applies to new imports.</span>
                </span>
              </label>
            </div>
          </div>

          {model.editableFields.length > 0 ? (
            <div className="space-y-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Confirm details</p>
              {model.editableFields.map((field) => (
                <label key={field.key} className="block space-y-1 text-[12px]">
                  <span className="font-medium text-slate-800">{field.label}</span>
                  {field.kind === 'select' && field.options ? (
                    <select
                      className="ui-input w-full"
                      value={draft[field.key] || ''}
                      onChange={(e) => setField(field.key, e.target.value)}
                    >
                      <option value="">Select…</option>
                      {field.options.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      className="ui-input w-full"
                      value={draft[field.key] || ''}
                      onChange={(e) => setField(field.key, e.target.value)}
                      placeholder="Enter value"
                    />
                  )}
                </label>
              ))}
            </div>
          ) : (
            <p className="text-[12px] text-slate-600">No additional assumption fields are required for this line.</p>
          )}
        </section>
      </div>
    </WorkflowRightDrawer>
  );
}
