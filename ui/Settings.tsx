import type { SidebarPreferences } from '../lib/models';
export function Settings({
  preferences,
  update,
}: {
  preferences: SidebarPreferences;
  update: (patch: Partial<SidebarPreferences>) => void;
}) {
  return (
    <div className="settings-view">
      <div className="eyebrow">MAKE YOURSELF AT HOME</div>
      <h2>Sidebar settings</h2>
      <p className="muted">A little space to make browsing feel lighter.</p>
      <label className="setting-label" htmlFor="sidebar-mode">
        Display mode
      </label>
      <select
        id="sidebar-mode"
        value={preferences.mode}
        onChange={(event) =>
          update({ mode: event.target.value as SidebarPreferences['mode'] })
        }
      >
        <option value="hidden">Hidden</option>
        <option value="hover">Hover overlay</option>
        <option value="pinned">Pinned · Chrome side panel</option>
      </select>
      <p className="field-note">
        Pinned uses Chrome’s own space alongside the page. Drag Chrome’s panel
        divider to resize it. Hidden keeps a small edge button for reopening
        Sidekick.
      </p>
      {(
        [
          ['width', 'Overlay width', 240, 440, 'px'],
          ['openDelay', 'Hover open delay', 0, 1500, 'ms'],
          ['closeDelay', 'Hover close delay', 100, 2000, 'ms'],
        ] as const
      ).map(([key, label, min, max, unit]) => (
        <label className="range-field" key={key}>
          <span>
            {label}
            <output>
              {preferences[key]} {unit}
            </output>
          </span>
          <input
            type="range"
            aria-label={label}
            min={min}
            max={max}
            step={key === 'width' ? 10 : 50}
            value={preferences[key]}
            onChange={(event) => update({ [key]: Number(event.target.value) })}
          />
        </label>
      ))}
      <div className="info-card">
        <strong>Immersive recovery</strong>
        <p>
          Press F11 (or Fn+F11) to show Chrome’s toolbar again, even after
          Sidekick is disabled or reloaded. Disabling Sidekick does not exit
          fullscreen.
        </p>
        <p>
          Alt+Shift+L focuses navigation. Alt+Shift+S reveals Sidekick.
          Alt+Shift+E exits immersive mode. Check or change assignments at
          chrome://extensions/shortcuts.
        </p>
        <p>
          If Chrome’s native panel is unavailable, choose Hover overlay. It
          floats over the page while open; collapse it to reach the page
          underneath. Restricted Chrome pages require the native panel, the New
          Tab page, or F11.
        </p>
      </div>
      <div className="info-card">
        <strong>Always within reach</strong>
        <p>
          Click the Sidekick toolbar icon to open Chrome’s native side panel,
          including on Chrome pages and the Web Store.
        </p>
      </div>
      <p className="field-note">
        Preferences and workspace metadata stay in this browser. No account or
        internet connection required.
      </p>
    </div>
  );
}
