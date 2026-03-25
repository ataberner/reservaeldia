import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const FUNCTIONS_ROOT = dirname(__dirname);

export function requireBuiltModule(relativePath) {
  const absolutePath = join(FUNCTIONS_ROOT, relativePath);
  if (!existsSync(absolutePath)) {
    throw new Error(
      `Missing built module '${relativePath}'. Run 'npm run build' inside functions before running this test.`
    );
  }

  return require(absolutePath);
}

