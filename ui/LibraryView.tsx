import { useState } from 'react';
import type { SidebarClient } from '../lib/client';
import type { Command } from '../lib/protocol';
import { useSidebar } from '../lib/store';
import { emptyLibrary } from '../lib/library';

export function LibraryView({ client }: { client: SidebarClient }) {
  const metadata = useSidebar((s) => s.metadata),
    setError = useSidebar((s) => s.setError);
  const [view, setView] = useState<'sessions' | 'snoozed' | 'archive'>(
    'sessions',
  );
  const [query, setQuery] = useState(''),
    [message, setMessage] = useState('');
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const library = metadata?.library ?? emptyLibrary(),
    workspaceId = metadata?.activeWorkspaceId;
  const run = async (c: Command) => {
    setMessage('');
    try {
      await client.command(c);
      setMessage('Saved.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action failed.');
    }
  };
  return (
    <div className="settings-view library-view">
      <div className="eyebrow">PICK UP WHERE YOU LEFT OFF</div>
      <h2>Library</h2>
      <div className="segmented" role="group" aria-label="Library view">
        {(['sessions', 'snoozed', 'archive'] as const).map((v) => (
          <button
            key={v}
            className="text-button"
            aria-pressed={view === v}
            onClick={() => {
              setView(v);
              setMessage('');
            }}
          >
            {v === 'sessions'
              ? 'Sessions'
              : v === 'snoozed'
                ? 'Snoozed'
                : 'Archive'}
          </button>
        ))}
      </div>
      <label>
        Search library
        <input
          aria-label="Search library"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      {message && <p role="status">{message}</p>}
      {view === 'sessions' && (
        <>
          <form
            className="shortcut-form"
            aria-label="Save workspace session"
            onSubmit={(e) => {
              e.preventDefault();
              const name = String(new FormData(e.currentTarget).get('name'));
              void run({ type: 'session.save', name });
              e.currentTarget.reset();
            }}
          >
            <label>
              Session name
              <input name="name" required maxLength={80} />
            </label>
            <button className="text-button">Save workspace session</button>
          </form>
          <p className="field-note">
            URL snapshots preserve this workspace’s pages. Restore reuses
            matching open tabs. Page forms, history, cookies and passwords are
            not saved.
          </p>
          {library.sessions
            .filter(
              (s) =>
                s.workspaceId === workspaceId &&
                s.name.toLowerCase().includes(query.toLowerCase()),
            )
            .map((s) => (
              <section key={s.id} className="info-card">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void run({
                      type: 'session.rename',
                      id: s.id,
                      name: String(new FormData(e.currentTarget).get('name')),
                    });
                  }}
                >
                  <label>
                    Rename session
                    <input
                      name="name"
                      aria-label={'Session name ' + s.name}
                      defaultValue={s.name}
                      required
                      maxLength={80}
                    />
                  </label>
                  <button className="text-button">Rename</button>
                </form>
                <p className="field-note">
                  {s.pages.length} pages ·{' '}
                  {new Date(s.createdAt).toLocaleDateString()}
                </p>
                {s.pages.map((p) => (
                  <label className="saved-page" key={p.url}>
                    <input
                      type="checkbox"
                      checked={selected[s.id + ':' + p.url] ?? true}
                      onChange={(e) =>
                        setSelected({
                          ...selected,
                          [s.id + ':' + p.url]: e.target.checked,
                        })
                      }
                    />
                    <span className="truncate" title={p.url}>
                      {p.title}
                    </span>
                  </label>
                ))}
                <button
                  className="text-button"
                  onClick={() =>
                    void run({
                      type: 'session.restore',
                      id: s.id,
                      urls: s.pages
                        .filter((p) => selected[s.id + ':' + p.url] ?? true)
                        .map((p) => p.url),
                    })
                  }
                >
                  Restore selected pages
                </button>
                <button
                  className="text-button"
                  onClick={() => {
                    if (
                      window.confirm(
                        'Delete this saved session? Open tabs stay open.',
                      )
                    )
                      void run({ type: 'session.delete', id: s.id });
                  }}
                >
                  Delete session
                </button>
              </section>
            ))}
          {!library.sessions.some((s) => s.workspaceId === workspaceId) && (
            <p className="empty-state">
              Save a session to return to this workspace later.
            </p>
          )}
        </>
      )}
      {view !== 'sessions' && (
        <>
          <p className="field-note">
            {view === 'snoozed'
              ? 'Reminders are retained across restarts. Due reminders stay here until restored or cancelled.'
              : 'Archive keeps URL copies until you restore or delete them. Automatic archival is off.'}
          </p>
          {library[view]
            .filter(
              (p) =>
                p.workspaceId === workspaceId &&
                `${p.title} ${p.url}`
                  .toLowerCase()
                  .includes(query.toLowerCase()),
            )
            .map((p) => (
              <article key={p.id} className="info-card">
                <strong className="truncate" title={p.url}>
                  {p.title}
                </strong>
                {view === 'snoozed' && (
                  <p className="field-note">
                    {p.ready
                      ? 'Ready to restore'
                      : new Date(p.dueAt!).toLocaleString()}
                  </p>
                )}
                <button
                  className="text-button"
                  onClick={() =>
                    void run({
                      type:
                        view === 'snoozed'
                          ? 'snooze.restore'
                          : 'archive.restore',
                      id: p.id,
                    })
                  }
                >
                  Restore {view === 'snoozed' ? 'snoozed' : 'archived'} page
                </button>
                <button
                  className="text-button"
                  onClick={() => {
                    if (
                      view === 'snoozed' ||
                      window.confirm(
                        'Permanently delete this archived URL copy?',
                      )
                    )
                      void run({
                        type:
                          view === 'snoozed'
                            ? 'snooze.cancel'
                            : 'archive.delete',
                        id: p.id,
                      });
                  }}
                >
                  {view === 'snoozed'
                    ? 'Cancel reminder'
                    : 'Delete archive entry'}
                </button>
              </article>
            ))}
          {!library[view].some((p) => p.workspaceId === workspaceId) && (
            <p className="empty-state">
              No {view === 'snoozed' ? 'reminders' : 'archived pages'} in this
              workspace.
            </p>
          )}
        </>
      )}
    </div>
  );
}
