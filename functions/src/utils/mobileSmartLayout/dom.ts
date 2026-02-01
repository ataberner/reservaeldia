// functions/src/utils/mobileSmartLayout/dom.ts
export function jsDomHelpersBlock(): string {
  return `
  function clamp(n,a,b){ return Math.max(a, Math.min(b,n)); }

  function isMobile(){
    return (document.documentElement.clientWidth || 0) <= 767;
  }

  function getObjNodes(sec){
    var content = sec.querySelector(".sec-content");
    if(!content) return [];
    return Array.from(content.querySelectorAll(".objeto"));
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

    for (var i=0;i<n;i++){
      for (var j=i+1;j<n;j++){
        if (rectsOverlap(items[i], items[j], TOL)) union(i,j);
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
