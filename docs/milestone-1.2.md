# Milestone 1.2 — Immersive browser mode

Implemented on Windows, October 18–19, 2026. Chrome for Testing 156.0.8078.4, WXT 0.21.4, React, strict TypeScript, pnpm 11.20.0. No new packages. The only additional permission is `bookmarks`.

## Delivered

- Explicit Enter/Exit Immersive controls in the existing sidebar and new dashboard. The background controller changes the current regular Chrome window using `chrome.windows.update`. It remembers normal/maximized return state per window in session storage, serializes same-window operations, and reconciles actual Chrome state after bounds/focus events and client reconnects. Startup only observes windows and never enters fullscreen.
- Existing hover and pinned modes remain shared React views. Hidden mode offers hover access while immersive without rewriting the saved preference. Pin opens Chrome's native panel and suppresses the website overlay; the browser allocates adjacent page space. If native opening fails, the edge notice offers **Use hover sidebar**. No host margins, padding, content wrappers or broad page styles are changed.
- Shared address/search navigation, active title/favicon/loading indicator, back/forward/reload/stop, new/close tab and copy URL. Domain/search parsing and a common URL boundary reject script/data/file/extension schemes, embedded credentials, controls and unsupported Chrome pages. Stop uses a trusted message to the early content script and `window.stop()`; it is explicitly unavailable where Chrome cannot inject that script. Clipboard failures select the actual current URL for Ctrl+C.
- Registered Alt+Shift+L, Alt+Shift+S and Alt+Shift+E commands for address focus, sidebar reveal and immersive exit. Native/restricted pages use the native panel. New Tab receives focus through the same client event. The address element remains stable while Chrome supplies URL snapshots. Focus waits for the visible React commit and next browser frame, with a transition-completion retry, avoiding focus loss while the overlay is inert or transitioning.
- Supported `chrome_url_overrides.newtab` dashboard with active workspace, shared workspace selector, favorites/shortcuts, add/edit/remove shortcut controls, active-window tabs, matching dark theme, bookmarks, settings and immersive controls. No workspace grouping or tab movement was added.
- Read-only Chrome bookmark folders/search/open, with unsupported bookmark schemes disabled. A star copies title/URL into the active workspace's separate favorite repository. Production contains no Chrome bookmark create/update/move/remove calls. Browser tests create fixtures only in disposable test profiles and verify the original tree is unchanged by favoriting.
- Existing metadata schema and local preferences are preserved. Window IDs, native document handles, search and fullscreen return state remain session-only. No backend, Jev, password management, tab migration, bookmark migration or automatic destructive operations.

## Feasibility and Chrome validation

Before implementation, a real headed Chrome probe entered fullscreen using the windows API and opened the actual native panel using a click. Page width changed **1707 → 1321 CSS px** while fullscreen; one native panel context existed. The prior normal window state was restored. The production integration tests also assert viewport shrinkage and unchanged body margins/padding, rather than substituting an ordinary extension tab for a native panel.

| Check                                             | Result                                                                                                                                                                          |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Enter/Exit via visible controls                   | Passed in headed Chrome                                                                                                                                                         |
| Return to normal and maximized                    | Passed; independent stored return states covered in unit tests                                                                                                                  |
| Per-window behavior                               | Passed; making one window immersive left another normal                                                                                                                         |
| Fullscreen hover, collapse and reveal             | Passed                                                                                                                                                                          |
| Native Pin in fullscreen                          | Passed; one panel, page viewport shrank, overlay suppressed                                                                                                                     |
| Restricted `chrome://version` while fullscreen    | Passed; no injected host, native navigation remained available                                                                                                                  |
| Native current-page navigation/title updates      | Passed                                                                                                                                                                          |
| Worker restart while fullscreen/pinned            | Passed; real worker target terminated, new execution context verified, Exit restored the prior state                                                                            |
| Extension reload while fullscreen                 | Passed in a disposable profile with Developer mode enabled; reopened New Tab detected fullscreen and Exit restored normal                                                       |
| Full Chrome process restart from fullscreen       | Passed; saved shortcut remained, window reopened normal, no automatic fullscreen entry, no stale return state                                                                   |
| Manual/external fullscreen change synchronization | Passed using an external windows API change; UI returned to Enter Immersive                                                                                                     |
| Physical F11                                      | **Unverified**; Playwright F11 injection did not invoke the browser accelerator. External state reconciliation is a separate passed check                                       |
| Extension command shortcuts                       | Manifest registration and trusted focus/reveal message path verified. Physical OS shortcut dispatch/conflicts require manual checking                                           |
| Navigation/input safety                           | Passed: URL input, Google query destination, rejected JavaScript, history, reload, slow-response Stop, active title, copy current URL despite an edited draft                   |
| Chrome New Tab override                           | Passed using `chrome://newtab/`, not only a direct extension URL                                                                                                                |
| Favorites/bookmarks                               | Passed: folders/search, unsafe bookmark disabled, favorite copy leaves original tree unchanged, shortcut add/edit/remove/reload persistence, workspace separation               |
| Milestone 1 / 1.1 modes and tabs                  | Passed, including real native-panel close, tab events/movement/window boundaries, saved Hidden/Pinned, worker reconnect, offline preference persistence and hostile page styles |

The earlier reload test initially failed because its fresh automation profile had Developer mode off; Chrome disabled the unpacked extension on reload. The fixture now follows the documented installation flow by enabling Developer mode through Chrome's UI. No production workaround or extra permission was introduced.

## Exact automated results

- `pnpm check`: type checking, ESLint, formatting check, **46 unit tests across 9 files**, and production Chrome build passed.
- `pnpm exec playwright test`: **15 passed, 2 skipped** across both configured projects. Headless: 12 passed and 2 fullscreen-specific skips. Headed: all 3 passed, including extension reload and full process restart. Skipped headless functionality is not claimed as a headless success.
- `git diff --check`: passed.
- `pnpm zip`: production version 0.1.2 archive generated at `.output/sidekick-0.1.2-chrome.zip`.

All browser tests use isolated temporary profiles. Tests restore/close their own fullscreen windows and validate profile paths before removing them. No normal user browser profile, tabs or bookmarks are used.

## Signed-out live website smoke checks

A separate headed Chrome session entered fullscreen and navigated to real sites. Every reached page had exactly one injected host, a visible 300 px hover sidebar and an Exit Immersive control. Network pages are distinguished from controlled-origin regression fixtures.

| Requested site | Actual result                                                                                                                              |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| YouTube        | Real `youtube.com` homepage loaded; fullscreen hover worked                                                                                |
| GitHub         | Real `github.com` homepage loaded; fullscreen hover worked                                                                                 |
| Gmail          | Redirected to `workspace.google.com/intl/en-US/gmail/`; sidebar worked on that signed-out landing page. Authenticated inbox **not tested** |
| Google Search  | Redirected to Google's `/sorry/` anti-bot challenge; sidebar worked there. Normal results **not tested**                                   |

No account sign-in, challenge solving, or authentication bypass was attempted. Six controlled HTTPS origin fixtures also passed strict CSP, Trusted Types and hostile body-layout tests for Google Search, Gmail, Drive, YouTube, GitHub and example.com. Those fixtures are not evidence of authenticated live app compatibility.

## Recovery and remaining limits

**F11 (or Fn+F11) is the independent browser recovery mechanism on Windows. Disabling or reloading Sidekick does not automatically exit fullscreen.** If an updated content script is unavailable, press F11, reload the extension if needed, and refresh existing website tabs. The toolbar/native panel or Sidekick New Tab also provides Exit when the extension is enabled. Alt+Shift+E is a convenience command and depends on the extension and its assigned shortcut.

The exact normal/maximized return state survives worker restarts, not extension reloads or full browser restarts. If Chrome retains fullscreen without a known return state, Exit falls back to normal. The tested browser restart reopened normal. Native panel availability/placement and full-window recovery remain browser/OS controlled. Hover fallback covers part of a webpage while open; collapse it to access content beneath. Restricted URLs cannot host hover UI; use native panel, New Tab or F11.

Only Windows Chrome for Testing was exercised. Physical F11/shortcut conflicts, disabling the extension while fullscreen, signed-in Gmail, normal Google results, incognito, older Chrome releases, enterprise/kiosk restrictions, popup/app windows in real Chrome, site-requested DOM fullscreen, macOS and Linux remain unverified. Unsupported popup/minimized/managed states and API failures are covered by controller tests, not claimed as live platform successes. Some page top-layer dialogs or transformations of the document element can cover the overlay. Browser policy/site-access restrictions are not bypassed.

## Reload and manual test

1. Open `chrome://extensions`, keep Developer mode on, and click **Reload** on the existing Sidekick card. Keep the same `.output/chrome-mv3` directory/extension ID; do not uninstall or clear storage. If Chrome asks for the new bookmark permission or New Tab change, review and accept it to enable these features.
2. Refresh existing ordinary website tabs. Open a new tab and confirm the Sidekick dashboard appears. Add/edit a shortcut; browse a bookmark folder and star a bookmark; verify Chrome's original bookmark remains in place.
3. In Sidekick, click **Enter Immersive**. Collapse and hover the left edge, navigate to a URL, search, switch tabs, use history/reload/stop, and Pin. Confirm the website gets adjacent space in pinned mode and no second overlay appears.
4. Click **Exit Immersive** from normal and maximized windows and confirm the previous state returns. Enter again, press the physical **F11**, then reopen Sidekick and confirm Enter is shown.
5. Visit `chrome://extensions/shortcuts` and verify/assign Alt+Shift+L/S/E. Test address focus, reveal and exit. On a restricted page, the reveal/focus shortcuts open the native panel; click its address field if Chrome retains keyboard focus.
6. Test a second window independently. While immersive, reload Sidekick, refresh a website tab or open New Tab, and verify Exit. Separately disable it and press **F11** to recover; do not expect disabling to restore the window automatically. Re-enable afterward. Signed-in Gmail and ordinary Google results need a normal human browsing session.

## Screenshots

These are screenshots from actual extension targets in isolated Chrome. Native target capture shows the panel's content; browser-owned tab-strip/toolbar pixels are outside Playwright's page screenshot surface.

- [New Tab dashboard](screenshots/milestone-1.2-newtab.png)
- [Actual native panel during fullscreen](screenshots/milestone-1.2-immersive-native.png)
- [Live GitHub hover in fullscreen](screenshots/milestone-1.2-github.png)

## API references

- [Chrome windows API](https://developer.chrome.com/docs/extensions/reference/api/windows): supported fullscreen state and window events.
- [Chrome sidePanel API](https://developer.chrome.com/docs/extensions/reference/api/sidePanel): browser-managed panel and gesture requirements. Fullscreen availability was measured above.
- [Chrome tabs API](https://developer.chrome.com/docs/extensions/reference/api/tabs): tab navigation/history/reload.
- [Chrome commands API](https://developer.chrome.com/docs/extensions/reference/api/commands): extension keyboard shortcuts.
- [Chrome New Tab overrides](https://developer.chrome.com/docs/extensions/develop/ui/override-chrome-pages): supported replacement page.
- [Chrome bookmarks API](https://developer.chrome.com/docs/extensions/reference/api/bookmarks): bookmark tree/search.
- [Chrome keyboard shortcuts](https://support.google.com/chrome/answer/157179): Windows fullscreen F11 recovery.
