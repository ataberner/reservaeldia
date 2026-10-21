import assert from "node:assert/strict";
import test from "node:test";
import { makeScene, resetCounts, withDiagnosticFlags } from "./testSupport/loadGuideDiagnostics.mjs";

test("PERF01: disabled diagnostics avoid the two extra text content measurements", (t) => {
  withDiagnosticFlags(false, () => {
    const scene = makeScene();
    scene.prepare();
    resetCounts([scene.moving, ...scene.targets]);
    const result = scene.evaluate();
    assert.equal(scene.moving.x(), 100);
    assert.equal(result.snapMovedNode, true);
    t.diagnostic(JSON.stringify({ moving: scene.moving.counts, target: scene.targets[0].counts }));
    assert.ok(scene.moving.counts.clientRect <= 2,
      "only functional pre/post reads may reach getClientRect with diagnostics disabled");
    assert.ok(scene.moving.counts.transform <= 4,
      "disabled diagnostics must not add two authoritative Text geometry projections");
  });
});

test("PERF01: disabled diagnostics do not allocate or record text contract snapshots", () => {
  withDiagnosticFlags(false, ({ debugWindow }) => {
    const scene = makeScene();
    scene.prepare();
    const result = scene.evaluate();
    assert.equal(result.snapCommitted, true);
    assert.ok(scene.lines().length > 0);
    assert.equal(debugWindow.__TEXT_GEOMETRY_CONTRACT_DEBUG_STORE, undefined);
  });
});

test("diagnostic on/off preserves live snapping and guide geometry over the same trajectory", () => {
  const trajectory = [102, 108, 119, 124, 160, 122, 102];
  const run = (enabled) => withDiagnosticFlags(enabled, ({ debugWindow, logs, setNow }) => {
    const scene = makeScene();
    scene.prepare();
    const samples = trajectory.map((x, index) => {
      setNow(1000 + index * 40);
      scene.moving.x(x);
      const result = scene.evaluate();
      return {
        x: scene.moving.x(), y: scene.moving.y(), lines: scene.lines(),
        snapCommitted: result.snapCommitted, snapMovedNode: result.snapMovedNode,
        snapXSource: result.snapXSource, snapYSource: result.snapYSource,
      };
    });
    if (enabled) {
      assert.ok(logs.length > 0, "enabled policy must keep diagnostic output usable");
      assert.ok(debugWindow.__TEXT_GEOMETRY_CONTRACT_DEBUG_STORE.latestSnapByKey["drag-counting"]);
    }
    return samples;
  });
  assert.deepEqual(run(false), run(true));
});

for (const elementCount of [1, 10, 50, 100]) {
  test(`cache operation baseline: ${elementCount} elements reuse warm target boxes`, (t) => {
    withDiagnosticFlags(false, () => {
      const scene = makeScene({ elementCount, movingType: "forma" });
      scene.prepare();
      const coldTargetReads = scene.targets.reduce((sum, node) => sum + node.counts.clientRect, 0);
      assert.equal(coldTargetReads, elementCount - 1);
      resetCounts([scene.moving, ...scene.targets]);
      scene.evaluate();
      const warm = scene.targets.reduce((sum, node) => {
        for (const [key, value] of Object.entries(node.counts)) sum[key] = (sum[key] || 0) + value;
        return sum;
      }, {});
      assert.equal(warm.clientRect || 0, 0, "warm targets must reuse their authoritative bounds");
      assert.equal(warm.attrs || 0, elementCount - 1);
      assert.equal(warm.attrKeys || 0, 12 * (elementCount - 1));
      assert.equal(warm.getters || 0, 12 * (elementCount - 1));
      assert.equal(warm.children || 0, elementCount - 1);
      t.diagnostic(JSON.stringify({ elementCount, coldTargetReads, warmTarget: warm }));
    });
  });
}
