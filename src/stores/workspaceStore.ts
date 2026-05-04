import { create } from 'zustand';

/** Lightweight client UI state (not server data). */
export interface WorkspaceStore {
  isSidebarOpen: boolean;
  activeRoomId: string | null;
  isEstimatorGridFocused: boolean;
  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;
  setActiveRoomId: (roomId: string | null) => void;
  setEstimatorGridFocused: (focused: boolean) => void;
}

export const useWorkspaceStore = create<WorkspaceStore>((set) => ({
  /**
   * Workstation shell — default to the compact icon-only rail and let the user
   * expand it to the labelled sidebar via the expand affordance.
   */
  isSidebarOpen: false,
  activeRoomId: null,
  isEstimatorGridFocused: false,
  setSidebarOpen: (open) => set({ isSidebarOpen: open }),
  toggleSidebar: () => set((s) => ({ isSidebarOpen: !s.isSidebarOpen })),
  setActiveRoomId: (roomId) => set({ activeRoomId: roomId }),
  setEstimatorGridFocused: (focused) => set({ isEstimatorGridFocused: focused }),
}));
