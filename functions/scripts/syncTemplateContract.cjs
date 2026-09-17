#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const artifacts = [
  {
    label: "Destinos Firebase y aislamiento local",
    sourcePath: path.resolve(__dirname, "../../shared/firebaseEnvironment.cjs"),
    targetPaths: [
      path.resolve(__dirname, "../shared/firebaseEnvironment.cjs"),
      path.resolve(__dirname, "../lib/shared/firebaseEnvironment.cjs"),
    ],
  },
  {
    label: "Ledger conversacional de Disenador AI",
    sourcePath: path.resolve(__dirname, "../../shared/designerAiConversationLedger.cjs"),
    targetPaths: [
      path.resolve(__dirname, "../shared/designerAiConversationLedger.cjs"),
      path.resolve(__dirname, "../lib/shared/designerAiConversationLedger.cjs"),
    ],
  },
  {
    label: "Contrato de capacidades de Disenador AI",
    sourcePath: path.resolve(__dirname, "../../shared/designerAiCapabilityContract.cjs"),
    targetPaths: [
      path.resolve(__dirname, "../shared/designerAiCapabilityContract.cjs"),
      path.resolve(__dirname, "../lib/shared/designerAiCapabilityContract.cjs"),
    ],
  },
  {
    label: "Contrato de identidad de portada",
    sourcePath: path.resolve(__dirname, "../../shared/coverImageContract.mjs"),
    targetPaths: [
      path.resolve(__dirname, "../shared/coverImageContract.mjs"),
      path.resolve(__dirname, "../lib/shared/coverImageContract.mjs"),
    ],
  },
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
    label: "Contrato de layout de countdown",
    sourcePath: path.resolve(
      __dirname,
      "../../shared/countdownLayoutContract.cjs"
    ),
    targetPaths: [
      path.resolve(__dirname, "../shared/countdownLayoutContract.cjs"),
      path.resolve(__dirname, "../lib/shared/countdownLayoutContract.cjs"),
    ],
  },
  {
    label: "Materializacion de presets de countdown",
    sourcePath: path.resolve(
      __dirname,
      "../../shared/countdownPresetMaterialization.cjs"
    ),
    targetPaths: [
      path.resolve(
        __dirname,
        "../shared/countdownPresetMaterialization.cjs"
      ),
      path.resolve(
        __dirname,
        "../lib/shared/countdownPresetMaterialization.cjs"
      ),
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
    label: "Catalogo de divisores de seccion",
    sourcePath: path.resolve(__dirname, "../../shared/sectionDividerPresets.cjs"),
    targetPaths: [
      path.resolve(__dirname, "../shared/sectionDividerPresets.cjs"),
      path.resolve(__dirname, "../lib/shared/sectionDividerPresets.cjs"),
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
    label: "Contrato renderizable de iconos SVG",
    sourcePath: path.resolve(__dirname, "../../shared/iconRenderableContract.cjs"),
    targetPaths: [
      path.resolve(__dirname, "../shared/iconRenderableContract.cjs"),
      path.resolve(__dirname, "../lib/shared/iconRenderableContract.cjs"),
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

const { createHash } = require("node:crypto");
const root = path.resolve(__dirname, "../..");
const relative = file => path.relative(root, file).split(path.sep).join("/");
const digest = bytes => createHash("sha256").update(bytes).digest("hex");

// Phase classification belongs to the map's owner, not to its consumers.
function targetKind(file) {
  const name = relative(file);
  if (name.startsWith("functions/shared/")) return "input";
  if (name.startsWith("functions/lib/shared/")) return "build";
  throw new Error(`Destino sin fase definida en el mapa: ${file}`);
}

function read(file) {
  try { return { bytes: fs.readFileSync(file) }; }
  catch (error) { return { error: error.code, status: error.code === "ENOENT" ? "missing" : "unreadable" }; }
}

// Read-only, including on failure. Reports contain paths/hashes, never file bodies.
function checkTemplateContract(scope = "all") {
  if (!["input", "all"].includes(scope)) throw new Error(`Alcance inválido: ${scope}`);
  const sources = [], copies = [];
  for (const { sourcePath, targetPaths } of artifacts) {
    const source = read(sourcePath);
    sources.push({ path: relative(sourcePath), status: source.bytes ? "readable" : source.status,
      error: source.error, sha256: source.bytes && digest(source.bytes) });
    for (const target of targetPaths) {
      const kind = targetKind(target);
      if (scope === "input" && kind !== "input") continue;
      const copy = read(target);
      const status = !source.bytes ? "source-unavailable" : !copy.bytes ? copy.status : source.bytes.equals(copy.bytes) ? "equal" : "different";
      let firstDifferentByte;
      if (status === "different") {
        firstDifferentByte = 0;
        while (firstDifferentByte < Math.min(source.bytes.length, copy.bytes.length) && source.bytes[firstDifferentByte] === copy.bytes[firstDifferentByte]) firstDifferentByte++;
      }
      copies.push({ source: relative(sourcePath), target: relative(target), kind, status, error: copy.error,
        sourceSha256: source.bytes && digest(source.bytes), targetSha256: copy.bytes && digest(copy.bytes),
        sourceBytes: source.bytes?.length, targetBytes: copy.bytes?.length, firstDifferentByte });
    }
  }
  return { scope, ok: sources.every(s => s.status === "readable") && copies.every(c => c.status === "equal"), sources, copies };
}

function syncTemplateContract() {
  const before = checkTemplateContract();
  // Read every canonical source before any write: missing sources never produce
  // a partial successful synchronization or remove unrelated files.
  const contents = new Map(artifacts.map(a => [a.sourcePath, fs.readFileSync(a.sourcePath)]));
  for (const { sourcePath, targetPaths } of artifacts) {
    const bytes = contents.get(sourcePath);
    for (const target of targetPaths) {
      const current = read(target);
      if (current.bytes?.equals(bytes)) continue;
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, bytes);
    }
  }
  const after = checkTemplateContract();
  if (!after.ok) throw new Error(`Sincronización inconsistente: ${JSON.stringify(after)}`);
  return { ok: true, changed: before.copies.filter(c => c.status !== "equal"), checked: after.copies.length };
}

// Human-readable CLI output stays separate from the machine-readable report.
function formatCheckDiagnostic(result) {
  if (result.ok) return "";
  const command = result.scope === "input" ? "contracts:check" : "contracts:check:built";
  const lines = [`${command}: falló la comprobación de contratos. No se modificó ningún archivo.`];
  for (const source of result.sources.filter(s => s.status !== "readable")) {
    lines.push(`Fuente canónica ${source.path}: ${source.status === "missing" ? "no existe" : "no se pudo leer"} (${source.error}). Restaurá la fuente o resolvé su lectura antes de sincronizar.`);
  }
  for (const copy of result.copies.filter(c => c.status !== "equal")) {
    lines.push(`Copia ${copy.target} (${copy.kind === "input" ? "entrada" : "build"}); fuente canónica: ${copy.source}.`);
    if (copy.status === "different") {
      lines.push(`  Copia desactualizada: sus bytes difieren de la fuente (primer byte distinto, índice desde 0: ${copy.firstDifferentByte}; fuente: ${copy.sourceBytes} bytes; copia: ${copy.targetBytes} bytes).`);
      lines.push("  Puede haber cambiado la fuente sin sincronizar, o haberse editado la copia; el chequeo no determina cuál ocurrió.");
    } else if (copy.status === "missing") {
      lines.push(`  La copia no existe (${copy.error}); falta generar o sincronizar este destino.`);
    } else if (copy.status === "unreadable") {
      lines.push(`  No se pudo leer la copia (${copy.error}); revisá el acceso y que la ruta sea un archivo antes de sincronizar.`);
    } else if (copy.status === "source-unavailable") {
      lines.push("  No se pudo comparar porque la fuente canónica no está disponible.");
    }
  }
  lines.push("Una vez revisadas las fuentes y resueltos los errores de lectura, para actualizar las copias ejecutá desde la raíz de este árbol:",
    "  npm --prefix functions run contracts:sync",
    "Este comando escribe las copias mapeadas de entrada y build; no compila TypeScript. No edites las copias generadas.",
    "Después volvé a comprobar:", `  npm --prefix functions run ${command}`);
  return lines.join("\n");
}

// Importing the authority (lint, tests, watch) never performs copies.
if (require.main === module) {
  try {
    const args = process.argv.slice(2);
    if (!args.length) console.log(JSON.stringify(syncTemplateContract(), null, 2));
    else if (args[0] === "--check" && args.length <= 2 && (!args[1] || args[1] === "--input")) {
      const result = checkTemplateContract(args[1] ? "input" : "all");
      console.log(JSON.stringify(result, null, 2));
      if (!result.ok) console.error(formatCheckDiagnostic(result));
      process.exitCode = result.ok ? 0 : 1;
    } else throw new Error("Uso: syncTemplateContract.cjs [--check [--input]]");
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { artifacts, targetKind, checkTemplateContract, syncTemplateContract };
