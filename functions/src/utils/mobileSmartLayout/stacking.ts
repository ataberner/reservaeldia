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
  function applyClusterStack(groups, rootEl, CFG, mode){
    var info = computeCenterX(rootEl);
    var centerX = info.centerX;
    mslLog("stack:start", {
      groupCount: groups.length,
      groupSizes: groups.map(function(g){ return g.length; }),
      centerX: +centerX.toFixed(1),
      usableW: +info.usableW.toFixed(1)
    });

    var changed = false;
    var isMultiColLayout = (mode === "two" || mode === "three");

    // En multi-columna: apilar columnas una debajo de otra en una misma
    // "columna visual" centrada.
    var stackColWidth = 0;
    if (isMultiColLayout){
      for (var g0=0; g0<groups.length; g0++){
        var grp0 = groups[g0] || [];
        if (!grp0.length) continue;
        var gMin = Infinity;
        var gMax = -Infinity;
        for (var c0=0; c0<grp0.length; c0++){
          var cl0 = grp0[c0];
          gMin = Math.min(gMin, cl0.left);
          gMax = Math.max(gMax, cl0.left + cl0.width);
        }
        var gWidth = Math.max(0, gMax - gMin);
        if (gWidth > stackColWidth) stackColWidth = gWidth;
      }
    }
    var stackColLeft = isMultiColLayout ? (centerX - stackColWidth / 2) : 0;

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

      // Métricas por grupo solo para debug.
      var groupMinLeft = Infinity;
      var groupMaxRight = -Infinity;
      if (isMultiColLayout){
        for (var gg=0; gg<col.length; gg++){
          groupMinLeft = Math.min(groupMinLeft, col[gg].left);
          groupMaxRight = Math.max(groupMaxRight, col[gg].left + col[gg].width);
        }
      }
      var groupWidth = isMultiColLayout ? Math.max(0, groupMaxRight - groupMinLeft) : 0;
      var groupBaseLeft = isMultiColLayout ? (centerX - groupWidth / 2) : 0;

      // Offset vertical original de esta columna respecto del anchor
      var colMinTop = Infinity;
      for (var k=0;k<col.length;k++){
        colMinTop = Math.min(colMinTop, col[k].top);
      }
      if (!isFinite(colMinTop)) colMinTop = anchor;

      var colOffset = colMinTop - anchor;
      var colStart = globalCursor + (g === 0 ? 0 : GROUP_GAP) + Math.max(0, colOffset);
      mslLog("stack:group:start", {
        g: g,
        colSize: col.length,
        colMinTop: +colMinTop.toFixed(1),
        colOffset: +colOffset.toFixed(1),
        colStart: +colStart.toFixed(1),
        globalCursor: +globalCursor.toFixed(1),
        mode: mode,
        stackColWidth: isMultiColLayout ? +stackColWidth.toFixed(1) : null,
        stackColLeft: isMultiColLayout ? +stackColLeft.toFixed(1) : null,
        groupMinLeft: isMultiColLayout ? +groupMinLeft.toFixed(1) : null,
        groupWidth: isMultiColLayout ? +groupWidth.toFixed(1) : null,
        groupBaseLeft: isMultiColLayout ? +groupBaseLeft.toFixed(1) : null
      });

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

        // one/rows: centro por cluster (comportamiento original)
        // two/three: apilar cada columna en la misma referencia X,
        // preservando offsets internos de esa columna.
        var keepCenter = forceCenter ? true : (c.width < (info.usableW * 0.95));
        var clusterLeft = keepCenter ? (centerX - c.width / 2) : c.left;
        if (isMultiColLayout) {
          // Modo lectura mobile: una sola columna vertical y cada cluster
          // centrado en pantalla.
          clusterLeft = centerX - c.width / 2;
        }
        mslLog("stack:cluster", {
          g: g,
          j: j,
          origTop: +c.top.toFixed(1),
          origLeft: +c.left.toFixed(1),
          newTop: +clusterTop.toFixed(1),
          newLeft: +clusterLeft.toFixed(1),
          h: +c.height.toFixed(1),
          w: +c.width.toFixed(1),
          forceCenter: forceCenter,
          keepCenter: keepCenter,
          items: c.items.length
        });

        var textCount = 0;
        for (var tc=0; tc<c.items.length; tc++){
          if ((c.items[tc].node.getAttribute("data-debug-texto") || "") === "1") textCount++;
        }
        var linearizeCluster = (mode === "rows" && c.items.length > 1 && textCount >= 2);
        var clusterBottomUsed = clusterTop + c.height;

        // Caso especial: en rows, si el cluster agrupa varios textos, lo
        // convertimos a flujo vertical centrado para evitar texto lado a lado.
        if (linearizeCluster){
          var allItems = c.items.slice();
          var nonText = allItems.filter(function(itx){
            return (itx.node.getAttribute("data-debug-texto") || "") !== "1";
          }).sort(function(a,b){
            if (a.top !== b.top) return a.top - b.top;
            return a.left - b.left;
          });
          var texts = allItems.filter(function(itx){
            return (itx.node.getAttribute("data-debug-texto") || "") === "1";
          }).sort(function(a,b){
            if (a.top !== b.top) return a.top - b.top;
            return a.left - b.left;
          });

          // Orden semántico de lectura:
          // no-texto + texto más cercano (debajo y por eje X), luego remanentes.
          var ordered = [];
          var usedText = {};

          for (var nt=0; nt<nonText.length; nt++){
            var ntItem = nonText[nt];
            ordered.push(ntItem);

            var ntCx = (ntItem.left || 0) + (ntItem.width || 0) / 2;
            var ntBottom = (ntItem.top || 0) + (ntItem.height || 0);
            var bestIdxTxt = -1;
            var bestScore = Infinity;

            for (var tx=0; tx<texts.length; tx++){
              if (usedText[tx]) continue;
              var tItem = texts[tx];
              var tCx = (tItem.left || 0) + (tItem.width || 0) / 2;
              var vGapTxt = (tItem.top || 0) - ntBottom; // preferir texto debajo
              var hDistTxt = Math.abs(tCx - ntCx);
              var penaltyAbove = vGapTxt < -2 ? 10000 : 0;
              var score = penaltyAbove + Math.abs(vGapTxt) * 2 + hDistTxt;
              if (score < bestScore){
                bestScore = score;
                bestIdxTxt = tx;
              }
            }

            if (bestIdxTxt >= 0){
              ordered.push(texts[bestIdxTxt]);
              usedText[bestIdxTxt] = true;
            }
          }

          // Textos no emparejados
          for (var tx2=0; tx2<texts.length; tx2++){
            if (!usedText[tx2]) ordered.push(texts[tx2]);
          }

          // Si no hubo no-texto, fallback simple por top/left
          if (!ordered.length) {
            ordered = allItems.sort(function(a,b){
              if (a.top !== b.top) return a.top - b.top;
              return a.left - b.left;
            });
          }

          var localCursor = clusterTop;
          var prevIt = null;
          var prevTopApplied = clusterTop;
          var EXTRA_COL_BREAK_GAP = 8;

          for (var li=0; li<ordered.length; li++){
            var lit = ordered[li];

            var keepLayoutLin = (lit.node.getAttribute("data-mobile-layout") || "") === "keep";
            if (keepLayoutLin) continue;

            var newTopLin = localCursor;
            if (prevIt){
              var gapOrigLin = lit.top - (prevIt.top + prevIt.height);
              if (!isFinite(gapOrigLin)) gapOrigLin = 0;
              var gapWantedLin = clamp(gapOrigLin * (CFG.GAP_SCALE || 1), CFG.MIN_GAP, CFG.MAX_GAP);
              var prevIsTextLin = (prevIt.node.getAttribute("data-debug-texto") || "") === "1";
              var currIsTextLin = (lit.node.getAttribute("data-debug-texto") || "") === "1";
              // Al pasar de "texto final de columna" a "nuevo no-texto" agregamos aire.
              if (prevIsTextLin && !currIsTextLin) gapWantedLin += EXTRA_COL_BREAK_GAP;
              newTopLin = prevTopApplied + prevIt.height + gapWantedLin;
            }

            var newLeftLin = centerX - (lit.width || 0) / 2;
            var keepAlignLin = (lit.node.getAttribute("data-mobile-align") || "") === "keep";
            if (keepAlignLin) newLeftLin = lit.left;

            if (Math.abs(newTopLin - lit.top) > 0.5 || Math.abs(newLeftLin - lit.left) > 0.5) changed = true;

            // En rows linealizado, forzamos centrado visual real de texto.
            var isTextLin = (lit.node.getAttribute("data-debug-texto") || "") === "1";
            if (isTextLin && !keepAlignLin) {
              lit.node.style.textAlign = "center";
              lit.node.style.transformOrigin = "top center";
              lit.node.style.setProperty("--text-zoom", "1");
              var tfLin = lit.node.style.transform || "";
              if (tfLin.indexOf("translateX(") !== -1) {
                lit.node.style.transform = tfLin.replace(/translateX\([^)]*\)/, "translateX(0px)");
              }
            }

            lit.node.style.top = newTopLin + "px";
            lit.node.style.left = newLeftLin + "px";
            lit.node.style.right = "auto";
            lit.node.style.marginLeft = "0px";

            prevIt = lit;
            prevTopApplied = newTopLin;
            localCursor = newTopLin + (lit.height || 0);
            if (localCursor > clusterBottomUsed) clusterBottomUsed = localCursor;
          }

          colCursor = Math.max(colCursor, clusterBottomUsed);
          continue;
        }

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

          // En textos, neutralizamos el corrimiento horizontal propio del
          // align original (translateX(...)) para que el centrado mobile sea real.
          var isTextNode = (it.node.getAttribute("data-debug-texto") || "") === "1";
          if (isTextNode && isMultiColLayout) {
            var taMc = ((it.node.style && it.node.style.textAlign) || "").toLowerCase();
            var isCenteredText = taMc === "center";
            if (isCenteredText) {
              var tf = it.node.style.transform || "";
              if (tf.indexOf("translateX(") !== -1) {
                it.node.style.transform = tf.replace(/translateX\([^)]*\)/, "translateX(0px)");
              }
            }
          }

          it.node.style.top = newTop + "px";
          it.node.style.left = newLeft + "px";
          it.node.style.right = "auto";
          it.node.style.marginLeft = "0px";
          var itemBottom = newTop + (it.height || 0);
          if (itemBottom > clusterBottomUsed) clusterBottomUsed = itemBottom;
        }

        // Avanza el cursor local al final del cluster
        colCursor = Math.max(colCursor, clusterBottomUsed);
      }

      // Al terminar la columna, el cursor global baja hasta donde llegó esta columna
      globalCursor = Math.max(globalCursor, colCursor);
    }

    var needed = globalCursor + CFG.PAD_BOT;
    mslLog("stack:end", {
      changed: changed,
      neededHeight: +needed.toFixed(1),
      finalCursor: +globalCursor.toFixed(1)
    });
    return { changed: changed, neededHeight: needed };
  }
`.trim();
}
