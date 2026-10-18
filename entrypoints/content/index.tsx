import '../../ui/style.css';
import { createRoot } from 'react-dom/client';
import { Sidebar } from '../../ui/Sidebar';
import { createShadowRootUi } from 'wxt/utils/content-script-ui/shadow-root';

export default defineContentScript({
  matches: ['http://*/*', 'https://*/*'],
  excludeMatches: [
    'https://chromewebstore.google.com/*',
    'https://chrome.google.com/webstore/*',
  ],
  cssInjectionMode: 'ui',
  runAt: 'document_idle',
  async main(ctx) {
    const ui = await createShadowRootUi(ctx, {
      name: 'sidekick-sidebar',
      mode: 'closed',
      position: 'overlay',
      zIndex: 2147483647,
      anchor: 'body',
      isolateEvents: [
        'keydown',
        'keyup',
        'keypress',
        'click',
        'dblclick',
        'pointerdown',
        'pointerup',
        'contextmenu',
      ],
      onMount(container) {
        const root = createRoot(container);
        root.render(<Sidebar nativePanel={false} />);
        return root;
      },
      onRemove(root) {
        root?.unmount();
      },
    });
    if (ctx.isInvalid) return;
    ui.mount();
    let observedBody = document.body;
    // Watch only direct children, not every mutation within the webpage.
    // A body can be replaced in one mutation without ever being absent, which
    // selector-presence auto-mounting alone does not detect.
    const observer = new MutationObserver(() => {
      if (ctx.isInvalid) return;
      if (observedBody !== document.body) {
        observer.disconnect();
        ui.remove();
        observedBody = document.body;
        observe();
      }
      if (!ui.shadowHost.isConnected && document.body) {
        if (ui.mounted) ui.remove();
        ui.mount();
      }
    });
    function observe() {
      observer.observe(document.documentElement, { childList: true });
      if (observedBody) observer.observe(observedBody, { childList: true });
    }
    observe();
    ctx.onInvalidated(() => {
      observer.disconnect();
      ui.remove();
    });
  },
});
