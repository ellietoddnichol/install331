import React, { useEffect, useMemo, useState } from 'react';
import { Layers3, Plus, Search, Trash2 } from 'lucide-react';
import { api } from '../../services/api';
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
  catalogAttributeSnapshot?: Array<{
    attributeType: 'finish' | 'coating' | 'grip' | 'mounting' | 'assembly';
    attributeValue: string;
    source: 'user' | 'inferred';
  }> | null;
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
  const [catalogQtyById, setCatalogQtyById] = useState<Record<string, number>>({});
  const [bulkRoomId, setBulkRoomId] = useState('');
  const [bundleRoomId, setBundleRoomId] = useState('');
  const [manualDescription, setManualDescription] = useState('');
  const [manualQty, setManualQty] = useState(1);
  const [manualUnit, setManualUnit] = useState('EA');
  const [manualNotes, setManualNotes] = useState('');
  const [manualRoomId, setManualRoomId] = useState('');
  const [saving, setSaving] = useState(false);
  const [bundleApplyingId, setBundleApplyingId] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<CatalogItem[] | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [itemAttributes, setItemAttributes] = useState<Record<string, import('../../types').CatalogItemAttribute[]>>({});
  const [attributesLoadingItemId, setAttributesLoadingItemId] = useState<string | null>(null);
  const [attributePickerItemId, setAttributePickerItemId] = useState<string | null>(null);
  const [attributeSelection, setAttributeSelection] = useState<Record<string, string[]>>({});
  const [inferredAttributesByItemId, setInferredAttributesByItemId] = useState<Record<string, DraftItem['catalogAttributeSnapshot']>>({});

  useEffect(() => {
    if (!open) return;
    const fallbackRoomId = activeRoomId || rooms[0]?.id || '';
    setBulkRoomId(fallbackRoomId);
    setBundleRoomId(fallbackRoomId);
    setManualRoomId(fallbackRoomId);
    setCatalogQtyById({});
    setDraftItems([]);
    setSelectedIds([]);
    setManualDescription('');
    setManualQty(1);
    setManualUnit('EA');
    setManualNotes('');
  }, [open, activeRoomId, rooms]);

  useEffect(() => {
    if (!open) return;
    const q = search.trim();
    if (!q) {
      setSearchResults(null);
      setSearchLoading(false);
      return;
    }
    let cancelled = false;
    setSearchLoading(true);
    void api
      .searchCatalogItems({
        query: q,
        category: category && category !== 'all' ? category : undefined,
        includeDeprecated: false,
        includeNonCanonical: false,
        includeInactive: false,
      })
      .then((rows) => {
        if (cancelled) return;
        setSearchResults(rows);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('Catalog search failed', err);
        setSearchResults([]);
      })
      .finally(() => {
        if (cancelled) return;
        setSearchLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, search, category]);

  function inferAttributesFromText(text: string): DraftItem['catalogAttributeSnapshot'] {
    const t = text.toLowerCase();
    const out: NonNullable<DraftItem['catalogAttributeSnapshot']> = [];
    const push = (attributeType: DraftItem['catalogAttributeSnapshot'][number]['attributeType'], attributeValue: string) => {
      out.push({ attributeType, attributeValue, source: 'inferred' });
    };
    if (t.includes('matte black')) push('finish', 'MATTE_BLACK');
    if (t.includes('antimicrobial')) push('coating', 'ANTIMICROBIAL');
    if (t.includes('peened')) push('grip', 'PEENED');
    if (t.includes('semi-recess')) push('mounting', 'SEMI_RECESSED');
    else if (t.includes('recess')) push('mounting', 'RECESSED');
    if (t.includes('surface')) push('mounting', 'SURFACE');
    if (t.includes('kd') || t.includes('knock down') || t.includes('knock-down')) push('assembly', 'KD');
    return out.length ? out : null;
  }

  async function ensureAttributesLoaded(itemId: string) {
    if (itemAttributes[itemId]) return;
    setAttributesLoadingItemId(itemId);
    try {
      const rows = await api.listCatalogItemAttributes(itemId);
      setItemAttributes((prev) => ({ ...prev, [itemId]: rows }));
    } finally {
      setAttributesLoadingItemId(null);
    }
  }

  const selectedCount = selectedIds.length;
  const queueTotal = draftItems.length;
  const queuedUnits = useMemo(
    () => draftItems.reduce((sum, item) => sum + Math.max(0, Number(item.qty || 0)), 0),
    [draftItems]
  );

  const canonicalDefaultItems = useMemo(() => {
    return items.filter((i) => !i.deprecated && i.isCanonical !== false);
  }, [items]);

  const displayedItems = searchResults ?? canonicalDefaultItems;

  useEffect(() => {
    if (!open) return;
    const q = search.trim();
    if (!q) {
      setInferredAttributesByItemId({});
      return;
    }
    const inferred = inferAttributesFromText(q);
    if (!inferred) {
      setInferredAttributesByItemId({});
      return;
    }
    // Apply inferred attributes to all items shown; user can override per item.
    setInferredAttributesByItemId((prev) => {
      const next: typeof prev = { ...prev };
      for (const item of displayedItems) next[item.id] = inferred;
      return next;
    });
  }, [open, search, displayedItems]);

  if (!open) return null;

  function stageCatalogItem(item: CatalogItem) {
    const roomId = bulkRoomId || activeRoomId || rooms[0]?.id || '';
    const qty = Math.max(1, Number(catalogQtyById[item.id] || 1));
    const chosenValues = attributeSelection[item.id] || [];
    const chosenAttributes =
      chosenValues.length > 0
        ? chosenValues.map((value) => {
            // Encode as "type:value" for simplicity in this lightweight UI.
            const [attributeType, ...rest] = value.split(':');
            return { attributeType: attributeType as any, attributeValue: rest.join(':'), source: 'user' as const };
          })
        : null;
    const inferred = inferredAttributesByItemId[item.id] || null;
    const snapshot = (chosenAttributes && chosenAttributes.length ? chosenAttributes : inferred) || null;
    setDraftItems((prev) => ([
      ...prev,
      {
        id: createDraftId(),
        roomId,
        description: item.description,
        unit: item.uom,
        qty,
        notes: snapshot ? `${snapshot.map((a) => `${a.attributeType}:${a.attributeValue}`).join(' · ')}` : '',
        sourceType: 'catalog',
        sku: item.sku,
        category: item.category,
        subcategory: item.subcategory || null,
        materialCost: item.baseMaterialCost,
        laborMinutes: item.baseLaborMinutes,
        catalogItemId: item.id,
        catalogAttributeSnapshot: snapshot,
      },
    ]));
  }

  function normalizePercentForDisplay(raw: number): number {
    if (!Number.isFinite(raw)) return 0;
    return Math.abs(raw) > 0 && Math.abs(raw) <= 1 ? raw * 100 : raw;
  }

  function describeAttributeDeltas(attr: import('../../types').CatalogItemAttribute): string[] {
    const parts: string[] = [];
    if (attr.materialDeltaType && attr.materialDeltaValue != null) {
      const raw = Number(attr.materialDeltaValue || 0);
      if (attr.materialDeltaType === 'absolute') parts.push(`${raw >= 0 ? '+' : ''}${formatCurrencySafe(raw)} material`);
      if (attr.materialDeltaType === 'percent') {
        const pct = normalizePercentForDisplay(raw);
        parts.push(`${pct >= 0 ? '+' : ''}${formatNumberSafe(pct, 1)}% material`);
      }
    }
    if (attr.laborDeltaType && attr.laborDeltaValue != null) {
      const raw = Number(attr.laborDeltaValue || 0);
      if (attr.laborDeltaType === 'minutes' || attr.laborDeltaType === 'absolute') parts.push(`${raw >= 0 ? '+' : ''}${formatNumberSafe(raw, 1)} min labor`);
      if (attr.laborDeltaType === 'percent') {
        const pct = normalizePercentForDisplay(raw);
        parts.push(`${pct >= 0 ? '+' : ''}${formatNumberSafe(pct, 1)}% labor`);
      }
    }
    return parts;
  }

  function applySelectedAttributeDeltas(
    baseMaterialCost: number,
    baseLaborMinutes: number,
    attrs: import('../../types').CatalogItemAttribute[],
    selectedKeys: Set<string>
  ): { materialCost: number; laborMinutes: number; applied: import('../../types').CatalogItemAttribute[] } {
    const percentFactor = (value: number) => (Math.abs(value) > 1 ? value / 100 : value);
    const activeSelected = attrs.filter((a) => a.active && selectedKeys.has(`${a.attributeType}:${a.attributeValue}`));
    let materialCost = baseMaterialCost;
    let laborMinutes = baseLaborMinutes;
    for (const a of activeSelected) {
      const mType = a.materialDeltaType || null;
      const mVal = Number(a.materialDeltaValue ?? 0);
      if (mType === 'absolute') materialCost += mVal;
      if (mType === 'percent') materialCost += baseMaterialCost * percentFactor(mVal);

      const lType = a.laborDeltaType || null;
      const lVal = Number(a.laborDeltaValue ?? 0);
      if (lType === 'minutes' || lType === 'absolute') laborMinutes += lVal;
      if (lType === 'percent') laborMinutes += baseLaborMinutes * percentFactor(lVal);
    }
    return { materialCost, laborMinutes, applied: activeSelected };
  }

  async function stageBundleDraft(bundleId: string) {
    if (!bundleRoomId || bundleApplyingId) return;
    const bundle = bundles.find((entry) => entry.id === bundleId);
    if (!bundle) return;

    setBundleApplyingId(bundleId);
    try {
      const bundleItems = await api.getV1BundleItems(bundleId);
      setDraftItems((prev) => ([
        ...prev,
        ...bundleItems.map((item) => ({
          id: createDraftId(),
          roomId: bundleRoomId,
          description: item.description,
          unit: 'EA',
          qty: Math.max(1, Number(item.qty || 1)),
          notes: [bundle.bundleName, item.notes || ''].filter(Boolean).join(' · '),
          sourceType: item.catalogItemId ? 'catalog' : 'manual',
          sku: item.sku,
          category: bundle.category,
          subcategory: null,
          materialCost: Number(item.materialCost || 0),
          laborMinutes: Number(item.laborMinutes || 0),
          catalogItemId: item.catalogItemId,
        })),
      ]));
    } finally {
      setBundleApplyingId(null);
    }
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
              <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-slate-500">Bulk Add Workflow</p>
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
                  <input value={search} onChange={(e) => onSearch(e.target.value)} className="h-10 w-full rounded-md border border-slate-300 pl-10 pr-3 text-sm" placeholder="Search SKU, description, category, family, manufacturer, model, tags…" />
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
                  {displayedItems.map((item) => (
                    <div key={item.id} className="rounded-xl border border-slate-200 p-3 shadow-sm transition hover:border-blue-300 hover:bg-blue-50/30">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-[11px] uppercase tracking-wide text-slate-500">{item.category}</p>
                          <p className="mt-1 text-sm font-semibold text-slate-900">{item.description}</p>
                        </div>
                        <span className="text-[11px] text-slate-500">{item.sku}</span>
                      </div>
                      <p className="mt-2 text-xs text-slate-600">Mat {formatCurrencySafe(item.baseMaterialCost)} • {formatNumberSafe(item.baseLaborMinutes, 1)} labor min • {item.uom}</p>
                      {(inferredAttributesByItemId[item.id] && inferredAttributesByItemId[item.id]!.length > 0) ? (
                        <p className="mt-1 text-[11px] text-slate-500">
                          Inferred: {inferredAttributesByItemId[item.id]!.map((a) => `${a.attributeType}:${a.attributeValue}`).join(' · ')}
                        </p>
                      ) : null}
                      <div className="mt-3 flex items-center justify-between gap-2">
                        <p className="text-[11px] text-slate-500">Stages into the queue without closing the modal.</p>
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min={1}
                            value={Math.max(1, Number(catalogQtyById[item.id] || 1))}
                            onChange={(e) => setCatalogQtyById((prev) => ({ ...prev, [item.id]: Math.max(1, Number(e.target.value) || 1) }))}
                            className="h-8 w-16 rounded-md border border-slate-300 px-2 text-[11px]"
                            aria-label={`Quantity for ${item.description}`}
                          />
                          <button
                            type="button"
                            className="h-8 rounded-md border border-slate-300 px-2 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                            onClick={async () => {
                              setAttributePickerItemId(item.id);
                              await ensureAttributesLoaded(item.id);
                            }}
                          >
                            Options
                          </button>
                          <button onClick={() => stageCatalogItem(item)} className="inline-flex h-8 items-center gap-1 rounded-md border border-blue-300 bg-blue-50 px-2.5 text-[11px] font-semibold text-blue-800 hover:bg-blue-100">
                          <Plus className="h-3.5 w-3.5" />
                            {`Stage ${Math.max(1, Number(catalogQtyById[item.id] || 1))} ${Math.max(1, Number(catalogQtyById[item.id] || 1)) === 1 ? 'Item' : 'Items'}`}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                  {searchLoading ? (
                    <div className="rounded-xl border border-dashed border-slate-300 p-6 text-sm text-slate-500">Searching…</div>
                  ) : displayedItems.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-300 p-6 text-sm text-slate-500">No catalog matches for the current search.</div>
                  ) : null}
                </div>
              </div>

              <div className="border-t border-slate-200 bg-slate-50/60 p-4 lg:border-l lg:border-t-0">
                <div className="rounded-xl border border-slate-200 bg-white p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.05em] text-slate-500">Manual Add</p>
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
                    <button onClick={addManualDraft} className="h-8 rounded-md border border-slate-300 px-3 text-[11px] font-semibold hover:bg-slate-50">{`Stage ${Math.max(1, manualQty)} Manual ${Math.max(1, manualQty) === 1 ? 'Item' : 'Items'}`}</button>
                  </div>
                </div>

                <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.05em] text-slate-500">Quick Add Bundle</p>
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
                        <button key={bundle.id} onClick={() => void stageBundleDraft(bundle.id)} disabled={bundleApplyingId === bundle.id || !bundleRoomId} className="w-full rounded-lg border border-slate-300 p-2 text-left hover:border-blue-300 hover:bg-blue-50/40 disabled:opacity-50">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-semibold text-slate-800">{bundle.bundleName}</span>
                            <span className="text-[11px] text-slate-500">{bundle.category || 'General'}</span>
                          </div>
                          <p className="mt-1 text-[11px] text-slate-500">{bundleApplyingId === bundle.id ? 'Staging bundle...' : 'Stage this bundle into the queue for review first'}</p>
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
                  <p className="text-[10px] font-semibold uppercase tracking-[0.05em] text-slate-500">Staged Queue</p>
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
                  {saving ? 'Adding Items...' : `Add ${queuedUnits} Unit${queuedUnits === 1 ? '' : 's'} To Estimate`}
                </button>
              </div>
            </div>
          </aside>
        </div>
      </div>

      {attributePickerItemId ? (
        <div className="fixed inset-0 z-[60] bg-slate-950/45 p-3 sm:p-6" onClick={() => setAttributePickerItemId(null)}>
          <div className="mx-auto w-full max-w-xl rounded-2xl border border-slate-200 bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="border-b border-slate-200 px-5 py-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-slate-500">Item options</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">Choose attributes (optional)</p>
                  <p className="mt-1 text-xs text-slate-600">Snapshot is stored on the new line; pricing preview updates as you toggle options.</p>
                </div>
                <button className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium hover:bg-slate-50" onClick={() => setAttributePickerItemId(null)}>
                  Close
                </button>
              </div>
            </div>
            <div className="p-5">
              {(() => {
                const itemId = attributePickerItemId;
                if (!itemId) return null;
                const pickerItem = (displayedItems || []).find((i) => i.id === attributePickerItemId) || items.find((i) => i.id === attributePickerItemId) || null;
                const baseMat = pickerItem?.baseMaterialCost ?? 0;
                const baseMin = pickerItem?.baseLaborMinutes ?? 0;
                const selectedKeys = new Set<string>(attributeSelection[itemId] || []);
                const attrs = itemAttributes[itemId] || [];
                const preview = applySelectedAttributeDeltas(baseMat, baseMin, attrs, selectedKeys);
                const applied = preview.applied;
                return (
                  <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50/50 p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-slate-500">Pricing preview</p>
                    <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <div className="rounded-lg bg-white px-3 py-2 ring-1 ring-slate-200/80">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-slate-500">Base</p>
                        <p className="mt-1 text-xs text-slate-700">
                          Material {formatCurrencySafe(baseMat)} • Labor {formatNumberSafe(baseMin, 1)} min
                        </p>
                      </div>
                      <div className="rounded-lg bg-white px-3 py-2 ring-1 ring-slate-200/80">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-slate-500">With selected options</p>
                        <p className="mt-1 text-xs font-semibold text-slate-900">
                          Material {formatCurrencySafe(preview.materialCost)} • Labor {formatNumberSafe(preview.laborMinutes, 1)} min
                        </p>
                      </div>
                    </div>
                    {applied.length > 0 ? (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {applied.map((a) => {
                          const key = `${a.attributeType}:${a.attributeValue}`;
                          const deltas = describeAttributeDeltas(a);
                          const label = deltas.length ? deltas.join(' • ') : 'No pricing effect';
                          return (
                            <span key={key} className="rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-slate-700 ring-1 ring-slate-200/80" title="Applied from selected options">
                              {a.attributeType}:{a.attributeValue} — {label}
                            </span>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="mt-2 text-[11px] text-slate-500">Select options below to see the impact on this line.</p>
                    )}
                  </div>
                );
              })()}
              {attributesLoadingItemId === attributePickerItemId && !itemAttributes[attributePickerItemId] ? (
                <div className="text-sm text-slate-600">Loading attributes…</div>
              ) : (
                <div className="space-y-3">
                  {(['finish', 'mounting', 'coating', 'grip', 'assembly'] as const).map((type) => {
                    const options = (itemAttributes[attributePickerItemId] || []).filter((a) => a.active && a.attributeType === type);
                    if (options.length === 0) return null;
                    const selected = new Set<string>(attributeSelection[attributePickerItemId] || []);
                    return (
                      <div key={type} className="rounded-xl border border-slate-200 p-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-500">{type}</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {options.map((opt) => {
                            const key = `${opt.attributeType}:${opt.attributeValue}`;
                            const active = selected.has(key);
                            const deltaParts = describeAttributeDeltas(opt);
                            return (
                              <button
                                key={opt.id}
                                type="button"
                                className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${active ? 'border-blue-300 bg-blue-50 text-blue-800' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}
                                onClick={() => {
                                  setAttributeSelection((prev) => {
                                    const current = new Set(prev[attributePickerItemId] || []);
                                    if (current.has(key)) current.delete(key);
                                    else current.add(key);
                                    return { ...prev, [attributePickerItemId]: Array.from(current) };
                                  });
                                }}
                                title={deltaParts.length ? deltaParts.join(' • ') : 'No pricing effect'}
                              >
                                <span className="inline-flex items-center gap-1.5">
                                  <span>{opt.attributeValue}</span>
                                  {deltaParts.length ? <span className="text-[10px] font-medium opacity-80">({deltaParts[0]})</span> : null}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
