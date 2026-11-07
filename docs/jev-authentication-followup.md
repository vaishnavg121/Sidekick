> Historical 0.3.0 evidence. The [0.4.0 TypeSafe Direct results](typesafe-release-candidate.md) supersede the Gateway-only blocking status; original reports remain preserved.

# Gateway authentication follow-up — 6 November 2026

The original local file loaded correctly but contained a template value. After the credential owner replaced it and explicitly requested a retry, an isolated Chrome profile performed **one** verification request through Sidekick's trusted options UI, background service and the real Gateway endpoint. The replacement has the documented Gateway-key format and its masked suffix matches an active key listed in the signed-in team. The dashboard also showed recent use and no key budget. This is evidence of the intended credential type/team, not successful Jev authorization.

## Actual live result

- HTTP status: **403**.
- Sanitized category: `access_forbidden`.
- Safe recognized Gateway code: none returned by the bounded diagnostic allowlist.
- Authentication/access verified: **no**; authorization was denied. A 403 does not establish whether the key itself was recognized.
- Valid Jev response/schema: **no**.
- Inference requests after rejection: **zero**.
- Campaign: **2 of 25 requests used**, halted, `stopStatus: 403`. The original request remains counted; its exact HTTP status was not retained and cannot be reconstructed.
- Disposable profile closed and removed. No key, Authorization header, raw error body, private request payload or personal browsing data was logged or copied to this document.

| Feature           | Genuine live result      |
| ----------------- | ------------------------ |
| Classification    | BLOCKED before inference |
| Workspace routing | BLOCKED before inference |
| Semantic grouping | BLOCKED before inference |
| Focus Mode        | BLOCKED before inference |
| Cleanup           | BLOCKED before inference |

No live feature acceptance, persistence, restart or quality claim follows from the existing mocked tests.

## Diagnosis and smallest account check

Local loading, single variable definition, trimming and trusted UI delivery were checked without printing the credential. There is no ambient credential overriding the file. The initial connection never reached inference, so no repeated model fixtures or paid retries were attempted.

The saved status now distinguishes **401 authentication**, **402 payment/credits**, **403 forbidden access**, and **429 rate/quota restriction**. The observed result is 403; neither insufficient credit nor rate limiting was established. Revocation, key ownership/team scope, Gateway authorization and model/provider restrictions cannot be distinguished from the retained response alone.

With explicit read-only approval and a human sign-in handoff, the selected team's settings showed disabled model/provider allowlist controls, and its Gateway logs showed no requests in the selected 12-hour window. There was no setting to change that established an allowlist cause. No private team name, key identifier, key suffix, account identifier or dashboard capture is published here.

The team's onboarding page offered paid AI Gateway credit to access all models. Current [pricing documentation](https://vercel.com/docs/ai-gateway/pricing#free-and-paid-tiers) says free credits cover only a subset of models. Jev appeared in the full catalog and was absent from the [free-tier catalog](https://vercel.com/ai-gateway/models?freeTier=true); the [Jev model page](https://vercel.com/ai-gateway/models/jev) also showed no free-credit eligibility. **Free-tier model access is the strongest remaining explanation**, but the retained 403 had no recognized code confirming that exact cause. It is not evidence that the key should be replaced repeatedly or that a Pro subscription is required.

The smallest account action is to verify whether this team has paid Gateway access for Jev. The owner can choose **AI Gateway → Overview → Buy Paid AI Gateway Credit** and complete the purchase themselves if desired; this task did not enter payment details, buy credits, enable auto top-up or change the plan. If paid access already exists, contact Vercel support with the sanitized fact: an active Gateway key receives HTTP 403 for a minimal `typesafe-ai/jev` verification, with no corresponding inference log. No further verification should run until an actual access change or confirmed local implementation correction justifies it.

Current official references: [API keys](https://vercel.com/docs/ai-gateway/authentication-and-byok/api-keys), [authentication](https://vercel.com/docs/ai-gateway/authentication-and-byok), [Decision contract](https://vercel.com/docs/ai-gateway/modalities/decision), [Gateway errors](https://vercel.com/docs/ai-gateway/sdks-and-apis/openai-decisions#errors). `/v1/evaluate` remains supported for existing integrations despite deprecation; switching request envelopes does not resolve a demonstrated access denial.

Automatic approval review initially blocked dashboard inspection because of possible private account/team disclosure. The user then explicitly approved read-only access and completed sign-in. Settings, logs and masked key metadata were inspected; no account mutation was performed.

## Runner corrections

- Resume requires both `--resume` and the exact current `--expected-used` value; it preserves the count and 25-request maximum.
- A halted campaign permits only one connection probe. It remains halted until an observed HTTP 200 and the production Jev schema validator both succeed.
- The worker must acknowledge interception before any UI request; every Gateway request is metered, including after an actual service-worker restart.
- Every HTTP failure records a separate sanitized status/category; remote error codes are retained only from a fixed allowlist. Raw response bodies/messages/headers are discarded.
- A private SHA-256 credential fingerprint in the ignored ledger prevents accidental resending of the same rejected key. Replace the local key if invalid. If the same key remains appropriate after the owner actually corrects its account access, `--access-fixed` explicitly attests that correction for a recorded 403; it does not clear the halt or request count. The fingerprint and key are not included in public reports.
- Default invocation remains SKIPPED with no network, and blocked/failed live campaigns return a failing process exit status.

After the owner actually resolves access, the next explicit invocation for the same active key is:

```powershell
$env:SIDEKICK_LIVE = '1'
try { pnpm test:live --resume --expected-used=2 --access-fixed }
finally { Remove-Item Env:SIDEKICK_LIVE }
```

Do not clear the ledger, reset the request count or repeatedly invoke this with a rejected key. The post-authentication live-runner paths remain unverified until a genuine connection succeeds.

## Validation

Ten new offline subprocess tests exercise the actual runner: default skip, missing/stale resume authorization, invalid/exhausted counters, template credential and repeated rejected credential. They use isolated temporary fixtures with no real credential or Gateway calls. Final gate: TypeScript, ESLint, Prettier, production build and **187 unit tests across 19 files passed**. The full Chrome suite passed **46/46** in 3.0 minutes, including the existing three pixel comparisons. These tests use mocks for inference and do not change the BLOCKED live results. Secret comparison and extracted-package verification also passed for the unchanged 0.3.0 product bundle; no product feature, permission or metadata format changed.
