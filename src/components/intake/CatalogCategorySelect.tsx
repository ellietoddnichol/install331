import React from 'react';

type Props = {
  value: string | null | undefined;
  options: string[];
  onChange: (value: string | null) => void;
  className?: string;
  disabled?: boolean;
  onBlur?: () => void;
};

/**
 * Scope category must be one of the catalog-defined categories (no free text).
 */
export function CatalogCategorySelect({ value, options, onChange, className = 'ui-input mt-1 h-8', disabled, onBlur }: Props) {
  const v = String(value || '').trim();
  const inList = v && options.includes(v);
  const orphan = v && !inList;
  const selectValue = inList || orphan ? v : '';

  return (
    <select
      className={className}
      disabled={disabled || (options.length === 0 && !orphan)}
      value={selectValue}
      onChange={(e) => onChange(e.target.value ? e.target.value : null)}
      onBlur={onBlur}
    >
      <option value="">{options.length ? 'Select category…' : 'Sync catalog (no categories yet)'}</option>
      {orphan ? (
        <option value={v}>
          {v} (not in catalog — pick below)
        </option>
      ) : null}
      {options.map((c) => (
        <option key={c} value={c}>
          {c}
        </option>
      ))}
    </select>
  );
}
