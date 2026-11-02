import { useState, useMemo } from 'react';
import type { SidebarClient } from '../lib/client';
import type { PinnedEntry, Folder } from '../lib/models';
import type { Command } from '../lib/protocol';
import { useSidebar } from '../lib/store';
import { moveBefore } from '../lib/ordering';
import { ResourceEditor } from './ResourceEditor';
import { SiteIcon } from './SiteIcon';
import {
  allowDrag,
  readDrag,
  startDrag,
  setDragImage,
  validateDragItem,
} from './drag';
import { Icon } from './Icon';

export function Pinned({ client }: { client: SidebarClient }) {
  const state = useSidebar();
  const [editing, setEditing] = useState<PinnedEntry | 'new'>();
  const [menu, setMenu] = useState<string>();
  const [folderEditor, setFolderEditor] = useState<Folder | 'new'>();
  const metadata = state.metadata;
  const workspaceId = metadata?.activeWorkspaceId ?? '';
  const run = (command: Command) => {
    void client.command(command).catch((e: Error) => state.setError(e.message));
    setMenu(undefined);
  };
  const entries = useMemo(
    () =>
      metadata?.pinnedEntries
        .filter((e) => e.workspaceId === workspaceId)
        .sort((a, b) => a.order - b.order) ?? [],
    [metadata, workspaceId],
  );
  const folders = useMemo(
    () =>
      metadata?.folders
        .filter((f) => f.workspaceId === workspaceId)
        .sort((a, b) => a.order - b.order) ?? [],
    [metadata, workspaceId],
  );
  const drop = (
    event: React.DragEvent,
    folderId: string | null,
    target?: PinnedEntry,
  ) => {
    const item = readDrag(event);
    if (!item) return;
    if (!validateDragItem(item, ['tab', 'pinned'], [workspaceId])) return;
    event.preventDefault();
    event.stopPropagation();
    if (item.kind === 'tab')
      run({
        type: 'resource.current',
        kind: 'pinned',
        tabId: Number(item.id),
        folderId,
      });
    else if (item.kind === 'pinned') {
      const old = entries.find((e) => e.id === item.id);
      if (target && old?.folderId === folderId)
        run({
          type: 'resource.reorder',
          kind: 'pinned',
          workspaceId,
          folderId,
          ids: moveBefore(
            entries.filter((e) => e.folderId === folderId).map((e) => e.id),
            item.id,
            target.id,
          ),
        });
      else
        run({
          type: 'resource.move',
          kind: 'pinned',
          id: item.id,
          workspaceId,
          folderId,
        });
    }
  };
  const handleDragStart = (event: React.DragEvent, entry: PinnedEntry) => {
    startDrag(event, { kind: 'pinned', id: entry.id, workspaceId });
    setDragImage(event, entry.title);
  };
  const handleDragOver = (event: React.DragEvent) => {
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
  const renderEntry = (entry: PinnedEntry) => {
    const siblingEntries = entries.filter((e) => e.folderId === entry.folderId);
    const siblingIndex = siblingEntries.findIndex((e) => e.id === entry.id);
    return (
      <li
        key={entry.id}
        className="pinned-row"
        draggable
        data-resource-id={entry.id}
        onDragStart={(event) => handleDragStart(event, entry)}
        onDragOver={handleDragOver}
        onDrop={(event) => drop(event, entry.folderId, entry)}
        onDragEnd={handleDragEnd}
        onDragLeave={handleDragLeave}
      >
        <button
          className={
            'pinned-open ' +
            (state.tabs.some((t) => t.active && t.url === entry.url)
              ? 'is-active'
              : '')
          }
          title={entry.url}
          aria-label={'Open pinned ' + entry.title}
          onClick={() =>
            run({ type: 'resource.open', kind: 'pinned', id: entry.id })
          }
          onContextMenu={(event) => {
            event.preventDefault();
            setMenu(entry.id);
          }}
        >
          <SiteIcon entry={entry} />
          <span className="truncate">{entry.title}</span>
        </button>
        <button
          className="icon-button"
          aria-label={'Actions for pinned ' + entry.title}
          onClick={() => setMenu(menu === entry.id ? undefined : entry.id)}
        >
          ···
        </button>
        {menu === entry.id && (
          <div
            className="resource-menu"
            role="menu"
            aria-label={entry.title + ' pinned actions'}
            onKeyDown={(event) => {
              if (event.key === 'Escape') setMenu(undefined);
            }}
          >
            <button
              role="menuitem"
              onClick={() => {
                setEditing(entry);
                setMenu(undefined);
              }}
            >
              Rename / edit pinned entry
            </button>
            <button
              role="menuitem"
              disabled={siblingIndex === 0}
              onClick={() =>
                run({
                  type: 'resource.reorder',
                  kind: 'pinned',
                  workspaceId,
                  folderId: entry.folderId,
                  ids: moveBefore(
                    siblingEntries.map((e) => e.id),
                    entry.id,
                    siblingEntries[siblingIndex - 1]!.id,
                  ),
                })
              }
            >
              Move earlier
            </button>
            <label>
              Move to folder
              <select
                aria-label={'Move pinned ' + entry.title + ' to folder'}
                value={entry.folderId ?? ''}
                onChange={(event) =>
                  run({
                    type: 'resource.move',
                    kind: 'pinned',
                    id: entry.id,
                    workspaceId,
                    folderId: event.target.value || null,
                  })
                }
              >
                <option value="">Top level</option>
                {folders.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Move to workspace
              <select
                aria-label={'Move pinned ' + entry.title + ' to workspace'}
                value={workspaceId}
                onChange={(event) =>
                  run({
                    type: 'resource.move',
                    kind: 'pinned',
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
              aria-label={'Unpin ' + entry.title}
              onClick={() =>
                run({ type: 'resource.remove', kind: 'pinned', id: entry.id })
              }
            >
              Unpin
            </button>
            <button role="menuitem" onClick={() => setMenu(undefined)}>
              Close menu
            </button>
          </div>
        )}
      </li>
    );
  };
  const renderFolder = (folder: Folder): React.ReactNode => (
    <li
      key={folder.id}
      className="pinned-folder"
      data-folder-id={folder.id}
      onDragOver={handleDragOver}
      onDrop={(event) => drop(event, folder.id)}
      onDragLeave={handleDragLeave}
      onDragEnd={handleDragEnd}
    >
      <div className="pinned-folder-heading">
        <button
          className="folder-toggle"
          aria-expanded={!folder.collapsed}
          onClick={() =>
            run({
              type: 'folder.save',
              input: { ...folder, collapsed: !folder.collapsed },
            })
          }
        >
          <Icon name="folder" size={14} />
          <span className="truncate">{folder.name}</span>
          <span>{folder.collapsed ? '›' : '⌄'}</span>
        </button>
        <button
          className="icon-button"
          aria-label={'Edit folder ' + folder.name}
          onClick={() => setFolderEditor(folder)}
        >
          ···
        </button>
      </div>
      {!folder.collapsed && (
        <ul>
          {folders.filter((f) => f.parentId === folder.id).map(renderFolder)}
          {entries.filter((e) => e.folderId === folder.id).map(renderEntry)}
        </ul>
      )}
    </li>
  );
  return (
    <section
      className="pinned-section resources-compact"
      aria-label="Workspace pinned tabs"
      onDragOver={handleDragOver}
      onDrop={(event) => drop(event, null)}
      onDragLeave={handleDragLeave}
      onDragEnd={handleDragEnd}
    >
      <div className="section-label">
        PINNED
        <div className="section-actions">
          <button
            className="icon-button"
            aria-label="Pin current tab"
            title="Pin current tab"
            onClick={() => run({ type: 'resource.current', kind: 'pinned' })}
          >
            <Icon name="pin" size={13} />
          </button>
          <button
            className="icon-button"
            aria-label="Create pinned folder"
            title="New folder"
            onClick={() => setFolderEditor('new')}
          >
            <Icon name="folder" size={13} />
          </button>
          <button
            className="icon-button"
            aria-label="Add pinned URL"
            title="Add URL"
            onClick={() => setEditing('new')}
          >
            <Icon name="plus" size={14} />
          </button>
        </div>
      </div>
      <ul className="pinned-tree">
        {folders.filter((f) => f.parentId === null).map(renderFolder)}
        {entries.filter((e) => e.folderId === null).map(renderEntry)}
      </ul>
      {folderEditor && (
        <form
          key={folderEditor === 'new' ? 'new' : folderEditor.id}
          className="shortcut-form"
          aria-label="Pinned folder editor"
          onSubmit={(event) => {
            event.preventDefault();
            const values = new FormData(event.currentTarget);
            void client
              .command({
                type: 'folder.save',
                input: {
                  ...(folderEditor === 'new' ? {} : { id: folderEditor.id }),
                  workspaceId,
                  parentId: values.get('parent')
                    ? String(values.get('parent'))
                    : null,
                  name: String(values.get('name')),
                },
              })
              .then(() => setFolderEditor(undefined))
              .catch((e: Error) => state.setError(e.message));
          }}
        >
          <label>
            Folder name
            <input
              name="name"
              required
              maxLength={80}
              defaultValue={folderEditor === 'new' ? '' : folderEditor.name}
            />
          </label>
          <label>
            Parent folder
            <select
              name="parent"
              defaultValue={
                folderEditor === 'new' ? '' : (folderEditor.parentId ?? '')
              }
            >
              <option value="">Top level</option>
              {folders
                .filter(
                  (f) => folderEditor === 'new' || f.id !== folderEditor.id,
                )
                .map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
            </select>
          </label>
          <button className="text-button">Save folder</button>
          <button
            className="text-button"
            type="button"
            onClick={() => setFolderEditor(undefined)}
          >
            Cancel
          </button>
          {folderEditor !== 'new' && (
            <button
              type="button"
              className="text-button"
              onClick={() => {
                void client
                  .command({ type: 'folder.remove', id: folderEditor.id })
                  .then(() => setFolderEditor(undefined))
                  .catch((e: Error) => state.setError(e.message));
              }}
            >
              Remove empty folder
            </button>
          )}
        </form>
      )}
      {editing && (
        <ResourceEditor
          key={workspaceId + ':' + (editing === 'new' ? 'new' : editing.id)}
          kind="pinned"
          entry={editing === 'new' ? undefined : editing}
          client={client}
          done={() => setEditing(undefined)}
        />
      )}
    </section>
  );
}
