import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const ROOT = resolve(fileURLToPath(new URL("../../../..", import.meta.url)));

const SCANNED_FILES = [
  "src/components/editor/persistence/borradorSyncLoad.js",
  "src/components/editor/persistence/borradorSyncPersist.js",
  "src/components/editor/sections/useSectionsManager.js",
  "src/utils/editorSecciones.js",
  "src/hooks/useDashboardStartupLoaders.js",
  "src/hooks/useDashboardPreviewController.js",
  "src/domain/templates/authoring/service.js",
  "src/components/DashboardHeader.jsx",
];

const FORBIDDEN_PATTERNS = [
  /doc\s*\(\s*db\s*,\s*["']borradores["']/,
  /collection\s*\(\s*db\s*,\s*["']borradores["']/,
];

test("editor session modules do not access borradores directly", async () => {
  const violations = [];

  for (const relativePath of SCANNED_FILES) {
    const content = await readFile(resolve(ROOT, relativePath), "utf8");
    for (const pattern of FORBIDDEN_PATTERNS) {
      if (pattern.test(content)) {
        violations.push(`${relativePath} matched ${pattern}`);
      }
    }
  }

  assert.deepEqual(violations, []);
});
