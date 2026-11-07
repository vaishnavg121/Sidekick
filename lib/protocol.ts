import { isAppearance, type Appearance } from './appearance';
import {
  isProductivityCommand,
  type ProductivityCommand,
} from './productivity';
import type {
  Metadata,
  SidebarPreferences,
  ResourceKind,
  Theme,
  AiSettings,
  TabClassification,
  WorkspaceRecommendation,
  RelatedTabGroup,
  FocusRelevance,
  CleanupSuggestion,
} from './models';
import type { ResourceInput } from './resources';
import type { TabItem } from './tabs';
import type { WindowUiState } from './window-state';
import type { BookmarkItem } from './bookmarks';
export const PORT_NAME = 'sidekick:sidebar:v1';
export type AuthorCommand =
  | { type: 'resource.save'; kind: ResourceKind; input: ResourceInput }
  | {
      type: 'resource.current';
      kind: ResourceKind;
      tabId?: number;
      folderId?: string | null;
    }
  | {
      type: 'resource.open' | 'resource.remove';
      kind: ResourceKind;
      id: string;
    }
  | {
      type: 'resource.move';
      kind: ResourceKind;
      id: string;
      workspaceId: string;
      folderId: string | null;
    }
  | {
      type: 'resource.reorder';
      kind: ResourceKind;
      workspaceId: string;
      ids: string[];
      folderId: string | null;
    }
  | {
      type: 'workspace.save';
      input: {
        id?: string;
        name: string;
        color: string;
        icon: string;
        theme: Theme;
        preferredEmail: string;
      };
    }
  | {
      type: 'folder.save';
      input: {
        id?: string;
        workspaceId: string;
        parentId: string | null;
        name: string;
        collapsed?: boolean;
      };
    }
  | {
      type: 'folder.reorder';
      workspaceId: string;
      ids: string[];
      parentId: string | null;
    }
  | {
      type: 'folder.move';
      id: string;
      workspaceId: string;
      parentId: string | null;
    }
  | { type: 'folder.remove'; id: string };
export type Command =
  | {
      type: 'appearance.update';
      config: Appearance | null;
      workspaceId?: string;
    }
  | AuthorCommand
  | ProductivityCommand
  | { type: 'dashboard.open' | 'settings.open' | 'shortcuts.read' }
  | {
      type: 'focus.update';
      goal: string;
      mode: boolean;
      hiddenUrls?: string[];
      hiddenTabIds?: number[];
    }
  | {
      type: 'ai.classification.reject';
      tabId: number;
      category: import('./models').TabCategory;
    }
  | { type: 'ai.route.reject'; tabId: number; workspaceId: string }
  | { type: 'tab.activate' | 'tab.close'; tabId: number }
  | { type: 'tab.create' }
  | {
      type: 'tab.move';
      tabId: number;
      windowId: number;
      index: number;
      workspaceId?: string;
    }
  | { type: 'immersive.enter' | 'immersive.exit' }
  | { type: 'navigation.go'; input: string; newTab?: boolean }
  | {
      type: 'navigation.action';
      action: 'back' | 'forward' | 'reload' | 'stop' | 'close';
    }
  | { type: 'bookmarks.read'; query: string }
  | {
      type: 'favorite.save';
      id?: string;
      title: string;
      url: string;
      workspaceId: string;
    }
  | { type: 'favorite.remove'; id: string }
  | { type: 'panel.pin' }
  | { type: 'sidebar.mode'; mode: 'hidden' | 'hover' | 'docked' }
  | { type: 'search.update'; query: string }
  | { type: 'preferences.update'; patch: Partial<SidebarPreferences> }
  | { type: 'workspace.select' | 'workspace.delete'; id: string }
  | { type: 'ai.settings.update'; patch: Partial<AiSettings> }
  | { type: 'ai.classify'; tabIds: number[] }
  | { type: 'ai.route'; tabIds: number[] }
  | { type: 'ai.group'; tabIds: number[] }
  | { type: 'ai.focus'; goal: string; tabIds: number[] }
  | { type: 'ai.cleanup'; tabIds: number[] }
  | { type: 'ai.apply.classification'; classifications: TabClassification[] }
  | { type: 'ai.apply.routing'; recommendations: WorkspaceRecommendation[] }
  | { type: 'ai.apply.groups'; groups: RelatedTabGroup[] }
  | { type: 'ai.apply.focus'; relevance: FocusRelevance[] }
  | { type: 'ai.apply.cleanup'; suggestions: CleanupSuggestion[] }
  | { type: 'tab.updateWorkspace'; tabId: number; workspaceId: string };
export type Request = {
  channel: 'sidekick';
  windowId?: number;
  command: Command;
};
export type Reply =
  | {
      ok: true;
      bookmarks?: BookmarkItem[];
      backup?: string;
      preview?: { token: string; workspaces: number; pages: number };
      shortcuts?: chrome.commands.Command[];
    }
  | { ok: false; error: string };
export type ServerEvent =
  | {
      type: 'focus';
      address: boolean;
      openCommandPalette?: boolean;
      uiAction?: 'focus-tab-search' | 'organize-jev';
    }
  | {
      type: 'snapshot';
      tabs: TabItem[];
      metadata: Metadata;
      windowId: number;
      windowState: WindowUiState;
    }
  | { type: 'error'; error: string }
  | {
      type: 'ai.classify.result';
      classifications: TabClassification[];
    }
  | {
      type: 'ai.route.result';
      recommendations: WorkspaceRecommendation[];
    }
  | {
      type: 'ai.group.result';
      groups: RelatedTabGroup[];
    }
  | {
      type: 'ai.focus.result';
      relevance: FocusRelevance[];
    }
  | {
      type: 'ai.cleanup.result';
      suggestions: CleanupSuggestion[];
    }
  | {
      type: 'ai.loading';
      loadingType: 'classify' | 'route' | 'group' | 'focus' | 'cleanup';
    }
  | { type: 'ai.error'; error: string; loadingType?: string };
export function isCommand(value: unknown): value is Command {
  if (!value || typeof value !== 'object') return false;
  const c = value as Record<string, unknown>;
  const id = (value: unknown) =>
    typeof value === 'string' && value.length > 0 && value.length < 200;
  const nullableId = (value: unknown) => value === null || id(value);
  if (isProductivityCommand(c)) return true;
  const kind = c.kind === 'favorite' || c.kind === 'pinned';
  switch (c.type) {
    case 'dashboard.open':
    case 'settings.open':
    case 'shortcuts.read':
      return true;
    case 'focus.update':
      return (
        typeof c.goal === 'string' &&
        c.goal.length <= 500 &&
        typeof c.mode === 'boolean' &&
        (c.hiddenTabIds === undefined ||
          (Array.isArray(c.hiddenTabIds) &&
            c.hiddenTabIds.length <= 1000 &&
            c.hiddenTabIds.every(tabId))) &&
        (c.hiddenUrls === undefined ||
          (Array.isArray(c.hiddenUrls) &&
            c.hiddenUrls.length <= 1000 &&
            c.hiddenUrls.every(
              (u) => typeof u === 'string' && u.length <= 4096,
            )))
      );
    case 'ai.classification.reject':
      return isClassification({
        tabId: c.tabId,
        category: c.category,
        confidence: 1,
        reasoning: '',
      });
    case 'ai.route.reject':
      return (
        Number.isInteger(c.tabId) && Number(c.tabId) >= 0 && id(c.workspaceId)
      );
    case 'resource.save': {
      if (!kind || !c.input || typeof c.input !== 'object') return false;
      const input = c.input as Record<string, unknown>;
      return (
        (input.id === undefined || id(input.id)) &&
        id(input.workspaceId) &&
        typeof input.title === 'string' &&
        input.title.trim().length > 0 &&
        input.title.length <= 200 &&
        typeof input.url === 'string' &&
        input.url.length <= 4096 &&
        (input.folderId === undefined || nullableId(input.folderId)) &&
        (input.favicon === undefined ||
          (typeof input.favicon === 'string' &&
            input.favicon.length <= 16000 &&
            /^(https?:|data:image\/)/.test(input.favicon)))
      );
    }
    case 'resource.current':
      return (
        kind &&
        (c.tabId === undefined ||
          (Number.isInteger(c.tabId) && Number(c.tabId) >= 0)) &&
        (c.folderId === undefined || nullableId(c.folderId))
      );
    case 'resource.open':
    case 'resource.remove':
      return kind && id(c.id);
    case 'resource.move':
      return kind && id(c.id) && id(c.workspaceId) && nullableId(c.folderId);
    case 'resource.reorder':
      return (
        kind &&
        id(c.workspaceId) &&
        Array.isArray(c.ids) &&
        c.ids.length <= 10000 &&
        c.ids.every(id) &&
        nullableId(c.folderId)
      );
    case 'workspace.save': {
      if (!c.input || typeof c.input !== 'object') return false;
      const input = c.input as Record<string, unknown>;
      return (
        (input.id === undefined || id(input.id)) &&
        typeof input.name === 'string' &&
        input.name.trim().length > 0 &&
        input.name.length <= 60 &&
        typeof input.color === 'string' &&
        /^#[\da-f]{6}$/i.test(input.color) &&
        typeof input.icon === 'string' &&
        input.icon.length <= 12 &&
        ['dark', 'light', 'system'].includes(String(input.theme)) &&
        typeof input.preferredEmail === 'string' &&
        input.preferredEmail.length <= 254
      );
    }
    case 'folder.save': {
      if (!c.input || typeof c.input !== 'object') return false;
      const input = c.input as Record<string, unknown>;
      return (
        (input.id === undefined || id(input.id)) &&
        id(input.workspaceId) &&
        nullableId(input.parentId) &&
        typeof input.name === 'string' &&
        input.name.trim().length > 0 &&
        input.name.length <= 80 &&
        (input.collapsed === undefined || typeof input.collapsed === 'boolean')
      );
    }
    case 'folder.remove':
      return id(c.id);
    case 'tab.activate':
    case 'tab.close':
      return Number.isInteger(c.tabId) && Number(c.tabId) >= 0;
    case 'tab.create':
      return true;
    case 'tab.move':
      return (
        typeof c.tabId === 'number' &&
        Number.isInteger(c.tabId) &&
        c.tabId >= 0 &&
        typeof c.windowId === 'number' &&
        Number.isInteger(c.windowId) &&
        c.windowId > 0 &&
        typeof c.index === 'number' &&
        Number.isInteger(c.index) &&
        c.index >= 0 &&
        (c.workspaceId === undefined ||
          (typeof c.workspaceId === 'string' && c.workspaceId.length < 200))
      );
    case 'panel.pin':
    case 'immersive.enter':
    case 'immersive.exit':
      return true;
    case 'navigation.go':
      return (
        typeof c.input === 'string' &&
        c.input.length <= 4096 &&
        (c.newTab === undefined || typeof c.newTab === 'boolean')
      );
    case 'navigation.action':
      return ['back', 'forward', 'reload', 'stop', 'close'].includes(
        String(c.action),
      );
    case 'bookmarks.read':
      return typeof c.query === 'string' && c.query.length <= 2000;
    case 'favorite.save':
      return (
        typeof c.title === 'string' &&
        c.title.trim().length > 0 &&
        c.title.length <= 200 &&
        typeof c.url === 'string' &&
        c.url.length <= 4096 &&
        typeof c.workspaceId === 'string' &&
        c.workspaceId.length < 200 &&
        (c.id === undefined || (typeof c.id === 'string' && c.id.length < 200))
      );
    case 'favorite.remove':
      return typeof c.id === 'string' && c.id.length < 200;
    case 'folder.reorder':
      return (
        typeof c.workspaceId === 'string' &&
        c.workspaceId.length < 200 &&
        Array.isArray(c.ids) &&
        c.ids.every(
          (id: unknown) => typeof id === 'string' && id.length < 200,
        ) &&
        (c.parentId === null ||
          (typeof c.parentId === 'string' && c.parentId.length < 200))
      );
    case 'folder.move':
      return (
        typeof c.id === 'string' &&
        c.id.length < 200 &&
        typeof c.workspaceId === 'string' &&
        c.workspaceId.length < 200 &&
        (c.parentId === null ||
          (typeof c.parentId === 'string' && c.parentId.length < 200))
      );
    case 'sidebar.mode':
      return c.mode === 'hidden' || c.mode === 'hover' || c.mode === 'docked';
    case 'search.update':
      return typeof c.query === 'string' && c.query.length <= 2000;
    case 'workspace.delete':
    case 'workspace.select':
      return typeof c.id === 'string' && c.id.length < 200;
    case 'appearance.update':
      return (
        (c.config === null || isAppearance(c.config)) &&
        (c.workspaceId === undefined || id(c.workspaceId))
      );
    case 'preferences.update': {
      if (!c.patch || typeof c.patch !== 'object' || Array.isArray(c.patch))
        return false;
      return Object.entries(c.patch).every(([key, v]) =>
        key === 'mode'
          ? ['hidden', 'hover', 'docked', 'pinned'].includes(String(v))
          : ['width', 'openDelay', 'closeDelay'].includes(key) &&
            typeof v === 'number' &&
            Number.isFinite(v),
      );
    }
    case 'ai.settings.update': {
      if (!c.patch || typeof c.patch !== 'object' || Array.isArray(c.patch))
        return false;
      const p = c.patch as Record<string, unknown>;
      const provider =
        p.provider ?? (Object.hasOwn(p, 'gatewayKey') ? 'vercel' : 'typesafe');
      const field = provider === 'typesafe' ? 'typesafeKey' : 'gatewayKey';
      return (
        ['typesafe', 'vercel'].includes(String(provider)) &&
        Object.keys(p).every((k) => k === 'provider' || k === field) &&
        typeof p[field] === 'string' &&
        String(p[field]).length <= 1000
      );
    }
    case 'ai.classify':
    case 'ai.route':
    case 'ai.group':
    case 'ai.cleanup':
      return (
        Array.isArray(c.tabIds) &&
        c.tabIds.length <= 500 &&
        c.tabIds.every(
          (t): t is number =>
            typeof t === 'number' && Number.isInteger(t) && t >= 0,
        )
      );
    case 'ai.focus':
      return (
        typeof c.goal === 'string' &&
        c.goal.length <= 500 &&
        Array.isArray(c.tabIds) &&
        c.tabIds.length <= 500 &&
        c.tabIds.every(
          (t): t is number =>
            typeof t === 'number' && Number.isInteger(t) && t >= 0,
        )
      );
    case 'ai.apply.classification':
      return (
        Array.isArray(c.classifications) &&
        c.classifications.length <= 500 &&
        c.classifications.every((v) => isClassification(v))
      );
    case 'ai.apply.routing':
      return (
        Array.isArray(c.recommendations) &&
        c.recommendations.length <= 500 &&
        c.recommendations.every(
          (v) =>
            v &&
            typeof v === 'object' &&
            tabId(v.tabId) &&
            id(v.workspaceId) &&
            typeof v.workspaceName === 'string' &&
            v.workspaceName.length <= 60 &&
            text(v.reason) &&
            probability(v.confidence),
        )
      );
    case 'ai.apply.groups':
      return (
        Array.isArray(c.groups) &&
        c.groups.length <= 100 &&
        c.groups.every(
          (v) =>
            v &&
            typeof v === 'object' &&
            Array.isArray(v.tabs) &&
            v.tabs.length > 1 &&
            v.tabs.length <= 500 &&
            v.tabs.every(tabId) &&
            new Set(v.tabs).size === v.tabs.length &&
            typeof v.topic === 'string' &&
            v.topic.length > 0 &&
            v.topic.length <= 80 &&
            text(v.description),
        )
      );
    case 'ai.apply.focus':
      return (
        Array.isArray(c.relevance) &&
        c.relevance.length <= 500 &&
        c.relevance.every(
          (v) =>
            v &&
            typeof v === 'object' &&
            tabId(v.tabId) &&
            probability(v.score) &&
            text(v.reason),
        )
      );
    case 'ai.apply.cleanup':
      return (
        Array.isArray(c.suggestions) &&
        c.suggestions.length <= 500 &&
        c.suggestions.every(
          (v) =>
            v &&
            typeof v === 'object' &&
            ['duplicate', 'stale', 'low-value'].includes(v.type) &&
            Array.isArray(v.tabIds) &&
            v.tabIds.length <= 500 &&
            v.tabIds.every(tabId) &&
            text(v.description),
        )
      );
    case 'tab.updateWorkspace':
      return (
        typeof c.tabId === 'number' &&
        Number.isInteger(c.tabId) &&
        c.tabId >= 0 &&
        typeof c.workspaceId === 'string' &&
        c.workspaceId.length < 200
      );
    default:
      return false;
  }
}

const tabId = (v: unknown) => Number.isInteger(v) && Number(v) >= 0;
const probability = (v: unknown) =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1;
const text = (v: unknown) => typeof v === 'string' && v.length <= 1000;
function isClassification(v: unknown): boolean {
  if (!v || typeof v !== 'object') return false;
  const c = v as Record<string, unknown>;
  return (
    tabId(c.tabId) &&
    [
      'Development',
      'Research',
      'Education',
      'Documentation',
      'Productivity',
      'Entertainment',
      'Shopping',
      'Communication',
      'Other',
    ].includes(String(c.category)) &&
    probability(c.confidence) &&
    text(c.reasoning)
  );
}
