import React from 'react';
import { AlertTriangle } from 'lucide-react';

export function FieldOpsPageHeader(props: {
  kicker?: string;
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  const { kicker, title, subtitle, actions } = props;
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
      <div>
        {kicker ? <p className="ui-typo-kicker">{kicker}</p> : null}
        <h1 className="ui-typo-page-title">{title}</h1>
        {subtitle ? <p className="ui-typo-body mt-1 max-w-3xl">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function FieldOpsKpiCard(props: {
  label: string;
  value: string;
  hint?: string;
  emphasize?: boolean;
}) {
  const { label, value, hint, emphasize } = props;
  return (
    <div className={`ui-fo-kpi ${emphasize ? 'ring-1 ring-orange-200' : ''}`}>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-xl font-semibold tabular-nums tracking-tight ${emphasize ? 'text-orange-700' : 'text-slate-950'}`}>
        {value}
      </p>
      {hint ? <p className="mt-0.5 text-[11px] text-slate-500">{hint}</p> : null}
    </div>
  );
}

export function FieldOpsAlertBanner(props: {
  title: string;
  body?: string;
  ctaLabel?: string;
  onCta?: () => void;
}) {
  const { title, body, ctaLabel, onCta } = props;
  return (
    <div className="ui-fo-alert-warn mb-4 flex flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-0 gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-orange-600" aria-hidden />
        <div>
          <p className="text-sm font-semibold text-orange-950">{title}</p>
          {body ? <p className="mt-1 text-[13px] leading-relaxed text-orange-900/90">{body}</p> : null}
        </div>
      </div>
      {ctaLabel && onCta ? (
        <button type="button" className="ui-fo-btn-secondary h-9 shrink-0 border-orange-300 text-orange-900" onClick={onCta}>
          {ctaLabel}
        </button>
      ) : null}
    </div>
  );
}

export function FieldOpsTabs(props: {
  tabs: Array<{ id: string; label: string; badge?: number }>;
  activeId: string;
  onChange: (id: string) => void;
}) {
  const { tabs, activeId, onChange } = props;
  return (
    <div className="mb-4 flex flex-wrap gap-1 border-b border-slate-200">
      {tabs.map((tab) => {
        const active = tab.id === activeId;
        return (
          <button
            key={tab.id}
            type="button"
            className={`ui-fo-tab ${active ? 'ui-fo-tab-active' : 'hover:text-slate-900'}`}
            onClick={() => onChange(tab.id)}
          >
            {tab.label}
            {tab.badge != null && tab.badge > 0 ? (
              <span
                className={`ml-1.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[9px] font-bold tabular-nums ${
                  active ? 'bg-orange-100 text-orange-900' : 'bg-slate-200 text-slate-700'
                }`}
              >
                {tab.badge}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export function FieldOpsStickyFooter(props: {
  items: Array<{ label: string; value: string; warn?: boolean }>;
}) {
  return (
    <div className="ui-fo-sticky-footer mt-auto flex flex-wrap items-center gap-6 text-[12px]">
      {props.items.map((item) => (
        <div key={item.label}>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{item.label}</p>
          <p className={`mt-0.5 text-sm font-semibold tabular-nums ${item.warn ? 'text-orange-300' : 'text-white'}`}>
            {item.value}
          </p>
        </div>
      ))}
    </div>
  );
}
