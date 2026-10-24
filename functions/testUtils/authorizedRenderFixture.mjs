import { FIXTURE_PATHS } from "../../shared/renderAssetContractFixtures.mjs";

export const AUTHORIZED_RENDER_CONTEXT = Object.freeze({
  kind: "draft", ownerUid: "render-owner", draftId: "render-draft",
});
export const AUTHORIZED_FIXTURE_PATHS = Object.freeze(Object.fromEntries(
  Object.entries(FIXTURE_PATHS).map(([key, original]) => [
    key, `usuarios/render-owner/imagenes/${key}.${original.split(".").pop()}`,
  ])
));

// Visual/validation fixtures previously mixed legacy private namespaces. Keep
// those source fixtures intact for cloning/negative tests; positive prepared
// render cases now use explicit synthetic ownership, with unchanged geometry.
export function authorizeRenderFixture(value) {
  if (typeof value === "string") {
    return Object.entries(FIXTURE_PATHS).reduce((text, [key, original]) => text
      .split(original).join(AUTHORIZED_FIXTURE_PATHS[key])
      .split(encodeURIComponent(original)).join(encodeURIComponent(AUTHORIZED_FIXTURE_PATHS[key])), value);
  }
  if (Array.isArray(value)) return value.map(authorizeRenderFixture);
  if (value && typeof value === "object") return Object.fromEntries(
    Object.entries(value).map(([key, nested]) => [key, authorizeRenderFixture(nested)])
  );
  return value;
}
