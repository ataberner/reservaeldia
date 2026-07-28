# Provider directory command snippets

Status: Operational Convenience Reference (Non-Canonical).

These snippets are short operator templates. The safety gates, exact behavior,
parallel-process restrictions, and recovery explanation are owned by
[`README.md`](README.md); the data contract is owned by
[`../../docs/architecture/PROVIDER_DATA_MODEL.md`](../../docs/architecture/PROVIDER_DATA_MODEL.md).
Replace every placeholder and review the corresponding runbook section before
running a remote command.

On Windows, use `npm.cmd` when the PowerShell execution policy blocks
`npm.ps1`.

## Local JSON/CSV dry-run

```powershell
npm.cmd run providers:import:dry -- --input="C:\private\providers.json" --limit=10
```

For the implemented CSV adapter, add
`--input-format=csv --category=foto-video`.

## One-provider enrichment dry-run

```powershell
npm.cmd run providers:enrich:dry -- --provider-id=pcar_HEX24 --project=EXPECTED_PROJECT_ID --confirm-project=EXPECTED_PROJECT_ID "--credentials=C:\private\provider-enrichment-service-account.json"
```

## Durable mass enrichment apply

```powershell
npm.cmd run providers:enrich:apply -- --limit=10 --concurrency=2 --complete-gallery --max-gallery-images=100 --project=EXPECTED_PROJECT_ID --confirm-project=EXPECTED_PROJECT_ID "--credentials=C:\private\provider-enrichment-service-account.json" "--resume-state=C:\private\providers\provider-enrichment-state.json" "--report=artifacts\providers\runtime\provider-enrichment-apply.json"
```

Resume by repeating that exact reviewed command with the same input scope and
state path. Press Ctrl+C once to request a controlled interruption, then wait
for checkpoint/final output before closing the terminal.

## Corrupt checkpoint or stale-lock recovery

A corrupt primary with a valid backup needs no special flag: repeat the normal
resume command. For an abandoned lock, first verify that the recorded PID is
dead, then append both flags:

```powershell
--recover-stale-lock --confirm-stale-lock=RECORDED_DEAD_PID
```

Never delete or hand-edit state/lock files, and never start a second process
against the same provider scope.

## Focused tests

```powershell
npm.cmd run providers:enrich:test
npm.cmd run providers:enrich:test:emulator
```

The second command starts only the demo Firestore/Storage emulators configured
by the repository; it must never be repointed to a real project.
