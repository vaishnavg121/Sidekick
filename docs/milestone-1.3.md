# M1.3 — Custom docking and sidebar essentials

Implemented and checked on Windows on 19 October 2026, with Chrome for Testing 156.0.8078.4, Playwright 1.64.1, WXT 0.21.4 and pnpm 11.20.0. Production version: **0.1.3**. No new dependencies or permissions.

## Diagnosis before changes

The previous implementation did not have a custom webpage docking controller. `ui/Sidebar.tsx` rendered an injected hover overlay or the shared native-panel view. Its Pin action called `panel.pin`; `PanelService` opened `chrome.sidePanel`, saved the native-Pinned preference and suppressed the injected left sidebar. `entrypoints/sidepanel/` rendered the native view. Chrome chose the native panel's placement.

The content script styled only its zero-size shadow host. It did **not** change the website's margins, padding, transform or root width. There were no custom offsets to restore on undocking. Thus the previous approach could resize the viewport through Chrome's native panel, but could not keep the same injected sidebar docked on the left as required.

A headed baseline probe reproduced this before production changes: Pin created **one native panel**, hid the custom sidebar, and left the website document at **x=0**. The resulting page viewport was 880 CSS px. The baseline screenshots are retained separately from the corrected screenshots. This was an interface/architecture mismatch, rather than an accumulated custom margin bug.

## Corrected docking

`lib/docking.ts` owns a reversible document-flow strategy:

- Reserve the configured left width by narrowing and offsetting the document root. New installs start at 320 px; existing widths are retained. Recompute on width/window changes and relevant document mutations.
- Preserve the page's existing scrolling owner and DOM hierarchy. No wrappers, reparenting, page transforms, iframe replacement or synthetic browser resizing.
- Remap viewport-fixed controls separately, retain small controls' dimensions, and constrain viewport-width elements, including elements below the fold. Sticky elements retain their scrolling ancestor.
- Keep a property ledger with original values/priorities and the **normalized value Chrome actually applied**. This matters at Windows' fractional pixel scaling: comparing unrounded DOMRect strings left residual styles in a headed check. The corrected ledger restores them reliably.
- On undo, restore owned properties while preserving newer website inline edits. Restore original attribute serialization when the normalized properties still match the original snapshot. Repeated dock/undock does not compound offsets.
- Refuse unsafe root transforms/RTL/sizing, excessive document complexity, newly introduced horizontal overflow, or windows leaving less than 480 px for the page. Restore the original layout before displaying an explanatory Hover/Retry fallback.
- Coalesce relevant mutations into animation frames; ignore unrelated style animations. Invalidation removes the injected host and releases layout styles. Real Chrome reload recovery was tested on an actually docked website, not just on an extension page.

The custom Dock button never opens Chrome's native panel. The globe/toolbar action remains a separate, labeled restricted-page fallback. A native panel suppresses the custom website sidebar so both are not displayed together.

Chrome's actual `window.innerWidth` and CSS media-query viewport remain unchanged. Document reflow cannot universally replace a native browser viewport resize. Rigid JavaScript canvases, frames, root containing blocks, top-layer elements and future app changes can still require adapters or Hover mode.

### YouTube adapter

Screenshot review caught a problem that simple document bounds did not: YouTube's absolute app canvas stayed anchored to the full viewport, despite the document root being narrowed. Its content overlapped the left sidebar/guide.

`lib/dock-adapters.ts` supplies a reversible relative containing block for the verified **active YouTube Home** canvas. At 1000 px, the page manager moved from **x=72 to x=392**, correctly accounting for Sidekick's 320 px and YouTube's 72 px guide. Its width became approximately 592.67 px; header, guide and content fit beside Sidekick. Undo restores the original containing block and positions.

The adapter checks that the Home view is actually active and verifies bounds. Other YouTube layouts decline docking with a visible fallback. Search results, watch pages and signed-in feeds are not claimed as verified.

## Favorites, Pinned and workspaces

Favorites now use a compact favicon grid with title/URL tooltips, active-tab indication, add-current/add-URL, rename/edit/remove, context menus, drag reordering, Move earlier and cross-workspace moves. A favorite activates a matching tab in the same window, or opens one. Serialized opens prevent rapid clicks from creating duplicate tabs. Atomic storage operations deduplicate new records by workspace and normalized URL.

Pinned entries are durable workspace resources, separate from Chrome's global pinned flag. They support pin-current/add-URL, Today-to-Pinned drag, drag back to Today, reorder, rename/edit, nested folders, folder moves/collapse, workspace moves, unpin and reopening closed pages. Empty-folder removal is explicit; nonempty folders are protected. No automatic archive/discard or physical Chrome tab pinning.

Workspaces support create/rename, icon/color, light/dark/system theme, optional email label and active selection persistence. Favorites, Pinned entries/folders and themes are independent per workspace. The email label performs no account switching or cookie isolation. Physical tab/group switching, pinned URL reset, Peek, Jev and password management remain unimplemented.

The existing storage key/version is retained. An additive `layoutVersion: 2` marker migrates a legacy native-Pinned display preference once to custom Docked, preserving widths, IDs, entries, folders and workspace metadata. Explicit native-fallback choices made afterward remain native. Invalid data is reported and preserved, never reset. UUIDs identify durable resources; Chrome tab/window IDs are not stored in them.

## New Tab

The supported WXT `entrypoints/newtab/index.html` produces `chrome_url_overrides.newtab: "newtab.html"` in the built Manifest V3. Both the manifest and actual `chrome://newtab/` navigation were tested.

The page contains **one shared Sidebar** in an owned responsive left column; the dashboard fills the remainder. It shares the actual background repository and renders workspace resources, active-window tabs, prominent address/search, resource editing and settings. Hidden mode retains the edge trigger. Light/dark/system preferences are workspace-specific. The page works offline except navigation/search and optional remote favicons. Chrome confirmation, another New Tab extension or enterprise policy can override the replacement.

## Exact automated results

| Check                           | Result                                                                                                |
| ------------------------------- | ----------------------------------------------------------------------------------------------------- |
| TypeScript strict type checking | Passed                                                                                                |
| ESLint                          | Passed                                                                                                |
| Prettier formatting check       | Passed                                                                                                |
| Unit tests                      | **59 passed across 11 files**                                                                         |
| Complete Playwright run         | **23 passed, 2 skipped** across 25 configured cases                                                   |
| Headless Chrome                 | 19 passed; 2 fullscreen/OS-specific cases intentionally skipped                                       |
| Headed Chrome                   | All 4 passed: native fallback, immersive recovery, custom docking, and extension/full browser restart |
| Production Chrome build         | Passed, version 0.1.3                                                                                 |
| Distribution archive            | `.output/sidekick-0.1.3-chrome.zip`                                                                   |
| Git whitespace check            | Passed                                                                                                |

Browser coverage includes 1280/1000/900 px docking; nine repeated dock/undock cycles per project; fixed/sticky controls; scrolling; width changes; horizontal overflow; exact normalized style restoration; author edits; narrow/unsafe fallbacks; YouTube's absolute canvas; overlay/hidden/native modes; Favorites CRUD/reorder/live-tab deduplication; Pinned folders/collapse/reorder/rename/workspace moves/Today drags/closed-tab reopening; shared New Tab/sidebar/themes; and earlier tab/search/bookmark/worker tests.

Actual extension reload restores a docked fixture's original layout and removes its old host. Favorites and a pinned entry inside a folder survive extension reload and a **full browser process restart**. A workspace-move test initially read the old selected ID before the new snapshot arrived; it now waits for the actual workspace selection change, and its isolated check passed three repeated runs.

Tests use disposable profiles, controlled page fixtures and Chrome's supported automation surfaces. They never modify a normal browsing profile. Temporary profile removal validates the resolved path. These are **automated browser checks and screenshot inspection**, not a claim that a human performed manual testing.

## Live website checks and visual limits

Before/docked/undocked screenshots were captured at **1280 and 1000 px** for every reached site. The page document moved to x=320, one custom host remained, no native panel opened, and undocking returned the root to x=0 and its previous width. On the scrolling public pages at 1000 px, document width changed from approximately **984.67 to 664.67 px**. Browser viewport size did not change.

| Requested site   | Actual surface checked                                               | Result / limit                                                           |
| ---------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| GitHub           | Real signed-out homepage                                             | Dock/undock visually checked at both widths                              |
| YouTube          | Real signed-out Home                                                 | Corrected adapter visually checked at both widths; other views fall back |
| Gmail            | Redirected to Google's Gmail marketing page                          | Landing-page docking checked; authenticated inbox **unverified**         |
| Google Drive     | Redirected to Google's Drive marketing page                          | Landing-page docking checked; authenticated file UI **unverified**       |
| Google Search    | Google's `/sorry/` challenge                                         | Dock/undock checked on the challenge; ordinary results **unverified**    |
| Static document  | Controlled long page with fixed/sticky controls and a `100vw` footer | Passed at 1280/1000/900 px, including scrolling and repeated restoration |
| Sidekick New Tab | Real override                                                        | Shared sidebar, themes and responsive layout passed at 1280/900 px       |

No sign-in or challenge bypass was attempted. Earlier controlled origin fixtures cover Google/Gmail/Drive/YouTube/GitHub CSP and hostile styles; those are not evidence of authenticated app compatibility. Screenshot review was necessary: bounds alone initially missed YouTube's absolute positioning.

### Remaining limitations

- Signed-in Gmail/Drive, ordinary Google results, YouTube views beyond active Home, account-specific feeds, incognito, other OSes and enterprise/kiosk policies remain unverified.
- Custom docking cannot change the browser viewport or force app JavaScript to recompute against a smaller `innerWidth`. Adapters are intentionally narrow. Unsupported pages show Hover fallback; that mode temporarily covers content while expanded.
- Root transforms/RTL/sizing, large documents, top-layer dialogs, frames and site changes may decline or interfere with docking. Retry after a page settles or return to Hover. Browser-restricted pages cannot host the injected sidebar; use native fallback or New Tab.
- Physical F11 and OS shortcut conflicts remain manual checks. Playwright F11 injection did not invoke the browser accelerator. Browser-state reconciliation was tested separately. Disabling Sidekick does not exit Chrome fullscreen; use F11/Fn+F11.
- Extension **reload** cleanup was automated; disabling it while docked/fullscreen still needs the manual check below. Existing website content scripts need a page refresh after updates/re-enabling.

## Reload and manual checklist

1. At `chrome://extensions`, keep Developer mode enabled and Reload the existing Sidekick card. Keep the same `.output/chrome-mv3` path/extension ID; do not uninstall or clear storage. Refresh existing website tabs.
2. Open New Tab and confirm one custom left sidebar plus the dashboard. Check light/dark themes, workspace create/rename/icon/color/email, resource editing, Hide and edge reopening.
3. On an ordinary website, click Dock. Check fixed headers, important controls, scrolling, width changes, narrow windows, repeated Undock/Dock and return to Hover/Hidden. A fallback notice means that page is not safely docked.
4. Add current/custom Favorites, edit/remove/reorder/move them, and click repeatedly to check live-tab reuse. Pin a page, create nested folders, reorder/move/collapse, close its live tab and reopen it. Drag between Today and Pinned. Switch workspaces and verify independent resources.
5. Test signed-in Gmail/Drive and ordinary Google results in a normal human browsing session. YouTube Home is supported by an adapter; other views should offer fallback. Test your own frequently used apps and report layout failures.
6. Reload the extension or restart Chrome and verify persisted resources. Separately disable/re-enable it while docked and verify page restoration after refreshing. If immersive, press physical F11/Fn+F11 to recover; disabling it does not itself restore fullscreen.

## Screenshots

The committed gallery includes the pre-fix baseline, static before/docked/undocked layouts, real GitHub and corrected YouTube docking, and the shared New Tab in both themes. Screenshots contain isolated test data or public signed-out pages; Google's challenge screenshot is excluded from publication because it can display network details.

- [Pre-fix overlay](screenshots/m13-baseline-overlay.png)
- [Static docked](screenshots/m13-static-docked.png)
- [Static after undocking](screenshots/m13-static-undocked.png)
- [GitHub before](screenshots/m13-github-before.png) / [docked](screenshots/m13-github-docked.png) / [undocked](screenshots/m13-github-undocked.png)
- [YouTube before](screenshots/m13-youtube-before.png) / [corrected dock](screenshots/m13-youtube-docked.png) / [undocked](screenshots/m13-youtube-undocked.png)
- [New Tab dark](screenshots/m13-newtab-dark.png) / [light](screenshots/m13-newtab-light.png)

## GitHub delivery

The user requested a new **public** `vaishnavg121/Sidekick` repository because none existed, and confirmed the configured author email is verified on that account. The CLI independently identified the signed-in account as `vaishnavg121`; its email-list API lacked the extra user scope, so verification status was not guessed from it.

After checks pass, delivery uses a feature commit, a normal non-forced merge into the new repository's default branch, and a normal push. The final response reports the actual remote commit/default-branch verification and GitHub author association. Contribution-graph rendering itself is GitHub-controlled and is not inferred from a local commit.

## References

- [CSS positioning](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/position): fixed and absolute containing blocks differ; narrowing document flow does not resize the browser viewport.
- [Chrome page overrides](https://developer.chrome.com/docs/extensions/develop/ui/override-chrome-pages): supported New Tab replacement.
- [GitHub contribution requirements](https://docs.github.com/en/account-and-profile/how-tos/contribution-settings/troubleshooting-missing-contributions): account-linked commit email and default-branch history.
