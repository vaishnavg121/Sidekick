# Validation and acceptance ledger

Release branch: `codex/master-build`, version 0.2.0 beta. Started from fetched `origin/main` `67089b4f007d745c11fb839e9e2f8ec17854a82f`. Final results are recorded below after rerunning affected checks. This is automated real-Chrome testing plus model inspection of rendered screenshots, not a claim of human manual testing.

## Repeatable checks

`pnpm check` runs typecheck, ESLint, Prettier, Vitest and production build. `pnpm exec playwright test` runs disposable Chromium profiles. Ordinary scenarios use the headless project; fullscreen/reload recovery run only in the headed project rather than producing recurring headless skips. No failed behavior is excused by increasing timeouts.

Current unit gate: **127 tests in 16 files**, including **39 new tests** over the baseline 88. Coverage includes ownership/windows/lifecycle, trusted reorder, resource/folder integrity, palette ranking, realistic Gateway contracts/errors, alarm reminders, sessions/archive/backup and malformed imports/settings. The final complete Chrome gate passed **33/33 tests, 0 failed, 0 skipped** in 2.2 minutes on Chrome for Testing **156.0.8078.4**. Production type/lint/format/build gates passed.

## Diagnoses and corrections

- Workspace membership was disconnected from runtime. Implemented the shared serialized engine and actual moves without pinning/reloading.
- Delayed programmatic activation events could undo later workspace selection. Centralized activation tracking for select/move/open/create.
- Startup URL hints could adopt newly created tabs. Limited recovery to startup and stopped it on explicit workspace operations; ordinary new tabs inherit their window.
- A drop could run against old component state immediately after changing the select. Exposed authoritative workspace readiness and temporarily disabled resource/tab drag targets during a pending switch; tests await the actual workspace marker.
- Hover could close during a headed transition before a click became stable. Manual reveal now survives initial transition; fullscreen transitions preserve access.
- Reload navigation test waited for the old document's completed load. It now waits for the actual new DOMContentLoaded event.
- Old footer/global-tab/New Tab assumptions were updated to the required behavior. A drag fixture now actually assigns the tab to its claimed source workspace.
- CDP synthetic Alt+Shift+K does not invoke Chrome's browser accelerator here. Native-input smoke launch succeeded, but Windows app-access approval timed out; the native script cleaned up after its bounded wait. Physical shortcut dispatch remains BLOCKED. Registration and palette UI keyboard actions are tested separately.
- Stress fixtures account for Chromium's initial blank tab and scope result queries to the palette's listbox.

## Performance evidence

Real Chrome tab-count fixtures use blank tabs, not heavy web applications. One completed run measured:

| Additional tabs | Tab filter to UI | Palette input to result |
| --------------- | ---------------- | ----------------------- |
| 10              | 47 ms            | 13 ms                   |
| 50              | 7 ms             | 22 ms                   |
| 100             | 11 ms            | 30 ms                   |
| 210             | 22 ms            | 49 ms                   |

Other repeated runs varied (210: 40/103 ms and 47/99 ms). This is measured fixture evidence, not a universal latency guarantee or a claim that heavy app memory use was benchmarked. Per-window snapshot reuse, event coalescing, bounded hashes/cache and unchanged-write suppression reduce redundant work without changing ownership semantics.

## Product acceptance (isolated profiles)

| Step                                                                           | Status / evidence                                                                                         |
| ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| Load MV3 extension and ordinary pages                                          | PASS: browser initialization and strict-CSP fixtures                                                      |
| Three workspace definitions and independent resources                          | PASS: Personal/Development/Entertainment and separate Research scenarios                                  |
| Switch workspaces; keep tabs alive without duplicates/reloads                  | PASS: four-page load-token assertions, repeated switching                                                 |
| Move live tabs across workspaces                                               | PASS: real UI drop + ownership/count assertions                                                           |
| Two windows independently selected                                             | PASS: separate window state assertions                                                                    |
| Favorites CRUD/reorder/moves                                                   | PASS: M1.3 browser regressions and trusted unit mutations                                                 |
| Pinned CRUD/unpin/reopen without native pin changes                            | PASS: M1.3 browser regressions                                                                            |
| Nested folders/reorder/subtree moves/cycles                                    | PASS: rendered folder flow + atomic integrity tests                                                       |
| Today reorder uses Chrome indices/constraints                                  | PASS: runtime unit/API movement and browser tab movement                                                  |
| Command palette search/actions                                                 | PASS: dedicated unit ranking and UI Enter/navigation                                                      |
| Palette focus/arrows/Tab/Escape                                                | PASS: browser combobox/selection/focus assertions                                                         |
| Chrome-managed default assignments                                             | PASS: real `chrome.commands.getAll()` + four-default manifest                                             |
| Physical shortcut/F11 dispatch                                                 | BLOCKED: CDP accelerator limitation; native Windows app approval timed out                                |
| Mocked Gateway classification/routing/grouping                                 | PASS: real worker HTTP interception + UI review assertions (final run)                                    |
| Per-workspace Focus and Show All                                               | PASS: actual UI and persisted preferences                                                                 |
| Live authorized Jev inference                                                  | BLOCKED: no authorized live key supplied                                                                  |
| Snooze/ready/restore/cancel                                                    | PASS: actual alarm + Library UI, deterministic unit recovery                                              |
| Optional OS notification delivery                                              | NOT TESTED: user permission/device notification check remains                                             |
| Save/rename/select/restore/delete URL sessions                                 | PASS: Library UI + non-duplicating restore + mutation tests                                               |
| Archive/search/restore/delete                                                  | PASS: Library UI and guarded persistence tests                                                            |
| Export/download and invalid/previewed import                                   | PASS: real file UI + validation/merge tests (final run)                                                   |
| Extension reload                                                               | PASS: headed recovery + style cleanup/persistent resources                                                |
| Worker restart                                                                 | PASS: execution-context restart and membership/resource state                                             |
| Full browser restart with changed handles                                      | PASS: actual relaunch with Chrome session restoration and fingerprint reconciliation                      |
| Offline/no-key operation                                                       | PASS: repeated real offline resource edit, extension-page reload and palette search; no owned-page errors |
| Invalid operations and stale IDs                                               | PASS: negative unit tests and browser window-boundary checks                                              |
| Original Chrome New Tab unchanged                                              | PASS: manifest and actual New Tab browser assertions                                                      |
| Restricted pages/native fallback                                               | PASS: no content host on restricted pages; real native-panel target tests                                 |
| Unhandled console errors across all product paths                              | NOT TESTED as a universal assertion; test failures are recorded individually                              |
| Light/dark, nested resources, drag state, palette/settings/empty/error visuals | Rendered screenshots reviewed; gallery below                                                              |

No signed-in Gmail/Drive, ordinary Google results, other OS/incognito/enterprise, minimum Chrome-version matrix or assistive-screen-reader certification is claimed. Existing docking adapters are conservative. Accessibility checks cover labels, selection/focus, keyboard paths, primary theme styling and reduced motion; no complete WCAG conformance certification is made.

## Requested 30-step end-to-end acceptance

| #   | Requested step                           | Result and scope                                                                                              |
| --- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| 1   | Load extension                           | PASS: actual MV3 worker and rendered pages                                                                    |
| 2   | Create three workspaces                  | PASS: independent definitions and selection                                                                   |
| 3   | Open tabs in workspaces                  | PASS: four live fixture pages                                                                                 |
| 4   | Switch workspaces                        | PASS: scoped lists and last-used page activation                                                              |
| 5   | Verify tabs remain alive                 | PASS: unchanged page load tokens across workspace switches                                                    |
| 6   | Add workspace Favorites                  | PASS: current/custom URLs, independent workspace persistence                                                  |
| 7   | Pin resources                            | PASS: durable entries independent of native Chrome pins                                                       |
| 8   | Create nested folders                    | PASS: nested UI, rendered drops and atomic subtree mutations                                                  |
| 9   | Reorder tabs and resources               | PASS: real Chrome indices and resource/folder order constraints                                               |
| 10  | Drag tabs between workspaces             | PASS: UI drop, actual membership, unchanged load tokens                                                       |
| 11  | Drag Favorites/Pinned between workspaces | PASS: trusted resource move/drop regressions                                                                  |
| 12  | Command Palette navigation/actions       | PASS: ranked search, Enter and navigation                                                                     |
| 13  | Available shortcuts                      | PASS: Chrome registration and UI keyboard; physical accelerator dispatch BLOCKED by native app-access timeout |
| 14  | Enter/exit Focus                         | PASS: mocked worker HTTP plus actual UI and preferences                                                       |
| 15  | Valid mocked AI recommendations          | PASS: real worker contract, accepted routes/categories/groups                                                 |
| 16  | Live authorized Jev                      | BLOCKED: no authorized live key supplied                                                                      |
| 17  | Snooze/scheduled behavior                | PASS: real alarm and retained ready entry; optional OS notification delivery NOT TESTED                       |
| 18  | Save workspace session                   | PASS: named URL snapshot                                                                                      |
| 19  | Restore session                          | PASS: selected URL restore without duplicate batches                                                          |
| 20  | Archive/restore resource                 | PASS: search and restore with persistence                                                                     |
| 21  | Export/validate safe import              | PASS: downloaded JSON, malformed rejection, preview and independent copies                                    |
| 22  | Reload extension                         | PASS: headed reload and persistence recovery                                                                  |
| 23  | Restart MV3 worker                       | PASS: execution context and membership recovery                                                               |
| 24  | Browser restart                          | PASS: actual relaunch, changed handles and conservative reconciliation                                        |
| 25  | Second Chrome window                     | PASS: independent per-window selections                                                                       |
| 26  | Consistent workspace data                | PASS: authoritative snapshots and persistence assertions                                                      |
| 27  | No unexpected loss/duplication/reload    | PASS: scoped fixture token/count assertions; not a guarantee for every website                                |
| 28  | No unhandled console errors              | PASS in instrumented offline/package paths; universal product-path assertion NOT TESTED                       |
| 29  | Original Chrome New Tab                  | PASS: manifest and real New Tab assertions                                                                    |
| 30  | Final visual review                      | PASS: model inspection of actual screenshots, not human manual certification                                  |

## Live Jev smoke test

1. Load the same unpacked extension ID. Open secure AI settings from the toolbar panel/dashboard. Use your own Vercel Gateway key; do not paste it in an issue or chat.
2. Verify & Connect. This makes a potentially billable small Boolean request. Confirm Connected or an actionable authorization/quota/network error.
3. Create two workspaces and a few non-sensitive fixture tabs. Analyze workspace tabs; inspect independent category/route/group results and returned selected-option probabilities.
4. Accept one category and route. Verify a tab moves membership while remaining live. Accept a group and verify native grouping without new pins.
5. Evaluate a Focus goal; inspect per-tab relevance, Keep/Hide and Show All. Switch workspaces and reload the worker to verify preferences.
6. Review cleanup without confirming until affected pages are understood. Closing archives URL copies but cannot restore unsaved forms/history.
7. Disconnect. Confirm normal palette/resources/Library remain usable. Export a backup and verify it contains no Gateway key.

## Gallery and final gate

Final production run: **127 unit tests / 16 files; 33 real-Chrome E2E tests; zero failed or skipped**. An earlier interrupted run encountered `ERR_NETWORK_IO_SUSPENDED`, a setup timeout and a headed panel-width failure. The unchanged-source final rerun passed every scenario, including those three; no timeout was increased or assertion removed.

The **239,042-byte** `.output/sidekick-0.2.0-chrome.zip` was extracted and installed in a new disposable Chrome profile. Manifest/files, workspace creation, palette focus and original Chrome New Tab passed with no unhandled page errors. SHA-256: `d7526be86042c87404df93cc8c51bc5a82aeab79ca84b0b7866413bd251d8098`. The package report is `.output/sidekick-package-verification.json`.

Eighteen final screenshots are committed, using synthetic fixture data. Model inspection confirmed the corrected AI rows, deduplicated palette, folder alignment and both themes. This is visual inspection of rendered images, not human manual testing or assistive-technology certification.

[Dark](screenshots/master-dark.png) · [Light](screenshots/master-light.png) · [Palette](screenshots/master-palette.png) · [AI](screenshots/master-ai.png) · [Docked](screenshots/master-docked.png) · [Sessions](screenshots/master-sessions.png) · [Snoozed](screenshots/master-snoozed.png) · [Archive](screenshots/master-archive.png) · [Settings](screenshots/master-settings.png) · [Empty](screenshots/master-empty.png) · [Drag target](screenshots/master-drag-target.png) · [Error](screenshots/master-error.png)

Package contents were reviewed: production HTML/JS/CSS and PNG icons only; no source maps, test fixtures, API keys, node_modules or local profiles. The icon SVG remains repository source outside the distributable.

## Before/after microbenchmark and security findings

`scripts/palette-benchmark.mjs` compares the fetched baseline implementation with current code using the same synthetic search index (2,000 queries per size after warmup). One run measured baseline/current milliseconds per query: 10 tabs 0.0257/0.0252; 50 tabs 0.0354/0.0334; 100 tabs 0.0500/0.0507; 210 tabs 0.0963/0.0929. These small differences are within ordinary microbenchmark variability; correctness improved without a material search regression. This is separate from actual browser UI timings.

Security review checked sender/window/source authorization, strict payloads, folder cycles, import references, safe URL schemes, protected storage, credential-free snapshots/backups, sanitized HTTPS requests/errors, DOM sinks and package permissions. No eval/dynamic Function/unsafe HTML sink or test credential/loopback endpoint was found in production sources. A development-only minimatch denial-of-service advisory ([GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249)) was patched with a scoped 11.0.1 override. Repeated production and full registry audits report zero known advisories; this is not a guarantee of absence of vulnerabilities.

## Final visual review corrections

Rendered screenshots exposed stale AI rows after ownership changes and duplicate shortcut/live-tab destinations in palette results. The final UI filters unavailable suggestions, retains distinct live sessions and suppresses redundant saved destinations. A dedicated unit assertion covers the deduplication rule. Folder labels were aligned, dashboard title corrected, and palette centering is asserted at 1280×800. Script-generated benchmark TypeScript is excluded from normal compilation along with other QA output directories.
