import React from 'react';
import { LineModifierRecord, RoomRecord, TakeoffLineRecord } from '../../shared/types/estimator';
import { formatCurrencySafe, formatNumberSafe } from '../../utils/numberFormat';

function readSourceRowType(notes: string | null | undefined): string {
  const text = String(notes || '');
  const match = text.match(/Source row type:\s*(material|accessory|freight|installation|service|note)/i);
  return (match?.[1] || 'material').toLowerCase();
}

function writeSourceRowType(notes: string | null | undefined, rowType: string): string {
  const current = String(notes || '');
  const cleaned = current.replace(/\s*\|?\s*Source row type:\s*(material|accessory|freight|installation|service|note)/gi, '').trim();
  const suffix = `Source row type: ${rowType}`;
  return cleaned ? `${cleaned} | ${suffix}` : suffix;
}

interface Props {
  line: TakeoffLineRecord | null;
  rooms: RoomRecord[];
  roomNamesById: Record<string, string>;
  showMaterial: boolean;
  showLabor: boolean;
  projectLaborMultiplier: number;
  activeModifiers: LineModifierRecord[];
  onPatchLine: (lineId: string, updates: Partial<TakeoffLineRecord>) => void;
  onPersistLine: (lineId: string) => void;
  onResetLinePrice: (lineId: string) => void;
  onClearSelection: () => void;
}

export function EstimateSelectedLineEditor({
  line,
  rooms,
  roomNamesById,
  showMaterial,
  showLabor,
  projectLaborMultiplier,
  activeModifiers,
  onPatchLine,
  onPersistLine,
  onResetLinePrice,
  onClearSelection,
}: Props) {
  if (!line) {
    return null;
  }

  const sourceRowType = readSourceRowType(line.notes);
  const modifierLaborDelta = activeModifiers.reduce((sum, modifier) => sum + Number(modifier.addLaborMinutes || 0), 0);
  const baseLaborMinutes = Number(line.laborMinutes || 0);
  const laborWithLineModifiers = Math.max(0, baseLaborMinutes + modifierLaborDelta);
  const adjustedLaborMinutes = laborWithLineModifiers * Math.max(0, Number(projectLaborMultiplier || 1));
  const adjustedLaborAmount = Number((Number(line.laborCost || 0) * Math.max(0, Number(projectLaborMultiplier || 1))).toFixed(2));

  return (
    <section className="rounded-[14px] border border-blue-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(245,248,255,0.96)_100%)] p-2.5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-blue-800 ring-1 ring-blue-200/80">Edit Line</span>
            <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-medium text-slate-600 ring-1 ring-slate-200/80">{roomNamesById[line.roomId] || 'Unassigned room'}</span>
            <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-medium text-slate-600 ring-1 ring-slate-200/80">{line.category || 'Uncategorized'}</span>
            <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-medium text-slate-600 ring-1 ring-slate-200/80">{activeModifiers.length} add-ins</span>
          </div>
          <h3 className="mt-1 truncate text-[13px] font-semibold tracking-tight text-slate-950">{line.description}</h3>
        </div>
        <button onClick={onClearSelection} className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-medium text-slate-600 transition hover:bg-slate-50">Clear</button>
      </div>

      <div className="mt-2 grid gap-2 xl:grid-cols-[minmax(0,1fr)_220px]">
        <div className="grid gap-2 md:grid-cols-2">
          <label className="text-[10px] font-medium text-slate-700 md:col-span-2">Description
            <input className="ui-input mt-1 h-8 rounded-lg" value={line.description} onChange={(event) => onPatchLine(line.id, { description: event.target.value })} onBlur={() => onPersistLine(line.id)} />
          </label>
          <label className="text-[10px] font-medium text-slate-700">Room
            <select className="ui-input mt-1 h-8 rounded-lg" value={line.roomId} onChange={(event) => onPatchLine(line.id, { roomId: event.target.value })} onBlur={() => onPersistLine(line.id)}>
              {rooms.map((room) => <option key={room.id} value={room.id}>{room.roomName}</option>)}
            </select>
          </label>
          <label className="text-[10px] font-medium text-slate-700">Category
            <input className="ui-input mt-1 h-8 rounded-lg" value={line.category || ''} onChange={(event) => onPatchLine(line.id, { category: event.target.value || null })} onBlur={() => onPersistLine(line.id)} />
          </label>
          <label className="text-[10px] font-medium text-slate-700">Subcategory
            <input className="ui-input mt-1 h-8 rounded-lg" value={line.subcategory || ''} onChange={(event) => onPatchLine(line.id, { subcategory: event.target.value || null })} onBlur={() => onPersistLine(line.id)} />
          </label>
          <label className="text-[10px] font-medium text-slate-700">Qty
            <input type="number" className="ui-input mt-1 h-8 rounded-lg" value={line.qty} onChange={(event) => onPatchLine(line.id, { qty: Number(event.target.value) || 0 })} onBlur={() => onPersistLine(line.id)} />
          </label>
          <label className="text-[10px] font-medium text-slate-700">Row kind
            <select className="ui-input mt-1 h-8 rounded-lg" value={line.sourceLineType || 'source_line'} onChange={(event) => onPatchLine(line.id, { sourceLineType: event.target.value as TakeoffLineRecord['sourceLineType'] })} onBlur={() => onPersistLine(line.id)}>
              <option value="source_line">Material / accessory</option>
              <option value="add_in">Freight / service add-in</option>
              <option value="manual">Manual line</option>
              <option value="quote_subtotal">Quote subtotal</option>
            </select>
          </label>
          <label className="text-[10px] font-medium text-slate-700">Row type
            <select
              className="ui-input mt-1 h-8 rounded-lg"
              value={sourceRowType}
              onChange={(event) => {
                const nextType = event.target.value;
                const nextSourceLineType = nextType === 'freight' || nextType === 'service' || nextType === 'installation' ? 'add_in' : 'source_line';
                onPatchLine(line.id, {
                  sourceLineType: nextSourceLineType,
                  notes: writeSourceRowType(line.notes, nextType),
                });
              }}
              onBlur={() => onPersistLine(line.id)}
            >
              <option value="material">material</option>
              <option value="accessory">accessory</option>
              <option value="freight">freight</option>
              <option value="installation">installation</option>
              <option value="service">service</option>
              <option value="note">note</option>
            </select>
          </label>
          <label className="text-[10px] font-medium text-slate-700">Unit
            <input className="ui-input mt-1 h-8 rounded-lg" value={line.unit} onChange={(event) => onPatchLine(line.id, { unit: event.target.value })} onBlur={() => onPersistLine(line.id)} />
          </label>
          {showMaterial ? (
            <label className="text-[10px] font-medium text-slate-700">Base Material
              <input type="number" className="ui-input mt-1 h-8 rounded-lg" value={line.materialCost} onChange={(event) => onPatchLine(line.id, { materialCost: Number(event.target.value) || 0 })} onBlur={() => onPersistLine(line.id)} />
            </label>
          ) : null}
          {showLabor ? (
            <label className="text-[10px] font-medium text-slate-700">Labor amount override
              <input type="number" className="ui-input mt-1 h-8 rounded-lg" value={line.laborCost} onChange={(event) => onPatchLine(line.id, { laborCost: Number(event.target.value) || 0 })} onBlur={() => onPersistLine(line.id)} />
              {projectLaborMultiplier !== 1 ? <p className="mt-1 text-[10px] text-slate-500">Effective {formatCurrencySafe((line.laborCost || 0) * projectLaborMultiplier)}</p> : null}
            </label>
          ) : null}
          {showLabor ? (
            <label className="text-[10px] font-medium text-slate-700">Labor minutes
              <input type="number" className="ui-input mt-1 h-8 rounded-lg" value={line.laborMinutes} onChange={(event) => onPatchLine(line.id, { laborMinutes: Number(event.target.value) || 0 })} onBlur={() => onPersistLine(line.id)} />
            </label>
          ) : null}
          <label className="text-[10px] font-medium text-slate-700">Install labor family
            <input className="ui-input mt-1 h-8 rounded-lg" value={line.installLaborFamily || ''} onChange={(event) => onPatchLine(line.id, { installLaborFamily: event.target.value || null })} onBlur={() => onPersistLine(line.id)} placeholder="grab_bar_36, partition_compartment..." />
          </label>
          <label className="inline-flex items-center gap-2 text-[10px] font-medium text-slate-700">
            <input
              type="checkbox"
              checked={Number(line.laborMinutes || 0) <= 0 && Number(line.laborCost || 0) <= 0}
              onChange={(event) => {
                if (event.target.checked) {
                  onPatchLine(line.id, {
                    laborMinutes: 0,
                    laborCost: 0,
                    generatedLaborMinutes: 0,
                    laborOrigin: 'source',
                    notes: `${line.notes || ''}${line.notes ? ' | ' : ''}Labor suppressed by estimator`.trim(),
                  });
                }
              }}
              onBlur={() => onPersistLine(line.id)}
            />
            Suppress labor
          </label>
          <label className="inline-flex items-center gap-2 text-[10px] font-medium text-slate-700">
            <input
              type="checkbox"
              checked={line.taxable !== false}
              onChange={(event) => onPatchLine(line.id, { taxable: event.target.checked })}
              onBlur={() => onPersistLine(line.id)}
            />
            Taxable
          </label>
          <label className="text-[10px] font-medium text-slate-700">Visibility
            <select className="ui-input mt-1 h-8 rounded-lg" value={line.proposalVisibility || 'customer_visible'} onChange={(event) => onPatchLine(line.id, { proposalVisibility: event.target.value as TakeoffLineRecord['proposalVisibility'] })} onBlur={() => onPersistLine(line.id)}>
              <option value="customer_visible">Customer visible</option>
              <option value="optional_or_alt">Optional / alternate</option>
              <option value="internal_only">Internal only</option>
            </select>
          </label>
          <label className="text-[10px] font-medium text-slate-700 md:col-span-2">Notes
            <textarea rows={2} className="ui-textarea mt-1 rounded-xl" value={line.notes || ''} onChange={(event) => onPatchLine(line.id, { notes: event.target.value || null })} onBlur={() => onPersistLine(line.id)} />
          </label>
        </div>

        <div className="space-y-2">
          <div className="rounded-[12px] bg-white p-2.5 ring-1 ring-slate-200/80">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Line Snapshot</p>
            <div className="mt-2 grid gap-1 text-[11px] text-slate-600">
              <div className="flex items-center justify-between"><span>Material</span><span className="font-semibold text-slate-900">{formatCurrencySafe(line.materialCost)}</span></div>
              <div className="flex items-center justify-between"><span>Base labor</span><span className="font-semibold text-slate-900">{formatCurrencySafe(line.laborCost)}</span></div>
              <div className="flex items-center justify-between"><span>Base labor minutes</span><span className="font-semibold text-slate-900">{formatNumberSafe(baseLaborMinutes, 1)}</span></div>
              <div className="flex items-center justify-between"><span>Line modifier minutes</span><span className="font-semibold text-slate-900">{formatNumberSafe(modifierLaborDelta, 1)}</span></div>
              <div className="flex items-center justify-between"><span>Adjusted minutes</span><span className="font-semibold text-slate-900">{formatNumberSafe(adjustedLaborMinutes, 1)}</span></div>
              <div className="flex items-center justify-between"><span>Adjusted labor</span><span className="font-semibold text-slate-900">{formatCurrencySafe(adjustedLaborAmount)}</span></div>
              <div className="flex items-center justify-between"><span>Labor origin</span><span className="font-semibold text-slate-900">{line.laborOrigin || 'manual'}</span></div>
              <div className="flex items-center justify-between"><span>Sell Price</span><span className="font-semibold text-slate-900">{formatCurrencySafe(line.lineTotal)}</span></div>
            </div>
          </div>
          <div className="rounded-[12px] bg-white p-2.5 ring-1 ring-slate-200/80">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Source Context</p>
            <div className="mt-2 grid gap-1 text-[11px] text-slate-600">
              <div className="flex items-center justify-between"><span>Raw description</span><span className="max-w-[9rem] truncate font-semibold text-slate-900" title={line.description}>{line.description}</span></div>
              <div className="flex items-center justify-between"><span>Normalized description</span><span className="max-w-[9rem] truncate font-semibold text-slate-900" title={line.description}>{line.description}</span></div>
              <div className="flex items-center justify-between"><span>Source type</span><span className="font-semibold text-slate-900">{line.sourceType || 'manual'}</span></div>
              <div className="flex items-center justify-between"><span>Source ref</span><span className="font-semibold text-slate-900">{line.sourceRef || 'n/a'}</span></div>
              <div className="flex items-center justify-between"><span>Catalog match</span><span className="font-semibold text-slate-900">{line.catalogItemId || 'none'}</span></div>
              <div className="flex items-center justify-between"><span>Match confidence</span><span className="font-semibold text-slate-900">{line.intakeMatchConfidence || 'n/a'}</span></div>
              <div className="flex items-center justify-between"><span>Installable scope</span><span className="font-semibold text-slate-900">{line.isInstallableScope ? 'yes' : 'no'}</span></div>
              <div className="flex items-center justify-between"><span>Scope type</span><span className="font-semibold text-slate-900">{line.installScopeType || 'n/a'}</span></div>
            </div>
          </div>
          <div className="rounded-[12px] bg-slate-950 p-2.5 text-white shadow-sm">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-300">Pricing Mode</p>
            <p className="mt-1 text-[12px] font-semibold">{line.pricingSource === 'manual' ? 'Manual sell override active' : 'Sell price tracks material + labor'}</p>
            <div className="mt-2 flex items-center justify-between gap-2">
              <div>
                <p className="text-[10px] text-slate-300">Unit Sell</p>
                <p className="mt-1 text-base font-semibold">{formatCurrencySafe(line.unitSell)}</p>
              </div>
              <button type="button" onClick={() => onResetLinePrice(line.id)} disabled={line.pricingSource !== 'manual'} className="rounded-full border border-slate-700 px-2.5 py-1 text-[10px] font-semibold text-slate-100 transition hover:border-slate-500 hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-45">Reset</button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}