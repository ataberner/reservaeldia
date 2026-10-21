// Test-only instrumentation for both the offline bundle and disposable local
// editor copies. Never imported by the application or used for final timings.
const path = require("node:path");
const ts = require(path.join(__dirname, "../../../functions/node_modules/typescript"));

const TARGETS = {
  "useGuiasCentrado.js": new Set([
    "readGuideTargetGeometrySample", "getNodeBox", "getObjectCache",
    "getSectionGuideTargets", "readActiveDragBox", "readTextGuideGeometryDiagnostics",
    "mostrarGuias", "prepararGuias", "commitGuideLines", "publishGuideLines",
    "applyStageSnapDelta", "buildSameSectionGuides", "resolveAxisDecision", "applySnap",
  ]),
  "SelectionBoundsIndicator.jsx": new Set([
    "resolveSelectionBounds", "maybeLogOverlayTextMismatch", "applyIndicatorBounds",
  ]),
  "CanvasStageContentComposer.jsx": new Set([
    "resolveLiveDragSelectionSnapshot", "syncControlledDragOverlayBounds",
    "recordSelectionDragMoveSummary", "flushScheduledGuideEvaluation",
    "noteDragOverlayDragSample", "applyPendingStartupControlledDragOverlaySync",
  ]),
  "konvaAuthoritativeBounds.js": new Set(["resolveAuthoritativeTextGeometry"]),
  "selectionBoundsGeometry.js": new Set(["resolveNodeSelectionRect"]),
};

function functionName(node) {
  if (ts.isFunctionDeclaration(node)) return node.name?.text;
  const parent = node.parent;
  if (ts.isVariableDeclaration(parent)) return parent.name?.text;
  if (ts.isCallExpression(parent) && parent.arguments[0] === node &&
      ts.isVariableDeclaration(parent.parent)) return parent.parent.name?.text;
  return null;
}

function instrumentDragPerformance(source, filename) {
  const basename = path.basename(filename);
  const selected = TARGETS[basename];
  if (!selected) return { source, functions: [], sampleHooks: [] };
  if (source.includes("const __dragPerfStop = globalThis.__DRAG_PERF_PROBE")) {
    throw new Error(`Refusing to instrument an already instrumented source: ${filename}`);
  }
  const tree = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true,
    filename.endsWith(".jsx") ? ts.ScriptKind.JSX : ts.ScriptKind.JS);
  if (tree.parseDiagnostics.length) throw new Error(`Cannot instrument invalid syntax: ${filename}`);
  const edits = [];
  const functions = [];
  const sampleHooks = [];
  const note = (kind, expression) => `; if (globalThis.__DRAG_PERF_PROBE?.realSampleActive === true) { globalThis.__DRAG_PERF_PROBE.noteRealDrag(${JSON.stringify(kind)}, ${expression}); }`;
  const walkOwn = (root, visitOwn) => {
    const walk = (node) => {
      if (node !== root && (ts.isArrowFunction(node) || ts.isFunctionExpression(node) || ts.isFunctionDeclaration(node))) return;
      visitOwn(node);
      ts.forEachChild(node, walk);
    };
    walk(root);
  };
  const afterVariable = (root, variable, kind, expression) => {
    walkOwn(root, (node) => {
      if (!ts.isVariableDeclaration(node) || node.name.getText(tree) !== variable) return;
      const statement = node.parent?.parent;
      if (!ts.isVariableStatement(statement)) throw new Error(`Unsupported instrumentation binding: ${variable}`);
      edits.push({ at: statement.end, text: note(kind, expression) });
      sampleHooks.push(`${basename}:${kind}`);
    });
  };
  const annotate = (node, name) => {
    if (basename === "CanvasStageContentComposer.jsx") {
      if (name === "resolveLiveDragSelectionSnapshot") {
        afterVariable(node, "bounds", "selection-resolved", `{
          selectedIds: safeSelectedIds, bounds, session: dragOverlayBoxFlowSessionRef.current,
          nodes: safeSelectedIds.map(id => elementRefs.current?.[id]), stage: stageRef?.current,
          objects: objetos, objectLookup, isMobile
        }`);
      }
      if (name === "flushScheduledGuideEvaluation") {
        afterVariable(node, "guideOutcome", "guide-outcome", "{ request: payload, outcome: guideOutcome, session: dragOverlayBoxFlowSessionRef.current }");
      }
      if (name === "syncControlledDragOverlayBounds") {
        afterVariable(node, "nextBounds", "overlay-request", "{ source, syncToken, dragId, selectedIds: safeSelectedIds, bounds: nextBounds, provided: resolvedLiveSelectionSnapshot === liveSelectionSnapshot, session: activeSession }");
        walkOwn(node, (child) => {
          if (ts.isReturnStatement(child) && child.expression?.getText(tree) === "nextSnapshot") {
            edits.push({ at: child.getStart(tree), text: note("overlay-result", "{ snapshot: nextSnapshot, session: activeSession }") });
            sampleHooks.push(`${basename}:overlay-result`);
          }
          if (ts.isIfStatement(child) && child.expression.getText(tree) === "isTextOverlaySync" && ts.isBlock(child.thenStatement)) {
            const label = `${basename}:text-authority-diagnostic`;
            edits.push({ at: child.thenStatement.getStart(tree) + 1, text: `const __dragPerfTextStop = globalThis.__DRAG_PERF_PROBE?.begin?.(${JSON.stringify(label)}); try {` });
            edits.push({ at: child.thenStatement.end - 1, text: "} finally { __dragPerfTextStop?.(); }" });
            sampleHooks.push(label);
          }
        });
      }
      if (name === "noteDragOverlayDragSample") {
        afterVariable(node, "dragSample", "authoritative-drag-sample", "{ sample: dragSample, session: activeSession }");
      }
    }
    if (basename === "useGuiasCentrado.js" && name === "getSectionGuideTargets") {
      walkOwn(node, (child) => {
        if (ts.isReturnStatement(child) && ts.isObjectLiteralExpression(child.expression)) {
          edits.push({ at: child.getStart(tree), text: note("target-cache", "{ cacheHit, sameSession, targetCount: targets.length, sectionCandidateCount: objetosSeccion.length, sessionId, elementId: idSelf }") });
          sampleHooks.push(`${basename}:target-cache`);
        }
      });
    }
  };
  const sampleBoundary = (node) => {
    if (basename !== "CanvasStageContentComposer.jsx" || !ts.isArrowFunction(node) || !ts.isBlock(node.body)) return;
    let parent = node.parent;
    while (parent && !ts.isJsxAttribute(parent)) {
      if (ts.isArrowFunction(parent) || ts.isFunctionExpression(parent) || ts.isFunctionDeclaration(parent)) return;
      parent = parent.parent;
    }
    if (parent?.name.getText(tree) !== "onDragMovePersonalizado") return;
    const names = node.parameters.map((parameter) => parameter.name.getText(tree));
    if (names.length !== 3 || !names.every((name) => /^[A-Za-z_$][\w$]*$/.test(name))) {
      throw new Error("Unsupported onDragMovePersonalizado instrumentation signature");
    }
    const [position, elementId, meta] = names;
    const prefix = `const __dragPerfSampleStop = globalThis.__DRAG_PERF_PROBE?.beginRealSample?.({
      handler: "onDragMovePersonalizado", elementId: ${elementId}, family: obj?.tipo || null,
      pipeline: ${meta}?.pipeline || "individual", inputPosition: ${position},
      session: dragOverlayBoxFlowSessionRef.current
    }); try {`;
    const suffix = "} finally { __dragPerfSampleStop?.({ session: dragOverlayBoxFlowSessionRef.current }); }";
    edits.push({ at: node.body.getStart(tree) + 1, text: prefix });
    edits.push({ at: node.body.end - 1, text: suffix });
    sampleHooks.push(`${basename}:onDragMovePersonalizado`);
  };
  const visit = (node) => {
    if ((ts.isFunctionDeclaration(node) || ts.isArrowFunction(node) || ts.isFunctionExpression(node)) && node.body) {
      const name = functionName(node);
      if (selected.has(name)) {
        const label = `${basename}:${name}`;
        const prefix = `const __dragPerfStop = globalThis.__DRAG_PERF_PROBE?.begin?.(${JSON.stringify(label)}); try {`;
        const suffix = `} finally { __dragPerfStop?.(); }`;
        if (ts.isBlock(node.body)) {
          edits.push({at:node.body.getStart(tree) + 1, text:prefix});
          edits.push({at:node.body.end - 1, text:suffix});
        } else {
          edits.push({at:node.body.getStart(tree), text:`{ ${prefix} return (`});
          edits.push({at:node.body.end, text:`); ${suffix} }`});
        }
        functions.push(label);
        annotate(node, name);
      }
      sampleBoundary(node);
    }
    ts.forEachChild(node, visit);
  };
  visit(tree);
  edits.sort((left, right) => right.at - left.at);
  let instrumented = source;
  for (const edit of edits) instrumented = instrumented.slice(0, edit.at) + edit.text + instrumented.slice(edit.at);
  return { source:instrumented, functions, sampleHooks };
}

// Also usable as a webpack pre-loader; JSX compilation remains with the
// repository's existing test loader, preserving the same React build mode.
module.exports = function performanceLoader(source) {
  return instrumentDragPerformance(source, this.resourcePath).source;
};
module.exports.instrumentDragPerformance = instrumentDragPerformance;
module.exports.TARGETS = TARGETS;
