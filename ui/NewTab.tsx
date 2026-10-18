import { useEffect, useState } from 'react';
import { SidebarClient } from '../lib/client';
import { useSidebar } from '../lib/store';
import { DEFAULT_PREFERENCES } from '../lib/models';
import type { Command } from '../lib/protocol';
import { WorkspaceSelector } from './WorkspaceSelector';
import { Favorites } from './Favorites';
import { Bookmarks } from './Bookmarks';
import { Settings } from './Settings';
import { Navigation, ImmersiveControls } from './Navigation';
import { Icon } from './Icon';

export function NewTab() {
  const state = useSidebar();
  const [bookmarks, setBookmarks] = useState(false);
  const [client] = useState(
    () =>
      new SidebarClient(
        useSidebar.getState().receive,
        useSidebar.getState().setConnected,
      ),
  );
  useEffect(() => {
    void client.start(true);
    return () => client.dispose();
  }, [client]);
  const run = (command: Command) => {
    state.setError(undefined);
    void client.command(command).catch((e: Error) => state.setError(e.message));
  };
  const workspace = state.metadata?.workspaces.find(
    (w) => w.id === state.metadata?.activeWorkspaceId,
  );
  return (
    <main className="sidekick-root dashboard">
      <header className="dashboard-top">
        <span className="brand">
          sidekick<span className="brand-period">.</span>
        </span>
        <div className="dashboard-tools">
          <button
            className="text-button"
            onClick={() => run({ type: 'panel.pin' })}
          >
            Open sidebar
          </button>
          <button
            className="text-button"
            aria-label="Open settings"
            onClick={() => state.setSettings(!state.settings)}
          >
            <Icon name="settings" size={16} /> Settings
          </button>
        </div>
      </header>
      <div className="dashboard-content">
        <WorkspaceSelector run={run} />
        <p className="eyebrow">A LITTLE SPACE TO THINK</p>
        <h1>Make room for what matters.</h1>
        <p className="dashboard-intro">
          Welcome to {workspace?.name ?? 'your workspace'}. Your everyday
          places, together.
        </p>
        <Navigation client={client} dashboard />
        <ImmersiveControls client={client} />
        <p className="field-note recovery-note">
          F11 restores Chrome’s toolbar, including after Sidekick is disabled.
          Workspace selection changes favorites; tab groups stay in place.
        </p>
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
        {state.settings ? (
          <Settings
            preferences={state.metadata?.preferences ?? DEFAULT_PREFERENCES}
            update={(patch) => run({ type: 'preferences.update', patch })}
          />
        ) : (
          <div className="dashboard-grid">
            <div className="dashboard-card">
              <Favorites client={client} />
              <button
                className="text-button"
                onClick={() => setBookmarks(!bookmarks)}
              >
                {bookmarks ? 'Hide bookmarks' : 'Browse Chrome bookmarks'}
              </button>
              {bookmarks && <Bookmarks client={client} />}
            </div>
            <section className="dashboard-card">
              <div className="section-label">
                THIS WINDOW{' '}
                <span className="tab-count">{state.tabs.length}</span>
              </div>
              <ul className="dashboard-tabs">
                {state.tabs.map((tab) => (
                  <li key={tab.id}>
                    <button
                      aria-current={tab.active ? 'page' : undefined}
                      title={tab.url}
                      onClick={() =>
                        run({ type: 'tab.activate', tabId: tab.id })
                      }
                    >
                      <Icon name="globe" size={15} />
                      <span className="truncate">{tab.title}</span>
                      {tab.active && <span className="active-dot" />}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        )}
        <footer className="dashboard-footer">
          {state.connected
            ? 'Saved in this browser · No account required'
            : 'Reconnecting to Sidekick…'}
        </footer>
      </div>
    </main>
  );
}
