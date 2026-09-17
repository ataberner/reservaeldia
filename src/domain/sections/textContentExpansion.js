import { forEachRenderObject } from "../editor/renderObjectTree.js";
import { canMutateSection } from "../editor/protectedSections.js";

// Called only by text-content mutations, never by hydration, history or gestures.
// Measurement is supplied by the canvas adapter, in section-local coordinates.
export function expandSectionsForTextChanges({
  previousObjects,
  nextObjects,
  sections,
  measureTextBottom,
}) {
  if (previousObjects === nextObjects || typeof measureTextBottom !== "function") {
    return sections;
  }
  const previousById = new Map();
  forEachRenderObject(previousObjects, (object) => previousById.set(object.id, object));
  const sectionsById = new Map(sections.map((section) => [section.id, section]));
  const requiredHeights = new Map();

  forEachRenderObject(nextObjects, (object, { parentGroup }) => {
    const previous = previousById.get(object.id);
    if (object.tipo !== "texto" || previous?.tipo !== "texto") return;
    if (String(previous.texto ?? "") === String(object.texto ?? "")) return;

    const rootObject = parentGroup || object;
    const section = sectionsById.get(rootObject.seccionId);
    if (!section || !canMutateSection(section)) return;
    if (String(section.altoModo || "fijo").toLowerCase() === "pantalla") return;
    const currentHeight = Number(section.altura);
    if (!Number.isFinite(currentHeight) || currentHeight <= 0) return;

    // Keep the same pose/style/box for both measurements: only content can grow it.
    const beforeBottom = measureTextBottom({ object, rootObject, text: previous.texto });
    const afterBottom = measureTextBottom({ object, rootObject, text: object.texto });
    if (!Number.isFinite(beforeBottom) || !Number.isFinite(afterBottom)) return;
    if (afterBottom <= beforeBottom || afterBottom <= currentHeight) return;
    requiredHeights.set(
      section.id,
      Math.max(requiredHeights.get(section.id) || currentHeight, afterBottom)
    );
  });

  if (!requiredHeights.size) return sections;
  return sections.map((section) => requiredHeights.has(section.id)
    ? { ...section, altura: requiredHeights.get(section.id) }
    : section);
}
