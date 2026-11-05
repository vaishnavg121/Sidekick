import { useEffect, useState } from 'react';
import type { SidebarClient } from '../lib/client';
import { useSidebar } from '../lib/store';
export function DataSettings({ client }: { client: SidebarClient }) {
  const [shortcuts, setShortcuts] = useState<chrome.commands.Command[]>([]),
    [preview, setPreview] = useState<{
      token: string;
      workspaces: number;
      pages: number;
    }>(),
    [message, setMessage] = useState('');
  const error = useSidebar((s) => s.setError);
  useEffect(() => {
    void client
      .request({ type: 'shortcuts.read' })
      .then((r) =>
        setShortcuts((r.shortcuts ?? []).filter((s) => s.description)),
      )
      .catch((e) => error(e.message));
  }, [client, error]);
  return (
    <>
      <h2>Keyboard shortcuts</h2>
      <p className="field-note">
        Change assignments at chrome://extensions/shortcuts. Additional actions
        start unassigned.
      </p>
      <dl className="shortcut-list">
        {shortcuts.map((s) => (
          <div key={s.name}>
            <dt>{s.description}</dt>
            <dd>
              <kbd>{s.shortcut || 'Unassigned'}</kbd>
            </dd>
          </div>
        ))}
      </dl>
      <h2>Backup & recovery</h2>
      <p className="field-note">
        Backups contain workspace names, saved URLs and titles. API keys,
        browser-session handles and AI state are excluded. Sensitive query
        fields are removed. Store the file privately.
      </p>
      <button
        className="text-button"
        onClick={() => {
          void client
            .request({ type: 'backup.export' })
            .then((r) => {
              const url = URL.createObjectURL(
                new Blob([r.backup!], { type: 'application/json' }),
              );
              const a = document.createElement('a');
              a.href = url;
              a.download = 'sidekick-backup.json';
              a.click();
              setTimeout(() => URL.revokeObjectURL(url), 1000);
            })
            .catch((e) => error(e.message));
        }}
      >
        Export metadata backup
      </button>
      <label>
        Preview backup import
        <input
          type="file"
          accept="application/json,.json"
          aria-label="Import Sidekick backup"
          onChange={(e) => {
            setPreview(undefined);
            setMessage('');
            const file = e.target.files?.[0];
            if (!file) return;
            if (file.size > 5_000_000) {
              error('Backup exceeds 5 MB.');
              return;
            }
            void file
              .text()
              .then((text) => client.request({ type: 'backup.preview', text }))
              .then((r) => setPreview(r.preview))
              .catch((e) => error(e.message));
            e.target.value = '';
          }}
        />
      </label>
      {preview && (
        <div className="info-card" role="status">
          <p>
            Import {preview.workspaces} workspace copies and {preview.pages}{' '}
            saved pages. Existing data and preferences stay intact. Imported
            workspaces are labelled “imported”.
          </p>
          <button
            className="text-button"
            onClick={() =>
              void client
                .command({ type: 'backup.import', token: preview.token })
                .then(() => {
                  setPreview(undefined);
                  setMessage(
                    'Backup imported as independent workspace copies.',
                  );
                })
                .catch((e) => error(e.message))
            }
          >
            Confirm import copies
          </button>
          <button className="text-button" onClick={() => setPreview(undefined)}>
            Cancel import
          </button>
        </div>
      )}
      {message && <p role="status">{message}</p>}
      {location.protocol === 'chrome-extension:' && (
        <button
          className="text-button"
          onClick={() =>
            void chrome.permissions
              .request({ permissions: ['notifications'] })
              .then((granted) =>
                setMessage(
                  granted
                    ? 'Reminder notifications enabled.'
                    : 'Notifications were not enabled. Toolbar reminders remain available.',
                ),
              )
              .catch(() => error('Chrome could not enable notifications.'))
          }
        >
          Enable reminder notifications
        </button>
      )}
      <h2>Privacy</h2>
      <p className="field-note">
        Workspaces organize tabs in this Chrome profile. They do not isolate
        accounts or cookies. Optional Jev sends selected titles, domains,
        workspace names and focus goals to Vercel. It never sends page contents
        or full URLs. Remote favicon requests can contact the page’s origin. No
        telemetry is included.
      </p>
      <button
        className="text-button"
        onClick={() =>
          void client
            .command({ type: 'dashboard.open' })
            .catch((e) => error(e.message))
        }
      >
        Open Sidekick dashboard
      </button>
      <p className="field-note">
        Chrome’s original New Tab stays unchanged. Use the toolbar fallback on
        restricted pages.
      </p>
    </>
  );
}
