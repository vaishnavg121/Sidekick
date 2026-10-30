import { useEffect, useMemo, useState, type CSSProperties } from 'react';
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
import { allowDrag, readDrag, startDrag } from './drag';
import { AISuggestionsPanel } from './AISuggestionsPanel';

function TabRow({
  tab,
  run,
}: {
  tab: TabItem;
  run: (command: Command) => void;
}) {
  const safeIcon =
    tab.favicon && /^(https?:|data:image\/)/.test(tab.favicon)
      ? tab.favicon
      : undefined;
  return (
    <li
      className={`tab-row ${tab.active ? 'active' : ''}`}
      draggable
      onDragStart={(event) =>
        startDrag(event, {
          kind: 'tab',
          id: String(tab.id),
          workspaceId: useSidebar.getState().metadata?.activeWorkspaceId ?? '',
        })
      }
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
        {tab.active && <span className="active-dot" aria-hidden="true" />}
      </button>
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
  const state = useSidebar();
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const [pinPending, setPinPending] = useState(false);
  const [bookmarks, setBookmarks] = useState(false);
  const [showAIPanel, setShowAIPanel] = useState(false);
  const [forcedReveal, setForcedReveal] = useState(false);
  const hover = useMemo(() => new HoverController(setOpen), []);
  const [client] = useState(
    () =>
      new SidebarClient((event) => {
        if (event.type === 'snapshot') {
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
    pageControls.addEventListener('address', reveal);
    pageControls.addEventListener('reveal', reveal);
    return () => {
      pageControls.removeEventListener('address', reveal);
      pageControls.removeEventListener('reveal', reveal);
    };
  }, [hover, embedded, client]);
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
      (open || focused));
  const pinnedUrls = new Set(
    state.metadata?.pinnedEntries
      .filter((e) => e.workspaceId === state.metadata?.activeWorkspaceId)
      .map((e) => e.url),
  );
  const { focusMode, focusRelevance } = state.ai;
  const relevantTabIds = focusMode
    ? new Set(focusRelevance.filter((r) => r.score >= 0.5).map((r) => r.tabId))
    : null;
  let tabs = searchTabs(state.tabs, state.query).filter(
    (tab) => !pinnedUrls.has(tab.url),
  );
  if (focusMode && relevantTabIds) {
    tabs = tabs.filter((tab) => relevantTabIds.has(tab.id));
  }
  const run = (command: Command) => {
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
        onPointerEnter={() => hover.enter(0)}
        onPointerLeave={() => hover.leave(preferences.closeDelay)}
        onFocusCapture={() => {
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
                onClick={() =>
                  run({
                    type: 'ai.classify',
                    tabIds: state.tabs.map((t) => t.id),
                  })
                }
                disabled={!state.connected}
              >
                <Icon name="sparkles" size={14} />
              </button>
            )}
          </div>
        </header>
        <WorkspaceSelector run={run} client={client} />
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
        {state.settings ? (
          <div className="scroll-area">
            <Settings
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
            <AISuggestionsPanel client={client} />
          </div>
        ) : (
          <>
            <div className="search-box flex items-center gap-2">
              <Icon name="search" size={16} />
              <input
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
                onDragOver={allowDrag}
                onDrop={(event) => {
                  const item = readDrag(event);
                  if (item?.kind === 'pinned') {
                    event.preventDefault();
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
                }}
              >
                <div className="section-label">
                  {state.query
                    ? 'SEARCH RESULTS'
                    : state.ai.focusMode
                      ? 'FOCUS MODE'
                      : 'TODAY'}
                  <span className="tab-count">
                    {state.query
                      ? `${tabs.length} / ${state.tabs.length}`
                      : state.ai.focusMode
                        ? `${tabs.length} / ${state.tabs.length}`
                        : state.tabs.length}
                  </span>
                  {state.ai.focusMode && (
                    <button
                      className="text-button small"
                      onClick={() => state.ai.setFocusMode(false)}
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
                    {tabs.map((tab) => (
                      <TabRow key={tab.id} tab={tab} run={run} />
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
            {state.connected ? 'All tabs · this window' : 'Reconnecting…'}
          </span>
          <button
            className={`icon-button ${state.settings ? 'selected' : ''}`}
            aria-label={state.settings ? 'Back to tabs' : 'Open settings'}
            aria-pressed={state.settings}
            onClick={() => {
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
    </div>
  );
}
