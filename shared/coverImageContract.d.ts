export type CoverImageSource =
  | { kind: "canvas-object"; objectId: string }
  | { kind: "section-background"; sectionId: string };

export declare const COVER_IMAGE_SOURCE_KINDS: Readonly<{
  CANVAS_OBJECT: "canvas-object";
  SECTION_BACKGROUND: "section-background";
}>;

export declare function normalizeCoverImageSource(
  value: unknown
): CoverImageSource | null;
