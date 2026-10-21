// Layer.drawHit clears the entire hit canvas even when Konva will paint nothing.
// Keep the first clear (old hit targets must disappear), then reuse only the
// proven-empty bitmap. Scene drawing and Konva's hit eligibility stay unchanged.
export function createKonvaLayerHitDraw(layer, originalDrawHit) {
  let emptyCanvas = null;
  let emptyWidth = 0;
  let emptyHeight = 0;

  return function drawHitWithEmptyCanvasReuse(...args) {
    const ordinaryDraw =
      this === layer &&
      args.length === 0 &&
      !layer.__canvasFreezeState &&
      layer.clearBeforeDraw();

    // A cached layer or arbitrary layer clip function can paint without an
    // eligible child. Custom child drawHit implementations are also delegated.
    const paintsNothing = ordinaryDraw && (
      !layer.shouldDrawHit() ||
      (!layer.isCached() && !layer.clipFunc() && layer.getChildren().every(
        (child) => !Object.hasOwn(child, "drawHit") && !child.shouldDrawHit()
      ))
    );

    const canvas = paintsNothing ? layer.getHitCanvas() : null;
    const width = canvas?.getWidth();
    const height = canvas?.getHeight();
    if (canvas && canvas === emptyCanvas && width === emptyWidth && height === emptyHeight) {
      return this;
    }

    // Invalidate before delegation: exceptions, custom draws and restored hit
    // eligibility must never leave evidence of an empty bitmap behind.
    emptyCanvas = null;
    const result = originalDrawHit.apply(this, args);
    if (canvas) {
      emptyCanvas = canvas;
      emptyWidth = width;
      emptyHeight = height;
    }
    return result;
  };
}
