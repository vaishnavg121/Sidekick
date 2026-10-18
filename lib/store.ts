import { create } from 'zustand';
import type { Metadata } from './models';
import { tabReducer, type TabItem } from './tabs';
import type { ServerEvent } from './protocol';
interface UiState {
  metadata?: Metadata;
  tabs: TabItem[];
  query: string;
  settings: boolean;
  connected: boolean;
  error?: string;
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
  receive: (event) =>
    event.type === 'error'
      ? set({ error: event.error })
      : set((state) => ({
          metadata: event.metadata,
          tabs: tabReducer(state.tabs, { type: 'snapshot', tabs: event.tabs }),
          error: undefined,
        })),
  setQuery: (query) => set({ query }),
  setSettings: (settings) => set({ settings }),
  setConnected: (connected) => set({ connected }),
  setError: (error) => set({ error }),
}));
