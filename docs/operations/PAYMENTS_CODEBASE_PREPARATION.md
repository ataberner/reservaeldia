# Payments codebase preparation

Status: Stage 2 activated locally; **no deployment performed**.
Date: 2026-09-22. Remote access was restricted to three safe metadata reads.
Default/general deploys must stay frozen until the three transfers are verified.

## Implemented boundary

`functions/src/payments/entrypoint.ts` is the only declaration site for:

- `createPublicationCheckoutSession`
- `createPublicationPayment`
- `mercadoPagoWebhook`

`functions/src/index.ts` no longer reexports these objects. `firebase.json` now
registers default/source `functions` (102 endpoints) and payments/source
`functions-payments` (3 endpoints). Their union preserves the original 105 names
and every endpoint option. Production ownership has not been changed by this work.

The checkout declaration explicitly retains the inherited `cpu: gcf_gen1`.
The new entrypoint does not set global options. All other options and wrappers
are preserved; handlers, HMAC, publication and render are unchanged.

`tsconfig.payments.json` starts from the canonical entrypoint and emits its
transitive TypeScript dependencies into `functions-payments/lib`. The existing
contract mapping generates the corresponding `shared`/`lib/shared` artifacts
from canonical sources; no second maintained implementation is introduced.
The generated service files must match the default build byte for byte.

Some shared pricing/analytics modules declare additional Functions internally;
these are not reexported/discovered by Payments. Extracting those declarations
is not necessary for this preparatory change. Generated contracts include the
existing complete mapping, including unused contracts; they do not load other
subsystems. No new dependency loading optimization is included.

## Local verification

From the repository root:

```powershell
npm.cmd --prefix functions run build
npm.cmd --prefix functions run build:payments
```

Install runtime dependencies inside `functions-payments` with `npm ci`. The
verification-only offline alternative, when existing Functions dependencies are
installed, is:

```powershell
node.exe functions/scripts/verifyPayments.cjs materialize
node.exe --test functions/paymentsPackage.test.mjs
node.exe functions/scripts/verifyPayments.cjs autonomy
node.exe functions/scripts/verifyPayments.cjs plan "C:\Users\Manuel Lagos\AppData\Roaming\npm\node_modules\firebase-tools"
node.exe functions/scripts/verifyPayments.cjs discovery "C:\Users\Manuel Lagos\AppData\Roaming\npm\node_modules\firebase-tools" 10
node.exe functions/scripts/verifyPayments.cjs discovery-default "C:\Users\Manuel Lagos\AppData\Roaming\npm\node_modules\firebase-tools" 10
```

Adapt the CLI directory to the installed CLI; these commands do not deploy.
`materialize` requires a fresh destination, verifies every installed version
against the Payments lockfile, copies no parent project dependency and skips
only missing optional packages. It does not replace `npm ci` in deployment.

`autonomy` copies only the package, lock, compiled modules and contracts to a new
OS temporary directory outside the repository and materializes its own runtime
dependencies. A new process rejects module resolution outside that directory
and all outbound sockets. It loads the three exports, processes synthetic HTML
and creates a synthetic PNG through Sharp. No HTTP Function/provider is invoked.
The disposable directory is retained for inspection and `npm ls --omit=dev --all`.

`discovery` launches fresh parent processes through the installed CLI's
`Delegate.discoverBuild`, including `cross-spawn`, the SDK `.bin` wrapper and
`detectFromPort`. It retains the default 10-second detector timeout. Differences
from deployment are deliberate: synthetic Firebase configuration, no remote
configuration fetch, blocked outbound sockets, hidden Windows launch and silent
logs. It never executes `deploy`, predeploy hooks, uploads or API enablement.
Timing reports distinguish the detector from total time including shutdown.
Every successful sample must contain exactly the three endpoint names.

Stage 2 evidence is written under `.local-isolation/payments-activation/`; it contains
no dotenv or Secret values. Baseline hashes and complete payment endpoint options
are maintained in `functions/testFixtures/payments/manifest-baseline.json`, captured
before extraction. Do not regenerate the baseline merely to make a test pass.

The planner uses current local manifests and the three sanitized remote metadata
snapshots. The other 102 resources and post-transfer ownership remain simulated.
It tests all three qualified selectors and each partial rollback (1/2/3 updates),
with zero creates/deletes/recreates. It does not execute deploy/prepare, resolve
Secret versions, fetch IAM or predict changes made remotely after the snapshot.

### Historical stage 1 evidence — 2026-09-20

- Default: all 105 endpoint hashes match the pre-extraction baseline; Payments:
  exactly three with complete identical endpoint options. All seven package tests
  pass, including unchanged compiled services and negative partition cases.
- CLI 14.4.0 / SDK 6.4.0 / host Node 22.13.1: ten fresh discovery processes,
  ten successes, zero failures/timeouts. Detector minimum **1.132 s**, median
  **1.356 s**, maximum **4.868 s**; worst observed margin **5.132 s** versus 10 s.
  Samples in seconds: 4.868, 1.144, 1.357, 1.159, 1.354, 1.539, 1.132,
  1.308, 1.387, 1.383. These are detector timings, not shutdown-inclusive totals
  and not a production-deploy guarantee. The old single-source deploy still
  discovers 105 endpoints until activation.
- Autonomous package: 329 locally installed packages at locked versions; 24
  optional packages absent from the local installation, including native variants
  for other platforms and the optional WASM runtime. `npm ls --omit=dev --all`
  exits 0 with no problems. Node 22 loads/renders synthetic data outside the
  repository with zero external module resolutions or network attempts.
- Node 20.19.5 also loads the isolated package and creates a synthetic PNG. Its
  JavaScript `realpath` implementation cannot traverse the sandbox-denied Windows
  profile parent, so this supplemental probe used `--preserve-symlinks`; copied
  package files were verified to contain no symlinks. This diagnostic flag is
  not added to runtime configuration, discovery, npm scripts or production.
- Forward and inverse installed-CLI planner simulations: three updates, zero
  creates/deletes/recreates; the remaining 102 are excluded.
- Default/Payments builds and both TypeScript checks pass. Modified-file lint:
  zero errors, 42 warnings identical to their HEAD baselines; no new warnings.
- Node 20 offline regression suite: 38 files, **351/352 passing**, no skips.
  Payments, HMAC, publication, render, email and configuration are included.
  The sole failure is `generarModalRSVP.test.mjs`, "keeps the runtime fallback
  endpoint and preview-only submit bypass stable": it expects a literal fallback
  return, while the unchanged implementation returns validated configuration.
  The same failure was reproduced using the implementation from HEAD; both the
  source and test match HEAD. Neither was changed to make this PR green.
- Production `firebase.json`, current dotenv files, local Secret file and original
  Functions lockfile match their pre-task hashes; values/hashes are not printed.
  No deploy, remote invocation, GCP/Secret/IAM operation or credential change.

Raw reports: `.local-isolation/payments-preparation/{discovery,plan,autonomy,
autonomy-node20,npm-ls-autonomous,lint-final}.json`, `tests-final.tap`, and
`rsvp-head.tap`. The last two intentionally retain evidence of the pre-existing
failure. A fresh registry `npm ci` and Linux Chromium execution were not performed;
local dependency materialization and the existing render regressions do not
certify those deployment-environment checks.

## Executed stage 2 evidence -- 2026-09-22

- Default 102 / Payments 3 / union 105; no duplicates or missing names. All 105
  endpoint hashes match the original baseline. Payment declarations and compiled
  payment/publication/render services remain unchanged.
- Remote metadata parity passed for all three, including effective CLI defaults.
  CLI 14.4.0 selects only the requested Payments endpoint with each qualified
  selector. Forward plan: 3 updates; rollback cases: 1/2/3 updates; all have zero
  creates, deletes or recreates. See `plan.json` in the stage 2 evidence directory.
- Real local CLI wrapper/discovery, host Node 22.13.1, SDK 6.4.0, fresh processes:

| Source | Samples | Minimum | Median | Maximum | Failures / timeouts |
| --- | --- | --- | --- | --- | --- |
| Payments | 10 | 0.876 s | 0.887 s | 4.187 s | 0 / 0 |
| Default | 10 | 1.076 s | 1.149 s | 3.130 s | 0 / 0 |

  These are detector timings, excluding the wrapper shutdown delay. Worst observed
  Payments margin versus the unchanged 10-second limit: 5.813 s. All Payments
  samples discovered only three endpoints; all default samples discovered 102.
  Files: `discovery-payments.json`, `discovery-default.json`, `cli-manifests/`.
  This controlled local measurement is not a guarantee about future deploy latency.
- Both builds and both TypeScript checks pass. Node 20.19.5 offline regressions:
  38 files, **354/355 pass**, no skips/cancellations. Payments (10 package tests),
  payment flows, HMAC, publication, HTML/render, email and configuration pass.
  The only failure remains the RSVP fallback test described in stage 1. Source
  and test still match HEAD; a fresh probe of HEAD's implementation reproduces
  exactly that failure (2/3 RSVP tests pass). Neither source nor expectation changed.
- Lint of 13 changed/new Functions code/test/script files: zero errors, 42
  warnings identical to HEAD; zero problems in new files. `git diff --check`
  passes, including a separate whitespace check of untracked text artifacts.
- CLI's actual `loadUserEnvs` selects only the three normal names per source
  listed below. Git-versionable dotenv count is zero. Credential-pattern scan
  covers 10,996 versionable text files and 119 Payments application/config files,
  with no findings. Vendored dependencies and ignored historical logs are outside
  that scan; it is not certification of old logs or repository history.
- Reports: `.local-isolation/payments-activation/{tests.tap,lint.json,security.json,
  env-transfer.json,rsvp-head.json,rsvp-head.tap}`. Values are never emitted by
  these checks. No deploy, Function invocation, commit, GCP resource modification,
  Secret-value access, Secret version change or credential rotation occurred.

## Stage 2 normal configuration

The ignored `functions-payments/.env.reservaeldia-7a440` now contains only:

- `MERCADO_PAGO_PUBLIC_KEY`: moved as the exact original declaration, preserving
  the new local value. Only checkout returns it to the frontend.
- `MERCADO_PAGO_WEBHOOK_URL`: moved without changing its existing URL.
- `GOOGLE_MAPS_EMBED_API_KEY`: copied unchanged; legitimately shared with core
  render (`prepareRenderPayload` and `generarHTMLDesdeObjetos`).

`functions/.env.reservaeldia-7a440` retains `SUPERADMINS_UIDS`,
`GOOGLE_MAPS_EMBED_API_KEY`, and `EMAIL_MODE`. The unused
`MERCADO_PAGO_CLIENT_ID` was removed, with no copy in Payments: no code consumer
exists. `functions/.env.production` retains its existing Maps configuration.
Frontend dotenv and local Secret files were not changed. No previously unset
pricing/countdown/share-image flags or browser path overrides were introduced.
Admin project/bucket initialization continues through the existing shared code.

Both sources exclude `.env*`, `.secret*` and `.runtimeconfig.json` from source
archives. The CLI still reads the selected source's normal dotenv locally and
injects its variables at deployment. Git ignores the real dotenv files; no build
copies their values. No actual configuration is put in versionable fixtures.

| Secret | Consumers | Observed deployed version |
| --- | --- | --- |
| `MERCADO_PAGO_ACCESS_TOKEN` | checkout, payment, webhook | 2 on all three |
| `MP_WEBHOOK_SECRET` | webhook only | 1 |

Bindings remain `defineSecret`/`secrets`, with no SES/OpenAI bindings in Payments.
There is no `MERCADO_PAGO_CLIENT_SECRET` consumer. Local manifests declare Secret
names, not pinned versions: the CLI resolves versions when the operator deploys.
Do not rotate/create versions during the transfer; stop if references differ
from the baseline. This task neither read values nor changed Secret versions.

Moving the dotenv locally does not remove old normal variables from the 102
already deployed Functions. Those require future core updates after the transfer.
Email remains within default and still shares normal core configuration.

## Remote baseline and local parity

[Sanitized remote baseline](baselines/payments-remote-2026-09-22.json), captured
2026-09-22 23:51 UTC, contains only the three authorized Functions. Each was read
using Cloud Functions v2 `functions.get` with a server-side `fields` allowlist.
No environment-values field, Secret Manager request, Function invocation or
resource mutation was used. Both Cloud Functions and Cloud Run URLs are retained.

All are Gen 2 / Node 20 / `us-central1`, ingress `ALLOW_ALL`, timeout 60 seconds,
concurrency 1 and service account `860495975406-compute@developer.gserviceaccount.com`.
Checkout is callable, 256 MiB / CPU 0.1666; payment is callable and webhook HTTPS,
both 1024 MiB / CPU 1. Missing codebase labels mean `default` in CLI 14.4.0.

Local complete endpoint snapshots still match the preparatory baseline exactly.
Remote comparison resolves `gcf_gen1` using the installed CLI's CPU table and
platform defaults for omitted timeout, service account, concurrency and ingress.
No application options were changed to obtain parity. Tests save SDK manifests
under `.local-isolation/payments-activation/manifests/`; real CLI discovery saves
its parsed manifests under `cli-manifests/`. The 105 endpoint hashes must match
`functions/testFixtures/payments/manifest-baseline.json`; do not regenerate it.

The inventory is not an IAM-policy audit, a read of all 105 remote Functions,
or evidence that production already uses the new Public Key. That remains
unverified until the operator successfully deploys and exercises checkout.

## Operator sequence -- commands prepared, not executed

Use Firebase CLI **14.4.0**, from the repository root. Keep default/general deploys
frozen during any partial transfer. Never use the ambiguous `functions:payments`
selector, a whole-source deploy, `--force`, or deletion/recreation to migrate.
The exact qualified selector targets just Payments discovery and one update.

**A. Deploy only checkout:**

```powershell
firebase.cmd deploy --only "functions:payments:createPublicationCheckoutSession" --project reservaeldia-7a440
```

**B. Immediately capture metadata and compare it:**

```powershell
node.exe functions/scripts/capturePaymentsMetadata.cjs "C:\Users\Manuel Lagos\AppData\Roaming\npm\node_modules\firebase-tools" .local-isolation/payments-activation/after-checkout.json
node.exe functions/scripts/comparePaymentsMetadata.cjs .local-isolation/payments-activation/after-checkout.json createPublicationCheckoutSession
```

Capture refuses to overwrite evidence; use a new filename for retries. Comparison
requires all names, both URLs, trigger/runtime/options/service account and Secret
versions to remain identical. Only checkout ownership should become `payments`;
payment/webhook remain default. Access Token must still reference version 2.
No migration should request a new name, missing Secret value or deletion.

**C. Verify frontend checkout manually:** open DevTools Network, enable Preserve
log, reload the application, and open a nonzero publication checkout. Inspect the
`createPublicationCheckoutSession` response's `result.mpPublicKey` (or `data`
envelope as displayed). Privately compare it to the ignored Payments dotenv's
current Public Key; do not log, copy to a ticket or export a HAR with credentials.
At `src/components/payments/PublicationCheckoutModal.jsx`, the SDK is constructed
as `new MercadoPago(sessionData.mpPublicKey, { locale: "es-AR" })`. A breakpoint
on that existing line lets the operator confirm the same new value is passed
at runtime. Confirm Mercado Pago's payment UI appears without SDK/auth errors.
The frontend takes the key from this response, so no frontend rebuild/deploy is
needed for this configuration change. Metadata proves Token v2's binding, not
that its secret value and the Public Key form a valid pair; runtime validation
and the operator's existing same-pair provenance complete that check.

**D. Only after A-C pass, deploy payment:**

```powershell
firebase.cmd deploy --only "functions:payments:createPublicationPayment" --project reservaeldia-7a440
```

**E. Capture as `after-payment.json` with the same capture tool, then compare:**

```powershell
node.exe functions/scripts/comparePaymentsMetadata.cjs .local-isolation/payments-activation/after-payment.json createPublicationCheckoutSession,createPublicationPayment
```

**F. Only after metadata/bindings pass, deploy webhook:**

```powershell
firebase.cmd deploy --only "functions:payments:mercadoPagoWebhook" --project reservaeldia-7a440
```

**G. Capture as `after-webhook.json`, then compare:**

```powershell
node.exe functions/scripts/comparePaymentsMetadata.cjs .local-isolation/payments-activation/after-webhook.json createPublicationCheckoutSession,createPublicationPayment,mercadoPagoWebhook
```

Webhook must retain both original URLs, Access Token v2 and webhook Secret v1.
Do not edit Mercado Pago's webhook URL. **H.** The operator then performs a
controlled real purchase from a Mercado Pago account different from the seller:
verify checkout, payment approval, money received by the seller, webhook
processing and published invitation. These are operator actions with real effects,
not checks executed by this PR. Resume default deploys only after all three
ownership transfers and the purchase/publication checks pass.

## Exact rollback by transfer stage

`firebase.payments-rollback.json` registers only source `functions-payments` under
codebase `default`, with the same isolated build and exclusions. It discovers
three endpoints even when only one is selected. It never loads the 105-endpoint
entrypoint. The prepared commands return ownership via updates, using the same
canonical application code, **current new Public Key**, Access Token v2 and
webhook Secret v1. They do not repair unrelated business failures or roll back
credentials. No env file with Secrets or older configuration is restored.

If the first deploy fails during build/discovery before resource update, there
is no transfer to undo: capture safe metadata, compare with an empty migrated
list, fix the local failure and retry A. Do not issue a speculative rollback.
If the result is uncertain or an update started, wait for that operation to
settle and inspect metadata; do not run overlapping update operations. Choose
only the endpoints confirmed migrated. Do not proceed to payment/webhook while
checkout checks fail.

**Checkout migrated, payment/webhook still default:**

```powershell
firebase.cmd deploy --config firebase.payments-rollback.json --only "functions:default:createPublicationCheckoutSession" --project reservaeldia-7a440
```

**Checkout and payment migrated, webhook still default:**

```powershell
firebase.cmd deploy --config firebase.payments-rollback.json --only "functions:default:createPublicationCheckoutSession,functions:default:createPublicationPayment" --project reservaeldia-7a440
```

**All three migrated:**

```powershell
firebase.cmd deploy --config firebase.payments-rollback.json --only "functions:default:createPublicationCheckoutSession,functions:default:createPublicationPayment,functions:default:mercadoPagoWebhook" --project reservaeldia-7a440
```

After rollback, capture as `after-rollback.json` and compare with no migrated names:

```powershell
node.exe functions/scripts/comparePaymentsMetadata.cjs .local-isolation/payments-activation/after-rollback.json
```

The webhook is never deleted or renamed, including the all-three rollback.
An update can still produce transient errors; local planning is not a zero-downtime
guarantee. If rollback itself partially succeeds, recapture metadata and use the
same isolated config with only the remaining confirmed Payments-owned names.
Do not include endpoints already restored. Compare with the remaining migrated
names until the list is empty. Do not restore earlier Secret versions.

Keep the default/general deployment freeze after an ownership rollback: the
active core entrypoint still omits those names. Either complete migration again
using A-H, or restore the three reexports and remove the active Payments
registration in a coordinated local recovery change after all three have returned
to default. For that latter route, copy **current** normal Payments configuration
back to the ignored default dotenv without replacing shared config or adding
Secrets. Validate the 105 manifest before any future core deploy. No such recovery
change/deploy is performed by this task.

References: [Firebase codebases](https://firebase.google.com/docs/functions/organize-functions),
[environment configuration](https://firebase.google.com/docs/functions/config-env),
[Cloud Functions metadata GET](https://docs.cloud.google.com/functions/docs/reference/rest/v2/projects.locations.functions/get),
and installed CLI 14.4.0 `functionsDeployHelper`, `planner`, `prepare`, discovery
`Delegate` and `build` implementations. Rerun the offline planner if CLI changes.
