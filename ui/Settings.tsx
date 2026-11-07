import { AppearanceStudio } from './AppearanceStudio';
import { useSidebar } from '../lib/store';
import type { SidebarClient } from '../lib/client';
import { DataSettings } from './DataSettings';
import { useState } from 'react';
import type { SidebarPreferences, AiSettings } from '../lib/models';
export function Settings({
  client,
  preferences,
  update,
  aiSettings,
  updateAiSettings,
}: {
  client: SidebarClient;
  preferences: SidebarPreferences;
  update: (patch: Partial<SidebarPreferences>) => void;
  aiSettings: AiSettings;
  updateAiSettings: (patch: Partial<AiSettings>) => Promise<void>;
}) {
  const [studioOpen, setStudioOpen] = useState(false);
  const trusted = location.protocol === 'chrome-extension:';
  const [gatewayKey, setGatewayKey] = useState('');
  const [provider, setProvider] = useState<import('../lib/models').AiProvider>(
    aiSettings.provider ?? 'typesafe',
  );
  const direct = provider === 'typesafe';
  const selectedStatus =
    provider === (aiSettings.provider ?? 'typesafe')
      ? aiSettings.status
      : 'disconnected';
  const providerName = direct ? 'TypeSafe Direct' : 'Vercel AI Gateway';
  const keyUrl = direct
    ? 'https://console.typesafe.ai'
    : 'https://vercel.com/ai-gateway';
  const [verifying, setVerifying] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const handleVerify = async () => {
    if (!gatewayKey.trim()) return;
    setVerifying(true);
    try {
      await updateAiSettings({
        provider,
        ...(direct
          ? { typesafeKey: gatewayKey.trim() }
          : { gatewayKey: gatewayKey.trim() }),
      });
      setGatewayKey('');
    } catch {
      // Error is handled by the background and reflected in aiSettings
    } finally {
      setVerifying(false);
    }
  };

  const handleRemoveKey = async () => {
    await updateAiSettings({
      provider,
      ...(direct ? { typesafeKey: '' } : { gatewayKey: '' }),
    });
  };

  const statusColors = {
    disconnected: 'var(--muted)',
    connecting: 'var(--accent)',
    connected: 'var(--success)',
    error: 'var(--danger)',
  } as const;

  return (
    <div className="settings-view">
      <div className="eyebrow">PREFERENCES</div>
      <h2>Settings</h2>
      {useSidebar.getState().metadata && (
        <details
          className="appearance-entry"
          onToggle={(event) => setStudioOpen(event.currentTarget.open)}
        >
          <summary>Appearance Studio</summary>
          {studioOpen && (
            <AppearanceStudio
              key={useSidebar.getState().metadata?.activeWorkspaceId}
              client={client}
            />
          )}
        </details>
      )}
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
          underneath. Restricted Chrome pages require the native panel, the
          dashboard, or F11.
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
        Connect your TypeSafe Direct key to enable Jev-powered tab
        classification, workspace routing, smart grouping, focus filtering, and
        cleanup suggestions.
      </p>
      {!trusted && (
        <button
          className="text-button"
          onClick={() => void client.command({ type: 'settings.open' })}
        >
          Open secure AI settings
        </button>
      )}
      <label>
        AI provider
        <select
          aria-label="AI provider"
          value={provider}
          disabled={verifying}
          onChange={(e) => {
            setProvider(e.target.value as import('../lib/models').AiProvider);
            setGatewayKey('');
            setShowKey(false);
          }}
        >
          <option value="typesafe">TypeSafe Direct · jev-latest</option>
          <option value="vercel">Vercel AI Gateway · legacy</option>
        </select>
      </label>
      <p className="field-note">
        {direct
          ? 'TypeSafe Direct · jev-latest'
          : 'Vercel AI Gateway · typesafe-ai/jev'}
        . No automatic provider fallback.
      </p>
      <div className="ai-settings-card">
        <div className="ai-status-row">
          <span className="ai-status-label">{providerName}</span>
          <span
            className="ai-status-badge"
            style={{ borderColor: statusColors[selectedStatus] }}
          >
            {selectedStatus === 'connected'
              ? 'Connected'
              : selectedStatus === 'connecting'
                ? 'Verifying…'
                : selectedStatus === 'error'
                  ? `Error: ${aiSettings.lastError ?? 'Unknown'}`
                  : 'Not connected'}
          </span>
        </div>
        {trusted && selectedStatus !== 'connected' && (
          <div className="ai-key-input">
            <label>
              API Key
              <div className="key-input-row">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={gatewayKey}
                  onChange={(e) => setGatewayKey(e.target.value)}
                  placeholder={direct ? 'TypeSafe API key' : 'vck_…'}
                  aria-label={`${providerName} API key`}
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
                <a href={keyUrl} target="_blank" rel="noopener">
                  {direct ? 'console.typesafe.ai' : 'vercel.com/ai-gateway'}
                </a>
                . Usage may incur provider charges. Sidekick never stores your
                key outside this browser.
              </p>
            </div>
          </div>
        )}
        {trusted && selectedStatus === 'connected' && (
          <div className="ai-connected-actions">
            <p className="field-note">
              Model:{' '}
              {aiSettings.lastModel ??
                (direct ? 'jev-latest' : 'typesafe-ai/jev')}
              . Last verified:{' '}
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
        {selectedStatus === 'error' && (
          <div className="ai-error" role="alert">
            <p className="field-note" style={{ color: 'var(--danger)' }}>
              Connection failed: {aiSettings.lastError}
            </p>
            <p className="field-note ai-key-note">
              Check your key at{' '}
              <a href={keyUrl} target="_blank" rel="noopener">
                {direct ? 'console.typesafe.ai' : 'vercel.com/ai-gateway'}
              </a>
              and try again. Rate limits or network issues may cause temporary
              failures.
            </p>
          </div>
        )}
      </div>
      <DataSettings client={client} />
      <p className="field-note">
        Preferences and workspace metadata stay in this browser. No account or
        internet connection required.
      </p>
    </div>
  );
}
