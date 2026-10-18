import { useState } from 'react';
import type { SidebarClient } from '../lib/client';
import type { WorkspaceFavorite } from '../lib/models';
import { useSidebar } from '../lib/store';
import { Icon } from './Icon';

export function Favorites({ client }: { client: SidebarClient }) {
  const state = useSidebar();
  const [editing, setEditing] = useState<WorkspaceFavorite | 'new'>();
  const [pending, setPending] = useState(false);
  const metadata = state.metadata;
  const favorites =
    metadata?.favorites
      .filter((f) => f.workspaceId === metadata.activeWorkspaceId)
      .sort((a, b) => a.order - b.order) ?? [];
  const pinned =
    metadata?.pinnedEntries
      .filter((f) => f.workspaceId === metadata.activeWorkspaceId)
      .sort((a, b) => a.order - b.order) ?? [];
  const open = (url: string) => {
    void client
      .command({ type: 'navigation.go', input: url, newTab: true })
      .catch((e: Error) => state.setError(e.message));
  };
  return (
    <section className="favorites-view" aria-label="Workspace favorites">
      <div className="section-label">
        <Icon name="star" size={13} /> FAVORITES{' '}
        <button
          className="icon-button"
          aria-label="Add shortcut"
          disabled={!metadata}
          onClick={() => setEditing('new')}
        >
          <Icon name="plus" size={14} />
        </button>
      </div>
      {!favorites.length && (
        <p className="placeholder-note">
          Add an everyday site or choose a Chrome bookmark.
        </p>
      )}
      <ul className="shortcut-list">
        {favorites.map((f) => (
          <li key={f.id}>
            <button
              className="shortcut-open"
              title={f.url}
              onClick={() => open(f.url)}
            >
              <Icon name="globe" size={16} />
              <span className="truncate">{f.title}</span>
            </button>
            <button
              className="icon-button"
              aria-label={`Edit ${f.title}`}
              onClick={() => setEditing(f)}
            >
              Edit
            </button>
            <button
              className="icon-button"
              aria-label={`Remove favorite ${f.title}`}
              onClick={() => {
                void client
                  .command({ type: 'favorite.remove', id: f.id })
                  .catch((e: Error) => state.setError(e.message));
              }}
            >
              <Icon name="close" size={13} />
            </button>
          </li>
        ))}
      </ul>
      {editing && (
        <form
          key={typeof editing === 'string' ? editing : editing.id}
          className="shortcut-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (!metadata) return;
            const values = new FormData(event.currentTarget);
            setPending(true);
            void client
              .command({
                type: 'favorite.save',
                ...(editing === 'new' ? {} : { id: editing.id }),
                workspaceId: metadata.activeWorkspaceId,
                title: String(values.get('title')),
                url: String(values.get('url')),
              })
              .then(() => setEditing(undefined))
              .catch((e: Error) => state.setError(e.message))
              .finally(() => setPending(false));
          }}
        >
          <label>
            Shortcut name
            <input
              name="title"
              required
              maxLength={200}
              defaultValue={editing === 'new' ? '' : editing.title}
            />
          </label>
          <label>
            Web address
            <input
              name="url"
              type="url"
              required
              maxLength={4096}
              placeholder="https://example.com"
              defaultValue={editing === 'new' ? 'https://' : editing.url}
            />
          </label>
          <div>
            <button className="text-button" disabled={pending}>
              Save shortcut
            </button>
            <button
              className="text-button"
              type="button"
              onClick={() => setEditing(undefined)}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
      <div className="section-label pinned-label">
        <Icon name="pin" size={13} /> PINNED
      </div>
      {pinned.length ? (
        <ul className="shortcut-list">
          {pinned.map((f) => (
            <li key={f.id}>
              <button
                className="shortcut-open"
                title={f.url}
                onClick={() => open(f.url)}
              >
                <Icon name="pin" size={14} />
                <span className="truncate">{f.title}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="placeholder-note">
          Your workspace’s pinned items will appear here.
        </p>
      )}
    </section>
  );
}
