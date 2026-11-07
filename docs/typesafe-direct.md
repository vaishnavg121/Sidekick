# TypeSafe Direct setup — Sidekick 0.4.0 release candidate

Open Sidekick's secure Settings tab and choose **TypeSafe Direct · jev-latest**. Create/manage a key at [console.typesafe.ai](https://console.typesafe.ai), paste it into the trusted extension input and choose **Verify & Connect**. The key is hidden by default. Verification discovers models, then sends one small Noul evaluation; model discovery and inference may have different billing treatment. Paid inference never starts without your action. Connected settings show the resolved model and last verification date.

TypeSafe Direct is the default for new installations. Existing installations containing a Gateway key retain **Vercel AI Gateway · legacy** until you explicitly choose Direct. Each provider has its own credential field and fixed HTTPS endpoint. Selecting another provider clears the unsaved input. Neither provider is a fallback for the other. Disconnect removes the selected provider's stored key; another provider's dormant credential is preserved and never forwarded. You can select that provider to remove/reverify it, or remove all local data by clearing extension storage.

## Request and validation contract

Official references: [TypeSafe API documentation](https://api.typesafe.ai/redoc), [OpenAPI specification](https://api.typesafe.ai/openapi.json), inspected 7 November 2026.

- Discovery: authenticated `GET https://api.typesafe.ai/v1/models`; require the `jev-latest` alias.
- Inference: authenticated `POST https://api.typesafe.ai/v1/systemone`, model `jev-latest`, using the owner's TypeSafe key. The service can resolve the alias to a version such as `jev-1.14.0`.
- Shared application Boolean questions become Direct `noul`; numeric `noul` is normalized back to the application's probability field.
- Choice requires every authored option, finite bounded probabilities, valid total mass, an allowed highest-probability choice and a bounded provider confidence. The UI's selected-option probability remains separate from provider confidence; no generated explanation is invented.
- Score requires every rubric rung, the matching legend, bounded confidence and score, and a valid distribution. Focus uses six levels, normalized by dividing the reported expected score by five.
- Live responses round score and probability values independently to two decimals. Validation computes the range of possible underlying expectations from their rounding intervals. This accepts observed valid cases such as score 0.02 with a displayed distribution rounded to 100% at rung zero, while rejecting scores outside the possible interval. It does not discard rubric, mass, completeness, finite-number or range checks.
- Resolved model and nonnegative integer input/output token counts are validated. Arbitrary error bodies and Authorization headers are never surfaced. HTTP 401, 402, 403 and 429 remain distinguishable. Network failure/timeout has a sanitized message. There are no automatic retries or paid-provider fallbacks.

Requests originate only in the trusted background. Selected sanitized tab titles/domains, authored workspace descriptions and Focus goals are sent; page contents and full URL paths/queries/fragments are excluded. Titles/goals can still contain private information; choose what you analyze. Provider retention and billing follow TypeSafe's terms.

## Local opt-in live runner

Keep `.env.e2e.local` ignored and place `TYPESAFE_API_KEY` there privately. Do not use a public build-variable prefix and do not paste the key into chat or GitHub. The production extension does not load this file; it uses trusted Settings. The repository runner explicitly selects TypeSafe Direct and never reuses `AI_GATEWAY_API_KEY`.

```powershell
# Default invocation skips all live requests.
pnpm test:live
# Only after authorizing paid fixture inference:
$env:SIDEKICK_LIVE = '1'
try { pnpm test:live }
finally { Remove-Item Env:SIDEKICK_LIVE }
```

`--verify-only` limits a run to model discovery plus Noul verification. The legacy Gateway runner is separately named `pnpm test:live:gateway`; its rejected campaign remains halted and is not resumed by Direct testing.

The Direct campaign ledger is `.output/live-typesafe-budget.json`, initialized from the preserved Vercel count. This delivery counts **2 historical Vercel + 20 Direct requests = 22/25**, leaving three within the conservative combined limit. It also satisfies the user's maximum of 24 additional requests. Reports, the original Gateway ledger/report and archived Direct attempts remain ignored local artifacts. Never delete/reset a ledger to obtain a new allowance. Halted retries require an explicit matching count and corrected access/credential. Default CI never needs a paid key.

The UI recovery step sends one bounded Focus batch after a real worker stop. Because DevTools Fetch interception can be lost across suspension, the runner reserves that single no-retry request before sending it and requires a fresh validated result and saved new goal. The completed run's missed interception was reconciled from the observed fresh result, retaining the original metered report; usage for that one recovery call is unavailable. Other calls carry observed HTTP status and token counts. No additional paid call was made during reconciliation.

## Manual review and limitations

Review each category, route, group and cleanup suggestion. Model quality can vary. The live fixture run marked similar but distinct/query-bearing URLs as semantic duplicates. That is a model-quality warning, not proof of exact URL identity. Sidekick's local exact-duplicate detector retains query/fragment differences; cleanup closes only explicitly confirmed targets and archives URL copies first. Archives cannot restore unsaved forms, authentication state or full history.

See [the release-candidate results](typesafe-release-candidate.md) for individual live outcomes, mocks, screenshots, counters and remaining manual checks. This build is intended for the owner's manual testing before any Chrome Web Store submission.
