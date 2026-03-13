import React from 'react';
import { Copy, Pencil, Plus, Trash2 } from 'lucide-react';
import { RoomRecord } from '../../shared/types/estimator';

interface Props {
  rooms: RoomRecord[];
  activeRoomId: string;
  onSelectRoom: (roomId: string) => void;
  onOpenCreateRoom: () => void;
  onRenameRoom: (room: RoomRecord) => void;
  onDuplicateRoom: (room: RoomRecord) => void;
  onDeleteRoom: (room: RoomRecord) => void;
}

export function RoomManager({
  rooms,
  activeRoomId,
  onSelectRoom,
  onOpenCreateRoom,
  onRenameRoom,
  onDuplicateRoom,
  onDeleteRoom,
}: Props) {
  return (
    <section className="bg-gradient-to-b from-white to-slate-50/30 border border-slate-200 rounded-xl p-2 h-[calc(100vh-170px)] flex flex-col shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">Rooms / Areas</h3>
        <span className="text-[10px] text-slate-400">{rooms.length}</span>
      </div>

      <div className="space-y-1 mb-2 overflow-y-auto pr-0.5 flex-1 min-h-0">
        {rooms.map((room) => (
          <div
            key={room.id}
            className={`group rounded-lg border transition-colors ${
              activeRoomId === room.id
                ? 'border-blue-300 bg-blue-50/70 shadow-[inset_0_0_0_1px_rgba(59,130,246,0.08)]'
                : 'border-slate-200/80 bg-white hover:border-slate-300'
            }`}
          >
            <div className="h-8 px-2 flex items-center justify-between gap-1">
              <button onClick={() => onSelectRoom(room.id)} className={`text-[12px] text-left truncate flex-1 pr-1 ${activeRoomId === room.id ? 'font-semibold text-blue-800' : 'font-medium text-slate-700'}`} title={room.roomName}>
                {room.roomName}
              </button>
              <div className="hidden group-hover:flex items-center gap-0.5">
                <button onClick={() => onRenameRoom(room)} className="p-1 rounded hover:bg-slate-100 text-slate-500"><Pencil className="w-3 h-3" /></button>
                <button onClick={() => onDuplicateRoom(room)} className="p-1 rounded hover:bg-slate-100 text-slate-500"><Copy className="w-3 h-3" /></button>
                <button onClick={() => onDeleteRoom(room)} className="p-1 rounded hover:bg-red-50 text-slate-500 hover:text-red-600"><Trash2 className="w-3 h-3" /></button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-slate-200 bg-white/90 p-2">
        <button onClick={onOpenCreateRoom} className="h-8 w-full rounded-md bg-blue-700 text-white text-[11px] font-semibold inline-flex items-center justify-center gap-1.5 hover:bg-blue-800 shadow-sm">
          <Plus className="w-3.5 h-3.5" /> Add Room
        </button>
        <p className="mt-2 text-[10px] leading-4 text-slate-500">Name the room first, then optionally drop in a starter line item during creation.</p>
      </div>
    </section>
  );
}
