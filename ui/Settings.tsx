import { useState } from 'react';
import type { SidebarPreferences, AiSettings } from '../lib/models';
export function Settings({
  preferences,
  update,
  aiSettings,
  updateAiSettings,
}: {
  preferences: SidebarPreferences;
  update: (patch: Partial<SidebarPreferences>) => void;
  aiSettings: AiSettings;
  updateAiSettings: (patch: Partial<AiSettings>) => Promise<void>;
}) {
  const [gatewayKey, setGatewayKey] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const handleVerify = async () => {
    if (!gatewayKey.trim()) return;
    setVerifying(true);
    try {
      await updateAiSettings({ gatewayKey: gatewayKey.trim() });
      setGatewayKey('');
    } catch {
      // Error is handled by the background and reflected in aiSettings
    } finally {
      setVerifying(false);
    }
  };

  const handleRemoveKey = async () => {
    await updateAiSettings({ gatewayKey: '' });
  };

  const statusColors = {
    disconnected: 'var(--muted)',
    connecting: 'var(--accent)',
    connected: 'var(--success)',
    error: 'var(--danger)',
  } as const;

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
        <option value="docked">Docked · custom left sidebar</option>
        <option value="pinned">Native panel · restricted-page fallback</option>
      </select>
      <p className="field-note">
        Docked keeps Sidekick on the left and adjusts compatible pages. Some
        apps cannot be safely docked and offer Hover overlay instead. Hidden
        retains the edge trigger. Chrome's native panel is a separate fallback
        for restricted pages.
      </p>
      {(
        [
          ['width', 'Sidebar width', 240, 440, 'px'],
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
          Press F11 (or Fn+F11) to show Chrome's toolbar again, even after
          Sidekick is disabled or reloaded. Disabling Sidekick does not exit
          fullscreen.
        </p>
        <p>
          Alt+Shift+L focuses navigation. Alt+Shift+S reveals Sidekick.
          Alt+Shift+E exits immersive mode. Check or change assignments at
          chrome://extensions/shortcuts.
        </p>
        <p>
          If Chrome's native panel is unavailable, choose Hover overlay. It
          floats over the page while open; collapse it to reach the page
          underneath. Restricted Chrome pages require the native panel, the New
          Tab page, or F11.
        </p>
      </div>
      <div className="info-card">
        <strong>Always within reach</strong>
        <p>
          Click the Sidekick toolbar icon to open Chrome's native side panel,
          including on Chrome pages and the Web Store.
        </p>
      </div>
      <hr className="settings-divider" />
      <div className="eyebrow">AI TAB ORGANIZATION</div>
      <h2>Intelligent features</h2>
      <p className="muted">
        Connect your Vercel AI Gateway key to enable Jev-powered tab
        classification, workspace routing, smart grouping, focus filtering, and
        cleanup suggestions.
      </p>
      <div className="ai-settings-card">
        <div className="ai-status-row">
          <span className="ai-status-label">Vercel AI Gateway</span>
          <span
            className="ai-status-badge"
            style={{ backgroundColor: statusColors[aiSettings.status] }}
          >
            {aiSettings.status === 'connected' && aiSettings.gatewayKey
              ? `Connected · ${aiSettings.gatewayKey.slice(0, 8)}…`
              : aiSettings.status === 'connecting'
                ? 'Verifying…'
                : aiSettings.status === 'error'
                  ? `Error: ${aiSettings.lastError ?? 'Unknown'}`
                  : 'Not connected'}
          </span>
        </div>
        {aiSettings.status !== 'connected' && (
          <div className="ai-key-input">
            <label>
              API Key
              <div className="key-input-row">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={gatewayKey}
                  onChange={(e) => setGatewayKey(e.target.value)}
                  placeholder="sk-…"
                  aria-label="Vercel AI Gateway API key"
                  disabled={verifying}
                />
                <button
                  type="button"
                  className="icon-button"
                  onClick={() => setShowKey(!showKey)}
                  aria-label={showKey ? 'Hide key' : 'Show key'}
                >
                  <span
                    className="icon-eye"
                    data-show={showKey ? 'true' : 'false'}
                  />
                </button>
              </div>
            </label>
            <div className="ai-key-actions">
              <button
                className="text-button"
                onClick={handleVerify}
                disabled={verifying || !gatewayKey.trim()}
              >
                {verifying ? 'Verifying…' : 'Verify & Connect'}
              </button>
              <p className="field-note ai-key-note">
                Get your key at{' '}
                <a
                  href="https://vercel.com/ai-gateway"
                  target="_blank"
                  rel="noopener"
                >
                  vercel.com/ai-gateway
                </a>
                . Usage may incur provider charges. Sidekick never stores your
                key outside this browser.
              </p>
            </div>
          </div>
        )}
        {aiSettings.status === 'connected' && (
          <div className="ai-connected-actions">
            <p className="field-note">
              Last verified:{' '}
              {aiSettings.lastVerified
                ? new Date(aiSettings.lastVerified).toLocaleString()
                : 'Unknown'}
            </p>
            <button className="text-button danger" onClick={handleRemoveKey}>
              Disconnect & Remove Key
            </button>
            <p className="field-note ai-key-note">
              You can reconnect anytime. Disabling removes the key from this
              browser only. Sidekick works fully offline without AI features.
            </p>
          </div>
        )}
        {aiSettings.status === 'error' && (
          <div className="ai-error">
            <p className="field-note" style={{ color: 'var(--danger)' }}>
              Connection failed: {aiSettings.lastError}
            </p>
            <p className="field-note ai-key-note">
              Check your key at{' '}
              <a
                href="https://vercel.com/ai-gateway"
                target="_blank"
                rel="noopener"
              >
                vercel.com/ai-gateway
              </a>
              and try again. Rate limits or network issues may cause temporary
              failures.
            </p>
          </div>
        )}
      </div>
      <p className="field-note">
        Preferences and workspace metadata stay in this browser. No account or
        internet connection required.
      </p>
    </div>
  );
}
