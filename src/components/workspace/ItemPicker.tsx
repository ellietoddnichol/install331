import React, { useEffect, useState } from 'react';
import { Layers3, Plus, Search, Trash2 } from 'lucide-react';
import { CatalogItem } from '../../types';
import { BundleRecord, RoomRecord } from '../../shared/types/estimator';
import { formatCurrencySafe, formatNumberSafe } from '../../utils/numberFormat';

interface DraftItem {
  id: string;
  roomId: string;
  description: string;
  unit: string;
  qty: number;
  notes: string;
  sourceType: 'catalog' | 'manual';
  sku?: string | null;
  category?: string | null;
  subcategory?: string | null;
  materialCost: number;
  laborMinutes: number;
  catalogItemId?: string | null;
}

interface Props {
  open: boolean;
  rooms: RoomRecord[];
  bundles: BundleRecord[];
  activeRoomId: string;
  categories: string[];
  search: string;
  category: string;
  items: CatalogItem[];
  onClose: () => void;
  onSearch: (value: string) => void;
  onCategory: (value: string) => void;
  onAddItems: (items: Array<Omit<DraftItem, 'id'>>) => Promise<void>;
  onApplyBundle: (bundleId: string, roomId: string) => Promise<void>;
}

function createDraftId(): string {
  return `draft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function ItemPicker({ open, rooms, bundles, activeRoomId, categories, search, category, items, onClose, onSearch, onCategory, onAddItems, onApplyBundle }: Props) {
  const [draftItems, setDraftItems] = useState<DraftItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkRoomId, setBulkRoomId] = useState('');
  const [bundleRoomId, setBundleRoomId] = useState('');
  const [manualDescription, setManualDescription] = useState('');
  const [manualQty, setManualQty] = useState(1);
  const [manualUnit, setManualUnit] = useState('EA');
  const [manualNotes, setManualNotes] = useState('');
  const [manualRoomId, setManualRoomId] = useState('');
  const [saving, setSaving] = useState(false);
  const [bundleApplyingId, setBundleApplyingId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const fallbackRoomId = activeRoomId || rooms[0]?.id || '';
    setBulkRoomId(fallbackRoomId);
    setBundleRoomId(fallbackRoomId);
    setManualRoomId(fallbackRoomId);
    setDraftItems([]);
    setSelectedIds([]);
    setManualDescription('');
    setManualQty(1);
    setManualUnit('EA');
    setManualNotes('');
  }, [open, activeRoomId, rooms]);

  const selectedCount = selectedIds.length;
  const queueTotal = draftItems.length;

  if (!open) return null;

  function stageCatalogItem(item: CatalogItem) {
    const roomId = bulkRoomId || activeRoomId || rooms[0]?.id || '';
    setDraftItems((prev) => ([
      ...prev,
      {
        id: createDraftId(),
        roomId,
        description: item.description,
        unit: item.uom,
        qty: 1,
        notes: '',
        sourceType: 'catalog',
        sku: item.sku,
        category: item.category,
        subcategory: item.subcategory || null,
        materialCost: item.baseMaterialCost,
        laborMinutes: item.baseLaborMinutes,
        catalogItemId: item.id,
      },
    ]));
  }

  function addManualDraft() {
    if (!manualDescription.trim()) return;
    setDraftItems((prev) => ([
      ...prev,
      {
        id: createDraftId(),
        roomId: manualRoomId || activeRoomId || rooms[0]?.id || '',
        description: manualDescription.trim(),
        unit: manualUnit || 'EA',
        qty: manualQty > 0 ? manualQty : 1,
        notes: manualNotes.trim(),
        sourceType: 'manual',
        materialCost: 0,
        laborMinutes: 0,
      },
    ]));
    setManualDescription('');
    setManualQty(1);
    setManualUnit('EA');
    setManualNotes('');
  }

  function toggleSelected(id: string) {
    setSelectedIds((prev) => prev.includes(id) ? prev.filter((entry) => entry !== id) : [...prev, id]);
  }

  function updateDraft(id: string, updates: Partial<DraftItem>) {
    setDraftItems((prev) => prev.map((item) => item.id === id ? { ...item, ...updates } : item));
  }

  function removeDraft(id: string) {
    setDraftItems((prev) => prev.filter((item) => item.id !== id));
    setSelectedIds((prev) => prev.filter((entry) => entry !== id));
  }

  function applyRoomToSelected() {
    if (!bulkRoomId) return;
    setDraftItems((prev) => prev.map((item) => {
      if (selectedIds.length > 0 && !selectedIds.includes(item.id)) return item;
      return { ...item, roomId: bulkRoomId };
    }));
  }

  async function commitDraftItems() {
    if (!draftItems.length || saving) return;
    setSaving(true);
    try {
      await onAddItems(draftItems.map(({ id, ...item }) => item));
      setDraftItems([]);
      setSelectedIds([]);
    } finally {
      setSaving(false);
    }
  }

  async function applyBundleFromModal(bundleId: string) {
    if (!bundleRoomId || bundleApplyingId) return;
    setBundleApplyingId(bundleId);
    try {
      await onApplyBundle(bundleId, bundleRoomId);
    } finally {
      setBundleApplyingId(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/45 p-3 sm:p-6" onClick={onClose}>
      <div className="mx-auto flex h-[92vh] w-full max-w-7xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="border-b border-slate-200 px-5 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Bulk Add Workflow</p>
              <h3 className="mt-1 text-base font-semibold text-slate-900">Add Items To Project Estimate</h3>
              <p className="mt-1 text-xs text-slate-600">Search the catalog, stage multiple items, assign rooms in bulk, add manual rows, and apply bundles without reopening the workflow.</p>
            </div>
            <button className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium hover:bg-slate-50" onClick={onClose}>Close</button>
          </div>
        </div>
        <div className="grid min-h-0 flex-1 grid-cols-1 xl:grid-cols-[minmax(0,1.25fr)_420px]">
          <section className="flex min-h-0 flex-col border-b border-slate-200 xl:border-b-0 xl:border-r">
            <div className="border-b border-slate-200 bg-slate-50/70 px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative min-w-[220px] flex-1">
                  <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input value={search} onChange={(e) => onSearch(e.target.value)} className="h-10 w-full rounded-md border border-slate-300 pl-8 pr-3 text-sm" placeholder="Search catalog by SKU or description" />
                </div>
                <select value={category} onChange={(e) => onCategory(e.target.value)} className="h-10 rounded-md border border-slate-300 px-3 text-sm">
                  {categories.map((entry) => <option key={entry} value={entry}>{entry === 'all' ? 'All Categories' : entry}</option>)}
                </select>
                <select value={bulkRoomId} onChange={(e) => setBulkRoomId(e.target.value)} className="h-10 rounded-md border border-slate-300 px-3 text-sm">
                  {rooms.map((room) => <option key={room.id} value={room.id}>Default room: {room.roomName}</option>)}
                </select>
              </div>
            </div>

            <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px]">
              <div className="min-h-0 overflow-y-auto p-4">
                <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
                  {items.map((item) => (
                    <div key={item.id} className="rounded-xl border border-slate-200 p-3 shadow-sm transition hover:border-blue-300 hover:bg-blue-50/30">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-[11px] uppercase tracking-wide text-slate-500">{item.category}</p>
                          <p className="mt-1 text-sm font-semibold text-slate-900">{item.description}</p>
                        </div>
                        <span className="text-[11px] text-slate-500">{item.sku}</span>
                      </div>
                      <p className="mt-2 text-xs text-slate-600">Mat {formatCurrencySafe(item.baseMaterialCost)} • {formatNumberSafe(item.baseLaborMinutes, 1)} labor min • {item.uom}</p>
                      <div className="mt-3 flex items-center justify-between gap-2">
                        <p className="text-[11px] text-slate-500">Stages into the queue without closing the modal.</p>
                        <button onClick={() => stageCatalogItem(item)} className="inline-flex h-8 items-center gap-1 rounded-md border border-blue-300 bg-blue-50 px-2.5 text-[11px] font-semibold text-blue-800 hover:bg-blue-100">
                          <Plus className="h-3.5 w-3.5" />
                          Stage Item
                        </button>
                      </div>
                    </div>
                  ))}
                  {items.length === 0 ? <div className="rounded-xl border border-dashed border-slate-300 p-6 text-sm text-slate-500">No catalog matches for the current search.</div> : null}
                </div>
              </div>

              <div className="border-t border-slate-200 bg-slate-50/60 p-4 lg:border-l lg:border-t-0">
                <div className="rounded-xl border border-slate-200 bg-white p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Manual Add</p>
                  <div className="mt-2 space-y-2">
                    <input value={manualDescription} onChange={(e) => setManualDescription(e.target.value)} className="h-9 w-full rounded-md border border-slate-300 px-3 text-sm" placeholder="Manual description" />
                    <div className="grid grid-cols-3 gap-2">
                      <input type="number" value={manualQty} onChange={(e) => setManualQty(Number(e.target.value) || 1)} className="h-9 rounded-md border border-slate-300 px-3 text-sm" placeholder="Qty" />
                      <input value={manualUnit} onChange={(e) => setManualUnit(e.target.value)} className="h-9 rounded-md border border-slate-300 px-3 text-sm" placeholder="Unit" />
                      <select value={manualRoomId} onChange={(e) => setManualRoomId(e.target.value)} className="h-9 rounded-md border border-slate-300 px-3 text-sm">
                        {rooms.map((room) => <option key={room.id} value={room.id}>{room.roomName}</option>)}
                      </select>
                    </div>
                    <textarea value={manualNotes} onChange={(e) => setManualNotes(e.target.value)} rows={2} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="Optional notes" />
                    <button onClick={addManualDraft} className="h-8 rounded-md border border-slate-300 px-3 text-[11px] font-semibold hover:bg-slate-50">Stage Manual Row</button>
                  </div>
                </div>

                <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Quick Add Bundle</p>
                      <p className="mt-1 text-xs text-slate-600">Apply a prebuilt scope bundle to a room without leaving this session.</p>
                    </div>
                    <Layers3 className="h-4 w-4 text-slate-400" />
                  </div>
                  <div className="mt-2 space-y-2">
                    <select value={bundleRoomId} onChange={(e) => setBundleRoomId(e.target.value)} className="h-9 w-full rounded-md border border-slate-300 px-3 text-sm">
                      {rooms.map((room) => <option key={room.id} value={room.id}>Bundle room: {room.roomName}</option>)}
                    </select>
                    <div className="max-h-48 space-y-1.5 overflow-y-auto pr-0.5">
                      {bundles.map((bundle) => (
                        <button key={bundle.id} onClick={() => void applyBundleFromModal(bundle.id)} disabled={bundleApplyingId === bundle.id || !bundleRoomId} className="w-full rounded-lg border border-slate-300 p-2 text-left hover:border-blue-300 hover:bg-blue-50/40 disabled:opacity-50">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-semibold text-slate-800">{bundle.bundleName}</span>
                            <span className="text-[11px] text-slate-500">{bundle.category || 'General'}</span>
                          </div>
                          <p className="mt-1 text-[11px] text-slate-500">{bundleApplyingId === bundle.id ? 'Applying bundle...' : 'Add this bundle to the selected room'}</p>
                        </button>
                      ))}
                      {bundles.length === 0 ? <p className="text-xs text-slate-500">No bundles available.</p> : null}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <aside className="flex min-h-0 flex-col bg-white">
            <div className="border-b border-slate-200 px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Staged Queue</p>
                  <h4 className="mt-1 text-sm font-semibold text-slate-900">{queueTotal} item{queueTotal === 1 ? '' : 's'} ready</h4>
                  <p className="mt-1 text-xs text-slate-600">Assign rooms per item, select a group, then push everything into the estimate at once.</p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <select value={bulkRoomId} onChange={(e) => setBulkRoomId(e.target.value)} className="h-9 min-w-[170px] rounded-md border border-slate-300 px-3 text-sm">
                  {rooms.map((room) => <option key={room.id} value={room.id}>{room.roomName}</option>)}
                </select>
                <button onClick={applyRoomToSelected} disabled={!bulkRoomId || draftItems.length === 0} className="h-9 rounded-md border border-slate-300 px-3 text-[11px] font-semibold hover:bg-slate-50 disabled:opacity-50">
                  {selectedCount > 0 ? `Apply Room To ${selectedCount} Selected` : 'Apply Room To All'}
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
              <div className="space-y-2">
                {draftItems.map((item) => (
                  <div key={item.id} className="rounded-xl border border-slate-200 p-3 shadow-sm">
                    <div className="flex items-start gap-2">
                      <input type="checkbox" checked={selectedIds.includes(item.id)} onChange={() => toggleSelected(item.id)} className="mt-1" />
                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-slate-900">{item.description}</p>
                            <p className="mt-0.5 text-[11px] text-slate-500">{item.sourceType === 'catalog' ? `${item.category || 'Catalog'} • ${item.sku || 'No SKU'}` : 'Manual line item'}</p>
                          </div>
                          <button onClick={() => removeDraft(item.id)} className="rounded-md border border-slate-200 p-1 text-slate-500 hover:bg-red-50 hover:text-red-700"><Trash2 className="h-3.5 w-3.5" /></button>
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          <input type="number" value={item.qty} onChange={(e) => updateDraft(item.id, { qty: Number(e.target.value) || 0 })} className="h-8 rounded-md border border-slate-300 px-2 text-sm" />
                          <input value={item.unit} onChange={(e) => updateDraft(item.id, { unit: e.target.value })} className="h-8 rounded-md border border-slate-300 px-2 text-sm" />
                          <select value={item.roomId} onChange={(e) => updateDraft(item.id, { roomId: e.target.value })} className="h-8 rounded-md border border-slate-300 px-2 text-sm">
                            {rooms.map((room) => <option key={room.id} value={room.id}>{room.roomName}</option>)}
                          </select>
                        </div>
                        <textarea value={item.notes} onChange={(e) => updateDraft(item.id, { notes: e.target.value })} rows={2} className="w-full rounded-md border border-slate-300 px-2 py-2 text-sm" placeholder="Notes" />
                      </div>
                    </div>
                  </div>
                ))}
                {draftItems.length === 0 ? <div className="rounded-xl border border-dashed border-slate-300 p-6 text-sm text-slate-500">Stage catalog items or manual rows to build a multi-item add session.</div> : null}
              </div>
            </div>

            <div className="border-t border-slate-200 px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-slate-600">The modal stays open after adding so you can keep building the estimate.</p>
                <button onClick={() => void commitDraftItems()} disabled={draftItems.length === 0 || saving} className="inline-flex h-10 items-center rounded-md bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50">
                  {saving ? 'Adding Items...' : `Add ${draftItems.length} Item${draftItems.length === 1 ? '' : 's'} To Estimate`}
                </button>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
