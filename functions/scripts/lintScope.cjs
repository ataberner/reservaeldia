const fs = require("node:fs");
const path = require("node:path");

const extensions = [".ts", ".tsx", ".js", ".cjs", ".mjs"];

// Enumerate maintained code, including new files/directories and dotfile config.
// lib is tsc/sync output; dependency and isolated workspaces are never sources.
function functionsSources(root) {
  const files = [];
  function visit(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (["node_modules", ".git", ".local-isolation"].includes(entry.name) ||
        (directory === path.join(root, "functions") && entry.name === "lib")) continue;
      const file = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`Source symlink is not allowed: ${file}`);
      if (entry.isDirectory()) visit(file);
      else if (extensions.includes(path.extname(file))) files.push(file);
    }
  }
  visit(path.join(root, "functions"));
  return files.sort();
}

function lintScope(root) {
  const { artifacts } = require("./syncTemplateContract.cjs");
  const copies = new Map(artifacts.flatMap(({ sourcePath, targetPaths }) =>
    targetPaths.map(target => [target, sourcePath])));
  const maintained = functionsSources(root);
  const generated = maintained.filter(file => copies.has(file));
  const canonical = artifacts.map(item => item.sourcePath);
  for (const file of canonical) {
    if (!fs.statSync(file).isFile()) throw new Error(`Missing canonical source: ${file}`);
  }
  return {
    files: [...new Set([...maintained.filter(file => !copies.has(file)), ...canonical])].sort(),
    canonical: [...new Set(canonical)].sort(),
    generated: generated.map(file => ({ file, source: copies.get(file) })),
  };
}

module.exports = { extensions, functionsSources, lintScope };
