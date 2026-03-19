import React, { useEffect, useMemo, useState } from 'react';
import { Layers3, Search, Trash2 } from 'lucide-react';
import { api } from '../../services/api';
import { BundleItemRecord, BundleRecord, RoomRecord } from '../../shared/types/estimator';

interface StagedBundle {
  id: string;
  bundleId: string;
  bundleName: string;
  roomId: string;
  roomName: string;
  itemCount: number;
  quantityTotal: number;
}

interface Props {
  open: boolean;
  bundles: BundleRecord[];
  rooms: RoomRecord[];
  activeRoomId: string;
  onClose: () => void;
  onApplyBundle: (bundleId: string, roomId: string) => Promise<void>;
}

export function BundlePickerModal({ open, bundles, rooms, activeRoomId, onClose, onApplyBundle }: Props) {
  const [search, setSearch] = useState('');
  const [roomId, setRoomId] = useState('');
  const [applyingBundleId, setApplyingBundleId] = useState<string | null>(null);
  const [committingStaged, setCommittingStaged] = useState(false);
  const [selectedBundleId, setSelectedBundleId] = useState<string>('');
  const [bundleItems, setBundleItems] = useState<BundleItemRecord[]>([]);
  const [bundleItemsLoading, setBundleItemsLoading] = useState(false);
  const [bundleQuantities, setBundleQuantities] = useState<Record<string, number>>({});
  const [stagedBundles, setStagedBundles] = useState<StagedBundle[]>([]);

  useEffect(() => {
    if (!open) return;
    setSearch('');
    setRoomId(activeRoomId || rooms[0]?.id || '');
    setSelectedBundleId(bundles[0]?.id || '');
    setBundleQuantities({});
    setStagedBundles([]);
  }, [open, activeRoomId, rooms]);

  useEffect(() => {
    if (!open || !selectedBundleId) {
      setBundleItems([]);
      return;
    }

    let cancelled = false;
    setBundleItemsLoading(true);
    api.getV1BundleItems(selectedBundleId)
      .then((items) => {
        if (!cancelled) {
          setBundleItems(items);
          setBundleQuantities((prev) => ({
            ...prev,
            [selectedBundleId]: items.reduce((sum, item) => sum + Math.max(1, Number(item.qty || 1)), 0),
          }));
        }
      })
      .catch(() => {
        if (!cancelled) setBundleItems([]);
      })
      .finally(() => {
        if (!cancelled) setBundleItemsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, selectedBundleId]);

  const filteredBundles = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return bundles;
    return bundles.filter((bundle) => {
      const haystack = `${bundle.bundleName} ${bundle.category || ''}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [bundles, search]);

  const selectedBundle = filteredBundles.find((bundle) => bundle.id === selectedBundleId) || bundles.find((bundle) => bundle.id === selectedBundleId) || null;
  const stagedQuantityTotal = useMemo(
    () => stagedBundles.reduce((sum, bundle) => sum + bundle.quantityTotal, 0),
    [stagedBundles]
  );

  if (!open) return null;

  async function stageBundle(bundleId: string) {
    if (!roomId || applyingBundleId || committingStaged) return;
    const bundle = bundles.find((entry) => entry.id === bundleId);
    if (!bundle) return;

    setApplyingBundleId(bundleId);
    try {
      const items = await api.getV1BundleItems(bundleId);
      const quantityTotal = items.reduce((sum, item) => sum + Math.max(1, Number(item.qty || 1)), 0);
      const roomName = rooms.find((room) => room.id === roomId)?.roomName || 'Selected room';
      setBundleQuantities((prev) => ({ ...prev, [bundleId]: quantityTotal }));
      setStagedBundles((prev) => ([
        ...prev,
        {
          id: `${bundleId}-${roomId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          bundleId,
          bundleName: bundle.bundleName,
          roomId,
          roomName,
          itemCount: items.length,
          quantityTotal,
        },
      ]));
    } finally {
      setApplyingBundleId(null);
    }
  }

  async function commitStagedBundles() {
    if (!stagedBundles.length || committingStaged) return;
    setCommittingStaged(true);
    try {
      for (const bundle of stagedBundles) {
        await onApplyBundle(bundle.bundleId, bundle.roomId);
      }
      onClose();
    } finally {
      setCommittingStaged(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 p-3 sm:p-6" onClick={onClose}>
      <div className="mx-auto flex h-[88vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="border-b border-slate-200 px-5 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Bundle Library</p>
              <h3 className="mt-1 text-base font-semibold text-slate-900">Add Prebuilt Scope Bundles</h3>
              <p className="mt-1 text-xs text-slate-600">Pick a room, review available bundles, and add a full scope package in one step.</p>
            </div>
            <button className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium hover:bg-slate-50" onClick={onClose}>Close</button>
          </div>
        </div>

        <div className="border-b border-slate-200 bg-slate-50/70 px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[220px] flex-1">
              <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-10 w-full rounded-md border border-slate-300 pl-8 pr-3 text-sm"
                placeholder="Search bundles by name or category"
              />
            </div>
            <select value={roomId} onChange={(e) => setRoomId(e.target.value)} className="h-10 rounded-md border border-slate-300 px-3 text-sm min-w-[220px]">
              {rooms.map((room) => <option key={room.id} value={room.id}>Add to room: {room.roomName}</option>)}
            </select>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-hidden p-4">
          <div className="grid h-full grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="min-h-0 overflow-y-auto">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {filteredBundles.map((bundle) => (
              <div key={bundle.id} className={`rounded-2xl border bg-white p-4 shadow-sm transition ${selectedBundleId === bundle.id ? 'border-blue-400 bg-blue-50/30' : 'border-slate-200 hover:border-blue-300 hover:bg-blue-50/20'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.08em] text-slate-500">{bundle.category || 'General Scope'}</p>
                    <h4 className="mt-1 text-sm font-semibold text-slate-900">{bundle.bundleName}</h4>
                  </div>
                  <div className="rounded-full border border-slate-200 bg-slate-50 p-2 text-slate-500">
                    <Layers3 className="h-4 w-4" />
                  </div>
                </div>
                <p className="mt-3 text-xs leading-5 text-slate-600">Bundle application adds the full preset scope to the selected room while preserving estimate pricing logic.</p>
                <div className="mt-4 flex items-center justify-between gap-2">
                  <button onClick={() => setSelectedBundleId(bundle.id)} className="text-[11px] font-medium text-blue-700 hover:text-blue-800">View Details</button>
                  <button onClick={() => void stageBundle(bundle.id)} disabled={!roomId || applyingBundleId === bundle.id || committingStaged} className="inline-flex h-9 items-center rounded-md bg-slate-900 px-3 text-[11px] font-semibold text-white hover:bg-slate-800 disabled:opacity-50">
                    {applyingBundleId === bundle.id ? 'Staging Bundle...' : `Stage ${bundleQuantities[bundle.id] || 0 ? `${bundleQuantities[bundle.id]} Units` : 'Bundle'}`}
                  </button>
                </div>
              </div>
            ))}
            {filteredBundles.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 p-6 text-sm text-slate-500 md:col-span-2 xl:col-span-3">No bundles match the current search.</div>
            ) : null}
              </div>
            </div>

            <aside className="min-h-0 overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Bundle Detail</p>
              {selectedBundle ? (
                <>
                  <h4 className="mt-1 text-sm font-semibold text-slate-900">{selectedBundle.bundleName}</h4>
                  <p className="mt-1 text-xs text-slate-600">Category: {selectedBundle.category || 'General Scope'}</p>
                  <p className="mt-1 text-xs text-slate-500">Stage this bundle first, then commit the full staged list once the room targets look right.</p>
                  <p className="mt-3 text-[11px] font-medium text-slate-700">Items</p>
                  <div className="mt-2 space-y-2">
                    {bundleItemsLoading ? <p className="text-xs text-slate-500">Loading bundle items...</p> : null}
                    {!bundleItemsLoading && bundleItems.length === 0 ? <p className="text-xs text-slate-500">No bundle items found.</p> : null}
                    {bundleItems.map((item) => (
                      <div key={item.id} className="rounded-xl border border-slate-200 bg-white p-2.5">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-xs font-semibold text-slate-900">{item.description}</p>
                            <p className="mt-1 text-[11px] text-slate-500">Qty {item.qty} {item.sku ? `• ${item.sku}` : ''}</p>
                          </div>
                          <div className="text-right text-[11px] text-slate-500">
                            <p>{item.materialCost.toFixed(2)} mat</p>
                            <p>{item.laborMinutes.toFixed(1)} labor min</p>
                          </div>
                        </div>
                        {item.notes ? <p className="mt-1 text-[11px] text-slate-500">{item.notes}</p> : null}
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 border-t border-slate-200 pt-4">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Staged Bundles</p>
                        <p className="mt-1 text-xs text-slate-600">{stagedBundles.length} staged bundle{stagedBundles.length === 1 ? '' : 's'} · {stagedQuantityTotal} total units</p>
                      </div>
                    </div>
                    <div className="mt-3 space-y-2">
                      {stagedBundles.map((bundle) => (
                        <div key={bundle.id} className="rounded-xl border border-slate-200 bg-white p-2.5">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="text-xs font-semibold text-slate-900">{bundle.bundleName}</p>
                              <p className="mt-1 text-[11px] text-slate-500">{bundle.roomName} · {bundle.itemCount} lines · {bundle.quantityTotal} units</p>
                            </div>
                            <button onClick={() => setStagedBundles((prev) => prev.filter((entry) => entry.id !== bundle.id))} className="rounded-md border border-slate-200 p-1 text-slate-500 hover:bg-red-50 hover:text-red-700">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                      {stagedBundles.length === 0 ? <p className="text-xs text-slate-500">No bundles staged yet.</p> : null}
                    </div>
                    <button onClick={() => void commitStagedBundles()} disabled={stagedBundles.length === 0 || committingStaged} className="mt-4 inline-flex h-10 w-full items-center justify-center rounded-md bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50">
                      {committingStaged ? 'Adding Bundles...' : `Add ${stagedQuantityTotal} Bundle Unit${stagedQuantityTotal === 1 ? '' : 's'} To Estimate`}
                    </button>
                  </div>
                </>
              ) : (
                <p className="mt-2 text-xs text-slate-500">Select a bundle to review its included items.</p>
              )}
            </aside>
          </div>
        </div>
      </div>
    </div>
  );
}