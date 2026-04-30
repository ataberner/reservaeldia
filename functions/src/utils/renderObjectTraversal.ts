export function normalizeRenderObjectType(value: any): string {
  return String(value || "").trim().toLowerCase();
}

export function isRenderObjectRecord(value: any): value is Record<string, any> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function collectRenderObjectsDeep(objetos: any[]): any[] {
  const collected: any[] = [];

  function visit(objeto: any) {
    if (!isRenderObjectRecord(objeto)) return;

    collected.push(objeto);

    if (normalizeRenderObjectType(objeto.tipo) !== "grupo") return;
    if (!Array.isArray(objeto.children)) return;

    objeto.children.forEach((child) => visit(child));
  }

  (Array.isArray(objetos) ? objetos : []).forEach((objeto) => visit(objeto));
  return collected;
}

export function hasRenderObjectDeep(
  objetos: any[],
  predicate: (objeto: any) => boolean
): boolean {
  return collectRenderObjectsDeep(objetos).some(predicate);
}

