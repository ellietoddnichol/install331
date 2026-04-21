import React from 'react';
import { RoomManager } from '../workspace/RoomManager';
import type { RoomRecord } from '../../shared/types/estimator';

export interface RoomListProps {
  rooms: RoomRecord[];
  activeRoomId: string;
  onSelectRoom: (roomId: string) => void;
  onOpenCreateRoom: () => void;
  onRenameRoom: (room: RoomRecord) => void;
  onDuplicateRoom: (room: RoomRecord) => void;
  onDeleteRoom: (room: RoomRecord) => void;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
}

export function RoomList(props: RoomListProps) {
  return <RoomManager {...props} />;
}
