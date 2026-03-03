#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const sourcePath = path.resolve(__dirname, "../../shared/templates/contract.js");
const targetPaths = [
  path.resolve(__dirname, "../shared/templates/contract.mjs"),
  path.resolve(__dirname, "../lib/shared/templates/contract.mjs"),
];

if (!fs.existsSync(sourcePath)) {
  console.error(`No se encontro el contrato compartido: ${sourcePath}`);
  process.exit(1);
}

targetPaths.forEach((targetPath) => {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.copyFileSync(sourcePath, targetPath);
});

console.log("Contrato de plantillas sincronizado en:");
targetPaths.forEach((targetPath) => console.log(`- ${targetPath}`));
