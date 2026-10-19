# Sidekick

A compact Chrome workspace sidebar. M1.3 adds a reversible custom **left dock**, workspace Favorites, Pinned folders, workspace editing and themes, and a shared sidebar on the Sidekick New Tab page. WXT + React + strict TypeScript, Chrome Manifest V3. No backend or Jev integration.

## Build and load

Use Node 22.12+ (Node 24 recommended), pnpm 11.20.0 and Chrome 116+.

```powershell
pnpm install --frozen-lockfile
pnpm check
pnpm test:browser
pnpm test:browser:headed
pnpm zip
```

In `chrome://extensions`, enable Developer mode and load `.output/chrome-mv3`. On updates, click Reload on the existing card and refresh existing website tabs. Keep the same unpacked folder and extension ID; do not clear storage. Open a new tab to see Sidekick's dashboard. Chrome may ask you to accept the New Tab change; another New Tab extension or policy can override it.

## Sidebar modes

- **Hover overlay:** reveal from the left edge; temporarily covers the website. Focus keeps it open. Collapse or Escape dismisses it.
- **Docked:** click Dock sidebar. The same custom sidebar stays on the left while a compatible page's document flow narrows. Click Undock to return to hover. Sidebar width is adjustable from 240–440 px, initially 320 px; existing widths are retained.
- **Hidden:** the sidebar closes and leaves the small edge trigger. Clicking the trigger restores it.
- **Native fallback:** the globe button or Chrome toolbar action opens Chrome's side panel for restricted pages. This is separate from custom Dock. While a native panel is open, the website sidebar is suppressed. Unpin or Chrome's panel close control returns to hover.

Docking does not resize Chrome's actual viewport. CSS media queries and JavaScript `window.innerWidth` still see the browser viewport. The controller narrows document flow, remaps viewport-fixed controls, constrains viewport-width elements and preserves scrolling. It records original property values/priorities and Chromium-normalized applied values for reliable undo, including fractional pixels. It does not wrap, reparent or transform website content.

YouTube Home has a targeted containing-block adapter for its absolute app canvas; other YouTube layouts fall back until verified. Incompatible document transforms/RTL/root sizing, new horizontal overflow, complex pages and windows leaving less than 480 px of page space decline docking and show a reason plus Hover/Retry actions. Site layers, frames, JavaScript sizing, sticky/fixed layouts and future site changes can still need an adapter. See the [M1.3 verification and limitations](docs/milestone-1.3.md).

## Workspaces and resources

Use the workspace plus button to create one, or its settings button to rename it, change icon/color/theme, and add an optional email label. Switching selects that workspace's independent Favorites, Pinned entries and folders immediately. Selection and metadata survive reload/restart. The email is a label; it does not switch accounts or isolate cookies.

**Favorites** form a compact favicon grid. Star the current tab or add a URL. Click a favorite to activate a matching tab in the same window, or open it. Right-click or use its ellipsis to edit/remove/move it to another workspace. Drag tiles to reorder; Move earlier is a keyboard alternative. Repeated saves are deduplicated by workspace and normalized URL; repeated opens are serialized to avoid duplicate tabs.

**Pinned** stores durable entries separate from Chrome's global pinned-tab flag. Pin the current tab, add a URL, or drag a Today tab into Pinned. Create nested folders; expand/collapse, rename and move entries between folders or workspaces. Drag pinned rows to reorder or back into Today to unpin and open/activate the page. A closed pinned page can be reopened. Unpin removes the Sidekick entry, not the live Chrome tab. Nonempty folders must be emptied before removal. Entries are never automatically archived or discarded.

Chrome bookmarks remain a separate read-only tree with folder browsing, search and opening. Stars copy selected bookmarks into workspace Favorites; they do not change Chrome's bookmark hierarchy. Unsafe bookmark schemes are disabled.

The New Tab page uses the same Sidebar/Favorites/Pinned components and background state, with one sidebar, a prominent address/search field, active-window tabs, workspace resources, settings, and light/dark/system themes. It uses an owned responsive layout rather than injecting another website sidebar. Hidden mode retains its edge trigger. At narrow widths its layout adapts to avoid horizontal clipping.

## Navigation and immersive mode

Sidekick offers address/Google search, back/forward, reload/stop, new/close tab, copy URL, title/favicon and loading status. HTTP/HTTPS addresses and domains are supported; bare domains use HTTPS. Script/data/file/extension schemes, credential URLs and controls are rejected. Supported internal pages are newtab/settings/history/bookmarks/extensions/downloads.

Stop uses the existing early content script's `window.stop()`; it cannot stop restricted pages or pages without site access. Use Chrome's toolbar/Escape there. Clipboard failures select the actual current URL for Ctrl+C. Local metadata and the New Tab UI work offline; remote favicons may fall back to letters.

Enter Immersive uses Chrome fullscreen. Exit restores that window's prior normal/maximized state. **F11 / Fn+F11** is Chrome's independent recovery path, including after Sidekick is disabled. Disabling Sidekick does not exit fullscreen.

| Shortcut     | Action                                |
| ------------ | ------------------------------------- |
| Alt+Shift+L  | Reveal/focus Sidekick's address field |
| Alt+Shift+S  | Reveal Sidekick                       |
| Alt+Shift+E  | Exit immersive mode                   |
| F11 / Fn+F11 | Chrome fullscreen toggle              |

Check assignments at `chrome://extensions/shortcuts`. Physical OS shortcut dispatch/F11 remain manual checks. Restricted-page commands open the native fallback; Chrome may retain keyboard focus until you click its field. Worker restarts preserve return state. Browser restart/extension reload clears session return state; Exit falls back to normal when it is unknown. Startup never enters fullscreen.

## Architecture and storage

| Module                                          | Responsibility                                                                           |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `entrypoints/background.ts`                     | Chrome actions, typed messaging, subscriptions and serialized storage ownership          |
| `lib/docking.ts`, `lib/dock-adapters.ts`        | Reversible document-flow docking and verified site adapters                              |
| `lib/resources.ts`, `lib/resource-service.ts`   | Resource identity/order/deduplication and optional live-tab matching                     |
| `lib/repository.ts`, `lib/models.ts`            | Validated metadata, atomic mutations and additive migration                              |
| `ui/`                                           | Shared compact sidebar, resource editors/menus, folder trees, workspace editor and theme |
| `entrypoints/newtab/`, `entrypoints/sidepanel/` | Owned dashboard and restricted-page fallback                                             |
| `lib/immersive.ts`, `lib/navigation.ts`         | Window recovery and safe browser navigation                                              |

The existing `sidekick.metadata.v1` key/schema is preserved. An additive `layoutVersion: 2` marker migrates legacy native-Pinned display preferences once to custom Docked, retaining widths, resource IDs, folders, workspace identity and all existing metadata. Explicit native-fallback choices after migration stay native. Invalid/unknown data is preserved and reported. Workspace IDs and resource IDs are stable UUIDs. Browser tab/window/document handles stay session-only.

Ports reconnect with bounded backoff; tab changes use Chrome events, not polling. Dock mutations are coalesced and ignore unrelated style animation changes. Closed shadow DOM contains website UI styling; it is encapsulation rather than a security boundary against privileged debugging. Invalidation cleans up subscriptions, layout styles and the injected host.

Permissions stay `storage`, `tabs`, `sidePanel`, `bookmarks`, with top-frame HTTP/HTTPS content-script matches. No new permissions or dependencies were added. No cookies/history/passwords, scripting/debugger permission, backend, remote code, telemetry or account integration.

## Verification and remaining scope

`pnpm check` runs type checking, lint, formatting, unit tests and production build. `pnpm exec playwright test` runs both browser projects against isolated temporary profiles; install the separate test browser once with `pnpm exec playwright install chromium`. Production files must be built before browser tests.

See [M1.3 results, screenshots and manual checklist](docs/milestone-1.3.md). Prior reports remain historical: [M1](docs/verification.md), [M1.1](docs/milestone-1.1.md), [M1.2](docs/milestone-1.2.md).

Physical tab/group isolation, cookie isolation, advanced pinned URL reset/Peek, Jev and password management are not implemented. Workspace selection organizes resources, not Chrome's physical tab groups. Signed-in Gmail/Drive, normal Google results, other YouTube views, incognito, other operating systems and enterprise-managed restrictions need separate validation.
