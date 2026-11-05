import { useState } from 'react';
import type { Command } from '../lib/protocol';
import type { TabItem } from '../lib/tabs';
import { useSidebar } from '../lib/store';

export function TabActions({
  tab,
  run,
}: {
  tab: TabItem;
  run: (c: Command) => void;
}) {
  const metadata = useSidebar((s) => s.metadata);
  const [open, setOpen] = useState(false),
    [snooze, setSnooze] = useState(false);
  const [due, setDue] = useState(''),
    [close, setClose] = useState(false);
  const act = (c: Command) => {
    run(c);
    setOpen(false);
  };
  return (
    <div className="tab-actions">
      <button
        className="icon-button"
        aria-label={'Actions for tab ' + tab.title}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        onContextMenu={(e) => {
          e.preventDefault();
          setOpen(true);
        }}
      >
        ···
      </button>
      {open && (
        <div
          className="resource-menu tab-action-menu"
          role="menu"
          aria-label={tab.title + ' tab actions'}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setOpen(false);
          }}
        >
          <button
            role="menuitem"
            onClick={() =>
              act({ type: 'resource.current', kind: 'favorite', tabId: tab.id })
            }
          >
            Save to Favorites
          </button>
          <button
            role="menuitem"
            onClick={() =>
              act({ type: 'resource.current', kind: 'pinned', tabId: tab.id })
            }
          >
            Pin in Sidekick
          </button>
          <label>
            Move tab to workspace
            <select
              aria-label={'Move ' + tab.title + ' to workspace'}
              value=""
              onChange={(e) =>
                act({
                  type: 'tab.updateWorkspace',
                  tabId: tab.id,
                  workspaceId: e.target.value,
                })
              }
            >
              <option value="">Choose workspace</option>
              {metadata?.workspaces
                .filter((w) => w.id !== metadata.activeWorkspaceId)
                .map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
            </select>
          </label>
          <button
            role="menuitem"
            disabled={tab.index === 0}
            onClick={() =>
              act({
                type: 'tab.move',
                tabId: tab.id,
                windowId: tab.windowId,
                index: tab.index - 1,
              })
            }
          >
            Move tab earlier
          </button>
          <button role="menuitem" onClick={() => setSnooze(!snooze)}>
            Snooze / remind me
          </button>
          {snooze && (
            <form
              aria-label="Snooze tab"
              onSubmit={(e) => {
                e.preventDefault();
                act({
                  type: 'snooze.create',
                  tabId: tab.id,
                  dueAt: new Date(due).getTime(),
                  close,
                });
              }}
            >
              <label>
                Reminder time
                <input
                  type="datetime-local"
                  aria-label="Reminder time"
                  required
                  value={due}
                  onChange={(e) => setDue(e.target.value)}
                />
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={close}
                  onChange={(e) => setClose(e.target.checked)}
                />{' '}
                Close this tab after saving reminder
              </label>
              <p className="field-note">
                Reminders appear in Library and on the toolbar badge. Restoring
                reopens the URL; unsaved forms and page history cannot be
                restored.
              </p>
              <button className="text-button" type="submit">
                Save reminder
              </button>
              <button
                className="text-button"
                type="button"
                onClick={() =>
                  act({
                    type: 'snooze.create',
                    tabId: tab.id,
                    dueAt: Date.now() + 3600000,
                    close,
                  })
                }
              >
                In one hour
              </button>
              <button
                className="text-button"
                type="button"
                onClick={() =>
                  act({
                    type: 'snooze.create',
                    tabId: tab.id,
                    dueAt: Date.now() + 86400000,
                    close,
                  })
                }
              >
                Tomorrow
              </button>
            </form>
          )}
          <button
            role="menuitem"
            onClick={() =>
              act({ type: 'archive.tab', tabId: tab.id, close: false })
            }
          >
            Save copy to archive · keep tab open
          </button>
          <button role="menuitem" onClick={() => setOpen(false)}>
            Close menu
          </button>
        </div>
      )}
    </div>
  );
}
