# Milestone 1.1 — hybrid layout and website compatibility

Version 0.1.1 retains the existing local metadata schema and saved preferences. No permissions or runtime dependencies were added. No migration moves or closes user tabs, changes workspaces, or clears storage.

## Root causes and fixes

1. **Pinned content overlap:** the original `pinned` condition permanently displayed a fixed-position webpage overlay. Native Side Panel existed as a separate fallback and was not the pinned renderer. Pin now calls `chrome.sidePanel.open({ windowId })` directly in the gesture's background message handler, before any storage or tab lookup awaits. Mode is persisted after opening succeeds; the real native panel allocates browser space. No website margin/padding changes are used.
2. **Website mount/stacking compatibility:** content scripts already matched all the requested HTTP/HTTPS Google subdomains and other sites. There was no missing Google-specific permission or match. The overlay host was inside `body`, where body transforms, clipping/containment and CSS could interfere with its viewport geometry. The host now mounts directly under the document element, with fixed, zero-size positioning and scoped important styles. Closed Shadow DOM continues to isolate React and CSS. It survives body replacement, SPA navigation, root replacement and host removal. The regression fixtures reproduce transformed/clipped body layouts, aggressive host CSS and strict CSP, including Trusted Types, at all six requested site URLs. These fixes address identifiable implementation weaknesses; they do not establish which specific site styling or permission state caused the user's earlier Google observation.
3. **Hidden mode looked unavailable:** previously Hidden removed its edge strip altogether. It now leaves a minimal activation button, without automatic hover expansion. A click restores Hover mode and opens the overlay.
4. **New Tab/internal pages:** Chrome restricts content-script injection there. This is not a Google domain matching bug. The built-in New Tab page remains unchanged; the toolbar opens the global native panel. No tab-specific configuration disables it, and switching eligible/restricted tabs keeps it available.
5. **Renderer consistency:** tabs, workspace metadata and preferences already came from a shared background owner, but search lived independently in each renderer's Zustand store. Search now lives in per-window session state, with optimistic local input protected from older snapshot echoes. Both views reuse the same React UI, commands, tab reducer and snapshots.
6. **Native lifecycle coordination:** actual panel presence is tracked per window, independently of the saved default display preference. Pin/Unpin controls and settings use one `PanelService`. Native presence suppresses the overlay and strip, including when the toolbar opened the panel. Browser close events restore Hover mode. Open/close errors are surfaced; stale asynchronous pin completions cannot restore a superseded mode. Verified document contexts distinguish a real panel from a normal tab preview of `sidepanel.html`, and reconcile panel presence after worker restart. Chrome reports `windowId: -1` for native contexts in the tested version, so raw context-window filtering is not used as proof of closure.

## Chrome compatibility

Chrome 116 remains the minimum. Native `open()` and `runtime.getContexts()` are available there. Programmatic close is feature-detected (141+), as are open/close events (141+/142+). On earlier versions, verified panel document connections and context reconciliation provide lifecycle fallback. If `close()` is unavailable, Unpin preserves the overlay suppression and displays an instruction to close the native panel using Chrome's × button. That fallback is covered by unit tests; older Chrome binaries were not installed or exercised.

The global panel path remains `sidepanel.html`. Its width and left/right placement are Chrome-controlled. A saved Pinned preference cannot authorize the extension to open a native panel automatically on startup/navigation. If Chrome does not restore it, the pinned edge button and toolbar supply a new user gesture. The last chosen display preference is shared local metadata; actual native-panel presence and search are session state per window. Other windows with a saved Pinned preference offer a click-to-open edge when needed.

Reference: [Chrome Side Panel API](https://developer.chrome.com/docs/extensions/reference/api/sidePanel).

## Automated verification

Windows, Node 24.19.0, pnpm 11.20.0, WXT 0.21.4, Playwright 1.64.1, Chrome for Testing 156.0.8078.4.

| Check                                  | Result                         |
| -------------------------------------- | ------------------------------ |
| Strict TypeScript, ESLint, Prettier    | Pass                           |
| Vitest                                 | 26 tests passed across 7 files |
| WXT production MV3 build and ZIP       | Pass                           |
| Headless Chrome integration            | 10 scenarios passed            |
| Headed Chrome native-panel integration | 1 scenario passed              |

The real native-panel screenshot at `test-results/native-panel.png` was visually inspected. All automated browsers used temporary isolated profiles; none used or migrated the user's normal tabs.

Commands:

```powershell
pnpm check
pnpm test:browser
pnpm test:browser:headed
pnpm zip
```

The check command runs strict TypeScript, ESLint, Prettier, Vitest and the production MV3 build. Unit tests cover the existing storage/models/tab/hover behavior plus synchronous gesture handling, rejected opening, failed/unsupported closing, mode-change races, native reconnection and session persistence. Browser scenarios preserve the relevant Milestone 1 coverage; assertions for permanent pinned overlays and a missing Hidden edge were updated to the new requirements.

Browser coverage includes:

- Hover reveal/hide, no host layout mutation, tab creation/activation/close/loading/movement, window scope, search and workspace selection.
- Full page navigation, SPA title/URL changes, body replacement and host remounting.
- Real native panel creation from the overlay Pin click, shared search in both directions and overlay suppression.
- New Tab/internal pages with no prohibited overlay injection, while the real global native panel remains open across tab changes.
- Actual Unpin control in the native document, Chrome-originated closure, hover restoration and duplicate suppression.
- Worker termination with a new nonempty background execution-context ID, retained state and reconnected subscriptions for both renderers.
- Existing saved Pinned preference waiting for a gesture; Hidden retaining an edge button and restoring Hover on click.
- Six controlled URL fixtures: Google Search, Gmail, Drive, YouTube, GitHub and example.com, each with strict CSP/Trusted Types, body transform/containment/clipping and conflicting host CSS. These are served test documents at the real URL origins, not authenticated live applications.
- A separate headed native scenario checks real viewport contraction/restoration and unchanged body margin/padding. One observed run contracted the page from 1266 px to 880 px. Headless mode creates the native panel context but does not perform the browser-chrome resize, so it cannot verify that assertion.

## Live signed-out smoke checks

A separate isolated browser used live network responses, with no user's normal profile or account. The overlay host was under `HTML`, connected to the worker, and became visible after edge hover on every landed page below:

| Requested site | Observed live result                                                           | Verification limit                                                        |
| -------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| Google Search  | Redirected to Google's `/sorry/` anti-bot challenge; overlay visible/connected | Normal search results were not reached; no challenge bypass was attempted |
| Gmail          | Redirected to `accounts.google.com`, Gmail sign-in; overlay visible/connected  | Authenticated `mail.google.com` inbox not tested                          |
| Drive          | Redirected to `accounts.google.com`, Drive sign-in; overlay visible/connected  | Authenticated Drive app not tested                                        |
| YouTube        | Live homepage returned 200; overlay visible/connected                          | Signed-out homepage only                                                  |
| GitHub         | Live homepage returned 200; overlay visible/connected                          | Signed-out homepage only                                                  |
| example.com    | Live page returned 200; overlay visible/connected                              | Public page                                                               |

## Manual and unverified cases

No human-driven manual tests were performed; headed browser interaction above is automated. Remaining manual checks: actual Chrome toolbar/× controls and panel-divider dragging in the user's installed Chrome, authenticated Gmail/Drive, normal Search results from a connection not challenged by Google, a full browser relaunch, older Chrome releases, incognito, enterprise/site-access policies, screen readers and extreme zoom. Programmatic close exercises the same native close event, but does not claim a physical ×-button click.

Site access must be granted in Chrome's extension details. Existing pages need refreshing after extension reload or access changes. Top-layer webpage dialogs or a transformed document element can still cover/constrain an injected overlay; use the native panel in those cases. The extension does not bypass Chrome restrictions or replace New Tab.

## Updating the installed extension

1. Keep the existing checkout and unpacked-extension directory to preserve the extension ID/storage.
2. Run `pnpm install --frozen-lockfile` and `pnpm build` (or `pnpm check`).
3. Open `chrome://extensions` and click **Reload** on the existing Sidekick card.
4. Refresh open HTTP/HTTPS webpages. Check the extension's site access for the intended domains.
5. Click Pin or the toolbar to open the new native renderer. Existing `pinned` preferences now mean native panel, never permanent webpage overlay.

Milestone 2 workspaces, Jev, backend/authentication and New Tab replacement remain outside this change.
