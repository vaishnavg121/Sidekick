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
      anchor: 'html',
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
      onMount(container, _shadow, host) {
        // The host is outside body stacking/containing blocks. Only our own
        // zero-size host is styled; website margins and padding are untouched.
        for (const [property, value] of Object.entries({
          position: 'fixed',
          top: '0',
          left: '0',
          width: '0',
          height: '0',
          display: 'block',
          overflow: 'visible',
          margin: '0',
          padding: '0',
          border: '0',
          transform: 'none',
          filter: 'none',
          contain: 'none',
          'z-index': '2147483647',
          'pointer-events': 'none',
        }))
          host.style.setProperty(property, value, 'important');
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
    let observedRoot = document.documentElement;
    // Watch only document/root children. Body replacement leaves this host
    // intact; document-element replacement and host removal trigger remounting.
    const observer = new MutationObserver(() => {
      if (ctx.isInvalid) return;
      if (observedRoot !== document.documentElement) {
        observer.disconnect();
        ui.remove();
        observedRoot = document.documentElement;
        observe();
      }
      if (!ui.shadowHost.isConnected && document.documentElement) {
        if (ui.mounted) ui.remove();
        ui.mount();
      }
    });
    function observe() {
      observer.observe(document, { childList: true });
      if (observedRoot) observer.observe(observedRoot, { childList: true });
    }
    observe();
    ctx.onInvalidated(() => {
      observer.disconnect();
      ui.remove();
    });
  },
});
