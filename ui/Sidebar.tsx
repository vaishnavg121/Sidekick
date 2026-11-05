import { TabActions } from './TabActions';
import { LibraryView } from './LibraryView';
import {
  useEffect,
  useMemo,
  useState,
  useRef,
  useCallback,
  type CSSProperties,
} from 'react';
import { SidebarClient } from '../lib/client';
import { useSidebar } from '../lib/store';
import { DEFAULT_PREFERENCES } from '../lib/models';
import { searchTabs, type TabItem } from '../lib/tabs';
import type { Command } from '../lib/protocol';
import { HoverController } from './hover';
import { Icon } from './Icon';
import { Settings } from './Settings';
import { Navigation, ImmersiveControls } from './Navigation';
import { WorkspaceSelector } from './WorkspaceSelector';
import { Favorites } from './Favorites';
import { Bookmarks } from './Bookmarks';
import { pageControls } from '../lib/page-controls';
import { Pinned } from './Pinned';
import { useTheme } from './theme';
import {
  allowDrag,
  readDrag,
  startDrag,
  setDragImage,
  validateDragItem,
} from './drag';
import { AISuggestionsPanel } from './AISuggestionsPanel';
import { CommandPalette } from './CommandPalette';
import type { BookmarkItem } from '../lib/bookmarks';
import type { CommandPaletteAction } from '../lib/command-palette';

function TabRow({
  tab,
  run,
  onDragStart,
  onDragOver,
  onDragEnd,
  onDragLeave,
  onDrop,
}: {
  tab: TabItem;
  run: (command: Command) => void;
  onDragStart: (event: React.DragEvent, tab: TabItem) => void;
  onDragOver: (event: React.DragEvent) => void;
  onDragEnd: () => void;
  onDragLeave: () => void;
  onDrop: (event: React.DragEvent, targetTab?: TabItem) => void;
}) {
  const category = useSidebar(
    (s) => s.metadata?.aiState?.acceptedByUrl?.[tab.url]?.category,
  );
  const safeIcon =
    tab.favicon && /^(https?:|data:image\/)/.test(tab.favicon)
      ? tab.favicon
      : undefined;
  return (
    <li
      data-tab-id={tab.id}
      onContextMenu={(event) => {
        event.preventDefault();
        event.currentTarget
          .querySelector<HTMLButtonElement>('.tab-actions > button')
          ?.click();
      }}
      onKeyDown={(event) => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault();
          const row = event.currentTarget;
          const rows = Array.from(
            row.closest('.tab-list')?.querySelectorAll('.tab-row') ?? [],
          );
          const index = rows.indexOf(row);
          const next = rows[index + (event.key === 'ArrowDown' ? 1 : -1)];
          next?.querySelector<HTMLButtonElement>('.tab-activate')?.focus();
        }
      }}
      className={`tab-row ${tab.active ? 'active' : ''}`}
      draggable
      onDragStart={(event) => onDragStart(event, tab)}
      onDragOver={onDragOver}
      onDrop={(event) => onDrop(event, tab)}
      onDragEnd={onDragEnd}
      onDragLeave={onDragLeave}
    >
      <button
        className="tab-activate"
        aria-current={tab.active ? 'page' : undefined}
        title={`${tab.title}\n${tab.url}${tab.restricted ? '\nUse the native side panel on this page.' : ''}`}
        onClick={() => run({ type: 'tab.activate', tabId: tab.id })}
      >
        <span className={`favicon ${tab.loading ? 'is-loading' : ''}`}>
          {tab.loading ? (
            <span className="spinner" />
          ) : (
            <>
              <Icon name="globe" size={16} />
              {safeIcon && (
                <img
                  src={safeIcon}
                  alt=""
                  referrerPolicy="no-referrer"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                  }}
                />
              )}
            </>
          )}
        </span>
        <span className="truncate">{tab.title}</span>
        {category && (
          <span className="tab-category" title={category}>
            {category}
          </span>
        )}
        {tab.active && <span className="active-dot" aria-hidden="true" />}
      </button>
      <TabActions tab={tab} run={run} />
      <button
        className="tab-close"
        aria-label={`Close ${tab.title}`}
        title="Close tab"
        onClick={() => run({ type: 'tab.close', tabId: tab.id })}
      >
        <Icon name="close" size={14} />
      </button>
    </li>
  );
}

export function Sidebar({
  nativePanel,
  embedded = false,
}: {
  nativePanel: boolean;
  embedded?: boolean;
}) {
  const tabSearchRef = useRef<HTMLInputElement>(null);
  const state = useSidebar();
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const [pinPending, setPinPending] = useState(false);
  const [bookmarks, setBookmarks] = useState(false);
  const [library, setLibrary] = useState(false);
  const [showAIPanel, setShowAIPanel] = useState(false);
  const [forcedReveal, setForcedReveal] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [paletteBookmarks, setPaletteBookmarks] = useState<BookmarkItem[]>([]);
  const hover = useMemo(() => new HoverController(setOpen), []);
  const [client] = useState(
    () =>
      new SidebarClient((event) => {
        if (event.type === 'snapshot') {
          if (
            event.windowState.immersive !==
            useSidebar.getState().windowState.immersive
          ) {
            hover.cancel();
            setForcedReveal(true);
            setOpen(true);
          }
          const mode = event.metadata.preferences.mode;
          if (
            event.windowState.nativePanelOpen ||
            (mode === 'pinned' && !hover.revealRequested)
          ) {
            hover.cancelReveal();
            hover.close();
            setFocused(false);
          } else if (
            mode === 'hidden' &&
            !event.windowState.immersive &&
            !hover.revealRequested
          ) {
            hover.close();
            setFocused(false);
          } else if (mode === 'hover' && hover.revealRequested) {
            // An older Hidden snapshot must not cancel a user's edge click
            // while its change-to-Hover command is still being processed.
            hover.cancelReveal();
            setOpen(true);
          }
          if (event.windowState.nativePanelOpen) setPinPending(false);
        } else if (event.type === 'ai.loading') {
          useSidebar.getState().ai.setLoading(true, event.loadingType);
        } else if (event.type === 'ai.error') {
          useSidebar.getState().ai.setLoading(false);
          useSidebar.getState().setError(event.error);
        } else if (event.type === 'ai.classify.result') {
          useSidebar.getState().ai.setLoading(false);
          useSidebar.getState().ai.setClassifications(event.classifications);
        } else if (event.type === 'ai.route.result') {
          useSidebar.getState().ai.setLoading(false);
          useSidebar.getState().ai.setRecommendations(event.recommendations);
        } else if (event.type === 'ai.group.result') {
          useSidebar.getState().ai.setLoading(false);
          useSidebar.getState().ai.setGroups(event.groups);
        } else if (event.type === 'ai.focus.result') {
          useSidebar.getState().ai.setLoading(false);
          useSidebar.getState().ai.setFocusRelevance(event.relevance);
        } else if (event.type === 'ai.cleanup.result') {
          useSidebar.getState().ai.setLoading(false);
          useSidebar.getState().ai.setCleanupSuggestions(event.suggestions);
        }
        useSidebar.getState().receive(event);
      }, useSidebar.getState().setConnected),
  );
  useEffect(() => {
    void client.start(nativePanel || embedded);
    return () => {
      hover.cancel();
      client.dispose();
    };
  }, [client, hover, nativePanel, embedded]);

  const openCommandPalette = useCallback(() => {
    hover.requestReveal();
    setForcedReveal(true);
    setOpen(true);
    setCommandPaletteOpen(true);
    // Fetch bookmarks for the palette
    client
      .request({ type: 'bookmarks.read', query: '' } as Command)
      .then((reply) => {
        if (reply.ok && reply.bookmarks) {
          setPaletteBookmarks(reply.bookmarks);
        }
      })
      .catch(() => {
        // Ignore bookmark fetch errors
      });
  }, [client, hover]);

  const closeCommandPalette = useCallback(() => {
    setCommandPaletteOpen(false);
  }, []);

  useEffect(() => {
    const reveal = () => {
      if (
        embedded &&
        useSidebar.getState().metadata?.preferences.mode === 'hidden'
      )
        void client
          .command({ type: 'sidebar.mode', mode: 'hover' })
          .catch((e: Error) => useSidebar.getState().setError(e.message));
      hover.cancel();
      hover.requestReveal();
      setForcedReveal(true);
      setOpen(true);
    };
    const openPalette = () => {
      openCommandPalette();
    };
    const searchTabs = () => {
      reveal();
      setLibrary(false);
      stateSettings(false);
      setBookmarks(false);
      setShowAIPanel(false);
      requestAnimationFrame(() => tabSearchRef.current?.focus());
    };
    const stateSettings = (value: boolean) =>
      useSidebar.getState().setSettings(value);
    const organize = () => {
      reveal();
      setLibrary(false);
      stateSettings(false);
      setBookmarks(false);
      setShowAIPanel(true);
    };
    pageControls.addEventListener('focus-tab-search', searchTabs);
    pageControls.addEventListener('organize-jev', organize);
    pageControls.addEventListener('address', reveal);
    pageControls.addEventListener('reveal', reveal);
    pageControls.addEventListener('open-command-palette', openPalette);
    return () => {
      pageControls.removeEventListener('focus-tab-search', searchTabs);
      pageControls.removeEventListener('organize-jev', organize);
      pageControls.removeEventListener('address', reveal);
      pageControls.removeEventListener('reveal', reveal);
      pageControls.removeEventListener('open-command-palette', openPalette);
    };
  }, [hover, embedded, client, openCommandPalette]);

  type ActivateTabPayload = { tabId: number };
  type SwitchWorkspacePayload = { workspaceId: string };
  type OpenUrlPayload = { url: string; newTab?: boolean };
  type OpenFavoritePayload = { id: string };
  type OpenPinnedPayload = { id: string };
  type OpenBookmarkPayload = { url: string };
  type SearchWebPayload = { query: string };

  function isActivateTabPayload(p: unknown): p is ActivateTabPayload {
    return (
      typeof p === 'object' &&
      p !== null &&
      typeof (p as Record<string, unknown>).tabId === 'number'
    );
  }
  function isSwitchWorkspacePayload(p: unknown): p is SwitchWorkspacePayload {
    return (
      typeof p === 'object' &&
      p !== null &&
      typeof (p as Record<string, unknown>).workspaceId === 'string'
    );
  }
  function isOpenUrlPayload(p: unknown): p is OpenUrlPayload {
    return (
      typeof p === 'object' &&
      p !== null &&
      typeof (p as Record<string, unknown>).url === 'string'
    );
  }
  function isOpenFavoritePayload(p: unknown): p is OpenFavoritePayload {
    return (
      typeof p === 'object' &&
      p !== null &&
      typeof (p as Record<string, unknown>).id === 'string'
    );
  }
  function isOpenPinnedPayload(p: unknown): p is OpenPinnedPayload {
    return (
      typeof p === 'object' &&
      p !== null &&
      typeof (p as Record<string, unknown>).id === 'string'
    );
  }
  function isOpenBookmarkPayload(p: unknown): p is OpenBookmarkPayload {
    return (
      typeof p === 'object' &&
      p !== null &&
      typeof (p as Record<string, unknown>).url === 'string'
    );
  }
  function isSearchWebPayload(p: unknown): p is SearchWebPayload {
    return (
      typeof p === 'object' &&
      p !== null &&
      typeof (p as Record<string, unknown>).query === 'string'
    );
  }

  const handlePaletteAction = (action: CommandPaletteAction) => {
    const { type, payload } = action;
    switch (type) {
      case 'activate-tab':
        if (isActivateTabPayload(payload))
          run({ type: 'tab.activate', tabId: payload.tabId });
        break;
      case 'switch-workspace':
        if (isSwitchWorkspacePayload(payload))
          run({ type: 'workspace.select', id: payload.workspaceId });
        break;
      case 'open-url':
        if (isOpenUrlPayload(payload))
          run({
            type: 'navigation.go',
            input: payload.url,
            newTab: payload.newTab,
          });
        break;
      case 'open-favorite':
        if (isOpenFavoritePayload(payload))
          run({ type: 'resource.open', kind: 'favorite', id: payload.id });
        break;
      case 'open-pinned':
        if (isOpenPinnedPayload(payload))
          run({ type: 'resource.open', kind: 'pinned', id: payload.id });
        break;
      case 'open-bookmark':
        if (isOpenBookmarkPayload(payload))
          run({ type: 'navigation.go', input: payload.url });
        break;
      case 'new-tab':
        run({ type: 'tab.create' });
        break;
      case 'close-tab':
        run({
          type: 'tab.close',
          tabId: state.tabs.find((t) => t.active)?.id ?? -1,
        });
        break;
      case 'reload':
        run({ type: 'navigation.action', action: 'reload' });
        break;
      case 'toggle-sidebar':
        run({
          type: 'sidebar.mode',
          mode: effectiveMode === 'hover' ? 'hidden' : 'hover',
        });
        break;
      case 'toggle-immersive':
        run({
          type: state.windowState.immersive
            ? 'immersive.exit'
            : 'immersive.enter',
        });
        break;
      case 'pin-tab':
        run({
          type: 'resource.current',
          kind: 'pinned',
          tabId: state.tabs.find((t) => t.active)?.id,
        });
        break;
      case 'open-settings':
        setLibrary(false);
        setShowAIPanel(false);
        setBookmarks(false);
        state.setSettings(true);
        break;
      case 'open-bookmarks':
        setBookmarks(true);
        setShowAIPanel(false);
        state.setSettings(false);
        break;
      case 'organize-with-jev':
        setLibrary(false);
        setShowAIPanel(true);
        setBookmarks(false);
        state.setSettings(false);
        break;
      case 'search-web':
        if (isSearchWebPayload(payload))
          run({ type: 'navigation.go', input: payload.query });
        break;
      default:
        break;
    }
    closeCommandPalette();
  };

  const preferences = state.metadata?.preferences ?? DEFAULT_PREFERENCES;
  const effectiveMode =
    preferences.mode === 'docked' && !state.dockStatus.active && !embedded
      ? 'hover'
      : !embedded &&
          state.windowState.immersive &&
          preferences.mode === 'hidden'
        ? 'hover'
        : preferences.mode;
  const visible =
    nativePanel ||
    (embedded && preferences.mode !== 'hidden') ||
    (preferences.mode === 'docked' && state.dockStatus.active) ||
    (!embedded &&
      !pinPending &&
      !state.windowState.nativePanelOpen &&
      (effectiveMode === 'hover' || forcedReveal) &&
      (open || focused || forcedReveal || commandPaletteOpen));
  const pinnedUrls = new Set(
    state.metadata?.pinnedEntries
      .filter((e) => e.workspaceId === state.metadata?.activeWorkspaceId)
      .map((e) => e.url),
  );
  const focusPreference =
    state.metadata?.aiState?.focusPreferences[state.metadata.activeWorkspaceId];
  const focusMode = focusPreference?.mode ?? false;
  const hiddenIds =
    state.windowState.focusHidden?.[state.metadata?.activeWorkspaceId ?? '-'];
  const tabs = searchTabs(state.tabs, state.query).filter(
    (tab) =>
      !pinnedUrls.has(tab.url) &&
      (!focusMode ||
        (hiddenIds
          ? !hiddenIds.includes(tab.id)
          : !focusPreference?.hiddenUrls?.includes(tab.url))),
  );
  const run = (command: Command) => {
    if (command.type === 'workspace.select')
      state.setWorkspacePending(command.id);
    state.setError(undefined);
    const pinning =
      command.type === 'panel.pin' ||
      (command.type === 'preferences.update' &&
        command.patch.mode === 'pinned');
    if (pinning) {
      hover.cancelReveal();
      setPinPending(true);
      hover.close();
      setFocused(false);
    }
    void client
      .command(command)
      .then(() => {
        if (pinning) setPinPending(false);
      })
      .catch((error: unknown) => {
        state.setWorkspacePending(undefined);
        hover.cancelReveal();
        if (pinning) {
          setPinPending(false);
          setOpen(true);
        }
        state.setError(
          error instanceof Error ? error.message : 'Action failed. Try again.',
        );
      });
  };
  const collapse = () => {
    setForcedReveal(false);
    hover.cancelReveal();
    hover.close();
    setFocused(false);
  };

  // Drag-and-drop handlers for tabs
  const handleTabDragStart = (event: React.DragEvent, tab: TabItem) => {
    setDragImage(event, tab.title);
    startDrag(event, {
      kind: 'tab',
      id: String(tab.id),
      workspaceId: state.metadata?.activeWorkspaceId ?? '',
    });
  };

  const handleTabDragOver = (event: React.DragEvent) => {
    allowDrag(event);
  };

  const handleDragEnd = (event?: React.DragEvent) => {
    // Clean up drop-ready classes
    const target = event?.currentTarget;
    const root = target?.getRootNode?.() as Document | ShadowRoot | undefined;
    if (root) {
      root
        .querySelectorAll('.drop-ready')
        .forEach((node) => node.classList.remove('drop-ready'));
    }
  };

  const handleDragLeave = () => {
    // Clean up on leave
  };

  const handleDragLeaveCapture = (event: React.DragEvent) => {
    const target = event.target as HTMLElement;
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      event.currentTarget
        .querySelectorAll('.drop-ready')
        .forEach((node) => node.classList.remove('drop-ready'));
    } else {
      target.classList.remove('drop-ready');
    }
  };

  const handleTabDrop = (event: React.DragEvent, targetTab?: TabItem) => {
    const item = readDrag(event);
    if (!item) return;
    const activeWorkspaceId = state.metadata?.activeWorkspaceId ?? '';
    if (!validateDragItem(item, ['tab', 'pinned'], [activeWorkspaceId])) return;

    event.preventDefault();
    event.stopPropagation();

    if (item.kind === 'tab') {
      // Reorder tabs - use chrome.tabs.move for actual reordering
      if (targetTab && item.id !== String(targetTab.id)) {
        const tabIds = tabs.map((t) => String(t.id));
        const fromIndex = tabIds.indexOf(item.id);
        const toIndex = tabIds.indexOf(String(targetTab.id));
        if (fromIndex !== -1 && toIndex !== -1 && fromIndex !== toIndex) {
          const windowId = client.currentWindowId;
          if (windowId) {
            const moveIndex = targetTab.index;
            void client
              .command({
                type: 'tab.move',
                tabId: Number(item.id),
                windowId,
                index: moveIndex,
              })
              .catch((e: Error) => state.setError(e.message));
          }
        }
      }
    } else if (item.kind === 'pinned') {
      // Unpin: move pinned entry back to Today (reuse existing tab if available)
      void client
        .command({
          type: 'resource.open',
          kind: 'pinned',
          id: item.id,
        })
        .then(() =>
          client.command({
            type: 'resource.remove',
            kind: 'pinned',
            id: item.id,
          }),
        )
        .catch((e: Error) => state.setError(e.message));
    }
  };

  const setSearch = (query: string) => {
    state.setQuery(query);
    void client
      .search(query)
      .catch((error: unknown) =>
        state.setError(
          error instanceof Error
            ? error.message
            : 'Search could not be synchronized.',
        ),
      );
  };
  return (
    <div
      className={`sidekick-root ${embedded ? 'embedded' : nativePanel ? 'native' : state.dockStatus.active ? 'docked' : 'overlay'}`}
      data-theme={theme}
      data-workspace-id={state.metadata?.activeWorkspaceId}
      data-workspace-pending={state.workspacePending ? 'true' : undefined}
      aria-busy={!!state.workspacePending}
      style={{ '--sidebar-width': `${preferences.width}px` } as CSSProperties}
    >
      {!nativePanel &&
        (!embedded || preferences.mode === 'hidden') &&
        !state.dockStatus.active &&
        !pinPending &&
        !state.windowState.nativePanelOpen && (
          <button
            className="edge-strip"
            aria-label={
              effectiveMode === 'pinned'
                ? 'Open pinned Sidekick'
                : 'Open Sidekick'
            }
            aria-expanded={visible}
            onPointerEnter={() => {
              if (effectiveMode === 'hover') hover.enter(preferences.openDelay);
            }}
            onPointerLeave={() => {
              hover.cancelReveal();
              hover.leave(preferences.closeDelay);
            }}
            onFocus={() => {
              if (effectiveMode === 'hover') setOpen(true);
            }}
            onClick={() => {
              hover.cancel();
              if (effectiveMode === 'pinned') run({ type: 'panel.pin' });
              else {
                if (effectiveMode === 'hidden') {
                  hover.requestReveal();
                  run({ type: 'sidebar.mode', mode: 'hover' });
                }
                setForcedReveal(true);
                setOpen(true);
              }
            }}
          >
            <span />
          </button>
        )}
      {!nativePanel && !visible && state.error && (
        <div className="edge-error" role="alert">
          {state.error}
          <button
            className="icon-button"
            aria-label="Dismiss error"
            onClick={() => state.setError(undefined)}
          >
            <Icon name="close" size={14} />
          </button>
          <button
            className="text-button"
            onClick={() => run({ type: 'sidebar.mode', mode: 'hover' })}
          >
            Use hover sidebar
          </button>
        </div>
      )}
      {!nativePanel &&
        !embedded &&
        !visible &&
        preferences.mode === 'docked' &&
        state.dockStatus.reason && (
          <div className="edge-error" role="status">
            {state.dockStatus.reason}
            <button
              className="text-button"
              onClick={() => run({ type: 'sidebar.mode', mode: 'hover' })}
            >
              Use Hover overlay
            </button>
            <button
              className="text-button"
              onClick={() =>
                pageControls.dispatchEvent(new Event('retry-dock'))
              }
            >
              Retry docking
            </button>
          </div>
        )}
      <aside
        onDragEnd={(event) =>
          event.currentTarget
            .querySelectorAll('.drop-ready')
            .forEach((node) => node.classList.remove('drop-ready'))
        }
        onDragLeaveCapture={(event) => {
          const target = event.target as HTMLElement;
          if (!event.currentTarget.contains(event.relatedTarget as Node | null))
            event.currentTarget
              .querySelectorAll('.drop-ready')
              .forEach((node) => node.classList.remove('drop-ready'));
          else target.classList.remove('drop-ready');
        }}
        className={`sidebar ${visible ? 'is-visible' : ''}`}
        aria-label="Sidekick sidebar"
        inert={!visible}
        onPointerEnter={() => {
          hover.enter(0);
          if (!commandPaletteOpen) setForcedReveal(false);
        }}
        onPointerLeave={() => hover.leave(preferences.closeDelay)}
        onFocusCapture={() => {
          if (!commandPaletteOpen) setForcedReveal(false);
          hover.cancel();
          setFocused(true);
        }}
        onBlurCapture={(event) => {
          if (
            !event.currentTarget.contains(event.relatedTarget as Node | null)
          ) {
            setFocused(false);
            hover.leave(preferences.closeDelay);
          }
        }}
        onKeyDown={(event) => {
          if (
            event.key === 'Escape' &&
            !nativePanel &&
            !embedded &&
            !state.dockStatus.active
          ) {
            (event.target as HTMLElement).blur();
            collapse();
          }
        }}
      >
        <header className="sidebar-header flex items-center justify-between">
          <div className="brand flex items-center gap-2">
            <span className="brand-mark">
              s<span>✦</span>
            </span>
            <span>
              sidekick<span className="brand-period">.</span>
            </span>
          </div>
          <div className="header-actions">
            {!nativePanel && !embedded && (
              <button
                className="icon-button"
                aria-label="Open native fallback"
                title="Chrome panel · restricted-page fallback"
                onClick={() => run({ type: 'panel.pin' })}
              >
                <Icon name="globe" size={14} />
              </button>
            )}
            <button
              className="icon-button"
              aria-label={
                nativePanel
                  ? 'Unpin to hover sidebar'
                  : embedded
                    ? 'Hide sidebar'
                    : state.dockStatus.active
                      ? 'Undock sidebar'
                      : 'Dock sidebar'
              }
              title={
                nativePanel
                  ? 'Return to hover overlay'
                  : 'Dock the custom sidebar on the left'
              }
              disabled={!state.connected}
              onClick={() =>
                run(
                  nativePanel
                    ? { type: 'sidebar.mode', mode: 'hover' }
                    : embedded
                      ? { type: 'sidebar.mode', mode: 'hidden' }
                      : {
                          type: 'sidebar.mode',
                          mode: state.dockStatus.active ? 'hover' : 'docked',
                        },
                )
              }
            >
              <Icon name="pin" />
            </button>
            {!nativePanel && !embedded && (
              <button
                className="icon-button"
                aria-label="Collapse sidebar"
                onClick={() => {
                  if (state.dockStatus.active)
                    run({ type: 'sidebar.mode', mode: 'hidden' });
                  else collapse();
                }}
              >
                <Icon name="collapse" />
              </button>
            )}
            {state.metadata?.aiSettings?.status === 'connected' && (
              <button
                className="icon-button"
                aria-label="Organize tabs with Jev"
                title="Organize tabs with AI"
                onClick={() => {
                  setLibrary(false);
                  setShowAIPanel(true);
                  setBookmarks(false);
                  state.setSettings(false);
                }}
                disabled={!state.connected}
              >
                <Icon name="sparkles" size={14} />
              </button>
            )}
            {
              <button
                className="icon-button"
                aria-label="Open command palette (Alt+Shift+K)"
                title="Command Palette"
                onClick={openCommandPalette}
                disabled={!state.connected}
              >
                <Icon name="search" size={14} />
              </button>
            }
          </div>
        </header>
        {state.metadata && !state.metadata.onboardingDismissed && (
          <div className="onboarding-card">
            <strong>A workspace for every kind of day.</strong>
            <p>
              Create a workspace, add tabs, then press Alt+Shift+K to find
              anything. Jev is optional. Tabs share this Chrome profile.
            </p>
            <button
              className="text-button"
              onClick={() => run({ type: 'onboarding.dismiss' })}
            >
              Got it
            </button>
          </div>
        )}
        <WorkspaceSelector run={run} client={client} tabs={state.tabs} />
        <ImmersiveControls client={client} />
        <Navigation client={client} visible={visible} />
        {!embedded &&
          preferences.mode === 'docked' &&
          state.dockStatus.reason && (
            <div className="dock-notice" role="status">
              {state.dockStatus.reason}
              <button
                className="text-button"
                onClick={() => run({ type: 'sidebar.mode', mode: 'hover' })}
              >
                Use Hover overlay
              </button>
              <button
                className="text-button"
                onClick={() =>
                  pageControls.dispatchEvent(new Event('retry-dock'))
                }
              >
                Retry docking
              </button>
            </div>
          )}
        {state.error && (
          <div role="alert" className="error-message">
            {state.error}
            <button
              aria-label="Dismiss error"
              onClick={() => state.setError(undefined)}
            >
              ×
            </button>
          </div>
        )}
        {state.windowState.notice && (
          <div role="status" className="panel-notice">
            {state.windowState.notice}
          </div>
        )}
        {library ? (
          <LibraryView client={client} />
        ) : state.settings ? (
          <div className="scroll-area">
            <Settings
              client={client}
              preferences={preferences}
              update={(patch) => run({ type: 'preferences.update', patch })}
              aiSettings={
                state.metadata?.aiSettings ?? {
                  connected: false,
                  status: 'disconnected',
                }
              }
              updateAiSettings={async (patch) => {
                await client.command({ type: 'ai.settings.update', patch });
              }}
            />
          </div>
        ) : bookmarks ? (
          <div className="scroll-area">
            <Bookmarks client={client} />
          </div>
        ) : showAIPanel ? (
          <div className="scroll-area">
            <AISuggestionsPanel
              key={state.metadata?.activeWorkspaceId}
              client={client}
            />
          </div>
        ) : (
          <>
            <div className="search-box flex items-center gap-2">
              <Icon name="search" size={16} />
              <input
                ref={tabSearchRef}
                aria-label="Search tabs"
                placeholder="Search your tabs…"
                value={state.query}
                maxLength={2000}
                onChange={(e) => setSearch(e.target.value)}
              />
              {state.query && (
                <button
                  className="icon-button"
                  aria-label="Clear search"
                  onClick={() => setSearch('')}
                >
                  <Icon name="close" size={14} />
                </button>
              )}
            </div>
            <div className="scroll-area">
              {!state.query && (
                <>
                  <Favorites
                    key={'fav:' + state.metadata?.activeWorkspaceId}
                    client={client}
                  />
                  <Pinned
                    key={'pin:' + state.metadata?.activeWorkspaceId}
                    client={client}
                  />
                </>
              )}
              <section
                className="tabs-section today-drop"
                aria-label="Today tabs"
                onDragOver={handleTabDragOver}
                onDrop={handleTabDrop}
                onDragEnd={handleDragEnd}
                onDragLeaveCapture={handleDragLeaveCapture}
              >
                <div className="section-label">
                  {state.query
                    ? 'SEARCH RESULTS'
                    : focusMode
                      ? 'FOCUS MODE'
                      : 'TODAY'}
                  <span className="tab-count">
                    {state.query
                      ? `${tabs.length} / ${state.tabs.length}`
                      : focusMode
                        ? `${tabs.length} / ${state.tabs.length}`
                        : state.tabs.length}
                  </span>
                  {focusMode && (
                    <button
                      className="text-button small"
                      onClick={() =>
                        run({
                          type: 'focus.update',
                          goal: focusPreference?.goal ?? '',
                          mode: false,
                        })
                      }
                    >
                      Show All
                    </button>
                  )}
                </div>
                {!state.metadata && !state.error ? (
                  <div className="empty-state" role="status">
                    <span className="spinner" /> Getting your tabs ready…
                  </div>
                ) : tabs.length ? (
                  <ul className="tab-list">
                    {tabs.map((tab, index) => (
                      <li key={tab.id} className="tab-group-container">
                        {tab.groupId !== undefined &&
                          tab.groupId >= 0 &&
                          tabs[index - 1]?.groupId !== tab.groupId && (
                            <div className="live-group-label">
                              {state.windowState.groups?.find(
                                (g) => g.id === tab.groupId,
                              )?.title ?? 'Chrome tab group'}
                            </div>
                          )}
                        <ul>
                          <TabRow
                            key={tab.id}
                            tab={tab}
                            run={run}
                            onDragStart={handleTabDragStart}
                            onDragOver={handleTabDragOver}
                            onDragEnd={handleDragEnd}
                            onDragLeave={handleDragLeave}
                            onDrop={handleTabDrop}
                          />
                        </ul>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="empty-state">
                    <Icon name="search" size={24} />
                    <strong>
                      {state.query
                        ? 'No tabs found'
                        : 'A little room to breathe'}
                    </strong>
                    <span>
                      {state.query
                        ? 'Try another title or URL.'
                        : 'Open a new tab to get started.'}
                    </span>
                  </div>
                )}
              </section>
            </div>
            <button
              className="new-tab flex items-center gap-2"
              onClick={() => run({ type: 'tab.create' })}
              disabled={!state.connected}
            >
              <Icon name="plus" size={18} /> New tab
            </button>
          </>
        )}
        <footer className="sidebar-footer flex items-center justify-between">
          <button
            className="icon-button"
            aria-label={library ? 'Back from library' : 'Open library'}
            aria-pressed={library}
            onClick={() => {
              setLibrary(!library);
              state.setSettings(false);
              setBookmarks(false);
              setShowAIPanel(false);
            }}
          >
            <Icon name="copy" size={17} />
          </button>
          <button
            className="icon-button"
            aria-label={bookmarks ? 'Show tabs' : 'Open bookmarks'}
            aria-pressed={bookmarks}
            onClick={() => {
              state.setSettings(false);
              setShowAIPanel(false);
              setBookmarks(!bookmarks);
            }}
          >
            <Icon name="folder" size={17} />
          </button>
          <span className="connection-status">
            <i className={state.connected ? 'connected' : ''} />
            {state.connected ? 'Tabs / this workspace' : 'Reconnecting...'}
          </span>
          <button
            className={`icon-button ${state.settings ? 'selected' : ''}`}
            aria-label={state.settings ? 'Back to tabs' : 'Open settings'}
            aria-pressed={state.settings}
            onClick={() => {
              setLibrary(false);
              state.setSettings(!state.settings);
              setShowAIPanel(false);
              setBookmarks(false);
            }}
          >
            <Icon name={state.settings ? 'arrow' : 'settings'} size={17} />
          </button>
          {state.metadata?.aiSettings?.status === 'connected' && (
            <button
              className={`icon-button ${showAIPanel ? 'selected' : ''}`}
              aria-label={showAIPanel ? 'Back to tabs' : 'AI suggestions'}
              aria-pressed={showAIPanel}
              onClick={() => {
                setShowAIPanel(!showAIPanel);
                state.setSettings(false);
                setBookmarks(false);
              }}
            >
              <Icon name="sparkles" size={17} />
            </button>
          )}
        </footer>
      </aside>
      {commandPaletteOpen && (
        <CommandPalette
          isOpen={commandPaletteOpen}
          onClose={closeCommandPalette}
          onAction={handlePaletteAction}
          metadata={state.metadata}
          tabs={state.tabs}
          bookmarks={paletteBookmarks}
          isImmersive={state.windowState.immersive}
        />
      )}
    </div>
  );
}
