import React, { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '../../services/api';

type Props = {
  id?: string;
  value: string;
  className?: string;
  placeholder?: string;
  onChange: (value: string) => void;
};

export function SiteAddressAutocomplete({ id, value, className = '', placeholder, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<{ label: string }[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const blurRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchSuggestions = useCallback(async (q: string) => {
    if (q.trim().length < 3) {
      setItems([]);
      return;
    }
    setLoading(true);
    try {
      const res = await apiFetch(`/api/v1/projects/address-suggest?q=${encodeURIComponent(q.trim())}`);
      if (!res.ok) throw new Error('bad');
      const json = (await res.json()) as { data?: { suggestions?: { label: string }[] } };
      const list = json?.data?.suggestions;
      setItems(Array.isArray(list) ? list : []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (blurRef.current) clearTimeout(blurRef.current);
    };
  }, []);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  return (
    <div ref={wrapRef} className={`relative ${className}`}>
      <input
        id={id}
        type="text"
        autoComplete="street-address"
        className="ui-input mt-1 w-full"
        value={value}
        placeholder={placeholder || 'Start typing street, city, state…'}
        onChange={(e) => {
          const v = e.target.value;
          onChange(v);
          setOpen(true);
          if (debounceRef.current) clearTimeout(debounceRef.current);
          debounceRef.current = setTimeout(() => void fetchSuggestions(v), 400);
        }}
        onFocus={() => {
          if (value.trim().length >= 3) setOpen(true);
        }}
        onBlur={() => {
          blurRef.current = setTimeout(() => setOpen(false), 180);
        }}
      />
      {open && (items.length > 0 || loading) && (
        <ul
          className="absolute z-50 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-slate-200 bg-white py-1 text-sm shadow-lg"
          role="listbox"
        >
          {loading ? (
            <li className="px-3 py-2 text-slate-500">Searching…</li>
          ) : (
            items.map((s, i) => (
              <li key={`${i}-${s.label.slice(0, 48)}`}>
                <button
                  type="button"
                  className="w-full px-3 py-2 text-left hover:bg-slate-100"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    if (blurRef.current) clearTimeout(blurRef.current);
                    onChange(s.label);
                    setItems([]);
                    setOpen(false);
                  }}
                >
                  {s.label}
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
