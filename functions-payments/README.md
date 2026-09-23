# Payments source — locally activated, not deployed

This source is registered as `payments` in the local `firebase.json`.
Default exports 102 endpoints and this source exports only the three Mercado Pago
Functions. No remote transfer has been executed. Follow the qualified selectors,
verification gates and partial rollback commands in
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
