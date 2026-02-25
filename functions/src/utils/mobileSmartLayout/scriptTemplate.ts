// functions/src/utils/mobileSmartLayout/scriptTemplate.ts
import { NormalizedConfig } from "./config";
import { jsDomHelpersBlock } from "./dom";
import { jsFitScaleBlock } from "./fitScale";
import { jsOrderingBlock } from "./ordering";
import { jsStackingBlock } from "./stacking";

export function buildScript(cfg: NormalizedConfig): string {
  if (!cfg.enabled) return "";

  return `
<script>
(function(){
  var ENABLED = true;
  function readFlagFromSearch(search, name){
    try {
      if (typeof search !== "string" || !search) return false;
      var normalized = search.charAt(0) === "?" ? search : ("?" + search);
      var qp = new URLSearchParams(normalized);
      var qv = qp.get(name);
      return qv === "1" || String(qv).toLowerCase() === "true";
    } catch(_e0) {
      return false;
    }
  }
  function readDebugFlag(name){
    try {
      var search = (window.location && window.location.search) ? window.location.search : "";
      if (readFlagFromSearch(search, name)) return true;
    } catch(_e1) {}

    // srcDoc sandbox suele conservar document.referrer con la URL padre.
    try {
      var referrer = (typeof document !== "undefined" && document.referrer) ? String(document.referrer) : "";
      if (referrer) {
        var refUrl = new URL(referrer);
        if (readFlagFromSearch(refUrl.search || "", name)) return true;
      }
    } catch(_eRef) {}

    // srcDoc/about:srcdoc no suele tener querystring.
    try {
      if (window.parent && window.parent !== window && window.parent.location) {
        var pSearch = window.parent.location.search || "";
        if (readFlagFromSearch(pSearch, name)) return true;
      }
    } catch(_e2) {}

    try {
      if (window.top && window.top !== window && window.top.location) {
        var tSearch = window.top.location.search || "";
        if (readFlagFromSearch(tSearch, name)) return true;
      }
    } catch(_e3) {}

    try {
      var ls = window.localStorage ? window.localStorage.getItem(name) : null;
      if (ls === "1" || String(ls).toLowerCase() === "true") return true;
    } catch(_e4) {}

    return false;
  }
  var MSL_DEBUG = readDebugFlag("mslDebug");
  var MSL_VERBOSE = readDebugFlag("mslVerbose");
  function dbg(label, payload){
    if (!MSL_DEBUG) return;
    if (arguments.length <= 1) {
      console.log("[MSL] " + label);
      return;
    }
    if (typeof payload === "string") {
      console.log("[MSL] " + label + " " + payload);
      return;
    }
    var pretty = "";
    try {
      pretty = JSON.stringify(payload, null, 2);
    } catch(e) {
      try { pretty = String(payload); } catch(_) { pretty = "[unserializable]"; }
    }
    console.log("[MSL] " + label + "\\n" + pretty);
  }
  function mslLog(){
    if (!MSL_DEBUG) return;
    var args = Array.prototype.slice.call(arguments);
    if (!args.length) return;
    var label = String(args[0]);
    if (!MSL_VERBOSE) {
      var noisy = {
        "section:nodeSources": 1,
        "section:baselineRestore": 1,
        "section:anchorSplit": 1,
        "section:clusters": 1,
        "order:three:candidates": 1,
        "order:three:spread": 1,
        "order:two:candidates": 1,
        "order:two:spread": 1,
        "order:one:candidates": 1,
        "order:rows:fallback": 1
      };
      if (noisy[label]) return;
    }
    if (args.length === 1) {
      dbg(label);
      return;
    }
    if (args.length === 2) {
      dbg(label, args[1]);
      return;
    }
    dbg(label, args.slice(1));
  }
  var CFG = {
    MIN_GAP: ${cfg.minGapPx},
    MAX_GAP: ${cfg.maxGapPx},
    GAP_SCALE: ${cfg.gapScale},

    PAD_TOP: ${cfg.paddingTopPx},
    PAD_BOT: ${cfg.paddingBottomPx},

    ONLY_FIXED: ${cfg.onlyFixedSections ? "true" : "false"},
    ONLY_WHEN_REORDERED: ${cfg.onlyWhenReordered ? "true" : "false"},

    ROW_TOL: ${cfg.rowTolPx},

    TWO_COL_SPREAD_RATIO: ${cfg.twoColSpreadRatio},
    MIN_PER_COL_2: ${cfg.minPerColumn2},

    THREE_COL_SPREAD_RATIO: ${cfg.threeColSpreadRatio},
    MIN_PER_COL_3: ${cfg.minPerColumn3},

    FIT_MIN_SCALE: ${cfg.fitMinScale},
    FIT_MAX_SCALE: ${cfg.fitMaxScale},
    FIT_TARGET_WIDTH_RATIO: ${cfg.fitTargetWidthRatio},
    FIT_MIN_FILL_RATIO: ${cfg.fitMinFillRatio}
  };

  ${jsDomHelpersBlock()}

  ${jsOrderingBlock()}

  ${jsStackingBlock()}

  ${jsFitScaleBlock()}

  function expandFixedSection(sec, neededHeight){
    var currentH = sec.getBoundingClientRect().height || 0;
    if (neededHeight > currentH + 1) {
      sec.style.height = Math.ceil(neededHeight) + "px";
      return true;
    }
    return false;
  }

  function shouldProcessSection(sec){
    if(!sec) return false;
    if(!CFG.ONLY_FIXED) return true;
    var modo = (sec.getAttribute("data-modo") || "fijo").toLowerCase();
    return modo === "fijo";
  }

  function restoreNodeBaseline(node){
    if (!node) return 0;
    var restored = 0;

    if (!node.hasAttribute("data-msl-orig-top")) {
      node.setAttribute("data-msl-orig-top", node.style.top || "");
    }
    if (!node.hasAttribute("data-msl-orig-left")) {
      node.setAttribute("data-msl-orig-left", node.style.left || "");
    }
    if (!node.hasAttribute("data-msl-orig-transform")) {
      node.setAttribute("data-msl-orig-transform", node.style.transform || "");
    }
    if (!node.hasAttribute("data-msl-orig-text-align")) {
      node.setAttribute("data-msl-orig-text-align", node.style.textAlign || "");
    }
    if (!node.hasAttribute("data-msl-orig-transform-origin")) {
      node.setAttribute("data-msl-orig-transform-origin", node.style.transformOrigin || "");
    }
    if (!node.hasAttribute("data-msl-orig-text-zoom")) {
      node.setAttribute("data-msl-orig-text-zoom", node.style.getPropertyValue("--text-zoom") || "");
    }

    var origTop = node.getAttribute("data-msl-orig-top");
    var origLeft = node.getAttribute("data-msl-orig-left");
    var origTransform = node.getAttribute("data-msl-orig-transform");
    var origTextAlign = node.getAttribute("data-msl-orig-text-align");
    var origTransformOrigin = node.getAttribute("data-msl-orig-transform-origin");
    var origTextZoom = node.getAttribute("data-msl-orig-text-zoom");

    if (origTop != null && node.style.top !== origTop) {
      node.style.top = origTop;
      restored++;
    }
    if (origLeft != null && node.style.left !== origLeft) {
      node.style.left = origLeft;
      restored++;
    }
    if (origTransform != null && node.style.transform !== origTransform) {
      node.style.transform = origTransform;
      restored++;
    }
    if (origTextAlign != null && node.style.textAlign !== origTextAlign) {
      if (origTextAlign) node.style.textAlign = origTextAlign;
      else node.style.removeProperty("text-align");
      restored++;
    }
    if (origTransformOrigin != null && node.style.transformOrigin !== origTransformOrigin) {
      if (origTransformOrigin) node.style.transformOrigin = origTransformOrigin;
      else node.style.removeProperty("transform-origin");
      restored++;
    }
    if (origTextZoom != null) {
      var currentTextZoom = node.style.getPropertyValue("--text-zoom") || "";
      if (currentTextZoom !== origTextZoom) {
        if (origTextZoom) node.style.setProperty("--text-zoom", origTextZoom);
        else node.style.removeProperty("--text-zoom");
        restored++;
      }
    }

    node.style.right = "auto";
    node.style.marginLeft = "0px";
    return restored;
  }

  function runOnce(){
    if(!ENABLED) return;
    if(!isMobile()) {
      Array.from(document.querySelectorAll(".sec")).forEach(function(sec){
        var content = sec.querySelector(".sec-content");
        if(!content) return;
        var bleed = sec.querySelector(".sec-bleed");
        resetSectionFitScale(sec, content, bleed);
        var nodesAllDesktop = getObjNodes(sec);
        for (var nd=0; nd<nodesAllDesktop.length; nd++) {
          restoreNodeBaseline(nodesAllDesktop[nd]);
        }
        sec.setAttribute("data-msl-fit-scale", "1");
      });
      return;
    }

    var secs = Array.from(document.querySelectorAll(".sec"));
    if(!secs.length) return;

    secs.forEach(function(sec){
      var secIndex = secs.indexOf(sec);
      var secModo = (sec.getAttribute("data-modo") || "fijo").toLowerCase();
      var allowReflow = shouldProcessSection(sec);
      mslLog("section:start", { secIndex: secIndex, modo: secModo, allowReflow: allowReflow });

      var content = sec.querySelector(".sec-content");
      if(!content) return;
      var bleed = sec.querySelector(".sec-bleed");
      resetSectionFitScale(sec, content, bleed);
      var nodesAll = getObjNodes(sec);

      var reflowElementsDump = [];
      function buildReflowElementsDump(items, contentWNow){
        if (!MSL_DEBUG) return;
        var list = (items || []);
        var maxItems = 120;
        var out = [];
        for (var iDump=0; iDump<list.length && iDump<maxItems; iDump++){
          var itDump = list[iDump];
          if (!itDump || !itDump.node) continue;
          var nDump = itDump.node;
          var textRaw = ((nDump.textContent || "").trim()).replace(/\s+/g, " ");
          var isTextDump = (nDump.getAttribute("data-debug-texto") || "") === "1";
          var clsDump = (nDump.className && typeof nDump.className === "string") ? nDump.className : "";
          var rootZone = (nDump.closest && nDump.closest(".sec-bleed")) ? "bleed" : "content";
          out.push({
            i: iDump,
            kind: isTextDump ? "texto" : String((nDump.tagName || "").toLowerCase()),
            zone: rootZone,
            top: +Number(itDump.top || 0).toFixed(1),
            left: +Number(itDump.left || 0).toFixed(1),
            w: +Number(itDump.width || 0).toFixed(1),
            h: +Number(itDump.height || 0).toFixed(1),
            right: +Number((itDump.left || 0) + (itDump.width || 0)).toFixed(1),
            bottom: +Number((itDump.top || 0) + (itDump.height || 0)).toFixed(1),
            cx: +Number((itDump.left || 0) + ((itDump.width || 0) / 2)).toFixed(1),
            wRatio: contentWNow > 1 ? +Number((itDump.width || 0) / contentWNow).toFixed(3) : null,
            className: clsDump,
            mobileLayout: nDump.getAttribute("data-mobile-layout") || "",
            mobileRole: nDump.getAttribute("data-mobile-role") || "",
            mobileCluster: nDump.getAttribute("data-mobile-cluster") || "",
            mobileClusterId: nDump.getAttribute("data-mobile-cluster-id") || "",
            mobileCenter: nDump.getAttribute("data-mobile-center") || "",
            mobileAlign: nDump.getAttribute("data-mobile-align") || "",
            mobileFit: nDump.getAttribute("data-mobile-fit") || "",
            textAlign: (nDump.style && nDump.style.textAlign) ? nDump.style.textAlign : "",
            textSample: isTextDump ? textRaw.slice(0, 90) : ""
          });
        }
        reflowElementsDump = out;
      }

      function logReflowDecision(reason, extra){
        if (!MSL_DEBUG) return;
        var payload = {
          secIndex: secIndex,
          secModo: secModo,
          allowReflow: allowReflow,
          totalNodes: (nodesAll || []).length,
          reason: String(reason || ""),
          details: extra || {}
        };
        mslLog("section:reflow:decision", payload);
      }

      function finalizeSection(minNeededHeight, preserveBottomGap){
        var gap = Number.isFinite(preserveBottomGap) ? Math.max(0, Number(preserveBottomGap)) : 0;
        var fit = applySectionFitScale(
          sec,
          content,
          bleed,
          nodesAll,
          secModo,
          CFG,
          { secIndex: secIndex },
          { preserveBottomGap: gap }
        );
        var fitNeeded = (fit && Number.isFinite(fit.neededHeight)) ? Number(fit.neededHeight) : 0;
        var neededHeight = Math.max(Number(minNeededHeight || 0), fitNeeded);
        mslLog("section:heightFinal", {
          secIndex: secIndex,
          mode: secModo,
          minNeededHeight: +Number(minNeededHeight || 0).toFixed(1),
          fitNeededHeight: +fitNeeded.toFixed(1),
          preserveBottomGap: +gap.toFixed(1),
          finalNeededHeight: +neededHeight.toFixed(1)
        });
        if (secModo === "fijo" && neededHeight > 0) {
          expandFixedSection(sec, neededHeight);
        }
      }

      if(!nodesAll.length) {
        logReflowDecision("skip:noNodes", { willApplyReflow: false });
        finalizeSection(0, 0);
        return;
      }

      var debugCounts = {
        secIndex: secIndex,
        contentObj: content ? content.querySelectorAll(".objeto").length : 0,
        bleedObj: bleed ? bleed.querySelectorAll(".objeto").length : 0,
        contentAbs: content ? Array.from(content.querySelectorAll("*")).filter(function(el){
          return !!(el && el.style && (el.style.position || "").toLowerCase() === "absolute" && el.style.top && el.style.left);
        }).length : 0,
        bleedAbs: bleed ? Array.from(bleed.querySelectorAll("*")).filter(function(el){
          return !!(el && el.style && (el.style.position || "").toLowerCase() === "absolute" && el.style.top && el.style.left);
        }).length : 0
      };
      mslLog("section:nodeSources", debugCounts);

      if (MSL_VERBOSE) {
        mslLog("section:nodesAll:raw", {
          secIndex: secIndex,
          total: nodesAll.length,
          nodes: nodesAll.map(function(n, i){
            var cls = (n.className && typeof n.className === "string") ? n.className : "";
            var parentCls = (n.parentElement && n.parentElement.className && typeof n.parentElement.className === "string")
              ? n.parentElement.className
              : "";
            return {
              i: i,
              tag: (n.tagName || "").toLowerCase(),
              cls: cls,
              parentCls: parentCls,
              top: n.style ? n.style.top : "",
              left: n.style ? n.style.left : "",
              pos: n.style ? n.style.position : "",
              text: ((n.textContent || "").trim()).slice(0, 40)
            };
          })
        });
        try {
          var flat = nodesAll.map(function(n, i){
            var cls = (n.className && typeof n.className === "string") ? n.className : "";
            var txt = ((n.textContent || "").trim()).replace(/\\s+/g, " ").slice(0, 60);
            return "#" + i
              + " tag=" + String((n.tagName || "").toLowerCase())
              + " cls=" + cls
              + " pos=" + (n.style ? n.style.position : "")
              + " top=" + (n.style ? n.style.top : "")
              + " left=" + (n.style ? n.style.left : "")
              + " text=" + txt;
          });
          mslLog("section:nodesAll:flat", "sec=" + secIndex + " total=" + nodesAll.length + " :: " + flat.join(" | "));
        } catch(e) {}
      }
      var restoredCount = 0;
      nodesAll.forEach(function(node){
        restoredCount += restoreNodeBaseline(node);
      });
      mslLog("section:baselineRestore", { secIndex: secIndex, nodes: nodesAll.length, restored: restoredCount });

      // Rect del content (métricas reales)
      var contentRect = content.getBoundingClientRect();
      var contentW = contentRect.width || 0;
      var secCurrentH = sec.getBoundingClientRect().height || 0;
      var baseHeightAttr = "data-msl-base-height";
      if (!sec.hasAttribute(baseHeightAttr)) {
        sec.setAttribute(baseHeightAttr, String(secCurrentH));
      }
      var baseSecHeight = parseFloat(sec.getAttribute(baseHeightAttr) || "");
      if (!isFinite(baseSecHeight) || baseSecHeight <= 0) baseSecHeight = secCurrentH;

      // items (rects) en coordenadas del content (TODOS)
      var itemsAll = nodesAll.map(function(node){
        var rc = relRect(node, content);
        return {
          node: node,
          top: rc.top,
          left: rc.left,
          height: rc.height,
          width: rc.width
        };
      });
      buildReflowElementsDump(itemsAll, contentW);
      mslLog("section:reflow:elements", {
        secIndex: secIndex,
        secModo: secModo,
        contentW: +Number(contentW || 0).toFixed(1),
        total: reflowElementsDump.length,
        elements: reflowElementsDump
      });
      if (MSL_VERBOSE) {
        mslLog("section:itemsAll", {
          secIndex: secIndex,
          total: itemsAll.length,
          items: itemsAll.map(function(it, idx){
            return {
              i: idx,
              kind: (it.node.getAttribute("data-debug-texto") || "") === "1" ? "texto" : (it.node.tagName || "").toLowerCase(),
              top: +it.top.toFixed(1),
              left: +it.left.toFixed(1),
              w: +it.width.toFixed(1),
              h: +it.height.toFixed(1),
              textAlign: (it.node.style && it.node.style.textAlign) ? it.node.style.textAlign : ""
            };
          })
        });
      }

      // Preservar el "aire" inferior original de la seccion tras el reflow.
      var maxOriginalBottom = 0;
      for (var ib=0; ib<itemsAll.length; ib++){
        var itb = itemsAll[ib];
        var btm = (itb.top || 0) + (itb.height || 0);
        if (btm > maxOriginalBottom) maxOriginalBottom = btm;
      }
      var baseBottomGap = Math.max(0, baseSecHeight - maxOriginalBottom);

      // Si todo mide 0 (fonts no listas), reintentamos luego
      var anyValidAll = itemsAll.some(function(it){ return it.height > 0.5; });
      if(!anyValidAll) {
        logReflowDecision("skip:invalidRects", {
          willApplyReflow: false,
          allHeightsTiny: true
        });
        finalizeSection(0, baseBottomGap);
        return;
      }

      if (!allowReflow || nodesAll.length < 2) {
        logReflowDecision("skip:notEligible", {
          willApplyReflow: false,
          allowReflow: allowReflow,
          totalNodes: nodesAll.length
        });
        finalizeSection(0, baseBottomGap);
        return;
      }

      function detectHeroLikeCentralText(items, rootW){
        var out = {
          isHero: false,
          reason: "",
          textCount: 0,
          textColumnCount: 0,
          textColumns: [],
          singleTextColumn: false,
          maxTextWidthRatio: null,
          widthRatio: null,
          centerDelta: null,
          centerTol: null,
          centeredByAlign: false,
          centeredByGeometry: false,
          decorNear: 0,
          decorLeft: 0,
          decorRight: 0,
          decorInvadingTextColumn: 0
        };
        if (!items || !items.length || !rootW || rootW <= 0) {
          out.reason = "noItemsOrWidth";
          return out;
        }

        var textItems = items.filter(function(it){
          if ((it.node.getAttribute("data-debug-texto") || "") !== "1") return false;
          var tw = Number(it.width || 0);
          var th = Number(it.height || 0);
          return tw > 2 && th > 2;
        });
        out.textCount = textItems.length;
        if (!textItems.length) {
          out.reason = "noText";
          return out;
        }

        var explicitHero = false;
        for (var eh=0; eh<textItems.length; eh++){
          var roleEh = (textItems[eh].node.getAttribute("data-mobile-role") || "").toLowerCase();
          if (roleEh === "hero") {
            explicitHero = true;
            break;
          }
        }

        var colTol = Math.max(18, rootW * 0.14);
        var textCols = [];
        for (var tc=0; tc<textItems.length; tc++){
          var txt = textItems[tc];
          var txtCx = Number(txt.left || 0) + Number(txt.width || 0) / 2;
          var attached = false;
          for (var cc=0; cc<textCols.length; cc++){
            if (Math.abs(txtCx - textCols[cc].cx) <= colTol) {
              var nCol = textCols[cc].count + 1;
              textCols[cc].cx = ((textCols[cc].cx * textCols[cc].count) + txtCx) / nCol;
              textCols[cc].count = nCol;
              textCols[cc].minLeft = Math.min(textCols[cc].minLeft, Number(txt.left || 0));
              textCols[cc].maxRight = Math.max(textCols[cc].maxRight, Number(txt.left || 0) + Number(txt.width || 0));
              textCols[cc].minTop = Math.min(textCols[cc].minTop, Number(txt.top || 0));
              textCols[cc].maxBottom = Math.max(textCols[cc].maxBottom, Number(txt.top || 0) + Number(txt.height || 0));
              attached = true;
              break;
            }
          }
          if (!attached) {
            textCols.push({
              cx: txtCx,
              count: 1,
              minLeft: Number(txt.left || 0),
              maxRight: Number(txt.left || 0) + Number(txt.width || 0),
              minTop: Number(txt.top || 0),
              maxBottom: Number(txt.top || 0) + Number(txt.height || 0)
            });
          }
        }
        textCols.sort(function(a,b){ return a.cx - b.cx; });
        out.textColumnCount = textCols.length;
        out.singleTextColumn = textCols.length === 1;
        out.textColumns = textCols.map(function(col){
          return {
            cx: +Number(col.cx || 0).toFixed(1),
            count: col.count,
            left: +Number(col.minLeft || 0).toFixed(1),
            right: +Number(col.maxRight || 0).toFixed(1),
            top: +Number(col.minTop || 0).toFixed(1),
            bottom: +Number(col.maxBottom || 0).toFixed(1)
          };
        });
        if (!out.singleTextColumn) {
          out.reason = explicitHero ? "explicitHeroRole" : "multiTextColumns";
          out.isHero = explicitHero;
          return out;
        }

        var centerX = rootW / 2;
        var textCol = textCols[0];
        var textCenterX = Number(textCol.cx || centerX);
        var centerDelta = Math.abs(textCenterX - centerX);
        var centerTol = Math.max(18, rootW * 0.12);
        out.centerDelta = +centerDelta.toFixed(1);
        out.centerTol = +centerTol.toFixed(1);

        var centeredAlignCount = 0;
        var maxTextWidthRatio = 0;
        var textTop = Infinity;
        var textBottom = -Infinity;
        for (var tix=0; tix<textItems.length; tix++){
          var t = textItems[tix];
          var ta = (t.node && t.node.style && t.node.style.textAlign)
            ? String(t.node.style.textAlign).toLowerCase()
            : "";
          if (ta === "center") centeredAlignCount++;
          var wRatio = Number(t.width || 0) / Math.max(1, rootW);
          if (wRatio > maxTextWidthRatio) maxTextWidthRatio = wRatio;
          textTop = Math.min(textTop, Number(t.top || 0));
          textBottom = Math.max(textBottom, Number(t.top || 0) + Number(t.height || 0));
        }
        out.maxTextWidthRatio = +maxTextWidthRatio.toFixed(3);
        out.widthRatio = out.maxTextWidthRatio;
        out.centeredByAlign = centeredAlignCount >= Math.max(1, Math.ceil(textItems.length * 0.5));
        out.centeredByGeometry = centerDelta <= centerTol;
        if (!out.centeredByAlign && !out.centeredByGeometry) {
          out.reason = explicitHero ? "explicitHeroRole" : "singleTextColumnNotCentered";
          out.isHero = explicitHero;
          return out;
        }

        // Evita marcar como hero textos sueltos muy chicos.
        if (textItems.length < 2 && maxTextWidthRatio < 0.28 && !explicitHero) {
          out.reason = "textTooSmall";
          return out;
        }

        if (!isFinite(textTop) || !isFinite(textBottom) || textBottom <= textTop) {
          textTop = 0;
          textBottom = 0;
        }
        var nearTop = textTop - Math.max(28, (textBottom - textTop) * 0.2);
        var nearBottom = textBottom + Math.max(36, (textBottom - textTop) * 0.35);
        var invadePad = Math.max(24, rootW * 0.17);
        var invadeLeft = textCenterX - invadePad;
        var invadeRight = textCenterX + invadePad;

        var decorNear = 0;
        var decorLeft = 0;
        var decorRight = 0;
        var decorInvading = 0;

        for (var iHero=0; iHero<items.length; iHero++){
          var it = items[iHero];
          if ((it.node.getAttribute("data-debug-texto") || "") === "1") continue;

          var w = Number(it.width || 0);
          var h = Number(it.height || 0);
          if (w < 8 || h < 8) continue;

          var top = Number(it.top || 0);
          var bottom = top + h;
          var inBand = !(bottom < nearTop || top > nearBottom);
          if (!inBand) continue;

          decorNear++;
          var cx = Number(it.left || 0) + w / 2;
          if (cx < textCenterX - 8) decorLeft++;
          else if (cx > textCenterX + 8) decorRight++;

          var left = Number(it.left || 0);
          var right = left + w;
          if (right > invadeLeft && left < invadeRight) decorInvading++;
        }

        out.decorNear = decorNear;
        out.decorLeft = decorLeft;
        out.decorRight = decorRight;
        out.decorInvadingTextColumn = decorInvading;

        var decorAround = (decorLeft > 0 && decorRight > 0) || decorNear >= 3;
        var centeredSingleTextColumn = out.singleTextColumn && (out.centeredByAlign || out.centeredByGeometry);
        out.isHero = explicitHero || centeredSingleTextColumn;
        out.reason = out.isHero
          ? (
            explicitHero
              ? "explicitHeroRole"
              : (decorInvading > 0
                ? "singleCenteredTextColumnDecorInvades"
                : (decorAround
                  ? "singleCenteredTextColumnWithDecor"
                  : "singleCenteredTextColumn"))
          )
          : "noHeroSignal";
        return out;
      }

      function detectInlinePairNoReflow(flowItems, allItems, rootW, CFG){
        var out = {
          skip: false,
          reason: "",
          totalFlow: flowItems ? flowItems.length : 0,
          totalAll: allItems ? allItems.length : 0,
          rowDelta: null,
          rowTol: null,
          pairSpan: null,
          pairSpanRatio: null,
          fitsTogether: false,
          bothSmall: false,
          smallWLimit: null,
          smallHLimit: null,
          widths: [],
          heights: []
        };
        if (!flowItems || flowItems.length !== 2 || !allItems || allItems.length !== 2 || !rootW || rootW <= 0) {
          out.reason = "notExactPair";
          return out;
        }

        var a = flowItems[0];
        var b = flowItems[1];
        var aW = Math.max(0, Number(a.width || 0));
        var bW = Math.max(0, Number(b.width || 0));
        var aH = Math.max(0, Number(a.height || 0));
        var bH = Math.max(0, Number(b.height || 0));
        out.widths = [+aW.toFixed(1), +bW.toFixed(1)];
        out.heights = [+aH.toFixed(1), +bH.toFixed(1)];

        if (aW < 2 || bW < 2 || aH < 2 || bH < 2) {
          out.reason = "invalidSizes";
          return out;
        }

        var rowTol = Math.max(12, Number((CFG && CFG.ROW_TOL) || 28) * 1.2);
        var rowDelta = Math.abs(Number(a.top || 0) - Number(b.top || 0));
        out.rowTol = +rowTol.toFixed(1);
        out.rowDelta = +rowDelta.toFixed(1);
        if (rowDelta > rowTol) {
          out.reason = "notInlineRow";
          return out;
        }

        var smallWLimit = Math.max(74, rootW * 0.42);
        var smallHLimit = Math.max(34, rootW * 0.2);
        out.smallWLimit = +smallWLimit.toFixed(1);
        out.smallHLimit = +smallHLimit.toFixed(1);
        var bothSmall =
          aW <= smallWLimit &&
          bW <= smallWLimit &&
          aH <= smallHLimit &&
          bH <= smallHLimit;
        out.bothSmall = bothSmall;
        if (!bothSmall) {
          out.reason = "pairNotSmall";
          return out;
        }

        var pairLeft = Math.min(Number(a.left || 0), Number(b.left || 0));
        var pairRight = Math.max(Number(a.left || 0) + aW, Number(b.left || 0) + bW);
        var pairSpan = Math.max(0, pairRight - pairLeft);
        var fitsTogether = pairSpan <= (rootW + 1);
        out.pairSpan = +pairSpan.toFixed(1);
        out.pairSpanRatio = +(pairSpan / Math.max(1, rootW)).toFixed(3);
        out.fitsTogether = fitsTogether;

        if (fitsTogether) {
          out.skip = true;
          out.reason = "smallInlinePairFits";
          return out;
        }

        out.reason = "smallInlinePairOverflow";
        return out;
      }

      function enforceInlinePairGap(flowItems, rootEl, rootW){
        var out = {
          applied: false,
          reason: "",
          minGap: 6,
          gapBefore: null,
          gapAfter: null,
          need: null,
          moveLeft: 0,
          moveRight: 0,
          overflowBefore: false,
          overflowAfter: false
        };
        var rootPadLeft = 0;
        if (rootEl) {
          var rootCS = getComputedStyle(rootEl);
          rootPadLeft = parseFloat(rootCS.paddingLeft) || 0;
        }
        if (!flowItems || flowItems.length !== 2 || !rootEl || !rootW || rootW <= 0) {
          out.reason = "notExactPair";
          return out;
        }

        var a = flowItems[0];
        var b = flowItems[1];
        if (!a || !b || !a.node || !b.node) {
          out.reason = "missingNodes";
          return out;
        }

        var leftItem = Number(a.left || 0) <= Number(b.left || 0) ? a : b;
        var rightItem = (leftItem === a) ? b : a;

        var rrL = relRect(leftItem.node, rootEl);
        var rrR = relRect(rightItem.node, rootEl);
        var lLeft = Number(rrL.left || 0);
        var lW = Number(rrL.width || 0);
        var rLeft = Number(rrR.left || 0);
        var rW = Number(rrR.width || 0);
        if (!isFinite(lLeft) || !isFinite(lW) || !isFinite(rLeft) || !isFinite(rW)) {
          out.reason = "invalidRects";
          return out;
        }

        var gapBefore = rLeft - (lLeft + lW);
        out.gapBefore = +gapBefore.toFixed(2);
        out.overflowBefore = (lLeft < -0.5) || ((rLeft + rW) > (rootW + 0.5));

        var need = Math.max(0, out.minGap - gapBefore);
        out.need = +need.toFixed(2);
        if (need <= 0.25) {
          out.reason = "alreadySpaced";
          out.gapAfter = out.gapBefore;
          out.overflowAfter = out.overflowBefore;
          return out;
        }

        var availRight = Math.max(0, rootW - (rLeft + rW));
        var availLeft = Math.max(0, lLeft);
        var moveRight = Math.min(availRight, need);
        var remaining = Math.max(0, need - moveRight);
        var moveLeft = Math.min(availLeft, remaining);

        if (moveRight <= 0.01 && moveLeft <= 0.01) {
          out.reason = "noRoomToAdjust";
          return out;
        }

        if (moveRight > 0.01) {
          rightItem.node.style.left = ((Number(rightItem.left || 0) + moveRight) - rootPadLeft) + "px";
          rightItem.node.style.right = "auto";
          rightItem.node.style.marginLeft = "0px";
        }
        if (moveLeft > 0.01) {
          leftItem.node.style.left = ((Number(leftItem.left || 0) - moveLeft) - rootPadLeft) + "px";
          leftItem.node.style.right = "auto";
          leftItem.node.style.marginLeft = "0px";
        }

        var rrL2 = relRect(leftItem.node, rootEl);
        var rrR2 = relRect(rightItem.node, rootEl);
        var lLeft2 = Number(rrL2.left || 0);
        var lW2 = Number(rrL2.width || 0);
        var rLeft2 = Number(rrR2.left || 0);
        var rW2 = Number(rrR2.width || 0);
        var gapAfter = rLeft2 - (lLeft2 + lW2);

        out.moveRight = +moveRight.toFixed(2);
        out.moveLeft = +moveLeft.toFixed(2);
        out.gapAfter = isFinite(gapAfter) ? +gapAfter.toFixed(2) : null;
        out.overflowAfter = (lLeft2 < -0.5) || ((rLeft2 + rW2) > (rootW + 0.5));
        out.applied = (moveRight > 0.01 || moveLeft > 0.01);
        out.reason = out.applied ? "applied" : "noChange";
        if (isFinite(gapAfter) && gapAfter < -0.2) out.reason = "appliedButStillOverlap";
        return out;
      }

      var prominentNonTextCount = itemsAll.filter(function(it){
        if ((it.node.getAttribute("data-debug-texto") || "") === "1") return false;
        var w = Number(it.width || 0);
        var h = Number(it.height || 0);
        if (w < 6 || h < 6) return false;
        return true;
      }).length;
      // Si hay cualquier no-texto visible, evitamos anclar textos por heuristica.
      // Esto impide que textos de una columna queden "congelados" en left original.
      var allowHeuristicAnchors = prominentNonTextCount === 0;

      // ✅ Determinar qué nodos son "ANCHOR" (no se reflowean)
      // Regla: texto centrado + casi full-width => título/hero, no mover.
      function isAnchorNode(it){
        var node = it.node;

        // opt-out explícito
        var keepLayout = (node.getAttribute("data-mobile-layout") || "") === "keep";
        if (keepLayout) return true;

        // anchor explícito (si lo usás)
        var role = (node.getAttribute("data-mobile-role") || "");
        if (role === "anchor") return true;

        // heurística para textos
        var isText = (node.getAttribute("data-debug-texto") || "") === "1";
        if (!isText) return false;
        if (!allowHeuristicAnchors) return false;

        var ta = (node.style && node.style.textAlign) ? String(node.style.textAlign).toLowerCase() : "";
        if (!ta) {
          try {
            ta = String(getComputedStyle(node).textAlign || "").toLowerCase();
          } catch(_e) {}
        }
        if (ta !== "center") return false;

        // solo si realmente ocupa casi todo el ancho usable
        // (esto evita romper textos centrados dentro de columnas)
        if (contentW > 0 && it.width >= contentW * 0.78) return true;

        return false;
      }

      // ✅ Flow = todo lo que NO es anchor
      var itemsFlow = itemsAll.filter(function(it){ return !isAnchorNode(it); });
      var itemsAnchor = itemsAll.filter(function(it){ return isAnchorNode(it); });
      mslLog("section:anchorSplit", {
        secIndex: secIndex,
        anchors: itemsAnchor.length,
        flow: itemsFlow.length,
        prominentNonTextCount: prominentNonTextCount,
        allowHeuristicAnchors: allowHeuristicAnchors,
        anchorsDetail: itemsAnchor.map(function(it){
          return {
            kind: (it.node.getAttribute("data-debug-texto") || "") === "1" ? "texto" : (it.node.tagName || "").toLowerCase(),
            top: +it.top.toFixed(1),
            left: +it.left.toFixed(1),
            w: +it.width.toFixed(1),
            h: +it.height.toFixed(1),
            textAlign: (it.node.style && it.node.style.textAlign) ? it.node.style.textAlign : ""
          };
        })
      });

      // Si no hay suficientes elementos reflowables, no hacemos nada
      if(itemsFlow.length < 2) {
        logReflowDecision("skip:flowTooSmall", {
          willApplyReflow: false,
          flowCount: itemsFlow.length,
          anchorCount: itemsAnchor.length
        });
        finalizeSection(0, baseBottomGap);
        return;
      }

      // ✅ Para que "altura necesaria" no quede corta,
      // medimos el bottom máximo de anchors (en coords del content)
      var maxAnchorBottom = 0;
      itemsAll.forEach(function(it){
        if (!isAnchorNode(it)) return;
        var b = (it.top || 0) + (it.height || 0);
        if (b > maxAnchorBottom) maxAnchorBottom = b;
      });

      // ✅ 1) agrupar por solape → clusters (SOLO FLOW)
      var clusters = buildOverlapClusters(itemsFlow);
      mslLog("section:clusters", {
        secIndex: secIndex,
        count: clusters.length,
        clusters: clusters.map(function(c, idx){
          return {
            i: idx,
            top: +c.top.toFixed(1),
            left: +c.left.toFixed(1),
            w: +c.width.toFixed(1),
            h: +c.height.toFixed(1),
            cx: +c.cx.toFixed(1),
            items: c.items.length
          };
        })
      });

      // ✅ 2) Detectar columnas/rows (SOLO FLOW)
      var rootW = contentW || 0;
      var ord = orderClustersForMobile(clusters, rootW, CFG);
      var groups = ord.groups;
      var mode = ord.mode;
      mslLog("section:ordering", {
        secIndex: secIndex,
        mode: mode,
        rootW: rootW,
        groups: groups.map(function(grp, gi){
          return {
            g: gi,
            count: grp.length,
            tops: grp.map(function(c){ return +c.top.toFixed(1); }),
            lefts: grp.map(function(c){ return +c.left.toFixed(1); })
          };
        })
      });

      var heroSignal = detectHeroLikeCentralText(itemsAll, rootW);
      mslLog("section:heroCheck", {
        secIndex: secIndex,
        mode: mode,
        isHero: heroSignal.isHero,
        reason: heroSignal.reason,
        textCount: heroSignal.textCount,
        textColumnCount: heroSignal.textColumnCount,
        singleTextColumn: heroSignal.singleTextColumn,
        textColumns: heroSignal.textColumns,
        maxTextWidthRatio: heroSignal.maxTextWidthRatio,
        widthRatio: heroSignal.widthRatio,
        centerDelta: heroSignal.centerDelta,
        centerTol: heroSignal.centerTol,
        centeredByAlign: heroSignal.centeredByAlign,
        centeredByGeometry: heroSignal.centeredByGeometry,
        decorNear: heroSignal.decorNear,
        decorLeft: heroSignal.decorLeft,
        decorRight: heroSignal.decorRight,
        decorInvadingTextColumn: heroSignal.decorInvadingTextColumn
      });
      if (heroSignal.isHero) {
        logReflowDecision("skip:heroCentralText", {
          willApplyReflow: false,
          mode: mode,
          heroReason: heroSignal.reason,
          hero: heroSignal
        });
        finalizeSection(0, baseBottomGap);
        return;
      }

      var inlinePairSignal = detectInlinePairNoReflow(itemsFlow, itemsAll, rootW, CFG);
      mslLog("section:inlinePairCheck", {
        secIndex: secIndex,
        mode: mode,
        skip: inlinePairSignal.skip,
        reason: inlinePairSignal.reason,
        totalFlow: inlinePairSignal.totalFlow,
        totalAll: inlinePairSignal.totalAll,
        rowDelta: inlinePairSignal.rowDelta,
        rowTol: inlinePairSignal.rowTol,
        widths: inlinePairSignal.widths,
        heights: inlinePairSignal.heights,
        bothSmall: inlinePairSignal.bothSmall,
        smallWLimit: inlinePairSignal.smallWLimit,
        smallHLimit: inlinePairSignal.smallHLimit,
        pairSpan: inlinePairSignal.pairSpan,
        pairSpanRatio: inlinePairSignal.pairSpanRatio,
        fitsTogether: inlinePairSignal.fitsTogether
      });
      if (inlinePairSignal.skip) {
        var inlinePairAdjust = enforceInlinePairGap(itemsFlow, content, rootW);
        mslLog("section:inlinePairAdjust", {
          secIndex: secIndex,
          mode: mode,
          adjust: inlinePairAdjust
        });
        logReflowDecision("skip:smallInlinePairFits", {
          willApplyReflow: false,
          mode: mode,
          inlinePair: inlinePairSignal,
          inlinePairAdjust: inlinePairAdjust
        });
        finalizeSection(0, baseBottomGap);
        return;
      }

      // ✅ 3) Gate "mejor de ambos mundos":
      // - Si es "one" (layout ya natural) Y además entra, NO hacemos reflow.
      // - En cualquier otro caso (two/three/rows), hacemos reflow para lectura mobile,
      //   incluso aunque "entre".
      var fits = clustersFitInMobile(clusters, content);
      mslLog("section:fitCheck", {
        secIndex: secIndex,
        mode: mode,
        fits: fits,
        willSkip: (mode === "one" && fits)
      });
      if (mode === "one" && fits) {
        logReflowDecision("skip:modeOneFits", {
          willApplyReflow: false,
          mode: mode,
          fits: fits,
          clusters: clusters.length,
          flowCount: itemsFlow.length
        });
        finalizeSection(0, baseBottomGap);
        return;
      }

      logReflowDecision("apply:modeRequiresReflow", {
        willApplyReflow: true,
        mode: mode,
        fits: fits,
        clusters: clusters.length,
        flowCount: itemsFlow.length,
        anchorCount: itemsAnchor.length,
        groupSizes: groups.map(function(grp){ return grp.length; })
      });

      // ✅ 4) Reflow solo sobre FLOW (preserva solapes dentro de cada cluster)
      var res = applyClusterStack(groups, content, CFG, mode);
      mslLog("section:applyResult", {
        secIndex: secIndex,
        changed: !!(res && res.changed),
        neededHeight: res ? res.neededHeight : null,
        maxAnchorBottom: +maxAnchorBottom.toFixed(1),
        baseBottomGap: +baseBottomGap.toFixed(1)
      });
      logReflowDecision("postApply", {
        willApplyReflow: true,
        changed: !!(res && res.changed),
        neededHeight: res ? +Number(res.neededHeight || 0).toFixed(1) : null,
        mode: mode
      });

      var neededAfterReflow = 0;
      if (res && res.changed) {
        // Evitar que la sección quede chica si hay anchors más abajo
        var needed = Number(res.neededHeight || 0);
        if (Number(maxAnchorBottom) > 0) {
          // sumamos padding bottom para que no quede pegado
          var anchorNeeded = Math.ceil(maxAnchorBottom + (CFG.PAD_BOT || 0));
          if (anchorNeeded > needed) needed = anchorNeeded;
        }
        if (baseBottomGap > 0) {
          needed = Math.ceil(needed + baseBottomGap);
        }
        if (needed > 0) neededAfterReflow = needed;
      }
      finalizeSection(neededAfterReflow, baseBottomGap);
    });
  }

  function boot(){
    mslLog("boot", { cfg: CFG });
    runOnce();
    setTimeout(runOnce, 150);
    setTimeout(runOnce, 600);
    setTimeout(runOnce, 1800);

    if(document.fonts && document.fonts.ready){
      document.fonts.ready.then(function(){ runOnce(); }).catch(function(){});
    }
  }

  window.addEventListener("load", boot);
  window.addEventListener("resize", runOnce);

  if(window.visualViewport){
    window.visualViewport.addEventListener("resize", runOnce);
    window.visualViewport.addEventListener("scroll", runOnce);
  }

  if(document.readyState !== "loading") boot();
  else document.addEventListener("DOMContentLoaded", boot);
})();
</script>
`.trim();
}
