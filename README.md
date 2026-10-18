# Sidekick

An Arc-inspired sidebar for Chrome. Milestone 1.2 adds optional immersive fullscreen, browser navigation, a Sidekick New Tab page, workspace shortcuts and read-only Chrome bookmark browsing. The existing hover overlay and browser-managed pinned panel share the same live tabs, workspace data and settings.

## Setup and load

Use Node.js 22.12+ (Node 24 recommended), Corepack, pnpm 11.20.0 and Chrome 116+. Dependencies are locked in `pnpm-lock.yaml`.

```powershell
corepack enable
pnpm install --frozen-lockfile
pnpm build
```

1. Open `chrome://extensions` in Chrome.
2. Enable **Developer mode** and choose **Load unpacked**.
3. Select `C:\Users\gvnag\Documents\ChatGPT\Sidekick\.output\chrome-mv3` (or `.output/chrome-mv3` under your checkout).
4. Reload existing ordinary HTTP/HTTPS pages to install their content script. Hover over the small left edge strip to open Sidekick.
5. Pin Sidekick's toolbar icon. Click it for Chrome's native side panel, including on restricted pages. The same settings view can restore a hidden overlay.

For development, `pnpm dev` runs WXT's Chrome development build. Use `pnpm zip` to generate a distribution archive. Production builds contain all scripts and styles locally; there is no backend, login, telemetry, remote code, or required network service. Favicons use the tab's provided image URL and fall back to a local icon when unavailable.

## Using the sidebar

- **Hover overlay:** delayed edge activation, delayed close, and cancellation when the pointer enters the sidebar. Focus within the sidebar keeps it open. Escape or Collapse dismisses it.
- **Pinned:** click Pin in the overlay to open Chrome's global native side panel. Chrome allocates space alongside the webpage and resizes its viewport. Drag Chrome's panel divider to resize it. The injected overlay and its edge strip are suppressed while the native panel is open. Unpin returns to Hover overlay. Closing the panel using Chrome's own × control also restores hover mode.
- **Hidden:** no expanded sidebar or automatic hover opening. A minimal edge button remains; click it to return to Hover overlay. The toolbar also provides access on supported and restricted pages.
- **Settings:** choose the mode, overlay width (240–440 px), opening delay (0–1500 ms), and closing delay (100–2000 ms). These existing preferences are retained across the update. The width slider affects only the hover overlay; native width belongs to Chrome.
- A saved Pinned preference suppresses the overlay on subsequent pages. Chrome requires a user gesture to open its panel, so click the edge button or toolbar if Chrome has not restored it after relaunch. The extension does not force a panel open on navigation or startup.
- Search open tabs by title or URL, activate a tab, close an individual tab, or create a new tab. The list covers the sidebar's window, with a total count, active indicator and loading spinner. Destructive tab actions require a direct button click; there is no automatic closing or moving of tabs.
- Personal is the initial workspace. The selector changes the active workspace and its favorites/pinned entries. Workspace selection does not yet hide, group, move, or filter tabs.
- Add, edit or remove workspace shortcuts in Favorites. Open Chrome bookmarks from the footer folder button, expand folders or search, then click a star to copy a bookmark into the active workspace. Chrome's bookmark hierarchy stays separate and unchanged. Bookmarklets and unsupported schemes are disabled.
- New tabs open the Sidekick dashboard: the same workspace selector, favorites, address/search field, active-window tabs, settings and immersive controls. Chrome can ask you to confirm the New Tab change; accept it to use this page. Other New Tab extensions can override it.

## Immersive mode and navigation

Click **Enter Immersive** in Sidekick or on its New Tab page. Chrome hides its native tab strip and toolbar using `chrome.windows.update` fullscreen. Hover at the left edge on ordinary webpages, or Pin the sidebar for Chrome-managed space beside the page. The native panel was validated in a real fullscreen Chrome window; no website margins, padding or content wrappers are changed. If Pin fails, use **Use hover sidebar** in the error notice or choose Hover overlay in Settings. Hover temporarily covers part of the page; collapse it to reach content underneath.

Click **Exit Immersive** to restore that window's previous normal or maximized state. **F11** (or **Fn+F11**) is the browser-level recovery path even when Sidekick is disabled or reloaded. Disabling the extension does **not** leave fullscreen automatically. On Windows, moving to the top edge may also reveal Chrome's own exit control, but it is not Sidekick's primary recovery path.

| Shortcut     | Action                                             |
| ------------ | -------------------------------------------------- |
| Alt+Shift+L  | Reveal Sidekick and focus/select its address field |
| Alt+Shift+S  | Reveal Sidekick                                    |
| Alt+Shift+E  | Exit immersive mode                                |
| F11 / Fn+F11 | Chrome's independent fullscreen toggle             |

Check assigned shortcuts at `chrome://extensions/shortcuts`; browser/OS conflicts may leave them unassigned. On restricted pages the reveal/focus commands open the native panel; click its address field if focus remains in Chrome. Shortcuts require the extension to be enabled. The F11 browser accelerator requires a physical/manual check; Playwright key injection did not trigger it here.

The compact navigation header includes current title/favicon/loading, back, forward, reload/stop, new tab, close current tab, copy URL and an address/search field. Explicit HTTP/HTTPS URLs and domains navigate through Chrome's tab APIs; text searches use Google. Bare domains use HTTPS; type `http://localhost:3000` for a local HTTP server. Only a small allowlist of Chrome pages is accepted (`newtab`, `settings`, `history`, `bookmarks`, `extensions`, `downloads`). Script/data/file/extension schemes, credential URLs and control characters are rejected. Stop uses the existing content script's `window.stop()` because Chrome has no tabs.stop API. It is unavailable on restricted pages or sites where extension access is withheld; use Chrome's toolbar or Escape. Clipboard access depends on the page and browser policy; if blocked, Sidekick selects the current URL for Ctrl+C.

Fullscreen state belongs to each window. A session-only return state survives MV3 worker suspension/restart. Window bounds/focus events and client reconnection reconcile external fullscreen changes, including manual F11 exits. Installation and startup never request fullscreen. Browser restart or extension reload clears the return-state session; if Chrome independently retains fullscreen, Sidekick detects it and Exit safely restores **normal** when the former state is unknown. Refresh old website tabs after extension reload, or press F11 immediately if controls are unavailable. Minimized, popup/app and managed locked-fullscreen windows do not support entering this mode. Site-requested fullscreen, incognito, kiosk/enterprise policies, macOS and Linux are not validated.

## Architecture

| Location                                                    | Responsibility                                                                                                       |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `entrypoints/background.ts`                                 | Single owner of Chrome tab APIs and persistent writes; synchronous MV3 event registration; native panel behavior     |
| `entrypoints/content/`                                      | Top-frame HTTP/HTTPS content script; WXT Shadow Root UI and context cleanup                                          |
| `entrypoints/sidepanel/`                                    | Native Side Panel entrypoint using the shared UI                                                                     |
| `entrypoints/newtab/`                                       | Supported Chrome New Tab override, using shared components and repositories                                          |
| `lib/immersive.ts`, `lib/navigation.ts`, `lib/bookmarks.ts` | Per-window fullscreen controller, safe navigation and read-only bookmark projection                                  |
| `ui/`                                                       | React sidebar, settings, icons, isolated styles and hover timer controller                                           |
| `lib/client.ts`, `lib/protocol.ts`                          | Typed requests, runtime command validation, subscriptions and disconnect recovery                                    |
| `lib/models.ts`, `lib/repository.ts`                        | Workspace schema, local metadata repository, session-only browser handle repository and future integration contracts |
| `lib/tabs.ts`, `lib/store.ts`                               | Pure tab transformations/reducer and Zustand UI state                                                                |

The service worker queries tabs on relevant Chrome events, then sends current-window snapshots to connected views. Queries are serialized/coalesced while busy, so an earlier asynchronous result cannot overwrite newer tab state. Created, updated, removed, activated, moved, attached, detached and replaced events are handled. There is no tab polling or worker keep-alive heartbeat. Disconnected clients retry with bounded exponential backoff, wake the worker and request fresh state. Each command revalidates the target tab's window; stale handles fail visibly instead of affecting another window.

WXT `createShadowRootUi` with `cssInjectionMode: 'ui'` contains styles in a closed shadow root, preventing ordinary host-page scripts from traversing rendered tab titles and URLs. Closed shadow DOM is encapsulation, not a general security boundary against browser debugging or privileged extensions. The host is a fixed, zero-size child of the document element, outside the body's transformed or clipped containing block. Scoped inline host styles protect positioning without changing website styles or geometry. Pixel-based sizing and Tailwind spacing avoid host `rem` scaling. Click and keyboard events are isolated; reduced-motion preferences are honored. A small observer watches only document/root children and remounts on root replacement or host removal. Body replacement and SPA navigation leave the host intact. Invalidation unmounts React and disposes ports, observers and timers.

### Persistence and future work

`sidekick.metadata.v1` in `chrome.storage.local` stores UUID workspace identities, the active workspace, favorites, pinned entries, nested folders, preferences and optional preferred email metadata. The background restricts local storage access to trusted extension contexts. Read/modify/write operations run through one queue to prevent lost updates. Invalid or unsupported metadata is preserved and reported, never silently reset. Schema migration is required before introducing another schema version.

Tab IDs, window IDs and group IDs are browser-session handles, not persistent identities. `SessionRepository` is a foundation for `chrome.storage.session` and is intentionally unused until workspace grouping is implemented. Future callers must reconcile handles against live tabs after events and extension reloads. `WorkspaceSwitcher` defines a future single-window grouping boundary; no `tabGroups` permission is requested yet. A browser restart clears session storage.

`SecretProvider` is an interface only. There is no sensitive storage implementation, key field, encryption claim, password/cookie/token access, or Jev integration. Any later key store must be separate from workspace metadata and reviewed when implemented.

### Permissions

| Permission/match                                   | Why it is needed                                                                                                 |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `tabs`                                             | Read titles, URLs and favicons across tabs, including pages that cannot host the overlay; search and render them |
| `storage`                                          | Save preferences and workspace metadata locally; reserve session storage for ephemeral membership                |
| `sidePanel`                                        | Provide Chrome's native fallback UI and toolbar action                                                           |
| `bookmarks`                                        | Read/search Chrome bookmark folders and copy chosen URLs into separate workspace favorites; no bookmark writes   |
| `http://*/*`, `https://*/*` content-script matches | Automatically render the sidebar on ordinary webpages without requiring a click on every navigation              |

There are no separate host permissions, `scripting`, `activeTab`, `tabGroups`, cookies, history, webRequest, identity, clipboardRead or unlimitedStorage permissions in the production manifest. Fullscreen and commands require no additional permission. The broad content-script matches still cause Chrome's site-access warning and are necessary for automatic hover activation across ordinary websites. Only the top frame is injected; Web Store pages are excluded. Native Chrome UI, other extensions, file URLs, PDFs rendered by Chrome, and other restricted contexts require the native panel, Sidekick New Tab or F11 recovery. Chrome controls native panel placement and availability. Its panel still needs a user gesture to open.

## Checks

```powershell
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
pnpm build
# All of the above in order:
pnpm check

# Install a separate browser once, then load and test the unpacked build:
pnpm exec playwright install chromium
pnpm test:browser
# A separate real-window check verifies native panel viewport resizing:
pnpm test:browser:headed
```

`pnpm format` applies formatting. Unit tests cover storage initialization, concurrent updates, failures, model validation, folder cycles, session separation, tab reducer/search, restricted metadata, message validation, and hover timing. Browser tests use a temporary isolated Chromium profile, a local HTTP server and the real built extension; they never use your normal browsing profile. Run `pnpm build` before browser tests. Chromium is used because branded Chrome restricts command-line unpacked-extension loading.

See [Milestone 1.2 verification](docs/milestone-1.2.md) for current executed checks, screenshots and remaining manual checks. [Earlier verification](docs/verification.md) records Milestone 1. No manual test is implied by an automated result.

## Known milestone limits

Full workspace grouping/switching, workspace creation UI, pinned-item authoring, workspace folder editing, email account behavior, Jev and secrets storage are future work. Existing pinned metadata is readable/openable; shortcut editing is implemented for favorites. Preferred email is metadata only. Native panel chrome and placement are browser-controlled. Some sites can cover the overlay with top-layer elements or transform the document element itself. Existing pages require reload after extension installation/update; an invalidated content script cannot reconnect until that reload. Incognito has not been validated. Browser-managed restrictions cannot be bypassed.

## Updating an installed copy

Run `pnpm install --frozen-lockfile`, `pnpm check`, and optionally `pnpm test:browser` / `pnpm test:browser:headed`. In `chrome://extensions`, click **Reload** on the existing Sidekick card. Keep the same unpacked directory and extension ID; do not remove/reinstall or clear storage. Refresh existing HTTP/HTTPS tabs to replace invalidated content scripts. If your saved mode is Pinned, click the toolbar or pinned edge button to open the native panel. Workspace metadata and sidebar preferences retain their existing storage schema; the update does not move or close user tabs.

## Panel compatibility and website access

The Chrome minimum stays at 116 (`sidePanel.open` and `runtime.getContexts`). Pin runs synchronously inside the background message handler to preserve the click gesture. `sidePanel.close` is used when available (Chrome 141+); `onOpened` and `onClosed` are feature-detected (141+ and 142+). Earlier versions use verified native-document subscriptions and context reconciliation. If programmatic close is unavailable, Unpin shows an instruction to use Chrome's × control and keeps the overlay suppressed until the panel closes. No tab-specific panel configuration is installed; the global panel stays available across normal, New Tab and internal pages. See [Chrome's API reference](https://developer.chrome.com/docs/extensions/reference/api/sidePanel).

`lib/panel-service.ts` coordinates opening, closing and mode persistence. `lib/window-state.ts` stores per-window search, panel presence and native document handles in session storage. Both renderers consume the same background snapshots, workspace repository and tab actions; they do not maintain separate search or tab business logic. Session state survives worker restart and clears with the browser session. The last chosen display preference remains local metadata shared across windows; other windows in saved Pinned mode offer a click-to-open edge button when their native panel is not open.

The existing HTTP/HTTPS match patterns already include Google Search, Gmail, Drive, YouTube, GitHub, example.com and their subdomains. No extra host permissions are added. Check **Sidekick → Details → Site access** and grant the intended sites; refresh the page after granting access. Withheld site access, enterprise policy, a not-yet-refreshed extension update, and browser-restricted URLs are distinct from a mount failure. New Tab uses a supported extension page override, so it does not need a content script.

See [Milestone 1.1 results](docs/milestone-1.1.md) for root causes, automated coverage and the limits of signed-out live-site checks.
