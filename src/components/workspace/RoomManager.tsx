import React from 'react';
import { ChevronLeft, ChevronRight, Copy, Pencil, Plus, Trash2 } from 'lucide-react';
import { RoomRecord } from '../../shared/types/estimator';

interface Props {
  rooms: RoomRecord[];
  activeRoomId: string;
  onSelectRoom: (roomId: string) => void;
  onOpenCreateRoom: () => void;
  onRenameRoom: (room: RoomRecord) => void;
  onDuplicateRoom: (room: RoomRecord) => void;
  onDeleteRoom: (room: RoomRecord) => void;
  /** When true renders a slim 48px rail with only the expand affordance and a
   *  room count. Defaults to false (the full list). */
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
}

export function RoomManager({
  rooms,
  activeRoomId,
  onSelectRoom,
  onOpenCreateRoom,
  onRenameRoom,
  onDuplicateRoom,
  onDeleteRoom,
  collapsed = false,
  onToggleCollapsed,
}: Props) {
  if (collapsed) {
    const activeRoom = rooms.find((room) => room.id === activeRoomId);
    return (
      <aside className="flex min-h-[220px] w-12 shrink-0 flex-col items-center gap-2 rounded-lg border border-slate-200 bg-white px-1.5 py-2 shadow-sm">
        <button
          type="button"
          onClick={onToggleCollapsed}
          className="flex h-8 w-8 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
          title="Expand rooms panel"
          aria-label="Expand rooms panel"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
        <div
          className="mt-1 flex flex-col items-center gap-0.5"
          title={activeRoom ? `Active room: ${activeRoom.roomName}` : undefined}
        >
          <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.06em] text-slate-400">Rooms</span>
          <span className="font-mono text-[14px] font-semibold tabular-nums text-slate-900">{rooms.length}</span>
        </div>
        <button
          type="button"
          onClick={onOpenCreateRoom}
          className="mt-auto flex h-8 w-8 items-center justify-center rounded-md bg-blue-700 text-white shadow-sm hover:bg-blue-800"
          title="Add a room"
          aria-label="Add a room"
        >
          <Plus className="h-4 w-4" />
        </button>
      </aside>
    );
  }

  return (
    <section className="flex max-h-[min(70vh,720px)] min-h-[280px] flex-col rounded-lg border border-slate-200 bg-white p-2 shadow-sm xl:max-h-[calc(100vh-170px)]">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">Rooms / Areas</h3>
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-slate-400">{rooms.length}</span>
          {onToggleCollapsed ? (
            <button
              type="button"
              onClick={onToggleCollapsed}
              className="rounded p-0.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
              title="Collapse rooms panel"
              aria-label="Collapse rooms panel"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
      </div>

      <div className="space-y-1 mb-2 overflow-y-auto pr-0.5 flex-1 min-h-0">
        {rooms.map((room) => (
          <div
            key={room.id}
            className={`group rounded-lg border transition-colors ${
              activeRoomId === room.id
                ? 'border-blue-300 bg-blue-50/60'
                : 'border-slate-200/80 bg-white hover:border-slate-300'
            }`}
          >
            <div className="flex min-h-8 items-center justify-between gap-1 px-2 py-0.5">
              <button
                type="button"
                onClick={() => onSelectRoom(room.id)}
                className={`min-w-0 flex-1 truncate text-left text-[12px] ${activeRoomId === room.id ? 'font-semibold text-blue-800' : 'font-medium text-slate-700'}`}
                title={room.roomName}
              >
                {room.roomName}
              </button>
              <div className="flex shrink-0 items-center gap-0.5">
                <button type="button" onClick={() => onRenameRoom(room)} className="rounded p-1 text-slate-500 hover:bg-slate-100" title="Rename">
                  <Pencil className="h-3 w-3" />
                </button>
                <button type="button" onClick={() => onDuplicateRoom(room)} className="rounded p-1 text-slate-500 hover:bg-slate-100" title="Duplicate">
                  <Copy className="h-3 w-3" />
                </button>
                <button type="button" onClick={() => onDeleteRoom(room)} className="rounded p-1 text-slate-500 hover:bg-red-50 hover:text-red-600" title="Delete room">
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-md border border-slate-200 bg-white p-2">
        <button onClick={onOpenCreateRoom} className="h-8 w-full rounded-md bg-blue-700 text-white text-[11px] font-semibold inline-flex items-center justify-center gap-1.5 hover:bg-blue-800 shadow-sm">
          <Plus className="w-3.5 h-3.5" /> Add Room
        </button>
        <p className="mt-2 text-[10px] leading-4 text-slate-500">Name the room, then add lines.</p>
      </div>
    </section>
  );
}
