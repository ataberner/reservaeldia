// functions/src/utils/mobileSmartLayout/scriptTemplate.ts
import { NormalizedConfig } from "./config";
import { jsDomHelpersBlock } from "./dom";
import { jsOrderingBlock } from "./ordering";
import { jsStackingBlock } from "./stacking";

export function buildScript(cfg: NormalizedConfig): string {
  if (!cfg.enabled) return "";

  return `
<script>
(function(){
  var ENABLED = true;

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
    MIN_PER_COL_3: ${cfg.minPerColumn3}
  };

  ${jsDomHelpersBlock()}

  ${jsOrderingBlock()}

  ${jsStackingBlock()}

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
    if(!isMobile()) return;

    var secs = Array.from(document.querySelectorAll(".sec"));
    if(!secs.length) return;

    secs.forEach(function(sec){
      if(!shouldProcessSection(sec)) return;

      var content = sec.querySelector(".sec-content");
      if(!content) return;

            var nodesAll = getObjNodes(sec);
      if(nodesAll.length < 2) return;

      // ✅ Armamos items de TODOS para poder decidir qué es "anchor" con métricas reales
      var contentRect = content.getBoundingClientRect();
      var contentW = contentRect.width || 0;

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

      // Si todo mide 0 (fonts no listas), reintentamos luego
      var anyValidAll = itemsAll.some(function(it){ return it.height > 0.5; });
      if(!anyValidAll) return;

      // ✅ Determinar qué nodos son "ANCHOR" (no se reflowean)
      // Regla: texto centrado + casi full-width => es título/hero, no mover.
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

      // Si no hay suficientes elementos reflowables, no hacemos nada
      if(itemsFlow.length < 2) return;

      // ✅ 1) agrupar por solape → clusters (SOLO FLOW)
      var clusters = buildOverlapClusters(itemsFlow);

      // ✅ 2) Detectar columnas/rows (SOLO FLOW)
      var rootW = content.getBoundingClientRect().width || 0;
      var ord = orderClustersForMobile(clusters, rootW, CFG);
      var groups = ord.groups;
      var mode = ord.mode;

      // ✅ 3) Gate: si entra todo, no reflow (SOLO FLOW)
      var fits = clustersFitInMobile(clusters, content);
      if (fits) return;

      // ✅ 4) Reflow solo sobre FLOW (preserva solapes dentro de cada cluster)
      var res = applyClusterStack(groups, content, CFG);

      if (res.changed) {
        expandFixedSection(sec, res.neededHeight);
      }


      // Si todo mide 0 (fonts no listas), reintentamos luego
      var anyValid = items.some(function(it){ return it.height > 0.5; });
      if(!anyValid) return;

      // ✅ 1) agrupar por solape → clusters
      var clusters = buildOverlapClusters(items);

      // ✅ 2) Detectar si es 1-col / 2-col / 3-col / rows (con clusters)
        var rootW = content.getBoundingClientRect().width || 0;
        var ord = orderClustersForMobile(clusters, rootW, CFG);
        var groups = ord.groups;
        var mode = ord.mode;

        // ✅ 3) Gate correcto:
        // - Si es "one" (layout ya natural) Y además entra, no hacemos reflow.
        // - En cualquier otro caso (two/three/rows), hacemos reflow para lectura mobile.
        var fits = clustersFitInMobile(clusters, content);

        if (mode === "one" && fits) {
        return; // mantiene layout y solapes tal cual
        }

        // ✅ 4) Reflow (preserva solapes dentro de cada cluster)
        var res = applyClusterStack(groups, content, CFG);

        if (res.changed) {
        expandFixedSection(sec, res.neededHeight);
        }

    });
  }

  function boot(){
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
