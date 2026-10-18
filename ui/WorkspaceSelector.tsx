import { useSidebar } from '../lib/store';
import type { Command } from '../lib/protocol';
export function WorkspaceSelector({
  run,
}: {
  run: (command: Command) => void;
}) {
  const metadata = useSidebar((state) => state.metadata);
  const workspace = metadata?.workspaces.find(
    (w) => w.id === metadata.activeWorkspaceId,
  );
  return (
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
          value={metadata?.activeWorkspaceId ?? ''}
          disabled={!metadata}
          onChange={(e) =>
            run({ type: 'workspace.select', id: e.target.value })
          }
        >
          {metadata?.workspaces.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          )) ?? <option value="">Loading…</option>}
        </select>
      </div>
    </div>
  );
}
