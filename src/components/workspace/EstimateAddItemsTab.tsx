import React, { useMemo, useState } from 'react';
import { Layers3, Plus, Search } from 'lucide-react';
import { BundleRecord, RoomRecord } from '../../shared/types/estimator';
import { CatalogItem } from '../../types';
import { formatCurrencySafe, formatNumberSafe } from '../../utils/numberFormat';

interface Props {
  rooms: RoomRecord[];
  activeRoomId: string;
  bundles: BundleRecord[];
  categories: string[];
  items: CatalogItem[];
  search: string;
  category: string;
  onSearch: (value: string) => void;
  onCategory: (value: string) => void;
  onAddCatalogItem: (item: CatalogItem, qty: number, roomId: string) => Promise<void> | void;
  onAddBundle: (bundleId: string, roomId: string) => Promise<void> | void;
  onAddManualLine: () => Promise<void> | void;
}

export function EstimateAddItemsTab({
  rooms,
  activeRoomId,
  bundles,
  categories,
  items,
  search,
  category,
  onSearch,
  onCategory,
  onAddCatalogItem,
  onAddBundle,
  onAddManualLine,
}: Props) {
  const [qtyById, setQtyById] = useState<Record<string, number>>({});
  const roomId = activeRoomId || rooms[0]?.id || '';
  const featuredBundles = useMemo(() => bundles.slice(0, 4), [bundles]);

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="ui-eyebrow">Add Items</p>
          <p className="mt-1 text-[11px] text-slate-500">Target room: {rooms.find((room) => room.id === roomId)?.roomName || 'No active room selected'}</p>
        </div>
        <button onClick={() => void onAddManualLine()} className="inline-flex h-7 items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 text-[10px] font-semibold text-slate-700 transition hover:bg-slate-50">
          <Plus className="h-3 w-3" /> Manual
        </button>
      </div>

      <div className="ui-card p-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={(event) => onSearch(event.target.value)} className="h-9 w-full rounded-lg border border-slate-300 bg-slate-50 pl-9 pr-3 text-[13px] outline-none transition focus:border-blue-300 focus:bg-white" placeholder="Search items or SKU" />
        </div>
        <div className="mt-1.5 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
          <label className="text-[11px] font-medium text-slate-700">Category
            <select value={category} onChange={(event) => onCategory(event.target.value)} className="ui-input mt-1 h-8 rounded-lg">
              {categories.map((entry) => <option key={entry} value={entry}>{entry === 'all' ? 'All Categories' : entry}</option>)}
            </select>
          </label>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[10px] text-slate-600">
            <p className="font-medium text-slate-900">{rooms.find((room) => room.id === roomId)?.roomName || 'No active room selected'}</p>
          </div>
        </div>
      </div>

      <div className="ui-card bg-white/92">
        <div className="max-h-[56vh] overflow-y-auto p-1.5">
          <div className="space-y-1.5">
            {items.map((item) => {
              const qty = Math.max(1, Number(qtyById[item.id] || 1));
              return (
                <div key={item.id} className="rounded-lg border border-slate-200 bg-slate-50/70 p-2 transition hover:border-blue-200 hover:bg-white">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[12px] font-semibold leading-5 text-slate-900">{item.description}</p>
                      <p className="mt-0.5 text-[10px] text-slate-500">{item.category} • {item.sku} • {formatCurrencySafe(item.baseMaterialCost)} • {formatNumberSafe(item.baseLaborMinutes, 1)} min</p>
                    </div>
                    <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-medium text-slate-600 ring-1 ring-slate-200">{item.uom}</span>
                  </div>
                  <div className="mt-1.5 flex items-center justify-between gap-2">
                    <input type="number" min={1} value={qty} onChange={(event) => setQtyById((prev) => ({ ...prev, [item.id]: Math.max(1, Number(event.target.value) || 1) }))} className="h-7 w-14 rounded-md border border-slate-300 bg-white px-2 text-[11px]" aria-label={`Quantity for ${item.description}`} />
                    <button onClick={() => void onAddCatalogItem(item, qty, roomId)} className="inline-flex h-7 items-center gap-1 rounded-full bg-app-primary-gradient px-2.5 text-[10px] font-semibold text-white shadow-[0_8px_18px_rgba(11,61,145,0.16)] transition hover:brightness-[1.03]">
                      <Plus className="h-3 w-3" /> Add
                    </button>
                  </div>
                </div>
              );
            })}
            {items.length === 0 ? <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-[12px] text-slate-500">No catalog items match the current search and category filter.</div> : null}
          </div>
        </div>
      </div>

      {featuredBundles.length > 0 ? (
        <div className="ui-card bg-white/92 p-2">
          <div className="flex items-center gap-2">
            <Layers3 className="h-4 w-4 text-slate-500" />
            <p className="text-[11px] font-semibold text-slate-900">Bundles</p>
          </div>
          <div className="mt-2 space-y-1.5">
            {featuredBundles.map((bundle) => (
              <button key={bundle.id} onClick={() => void onAddBundle(bundle.id, roomId)} className="flex w-full items-center justify-between rounded-[14px] border border-slate-200 bg-slate-50/70 px-3 py-2 text-left transition hover:border-blue-200 hover:bg-white">
                <div>
                  <p className="text-[12px] font-semibold text-slate-900">{bundle.bundleName}</p>
                  <p className="text-[10px] text-slate-500">{bundle.category || 'Bundle'}</p>
                </div>
                <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-700 ring-1 ring-slate-200">Apply</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}