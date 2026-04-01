#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const artifacts = [
  {
    label: "Contrato de plantillas",
    sourcePath: path.resolve(__dirname, "../../shared/templates/contract.js"),
    targetPaths: [
      path.resolve(__dirname, "../shared/templates/contract.mjs"),
      path.resolve(__dirname, "../lib/shared/templates/contract.mjs"),
    ],
  },
  {
    label: "Runtime de galerias dinamicas",
    sourcePath: path.resolve(__dirname, "../../shared/templates/galleryDynamicLayout.cjs"),
    targetPaths: [
      path.resolve(__dirname, "../shared/templates/galleryDynamicLayout.cjs"),
      path.resolve(__dirname, "../lib/shared/templates/galleryDynamicLayout.cjs"),
    ],
  },
  {
    label: "Politica de contratos de render",
    sourcePath: path.resolve(__dirname, "../../shared/renderContractPolicy.cjs"),
    targetPaths: [
      path.resolve(__dirname, "../shared/renderContractPolicy.cjs"),
      path.resolve(__dirname, "../lib/shared/renderContractPolicy.cjs"),
    ],
  },
  {
    label: "Contrato de assets de render",
    sourcePath: path.resolve(__dirname, "../../shared/renderAssetContract.cjs"),
    targetPaths: [
      path.resolve(__dirname, "../shared/renderAssetContract.cjs"),
      path.resolve(__dirname, "../lib/shared/renderAssetContract.cjs"),
    ],
  },
  {
    label: "Contrato de grupos de render",
    sourcePath: path.resolve(__dirname, "../../shared/groupRenderContract.cjs"),
    targetPaths: [
      path.resolve(__dirname, "../shared/groupRenderContract.cjs"),
      path.resolve(__dirname, "../lib/shared/groupRenderContract.cjs"),
    ],
  },
];

artifacts.forEach(({ label, sourcePath, targetPaths }) => {
  if (!fs.existsSync(sourcePath)) {
    console.error(`No se encontro ${label.toLowerCase()}: ${sourcePath}`);
    process.exit(1);
  }

  targetPaths.forEach((targetPath) => {
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.copyFileSync(sourcePath, targetPath);
  });

  console.log(`${label} sincronizado en:`);
  targetPaths.forEach((targetPath) => console.log(`- ${targetPath}`));
});
