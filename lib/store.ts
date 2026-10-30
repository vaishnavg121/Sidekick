import { create } from 'zustand';
import type { Metadata } from './models';
import { tabReducer, type TabItem } from './tabs';
import type { ServerEvent } from './protocol';
import { EMPTY_WINDOW_STATE, type WindowUiState } from './window-state';
import type { DockStatus } from './docking';
import type {
  TabClassification,
  WorkspaceRecommendation,
  RelatedTabGroup,
  FocusRelevance,
  CleanupSuggestion,
} from './models';
interface AiSuggestionsState {
  classifications: TabClassification[];
  recommendations: WorkspaceRecommendation[];
  groups: RelatedTabGroup[];
  focusRelevance: FocusRelevance[];
  cleanupSuggestions: CleanupSuggestion[];
  isLoading: boolean;
  loadingType?: 'classify' | 'route' | 'group' | 'focus' | 'cleanup';
  focusGoal: string;
  focusMode: boolean;
  setClassifications: (classifications: TabClassification[]) => void;
  setRecommendations: (recommendations: WorkspaceRecommendation[]) => void;
  setGroups: (groups: RelatedTabGroup[]) => void;
  setFocusRelevance: (relevance: FocusRelevance[]) => void;
  setCleanupSuggestions: (suggestions: CleanupSuggestion[]) => void;
  setLoading: (
    loading: boolean,
    type?: 'classify' | 'route' | 'group' | 'focus' | 'cleanup',
  ) => void;
  setFocusGoal: (goal: string) => void;
  setFocusMode: (enabled: boolean) => void;
  clearSuggestions: () => void;
}
interface UiState {
  metadata?: Metadata;
  tabs: TabItem[];
  query: string;
  settings: boolean;
  connected: boolean;
  error?: string;
  windowState: WindowUiState;
  dockStatus: DockStatus;
  ai: AiSuggestionsState;
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
  ai: {
    classifications: [],
    recommendations: [],
    groups: [],
    focusRelevance: [],
    cleanupSuggestions: [],
    isLoading: false,
    loadingType: undefined,
    focusGoal: '',
    focusMode: false,
    setClassifications: (classifications) =>
      set((state) => ({ ai: { ...state.ai, classifications } })),
    setRecommendations: (recommendations) =>
      set((state) => ({ ai: { ...state.ai, recommendations } })),
    setGroups: (groups) => set((state) => ({ ai: { ...state.ai, groups } })),
    setFocusRelevance: (focusRelevance) =>
      set((state) => ({ ai: { ...state.ai, focusRelevance } })),
    setCleanupSuggestions: (cleanupSuggestions) =>
      set((state) => ({ ai: { ...state.ai, cleanupSuggestions } })),
    setLoading: (isLoading, loadingType) =>
      set((state) => ({ ai: { ...state.ai, isLoading, loadingType } })),
    setFocusGoal: (focusGoal) =>
      set((state) => ({ ai: { ...state.ai, focusGoal } })),
    setFocusMode: (focusMode) =>
      set((state) => ({ ai: { ...state.ai, focusMode } })),
    clearSuggestions: () =>
      set((state) => ({
        ai: {
          ...state.ai,
          classifications: [],
          recommendations: [],
          groups: [],
          focusRelevance: [],
          cleanupSuggestions: [],
          isLoading: false,
          loadingType: undefined,
        },
      })),
  },
  setDockStatus: (dockStatus) => set({ dockStatus }),
  receive: (event: ServerEvent) =>
    event.type === 'focus'
      ? undefined
      : event.type === 'error'
        ? set({ error: event.error })
        : event.type === 'snapshot'
          ? set((state) => ({
              metadata: event.metadata,
              windowState: event.windowState,
              query: event.windowState.query,
              tabs: tabReducer(state.tabs, {
                type: 'snapshot',
                tabs: event.tabs,
              }),
              error: undefined,
            }))
          : undefined,
  setQuery: (query) => set({ query }),
  setSettings: (settings) => set({ settings }),
  setConnected: (connected) => set({ connected }),
  setError: (error) => set({ error }),
}));
