import '../../ui/style.css';
import { createRoot } from 'react-dom/client';
import { Sidebar } from '../../ui/Sidebar';
import { createShadowRootUi } from 'wxt/utils/content-script-ui/shadow-root';
import { focusAddress, pageControls } from '../../lib/page-controls';
import { DockingController } from '../../lib/docking';
import { useSidebar } from '../../lib/store';

export default defineContentScript({
  matches: ['http://*/*', 'https://*/*'],
  excludeMatches: [
    'https://chromewebstore.google.com/*',
    'https://chrome.google.com/webstore/*',
  ],
  cssInjectionMode: 'ui',
  runAt: 'document_start',
  async main(ctx) {
    const control = (
      message: unknown,
      sender: chrome.runtime.MessageSender,
      respond: (result: { ok: boolean }) => void,
    ) => {
      if (
        sender.id !== chrome.runtime.id ||
        !message ||
        typeof message !== 'object' ||
        !('channel' in message) ||
        message.channel !== 'sidekick:page' ||
        !('action' in message)
      )
        return;
      if (message.action === 'stop') window.stop();
      else if (message.action === 'focus-address') focusAddress();
      else if (message.action === 'show-sidebar')
        pageControls.dispatchEvent(new Event('reveal'));
      else return;
      respond({ ok: true });
    };
    chrome.runtime.onMessage.addListener(control);
    ctx.onInvalidated(() => chrome.runtime.onMessage.removeListener(control));
    if (!document.documentElement)
      await new Promise<void>((done) => {
        const observer = new MutationObserver(() => {
          if (document.documentElement || ctx.isInvalid) {
            observer.disconnect();
            done();
          }
        });
        observer.observe(document, { childList: true });
        ctx.onInvalidated(() => {
          observer.disconnect();
          done();
        });
      });
    if (ctx.isInvalid) return;
    const layout = new DockingController((status) =>
      useSidebar.getState().setDockStatus(status),
    );
    const retryDock = () => layout.retry();
    pageControls.addEventListener('retry-dock', retryDock);
    const applyLayout = () => {
      const state = useSidebar.getState();
      if (
        state.metadata?.preferences.mode === 'docked' &&
        !state.windowState.nativePanelOpen
      )
        layout.dock(state.metadata.preferences.width);
      else layout.undock();
    };
    const unsubscribe = useSidebar.subscribe((state, previous) => {
      if (
        state.metadata?.preferences.mode !==
          previous.metadata?.preferences.mode ||
        state.metadata?.preferences.width !==
          previous.metadata?.preferences.width ||
        state.windowState.nativePanelOpen !==
          previous.windowState.nativePanelOpen
      )
        applyLayout();
    });
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
        'dragstart',
        'dragend',
        'dragenter',
        'dragleave',
        'dragover',
        'drop',
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
    applyLayout();
    const invalidate = () => {
      unsubscribe();
      layout.undock();
      observer.disconnect();
      ui.remove();
    };
    pageControls.addEventListener('invalidated', invalidate);
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
      unsubscribe();
      pageControls.removeEventListener('retry-dock', retryDock);
      pageControls.removeEventListener('invalidated', invalidate);
      layout.undock();
      observer.disconnect();
      ui.remove();
    });
  },
});
