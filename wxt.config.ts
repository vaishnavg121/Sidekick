import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifestVersion: 3,
  manifest: {
    name: 'Sidekick',
    description:
      'A quieter place for your tabs. Workspaces and a sidebar for Chrome.',
    minimum_chrome_version: '116',
    version_name: '0.4.0 release candidate',
    icons: {
      16: 'icon/16.png',
      32: 'icon/32.png',
      48: 'icon/48.png',
      128: 'icon/128.png',
    },
    options_ui: { page: 'options.html', open_in_tab: true },
    permissions: [
      'storage',
      'tabs',
      'sidePanel',
      'bookmarks',
      'alarms',
      'tabGroups',
    ],
    host_permissions: [
      'https://api.typesafe.ai/*',
      'https://ai-gateway.vercel.sh/*',
    ],
    optional_permissions: ['notifications'],
    commands: {
      'next-workspace': { description: 'Next Sidekick workspace' },
      'previous-workspace': { description: 'Previous Sidekick workspace' },
      'new-tab': { description: 'New tab in this workspace' },
      'focus-tab-search': { description: 'Focus Sidekick tab search' },
      'organize-jev': { description: 'Open Jev suggestions' },
      'toggle-focus': { description: 'Toggle workspace Focus Mode' },
      'toggle-sidebar': { description: 'Toggle Sidekick sidebar' },
      'focus-address': {
        suggested_key: { default: 'Alt+Shift+L' },
        description: 'Focus Sidekick address bar',
      },
      'show-sidebar': {
        suggested_key: { default: 'Alt+Shift+S' },
        description: 'Reveal Sidekick sidebar',
      },
      'exit-immersive': {
        suggested_key: { default: 'Alt+Shift+E' },
        description: 'Exit Sidekick immersive mode',
      },
      'open-command-palette': {
        suggested_key: { default: 'Alt+Shift+K' },
        description: 'Open Sidekick command palette',
      },
    },
    action: { default_title: 'Open Sidekick side panel' },
  },
  vite: () => ({ plugins: [tailwindcss()] }),
});
