import React, { useEffect } from 'react';
import { X } from 'lucide-react';

interface WorkflowRightDrawerProps {
  open: boolean;
  title: string;
  subtitle?: string;
  widthClassName?: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

export function WorkflowRightDrawer({
  open,
  title,
  subtitle,
  widthClassName = 'max-w-[min(100vw-1rem,42rem)]',
  onClose,
  children,
  footer,
}: WorkflowRightDrawerProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40 backdrop-blur-[2px]" role="presentation">
      <button type="button" className="absolute inset-0 h-full w-full cursor-default border-0 bg-transparent" aria-label="Close panel" onClick={onClose} />
      <div
        className={`relative flex h-full w-full flex-col border-l border-slate-200/90 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] shadow-[-12px_0_40px_rgba(15,23,42,0.12)] ${widthClassName}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="workflow-drawer-title"
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200/80 px-4 py-3">
          <div className="min-w-0">
            <h2 id="workflow-drawer-title" className="text-base font-semibold tracking-tight text-slate-950">
              {title}
            </h2>
            {subtitle ? <p className="mt-0.5 text-[11px] text-slate-500">{subtitle}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:bg-slate-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        {footer ? <div className="shrink-0 border-t border-slate-200/80 bg-white/95 px-4 py-3">{footer}</div> : null}
      </div>
    </div>
  );
}
