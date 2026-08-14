import runtime from "./iconRenderableContract.cjs";

export const ICON_RENDER_SCHEMA_VERSION = runtime.ICON_RENDER_SCHEMA_VERSION;
export const ICON_RENDER_CONTRACT_ID = runtime.ICON_RENDER_CONTRACT_ID;
export const ICON_RENDER_MAX_SVG_BYTES = runtime.ICON_RENDER_MAX_SVG_BYTES;
export const DEFAULT_ICON_COLOR = runtime.DEFAULT_ICON_COLOR;
export const parseIconViewBox = runtime.parseViewBox;
export const normalizeIconColor = runtime.normalizeIconColor;
export const normalizeIconRenderable = runtime.normalizeIconRenderable;
export const isCanonicalSvgIconRenderable = runtime.isCanonicalSvgIconRenderable;
export const buildIconSvgMarkup = runtime.buildIconSvgMarkup;
export const buildIconSvgDataUrl = runtime.buildIconSvgDataUrl;
export const computeIconContainRect = runtime.computeIconContainRect;

export default runtime;
