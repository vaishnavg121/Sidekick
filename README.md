# Sidekick

A compact, local-first Chrome workspace organizer. **0.3.0 beta** integrates logical tab workspaces, a custom left sidebar, Favorites, Pinned folders, a universal command palette, optional Jev suggestions, reminders, saved sessions, archive portable backups and Appearance Studio.

**Status: personal-use beta.** See [current acceptance results](docs/final-polish-results.md), [privacy](docs/privacy.md), [architecture](docs/architecture.md) and [store preparation](docs/release.md). No Chrome Web Store publication has been performed.

## Install or update

Requires Node 22.12+, pnpm 11.20.0 and Chrome 116+.

```powershell
pnpm install --frozen-lockfile
pnpm check
pnpm exec playwright install chromium
pnpm exec playwright test
pnpm zip
```

At `chrome://extensions`, enable Developer mode and load `.output/chrome-mv3`. On updates, Reload the existing Sidekick card, accept Chrome's new permission prompt if shown, and refresh existing website tabs. Keep the folder and extension ID; do not uninstall or clear storage. Package: `.output/sidekick-0.3.0-chrome.zip`.

Chrome's original New Tab is preserved. Open the dashboard from **Settings → Open Sidekick dashboard**. The toolbar button opens Chrome's native panel on restricted pages. Secure AI settings open in a dedicated extension tab.

## Workspaces

Each Chrome window selects its own active workspace. Each managed live tab belongs to one logical workspace. Today and palette tab results show only that workspace's tabs. Switching restores the last-used assigned tab where available, without reloading/closing other pages. Empty workspaces stay empty until you create or move a tab into them.

Manually activating a Chrome tab selects its assigned workspace. New tabs inherit their window's selection. Drag Today rows onto workspace icons or use tab actions to move them. Window transfers retain valid ownership. Delete a workspace only after moving its live tabs and saved data.

Worker suspension retains session handles. Reload/browser restart reconciles fresh IDs using bounded local URL-hash fingerprints; ambiguous identical URLs fall back conservatively. Sidekick does not reopen your whole browsing session automatically. Chrome controls startup restoration; saved sessions provide explicit URL recovery.

Workspaces share this Chrome profile, cookies and accounts. Email labels do not authenticate or isolate anything.

## Sidebar and resources

- **Hover:** reveal from the left edge; focus keeps it open. Collapse/Escape dismisses it.
- **Docked:** the same custom sidebar narrows compatible pages. Width is 240–440 px. Undock restores recorded styles; unsafe/narrow layouts offer Hover/Retry.
- **Hidden:** retain an edge trigger for reopening.
- **Native fallback:** toolbar/globe opens Chrome's panel and suppresses the website overlay while open.
- **Immersive:** fullscreen restores prior normal/maximized state on Exit. F11/Fn+F11 remains Chrome's recovery path. Disabling Sidekick does not exit fullscreen.

Favorites are durable shortcuts: current/custom URLs, edit/remove/reorder/archive and cross-workspace moves. Drag Today tabs into Favorites to save them. Opening a saved resource reuses a matching same-window live page where possible.

Pinned entries are Sidekick resources, separate from Chrome's native pinned flag. Create nested folders, reorder/collapse/expand, move entries into/out of folders and move folder subtrees across workspaces. Cycles and conflicting URLs are rejected without deleting data. Drag Pinned to Today to open/reuse a page and remove its saved pin. Folder deletion is empty-only. Keyboard alternatives are available through menus and editors.

Today supports activate/close/search/reorder, actions menus, workspace moves, pin/favorite/archive and snooze. Reorder uses actual Chrome indices and refuses native pinned/group boundaries. Arrow keys navigate rows. Chrome bookmarks remain a separate read-only tree.

## Palette and shortcuts

Search tabs, workspaces, saved resources, bookmarks and browser actions, or type a URL/search query. Exact/prefix/substring/fuzzy ranking runs locally. Arrow keys select, Enter executes, Escape closes and focus returns to the opener. Ordinary search never calls AI.

| Default     | Action          |
| ----------- | --------------- |
| Alt+Shift+K | Command palette |
| Alt+Shift+L | Address field   |
| Alt+Shift+S | Reveal sidebar  |
| Alt+Shift+E | Exit immersive  |

Next/previous workspace, new tab, focus tab search, organize with Jev, toggle Focus and toggle sidebar start unassigned. Settings shows actual assignments; change them at `chrome://extensions/shortcuts`. OS/Chrome conflicts can override keys. Physical accelerator dispatch remains a manual check; UI keyboard behavior is automated.

## Appearance Studio

Open Settings → Appearance Studio to choose seven presets or edit base/accent/secondary colors with a pointer/keyboard hue ring, saturation, brightness and hex entry. Customize solid/linear/radial fills, 2–5 gradient stops, blur, opacity, grain, borders, shadows, corners, density and motion. Changes preview inside Sidekick; Apply saves them. Workspace overrides take priority over global appearance, then existing workspace themes. Theme-only JSON export/import validates colors/ranges and rejects executable CSS. See the [full guide](docs/appearance.md).

## Optional Jev

Open secure AI settings, enter your Vercel AI Gateway key and Verify & Connect. Verification makes a small potentially billable request; analysis runs when you ask. Disconnect removes the key and clears the in-memory cache. Keys stay in trusted extension storage and never appear in website/sidebar snapshots, exports or logs.

Jev (`typesafe-ai/jev`, `POST https://ai-gateway.vercel.sh/v1/evaluate`) evaluates selected titles/domains, workspace names and your Focus goal. Paths, queries, fragments and page contents are not sent. Titles/goals can themselves contain sensitive information; choose carefully. Provider retention/billing follow their terms.

Review categories, routes, related groups, Focus relevance and cleanup before accepting. Categories persist by URL. Routing changes actual membership; grouping creates native Chrome groups without pinning ordinary tabs. Focus preferences are workspace-specific; raw hidden IDs stay session-only. Show All/Exit Focus remains available. Cleanup requires explicit confirmation and archives URL copies first, which cannot restore unsaved forms/history.

**Live inference is blocked by Gateway authentication.** The authorized local-key smoke test stopped after one rejected connection request; no inference followed. See the [feature-by-feature live report](docs/jev-live-verification.md). Deterministic Chrome tests cover HTTP contracts and accepted state changes separately. `pnpm test:live` performs no request unless `SIDEKICK_LIVE=1`; its durable 25-request campaign remains halted after authorization failure.

## Library and recovery

- **Snoozed:** choose a date/preset from a tab menu. Keep the tab open by default, or explicitly close it after saving. MV3 alarms mark reminders ready; Library/toolbar badge retain them until restored/cancelled. Optional OS notifications require permission. Sleeping Chrome/devices can delay reminders. Restore is explicit.
- **Sessions:** save supported workspace URLs, rename/delete snapshots, select pages and restore. Serialized URL matching avoids duplicate batches.
- **Archive:** keep a tab URL copy without closing it, or archive a saved resource. Search, restore or explicitly delete entries. Automatic archival is off.
- **Backup:** export JSON, preview and confirm independent workspace copies. Existing preferences/data stay intact. Keys, AI/session state and fingerprints are excluded. Common sensitive query fields are removed. Saved titles/URLs/email labels can still be private—inspect before sharing.

## Known limits and development

Docking cannot universally reflow arbitrary websites or change viewport/media queries. YouTube's Home adapter is narrow; unsupported views use Hover. Signed-in Gmail/Drive, ordinary Google results, incognito, other OSes and enterprise policies need separate validation. Identical URLs with conflicting ownership cannot always be reconciled after browser restart. URL restores do not recover full page sessions. Native notifications and physical shortcuts require a device/human check.

Tests use disposable Chrome profiles and deterministic fixtures. Ordinary tests run headless; fullscreen/recovery run headed. `pnpm check` covers types, lint, formatting, unit tests and production build. A scoped pnpm override patches the development-only minimatch advisory without adding runtime dependencies.

[Current checklist](docs/final-polish-checklist.md) · [Current results](docs/final-polish-results.md) · [Historical implementation ledger](docs/master-build.md) · [Architecture](docs/architecture.md) · [Testing](docs/testing.md) · [Release](docs/release.md) · [Changelog](CHANGELOG.md)

Gateway authentication follow-up: the updated local key received **HTTP 403** on its single authorized retry. Campaign halted at **2/25**; all five live Jev workflows remain blocked. [Current diagnosis and safe resume](docs/jev-authentication-followup.md).
