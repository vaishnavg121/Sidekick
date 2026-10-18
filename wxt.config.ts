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
    permissions: ['storage', 'tabs', 'sidePanel'],
    action: { default_title: 'Open Sidekick side panel' },
  },
  vite: () => ({ plugins: [tailwindcss()] }),
});
