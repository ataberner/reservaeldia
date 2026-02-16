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
  var MSL_DEBUG = (function(){
    try {
      var search = (window.location && window.location.search) ? window.location.search : "";
      var qp = new URLSearchParams(search);
      var force = qp.get("mslDebug");
      if (force === "1") {
        try { localStorage.setItem("mslDebug", "1"); } catch(_e1) {}
        return true;
      }
      if (force === "0") {
        try { localStorage.removeItem("mslDebug"); } catch(_e2) {}
        return false;
      }
      return localStorage.getItem("mslDebug") === "1";
    } catch(_e) {
      return false;
    }
  })();
  var MSL_VERBOSE = (function(){
    try {
      var search = (window.location && window.location.search) ? window.location.search : "";
      var qp = new URLSearchParams(search);
      var force = qp.get("mslVerbose");
      if (force === "1") {
        try { localStorage.setItem("mslVerbose", "1"); } catch(_e1) {}
        return true;
      }
      if (force === "0") {
        try { localStorage.removeItem("mslVerbose"); } catch(_e2) {}
        return false;
      }
      return localStorage.getItem("mslVerbose") === "1";
    } catch(_e) {
      return false;
    }
  })();
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

  function runOnce(){
    if(!ENABLED) return;
    if(!isMobile()) {
      Array.from(document.querySelectorAll(".sec")).forEach(function(sec){
        var content = sec.querySelector(".sec-content");
        if(!content) return;
        var bleed = sec.querySelector(".sec-bleed");
        resetSectionFitScale(sec, content, bleed);
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

      function finalizeSection(minNeededHeight){
        var fit = applySectionFitScale(sec, content, bleed, nodesAll, secModo, CFG, { secIndex: secIndex });
        var fitNeeded = (fit && Number.isFinite(fit.neededHeight)) ? Number(fit.neededHeight) : 0;
        var neededHeight = Math.max(Number(minNeededHeight || 0), fitNeeded);
        if (secModo === "fijo" && neededHeight > 0) {
          expandFixedSection(sec, neededHeight);
        }
      }

      if(!nodesAll.length) {
        finalizeSection(0);
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
        var hasOrigTop = node.hasAttribute("data-msl-orig-top");
        var hasOrigLeft = node.hasAttribute("data-msl-orig-left");
        var hasOrigTransform = node.hasAttribute("data-msl-orig-transform");
        if (!hasOrigTop) node.setAttribute("data-msl-orig-top", node.style.top || "");
        if (!hasOrigLeft) node.setAttribute("data-msl-orig-left", node.style.left || "");
        if (!hasOrigTransform) node.setAttribute("data-msl-orig-transform", node.style.transform || "");

        var origTop = node.getAttribute("data-msl-orig-top");
        var origLeft = node.getAttribute("data-msl-orig-left");
        var origTransform = node.getAttribute("data-msl-orig-transform");

        if (origTop != null && node.style.top !== origTop) {
          node.style.top = origTop;
          restoredCount++;
        }
        if (origLeft != null && node.style.left !== origLeft) {
          node.style.left = origLeft;
          restoredCount++;
        }
        if (origTransform != null && node.style.transform !== origTransform) {
          node.style.transform = origTransform;
          restoredCount++;
        }
        node.style.right = "auto";
        node.style.marginLeft = "0px";
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
        finalizeSection(0);
        return;
      }

      if (!allowReflow || nodesAll.length < 2) {
        finalizeSection(0);
        return;
      }

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

        var ta = (node.style && node.style.textAlign) ? String(node.style.textAlign).toLowerCase() : "";
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
        finalizeSection(0);
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
        finalizeSection(0);
        return;
      }

      // ✅ 4) Reflow solo sobre FLOW (preserva solapes dentro de cada cluster)
      var res = applyClusterStack(groups, content, CFG, mode);
      mslLog("section:applyResult", {
        secIndex: secIndex,
        changed: !!(res && res.changed),
        neededHeight: res ? res.neededHeight : null,
        maxAnchorBottom: +maxAnchorBottom.toFixed(1),
        baseBottomGap: +baseBottomGap.toFixed(1)
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
      finalizeSection(neededAfterReflow);
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
