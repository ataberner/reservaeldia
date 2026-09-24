# Payments source — production migration completed

This source is registered as `payments` in `firebase.json`.
Default exports 102 endpoints and this source exports only the three Mercado Pago
Functions. On 2026-09-24 the operator confirmed successful production migration
and a real purchase through payment, webhook processing and automatic publication.
The new Public Key + Access Token v2 pair is validated. **Rotation of the exposed
`MP_WEBHOOK_SECRET` v1 remains pending** and is not part of the migration closure.
See the acceptance record, qualified selectors and retained operational rollback in
[the runbook](../docs/operations/PAYMENTS_CODEBASE_PREPARATION.md).

Canonical code remains in `functions/src` and `shared`. Build from the repository:

```powershell
npm.cmd --prefix functions run build:payments
```

`lib/` and `shared/` are generated. Never edit them. `package.json` and its lock
contain only the runtime dependencies required by Payments, at existing versions.
Install them with `npm ci` **from this directory**. The deployed package needs
neither TypeScript nor files outside this source. Empty `gcp-build` prevents
Cloud Build from trying to run the repository's local compilation workflow.

The ignored project dotenv contains only Public Key, webhook URL and the shared
Maps render configuration. No credential/configuration values are copied by the
build. Secret values must never be stored here; bindings remain declared in the
canonical entrypoint. `firebase.payments-rollback.json` uses this same isolated
source under ownership `default`, only when explicitly selected by the operator.
