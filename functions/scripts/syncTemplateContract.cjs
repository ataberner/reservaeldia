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
    label: "Detalles de evento para countdown",
    sourcePath: path.resolve(__dirname, "../../shared/countdownEventDetails.cjs"),
    targetPaths: [
      path.resolve(__dirname, "../shared/countdownEventDetails.cjs"),
      path.resolve(__dirname, "../lib/shared/countdownEventDetails.cjs"),
    ],
  },
  {
    label: "Contrato de proteccion y observabilidad de countdowns",
    sourcePath: path.resolve(__dirname, "../../shared/countdownPhase0Contract.cjs"),
    targetPaths: [
      path.resolve(__dirname, "../shared/countdownPhase0Contract.cjs"),
      path.resolve(__dirname, "../lib/shared/countdownPhase0Contract.cjs"),
    ],
  },
  {
    label: "Contrato de assets de frame de countdown",
    sourcePath: path.resolve(
      __dirname,
      "../../shared/countdownFrameAssetContract.cjs"
    ),
    targetPaths: [
      path.resolve(__dirname, "../shared/countdownFrameAssetContract.cjs"),
      path.resolve(__dirname, "../lib/shared/countdownFrameAssetContract.cjs"),
    ],
  },
  {
    label: "Geometria de frame de countdown",
    sourcePath: path.resolve(
      __dirname,
      "../../shared/countdownFrameGeometry.cjs"
    ),
    targetPaths: [
      path.resolve(__dirname, "../shared/countdownFrameGeometry.cjs"),
      path.resolve(__dirname, "../lib/shared/countdownFrameGeometry.cjs"),
    ],
  },
  {
    label: "Configuracion de modalidad de evento",
    sourcePath: path.resolve(__dirname, "../../shared/eventDetailsConfig.cjs"),
    targetPaths: [
      path.resolve(__dirname, "../shared/eventDetailsConfig.cjs"),
      path.resolve(__dirname, "../lib/shared/eventDetailsConfig.cjs"),
    ],
  },
  {
    label: "Wrapper ESM de modalidad de evento",
    sourcePath: path.resolve(__dirname, "../../shared/eventDetailsConfig.js"),
    targetPaths: [
      path.resolve(__dirname, "../shared/eventDetailsConfig.js"),
      path.resolve(__dirname, "../lib/shared/eventDetailsConfig.js"),
    ],
  },
  {
    label: "Migracion de detalles de evento",
    sourcePath: path.resolve(__dirname, "../../shared/eventDetailsMigration.cjs"),
    targetPaths: [
      path.resolve(__dirname, "../shared/eventDetailsMigration.cjs"),
      path.resolve(__dirname, "../lib/shared/eventDetailsMigration.cjs"),
    ],
  },
  {
    label: "Wrapper ESM de migracion de detalles de evento",
    sourcePath: path.resolve(__dirname, "../../shared/eventDetailsMigration.js"),
    targetPaths: [
      path.resolve(__dirname, "../shared/eventDetailsMigration.js"),
      path.resolve(__dirname, "../lib/shared/eventDetailsMigration.js"),
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
    label: "Presets de layout de galerias",
    sourcePath: path.resolve(__dirname, "../../shared/galleryLayoutPresets.cjs"),
    targetPaths: [
      path.resolve(__dirname, "../shared/galleryLayoutPresets.cjs"),
      path.resolve(__dirname, "../lib/shared/galleryLayoutPresets.cjs"),
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
  {
    label: "Asociaciones funcionales de render",
    sourcePath: path.resolve(__dirname, "../../shared/functionalAssociations.cjs"),
    targetPaths: [
      path.resolve(__dirname, "../shared/functionalAssociations.cjs"),
      path.resolve(__dirname, "../lib/shared/functionalAssociations.cjs"),
    ],
  },
  {
    label: "Presentacion del loader de invitacion",
    sourcePath: path.resolve(
      __dirname,
      "../../shared/invitationLoaderPresentation.cjs"
    ),
    targetPaths: [
      path.resolve(__dirname, "../shared/invitationLoaderPresentation.cjs"),
      path.resolve(__dirname, "../lib/shared/invitationLoaderPresentation.cjs"),
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
