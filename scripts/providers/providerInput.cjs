"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const PROVIDER_INPUT_FORMATS = new Set(["json", "csv"]);
const CSV_PROVIDER_HEADERS = Object.freeze([
  "nombre",
  "pagina",
  "sitio_web",
  "telefono",
  "email",
  "direccion",
  "calle",
  "localidad",
  "provincia",
  "codigo_postal",
  "pais",
  "tipo_schema",
]);
const CSV_FOTO_VIDEO_CATEGORY = "foto-video";
const CSV_FOTO_VIDEO_TRACE_FILE = "proveedores-contacto.csv";
const CSV_FOTO_VIDEO_EXTRACTION_SOURCE = "csv-contactos-foto-video";

function normalizeInputFormat(value, inputPath) {
  const explicit = String(value || "").trim().toLowerCase();
  if (explicit) {
    if (!PROVIDER_INPUT_FORMATS.has(explicit)) {
      throw new Error("--input-format debe ser json o csv.");
    }
    return explicit;
  }

  const extension = path.extname(String(inputPath || "")).toLowerCase();
  if (extension === ".json") return "json";
  if (extension === ".csv") return "csv";
  throw new Error(
    "No se pudo detectar el formato; use --input-format=json o --input-format=csv."
  );
}

function parseCsvRows(text) {
  const input = String(text || "").replace(/^\uFEFF/, "");
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (quoted) {
      if (character === '"') {
        if (input[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += character;
      }
      continue;
    }

    if (character === '"') {
      if (field.length > 0) {
        throw new Error(
          `CSV inválido: comilla inesperada en la fila ${rows.length + 1}.`
        );
      }
      quoted = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n" || character === "\r") {
      if (character === "\r" && input[index + 1] === "\n") index += 1;
      row.push(field);
      field = "";
      if (row.some((value) => value !== "")) rows.push(row);
      row = [];
    } else {
      field += character;
    }
  }

  if (quoted) {
    throw new Error("CSV inválido: campo entre comillas sin cierre.");
  }
  row.push(field);
  if (row.some((value) => value !== "")) rows.push(row);
  return rows;
}

function parseProviderCsv(text) {
  const rows = parseCsvRows(text);
  if (rows.length === 0) throw new Error("El CSV está vacío.");

  const headers = rows[0].map((header) => header.trim());
  if (new Set(headers).size !== headers.length) {
    throw new Error("El CSV contiene encabezados duplicados.");
  }
  const missing = CSV_PROVIDER_HEADERS.filter(
    (header) => !headers.includes(header)
  );
  const unexpected = headers.filter(
    (header) => !CSV_PROVIDER_HEADERS.includes(header)
  );
  if (missing.length > 0 || unexpected.length > 0) {
    throw new Error(
      `Encabezados CSV incompatibles; faltan: ${missing.join(",") || "ninguno"}; ` +
        `sobran: ${unexpected.join(",") || "ninguno"}.`
    );
  }

  return rows.slice(1).map((values, rowIndex) => {
    if (values.length !== headers.length) {
      throw new Error(
        `CSV inválido: la fila ${rowIndex + 2} tiene ${values.length} campos; ` +
          `se esperaban ${headers.length}.`
      );
    }
    return Object.fromEntries(
      headers.map((header, index) => [header, values[index]])
    );
  });
}

function adaptFotoVideoCsv(rows, { category }) {
  if (category !== CSV_FOTO_VIDEO_CATEGORY) {
    throw new Error(
      "El adaptador CSV actual requiere --category=foto-video."
    );
  }
  return rows.map((row) => ({
    ...row,
    categoria: CSV_FOTO_VIDEO_CATEGORY,
    fuente_extraccion: CSV_FOTO_VIDEO_EXTRACTION_SOURCE,
  }));
}

function readProviderInputFile(
  inputPath,
  { inputFormat = "", category = "", contract }
) {
  if (!contract || typeof contract.parseProviderSourceFile !== "function") {
    throw new Error("Falta el contrato compilado de proveedores.");
  }

  const absolutePath = path.resolve(process.cwd(), inputPath);
  const bytes = fs.readFileSync(absolutePath);
  const raw = bytes.toString("utf8");
  const format = normalizeInputFormat(inputFormat, absolutePath);
  const inputHashSha256 = crypto
    .createHash("sha256")
    .update(bytes)
    .digest("hex");

  if (format === "json") {
    if (category) {
      throw new Error("--category solo está permitido con --input-format=csv.");
    }
    let parsed;
    try {
      parsed = JSON.parse(raw.replace(/^\uFEFF/, ""));
    } catch (error) {
      throw new Error(`El archivo no contiene JSON válido: ${error.message}`);
    }
    return {
      absolutePath,
      fileName: path.basename(absolutePath),
      inputFormat: format,
      inputHashSha256,
      inputDiagnostics: {
        utf8BomRemoved: raw.charCodeAt(0) === 0xfeff,
        csvRows: null,
      },
      envelope: contract.parseProviderSourceFile(parsed),
    };
  }

  const rows = parseProviderCsv(raw);
  const adaptedRows = adaptFotoVideoCsv(rows, { category });
  const fileStat = fs.statSync(absolutePath);
  const envelope = contract.parseProviderSourceFile({
    version: 1,
    createdAt: fileStat.mtime.toISOString(),
    reason: CSV_FOTO_VIDEO_EXTRACTION_SOURCE,
    origin: "https://www.portalcasamientos.com.ar",
    providerUrls: [],
    results: adaptedRows,
  });
  return {
    absolutePath,
    fileName: CSV_FOTO_VIDEO_TRACE_FILE,
    inputFormat: format,
    inputHashSha256,
    inputDiagnostics: {
      utf8BomRemoved: raw.charCodeAt(0) === 0xfeff,
      csvRows: adaptedRows.length,
    },
    envelope,
  };
}

module.exports = {
  CSV_FOTO_VIDEO_CATEGORY,
  CSV_FOTO_VIDEO_EXTRACTION_SOURCE,
  CSV_FOTO_VIDEO_TRACE_FILE,
  CSV_PROVIDER_HEADERS,
  adaptFotoVideoCsv,
  normalizeInputFormat,
  parseCsvRows,
  parseProviderCsv,
  readProviderInputFile,
};
