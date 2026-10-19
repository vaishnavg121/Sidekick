import { useState } from 'react';
import type { Command } from '../lib/protocol';
import type { Workspace, Theme } from '../lib/models';
export function WorkspaceEditor({
  workspace,
  run,
  done,
}: {
  workspace?: Workspace;
  run: (command: Command) => Promise<void>;
  done: () => void;
}) {
  const [pending, setPending] = useState(false);
  return (
    <form
      className="workspace-editor shortcut-form"
      aria-label={workspace ? 'Edit workspace' : 'Create workspace'}
      onSubmit={(event) => {
        event.preventDefault();
        const values = new FormData(event.currentTarget);
        setPending(true);
        void run({
          type: 'workspace.save',
          input: {
            ...(workspace ? { id: workspace.id } : {}),
            name: String(values.get('name')),
            color: String(values.get('color')),
            icon: String(values.get('icon')),
            theme: String(values.get('theme')) as Theme,
            preferredEmail: String(values.get('email')),
          },
        })
          .then(done)
          .catch(() => undefined)
          .finally(() => setPending(false));
      }}
    >
      <label>
        Workspace name
        <input
          name="name"
          required
          maxLength={60}
          defaultValue={workspace?.name ?? ''}
        />
      </label>
      <div className="workspace-decoration">
        <label>
          Icon
          <input
            name="icon"
            maxLength={12}
            defaultValue={workspace?.icon ?? '✦'}
          />
        </label>
        <label>
          Color
          <input
            name="color"
            type="color"
            defaultValue={workspace?.color ?? '#b7a3ff'}
          />
        </label>
      </div>
      <label>
        Workspace theme
        <select
          name="theme"
          aria-label="Workspace theme"
          defaultValue={workspace?.theme ?? 'dark'}
        >
          <option value="dark">Dark</option>
          <option value="light">Light</option>
          <option value="system">System</option>
        </select>
      </label>
      <label>
        Email label · optional
        <input
          name="email"
          type="email"
          maxLength={254}
          defaultValue={workspace?.preferredEmail ?? ''}
        />
      </label>
      <div>
        <button className="text-button" disabled={pending}>
          Save workspace
        </button>
        <button className="text-button" type="button" onClick={done}>
          Cancel
        </button>
      </div>
      <p className="field-note">
        This label does not switch accounts or isolate cookies.
      </p>
    </form>
  );
}
