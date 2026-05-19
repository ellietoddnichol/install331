import React, { useEffect, useState } from 'react';
import { deleteConfirmationPhrase, projectDisplayTitle } from '../../shared/utils/projectDisplay';

interface DeleteProjectModalProps {
  open: boolean;
  projectName: string | null | undefined;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
}

export function DeleteProjectModal({
  open,
  projectName,
  busy = false,
  onCancel,
  onConfirm,
}: DeleteProjectModalProps) {
  const [typed, setTyped] = useState('');
  const requiredPhrase = deleteConfirmationPhrase(projectName);
  const displayName = projectDisplayTitle(projectName);
  const matches = typed.trim() === requiredPhrase;

  useEffect(() => {
    if (!open) setTyped('');
  }, [open, projectName]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[95] flex items-center justify-center bg-slate-900/50 p-4"
      role="presentation"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-project-title"
        className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="delete-project-title" className="text-lg font-semibold text-slate-950">
          Delete this project?
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-slate-600">
          This will remove <span className="font-medium text-slate-900">{displayName}</span> from your active
          workspace. Quotes, estimate lines, and proposal data for this project may no longer be available from
          the normal project list.
        </p>
        <p className="mt-2 text-sm font-medium text-slate-800">This cannot be undone.</p>
        <label className="mt-5 block space-y-1.5 text-sm">
          <span className="font-medium text-slate-700">
            Type <span className="font-mono text-slate-900">{requiredPhrase}</span> to confirm
          </span>
          <input
            className="ui-input w-full"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="off"
            disabled={busy}
          />
        </label>
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button type="button" className="ui-btn-secondary h-10 px-4" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className="inline-flex h-10 items-center rounded-lg bg-rose-600 px-4 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
            disabled={busy || !matches}
            onClick={() => void onConfirm()}
          >
            {busy ? 'Deleting…' : 'Delete project'}
          </button>
        </div>
      </div>
    </div>
  );
}
