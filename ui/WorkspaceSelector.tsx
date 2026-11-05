import { useState, useRef } from 'react';
import { useSidebar } from '../lib/store';
import type { Command } from '../lib/protocol';
import type { SidebarClient } from '../lib/client';
import { WorkspaceEditor } from './WorkspaceEditor';
import { Icon } from './Icon';
import { readDrag, validateDragItem } from './drag';
export function WorkspaceSelector({
  run,
  client,
  tabs = [],
}: {
  run: (command: Command) => void;
  client?: SidebarClient;
  tabs?: Array<{ id: number; title: string; url: string }>;
}) {
  const [editing, setEditing] = useState<'new' | 'edit'>();
  const metadata = useSidebar((s) => s.metadata);
  const workspace = metadata?.workspaces.find(
    (w) => w.id === metadata.activeWorkspaceId,
  );
  const workspaceRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const dragOverWorkspaceId = useRef<string | null>(null);

  const handleDragOver = (event: React.DragEvent, workspaceId: string) => {
    event.preventDefault();
    event.currentTarget.classList.add('drop-target');
    dragOverWorkspaceId.current = workspaceId;
  };

  const handleDragLeave = (event: React.DragEvent, workspaceId: string) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      event.currentTarget.classList.remove('drop-target');
      if (dragOverWorkspaceId.current === workspaceId) {
        dragOverWorkspaceId.current = null;
      }
    }
  };

  const handleDrop = async (event: React.DragEvent, workspaceId: string) => {
    event.preventDefault();
    event.currentTarget.classList.remove('drop-target');
    const item = readDrag(event);
    if (!item) return;
    // Validate that the item belongs to its claimed source workspace
    if (
      !validateDragItem(
        item,
        ['tab', 'favorite', 'pinned', 'folder'],
        [item.workspaceId],
      )
    )
      return;

    if (item.kind === 'tab') {
      // Move tab to workspace
      const tab = tabs.find((t) => t.id === Number(item.id));
      if (tab) {
        run({
          type: 'tab.updateWorkspace',
          tabId: tab.id,
          workspaceId,
        });
      }
    } else if (item.kind === 'folder') {
      run({ type: 'folder.move', id: item.id, workspaceId, parentId: null });
    } else if (item.kind === 'favorite') {
      run({
        type: 'resource.move',
        kind: 'favorite',
        id: item.id,
        workspaceId,
        folderId: null,
      });
    } else if (item.kind === 'pinned') {
      run({
        type: 'resource.move',
        kind: 'pinned',
        id: item.id,
        workspaceId,
        folderId: null,
      });
    }
  };

  return (
    <div className="workspace-area">
      <div className="workspace-strip" role="group" aria-label="Workspaces">
        {metadata?.workspaces.map((ws) => (
          <div
            key={ws.id}
            ref={(el) => {
              if (el) workspaceRefs.current.set(ws.id, el);
              else workspaceRefs.current.delete(ws.id);
            }}
            className={`workspace-icon ${ws.id === metadata.activeWorkspaceId ? 'active' : ''}`}
            onDragOver={(e) => handleDragOver(e, ws.id)}
            onDragLeave={(e) => handleDragLeave(e, ws.id)}
            onDrop={(e) => handleDrop(e, ws.id)}
            role="button"
            tabIndex={0}
            onClick={() => run({ type: 'workspace.select', id: ws.id })}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                run({ type: 'workspace.select', id: ws.id });
              }
            }}
            aria-pressed={ws.id === metadata.activeWorkspaceId}
            aria-label={ws.name}
            title={ws.name}
            style={{ backgroundColor: ws.color }}
          >
            <span className="workspace-icon-inner">
              {ws.icon || ws.name.charAt(0)}
            </span>
            {ws.id === metadata.activeWorkspaceId && (
              <span className="active-indicator" />
            )}
          </div>
        ))}
      </div>
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
