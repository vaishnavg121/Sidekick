# Privacy and data handling

Effective 6 November 2026 · Sidekick 0.3.0 beta

Sidekick organizes tabs in your existing Chrome profile. It does not isolate cookies, accounts, passwords or browser profiles.

## Local information

Extension storage holds workspace names/icons/themes/email labels, saved URLs/titles, Favorites, Pinned folders, preferences, accepted/dismissed categories, rejected routes, appearance settings, Focus goals, snoozed reminders, URL session snapshots and archive entries. Tab/window handles, window selections/search and live Focus IDs stay in session storage.

A bounded set of local SHA-256 URL-hash window fingerprints reconciles reload/browser restoration. These contain hashes and workspace IDs, not raw live URLs or Chrome handles; up to 20 unmatched snapshots are retained. Hashes are a reconciliation aid, not a guarantee of anonymity. Ambiguous ownership falls back conservatively.

Chrome bookmarks are read for display/search/opening and are not changed. The content script inserts the sidebar and reversibly changes layout styles when Dock is selected. No webpage contents are collected for AI.

## Optional network requests

AI is optional. Verify & Connect sends a small verification request to Vercel AI Gateway. User-requested analysis sends sanitized selected titles/domains, question IDs, workspace names and Focus goals to `https://ai-gateway.vercel.sh/v1/evaluate` using `typesafe-ai/jev`.

URL paths, queries, fragments, page contents, cookies and passwords are not intentionally sent in AI requests. Titles/goals can contain sensitive information; automated sanitization cannot recognize every secret. Choose what you analyze carefully. Vercel/provider processing, retention and billing follow their terms; Sidekick does not guarantee zero external retention.

Your Gateway key is stored in trusted local extension storage and sent as an HTTPS authorization header only to the fixed endpoint. It is not broadcast to content scripts, logged or exported. Disconnect removes the configured key and clears in-memory results. Local browser/device access can expose extension storage; no encrypted-at-rest guarantee is made.

Favicons can contact the corresponding origin using Chrome-provided/saved icon URLs or a favicon endpoint, with a no-referrer policy. Opening/searching contacts the destination normally. No analytics or telemetry service is included, and no remotely hosted code is executed.

## Recovery and deletion

Snoozing leaves a tab open unless closure is explicitly selected. Alarms mark retained reminders ready; optional OS notifications require permission. Sleeping Chrome/devices can delay reminders. Restoration is explicit and does not automatically change workspaces in the background.

Sessions/archive/snooze recover URL/title snapshots, not unsaved forms, history or authentication state. Cleanup closure requires confirmation and archives URL copies first. Automatic AI closure/archival is disabled.

Backups omit keys, AI/session state and fingerprints, and remove common sensitive query names. Titles, saved URLs and workspace email labels can still be private. Inspect before sharing. Imports require preview/confirmation and add independent workspace copies without replacing existing preferences/data.

Individual resources and Library entries can be removed through the UI. Workspace deletion requires moving/removing all live tabs and saved resources first. Removing Sidekick or clearing extension storage removes local extension data; export first if needed. Cookies/accounts remain managed by Chrome/websites.

## Permissions

| Permission/access          | Purpose                                                 |
| -------------------------- | ------------------------------------------------------- |
| storage                    | Local metadata, settings and session state              |
| tabs                       | Live titles/URLs, navigation, ownership and tab actions |
| sidePanel                  | Supported fallback on restricted Chrome pages           |
| bookmarks                  | Read-only bookmark browsing/search/opening              |
| alarms                     | MV3 reminder scheduling                                 |
| tabGroups                  | Native groups explicitly accepted from Jev              |
| Gateway host               | Fixed HTTPS AI requests                                 |
| HTTP/HTTPS content matches | Sidebar and reversible docking on permitted pages       |
| notifications (optional)   | Due reminder notifications after permission grant       |

No history, cookies, debugger, scripting, webRequest, clipboard-read or password permission is requested. Contact/support: [Sidekick issues](https://github.com/vaishnavg121/Sidekick/issues). Never post keys or private browsing data in public issues.

## Appearance and local verification tools

Appearance colors, gradients, effects and workspace overrides stay in local extension metadata. Theme-only JSON exports contain appearance rather than account/browsing data. Imported configurations accept validated colors/numbers/enums, not executable CSS or remote image URLs. Preview changes do not write every slider movement to storage or modify website content styles. No new permission or telemetry was added for Appearance Studio.

Repository-only live testing explicitly reads the ignored `.env.e2e.local` in the Node runner and uses trusted extension settings in a disposable profile. It is disabled by default, bounded to 25 requests per campaign and records sanitized status/counts, not headers or credentials. Profiles are removed after testing. This developer file and runner are not part of the production extension ZIP. The product continues to use normal secure BYOK settings.
