import { useState } from 'react';
import { useSidebar } from '../lib/store';
import type { Command } from '../lib/protocol';
import type { SidebarClient } from '../lib/client';
import { WorkspaceEditor } from './WorkspaceEditor';
import { Icon } from './Icon';
export function WorkspaceSelector({
  run,
  client,
}: {
  run: (command: Command) => void;
  client?: SidebarClient;
}) {
  const [editing, setEditing] = useState<'new' | 'edit'>();
  const metadata = useSidebar((s) => s.metadata);
  const workspace = metadata?.workspaces.find(
    (w) => w.id === metadata.activeWorkspaceId,
  );
  return (
    <div className="workspace-area">
      <div className="workspace-card">
        <span
          className="workspace-avatar"
          style={{ backgroundColor: workspace?.color ?? '#b7a3ff' }}
        >
          {workspace?.icon || workspace?.name.charAt(0) || 'P'}
        </span>
        <div className="workspace-info">
          <label htmlFor="workspace-select">YOUR WORKSPACE</label>
          <select
            id="workspace-select"
            aria-label="Workspace"
            value={metadata?.activeWorkspaceId ?? ''}
            disabled={!metadata}
            onChange={(e) => {
              setEditing(undefined);
              run({ type: 'workspace.select', id: e.target.value });
            }}
          >
            {metadata?.workspaces.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            )) ?? <option value="">Loading…</option>}
          </select>
        </div>
        {client && (
          <>
            <button
              className="icon-button"
              aria-label="Edit workspace"
              onClick={() =>
                setEditing(editing === 'edit' ? undefined : 'edit')
              }
            >
              <Icon name="settings" size={14} />
            </button>
            <button
              className="icon-button"
              aria-label="Create workspace"
              onClick={() => setEditing(editing === 'new' ? undefined : 'new')}
            >
              <Icon name="plus" size={14} />
            </button>
          </>
        )}
      </div>
      {workspace?.preferredEmail && (
        <p className="workspace-email" title={workspace.preferredEmail}>
          {workspace.preferredEmail}
        </p>
      )}
      {editing && client && (
        <WorkspaceEditor
          key={editing === 'edit' ? workspace?.id : 'new'}
          workspace={editing === 'edit' ? workspace : undefined}
          run={async (command) => {
            try {
              await client.command(command);
            } catch (e) {
              useSidebar
                .getState()
                .setError(
                  e instanceof Error
                    ? e.message
                    : 'Workspace could not be saved.',
                );
              throw e;
            }
          }}
          done={() => setEditing(undefined)}
        />
      )}
    </div>
  );
}
