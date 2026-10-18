import { useEffect, useRef, useState } from 'react';
import type { SidebarClient } from '../lib/client';
import { useSidebar } from '../lib/store';
import { pageControls } from '../lib/page-controls';
import { Icon } from './Icon';

export function Navigation({
  client,
  dashboard = false,
  visible = true,
}: {
  client: SidebarClient;
  dashboard?: boolean;
  visible?: boolean;
}) {
  const state = useSidebar();
  const active = state.tabs.find((t) => t.active);
  const input = useRef<HTMLInputElement>(null);
  const [copied, setCopied] = useState<string>();
  const [focusRequest, setFocusRequest] = useState(0);
  const handledFocus = useRef(0);
  const pageReady = !!active && state.connected;
  const run = (action: 'back' | 'forward' | 'reload' | 'stop' | 'close') => {
    void client
      .command({ type: 'navigation.action', action })
      .catch((e: unknown) =>
        state.setError(e instanceof Error ? e.message : 'Navigation failed.'),
      );
  };
  useEffect(() => {
    const focus = () => setFocusRequest((value) => value + 1);
    pageControls.addEventListener('address', focus);
    return () => {
      pageControls.removeEventListener('address', focus);
    };
  }, []);
  // Keep the element itself stable as Chrome supplies its first URL snapshot;
  // replacing it on URL changes discards an in-flight keyboard focus request.
  useEffect(() => {
    if (input.current && !dashboard) input.current.value = active?.url ?? '';
  }, [active?.id, active?.url, dashboard]);
  // Wait for React's visible commit and Chrome's next frame before focusing;
  // inert/visibility transitions otherwise silently lose a keyboard request.
  useEffect(() => {
    if (visible && pageReady && focusRequest > handledFocus.current) {
      const aside = input.current?.closest('aside');
      const focus = () => {
        if (handledFocus.current >= focusRequest) return;
        const element = input.current;
        element?.focus({ preventScroll: true });
        element?.select();
        if (
          element &&
          (element.getRootNode() as Document | ShadowRoot).activeElement ===
            element
        )
          handledFocus.current = focusRequest;
      };
      const frame = requestAnimationFrame(focus);
      // Chrome can defer focus while visibility is transitioning. Retry on the
      // overlay's own transition completion, without a polling timer.
      const transitioned = (event: TransitionEvent) => {
        if (event.target === aside) focus();
      };
      aside?.addEventListener('transitionend', transitioned);
      return () => {
        cancelAnimationFrame(frame);
        aside?.removeEventListener('transitionend', transitioned);
      };
    }
  }, [focusRequest, visible, pageReady]);
  return (
    <div className={`navigation ${dashboard ? 'dashboard-navigation' : ''}`}>
      {!dashboard && (
        <>
          <div className="page-heading" title={active?.url}>
            <span className="favicon">
              {active?.loading ? (
                <span className="spinner" />
              ) : (
                <>
                  <Icon name="globe" size={14} />
                  {active?.favicon && /^https?:/.test(active.favicon) && (
                    <img
                      key={active.favicon}
                      src={active.favicon}
                      alt=""
                      referrerPolicy="no-referrer"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                      }}
                    />
                  )}
                </>
              )}
            </span>
            <span className="truncate">
              {active?.title ?? 'Your next destination'}
            </span>
          </div>
          <div className="navigation-actions">
            <button
              className="icon-button"
              aria-label="Go back"
              title="Back"
              onClick={() => run('back')}
            >
              <Icon name="back" size={16} />
            </button>
            <button
              className="icon-button"
              aria-label="Go forward"
              title="Forward"
              onClick={() => run('forward')}
            >
              <Icon name="arrow" size={16} />
            </button>
            <button
              className="icon-button"
              aria-label={active?.loading ? 'Stop loading' : 'Reload page'}
              title={active?.loading ? 'Stop' : 'Reload'}
              onClick={() => run(active?.loading ? 'stop' : 'reload')}
            >
              <Icon name={active?.loading ? 'stop' : 'reload'} size={16} />
            </button>
            <button
              className="icon-button"
              aria-label="Open new tab"
              title="New tab"
              onClick={() => {
                void client
                  .command({ type: 'tab.create' })
                  .catch((e: Error) => state.setError(e.message));
              }}
            >
              <Icon name="plus" size={16} />
            </button>
            <button
              className="icon-button"
              aria-label="Close current tab"
              title="Close current tab"
              onClick={() => run('close')}
            >
              <Icon name="close" size={16} />
            </button>
            <button
              className="icon-button"
              aria-label="Copy current URL"
              title={copied === active?.url ? 'Copied' : 'Copy current URL'}
              onClick={() => {
                if (!active?.url) return;
                const url = active.url;
                const selectCurrent = () => {
                  if (input.current) {
                    input.current.value = url;
                    input.current.focus();
                    input.current.select();
                  }
                };
                void navigator.clipboard?.writeText(active.url).then(
                  () => setCopied(url),
                  () => {
                    selectCurrent();
                    state.setError(
                      'Clipboard is unavailable here. The address is selected; press Ctrl+C to copy.',
                    );
                  },
                );
                if (!navigator.clipboard) {
                  selectCurrent();
                  state.setError(
                    'The address is selected; press Ctrl+C to copy.',
                  );
                }
              }}
            >
              <Icon name="copy" size={15} />
            </button>
          </div>
        </>
      )}
      <form
        className="address-form"
        onSubmit={(e) => {
          e.preventDefault();
          const value = input.current?.value ?? '';
          state.setError(undefined);
          void client
            .command({ type: 'navigation.go', input: value })
            .catch((error: unknown) =>
              state.setError(
                error instanceof Error
                  ? error.message
                  : 'Unable to open address.',
              ),
            );
        }}
      >
        <Icon name="search" size={16} />
        <input
          ref={input}
          aria-label="Address or Google search"
          placeholder="Search Google or enter an address"
          defaultValue={dashboard ? '' : (active?.url ?? '')}
          maxLength={4096}
          autoComplete="off"
          spellCheck={false}
          onFocus={(e) => e.currentTarget.select()}
        />
        <button className="icon-button" aria-label="Go to address" title="Go">
          <Icon name="arrow" size={16} />
        </button>
      </form>
      {copied && copied === active?.url && (
        <span className="field-note" role="status">
          URL copied
        </span>
      )}
    </div>
  );
}

export function ImmersiveControls({ client }: { client: SidebarClient }) {
  const state = useSidebar();
  const [pending, setPending] = useState(false);
  const immersive = state.windowState.immersive;
  return (
    <div
      className={`immersive-controls ${immersive ? 'immersive-active' : ''}`}
    >
      <button
        disabled={pending || !state.connected}
        onClick={() => {
          setPending(true);
          state.setError(undefined);
          void client
            .command({ type: immersive ? 'immersive.exit' : 'immersive.enter' })
            .catch((e: unknown) =>
              state.setError(
                e instanceof Error
                  ? e.message
                  : 'Window change failed. Press F11 to recover.',
              ),
            )
            .finally(() => setPending(false));
        }}
      >
        <Icon name="fullscreen" size={14} />
        {pending
          ? 'Updating window…'
          : immersive
            ? 'Exit Immersive'
            : 'Enter Immersive'}
      </button>
      {immersive && <span>F11 exits · Alt+Shift+L opens navigation</span>}
    </div>
  );
}
