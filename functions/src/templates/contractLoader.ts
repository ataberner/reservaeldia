import { existsSync } from "fs";
import * as path from "path";
import { pathToFileURL } from "url";

type TemplateContractModule = {
  normalizeTemplateDocument: (raw: unknown, idOverride?: string) => Record<string, unknown>;
  buildCatalogFromTemplate: (template: unknown) => Record<string, unknown>;
};

let contractModulePromise: Promise<TemplateContractModule> | null = null;

function getCandidateContractPaths() {
  return [
    path.resolve(__dirname, "../shared/templates/contract.mjs"),
    path.resolve(process.cwd(), "../shared/templates/contract.js"),
    path.resolve(process.cwd(), "shared/templates/contract.js"),
    path.resolve(process.cwd(), "shared/templates/contract.mjs"),
    path.resolve(__dirname, "../../shared/templates/contract.mjs"),
    path.resolve(__dirname, "../../../shared/templates/contract.js"),
  ];
}

async function importContractModuleByPath(absolutePath: string): Promise<TemplateContractModule | null> {
  if (!existsSync(absolutePath)) return null;

  const fileUrl = pathToFileURL(absolutePath).href;
  const runtimeImport = Function(
    "modulePath",
    "return import(modulePath);"
  ) as (modulePath: string) => Promise<unknown>;
  const imported = (await runtimeImport(fileUrl)) as Record<string, unknown> | undefined;
  const resolved = (imported?.default || imported) as Partial<TemplateContractModule>;

  if (
    typeof resolved?.normalizeTemplateDocument !== "function" ||
    typeof resolved?.buildCatalogFromTemplate !== "function"
  ) {
    return null;
  }

  return {
    normalizeTemplateDocument: resolved.normalizeTemplateDocument.bind(resolved),
    buildCatalogFromTemplate: resolved.buildCatalogFromTemplate.bind(resolved),
  };
}

async function loadTemplateContractModule(): Promise<TemplateContractModule> {
  if (contractModulePromise) return contractModulePromise;

  contractModulePromise = (async () => {
    const candidates = getCandidateContractPaths();
    for (const candidate of candidates) {
      const loaded = await importContractModuleByPath(candidate);
      if (loaded) return loaded;
    }
    throw new Error("No se pudo resolver el contrato de plantillas compartido.");
  })();

  return contractModulePromise;
}

export async function normalizeTemplateContractDocument(
  raw: unknown,
  idOverride?: string
) {
  const contract = await loadTemplateContractModule();
  return contract.normalizeTemplateDocument(raw, idOverride);
}

export async function buildTemplateCatalogFromContract(template: unknown) {
  const contract = await loadTemplateContractModule();
  return contract.buildCatalogFromTemplate(template);
}
