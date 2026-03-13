import React, { useEffect, useMemo, useState } from 'react';
import { ArrowUpDown, Database, Edit2, Package, Plus, RefreshCw, Search, ShieldCheck, Trash2 } from 'lucide-react';
import { api } from '../services/api';
import { CatalogSyncStatusRecord, BundleRecord, ModifierRecord } from '../shared/types/estimator';
import { CatalogItem } from '../types';
import { formatCurrencySafe, formatNumberSafe, formatPercentSafe } from '../utils/numberFormat';

type SortKey = 'sku-asc' | 'sku-desc' | 'name-asc' | 'name-desc' | 'category-asc' | 'material-desc' | 'labor-desc';
type CatalogTab = 'items' | 'modifiers' | 'bundles';

function statusClass(status: CatalogSyncStatusRecord['status']): string {
  if (status === 'success') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (status === 'running') return 'border-blue-200 bg-blue-50 text-blue-700';
  if (status === 'failed') return 'border-red-200 bg-red-50 text-red-700';
  return 'border-slate-300 bg-slate-100 text-slate-600';
}

export function Catalog() {
  const [activeTab, setActiveTab] = useState<CatalogTab>('items');
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [modifiers, setModifiers] = useState<ModifierRecord[]>([]);
  const [bundles, setBundles] = useState<BundleRecord[]>([]);
  const [syncStatus, setSyncStatus] = useState<CatalogSyncStatusRecord | null>(null);

  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [sortBy, setSortBy] = useState<SortKey>('sku-asc');
  const [editingItem, setEditingItem] = useState<CatalogItem | null>(null);

  useEffect(() => {
    void loadCatalogWorkspace();
  }, []);

  async function loadCatalogWorkspace() {
    try {
      const [itemData, modifierData, bundleData, syncData] = await Promise.all([
        api.getCatalog(),
        api.getCatalogModifiers(),
        api.getCatalogBundles(),
        api.getCatalogSyncStatus(),
      ]);
      setItems(itemData);
      setModifiers(modifierData);
      setBundles(bundleData);
      setSyncStatus(syncData);
    } catch (err) {
      console.error('Failed to load catalog workspace', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSyncCatalog() {
    setSyncing(true);
    try {
      await api.syncV1Catalog();
      await loadCatalogWorkspace();
    } catch (error) {
      console.error('Catalog sync failed', error);
      await loadCatalogWorkspace();
      alert(error instanceof Error ? error.message : 'Catalog sync failed.');
    } finally {
      setSyncing(false);
    }
  }

  const categories = useMemo(() => ['all', ...Array.from(new Set(items.map((i) => i.category))).sort()], [items]);
  const itemTypes = useMemo(
    () => ['all', ...Array.from(new Set(items.map((i) => i.family || i.subcategory || 'Standard'))).sort()],
    [items]
  );

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    return items
      .filter((item) => {
        const textMatch =
          !query ||
          item.description.toLowerCase().includes(query) ||
          item.sku.toLowerCase().includes(query) ||
          item.category.toLowerCase().includes(query) ||
          (item.family || '').toLowerCase().includes(query) ||
          (item.subcategory || '').toLowerCase().includes(query);

        const categoryMatch = categoryFilter === 'all' || item.category === categoryFilter;
        const activeMatch =
          activeFilter === 'all' ||
          (activeFilter === 'active' && item.active) ||
          (activeFilter === 'inactive' && !item.active);

        const currentType = item.family || item.subcategory || 'Standard';
        const typeMatch = typeFilter === 'all' || currentType === typeFilter;

        return textMatch && categoryMatch && activeMatch && typeMatch;
      })
      .sort((a, b) => {
        if (sortBy === 'sku-asc') return a.sku.localeCompare(b.sku);
        if (sortBy === 'sku-desc') return b.sku.localeCompare(a.sku);
        if (sortBy === 'name-asc') return a.description.localeCompare(b.description);
        if (sortBy === 'name-desc') return b.description.localeCompare(a.description);
        if (sortBy === 'category-asc') return a.category.localeCompare(b.category);
        if (sortBy === 'material-desc') return b.baseMaterialCost - a.baseMaterialCost;
        if (sortBy === 'labor-desc') return b.baseLaborMinutes - a.baseLaborMinutes;
        return 0;
      });
  }, [items, search, categoryFilter, activeFilter, typeFilter, sortBy]);

  const filteredModifiers = useMemo(() => {
    const query = search.trim().toLowerCase();
    return modifiers
      .filter((modifier) => {
        const textMatch =
          !query ||
          modifier.name.toLowerCase().includes(query) ||
          modifier.modifierKey.toLowerCase().includes(query) ||
          modifier.appliesToCategories.join(' ').toLowerCase().includes(query);

        const activeMatch =
          activeFilter === 'all' ||
          (activeFilter === 'active' && modifier.active) ||
          (activeFilter === 'inactive' && !modifier.active);

        return textMatch && activeMatch;
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [modifiers, search, activeFilter]);

  const filteredBundles = useMemo(() => {
    const query = search.trim().toLowerCase();
    return bundles
      .filter((bundle) => {
        const textMatch =
          !query ||
          bundle.bundleName.toLowerCase().includes(query) ||
          bundle.id.toLowerCase().includes(query) ||
          (bundle.category || '').toLowerCase().includes(query);

        const activeMatch =
          activeFilter === 'all' ||
          (activeFilter === 'active' && bundle.active) ||
          (activeFilter === 'inactive' && !bundle.active);

        return textMatch && activeMatch;
      })
      .sort((a, b) => a.bundleName.localeCompare(b.bundleName));
  }, [bundles, search, activeFilter]);

  const handleCreateItem = () => {
    const newItem: CatalogItem = {
      id: crypto.randomUUID(),
      sku: 'SKU-' + Math.floor(Math.random() * 10000),
      category: 'Toilet Accessories',
      description: 'New Catalog Item',
      uom: 'EA',
      baseMaterialCost: 0,
      baseLaborMinutes: 0,
      taxable: true,
      adaFlag: false,
      active: true,
      tags: [],
    };
    setEditingItem(newItem);
  };

  async function handleSaveItem(e: React.FormEvent) {
    e.preventDefault();
    if (!editingItem) return;
    try {
      const isNew = !items.find((item) => item.id === editingItem.id);
      if (isNew) {
        await api.createCatalogItem(editingItem);
      } else {
        await api.updateCatalogItem(editingItem);
      }
      setEditingItem(null);
      await loadCatalogWorkspace();
    } catch (err) {
      console.error('Failed to save item', err);
    }
  }

  async function handleDeleteItem(id: string) {
    if (!confirm('Are you sure you want to deactivate this item?')) return;
    try {
      await api.deleteCatalogItem(id);
      await loadCatalogWorkspace();
    } catch (err) {
      console.error('Failed to delete item', err);
    }
  }

  async function handleEditModifier(modifier: ModifierRecord) {
    const name = window.prompt('Modifier name', modifier.name);
    if (!name) return;
    const key = window.prompt('Modifier key', modifier.modifierKey);
    if (!key) return;
    const categories = window.prompt('Applies to categories (comma separated)', modifier.appliesToCategories.join(', '));
    const addLabor = window.prompt('Add labor minutes', String(modifier.addLaborMinutes));
    const addMaterial = window.prompt('Add material cost', String(modifier.addMaterialCost));
    const pctLabor = window.prompt('Percent labor', String(modifier.percentLabor));
    const pctMaterial = window.prompt('Percent material', String(modifier.percentMaterial));
    const active = window.confirm('Keep this modifier active?');

    try {
      await api.updateCatalogModifier({
        id: modifier.id,
        name: name.trim(),
        modifierKey: key.trim(),
        appliesToCategories: (categories || '').split(',').map((part) => part.trim()).filter(Boolean),
        addLaborMinutes: Number(addLabor || 0),
        addMaterialCost: Number(addMaterial || 0),
        percentLabor: Number(pctLabor || 0),
        percentMaterial: Number(pctMaterial || 0),
        active,
      });
      await loadCatalogWorkspace();
    } catch (error) {
      console.error('Failed to update modifier', error);
      alert(error instanceof Error ? error.message : 'Failed to update modifier');
    }
  }

  async function handleDeleteModifier(id: string) {
    if (!window.confirm('Deactivate this modifier?')) return;
    try {
      await api.deleteCatalogModifier(id);
      await loadCatalogWorkspace();
    } catch (error) {
      console.error('Failed to deactivate modifier', error);
      alert(error instanceof Error ? error.message : 'Failed to deactivate modifier');
    }
  }

  async function handleEditBundle(bundle: BundleRecord) {
    const bundleName = window.prompt('Bundle name', bundle.bundleName);
    if (!bundleName) return;
    const category = window.prompt('Bundle category', bundle.category || '');
    const active = window.confirm('Keep this bundle active?');

    try {
      await api.updateCatalogBundle({
        id: bundle.id,
        bundleName: bundleName.trim(),
        category: category || null,
        active,
      });
      await loadCatalogWorkspace();
    } catch (error) {
      console.error('Failed to update bundle', error);
      alert(error instanceof Error ? error.message : 'Failed to update bundle');
    }
  }

  async function handleDeleteBundle(id: string) {
    if (!window.confirm('Deactivate this bundle?')) return;
    try {
      await api.deleteCatalogBundle(id);
      await loadCatalogWorkspace();
    } catch (error) {
      console.error('Failed to deactivate bundle', error);
      alert(error instanceof Error ? error.message : 'Failed to deactivate bundle');
    }
  }

  const lastSynced = syncStatus?.lastSuccessAt || syncStatus?.lastAttemptAt;

  return (
    <div className="ui-page space-y-3">
      <section className="ui-surface p-3 space-y-3">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="ui-label">Catalog Database</p>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900 mt-1">Catalog</h1>
            <p className="text-xs text-slate-500">Source of truth: Google Sheets sync into local estimate database.</p>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1 rounded border border-slate-300 bg-slate-50 px-2 py-1 text-slate-700">
              <Database className="w-3.5 h-3.5" />
              Source: Google Sheets
            </span>
            <span className={`rounded border px-2 py-1 font-medium ${statusClass(syncStatus?.status || 'never')}`}>
              {syncStatus?.status === 'running' ? 'Syncing' : syncStatus?.status === 'success' ? 'Synced' : syncStatus?.status === 'failed' ? 'Failed' : 'Never Synced'}
            </span>
            <button
              onClick={() => void handleSyncCatalog()}
              disabled={syncing}
              className="ui-btn-primary h-8 px-3 text-xs inline-flex items-center gap-1.5 disabled:opacity-60"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? 'Syncing...' : 'Sync Catalog'}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-2 text-xs">
          <div className="ui-surface-soft px-2 py-1.5 text-slate-700">Syncing ITEMS, MODIFIERS, and BUNDLES</div>
          <div className="ui-surface-soft px-2 py-1.5 text-slate-700">Last synced: {lastSynced ? new Date(lastSynced).toLocaleString() : 'Never'}</div>
          <div className="ui-surface-soft px-2 py-1.5 text-slate-700">Items: {syncStatus?.itemsSynced || items.length}</div>
          <div className="ui-surface-soft px-2 py-1.5 text-slate-700">Modifiers: {syncStatus?.modifiersSynced || modifiers.length} | Bundles: {syncStatus?.bundlesSynced || bundles.length}</div>
        </div>

        {syncStatus?.warnings?.length ? (
          <div className="rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs text-amber-800">
            {syncStatus.warnings.slice(0, 3).map((warning, index) => (
              <p key={`${warning}-${index}`}>- {warning}</p>
            ))}
          </div>
        ) : null}
      </section>

      <section className="ui-surface p-2">
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setActiveTab('items')}
            className={`h-8 px-3 rounded border text-xs font-medium ${activeTab === 'items' ? 'border-blue-700 bg-blue-700 text-white' : 'border-slate-300 text-slate-700 hover:bg-slate-50'}`}
          >
            Items ({items.length})
          </button>
          <button
            onClick={() => setActiveTab('modifiers')}
            className={`h-8 px-3 rounded border text-xs font-medium ${activeTab === 'modifiers' ? 'border-blue-700 bg-blue-700 text-white' : 'border-slate-300 text-slate-700 hover:bg-slate-50'}`}
          >
            Modifiers ({modifiers.length})
          </button>
          <button
            onClick={() => setActiveTab('bundles')}
            className={`h-8 px-3 rounded border text-xs font-medium ${activeTab === 'bundles' ? 'border-blue-700 bg-blue-700 text-white' : 'border-slate-300 text-slate-700 hover:bg-slate-50'}`}
          >
            Bundles ({bundles.length})
          </button>
          <div className="ml-auto flex items-center gap-2">
            {activeTab === 'items' ? (
              <button
                onClick={handleCreateItem}
                className="h-8 px-3 rounded-md bg-blue-700 hover:bg-blue-800 text-white text-xs font-medium inline-flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Item
              </button>
            ) : null}
          </div>
        </div>
      </section>

      <section className="ui-surface p-3">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-2 items-center">
          <div className="relative lg:col-span-5">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={activeTab === 'items' ? 'Search SKU, description, category' : activeTab === 'modifiers' ? 'Search modifier key, name, categories' : 'Search bundle id, name, category'}
              className="ui-input h-8 pl-8 text-xs"
            />
          </div>

          {activeTab === 'items' ? (
            <>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="ui-input h-8 lg:col-span-2 px-2 text-xs"
              >
                {categories.map((category) => (
                  <option key={category} value={category}>
                    {category === 'all' ? 'All Categories' : category}
                  </option>
                ))}
              </select>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="ui-input h-8 lg:col-span-2 px-2 text-xs"
              >
                {itemTypes.map((itemType) => (
                  <option key={itemType} value={itemType}>
                    {itemType === 'all' ? 'All Types' : itemType}
                  </option>
                ))}
              </select>
              <div className="relative lg:col-span-3">
                <ArrowUpDown className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as SortKey)}
                  className="ui-input h-8 w-full pl-8 pr-2 text-xs"
                >
                  <option value="sku-asc">Sort: SKU (A-Z)</option>
                  <option value="sku-desc">Sort: SKU (Z-A)</option>
                  <option value="name-asc">Sort: Name (A-Z)</option>
                  <option value="name-desc">Sort: Name (Z-A)</option>
                  <option value="category-asc">Sort: Category</option>
                  <option value="material-desc">Sort: Material High-Low</option>
                  <option value="labor-desc">Sort: Labor High-Low</option>
                </select>
              </div>
            </>
          ) : (
            <select
              value={activeFilter}
              onChange={(e) => setActiveFilter(e.target.value as 'all' | 'active' | 'inactive')}
              className="ui-input h-8 lg:col-span-2 px-2 text-xs"
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          )}
        </div>

        <div className="mt-2 text-[11px] text-slate-500">
          {activeTab === 'items' ? `Showing ${filteredItems.length} of ${items.length} item records` : activeTab === 'modifiers' ? `Showing ${filteredModifiers.length} of ${modifiers.length} modifier records` : `Showing ${filteredBundles.length} of ${bundles.length} bundle records`}
        </div>
      </section>

      <section className="ui-surface overflow-hidden">
        <div className="max-h-[68vh] overflow-auto">
          {loading ? (
            <div className="p-6 text-sm text-slate-500">Loading catalog...</div>
          ) : activeTab === 'items' ? (
            filteredItems.length === 0 ? (
              <div className="p-8 text-center">
                <Package className="w-6 h-6 text-slate-300 mx-auto mb-2" />
                <p className="text-sm text-slate-600">No items match the current filters.</p>
              </div>
            ) : (
              <table className="w-full text-xs">
                <thead className="sticky top-0 z-10 bg-slate-100 border-b border-slate-300 text-slate-600 uppercase tracking-wide">
                  <tr>
                    <th className="text-left font-semibold py-2 px-3">SKU / ID</th>
                    <th className="text-left font-semibold py-2 px-2">Description</th>
                    <th className="text-left font-semibold py-2 px-2">Category</th>
                    <th className="text-left font-semibold py-2 px-2">Unit</th>
                    <th className="text-right font-semibold py-2 px-2">Labor</th>
                    <th className="text-right font-semibold py-2 px-2">Material</th>
                    <th className="text-center font-semibold py-2 px-2">Active</th>
                    <th className="text-right font-semibold py-2 px-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map((item) => (
                    <tr key={item.id} className="border-b border-slate-100 hover:bg-slate-50/70">
                      <td className="py-2 px-3 align-top">
                        <div className="font-medium text-slate-800">{item.sku || 'No SKU'}</div>
                        <div className="text-[10px] text-slate-500">{item.id.slice(0, 12)}</div>
                      </td>
                      <td className="py-2 px-2 align-top">
                        <div className="font-medium text-slate-900">{item.description}</div>
                        <div className="text-[10px] text-slate-500 inline-flex items-center gap-1">
                          {item.family || item.subcategory || 'Standard'}
                          {item.adaFlag ? <ShieldCheck className="w-3 h-3 text-emerald-600" title="ADA" /> : null}
                        </div>
                      </td>
                      <td className="py-2 px-2 text-slate-700">{item.category}</td>
                      <td className="py-2 px-2 text-slate-700">{item.uom}</td>
                      <td className="py-2 px-2 text-right text-slate-700">{formatNumberSafe(item.baseLaborMinutes, 1)} min</td>
                      <td className="py-2 px-2 text-right text-slate-700">{formatCurrencySafe(item.baseMaterialCost)}</td>
                      <td className="py-2 px-2 text-center">
                        <span className={`px-1.5 py-0.5 rounded border ${item.active ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-300 bg-slate-100 text-slate-600'}`}>
                          {item.active ? 'Yes' : 'No'}
                        </span>
                      </td>
                      <td className="py-2 px-3">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => setEditingItem(item)}
                            className="h-7 px-2 rounded border border-slate-300 text-slate-700 hover:bg-slate-100 inline-flex items-center gap-1"
                          >
                            <Edit2 className="w-3 h-3" />
                            Edit
                          </button>
                          <button
                            onClick={() => void handleDeleteItem(item.id)}
                            className="h-7 px-2 rounded border border-red-200 text-red-700 hover:bg-red-50 inline-flex items-center gap-1"
                          >
                            <Trash2 className="w-3 h-3" />
                            Deactivate
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          ) : activeTab === 'modifiers' ? (
            filteredModifiers.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-600">No modifiers match the current filters.</div>
            ) : (
              <table className="w-full text-xs">
                <thead className="sticky top-0 z-10 bg-slate-100 border-b border-slate-300 text-slate-600 uppercase tracking-wide">
                  <tr>
                    <th className="text-left font-semibold py-2 px-3">Modifier</th>
                    <th className="text-left font-semibold py-2 px-2">Key</th>
                    <th className="text-left font-semibold py-2 px-2">Applies To</th>
                    <th className="text-right font-semibold py-2 px-2">+ Labor Min</th>
                    <th className="text-right font-semibold py-2 px-2">+ Material</th>
                    <th className="text-right font-semibold py-2 px-2">% Labor</th>
                    <th className="text-right font-semibold py-2 px-2">% Material</th>
                    <th className="text-center font-semibold py-2 px-2">Active</th>
                    <th className="text-right font-semibold py-2 px-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredModifiers.map((modifier) => (
                    <tr key={modifier.id} className="border-b border-slate-100 hover:bg-slate-50/70">
                      <td className="py-2 px-3 font-medium text-slate-900">{modifier.name}</td>
                      <td className="py-2 px-2 text-slate-700">{modifier.modifierKey}</td>
                      <td className="py-2 px-2 text-slate-700">{modifier.appliesToCategories.join(', ') || '-'}</td>
                      <td className="py-2 px-2 text-right text-slate-700">{formatNumberSafe(modifier.addLaborMinutes, 2)}</td>
                      <td className="py-2 px-2 text-right text-slate-700">{formatCurrencySafe(modifier.addMaterialCost)}</td>
                      <td className="py-2 px-2 text-right text-slate-700">{formatPercentSafe(modifier.percentLabor)}</td>
                      <td className="py-2 px-2 text-right text-slate-700">{formatPercentSafe(modifier.percentMaterial)}</td>
                      <td className="py-2 px-2 text-center">
                        <span className={`px-1.5 py-0.5 rounded border ${modifier.active ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-300 bg-slate-100 text-slate-600'}`}>
                          {modifier.active ? 'Yes' : 'No'}
                        </span>
                      </td>
                      <td className="py-2 px-3">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => void handleEditModifier(modifier)}
                            className="h-7 px-2 rounded border border-slate-300 text-slate-700 hover:bg-slate-100 inline-flex items-center gap-1"
                          >
                            <Edit2 className="w-3 h-3" />
                            Edit
                          </button>
                          <button
                            onClick={() => void handleDeleteModifier(modifier.id)}
                            className="h-7 px-2 rounded border border-red-200 text-red-700 hover:bg-red-50 inline-flex items-center gap-1"
                          >
                            <Trash2 className="w-3 h-3" />
                            Deactivate
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          ) : filteredBundles.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-600">No bundles match the current filters.</div>
          ) : (
            <table className="w-full text-xs">
              <thead className="sticky top-0 z-10 bg-slate-100 border-b border-slate-300 text-slate-600 uppercase tracking-wide">
                <tr>
                  <th className="text-left font-semibold py-2 px-3">Bundle ID</th>
                  <th className="text-left font-semibold py-2 px-2">Bundle Name</th>
                  <th className="text-left font-semibold py-2 px-2">Category</th>
                  <th className="text-left font-semibold py-2 px-2">Updated</th>
                  <th className="text-center font-semibold py-2 px-2">Active</th>
                  <th className="text-right font-semibold py-2 px-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredBundles.map((bundle) => (
                  <tr key={bundle.id} className="border-b border-slate-100 hover:bg-slate-50/70">
                    <td className="py-2 px-3 text-slate-700">{bundle.id}</td>
                    <td className="py-2 px-2 font-medium text-slate-900">{bundle.bundleName}</td>
                    <td className="py-2 px-2 text-slate-700">{bundle.category || '-'}</td>
                    <td className="py-2 px-2 text-slate-500">{bundle.updatedAt ? new Date(bundle.updatedAt).toLocaleString() : '-'}</td>
                    <td className="py-2 px-2 text-center">
                      <span className={`px-1.5 py-0.5 rounded border ${bundle.active ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-300 bg-slate-100 text-slate-600'}`}>
                        {bundle.active ? 'Yes' : 'No'}
                      </span>
                    </td>
                    <td className="py-2 px-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => void handleEditBundle(bundle)}
                          className="h-7 px-2 rounded border border-slate-300 text-slate-700 hover:bg-slate-100 inline-flex items-center gap-1"
                        >
                          <Edit2 className="w-3 h-3" />
                          Edit
                        </button>
                        <button
                          onClick={() => void handleDeleteBundle(bundle.id)}
                          className="h-7 px-2 rounded border border-red-200 text-red-700 hover:bg-red-50 inline-flex items-center gap-1"
                        >
                          <Trash2 className="w-3 h-3" />
                          Deactivate
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {editingItem ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-slate-900/45">
          <form onSubmit={handleSaveItem} className="bg-white w-full max-w-2xl rounded-lg shadow-xl overflow-hidden flex flex-col border border-slate-200">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-900">Edit Catalog Item</h2>
              <button
                type="button"
                onClick={() => setEditingItem(null)}
                className="p-1.5 hover:bg-slate-100 rounded text-slate-500"
              >
                <Plus className="w-4 h-4 rotate-45" />
              </button>
            </div>

            <div className="p-4 space-y-4 overflow-y-auto max-h-[70vh]">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">Description</label>
                  <input
                    type="text"
                    required
                    className="w-full h-9 px-2 border border-slate-300 rounded text-sm"
                    value={editingItem.description}
                    onChange={(e) => setEditingItem({ ...editingItem, description: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">SKU</label>
                  <input
                    type="text"
                    className="w-full h-9 px-2 border border-slate-300 rounded text-sm"
                    value={editingItem.sku}
                    onChange={(e) => setEditingItem({ ...editingItem, sku: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">Category</label>
                  <input
                    type="text"
                    className="w-full h-9 px-2 border border-slate-300 rounded text-sm"
                    value={editingItem.category}
                    onChange={(e) => setEditingItem({ ...editingItem, category: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">Unit</label>
                  <select
                    className="w-full h-9 px-2 border border-slate-300 rounded text-sm"
                    value={editingItem.uom}
                    onChange={(e) => setEditingItem({ ...editingItem, uom: e.target.value as CatalogItem['uom'] })}
                  >
                    <option value="EA">EA</option>
                    <option value="LF">LF</option>
                    <option value="SF">SF</option>
                    <option value="CY">CY</option>
                    <option value="HR">HR</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">Type (Family/Subcategory)</label>
                  <input
                    type="text"
                    className="w-full h-9 px-2 border border-slate-300 rounded text-sm"
                    value={editingItem.family || editingItem.subcategory || ''}
                    onChange={(e) => setEditingItem({ ...editingItem, family: e.target.value || undefined })}
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">Base Material Cost ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    className="w-full h-9 px-2 border border-slate-300 rounded text-sm"
                    value={editingItem.baseMaterialCost}
                    onChange={(e) => setEditingItem({ ...editingItem, baseMaterialCost: parseFloat(e.target.value) || 0 })}
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">Base Labor Minutes</label>
                  <input
                    type="number"
                    className="w-full h-9 px-2 border border-slate-300 rounded text-sm"
                    value={editingItem.baseLaborMinutes}
                    onChange={(e) => setEditingItem({ ...editingItem, baseLaborMinutes: parseFloat(e.target.value) || 0 })}
                  />
                </div>
                <div className="col-span-2 flex items-center gap-4 text-xs text-slate-700">
                  <label className="inline-flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={editingItem.active}
                      onChange={(e) => setEditingItem({ ...editingItem, active: e.target.checked })}
                    />
                    Active
                  </label>
                  <label className="inline-flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={editingItem.adaFlag}
                      onChange={(e) => setEditingItem({ ...editingItem, adaFlag: e.target.checked })}
                    />
                    ADA Flag
                  </label>
                  <label className="inline-flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={editingItem.taxable}
                      onChange={(e) => setEditingItem({ ...editingItem, taxable: e.target.checked })}
                    />
                    Taxable
                  </label>
                </div>
              </div>
            </div>

            <div className="p-3 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingItem(null)}
                className="h-8 px-3 border border-slate-300 rounded text-xs text-slate-700 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="h-8 px-3 rounded bg-blue-700 hover:bg-blue-800 text-white text-xs font-medium"
              >
                Save Item
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
