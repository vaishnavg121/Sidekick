import { useState } from 'react';
import type { SidebarClient } from '../lib/client';
import type { WorkspaceFavorite } from '../lib/models';
import { useSidebar } from '../lib/store';
import { moveBefore } from '../lib/ordering';
import { ResourceEditor } from './ResourceEditor';
import { SiteIcon } from './SiteIcon';
import { allowDrag, readDrag, startDrag } from './drag';
import { Icon } from './Icon';
export function Favorites({ client }: { client: SidebarClient }) {
  const state = useSidebar();
  const [editing, setEditing] = useState<WorkspaceFavorite | 'new'>();
  const [menu, setMenu] = useState<string>();
  const metadata = state.metadata;
  const workspaceId = metadata?.activeWorkspaceId ?? '';
  const favorites =
    metadata?.favorites
      .filter((f) => f.workspaceId === workspaceId)
      .sort((a, b) => a.order - b.order) ?? [];
  const run = (command: Parameters<SidebarClient['command']>[0]) => {
    void client.command(command).catch((e: Error) => state.setError(e.message));
    setMenu(undefined);
  };
  return (
    <section
      className="favorites-view resources-compact"
      aria-label="Workspace favorites"
    >
      <div className="section-label">
        FAVORITES
        <div className="section-actions">
          <button
            className="icon-button"
            aria-label="Add current tab to Favorites"
            title="Add current tab"
            onClick={() => run({ type: 'resource.current', kind: 'favorite' })}
          >
            <Icon name="star" size={13} />
          </button>
          <button
            className="icon-button"
            aria-label="Add shortcut"
            title="Add favorite URL"
            onClick={() => setEditing('new')}
          >
            <Icon name="plus" size={14} />
          </button>
        </div>
      </div>
      <ul className="favorites-grid">
        {favorites.map((entry, index) => (
          <li
            key={entry.id}
            draggable
            data-resource-id={entry.id}
            onDragStart={(event) =>
              startDrag(event, { kind: 'favorite', id: entry.id, workspaceId })
            }
            onDragOver={allowDrag}
            onDrop={(event) => {
              const item = readDrag(event);
              if (
                item?.kind === 'favorite' &&
                item.workspaceId === workspaceId
              ) {
                event.preventDefault();
                run({
                  type: 'resource.reorder',
                  kind: 'favorite',
                  workspaceId,
                  folderId: null,
                  ids: moveBefore(
                    favorites.map((f) => f.id),
                    item.id,
                    entry.id,
                  ),
                });
              }
            }}
          >
            <button
              className={
                'favorite-tile ' +
                (state.tabs.some((t) => t.active && t.url === entry.url)
                  ? 'is-active'
                  : '')
              }
              aria-label={entry.title}
              title={entry.title + '\n' + entry.url}
              onClick={() =>
                run({ type: 'resource.open', kind: 'favorite', id: entry.id })
              }
              onContextMenu={(event) => {
                event.preventDefault();
                setMenu(entry.id);
              }}
            >
              <SiteIcon entry={entry} />
            </button>
            <button
              className="favorite-menu-toggle"
              aria-label={'Actions for ' + entry.title}
              onClick={() => setMenu(menu === entry.id ? undefined : entry.id)}
            >
              ···
            </button>
            {menu === entry.id && (
              <div
                className="resource-menu"
                role="menu"
                aria-label={entry.title + ' actions'}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') setMenu(undefined);
                }}
              >
                <button
                  role="menuitem"
                  onClick={() =>
                    run({
                      type: 'resource.open',
                      kind: 'favorite',
                      id: entry.id,
                    })
                  }
                >
                  Open or activate
                </button>
                <button
                  role="menuitem"
                  aria-label={'Edit ' + entry.title}
                  onClick={() => {
                    setEditing(entry);
                    setMenu(undefined);
                  }}
                >
                  Rename / edit
                </button>
                <button
                  role="menuitem"
                  disabled={index === 0}
                  onClick={() =>
                    run({
                      type: 'resource.reorder',
                      kind: 'favorite',
                      workspaceId,
                      folderId: null,
                      ids: moveBefore(
                        favorites.map((f) => f.id),
                        entry.id,
                        favorites[index - 1]!.id,
                      ),
                    })
                  }
                >
                  Move earlier
                </button>
                <label>
                  Move to workspace
                  <select
                    aria-label={
                      'Move favorite ' + entry.title + ' to workspace'
                    }
                    value={workspaceId}
                    onChange={(event) =>
                      run({
                        type: 'resource.move',
                        kind: 'favorite',
                        id: entry.id,
                        workspaceId: event.target.value,
                        folderId: null,
                      })
                    }
                  >
                    {metadata?.workspaces.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  role="menuitem"
                  aria-label={'Remove favorite ' + entry.title}
                  onClick={() =>
                    run({
                      type: 'resource.remove',
                      kind: 'favorite',
                      id: entry.id,
                    })
                  }
                >
                  Remove favorite
                </button>
                <button role="menuitem" onClick={() => setMenu(undefined)}>
                  Close menu
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {editing && (
        <ResourceEditor
          key={workspaceId + ':' + (editing === 'new' ? 'new' : editing.id)}
          kind="favorite"
          entry={editing === 'new' ? undefined : editing}
          client={client}
          done={() => setEditing(undefined)}
        />
      )}
    </section>
  );
}
