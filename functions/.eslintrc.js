const path = require("node:path");
const { artifacts } = require("./scripts/syncTemplateContract.cjs");
// These shared CommonJS contracts have no .d.cts declarations. Native require
// preserves their synchronous exports without adding ambient any declarations
// or changing the production TS project. Permit only exact mapped copy paths;
// their canonical JavaScript is linted by the same command.
const sharedRequires = artifacts.flatMap(({ targetPaths }) => targetPaths)
  .filter(file => file.endsWith(".cjs") && file.startsWith(path.join(__dirname, "shared") + path.sep))
  .map(file => "^\\.\\./(?:\\.\\./)?" + path.relative(__dirname, file).replace(/\\/g, "/").replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$");

module.exports = {
  root: true,
  env: { node: true, es2022: true },
  parserOptions: { ecmaVersion: "latest", sourceType: "module" },
  extends: ["eslint:recommended"],
  rules: {
    // Preserve the existing unused-variable warning policy in JavaScript too.
    "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
  },
  overrides: [
    // Functions package defaults to CommonJS. Canonical ESM .js sources live
    // outside this config directory and retain the base module parser mode.
    { files: ["**/*.js", "**/*.cjs"], parserOptions: { sourceType: "script" } },
    {
      files: ["**/*.ts", "**/*.tsx"],
      parser: "@typescript-eslint/parser",
      parserOptions: { project: null, tsconfigRootDir: __dirname },
      plugins: ["@typescript-eslint"],
      extends: ["plugin:@typescript-eslint/recommended"],
      rules: {
        "@typescript-eslint/no-explicit-any": "warn",
        "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
        "@typescript-eslint/no-var-requires": ["error", { allow: sharedRequires }],
      },
    },
    // Only production sources belong to this project. Scripts/tests outside src
    // use syntax-aware lint, without expanding the production tsconfig.
    { files: ["src/**/*.ts", "src/**/*.tsx"], parserOptions: { project: ["./tsconfig.json"] } },
  ],
  ignorePatterns: ["lib/", "node_modules/"],
};
