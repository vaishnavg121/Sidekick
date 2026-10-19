import { useState } from 'react';
import type { SidebarClient } from '../lib/client';
import type {
  ResourceKind,
  WorkspaceFavorite,
  PinnedEntry,
} from '../lib/models';
import { useSidebar } from '../lib/store';
export function ResourceEditor({
  kind,
  entry,
  client,
  done,
}: {
  kind: ResourceKind;
  entry?: WorkspaceFavorite;
  client: SidebarClient;
  done: () => void;
}) {
  const state = useSidebar();
  const [workspaceId, setWorkspaceId] = useState(
    entry?.workspaceId ?? state.metadata?.activeWorkspaceId ?? '',
  );
  const [pending, setPending] = useState(false);
  return (
    <form
      className="shortcut-form resource-editor"
      aria-label={kind === 'favorite' ? 'Edit favorite' : 'Edit pinned entry'}
      onSubmit={(event) => {
        event.preventDefault();
        const values = new FormData(event.currentTarget);
        setPending(true);
        void client
          .command({
            type: 'resource.save',
            kind,
            input: {
              ...(entry ? { id: entry.id } : {}),
              workspaceId,
              title: String(values.get('title')),
              url: String(values.get('url')),
              ...(entry?.favicon ? { favicon: entry.favicon } : {}),
              folderId: values.get('folder')
                ? String(values.get('folder'))
                : null,
            },
          })
          .then(done)
          .catch((e: Error) => state.setError(e.message))
          .finally(() => setPending(false));
      }}
    >
      <label>
        {kind === 'favorite' ? 'Shortcut name' : 'Pinned name'}
        <input
          name="title"
          required
          maxLength={200}
          defaultValue={entry?.title ?? ''}
        />
      </label>
      <label>
        Web address
        <input
          name="url"
          type="url"
          required
          maxLength={4096}
          defaultValue={entry?.url ?? 'https://'}
        />
      </label>
      <label>
        Entry workspace
        <select
          aria-label="Entry workspace"
          value={workspaceId}
          onChange={(event) => setWorkspaceId(event.target.value)}
        >
          {state.metadata?.workspaces.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
      </label>
      {kind === 'pinned' && (
        <label>
          Pinned folder
          <select
            key={workspaceId}
            name="folder"
            defaultValue={
              workspaceId === entry?.workspaceId
                ? ((entry as PinnedEntry)?.folderId ?? '')
                : ''
            }
          >
            <option value="">Pinned · top level</option>
            {state.metadata?.folders
              .filter((f) => f.workspaceId === workspaceId)
              .map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
          </select>
        </label>
      )}
      <div>
        <button className="text-button" disabled={pending}>
          {kind === 'favorite' ? 'Save shortcut' : 'Save pinned entry'}
        </button>
        <button className="text-button" type="button" onClick={done}>
          Cancel
        </button>
      </div>
    </form>
  );
}
