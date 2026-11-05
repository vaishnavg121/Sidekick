# Release preparation — 0.3.0 beta

Prepared 6 November 2026. Classification: **functional personal-use beta**, with completed automated acceptance evidence and remaining device/live-service gates in [current testing](final-polish-results.md). No store publication or payment has been performed or authorized.

## Reproduce and package

```powershell
pnpm install --frozen-lockfile
pnpm check
pnpm exec playwright install chromium
pnpm exec playwright test
pnpm audit
pnpm zip
```

Load `.output/chrome-mv3`, or extract `.output/sidekick-0.3.0-chrome.zip` into a dedicated folder and load that folder with Developer mode. Keep the existing extension ID/path when updating to retain user storage. Refresh old website content scripts after Reload. The 0.3.0 update adds no permission relative to 0.2.0; optional notifications remain a separate user choice.

The MV3 manifest contains no New Tab override, remote code, unsafe evaluation, cookies/history/debugger/scripting/webRequest permission or persistent background page. Options open in a trusted extension tab. Existing strict storage access and sender/window validation remain enabled.

## Draft store listing

**Name:** Sidekick

**Short description:** Organize live tabs into logical workspaces with a compact left sidebar, saved resources, a command palette and optional Jev AI.

**Single purpose:** Organize and recover Chrome tabs and saved workspace resources within the user's current browser profile.

**Detailed description:**

Sidekick brings a compact workspace sidebar to everyday Chrome browsing. Keep live pages assigned to logical workspaces, switch without closing other tabs, and find pages with a keyboard-friendly command palette. Save Favorites and Pinned resources, organize nested folders, and use Chrome bookmarks without altering their hierarchy.

Choose Hover, Hidden, custom Docked or native-panel fallback. Docking adjusts compatible pages conservatively and offers Hover on unsupported layouts. Chrome's original New Tab remains unchanged; the Sidekick dashboard is opened explicitly.

Remind yourself about a tab with snoozing, save URL sessions, keep an archive and export portable backups. Optional Jev analysis uses your own Vercel AI Gateway key for reviewed categories, routing, related groups, Focus relevance and cleanup suggestions. AI is not required for ordinary browsing or search. Requests may incur provider charges.

Workspaces share this Chrome profile's cookies/accounts. Restores reopen URLs, not unsaved forms or complete page history. Physical shortcut conflicts, incognito/enterprise restrictions and complex website layouts may require manual checks. This version is labelled beta; do not market it as universally compatible or production approved.

**Category/language suggestion:** Productivity / English. Publisher must confirm the currently offered dashboard category.

## Permission justifications

| Manifest access                  | Justification for review                                                                                         |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| storage                          | Workspace definitions, saved resources, Library, preferences; trusted local key storage and session-only handles |
| tabs                             | Display/activate/close/reorder tabs and maintain logical ownership, navigation and URL reuse                     |
| sidePanel                        | Chrome-supported UI fallback when content injection is restricted                                                |
| bookmarks                        | Read-only tree/search/opening in the sidebar/palette                                                             |
| alarms                           | Recreate/wake durable snooze reminders under MV3 suspension                                                      |
| tabGroups                        | Create/name native groups after explicit Jev acceptance, and display existing groups                             |
| `https://ai-gateway.vercel.sh/*` | User-enabled BYOK evaluation requests to one fixed HTTPS endpoint                                                |
| HTTP/HTTPS content matches       | Custom sidebar and reversible docking on ordinary pages, excluding the Web Store                                 |
| notifications (optional)         | OS reminder notification only after user grant                                                                   |

## Privacy disclosures to review

Public policy: [repository privacy page](https://github.com/vaishnavg121/Sidekick/blob/main/docs/privacy.md). Confirm this URL is live and accepted by the publisher dashboard before submission.

Disclose actual browsing-title/URL access, optional user-provided workspace/email/Focus information, local saved resources and optional Gateway authentication. Do not select a blanket “no data access” statement. Explain that selected sanitized titles/domains, workspace names and goals go to Vercel only when AI is requested, while keys are used for HTTPS authentication. No telemetry/advertising/sale of data or remotely hosted executable code is implemented. Publisher must review/certify the dashboard's current data-use checkboxes and provider terms; the repository does not certify an account on their behalf.

## Assets

- Manifest PNG icons: `public/icon/16.png`, `32.png`, `48.png`, `128.png`. The 128px artwork uses transparent padding and is also suitable for the store icon.
- Source vector: `assets/sidekick-icon.svg`.
- Actual UI captures: `docs/screenshots/master-*.png`. Store-ready dark/light/palette/settings/empty captures use a real 1280×800 viewport. Inspect each before upload; use up to five representative screenshots, not private browsing data.
- Optional promotional images: 440×280 small tile and 1400×560 marquee. These are not fabricated screenshots; prepare them only if desired. The currently checked dashboard guidance lists icon + at least one screenshot as required.

Reviewed primary references: [Program policies](https://developer.chrome.com/docs/webstore/program-policies/policies), [privacy fields](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy), [listing assets](https://developer.chrome.com/docs/webstore/cws-dashboard-listing), [image guidance](https://developer.chrome.com/docs/webstore/images), [listing quality](https://developer.chrome.com/docs/webstore/best-listing). Recheck at submission because policies/dashboard requirements can change.

## Submission gates and user actions

1. Review all PASS/BLOCKED/NOT TESTED rows in the acceptance ledger. Complete physical shortcuts/F11, OS notification delivery and a user-owned live Jev smoke test before making production claims.
2. Validate signed-in everyday sites, minimum supported Chrome, other OS/incognito/enterprise requirements that matter to your release audience.
3. Use the intended publisher account, current account verification/2-step requirements and valid support contact. Any registration fee/payment requires separate user authorization.
4. Review listing/privacy/permission declarations, screenshots and provider terms. Confirm the packaged version and checksum from the final report.
5. Upload the verified ZIP as a draft only when authorized. Publishing, paying or accepting publisher agreements has not been performed.

Do not claim Chrome Web Store approval or complete production readiness from a successful local build.

## 0.3.0 delivery notes

Appearance Studio and validated local theme portability add no runtime dependencies or permissions relative to v0.2.0. The original Chrome New Tab and extension identity remain unchanged. Same-path upgrade testing preserves workspaces, resource/folder IDs, preferences, sessions, archive and snoozed reminders.

Live Jev is blocked by the actual authorization rejection, not by a missing test file. The campaign remains halted after one request. Physical OS input was stopped by the computer-use tool because it could not establish the browser URL confidently enough for policy enforcement. No physical key was sent. Mocked HTTP/UI checks and Chrome command registration are separate evidence.

Current screenshots live in `docs/screenshots/polish/`; inspect selected 1280×800 assets before submitting. The 1366×768/1920×1080/520px diagnostic captures are layout evidence and may need store-compatible capture sizes. Listing/privacy review, valid live Jev verification, device checks and explicit publication authorization remain submission gates. No store upload, payment or publisher agreement was performed.

Verified final ZIP: `.output/sidekick-0.3.0-chrome.zip`, **256,213 bytes**, SHA-256 `14bbee682d754782ded92d2474180f85b001143c9cb32cc48ea559cbe78d0d67`. Final gate: **177 unit tests / 18 files, 46 Chrome scenarios, 3 embedded pixel comparisons passed**. Fresh extracted-ZIP installation and same-ID upgrade passed. See [the complete results and 40-step ledger](final-polish-results.md).
