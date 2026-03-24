// functions/src/utils/mobileSmartLayout/fitScale.ts
export function jsFitScaleBlock(): string {
  return `
  function ensureFitScaleBaseline(el){
    if (!el) return;
    if (!el.hasAttribute("data-msl-fit-orig-transform")) {
      el.setAttribute("data-msl-fit-orig-transform", el.style.transform || "");
    }
    if (!el.hasAttribute("data-msl-fit-orig-origin")) {
      el.setAttribute("data-msl-fit-orig-origin", el.style.transformOrigin || "");
    }
  }

  function restoreFitScaleBaseline(el){
    if (!el) return;
    ensureFitScaleBaseline(el);
    var baseTransform = el.getAttribute("data-msl-fit-orig-transform") || "";
    var baseOrigin = el.getAttribute("data-msl-fit-orig-origin") || "";
    el.style.transform = baseTransform;
    if (baseOrigin) el.style.transformOrigin = baseOrigin;
    else el.style.removeProperty("transform-origin");
  }

  function applyElementFitScale(el, scale){
    if (!el) return;
    ensureFitScaleBaseline(el);
    var baseTransform = el.getAttribute("data-msl-fit-orig-transform") || "";
    var next = baseTransform ? (baseTransform + " scale(" + scale + ")") : ("scale(" + scale + ")");
    el.style.transform = next;
    el.style.transformOrigin = "top center";
  }

  function resetSectionFitScale(_sec, content, bleed){
    restoreFitScaleBaseline(content);
    restoreFitScaleBaseline(bleed);
  }

  function computeSectionBounds(sec, nodes){
    if (!sec || !nodes || !nodes.length) return null;
    var minLeft = Infinity;
    var minTop = Infinity;
    var maxRight = -Infinity;
    var maxBottom = -Infinity;
    var valid = 0;

    for (var i=0; i<nodes.length; i++){
      var node = nodes[i];
      if (!node) continue;
      var rr = relRect(node, sec);
      var w = Number(rr.width || 0);
      var h = Number(rr.height || 0);
      if (w <= 0.5 && h <= 0.5) continue;

      var l = Number(rr.left || 0);
      var t = Number(rr.top || 0);
      var r = l + Math.max(0, w);
      var b = t + Math.max(0, h);

      if (!isFinite(l) || !isFinite(t) || !isFinite(r) || !isFinite(b)) continue;

      minLeft = Math.min(minLeft, l);
      minTop = Math.min(minTop, t);
      maxRight = Math.max(maxRight, r);
      maxBottom = Math.max(maxBottom, b);
      valid++;
    }

    if (!valid || !isFinite(minLeft) || !isFinite(maxRight) || !isFinite(minTop) || !isFinite(maxBottom)) {
      return null;
    }

    return {
      minLeft: minLeft,
      minTop: minTop,
      maxRight: maxRight,
      maxBottom: maxBottom,
      width: Math.max(0, maxRight - minLeft),
      height: Math.max(0, maxBottom - minTop),
      count: valid
    };
  }

  function computeFitScale(sec, bounds, secModo, CFG){
    if (!sec || !bounds) return 1;
    var secRect = sec.getBoundingClientRect();
    var secW = Number(secRect.width || 0);
    var secH = Number(secRect.height || 0);
    if (secW <= 1) {
      return {
        scale: 1,
        debug: null
      };
    }

    var targetCoverage = clamp(Number(CFG.FIT_TARGET_WIDTH_RATIO || 0.94), 0.75, 0.99);
    var minFillForUpscale = clamp(Number(CFG.FIT_MIN_FILL_RATIO || 0.9), 0.6, targetCoverage);
    var minScale = clamp(Number(CFG.FIT_MIN_SCALE || 0.88), 0.7, 1);
    var maxScale = Math.max(1, Number(CFG.FIT_MAX_SCALE || 1.16));

    var contentW = Math.max(1, Number(bounds.width || 0));
    var coverage = contentW / secW;

    var scale = 1;
    var debug = {
      secW: secW,
      secH: secH,
      targetCoverage: targetCoverage,
      minFillForUpscale: minFillForUpscale,
      minScale: minScale,
      maxScale: maxScale,
      coverage: coverage,
      initialScale: 1,
      maxScaleByWidth: null,
      maxScaleByHeight: null,
      scaleAfterWidthClamp: null,
      scaleAfterHeightClamp: null,
      tinyShrinkProtected: false,
      pantallaDownscaleBlocked: false
    };
    if (coverage < minFillForUpscale) {
      scale = targetCoverage / Math.max(0.01, coverage);
    }
    debug.initialScale = scale;

    if (scale >= 1) scale = Math.min(scale, maxScale);
    else scale = Math.max(scale, minScale);

    // Límite horizontal duro por centro visual.
    var centerX = secW / 2;
    var distLeft = Math.max(0, centerX - Number(bounds.minLeft || 0));
    var distRight = Math.max(0, Number(bounds.maxRight || 0) - centerX);
    var maxScaleByWidth = Infinity;
    if (distLeft > 0.5) {
      maxScaleByWidth = Math.min(maxScaleByWidth, centerX / distLeft);
    }
    if (distRight > 0.5) {
      maxScaleByWidth = Math.min(maxScaleByWidth, (secW - centerX) / distRight);
    }
    if (isFinite(maxScaleByWidth) && maxScaleByWidth > 0) {
      scale = Math.min(scale, maxScaleByWidth);
      debug.maxScaleByWidth = maxScaleByWidth;
    }
    debug.scaleAfterWidthClamp = scale;

    if (secModo === "pantalla" && scale < 1 && scale > 0.94) {
      // Avoid shrinking "pantalla" for tiny overflows; preserve visual impact.
      scale = 1;
      debug.tinyShrinkProtected = true;
    }

    // En modo pantalla no dejamos que el contenido se recorte por altura.
    if (secModo === "pantalla" && secH > 1) {
      var maxBottom = Number(bounds.maxBottom || 0);
      if (maxBottom > 1) {
        var maxScaleByHeight = secH / maxBottom;
        if (isFinite(maxScaleByHeight) && maxScaleByHeight > 0) {
          scale = Math.min(scale, maxScaleByHeight);
          debug.maxScaleByHeight = maxScaleByHeight;
        }
      }
    }
    debug.scaleAfterHeightClamp = scale;

    if (secModo === "pantalla" && scale < 1) {
      // Pantalla sections already have their own viewport-fit logic.
      // Avoid additional downscale here to keep hero text readable.
      scale = 1;
      debug.pantallaDownscaleBlocked = true;
    }

    if (!isFinite(scale) || scale <= 0) scale = 1;
    if (Math.abs(scale - 1) < 0.02) scale = 1;
    return {
      scale: scale,
      debug: debug
    };
  }

  function applySectionFitScale(sec, content, bleed, nodesAll, secModo, CFG, meta, opts){
    if (!sec || !content) {
      return { scale: 1, neededHeight: 0, bounds: null };
    }

    ensureFitScaleBaseline(content);
    ensureFitScaleBaseline(bleed);
    var preserveBottomGap = 0;
    if (opts && Number.isFinite(opts.preserveBottomGap)) {
      preserveBottomGap = Math.max(0, Number(opts.preserveBottomGap));
    }

    var fitNodes = (nodesAll || []).filter(function(node){
      if (!node) return false;
      var fitMode = (node.getAttribute("data-mobile-fit") || "").toLowerCase();
      if (fitMode === "ignore") return false;
      if (node.closest && node.closest(".sec-bleed")) return false;
      return true;
    });

    var bounds = computeSectionBounds(sec, fitNodes);
    if (!bounds) {
      bounds = computeSectionBounds(sec, nodesAll || []);
    }
    if (!bounds) {
      restoreFitScaleBaseline(content);
      restoreFitScaleBaseline(bleed);
      sec.setAttribute("data-msl-fit-scale", "1");
      return { scale: 1, neededHeight: 0, bounds: null };
    }

    var fitResult = computeFitScale(sec, bounds, secModo, CFG);
    var scale = (fitResult && Number.isFinite(fitResult.scale)) ? fitResult.scale : 1;
    var fitDebug = fitResult && fitResult.debug ? fitResult.debug : null;
    applyElementFitScale(content, scale);
    applyElementFitScale(bleed, scale);

    var neededHeight = 0;
    if (secModo !== "pantalla") {
      var maxBottomWithGap = Number(bounds.maxBottom || 0) + preserveBottomGap;
      neededHeight = Math.ceil(maxBottomWithGap * scale + (CFG.PAD_BOT || 0));
    }

    if (secModo === "pantalla") {
      var secRectNow = sec.getBoundingClientRect();
      var vv = window.visualViewport;
      var viewportW = (vv && vv.width) ? vv.width : (window.innerWidth || document.documentElement.clientWidth || 0);
      var viewportH = (vv && vv.height) ? vv.height : (window.innerHeight || document.documentElement.clientHeight || 0);
      var ua = navigator.userAgent || "";
      var mobileUA = /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
      var touchPoints = Number(navigator.maxTouchPoints || 0);
      var coarsePointer = false;
      if (window.matchMedia) {
        try { coarsePointer = window.matchMedia("(pointer: coarse)").matches; } catch(_e) {}
      }
      var mobileViewport = viewportW <= 767;
      var desktopMobilePreview = mobileViewport && !mobileUA;

      var boundsAll = computeSectionBounds(sec, nodesAll || []);
      var totalNodes = (nodesAll || []).length;
      var fitNodesCount = fitNodes.length;
      var textAll = 0;
      var textFit = 0;
      var ignoredBleed = 0;
      var ignoredExplicit = 0;
      var dominantText = null;
      var dominantTextH = -1;
      var elementRows = [];

      for (var ni=0; ni<totalNodes; ni++){
        var nodeAll = nodesAll[ni];
        if (!nodeAll) continue;

        var fitModeAll = (nodeAll.getAttribute("data-mobile-fit") || "").toLowerCase();
        if (fitModeAll === "ignore") ignoredExplicit++;
        if (nodeAll.closest && nodeAll.closest(".sec-bleed")) ignoredBleed++;

        var rrNode = relRect(nodeAll, sec);
        var nodeW = Number(rrNode.width || 0);
        var nodeH = Number(rrNode.height || 0);
        var nodeTop = Number(rrNode.top || 0);
        var nodeBottom = nodeTop + nodeH;
        var isTextAll = (nodeAll.getAttribute("data-debug-texto") || "") === "1";
        if (isTextAll) textAll++;

        if (nodeW > 0.5 || nodeH > 0.5) {
          var kindAll = isTextAll ? "texto" : String((nodeAll.tagName || "").toLowerCase());
          elementRows.push({
            kind: kindAll,
            width: nodeW,
            height: nodeH,
            top: nodeTop,
            bottom: nodeBottom,
            area: nodeW * nodeH,
            textSample: isTextAll
              ? ((nodeAll.textContent || "").trim()).replace(/\\s+/g, " ").slice(0, 70)
              : ""
          });
        }

        if (!isTextAll) continue;
        if (nodeH <= dominantTextH) continue;
        dominantTextH = nodeH;
        var csTxt = getComputedStyle(nodeAll);
        dominantText = {
          top: +nodeTop.toFixed(1),
          left: +Number(rrNode.left || 0).toFixed(1),
          width: +nodeW.toFixed(1),
          height: +nodeH.toFixed(1),
          bottom: +nodeBottom.toFixed(1),
          widthSecRatio: secRectNow.width > 1 ? +(nodeW / secRectNow.width).toFixed(3) : null,
          heightSecRatio: secRectNow.height > 1 ? +(nodeH / secRectNow.height).toFixed(3) : null,
          widthViewportRatio: viewportW > 1 ? +(nodeW / viewportW).toFixed(3) : null,
          heightViewportRatio: viewportH > 1 ? +(nodeH / viewportH).toFixed(3) : null,
          fontSize: csTxt.fontSize || "",
          lineHeight: csTxt.lineHeight || "",
          textAlign: csTxt.textAlign || "",
          transform: (nodeAll.style && nodeAll.style.transform) ? nodeAll.style.transform : "",
          textSample: ((nodeAll.textContent || "").trim()).replace(/\\s+/g, " ").slice(0, 90)
        };
      }

      for (var fi=0; fi<fitNodes.length; fi++){
        var fitNode = fitNodes[fi];
        if ((fitNode.getAttribute("data-debug-texto") || "") === "1") textFit++;
      }

      var topElements = elementRows
        .sort(function(a,b){ return (b.area || 0) - (a.area || 0); })
        .slice(0, 6)
        .map(function(row){
          return {
            kind: row.kind,
            width: +Number(row.width || 0).toFixed(1),
            height: +Number(row.height || 0).toFixed(1),
            widthSecRatio: secRectNow.width > 1 ? +((row.width || 0) / secRectNow.width).toFixed(3) : null,
            heightSecRatio: secRectNow.height > 1 ? +((row.height || 0) / secRectNow.height).toFixed(3) : null,
            widthViewportRatio: viewportW > 1 ? +((row.width || 0) / viewportW).toFixed(3) : null,
            heightViewportRatio: viewportH > 1 ? +((row.height || 0) / viewportH).toFixed(3) : null,
            topSecRatio: secRectNow.height > 1 ? +((row.top || 0) / secRectNow.height).toFixed(3) : null,
            bottomSecRatio: secRectNow.height > 1 ? +((row.bottom || 0) / secRectNow.height).toFixed(3) : null,
            sample: row.textSample || ""
          };
        });

      var coverageFit = bounds.width / Math.max(1, secRectNow.width || 0);
      var coverageAll = boundsAll ? (boundsAll.width / Math.max(1, secRectNow.width || 0)) : null;

      var flatLines = [];
      flatLines.push(
        "sec=" + String(meta && Number.isFinite(meta.secIndex) ? meta.secIndex : -1)
        + " viewport=" + (+Number(viewportW || 0).toFixed(1)) + "x" + (+Number(viewportH || 0).toFixed(1))
        + " sec=" + (+Number(secRectNow.width || 0).toFixed(1)) + "x" + (+Number(secRectNow.height || 0).toFixed(1))
        + " mobileViewport=" + String(mobileViewport)
        + " desktopMobilePreview=" + String(desktopMobilePreview)
        + " mobileUA=" + String(mobileUA)
        + " coarsePointer=" + String(coarsePointer)
        + " touchPoints=" + String(touchPoints)
      );
      flatLines.push(
        "fit scale=" + (+Number(scale || 1).toFixed(3))
        + " coverageFit=" + (+coverageFit.toFixed(3))
        + " coverageAll=" + (coverageAll == null ? "null" : String(+coverageAll.toFixed(3)))
        + " nodes=" + String(fitNodesCount) + "/" + String(totalNodes)
        + " ignoredBleed=" + String(ignoredBleed)
        + " ignoredExplicit=" + String(ignoredExplicit)
        + " tinyShrinkProtected=" + String(!!(fitDebug && fitDebug.tinyShrinkProtected))
        + " pantallaDownscaleBlocked=" + String(!!(fitDebug && fitDebug.pantallaDownscaleBlocked))
      );
      if (dominantText) {
        flatLines.push(
          "dominantText hSecRatio=" + String(dominantText.heightSecRatio)
          + " hViewportRatio=" + String(dominantText.heightViewportRatio)
          + " wSecRatio=" + String(dominantText.widthSecRatio)
          + " fontSize=" + String(dominantText.fontSize || "")
          + " lineHeight=" + String(dominantText.lineHeight || "")
          + " sample='" + String(dominantText.textSample || "") + "'"
        );
      } else {
        flatLines.push("dominantText none");
      }
      for (var te=0; te<topElements.length; te++){
        var e = topElements[te];
        flatLines.push(
          "el#" + String(te + 1)
          + " kind=" + String(e.kind || "")
          + " wVp=" + String(e.widthViewportRatio)
          + " hVp=" + String(e.heightViewportRatio)
          + " topSec=" + String(e.topSecRatio)
          + " bottomSec=" + String(e.bottomSecRatio)
          + (e.sample ? (" sample='" + String(e.sample) + "'") : "")
        );
      }
      mslLog("section:fitScale:pantalla:flat", flatLines.join("\\n"));

      mslLog("section:fitScale:pantalla", {
        secIndex: meta && Number.isFinite(meta.secIndex) ? meta.secIndex : -1,
        secW: +Number(secRectNow.width || 0).toFixed(1),
        secH: +Number(secRectNow.height || 0).toFixed(1),
        viewport: {
          width: +Number(viewportW || 0).toFixed(1),
          height: +Number(viewportH || 0).toFixed(1)
        },
        displayContext: {
          mobileViewport: mobileViewport,
          desktopMobilePreview: desktopMobilePreview,
          mobileUA: mobileUA,
          coarsePointer: coarsePointer,
          touchPoints: touchPoints
        },
        preserveBottomGap: +preserveBottomGap.toFixed(1),
        totalNodes: totalNodes,
        fitNodes: fitNodesCount,
        textNodesAll: textAll,
        textNodesFit: textFit,
        ignoredBleed: ignoredBleed,
        ignoredExplicit: ignoredExplicit,
        coverageFit: +coverageFit.toFixed(3),
        coverageAll: coverageAll == null ? null : +coverageAll.toFixed(3),
        fitBounds: {
          width: +Number(bounds.width || 0).toFixed(1),
          height: +Number(bounds.height || 0).toFixed(1),
          maxBottom: +Number(bounds.maxBottom || 0).toFixed(1)
        },
        allBounds: boundsAll ? {
          width: +Number(boundsAll.width || 0).toFixed(1),
          height: +Number(boundsAll.height || 0).toFixed(1),
          maxBottom: +Number(boundsAll.maxBottom || 0).toFixed(1)
        } : null,
        fitDebug: fitDebug ? {
          targetCoverage: +Number(fitDebug.targetCoverage || 0).toFixed(3),
          minFillForUpscale: +Number(fitDebug.minFillForUpscale || 0).toFixed(3),
          coverage: +Number(fitDebug.coverage || 0).toFixed(3),
          initialScale: +Number(fitDebug.initialScale || 0).toFixed(3),
          maxScaleByWidth: fitDebug.maxScaleByWidth == null ? null : +Number(fitDebug.maxScaleByWidth).toFixed(3),
          maxScaleByHeight: fitDebug.maxScaleByHeight == null ? null : +Number(fitDebug.maxScaleByHeight).toFixed(3),
          scaleAfterWidthClamp: fitDebug.scaleAfterWidthClamp == null ? null : +Number(fitDebug.scaleAfterWidthClamp).toFixed(3),
          scaleAfterHeightClamp: fitDebug.scaleAfterHeightClamp == null ? null : +Number(fitDebug.scaleAfterHeightClamp).toFixed(3),
          tinyShrinkProtected: !!fitDebug.tinyShrinkProtected,
          pantallaDownscaleBlocked: !!fitDebug.pantallaDownscaleBlocked
        } : null,
        appliedScale: +Number(scale || 1).toFixed(3),
        dominantText: dominantText,
        topElements: topElements
      });
    }

    sec.setAttribute("data-msl-fit-scale", String(+scale.toFixed(3)));
    mslLog("section:fitScale", {
      secIndex: meta && Number.isFinite(meta.secIndex) ? meta.secIndex : -1,
      mode: secModo,
      nodes: bounds.count,
      coverage: +(bounds.width / Math.max(1, sec.getBoundingClientRect().width || 0)).toFixed(3),
      boxW: +bounds.width.toFixed(1),
      boxH: +bounds.height.toFixed(1),
      scale: +scale.toFixed(3),
      preserveBottomGap: +preserveBottomGap.toFixed(1),
      scaledBottomGap: +((preserveBottomGap || 0) * scale).toFixed(1),
      neededHeight: neededHeight
    });

    return {
      scale: scale,
      neededHeight: neededHeight,
      bounds: bounds
    };
  }
`.trim();
}
