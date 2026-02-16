// functions/src/utils/mobileSmartLayout/dom.ts
export function jsDomHelpersBlock(): string {
  return `
  function clamp(n,a,b){ return Math.max(a, Math.min(b,n)); }

  function isMobile(){
    return (document.documentElement.clientWidth || 0) <= 767;
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
  // ✅ CLUSTERS POR SOLAPE
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

  function verticalGapPx(a, b){
    var topAfter = Math.max(a.top, b.top);
    var bottomBefore = Math.min(a.top + a.height, b.top + b.height);
    return topAfter - bottomBefore;
  }

  function buildOverlapClusters(items){
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

    // tol pequeño para considerar “encimado” aunque sea apenas
    var TOL = 1;
    // unión por cercanía vertical dentro de una misma "columna visual"
    var PROX_Y = 34;
    var MIN_H_OVERLAP_RATIO = 0.35;
    var MAX_CX_DIST = 42;

    for (var i=0;i<n;i++){
      for (var j=i+1;j<n;j++){
        var a = items[i], b = items[j];

    var aIso = (a.node.getAttribute("data-mobile-cluster") || "") === "isolated";
    var bIso = (b.node.getAttribute("data-mobile-cluster") || "") === "isolated";

    // si cualquiera es isolated, no lo unimos con nadie
    if (aIso || bIso) continue;

    // opcional: cluster-id manual (si querés agrupar solo algunos)
    var aKey = a.node.getAttribute("data-mobile-cluster-id") || "";
    var bKey = b.node.getAttribute("data-mobile-cluster-id") || "";
    if (aKey && bKey && aKey !== bKey) continue;

    if (rectsOverlap(a, b, TOL)) {
      union(i,j);
      continue;
    }

    // Si no se solapan pero están muy cerca en vertical y comparten columna,
    // también los unimos para mantener bloque (ej: ícono + texto debajo).
    var hov = horizontalOverlapPx(a, b);
    var minW = Math.max(1, Math.min(a.width || 0, b.width || 0));
    var hovRatio = hov / minW;
    var cxDist = Math.abs(cx(a) - cx(b));
    var sameVisualColumn = (hovRatio >= MIN_H_OVERLAP_RATIO) || (cxDist <= MAX_CX_DIST);
    var vGap = verticalGapPx(a, b);
    var nearVertical = vGap >= 0 && vGap <= PROX_Y;
    var aIsText = (a.node.getAttribute("data-debug-texto") || "") === "1";
    var bIsText = (b.node.getAttribute("data-debug-texto") || "") === "1";
    var bothText = aIsText && bIsText;

    // Evitar "pegar" párrafos entre sí solo por cercanía vertical.
    // La unión por proximidad queda para pares mixtos (texto + no-texto),
    // manteniendo el caso icono/forma + texto.
    if (sameVisualColumn && nearVertical && !bothText) union(i,j);

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

      // offsets relativos para preservar el solape dentro del cluster
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
