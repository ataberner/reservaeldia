import { hasSharedRenderAssetAccess } from "./renderAssetCatalogAccess";
import { denyRenderAsset, hasRenderReferenceControlCharacter, parseRenderAssetReference, type RenderAssetReference } from "./renderAssetReference";

/** Constructed only after the caller verifies the persisted document/actor. */
export type RenderAssetAccessContext =
  | { kind: "draft"; ownerUid: string; draftId: string }
  | { kind: "template"; actorUid: string; templateId: string };

function validSegment(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value === value.trim() &&
    !/[\\/%?#]/.test(value) && !hasRenderReferenceControlCharacter(value) && value !== "." && value !== "..";
}

export function requireRenderAssetAccessContext(value: unknown): RenderAssetAccessContext {
  if (!value || typeof value !== "object") denyRenderAsset();
  const context = value as Record<string, unknown>;
  if (context.kind === "draft" && validSegment(context.ownerUid) && validSegment(context.draftId)) {
    return Object.freeze({ kind: "draft", ownerUid: context.ownerUid, draftId: context.draftId });
  }
  if (context.kind === "template" && validSegment(context.actorUid) && validSegment(context.templateId)) {
    return Object.freeze({ kind: "template", actorUid: context.actorUid, templateId: context.templateId });
  }
  return denyRenderAsset();
}

export function createRenderAssetAuthorizer(contextValue: unknown, bucketName: string): {
  authorize: (value: string) => Promise<RenderAssetReference>;
} {
  const context = requireRenderAssetAccessContext(contextValue);
  const ownerUid = context.kind === "draft" ? context.ownerUid : context.actorUid;
  // This permission cache belongs to one immutable context and one render only.
  // Resolution caches are never consulted before this policy has allowed a path.
  const sharedPermissions = new Map<string, Promise<boolean>>();
  return {
    async authorize(value) {
      const reference = parseRenderAssetReference(value, bucketName);
      if (reference.kind !== "storage") return reference;
      const segments = reference.path.split("/");
      if (segments[0] === "usuarios" && segments[1] === ownerUid &&
          ["imagenes", "thumbnails"].includes(segments[2]) && segments.length >= 4) return reference;
      if (segments[0] === "thumbnails_borradores" && segments[1] === ownerUid && segments.length >= 3) return reference;

      // Never delegate a private namespace to a catalog record or admin role.
      const catalogNamespace = segments[0] === "iconos" ||
        (segments[0] === "decoraciones" && ["originals", "thumbnails"].includes(segments[1])) ||
        (segments[0] === "plantillas" && segments[2] === "assets" && segments.length >= 4) ||
        (segments[0] === "assets" && segments[1] === "countdown" &&
          ["frames", "thumbnails"].includes(segments[2]) && segments.length >= 5 &&
          !segments.includes("draft") && !segments.includes("staging"));
      if (!catalogNamespace) denyRenderAsset();
      if (!sharedPermissions.has(reference.path)) {
        sharedPermissions.set(reference.path, hasSharedRenderAssetAccess(reference.path, bucketName, context));
      }
      if (!await sharedPermissions.get(reference.path)) denyRenderAsset();
      return reference;
    },
  };
}
