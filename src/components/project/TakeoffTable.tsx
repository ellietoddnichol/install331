
import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Copy, Search, MoreHorizontal, ChevronDown, ChevronRight, Layers, MapPin, Sparkles, Edit2 } from 'lucide-react';
import { Project, ProjectLine, EstimateResult, CatalogItem, Room, Scope, Bundle } from '../../types';
import { api } from '../../services/api';
import { TakeoffAIParser } from './TakeoffAIParser';
import { formatCurrencySafe, formatNumberSafe, safeDivide } from '../../utils/numberFormat';

interface Props {
  project: Project;
  estimate: EstimateResult | null;
  onUpdate: (project: Project) => void;
}

export function TakeoffTable({ project, estimate, onUpdate }: Props) {
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [globalBundles, setGlobalBundles] = useState<Bundle[]>([]);
  const [globalAddIns, setGlobalAddIns] = useState<any[]>([]);
  const [showCatalog, setShowCatalog] = useState(false);
  const [showBundles, setShowBundles] = useState(false);
  const [showAddIns, setShowAddIns] = useState(false);
  const [showAIParser, setShowAIParser] = useState(false);
  const [selectedRoomId, setSelectedRoomId] = useState<string>(project.rooms[0]?.id || '');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    api.getCatalog().then(setCatalog);
    api.getGlobalBundles().then(setGlobalBundles);
    api.getGlobalAddIns().then(setGlobalAddIns);
  }, []);

  const handleAddLine = (item: CatalogItem) => {
    const newLine: ProjectLine = {
      lineId: crypto.randomUUID(),
      catalogItemId: item.id,
      scopeId: project.scopes[0]?.id || 'div10',
      roomId: selectedRoomId,
      qty: 1,
      notes: '',
      baseType: 'Metal'
    };
    onUpdate({ ...project, lines: [...project.lines, newLine] });
    setShowCatalog(false);
  };

  const handleAddManualLine = () => {
    const newLine: ProjectLine = {
      lineId: crypto.randomUUID(),
      manualDescription: 'New Manual Item',
      scopeId: project.scopes[0]?.id || 'div10',
      roomId: selectedRoomId,
      qty: 1,
      notes: '',
      baseType: 'Metal',
      materialUnitCostOverride: 0,
      laborMinutesOverride: 0
    };
    onUpdate({ ...project, lines: [...project.lines, newLine] });
  };

  const handleApplyBundle = (bundle: Bundle) => {
    const newLines: ProjectLine[] = bundle.items.map(item => ({
      lineId: crypto.randomUUID(),
      catalogItemId: item.catalogItemId,
      scopeId: project.scopes[0]?.id || 'div10',
      roomId: selectedRoomId,
      qty: item.qty,
      notes: `From bundle: ${bundle.name}`,
      baseType: 'Metal'
    }));
    onUpdate({ ...project, lines: [...project.lines, ...newLines] });
    setShowBundles(false);
  };

  const handleUpdateLine = (lineId: string, updates: Partial<ProjectLine>) => {
    onUpdate({
      ...project,
      lines: project.lines.map(l => l.lineId === lineId ? { ...l, ...updates } : l)
    });
  };

  const handleDeleteLine = (lineId: string) => {
    onUpdate({
      ...project,
      lines: project.lines.filter(l => l.lineId !== lineId)
    });
  };

  const handleAddRoom = (name?: string) => {
    const roomName = name || prompt('Enter room name:');
    if (!roomName) return null;
    const newRoom: Room = { id: crypto.randomUUID(), name: roomName };
    const updatedRooms = [...project.rooms, newRoom];
    onUpdate({ ...project, rooms: updatedRooms });
    setSelectedRoomId(newRoom.id);
    return newRoom.id;
  };

  const handleRenameRoom = (roomId: string) => {
    const room = project.rooms.find(r => r.id === roomId);
    if (!room) return;
    const newName = prompt('Rename room:', room.name);
    if (!newName || newName === room.name) return;
    onUpdate({
      ...project,
      rooms: project.rooms.map(r => r.id === roomId ? { ...r, name: newName } : r)
    });
  };

  const handleDuplicateRoom = (roomId: string) => {
    const room = project.rooms.find(r => r.id === roomId);
    if (!room) return;
    const newRoomId = crypto.randomUUID();
    const newRoom: Room = { id: newRoomId, name: `${room.name} (Copy)` };
    const roomLines = project.lines.filter(l => l.roomId === roomId);
    const newLines = roomLines.map(l => ({ ...l, lineId: crypto.randomUUID(), roomId: newRoomId }));
    
    onUpdate({
      ...project,
      rooms: [...project.rooms, newRoom],
      lines: [...project.lines, ...newLines]
    });
    setSelectedRoomId(newRoomId);
  };

  const handleDeleteRoom = (roomId: string) => {
    if (project.rooms.length <= 1) {
      alert('Cannot delete the last room.');
      return;
    }
    if (!confirm('Are you sure you want to delete this room and all its items?')) return;
    
    const updatedRooms = project.rooms.filter(r => r.id !== roomId);
    const updatedLines = project.lines.filter(l => l.roomId !== roomId);
    
    onUpdate({
      ...project,
      rooms: updatedRooms,
      lines: updatedLines
    });
    
    if (selectedRoomId === roomId) {
      setSelectedRoomId(updatedRooms[0].id);
    }
  };

  const handleAIImport = (newLines: ProjectLine[], newRoomNames: string[]) => {
    let updatedProject = { ...project };
    
    // Create new rooms first
    const roomMap: Record<string, string> = {};
    newRoomNames.forEach(name => {
      const id = crypto.randomUUID();
      updatedProject.rooms.push({ id, name });
      roomMap[name] = id;
    });

    // Map lines to new room IDs if they were temporary names
    const processedLines = newLines.map(line => {
      if (roomMap[line.roomId]) {
        return { ...line, roomId: roomMap[line.roomId] };
      }
      return line;
    });

    updatedProject.lines = [...updatedProject.lines, ...processedLines];
    onUpdate(updatedProject);
    setShowAIParser(false);
  };

  const filteredCatalog = catalog.filter(item => 
    item.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.sku.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const roomLines = project.lines.filter(l => l.roomId === selectedRoomId);
  const roomTotal = estimate?.lines
    .filter(cl => roomLines.some(rl => rl.lineId === cl.lineId))
    .reduce((sum, cl) => sum + cl.total, 0) || 0;

  return (
    <div className="space-y-6 pb-32">
      {/* Room Selector */}
      <div className="flex items-center justify-between bg-white p-4 rounded-2xl border border-gray-100 shadow-sm sticky top-0 z-10">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2 text-gray-400">
            <MapPin className="w-5 h-5" />
            <span className="text-sm font-bold uppercase tracking-widest">Rooms:</span>
          </div>
          <div className="flex items-center space-x-2 overflow-x-auto pb-1 max-w-2xl">
            {project.rooms.map(room => (
              <div key={room.id} className="relative group">
                <button
                  onClick={() => setSelectedRoomId(room.id)}
                  className={`px-4 py-2 rounded-xl text-sm font-bold transition-all whitespace-nowrap ${
                    selectedRoomId === room.id 
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-100' 
                      : 'bg-gray-50 text-gray-500 hover:bg-gray-100'
                  }`}
                >
                  {room.name}
                </button>
                {selectedRoomId === room.id && (
                  <div className="absolute -top-2 -right-2 hidden group-hover:flex bg-white shadow-lg border border-gray-100 rounded-lg p-1 space-x-1 z-20">
                    <button onClick={() => handleRenameRoom(room.id)} className="p-1 hover:bg-gray-50 text-gray-400 hover:text-blue-600 rounded" title="Rename"><Edit2 className="w-3 h-3" /></button>
                    <button onClick={() => handleDuplicateRoom(room.id)} className="p-1 hover:bg-gray-50 text-gray-400 hover:text-green-600 rounded" title="Duplicate"><Copy className="w-3 h-3" /></button>
                    <button onClick={() => handleDeleteRoom(room.id)} className="p-1 hover:bg-gray-50 text-gray-400 hover:text-red-600 rounded" title="Delete"><Trash2 className="w-3 h-3" /></button>
                  </div>
                )}
              </div>
            ))}
            <button 
              onClick={() => handleAddRoom()}
              className="p-2 text-blue-600 hover:bg-blue-50 rounded-xl transition-all"
            >
              <Plus className="w-5 h-5" />
            </button>
          </div>
        </div>
        
        <div className="flex items-center space-x-3">
          <button 
            onClick={() => setShowAIParser(true)}
            className="bg-purple-50 hover:bg-purple-100 text-purple-700 px-6 py-3 rounded-xl font-bold flex items-center space-x-2 border border-purple-100 transition-all active:scale-95"
          >
            <Sparkles className="w-5 h-5" />
            <span>AI Parse</span>
          </button>

          <button 
            onClick={() => setShowBundles(true)}
            className="bg-orange-50 hover:bg-orange-100 text-orange-700 px-6 py-3 rounded-xl font-bold flex items-center space-x-2 border border-orange-100 transition-all active:scale-95"
          >
            <Layers className="w-5 h-5" />
            <span>Bundles</span>
          </button>

          <button 
            onClick={() => setShowAddIns(true)}
            className="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 px-6 py-3 rounded-xl font-bold flex items-center space-x-2 border border-emerald-100 transition-all active:scale-95"
          >
            <Plus className="w-5 h-5" />
            <span>Add-ins</span>
          </button>
          
          <button 
            onClick={handleAddManualLine}
            className="bg-gray-50 hover:bg-gray-100 text-gray-700 px-6 py-3 rounded-xl font-bold flex items-center space-x-2 border border-gray-200 transition-all active:scale-95"
          >
            <Plus className="w-5 h-5" />
            <span>Manual</span>
          </button>
          
          <button 
            onClick={() => setShowCatalog(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl font-semibold flex items-center space-x-2 shadow-lg shadow-blue-200 transition-all active:scale-95"
          >
            <Search className="w-5 h-5" />
            <span>Catalog</span>
          </button>
        </div>
      </div>

      {/* AI Parser Modal */}
      {showAIParser && (
        <TakeoffAIParser 
          project={project}
          catalog={catalog}
          onClose={() => setShowAIParser(false)}
          onImport={handleAIImport}
        />
      )}

      {/* Takeoff Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-gray-50/50 border-b border-gray-100">
              <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-widest">Description</th>
              <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-widest w-24 text-center">Qty</th>
              <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-widest w-32 text-center">Base Type</th>
              <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-widest text-right">Unit Cost</th>
              <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-widest text-right">Total</th>
              <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-widest w-16"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {project.lines.filter(l => l.roomId === selectedRoomId).length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-gray-400 italic">
                  No items in this room. Click "Add from Catalog" to start.
                </td>
              </tr>
            ) : (
              project.lines.filter(l => l.roomId === selectedRoomId).map(line => {
                const calcLine = estimate?.lines.find(cl => cl.lineId === line.lineId);
                return (
                  <tr key={line.lineId} className="hover:bg-gray-50/50 transition-colors group">
                    <td className="px-6 py-4">
                      {line.manualDescription !== undefined ? (
                        <input
                          type="text"
                          className="w-full px-2 py-1.5 bg-gray-50 border-transparent rounded-lg font-semibold text-gray-900 focus:bg-white focus:ring-2 focus:ring-blue-500 transition-all"
                          value={line.manualDescription}
                          onChange={(e) => handleUpdateLine(line.lineId, { manualDescription: e.target.value })}
                        />
                      ) : (
                        <div className="font-semibold text-gray-900">{calcLine?.description || 'Loading...'}</div>
                      )}
                      <div className="text-xs text-gray-400 mt-0.5 uppercase font-bold tracking-tighter">
                        {project.scopes.find(s => s.id === line.scopeId)?.name}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <input
                        type="number"
                        className="w-full px-2 py-1.5 bg-gray-50 border-transparent rounded-lg text-center font-bold focus:bg-white focus:ring-2 focus:ring-blue-500 transition-all"
                        value={line.qty}
                        onChange={(e) => handleUpdateLine(line.lineId, { qty: parseFloat(e.target.value) || 0 })}
                      />
                    </td>
                    <td className="px-6 py-4">
                      <select
                        className="w-full px-2 py-1.5 bg-gray-50 border-transparent rounded-lg text-xs font-bold focus:bg-white focus:ring-2 focus:ring-blue-500 transition-all"
                        value={line.baseType}
                        onChange={(e) => handleUpdateLine(line.lineId, { baseType: e.target.value as any })}
                      >
                        <option value="Wood">Wood</option>
                        <option value="Metal">Metal</option>
                        <option value="Concrete">Concrete</option>
                        <option value="None">None</option>
                      </select>
                    </td>
            <td className="px-6 py-4 text-right font-medium text-gray-500">
                      {line.manualDescription !== undefined ? (
                        <div className="flex items-center justify-end space-x-1">
                          <span>$</span>
                          <input
                            type="number"
                            className="w-24 px-2 py-1 bg-gray-50 border-transparent rounded text-right focus:bg-white focus:ring-1 focus:ring-blue-500 transition-all"
                            value={line.materialUnitCostOverride || 0}
                            onChange={(e) => handleUpdateLine(line.lineId, { materialUnitCostOverride: parseFloat(e.target.value) || 0 })}
                          />
                        </div>
                      ) : (
                        formatCurrencySafe(safeDivide(calcLine?.total, line.qty, 0))
                      )}
                    </td>
                    <td className="px-6 py-4 text-right font-bold text-gray-900">
                      {formatCurrencySafe(calcLine?.total)}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button 
                        onClick={() => handleDeleteLine(line.lineId)}
                        className="p-2 text-gray-300 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Bundles Modal */}
      {showBundles && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-8 bg-gray-900/60 backdrop-blur-sm">
          <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-full">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-2xl font-bold text-gray-900">Apply Bundle</h2>
              <button 
                onClick={() => setShowBundles(false)}
                className="p-2 hover:bg-gray-100 rounded-xl text-gray-400 transition-all"
              >
                <Plus className="w-6 h-6 rotate-45" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {project.bundles.length === 0 && globalBundles.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                  No bundles defined.
                </div>
              ) : (
                <>
                  {project.bundles.length > 0 && (
                    <div className="space-y-4">
                      <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Project Bundles</h3>
                      {project.bundles.map(bundle => (
                        <button
                          key={bundle.id}
                          onClick={() => handleApplyBundle(bundle)}
                          className="w-full p-6 text-left border border-gray-100 rounded-2xl hover:border-orange-500 hover:bg-orange-50/50 transition-all group"
                        >
                          <div className="flex justify-between items-center">
                            <div>
                              <h3 className="font-bold text-gray-900 text-lg">{bundle.name}</h3>
                              <p className="text-sm text-gray-500 mt-1">{bundle.items.length} items included</p>
                            </div>
                            <Plus className="w-6 h-6 text-gray-300 group-hover:text-orange-600 transition-colors" />
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                  {globalBundles.length > 0 && (
                    <div className="space-y-4 mt-8">
                      <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Global Bundles</h3>
                      {globalBundles.map(bundle => (
                        <button
                          key={bundle.id}
                          onClick={() => handleApplyBundle(bundle)}
                          className="w-full p-6 text-left border border-gray-100 rounded-2xl hover:border-blue-500 hover:bg-blue-50/50 transition-all group"
                        >
                          <div className="flex justify-between items-center">
                            <div>
                              <h3 className="font-bold text-gray-900 text-lg">{bundle.name}</h3>
                              <p className="text-sm text-gray-500 mt-1">{bundle.items.length} items included</p>
                            </div>
                            <Plus className="w-6 h-6 text-gray-300 group-hover:text-blue-600 transition-colors" />
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Add-ins Modal */}
      {showAddIns && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-8 bg-gray-900/60 backdrop-blur-sm">
          <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-full">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-2xl font-bold text-gray-900">Project Add-ins & Modifiers</h2>
              <button 
                onClick={() => setShowAddIns(false)}
                className="p-2 hover:bg-gray-100 rounded-xl text-gray-400 transition-all"
              >
                <Plus className="w-6 h-6 rotate-45" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {globalAddIns.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                  No add-ins or modifiers defined.
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4">
                  {globalAddIns.map(addin => (
                    <button
                      key={addin.id}
                      onClick={() => {
                        const item = catalog.find(c => c.id === addin.catalogItemId);
                        if (item) handleAddLine(item);
                        setShowAddIns(false);
                      }}
                      className="p-6 text-left border border-gray-100 rounded-2xl hover:border-emerald-500 hover:bg-emerald-50/50 transition-all group"
                    >
                      <div className="flex justify-between items-center">
                        <div>
                          <h3 className="font-bold text-gray-900 text-lg">{addin.name}</h3>
                          <p className="text-sm text-gray-500 mt-1">{addin.description}</p>
                        </div>
                        <Plus className="w-6 h-6 text-gray-300 group-hover:text-emerald-600 transition-colors" />
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Catalog Modal */}
      {showCatalog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-8 bg-gray-900/60 backdrop-blur-sm">
          <div className="bg-white w-full max-w-4xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-full">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-2xl font-bold text-gray-900">Product Catalog</h2>
              <button 
                onClick={() => setShowCatalog(false)}
                className="p-2 hover:bg-gray-100 rounded-xl text-gray-400 transition-all"
              >
                <Plus className="w-6 h-6 rotate-45" />
              </button>
            </div>
            
            <div className="p-6 bg-gray-50 border-b border-gray-100">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  autoFocus
                  placeholder="Search by description, SKU, or category..."
                  className="w-full pl-12 pr-4 py-4 bg-white border-transparent rounded-2xl shadow-sm focus:ring-2 focus:ring-blue-500 transition-all text-lg"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredCatalog.map(item => (
                  <button
                    key={item.id}
                    onClick={() => handleAddLine(item)}
                    className="p-4 text-left border border-gray-100 rounded-2xl hover:border-blue-500 hover:bg-blue-50/50 transition-all group"
                  >
                    <div className="flex justify-between items-start mb-2">
                      <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded uppercase tracking-tighter">
                        {item.category}
                      </span>
                      <span className="text-xs font-bold text-gray-400">{item.sku}</span>
                    </div>
                    <p className="font-bold text-gray-900 group-hover:text-blue-700 transition-colors">{item.description}</p>
                    <div className="mt-3 flex items-center justify-between">
                      <span className="text-sm text-gray-500 font-medium">{item.manufacturer} {item.model}</span>
                      <span className="text-lg font-black text-gray-900">{formatCurrencySafe(item.baseMaterialCost)}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Bottom Summary Bar */}
      <div className="fixed bottom-0 left-64 right-0 bg-white border-t border-gray-200 p-4 shadow-[0_-4px_20px_rgba(0,0,0,0.05)] z-30 flex items-center justify-between px-8">
        <div className="flex items-center space-x-8">
          <div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Room Total ({project.rooms.find(r => r.id === selectedRoomId)?.name})</p>
            <p className="text-2xl font-black text-gray-900">{formatCurrencySafe(roomTotal)}</p>
          </div>
          <div className="h-10 w-px bg-gray-100"></div>
          <div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Project Base Bid</p>
            <p className="text-2xl font-black text-blue-600">{formatCurrencySafe(estimate?.baseBidTotal)}</p>
          </div>
        </div>
        
        <div className="flex items-center space-x-4">
          <div className="text-right mr-4">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Labor Hours</p>
            <p className="text-lg font-bold text-gray-700">{formatNumberSafe(estimate?.totalLaborHours, 1)} hrs</p>
          </div>
          <button 
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className="p-3 bg-gray-50 text-gray-400 hover:text-gray-600 rounded-xl transition-all"
          >
            <ChevronDown className="w-6 h-6 rotate-180" />
          </button>
        </div>
      </div>
    </div>
  );
}
