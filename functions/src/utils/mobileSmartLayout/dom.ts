// functions/src/utils/mobileSmartLayout/dom.ts
export function jsDomHelpersBlock(): string {
  return `
  function clamp(n,a,b){ return Math.max(a, Math.min(b,n)); }

  function toPositiveNumber(value){
    var n = Number(value);
    return (isFinite(n) && n > 0) ? n : 0;
  }

  function minPositive(values, fallback){
    var valid = (values || []).filter(function(v){
      return isFinite(v) && v > 0;
    });
    if (!valid.length) return fallback;
    return Math.min.apply(null, valid);
  }

  function getScreenShortSide(){
    var screenW = toPositiveNumber(window.screen && window.screen.width);
    var screenH = toPositiveNumber(window.screen && window.screen.height);
    return minPositive([screenW, screenH], screenW || screenH || 0);
  }

  function isLikelyTouchMobileDevice(){
    var ua = String((navigator && navigator.userAgent) || "");
    var mobileUA = /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
    var touchPoints = Number((navigator && navigator.maxTouchPoints) || 0);
    var coarsePointer = false;
    try {
      coarsePointer = !!(window.matchMedia && window.matchMedia("(pointer: coarse)").matches);
    } catch(_e) {
      coarsePointer = false;
    }
    return mobileUA || (touchPoints > 0 && coarsePointer);
  }

  function resolveViewportWidth(){
    var docW = toPositiveNumber(document.documentElement && document.documentElement.clientWidth);
    var innerW = toPositiveNumber(window.innerWidth);
    var vvW = toPositiveNumber(window.visualViewport && window.visualViewport.width);
    var embedded = false;
    try {
      embedded = window.self !== window.top;
    } catch(_e) {
      embedded = true;
    }

    if (embedded) {
      var embeddedWidth = minPositive([docW, innerW, vvW], docW || innerW || vvW || 0);
      var screenShort = getScreenShortSide();
      if ((!embeddedWidth || embeddedWidth <= 0) && screenShort > 0) {
        return screenShort;
      }
      if (
        embeddedWidth > 767 &&
        isLikelyTouchMobileDevice() &&
        screenShort > 0 &&
        screenShort < embeddedWidth
      ) {
        return screenShort;
      }
      return embeddedWidth;
    }

    return docW || innerW || vvW || 0;
  }

  function isMobile(){
    return resolveViewportWidth() <= 767;
  }

  function getObjNodes(sec){
    if(!sec) return [];
    var nodes = [];
    var content = sec.querySelector(".sec-content");
    var bleed = sec.querySelector(".sec-bleed");

    if (content) nodes = nodes.concat(Array.from(content.querySelectorAll(".objeto")));
    if (bleed) nodes = nodes.concat(Array.from(bleed.querySelectorAll(".objeto")));

    // Fallback: algunos elementos exportados pueden no traer clase ".objeto"
    // pero sí estar posicionados como objetos absolutos.
    function collectAbsoluteCandidates(root){
      if (!root) return [];
      return Array.from(root.querySelectorAll("*")).filter(function(el){
        if (!el) return false;
        var cs = getComputedStyle(el);
        var pos = (cs.position || "").toLowerCase();
        if (pos !== "absolute") return false;

        var rr = el.getBoundingClientRect();
        if (!rr || rr.width < 1 || rr.height < 1) return false;

        // Evitar ruido estructural del layout de sección
        if (el.classList && (
          el.classList.contains("sec") ||
          el.classList.contains("sec-zoom") ||
          el.classList.contains("sec-bg") ||
          el.classList.contains("sec-content") ||
          el.classList.contains("sec-bleed")
        )) return false;

        // Si ya está dentro de un ".objeto", no lo contamos aparte.
        var p = el.parentElement;
        while (p){
          if (p.classList && p.classList.contains("objeto")) return false;
          p = p.parentElement;
        }
        return true;
      });
    }

    nodes = nodes.concat(collectAbsoluteCandidates(content));
    nodes = nodes.concat(collectAbsoluteCandidates(bleed));

    // Deduplicar preservando orden de aparición.
    var seen = new Set();
    return nodes.filter(function(n){
      if (seen.has(n)) return false;
      seen.add(n);
      return true;
    });
  }

  function relRect(el, root){
    var r = el.getBoundingClientRect();
    var rr = root.getBoundingClientRect();
    return {
      top: r.top - rr.top,
      left: r.left - rr.left,
      width: r.width,
      height: r.height
    };
  }

  function percentile(sortedArr, p){
    if (!sortedArr.length) return 0;
    var idx = Math.floor(sortedArr.length * p);
    idx = Math.max(0, Math.min(sortedArr.length - 1, idx));
    return sortedArr[idx];
  }

  function cx(it){ return it.left + (it.width || 0) / 2; }

  // -------------------------
  // COMPOSITION CLUSTERS
  // -------------------------
  function rectsOverlap(a, b, tol){
    tol = tol || 0;
    return !(
      (a.left + a.width) < (b.left + tol) ||
      (b.left + b.width) < (a.left + tol) ||
      (a.top + a.height) < (b.top + tol) ||
      (b.top + b.height) < (a.top + tol)
    );
  }

  function horizontalOverlapPx(a, b){
    var l = Math.max(a.left, b.left);
    var r = Math.min(a.left + a.width, b.left + b.width);
    return Math.max(0, r - l);
  }

  function verticalOverlapPx(a, b){
    var t = Math.max(a.top, b.top);
    var bt = Math.min(a.top + a.height, b.top + b.height);
    return Math.max(0, bt - t);
  }

  function horizontalGapPx(a, b){
    var leftAfter = Math.max(a.left, b.left);
    var rightBefore = Math.min(a.left + a.width, b.left + b.width);
    return leftAfter - rightBefore;
  }

  function verticalGapPx(a, b){
    var topAfter = Math.max(a.top, b.top);
    var bottomBefore = Math.min(a.top + a.height, b.top + b.height);
    return topAfter - bottomBefore;
  }

  function cy(it){ return it.top + (it.height || 0) / 2; }

  function compositionLane(it){
    if (!it) return "content";
    if (it._compositionLane) return it._compositionLane;
    var lane = (!it.node || !it.node.closest || !it.node.closest(".sec-bleed"))
      ? "content"
      : "bleed";
    it._compositionLane = lane;
    return lane;
  }

  function sharesVerticalCompositionAxis(a, b){
    var aW = Math.max(1, Number(a.width || 0));
    var bW = Math.max(1, Number(b.width || 0));
    var minW = Math.min(aW, bW);
    var maxW = Math.max(aW, bW);
    var spanRatio = maxW / minW;
    var centerTol = Math.max(18, Math.min(42, minW * 0.35));
    if (Math.abs(cx(a) - cx(b)) <= centerTol) return true;

    // Edge alignment is meaningful only for boxes with comparable spans.
    // This prevents one wide heading from attaching to both visual columns.
    if (spanRatio > 2.4) return false;
    var edgeTol = Math.max(10, Math.min(24, minW * 0.22));
    var leftAligned = Math.abs(Number(a.left || 0) - Number(b.left || 0)) <= edgeTol;
    var rightAligned = Math.abs(
      (Number(a.left || 0) + aW) - (Number(b.left || 0) + bW)
    ) <= edgeTol;
    if (leftAligned || rightAligned) return true;

    var overlap = horizontalOverlapPx(a, b);
    return spanRatio <= 1.8 && (overlap / minW) >= 0.55;
  }

  function sharesHorizontalCompositionAxis(a, b){
    var aH = Math.max(1, Number(a.height || 0));
    var bH = Math.max(1, Number(b.height || 0));
    var minH = Math.min(aH, bH);
    var maxH = Math.max(aH, bH);
    var spanRatio = maxH / minH;
    var centerTol = Math.max(10, Math.min(28, minH * 0.45));
    if (Math.abs(cy(a) - cy(b)) <= centerTol) return true;

    if (spanRatio > 2.4) return false;
    var edgeTol = Math.max(8, Math.min(18, minH * 0.28));
    var topAligned = Math.abs(Number(a.top || 0) - Number(b.top || 0)) <= edgeTol;
    var bottomAligned = Math.abs(
      (Number(a.top || 0) + aH) - (Number(b.top || 0) + bH)
    ) <= edgeTol;
    if (topAligned || bottomAligned) return true;

    var overlap = verticalOverlapPx(a, b);
    return spanRatio <= 1.8 && (overlap / minH) >= 0.55;
  }

  function inferTextLaneDivider(items, rootWidth){
    var width = Number(rootWidth || 0);
    if (!isFinite(width) || width <= 1) return null;

    var divider = width / 2;
    var deadZone = Math.max(18, width * 0.06);
    var leftCenters = [];
    var rightCenters = [];

    for (var i=0; i<items.length; i++) {
      var item = items[i];
      if (!item || !item.node) continue;
      if ((item.node.getAttribute("data-debug-texto") || "") !== "1") continue;
      var center = cx(item);
      if (center <= divider - deadZone) leftCenters.push(center);
      else if (center >= divider + deadZone) rightCenters.push(center);
    }

    // A repeated signal on both sides distinguishes authored text lanes from
    // an isolated inline pair that merely happens to straddle the center.
    if (leftCenters.length < 2 || rightCenters.length < 2) return null;
    leftCenters.sort(function(a,b){ return a - b; });
    rightCenters.sort(function(a,b){ return a - b; });
    var leftMedian = percentile(leftCenters, 0.5);
    var rightMedian = percentile(rightCenters, 0.5);
    if ((rightMedian - leftMedian) < width * 0.3) return null;

    return {
      divider: divider,
      deadZone: deadZone,
      leftCount: leftCenters.length,
      rightCount: rightCenters.length
    };
  }

  function shouldSeparateWeakTextLaneOverlap(a, b, dividerModel){
    if (!dividerModel || !a || !b || !a.node || !b.node) return false;
    var aIsText = (a.node.getAttribute("data-debug-texto") || "") === "1";
    var bIsText = (b.node.getAttribute("data-debug-texto") || "") === "1";
    if (!aIsText || !bIsText) return false;

    var divider = Number(dividerModel.divider || 0);
    var deadZone = Number(dividerModel.deadZone || 0);
    var aCenter = cx(a);
    var bCenter = cx(b);
    var oppositeLanes =
      (aCenter <= divider - deadZone && bCenter >= divider + deadZone) ||
      (bCenter <= divider - deadZone && aCenter >= divider + deadZone);
    if (!oppositeLanes) return false;

    // Wide centered text boxes can overlap a few pixels in the gutter even
    // though their visual centers form two independent authored columns.
    // Keep only that weak bbox overlap from becoming a composition edge;
    // substantial overlap remains valid evidence for a horizontal unit.
    var overlap = horizontalOverlapPx(a, b);
    if (overlap <= 0) return false;
    var minWidth = Math.max(1, Math.min(Number(a.width || 0), Number(b.width || 0)));
    var weakOverlapLimit = Math.max(12, minWidth * 0.12);
    return overlap <= weakOverlapLimit;
  }

  function shouldSeparateCenteredLateralPair(a, b, rootWidth){
    var width = Number(rootWidth || 0);
    if (!a || !b || !isFinite(width) || width <= 1) return false;

    var rootCenter = width / 2;
    var centerTolerance = Math.max(14, width * 0.08);
    var lateralDistance = Math.max(42, width * 0.22);
    var aDelta = Math.abs(cx(a) - rootCenter);
    var bDelta = Math.abs(cx(b) - rootCenter);
    var centered = null;
    var lateral = null;

    if (aDelta <= centerTolerance && bDelta >= lateralDistance) {
      centered = a;
      lateral = b;
    } else if (bDelta <= centerTolerance && aDelta >= lateralDistance) {
      centered = b;
      lateral = a;
    }
    if (!centered || !lateral) return false;

    var minHeight = Math.max(
      1,
      Math.min(Number(centered.height || 0), Number(lateral.height || 0))
    );
    var verticalOverlapRatio = verticalOverlapPx(centered, lateral) / minHeight;
    var sameRowTolerance = Math.max(18, Math.min(42, minHeight * 0.75));
    var sharesAuthoredRow =
      verticalOverlapRatio >= 0.35 ||
      Math.abs(cy(centered) - cy(lateral)) <= sameRowTolerance;

    // An ungrouped object authored on the section axis and a lateral peer are
    // separate responsive units. Joining their boxes would center the combined
    // bounds and move the authored centered object off-axis. Explicit groups or
    // shared cluster ids have already been handled by the caller and stay atomic.
    return sharesAuthoredRow;
  }

  function buildCompositionClusters(items, rootWidth){
    var n = items.length;
    var parent = new Array(n);
    for (var i=0;i<n;i++) parent[i] = i;

    function find(x){
      while(parent[x] !== x){
        parent[x] = parent[parent[x]];
        x = parent[x];
      }
      return x;
    }

    function union(a,b){
      var ra = find(a), rb = find(b);
      if (ra !== rb) parent[rb] = ra;
    }

    // Small tolerance keeps intentional overlap in one authored unit.
    var TOL = 1;
    // Axis-neighbor bounds are measured after the base desktop-to-mobile scale.
    var PROX_Y = 34;
    var PROX_X = 28;
    var textLaneDivider = inferTextLaneDivider(items, rootWidth);

    for (var i=0;i<n;i++){
      for (var j=i+1;j<n;j++){
        var a = items[i], b = items[j];

        // Content and fullbleed are independent generated geometry owners.
        if (compositionLane(a) !== compositionLane(b)) continue;

        var aIso = (a.node.getAttribute("data-mobile-cluster") || "") === "isolated";
        var bIso = (b.node.getAttribute("data-mobile-cluster") || "") === "isolated";

        // Persisted groups and other explicit isolated units stay atomic.
        if (aIso || bIso) continue;

        var aKey = a.node.getAttribute("data-mobile-cluster-id") || "";
        var bKey = b.node.getAttribute("data-mobile-cluster-id") || "";
        if (aKey && bKey) {
          if (aKey === bKey) union(i,j);
          continue;
        }

        if (shouldSeparateCenteredLateralPair(a, b, rootWidth)) continue;

        var aIsText = (a.node.getAttribute("data-debug-texto") || "") === "1";
        var bIsText = (b.node.getAttribute("data-debug-texto") || "") === "1";
        var involvesText = aIsText || bIsText;

        if (rectsOverlap(a, b, TOL)) {
          // Wide text boxes must not bridge otherwise independent columns.
          if (
            !shouldSeparateWeakTextLaneOverlap(a, b, textLaneDivider) &&
            (
              !involvesText ||
              sharesVerticalCompositionAxis(a, b) ||
              sharesHorizontalCompositionAxis(a, b)
            )
          ) union(i,j);
          continue;
        }

        var vGap = verticalGapPx(a, b);
        var nearVertical = vGap >= 0 && vGap <= PROX_Y;
        if (nearVertical && sharesVerticalCompositionAxis(a, b)) {
          union(i,j);
          continue;
        }

        var hGap = horizontalGapPx(a, b);
        var nearHorizontal = hGap >= 0 && hGap <= PROX_X;
        if (nearHorizontal && sharesHorizontalCompositionAxis(a, b)) union(i,j);

      }
    }

    var map = {};
    for (var k=0;k<n;k++){
      var r = find(k);
      if (!map[r]) map[r] = [];
      map[r].push(items[k]);
    }

    var clusters = [];
    Object.keys(map).forEach(function(key){
      var arr = map[key];

      var minTop = Infinity, minLeft = Infinity, maxR = -Infinity, maxB = -Infinity;
      for (var i=0;i<arr.length;i++){
        var it = arr[i];
        minTop = Math.min(minTop, it.top);
        minLeft = Math.min(minLeft, it.left);
        maxR = Math.max(maxR, it.left + it.width);
        maxB = Math.max(maxB, it.top + it.height);
      }

      // Preserve the authored vectors inside every inferred composition unit.
      for (var i=0;i<arr.length;i++){
        arr[i]._relTop = arr[i].top - minTop;
        arr[i]._relLeft = arr[i].left - minLeft;
      }

      clusters.push({
        items: arr,
        top: minTop,
        left: minLeft,
        width: maxR - minLeft,
        height: maxB - minTop,
        cx: (minLeft + maxR) / 2
      });
    });

    // orden estable por top para consistencia
    clusters.sort(function(a,b){ return a.top - b.top; });

    return clusters;
  }

  function readPantallaObjectYNorm(node){
    if (!node) return null;
    var raw = "";
    try {
      raw = String(node.style.getPropertyValue("--obj-y-norm") || "").trim();
      if (!raw && window.getComputedStyle) {
        raw = String(getComputedStyle(node).getPropertyValue("--obj-y-norm") || "").trim();
      }
    } catch(_e) {
      raw = "";
    }
    var value = parseFloat(raw);
    if (!isFinite(value)) return null;
    return clamp(value, 0, 1);
  }

  function isPantallaCompositionNode(node){
    if (!node || !node.closest || !node.closest(".sec-content")) return false;
    if (node.closest(".sec-bleed")) return false;

    var fitMode = String(node.getAttribute("data-mobile-fit") || "").toLowerCase();
    if (fitMode === "ignore" || fitMode === "cover") return false;

    var role = String(node.getAttribute("data-role") || "").toLowerCase();
    if (role === "decorative" || role === "background") return false;
    return readPantallaObjectYNorm(node) != null;
  }

  function resolvePantallaVerticalMap(items, sectionHeight){
    var valid = (items || []).filter(function(it){
      return it && isFinite(it._pantallaYNorm) && isFinite(it._sourceTop);
    });
    var fallbackSlope = Math.max(1, Number(sectionHeight || 0));
    if (!valid.length) return { slope: fallbackSlope, intercept: 0 };

    var meanNorm = 0;
    var meanTop = 0;
    for (var i=0; i<valid.length; i++) {
      meanNorm += valid[i]._pantallaYNorm;
      meanTop += valid[i]._sourceTop;
    }
    meanNorm /= valid.length;
    meanTop /= valid.length;

    var numerator = 0;
    var denominator = 0;
    for (var j=0; j<valid.length; j++) {
      var dx = valid[j]._pantallaYNorm - meanNorm;
      numerator += dx * (valid[j]._sourceTop - meanTop);
      denominator += dx * dx;
    }

    var slope = denominator > 0.000001 ? (numerator / denominator) : fallbackSlope;
    if (!isFinite(slope) || slope <= fallbackSlope * 0.5 || slope >= fallbackSlope * 1.5) {
      slope = fallbackSlope;
    }

    var intercepts = valid.map(function(it){
      return it._sourceTop - (it._pantallaYNorm * slope);
    }).sort(function(a,b){ return a - b; });
    var midpoint = Math.floor(intercepts.length / 2);
    var intercept = intercepts.length % 2
      ? intercepts[midpoint]
      : (intercepts[midpoint - 1] + intercepts[midpoint]) / 2;
    if (!isFinite(intercept)) intercept = 0;

    return { slope: slope, intercept: intercept };
  }

  function applyPantallaCompositionUnits(sec, content, nodes, CFG, meta){
    var result = {
      clusters: 0,
      compositionUnits: 0,
      changedUnits: 0,
      changedNodes: 0
    };
    if (!sec || !content || !nodes || nodes.length < 2) return result;

    var secRect = sec.getBoundingClientRect();
    var contentRect = content.getBoundingClientRect();
    var secHeight = Number(secRect.height || 0);
    var designWidth = Math.max(1, Number(CFG && CFG.DESIGN_W || 800));
    var designHeight = Math.max(1, Number(CFG && CFG.PANTALLA_DESIGN_H || 500));
    var designScale = Number(contentRect.width || 0) / designWidth;
    var projectedSpan = designHeight * designScale;
    if (secHeight <= 1 || projectedSpan <= 1) return result;

    var projectedItems = (nodes || []).filter(isPantallaCompositionNode).map(function(node){
      var yNorm = readPantallaObjectYNorm(node);
      var contentBox = relRect(node, content);
      var sectionBox = relRect(node, sec);
      return {
        node: node,
        top: yNorm * projectedSpan,
        left: contentBox.left,
        width: contentBox.width,
        height: contentBox.height,
        _pantallaYNorm: yNorm,
        _sourceTop: sectionBox.top
      };
    }).filter(function(it){
      return it.width > 0.5 || it.height > 0.5;
    });
    if (projectedItems.length < 2) return result;

    var verticalMap = resolvePantallaVerticalMap(projectedItems, secHeight);
    var clusters = buildCompositionClusters(projectedItems, contentRect.width);
    var offsetHeight = Number(content.offsetHeight || 0);
    var localToViewportScale = offsetHeight > 0
      ? Number(contentRect.height || 0) / offsetHeight
      : Number(contentRect.width || 0) / Math.max(1, Number(content.offsetWidth || 0));
    if (!isFinite(localToViewportScale) || localToViewportScale <= 0) {
      localToViewportScale = 1;
    }

    var visibleTop = clamp(verticalMap.intercept, 0, secHeight);
    var visibleBottom = clamp(verticalMap.intercept + verticalMap.slope, visibleTop, secHeight);
    if (visibleBottom - visibleTop < 1) {
      visibleTop = 0;
      visibleBottom = secHeight;
    }

    result.clusters = clusters.length;
    for (var ci=0; ci<clusters.length; ci++) {
      var cluster = clusters[ci];
      if (!cluster || !cluster.items || cluster.items.length < 2) continue;
      result.compositionUnits++;

      var explicitAnchor = cluster.items.find(function(it){
        var node = it.node;
        return (
          String(node.getAttribute("data-mobile-layout") || "").toLowerCase() === "keep" ||
          String(node.getAttribute("data-mobile-role") || "").toLowerCase() === "anchor"
        );
      });
      var desiredClusterTop = 0;
      if (explicitAnchor) {
        desiredClusterTop = explicitAnchor._sourceTop - (explicitAnchor.top - cluster.top);
      } else {
        var anchorNorm = clamp(
          (cluster.top + cluster.height / 2) / projectedSpan,
          0,
          1
        );
        var anchorTop = verticalMap.intercept + (anchorNorm * verticalMap.slope);
        desiredClusterTop = anchorTop - cluster.height / 2;
      }

      var maxClusterTop = visibleBottom - cluster.height;
      if (maxClusterTop < visibleTop) maxClusterTop = visibleTop;
      desiredClusterTop = clamp(desiredClusterTop, visibleTop, maxClusterTop);

      var changedInUnit = 0;
      for (var mi=0; mi<cluster.items.length; mi++) {
        var item = cluster.items[mi];
        var desiredTop = desiredClusterTop + (item.top - cluster.top);
        var deltaViewport = desiredTop - item._sourceTop;
        if (!isFinite(deltaViewport) || Math.abs(deltaViewport) <= 0.2) continue;

        var originalTop = item.node.getAttribute("data-msl-orig-top");
        if (originalTop == null || !String(originalTop).trim()) continue;
        var deltaLocal = deltaViewport / localToViewportScale;
        item.node.style.top = "calc((" + originalTop + ") + (" + deltaLocal + "px))";
        item.node.setAttribute("data-msl-pantalla-composition-unit", String(ci));
        changedInUnit++;
        result.changedNodes++;
      }
      if (changedInUnit > 0) result.changedUnits++;
    }

    sec.setAttribute(
      "data-msl-pantalla-composition-units",
      String(result.compositionUnits)
    );
    mslLog("section:pantallaComposition", {
      secIndex: meta && Number.isFinite(meta.secIndex) ? meta.secIndex : -1,
      clusters: result.clusters,
      compositionUnits: result.compositionUnits,
      changedUnits: result.changedUnits,
      changedNodes: result.changedNodes,
      projectedSpan: +projectedSpan.toFixed(2),
      verticalSlope: +Number(verticalMap.slope || 0).toFixed(2),
      verticalIntercept: +Number(verticalMap.intercept || 0).toFixed(2)
    });
    return result;
  }

  // ✅ “entra” si ningún cluster se sale horizontalmente del contenedor content
  function clustersFitInMobile(clusters, rootEl){
    var rootW = rootEl.getBoundingClientRect().width || 0;
    if (!rootW) return true;

    for (var i=0;i<clusters.length;i++){
      var c = clusters[i];
      if (c.left < -1) return false;
      if ((c.left + c.width) > (rootW + 1)) return false;
    }
    return true;
  }
`.trim();
}
