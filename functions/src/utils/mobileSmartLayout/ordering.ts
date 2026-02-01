// functions/src/utils/mobileSmartLayout/ordering.ts
export function jsOrderingBlock(): string {
  return `
  /**
   * Ordena CLUSTERS (no items) para lectura mobile.
   * Devuelve groups (array de columnas/grupos) y mode.
   *
   * - three: [colL, colC, colR]
   * - two:   [left, right]
   * - rows:  [out] (fila+left)
   * - one:   [sortedTop]
   */
  function orderClustersForMobile(clusters, rootW, CFG){
    if (!rootW || rootW <= 0) {
      var o = clusters.slice().sort(function(a,b){ return a.top - b.top; });
      return { groups: [o], mode: "one" };
    }

    // -------- 1) Intentar 3 columnas claras --------
    var t1 = rootW / 3;
    var t2 = (2 * rootW) / 3;

    var colL = [];
    var colC = [];
    var colR = [];

    for (var i=0;i<clusters.length;i++){
      var c = clusters[i];
      var x = c.cx;
      if (x < t1) colL.push(c);
      else if (x < t2) colC.push(c);
      else colR.push(c);
    }

    var looksThree =
      (colL.length >= CFG.MIN_PER_COL_3 && colC.length >= CFG.MIN_PER_COL_3 && colR.length >= CFG.MIN_PER_COL_3);

    if (looksThree) {
      var cxs = [];
      for (var j=0;j<clusters.length;j++) cxs.push(clusters[j].cx);
      cxs.sort(function(a,b){ return a-b; });
      var p20 = percentile(cxs, 0.20);
      var p80 = percentile(cxs, 0.80);
      var spread = (p80 - p20);
      if (spread < rootW * CFG.THREE_COL_SPREAD_RATIO) looksThree = false;
    }

    if (looksThree) {
      colL.sort(function(a,b){ return a.top - b.top; });
      colC.sort(function(a,b){ return a.top - b.top; });
      colR.sort(function(a,b){ return a.top - b.top; });
      return { groups: [colL, colC, colR], mode: "three" };
    }

    // -------- 2) Intentar 2 columnas claras --------
    var mid = rootW / 2;
    var left = [];
    var right = [];

    for (var k=0;k<clusters.length;k++){
      var c2 = clusters[k];
      if (c2.cx < mid) left.push(c2);
      else right.push(c2);
    }

    var looksTwo = (left.length >= CFG.MIN_PER_COL_2 && right.length >= CFG.MIN_PER_COL_2);

    if (looksTwo) {
      var cxs2 = [];
      for (var m=0;m<clusters.length;m++) cxs2.push(clusters[m].cx);
      cxs2.sort(function(a,b){ return a-b; });
      var p25 = percentile(cxs2, 0.25);
      var p75 = percentile(cxs2, 0.75);
      var spread2 = (p75 - p25);
      if (spread2 < rootW * CFG.TWO_COL_SPREAD_RATIO) looksTwo = false;
    }

    if (looksTwo) {
      left.sort(function(a,b){ return a.top - b.top; });
      right.sort(function(a,b){ return a.top - b.top; });
      return { groups: [left, right], mode: "two" };
    }

    // -------- 3) Fallback: filas (top) y dentro por left --------
    var sorted = clusters.slice().sort(function(a,b){ return a.top - b.top; });

    var rows = [];
    for (var r=0;r<sorted.length;r++){
      var c3 = sorted[r];
      var placed = false;

      for (var rr=0; rr<rows.length; rr++){
        var row = rows[rr];
        if (Math.abs(c3.top - row.top) <= CFG.ROW_TOL){
          row.items.push(c3);
          row.top = (row.top * (row.items.length - 1) + c3.top) / row.items.length;
          placed = true;
          break;
        }
      }

      if (!placed) rows.push({ top: c3.top, items: [c3] });
    }

    rows.sort(function(a,b){ return a.top - b.top; });
    rows.forEach(function(row){
      row.items.sort(function(a,b){ return a.left - b.left; });
    });

    var out = [];
    rows.forEach(function(row){
      for (var z=0; z<row.items.length; z++) out.push(row.items[z]);
    });

    return { groups: [out], mode: "rows" };
  }
`.trim();
}
