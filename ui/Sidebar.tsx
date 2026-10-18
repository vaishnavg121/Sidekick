import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { SidebarClient } from '../lib/client';
import { useSidebar } from '../lib/store';
import { DEFAULT_PREFERENCES } from '../lib/models';
import { searchTabs, type TabItem } from '../lib/tabs';
import type { Command } from '../lib/protocol';
import { HoverController } from './hover';
import { Icon } from './Icon';
import { Settings } from './Settings';

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
    <li className={`tab-row ${tab.active ? 'active' : ''}`}>
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

export function Sidebar({ nativePanel }: { nativePanel: boolean }) {
  const state = useSidebar();
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const [pinPending, setPinPending] = useState(false);
  const hover = useMemo(() => new HoverController(setOpen), []);
  const [client] = useState(
    () =>
      new SidebarClient((event) => {
        if (event.type === 'snapshot') {
          const mode = event.metadata.preferences.mode;
          if (event.windowState.nativePanelOpen || mode === 'pinned') {
            hover.cancelReveal();
            hover.close();
            setFocused(false);
          } else if (mode === 'hidden' && !hover.revealRequested) {
            hover.close();
            setFocused(false);
          } else if (mode === 'hover' && hover.revealRequested) {
            // An older Hidden snapshot must not cancel a user's edge click
            // while its change-to-Hover command is still being processed.
            hover.cancelReveal();
            setOpen(true);
          }
          if (event.windowState.nativePanelOpen) setPinPending(false);
        }
        useSidebar.getState().receive(event);
      }, useSidebar.getState().setConnected),
  );
  useEffect(() => {
    void client.start(nativePanel);
    return () => {
      hover.cancel();
      client.dispose();
    };
  }, [client, hover, nativePanel]);
  const preferences = state.metadata?.preferences ?? DEFAULT_PREFERENCES;
  const visible =
    nativePanel ||
    (!pinPending &&
      !state.windowState.nativePanelOpen &&
      preferences.mode === 'hover' &&
      (open || focused));
  const tabs = searchTabs(state.tabs, state.query);
  const workspace = state.metadata?.workspaces.find(
    (w) => w.id === state.metadata?.activeWorkspaceId,
  );
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
      className={`sidekick-root ${nativePanel ? 'native' : 'overlay'}`}
      style={{ '--sidebar-width': `${preferences.width}px` } as CSSProperties}
    >
      {!nativePanel && !pinPending && !state.windowState.nativePanelOpen && (
        <button
          className="edge-strip"
          aria-label={
            preferences.mode === 'pinned'
              ? 'Open pinned Sidekick'
              : 'Open Sidekick'
          }
          aria-expanded={visible}
          onPointerEnter={() => {
            if (preferences.mode === 'hover')
              hover.enter(preferences.openDelay);
          }}
          onPointerLeave={() => {
            hover.cancelReveal();
            hover.leave(preferences.closeDelay);
          }}
          onFocus={() => {
            if (preferences.mode === 'hover') setOpen(true);
          }}
          onClick={() => {
            hover.cancel();
            if (preferences.mode === 'pinned') run({ type: 'panel.pin' });
            else {
              if (preferences.mode === 'hidden') {
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
        </div>
      )}
      <aside
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
          if (event.key === 'Escape' && !nativePanel) {
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
            <button
              className="icon-button"
              aria-label={
                nativePanel ? 'Unpin to hover sidebar' : 'Pin sidebar'
              }
              title={
                nativePanel
                  ? 'Return to hover overlay'
                  : 'Pin in Chrome side panel'
              }
              disabled={!state.connected}
              onClick={() =>
                run(
                  nativePanel
                    ? { type: 'sidebar.mode', mode: 'hover' }
                    : { type: 'panel.pin' },
                )
              }
            >
              <Icon name="pin" />
            </button>
            {!nativePanel && (
              <button
                className="icon-button"
                aria-label="Collapse sidebar"
                onClick={collapse}
              >
                <Icon name="collapse" />
              </button>
            )}
          </div>
        </header>
        <div className="workspace-card">
          <span
            className="workspace-avatar"
            style={{ backgroundColor: workspace?.color ?? '#b7a3ff' }}
          >
            {workspace?.name.charAt(0) ?? 'P'}
          </span>
          <div className="workspace-info">
            <label htmlFor="workspace-select">YOUR WORKSPACE</label>
            <select
              id="workspace-select"
              aria-label="Workspace"
              value={state.metadata?.activeWorkspaceId ?? ''}
              disabled={!state.metadata}
              onChange={(e) =>
                run({ type: 'workspace.select', id: e.target.value })
              }
            >
              {state.metadata?.workspaces.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              )) ?? <option value="">Loading…</option>}
            </select>
          </div>
        </div>
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
            />
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
                <div className="placeholders">
                  <section>
                    <div className="section-label">
                      <Icon name="star" size={13} /> FAVORITES{' '}
                      <span className="soon">SOON</span>
                    </div>
                    <div className="favorite-slot">
                      <Icon name="plus" size={18} />
                      <span>A home for your everyday sites</span>
                    </div>
                  </section>
                  <section>
                    <div className="section-label">
                      <Icon name="pin" size={13} /> PINNED{' '}
                      <span className="soon">SOON</span>
                    </div>
                    <p className="placeholder-note">
                      Keep the important things close.
                    </p>
                  </section>
                </div>
              )}
              <section className="tabs-section">
                <div className="section-label">
                  {state.query ? 'SEARCH RESULTS' : 'OPEN TABS'}
                  <span className="tab-count">
                    {state.query
                      ? `${tabs.length} / ${state.tabs.length}`
                      : state.tabs.length}
                  </span>
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
          <span className="connection-status">
            <i className={state.connected ? 'connected' : ''} />
            {state.connected ? 'All tabs · this window' : 'Reconnecting…'}
          </span>
          <button
            className={`icon-button ${state.settings ? 'selected' : ''}`}
            aria-label={state.settings ? 'Back to tabs' : 'Open settings'}
            aria-pressed={state.settings}
            onClick={() => state.setSettings(!state.settings)}
          >
            <Icon name={state.settings ? 'arrow' : 'settings'} size={17} />
          </button>
        </footer>
      </aside>
    </div>
  );
}
