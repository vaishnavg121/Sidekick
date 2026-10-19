# Milestone 1 verification

Historical results for `a762b0a` are preserved below. See [Milestone 1.3](milestone-1.3.md) for current docking, resource and workspace behavior, [Milestone 1.2](milestone-1.2.md) for immersive-mode history, and [Milestone 1.1](milestone-1.1.md) for the preceding hybrid-panel changes. Pinned-overlay and hidden-strip expectations below were superseded in 1.1.

Executed on Windows on 18 October 2026 with Node 24.19.0, pnpm 11.20.0, WXT 0.21.4 and Playwright 1.64.1 / Chrome for Testing 156.0.8078.4.

## Automated results

| Check                                             | Result                         |
| ------------------------------------------------- | ------------------------------ |
| TypeScript strict type check                      | Pass                           |
| ESLint                                            | Pass                           |
| Prettier check                                    | Pass                           |
| Vitest                                            | 18 tests passed across 6 files |
| WXT production MV3 build                          | Pass                           |
| Playwright with the unpacked production extension | 2 integration scenarios passed |

The browser tests launch a temporary profile, load the real manifest and service worker, and exercise actual Chrome APIs. Tests use DevTools to inspect the closed shadow root; this inspection handle exists only in the temporary test page, not in the shipped extension. The captured screenshot is `test-results/sidebar.png` (generated, ignored by Git) and was visually inspected.

Verified behavior:

- MV3 service worker startup, native side-panel path and toolbar behavior configuration.
- Delayed hover open/close, movement from the edge into the panel, and unchanged host-page geometry.
- Host-page font size isolation, closed shadow root, and absence of injected document-level stylesheet rules.
- Real tab creation, activation, close, loading indicators, title changes, movement, detachment to another window, and event-driven list updates.
- Correct per-window scope and rejection of a stale tab-close request after the tab moves to a different window.
- Full navigation, SPA URL/title updates and reinitialization after synchronous body replacement, with a single sidebar instance.
- Search empty state, setting changes, cross-view propagation, persistence across page reloads, pinned mode, hidden mode and restoration from the native entrypoint.
- Workspace selection persisted after reload while tab visibility remains unchanged.
- Restricted `chrome://version` does not receive a content-script overlay. The shared native entrypoint loads as an extension page.
- Worker termination through DevTools, followed by a different Chrome background execution-context ID, reconnected subscriptions and retained settings.
- Settings changes and persistence acknowledgments while the browser network is offline.
- Storage failures preserve existing data; queued writes avoid lost preferences; metadata validation rejects invalid references and folder cycles; session handles remain separate from local metadata; disconnect backoff and teardown are covered by unit tests.

## Manual checks still needed

No interactive manual browser checks were performed. Automated loading was verified in Chrome for Testing, not the user's installed Chrome profile. Before release:

1. Load `.output/chrome-mv3` in installed Chrome using the README instructions and inspect the extension error list.
2. Click the real toolbar action and verify Chrome's native side-panel surface on a webpage, `chrome://extensions`, the Web Store and a PDF. Automation verified configuration and the native entrypoint, not the browser toolbar gesture or outer panel chrome.
3. Check hover and keyboard focus on representative real sites, including pages with dialogs/top-layer elements or transformed body elements.
4. Check browser relaunch, extension update/reload, accessibility with a screen reader, high zoom, multiple monitors and incognito if enabled.

Future workspace switching, tab-group orchestration, favorites/pinned editing, folders UI and secret storage are outside this milestone and were not tested as implemented features.

## Official references consulted

- [WXT content script and Shadow Root UI guide](https://wxt.dev/guide/essentials/content-scripts)
- [WXT entrypoint configuration](https://wxt.dev/guide/essentials/entrypoints)
- [Chrome Tabs API](https://developer.chrome.com/docs/extensions/reference/api/tabs)
- [Chrome Storage API](https://developer.chrome.com/docs/extensions/reference/api/storage)
- [Chrome messaging](https://developer.chrome.com/docs/extensions/develop/concepts/messaging)
- [Chrome Side Panel API](https://developer.chrome.com/docs/extensions/reference/api/sidePanel)
- [Playwright extension loading and worker suspension behavior](https://playwright.dev/docs/chrome-extensions)
