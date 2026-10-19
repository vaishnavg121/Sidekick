import { create } from 'zustand';
import type { Metadata } from './models';
import { tabReducer, type TabItem } from './tabs';
import type { ServerEvent } from './protocol';
import { EMPTY_WINDOW_STATE, type WindowUiState } from './window-state';
import type { DockStatus } from './docking';
interface UiState {
  metadata?: Metadata;
  tabs: TabItem[];
  query: string;
  settings: boolean;
  connected: boolean;
  error?: string;
  windowState: WindowUiState;
  dockStatus: DockStatus;
  setDockStatus(status: DockStatus): void;
  receive(event: ServerEvent): void;
  setQuery(query: string): void;
  setSettings(settings: boolean): void;
  setConnected(connected: boolean): void;
  setError(error?: string): void;
}
export const useSidebar = create<UiState>((set) => ({
  tabs: [],
  query: '',
  settings: false,
  connected: false,
  windowState: { ...EMPTY_WINDOW_STATE },
  dockStatus: { active: false, width: 0 },
  setDockStatus: (dockStatus) => set({ dockStatus }),
  receive: (event) =>
    event.type === 'focus'
      ? undefined
      : event.type === 'error'
        ? set({ error: event.error })
        : set((state) => ({
            metadata: event.metadata,
            windowState: event.windowState,
            query: event.windowState.query,
            tabs: tabReducer(state.tabs, {
              type: 'snapshot',
              tabs: event.tabs,
            }),
            error: undefined,
          })),
  setQuery: (query) => set({ query }),
  setSettings: (settings) => set({ settings }),
  setConnected: (connected) => set({ connected }),
  setError: (error) => set({ error }),
}));
