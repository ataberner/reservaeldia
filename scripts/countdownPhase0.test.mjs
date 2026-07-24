import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import phase0 from "./countdownPhase0.cjs";

const {
  BACKUP_FORMAT,
  FORMAT_VERSION,
  assertRestorableAssetPath,
  assertRestorableDocumentPath,
  buildInventory,
  buildManifestIntegrity,
  countHtmlCountdownRoots,
  decodeFirestoreValue,
  encodeFirestoreValue,
  stableStringify,
  summarizeReferenceDocument,
  verifyBackupDirectory,
} = phase0;

test("inventory summarizes countdown aliases, schema and preset references without mutation", () => {
  const sourceData = {
    objetos: [
      {
        id: "group",
        tipo: "grupo",
        children: [
          {
            id: "count-legacy",
            tipo: "countdown",
            targetISO: "2030-01-01T00:00:00.000Z",
            countdownSchemaVersion: 1,
            presetId: "legacy-one",
            presetVersion: 1,
          },
        ],
      },
    ],
  };
  const snapshot = {
    id: "draft-a",
    ref: { path: "borradores/draft-a" },
    data: () => sourceData,
  };

  const summary = summarizeReferenceDocument("borradores", snapshot);
  assert.equal(summary.countdownCount, 1);
  assert.deepEqual(summary.presetReferences, { "legacy-one@1": 1 });
  assert.deepEqual(summary.countdowns[0].aliases, ["targetISO"]);
  assert.equal(summary.countdowns[0].legacyBranchUsed, true);
  assert.equal(sourceData.objetos[0].children[0].fechaObjetivo, undefined);
});

test("inventory treats activeVersion zero as the existing no-active-version sentinel", () => {
  const inventory = buildInventory(
    {
      projectId: "test-project",
      bucketName: "test-bucket",
    },
    {
      presetRecords: [
        {
          rootSnapshot: { id: "draft-with-zero-version" },
          summary: {
            id: "draft-with-zero-version",
            activeVersion: 0,
            hasDraft: true,
            publishedVersions: [],
          },
        },
      ],
      referenceSummaries: [],
      publicationArtifacts: [],
      countdownAssets: [],
    }
  );

  assert.equal(inventory.summary.activePresetCount, 0);
  assert.equal(inventory.summary.riskCount, 0);
  assert.deepEqual(inventory.risks, []);
});

test("Firestore backup codec preserves special values", () => {
  const timestamp = {
    seconds: 123,
    nanoseconds: 456,
    toDate: () => new Date("1970-01-01T00:02:03.000Z"),
  };
  const encoded = encodeFirestoreValue({
    timestamp,
    bytes: Buffer.from("countdown"),
    infinity: Number.POSITIVE_INFINITY,
  });
  const decoded = decodeFirestoreValue(encoded, {
    doc: (documentPath) => ({ path: documentPath }),
  });

  assert.equal(decoded.timestamp.seconds, 123);
  assert.equal(decoded.timestamp.nanoseconds, 456);
  assert.equal(decoded.bytes.toString("utf8"), "countdown");
  assert.equal(decoded.infinity, Number.POSITIVE_INFINITY);
});

test("restore allowlist accepts only Phase 0 document and asset scopes", () => {
  assert.doesNotThrow(() =>
    assertRestorableDocumentPath("countdownPresets/editorial")
  );
  assert.doesNotThrow(() =>
    assertRestorableDocumentPath("countdownPresets/editorial/versions/3")
  );
  assert.doesNotThrow(() =>
    assertRestorableDocumentPath("borradores/draft-a")
  );
  assert.throws(() =>
    assertRestorableDocumentPath("usuarios/private-user")
  );

  assert.doesNotThrow(() =>
    assertRestorableAssetPath("assets/countdown/frames/editorial/v3/frame.svg")
  );
  assert.doesNotThrow(() =>
    assertRestorableAssetPath("publicadas/invitacion/index.html")
  );
  assert.throws(() =>
    assertRestorableAssetPath("usuarios/private/avatar.png")
  );
});

test("backup verification detects manifest and asset corruption", () => {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "countdown-phase0-backup-test-")
  );
  try {
    fs.mkdirSync(path.join(directory, "files"), { recursive: true });
    const bytes = Buffer.from("asset-bytes");
    const assetHash = crypto.createHash("sha256").update(bytes).digest("hex");
    fs.writeFileSync(path.join(directory, "files", assetHash), bytes);

    const manifestWithoutIntegrity = {
      format: BACKUP_FORMAT,
      formatVersion: FORMAT_VERSION,
      generatedAt: "2030-01-01T00:00:00.000Z",
      source: {
        projectId: "test-project",
        bucketName: "test-bucket",
      },
      scope: {
        firestoreDocuments: 1,
        storageAssets: 1,
        collections: ["countdownPresets"],
      },
      inventory: {},
      documents: [
        {
          path: "countdownPresets/test",
          data: { estado: "published" },
        },
      ],
      assets: [
        {
          path: "assets/countdown/test.svg",
          archivePath: `files/${assetHash}`,
          sha256: assetHash,
          size: bytes.length,
          metadata: {},
        },
      ],
    };
    const manifest = {
      ...manifestWithoutIntegrity,
      integrity: buildManifestIntegrity(manifestWithoutIntegrity),
    };
    fs.writeFileSync(
      path.join(directory, "manifest.json"),
      `${JSON.stringify(manifest, null, 2)}\n`
    );

    assert.equal(verifyBackupDirectory(directory).valid, true);
    fs.writeFileSync(path.join(directory, "files", assetHash), "tampered");
    const corrupted = verifyBackupDirectory(directory);
    assert.equal(corrupted.valid, false);
    assert.equal(
      corrupted.errors.includes(
        "asset-sha256-mismatch:assets/countdown/test.svg"
      ),
      true
    );
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("published artifact inventory counts countdown roots only", () => {
  assert.equal(
    countHtmlCountdownRoots(
      '<div data-countdown data-target="x"></div><div data-countdown-v2="1"></div>'
    ),
    1
  );
  assert.equal(stableStringify({ b: 2, a: 1 }), '{"a":1,"b":2}');
});
