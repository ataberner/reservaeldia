// functions/src/utils/mobileSmartLayout/stacking.ts
export function jsStackingBlock(): string {
  return `
  // Centro real del área usable (compensa padding safe-left/right)
  function computeCenterX(rootEl){
    var rootRect = rootEl.getBoundingClientRect();
    var rootW = rootRect.width || 0;

    var cs = getComputedStyle(rootEl);
    var padL = parseFloat(cs.paddingLeft) || 0;
    var padR = parseFloat(cs.paddingRight) || 0;

    var usableW = Math.max(0, rootW - padL - padR);
    var centerX = padL + usableW / 2; // centro del área usable

    return { rootW: rootW, usableW: usableW, centerX: centerX, padL: padL, padR: padR };
  }

  function clamp(n, a, b){
    if (!isFinite(n)) return a;
    return Math.max(a, Math.min(b, n));
  }

  /**
   * Apila CLUSTERS por groups (columnas/filas) y:
   * - mueve cada cluster como bloque
   * - preserva solape/posiciones relativas dentro del cluster
   * - centra el cluster como bloque en el eje X (sin transform)
   *
   * Devuelve changed + neededHeight (para expandir sección)
   */
  function applyClusterStack(groups, rootEl, CFG){
    var info = computeCenterX(rootEl);
    var centerX = info.centerX;

    var changed = false;

    // --- Anchor global: dónde estaba “el bloque” originalmente ---
    var firstGroup = groups[0] || [];
    var anchor = Infinity;
    for (var i=0;i<firstGroup.length;i++){
      anchor = Math.min(anchor, firstGroup[i].top);
    }
    if (!isFinite(anchor)) anchor = CFG.PAD_TOP;
    anchor = Math.max(CFG.PAD_TOP, anchor);

    // Cursor global: dónde termina el contenido apilado hasta ahora
    var globalCursor = anchor;

    // Separación entre columnas apiladas (izq, centro, der)
    var GROUP_GAP = 14;

    for (var g=0; g<groups.length; g++){
      var col = groups[g] || [];
      if (!col.length) continue;

      // Offset vertical original de esta columna respecto del anchor
      var colMinTop = Infinity;
      for (var k=0;k<col.length;k++){
        colMinTop = Math.min(colMinTop, col[k].top);
      }
      if (!isFinite(colMinTop)) colMinTop = anchor;

      var colOffset = colMinTop - anchor;
      var colStart = globalCursor + (g === 0 ? 0 : GROUP_GAP) + Math.max(0, colOffset);

      // Cursor local de esta columna
      var colCursor = colStart;

      for (var j=0; j<col.length; j++){
        var c = col[j];

        // Top del cluster en el flujo mobile
        var clusterTop;

        if (j === 0) {
          clusterTop = colCursor;
        } else {
          var prevC = col[j-1];
          var prevBottom = (clusterTopPrev + prevC.height);

          // ✅ Gap original entre clusters (canvas)
          var gapOrig = c.top - (prevC.top + prevC.height);
          if (!isFinite(gapOrig)) gapOrig = 0;

          // ✅ Gap “mobile-friendly”: escalado + clamp
          var gapWanted = clamp(gapOrig * (CFG.GAP_SCALE || 1), CFG.MIN_GAP, CFG.MAX_GAP);

          // ✅ Anti-solape definitivo:
          //   el próximo cluster SIEMPRE empieza después del bottom real del anterior + gapWanted
          clusterTop = prevBottom + gapWanted;
        }

        // Guardamos para el próximo loop
        var clusterTopPrev = clusterTop;

        // ¿centrar este cluster?
        var forceCenter = false;
        for (var t=0; t<c.items.length; t++){
          if ((c.items[t].node.getAttribute("data-mobile-center") || "") === "force") {
            forceCenter = true;
            break;
          }
        }

        // Centrado del cluster como bloque (salvo casi full-width)
        var keepCenter = forceCenter ? true : (c.width < (info.usableW * 0.95));
        var clusterLeft = keepCenter ? (centerX - c.width / 2) : c.left;

        // Aplicar a cada item preservando offsets relativos (solape intacto)
        for (var ii=0; ii<c.items.length; ii++){
          var it = c.items[ii];

          // Opt-out total del layout (decoraciones, etc.)
          var keepLayout = (it.node.getAttribute("data-mobile-layout") || "") === "keep";
          if (keepLayout) continue;

          var newTop = clusterTop + (it._relTop || 0);
          var newLeft = clusterLeft + (it._relLeft || 0);

          // Opt-out de centrado (mantener left original del item)
          var keepAlign = (it.node.getAttribute("data-mobile-align") || "") === "keep";
          if (keepAlign) newLeft = it.left;

          if (Math.abs(newTop - it.top) > 0.5 || Math.abs(newLeft - it.left) > 0.5) changed = true;

          it.node.style.top = newTop + "px";
          it.node.style.left = newLeft + "px";
          it.node.style.right = "auto";
          it.node.style.marginLeft = "0px";
        }

        // Avanza el cursor local al final del cluster
        colCursor = clusterTop + c.height;
      }

      // Al terminar la columna, el cursor global baja hasta donde llegó esta columna
      globalCursor = Math.max(globalCursor, colCursor);
    }

    var needed = globalCursor + CFG.PAD_BOT;
    return { changed: changed, neededHeight: needed };
  }
`.trim();
}
