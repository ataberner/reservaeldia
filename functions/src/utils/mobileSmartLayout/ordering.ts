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
    mslLog("order:three:candidates", {
      rootW: rootW,
      total: clusters.length,
      colL: colL.length,
      colC: colC.length,
      colR: colR.length,
      minPerCol3: CFG.MIN_PER_COL_3
    });

    if (looksThree) {
      var cxs = [];
      for (var j=0;j<clusters.length;j++) cxs.push(clusters[j].cx);
      cxs.sort(function(a,b){ return a-b; });
      var p20 = percentile(cxs, 0.20);
      var p80 = percentile(cxs, 0.80);
      var spread = (p80 - p20);
      mslLog("order:three:spread", {
        p20: p20,
        p80: p80,
        spread: spread,
        minSpread: rootW * CFG.THREE_COL_SPREAD_RATIO,
        pass: spread >= rootW * CFG.THREE_COL_SPREAD_RATIO
      });
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
    mslLog("order:two:candidates", {
      rootW: rootW,
      total: clusters.length,
      left: left.length,
      right: right.length,
      minPerCol2: CFG.MIN_PER_COL_2
    });

    if (looksTwo) {
      var cxs2 = [];
      for (var m=0;m<clusters.length;m++) cxs2.push(clusters[m].cx);
      cxs2.sort(function(a,b){ return a-b; });
      var p25 = percentile(cxs2, 0.25);
      var p75 = percentile(cxs2, 0.75);
      var spread2 = (p75 - p25);
      mslLog("order:two:spread", {
        p25: p25,
        p75: p75,
        spread: spread2,
        minSpread: rootW * CFG.TWO_COL_SPREAD_RATIO,
        pass: spread2 >= rootW * CFG.TWO_COL_SPREAD_RATIO
      });
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

    function clusterIsText(c){
      if (!c || !c.items || !c.items.length) return false;
      for (var i2=0; i2<c.items.length; i2++){
        if ((c.items[i2].node.getAttribute("data-debug-texto") || "") !== "1") return false;
      }
      return true;
    }

    var out = [];
    var didInterleave = false;
    // Caso especial: dos filas simétricas (ej. íconos arriba y textos abajo).
    // Reordenamos por columna: top1,bottom1,top2,bottom2,...
    if (rows.length === 2 && rows[0].items.length === rows[1].items.length && rows[0].items.length >= 2) {
      var topRow = rows[0].items.slice();
      var botRow = rows[1].items.slice();
      var topHasNonText = topRow.some(function(c){ return !clusterIsText(c); });
      var botMostlyText = botRow.filter(function(c){ return clusterIsText(c); }).length >= Math.ceil(botRow.length / 2);

      if (topHasNonText && botMostlyText) {
        var usedBottom = {};
        for (var tr=0; tr<topRow.length; tr++){
          var a = topRow[tr];
          out.push(a);

          var bestIdx = -1;
          var bestDist = Infinity;
          for (var br=0; br<botRow.length; br++){
            if (usedBottom[br]) continue;
            var b = botRow[br];
            var d = Math.abs((a.left || 0) - (b.left || 0));
            if (d < bestDist) {
              bestDist = d;
              bestIdx = br;
            }
          }
          if (bestIdx >= 0) {
            out.push(botRow[bestIdx]);
            usedBottom[bestIdx] = true;
          }
        }
        for (var br2=0; br2<botRow.length; br2++){
          if (!usedBottom[br2]) out.push(botRow[br2]);
        }
        didInterleave = true;
      }
    }

    if (!didInterleave) {
      rows.forEach(function(row){
        for (var z=0; z<row.items.length; z++) out.push(row.items[z]);
      });
    }
    mslLog("order:rows:fallback", {
      rows: rows.map(function(r){
        return {
          top: +r.top.toFixed(1),
          len: r.items.length,
          lefts: r.items.map(function(it){ return +it.left.toFixed(1); })
        };
      }),
      outLen: out.length,
      didInterleave: didInterleave
    });

    return { groups: [out], mode: "rows" };
  }
`.trim();
}
