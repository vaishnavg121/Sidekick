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
  | { type: 'folder.remove'; id: string };
export type Command =
  | AuthorCommand
  | { type: 'tab.activate' | 'tab.close'; tabId: number }
  | { type: 'tab.create' }
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
  | { type: 'workspace.select'; id: string }
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
  | { type: 'ai.apply.cleanup'; suggestions: CleanupSuggestion[] };
export type Request = {
  channel: 'sidekick';
  windowId?: number;
  command: Command;
};
export type Reply =
  { ok: true; bookmarks?: BookmarkItem[] } | { ok: false; error: string };
export type ServerEvent =
  | { type: 'focus'; address: boolean }
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
  const kind = c.kind === 'favorite' || c.kind === 'pinned';
  switch (c.type) {
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
    case 'sidebar.mode':
      return c.mode === 'hidden' || c.mode === 'hover' || c.mode === 'docked';
    case 'search.update':
      return typeof c.query === 'string' && c.query.length <= 2000;
    case 'workspace.select':
      return typeof c.id === 'string' && c.id.length < 200;
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
      return Object.entries(c.patch).every(
        ([key, v]) =>
          [
            'gatewayKey',
            'connected',
            'status',
            'lastError',
            'lastVerified',
          ].includes(key) &&
          (key === 'gatewayKey'
            ? typeof v === 'string' || v === undefined
            : key === 'connected'
              ? typeof v === 'boolean'
              : key === 'status'
                ? ['disconnected', 'connecting', 'connected', 'error'].includes(
                    String(v),
                  )
                : key === 'lastError'
                  ? typeof v === 'string' || v === undefined
                  : key === 'lastVerified'
                    ? typeof v === 'string' || v === undefined
                    : true),
      );
    }
    case 'ai.classify':
    case 'ai.route':
    case 'ai.group':
    case 'ai.cleanup':
      return (
        Array.isArray(c.tabIds) &&
        c.tabIds.length <= 100 &&
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
        c.tabIds.length <= 100 &&
        c.tabIds.every(
          (t): t is number =>
            typeof t === 'number' && Number.isInteger(t) && t >= 0,
        )
      );
    case 'ai.apply.classification':
      return (
        Array.isArray(c.classifications) &&
        c.classifications.length <= 100 &&
        c.classifications.every(
          (cls: unknown) =>
            cls &&
            typeof cls === 'object' &&
            typeof (cls as Record<string, unknown>).tabId === 'number' &&
            typeof (cls as Record<string, unknown>).category === 'string' &&
            typeof (cls as Record<string, unknown>).confidence === 'number' &&
            typeof (cls as Record<string, unknown>).reasoning === 'string',
        )
      );
    case 'ai.apply.routing':
      return (
        Array.isArray(c.recommendations) &&
        c.recommendations.length <= 100 &&
        c.recommendations.every(
          (rec: unknown) =>
            rec &&
            typeof rec === 'object' &&
            typeof (rec as Record<string, unknown>).tabId === 'number' &&
            typeof (rec as Record<string, unknown>).workspaceId === 'string' &&
            typeof (rec as Record<string, unknown>).workspaceName ===
              'string' &&
            typeof (rec as Record<string, unknown>).reason === 'string' &&
            typeof (rec as Record<string, unknown>).confidence === 'number',
        )
      );
    case 'ai.apply.groups':
      return (
        Array.isArray(c.groups) &&
        c.groups.length <= 100 &&
        c.groups.every(
          (grp: unknown) =>
            grp &&
            typeof grp === 'object' &&
            Array.isArray((grp as Record<string, unknown>).tabs) &&
            typeof (grp as Record<string, unknown>).topic === 'string' &&
            typeof (grp as Record<string, unknown>).description === 'string',
        )
      );
    case 'ai.apply.focus':
      return (
        Array.isArray(c.relevance) &&
        c.relevance.length <= 100 &&
        c.relevance.every(
          (rel: unknown) =>
            rel &&
            typeof rel === 'object' &&
            typeof (rel as Record<string, unknown>).tabId === 'number' &&
            typeof (rel as Record<string, unknown>).score === 'number' &&
            typeof (rel as Record<string, unknown>).reason === 'string',
        )
      );
    case 'ai.apply.cleanup':
      return (
        Array.isArray(c.suggestions) &&
        c.suggestions.length <= 100 &&
        c.suggestions.every(
          (sug: unknown) =>
            sug &&
            typeof sug === 'object' &&
            ['duplicate', 'stale', 'low-value'].includes(
              String((sug as Record<string, unknown>).type),
            ) &&
            Array.isArray((sug as Record<string, unknown>).tabIds) &&
            typeof (sug as Record<string, unknown>).description === 'string',
        )
      );
    default:
      return false;
  }
}
