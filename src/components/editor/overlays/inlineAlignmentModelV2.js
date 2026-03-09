import { roundInlineMetric } from "@/components/editor/overlays/inlineGeometry";

export const INLINE_ALIGNMENT_MODEL_V2_VERSION = "phase-atomic-v2";
export const INLINE_TRACE_RING_MAX = 600;
const LARGE_STABLE_OFFSET_POLICY_VERSION = "domCss-large-stable-cap-v9";
const FONT_NUDGE_OVERRIDE_MAX_ABS_PX = 40;

function resolveFontSpecificStableCapPx(fontFamily) {
  const normalized = String(fontFamily || "").toLowerCase();
  if (normalized.includes("great vibes")) {
    return 0.8;
  }
  return null;
}

function shouldUseFontSpecificZeroDrift(fontFamily) {
  const normalized = String(fontFamily || "").toLowerCase();
  return normalized.includes("great vibes");
}

function normalizeFontFamilyForNudge(fontFamily) {
  const raw = String(fontFamily || "");
  const first = raw.split(",")[0] || raw;
  return first.replace(/["']/g, "").trim().toLowerCase();
}

function sanitizeFontFamilyKey(normalizedFamily) {
  return String(normalizedFamily || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function resolveDefaultFontNudgeConfig(normalizedFamily) {
  if (normalizedFamily.includes("great vibes")) {
    return {
      valuePx: -2.8,
      mode: "absolute",
    };
  }
  if (normalizedFamily.includes("arial")) {
    return {
      valuePx: -0.2,
      mode: "additive",
    };
  }
  return null;
}

function readWindowFontNudgeOverride(normalizedFamily) {
  if (typeof window === "undefined" || !normalizedFamily) {
    return {
      valuePx: null,
      source: null,
      mode: null,
    };
  }

  const byFamily = window.__INLINE_FONT_NUDGE_PX_BY_FAMILY;
  if (byFamily && typeof byFamily === "object") {
    const exactRaw = byFamily[normalizedFamily];
    const exactNum = Number(exactRaw);
    if (Number.isFinite(exactNum)) {
      return {
        valuePx: exactNum,
        source: `window.__INLINE_FONT_NUDGE_PX_BY_FAMILY[\"${normalizedFamily}\"]`,
        mode: "additive",
      };
    }
    const matchedEntry = Object.entries(byFamily).find(([key]) => (
      String(key || "").trim().toLowerCase() === normalizedFamily
    ));
    if (matchedEntry) {
      const [, matchedRaw] = matchedEntry;
      const matchedNum = Number(matchedRaw);
      if (Number.isFinite(matchedNum)) {
        return {
          valuePx: matchedNum,
          source: `window.__INLINE_FONT_NUDGE_PX_BY_FAMILY[\"${normalizedFamily}\"]`,
          mode: "additive",
        };
      }
    }
  }

  if (normalizedFamily.includes("great vibes")) {
    const raw = window.__INLINE_GREAT_VIBES_NUDGE_PX;
    const num = Number(raw);
    if (Number.isFinite(num)) {
      return {
        valuePx: num,
        source: "window.__INLINE_GREAT_VIBES_NUDGE_PX",
        mode: "absolute",
      };
    }
  }
  if (normalizedFamily.includes("arial")) {
    const raw = window.__INLINE_ARIAL_NUDGE_PX;
    const num = Number(raw);
    if (Number.isFinite(num)) {
      return {
        valuePx: num,
        source: "window.__INLINE_ARIAL_NUDGE_PX",
        mode: "additive",
      };
    }
  }
  if (normalizedFamily === "sans-serif") {
    const sansRaw = window.__INLINE_SANS_SERIF_NUDGE_PX;
    const sansNum = Number(sansRaw);
    if (Number.isFinite(sansNum)) {
      return {
        valuePx: sansNum,
        source: "window.__INLINE_SANS_SERIF_NUDGE_PX",
        mode: "additive",
      };
    }
    const arialAliasRaw = window.__INLINE_ARIAL_NUDGE_PX;
    const arialAliasNum = Number(arialAliasRaw);
    if (Number.isFinite(arialAliasNum)) {
      return {
        valuePx: arialAliasNum,
        source: "window.__INLINE_ARIAL_NUDGE_PX(alias:sans-serif)",
        mode: "additive",
      };
    }
  }

  const dynamicKey = `__INLINE_${sanitizeFontFamilyKey(normalizedFamily)}_NUDGE_PX`;
  const dynamicRaw = window[dynamicKey];
  const dynamicNum = Number(dynamicRaw);
  if (Number.isFinite(dynamicNum)) {
    return {
      valuePx: dynamicNum,
      source: `window.${dynamicKey}`,
      mode: "additive",
    };
  }

  return {
    valuePx: null,
    source: null,
    mode: null,
  };
}

function resolveFontSpecificPerceptualNudge(fontFamily) {
  const normalizedFamily = normalizeFontFamilyForNudge(fontFamily);
  const defaultConfig = resolveDefaultFontNudgeConfig(normalizedFamily);
  const override = readWindowFontNudgeOverride(normalizedFamily);
  const overrideValuePx = toFiniteNumber(override?.valuePx, null);

  if (Number.isFinite(overrideValuePx)) {
    const clamped = Math.max(
      -FONT_NUDGE_OVERRIDE_MAX_ABS_PX,
      Math.min(FONT_NUDGE_OVERRIDE_MAX_ABS_PX, overrideValuePx)
    );
    return {
      valuePx: clamped,
      source: override.source || "window-unknown",
      mode: override.mode || defaultConfig?.mode || "additive",
    };
  }

  if (defaultConfig) {
    return {
      valuePx: defaultConfig.valuePx,
      source: "default",
      mode: defaultConfig.mode,
    };
  }

  return {
    valuePx: null,
    source: null,
    mode: null,
  };
}

function toFiniteNumber(value, fallback = null) {
  if (value === null || typeof value === "undefined" || value === "") {
    return fallback;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function resolvePixelSnap(rawOffset) {
  const base = toFiniteNumber(rawOffset, 0);
  if (typeof window === "undefined") {
    return {
      snappedOffset: base,
      pixelSnapStep: 1,
      pixelSnapUsed: false,
    };
  }
  const dpr = toFiniteNumber(window.devicePixelRatio, 1) || 1;
  const pixelSnapStep = dpr > 0 ? 1 / dpr : 1;
  if (!Number.isFinite(pixelSnapStep) || pixelSnapStep <= 0 || pixelSnapStep > 0.5) {
    return {
      snappedOffset: base,
      pixelSnapStep: roundInlineMetric(pixelSnapStep),
      pixelSnapUsed: false,
    };
  }
  return {
    snappedOffset: Math.round(base / pixelSnapStep) * pixelSnapStep,
    pixelSnapStep: roundInlineMetric(pixelSnapStep),
    pixelSnapUsed: true,
  };
}

function resolveDpr(inputDpr) {
  const candidate = toFiniteNumber(inputDpr);
  if (Number.isFinite(candidate) && candidate > 0) return candidate;
  if (typeof window !== "undefined") {
    const dpr = toFiniteNumber(window.devicePixelRatio, 1);
    if (Number.isFinite(dpr) && dpr > 0) return dpr;
  }
  return 1;
}

function buildLiveSampleStats(samples = []) {
  const normalized = Array.isArray(samples)
    ? samples.map((value) => toFiniteNumber(value)).filter((value) => Number.isFinite(value))
    : [];
  const count = normalized.length;
  const last = count > 0 ? normalized[count - 1] : null;
  const previous = count > 1 ? normalized[count - 2] : null;
  const delta = Number.isFinite(last) && Number.isFinite(previous)
    ? Math.abs(last - previous)
    : null;
  return {
    count,
    last,
    previous,
    delta,
  };
}

function computeSnapshotRevision(previousSnapshot, source, modelOffsetPx) {
  const previousRevision = Number(previousSnapshot?.revision);
  const previousSource = String(previousSnapshot?.source || "");
  const previousOffset = toFiniteNumber(previousSnapshot?.modelOffsetPx);
  const nextSource = String(source || "");
  const nextOffset = toFiniteNumber(modelOffsetPx);
  if (
    Number.isFinite(previousRevision) &&
    previousRevision > 0 &&
    previousSource === nextSource &&
    Number.isFinite(previousOffset) &&
    Number.isFinite(nextOffset) &&
    Math.abs(previousOffset - nextOffset) <= 0.0001
  ) {
    return previousRevision;
  }
  if (Number.isFinite(previousRevision) && previousRevision > 0) {
    return previousRevision + 1;
  }
  return 1;
}

export function resolveVerticalAuthoritySnapshot({
  domCssInkProbe,
  domInkProbe,
  domLiveFirstGlyphTopInsetPx,
  domLiveFirstGlyphSamples = [],
  domLiveGeometryUsable = false,
  konvaInkProbe,
  editableLineHeightPx,
  fontFamily = "",
  fontLoadAvailable = null,
  fallbackOffset = 0,
  previousSnapshot = null,
  dpr = null,
}) {
  const domTopInset = toFiniteNumber(domCssInkProbe?.glyphTopInsetPx);
  const domProbeTopInset = toFiniteNumber(domInkProbe?.glyphTopInsetPx);
  const domLiveTopInset = toFiniteNumber(domLiveFirstGlyphTopInsetPx);
  const konvaTopInset = toFiniteNumber(konvaInkProbe?.glyphTopInsetPx);
  const resolvedDpr = resolveDpr(dpr);
  const safeLineHeight = Math.max(0, toFiniteNumber(editableLineHeightPx, 0));
  const saneLimit = Math.min(Math.max(safeLineHeight * 0.28, 8), 96);
  const halfLineHeight = safeLineHeight * 0.5;
  const domSourceDivergenceLimitPx = Math.min(Math.max(safeLineHeight * 0.1, 1.5), 4);
  const liveSourceDivergenceLimitPx = Math.max(0.35, 0.5 / resolvedDpr);
  const liveStabilityEpsilonPx = Math.max(0.25, 0.5 / resolvedDpr);
  const domSourceDeltaPx =
    Number.isFinite(domTopInset) && Number.isFinite(domProbeTopInset)
      ? Math.abs(domTopInset - domProbeTopInset)
      : null;
  const liveSourceDeltaPx =
    Number.isFinite(domLiveTopInset) && Number.isFinite(domProbeTopInset)
      ? Math.abs(domLiveTopInset - domProbeTopInset)
      : null;
  const domCssReliable =
    Number.isFinite(domTopInset) && (
      !Number.isFinite(domSourceDeltaPx) ||
      domSourceDeltaPx <= domSourceDivergenceLimitPx
    );
  const severeDomSourceDisagreement =
    Number.isFinite(domSourceDeltaPx) &&
    domSourceDeltaPx > Math.max(domSourceDivergenceLimitPx, 3.5);

  const liveSampleStats = buildLiveSampleStats(domLiveFirstGlyphSamples);
  const liveSampleStable =
    Number.isFinite(liveSampleStats.delta) &&
    liveSampleStats.count >= 2 &&
    liveSampleStats.delta <= liveStabilityEpsilonPx;
  const liveProbeConsistent =
    !Number.isFinite(domProbeTopInset) || (
      Number.isFinite(domLiveTopInset) &&
      Number.isFinite(liveSourceDeltaPx) &&
      liveSourceDeltaPx <= liveSourceDivergenceLimitPx
    );
  const liveGeometryReady = Boolean(domLiveGeometryUsable);
  const liveFallbackReliable =
    Number.isFinite(domLiveTopInset) &&
    liveGeometryReady &&
    liveSampleStable &&
    liveProbeConsistent;
  const preferDomCssOnDisagreement =
    Number.isFinite(domTopInset) &&
    Number.isFinite(konvaTopInset) &&
    severeDomSourceDisagreement &&
    !liveFallbackReliable;
  const domCssRawOffsetPx =
    Number.isFinite(konvaTopInset) && Number.isFinite(domTopInset)
      ? (konvaTopInset - domTopInset)
      : null;
  const domCssInConflict =
    !domCssReliable ||
    (
      Number.isFinite(domSourceDeltaPx) &&
      Number.isFinite(domSourceDivergenceLimitPx) &&
      domSourceDeltaPx > domSourceDivergenceLimitPx
    );
  const preferLiveForLargeCssOffset =
    Number.isFinite(domCssRawOffsetPx) &&
    Math.abs(domCssRawOffsetPx) >= 4.5 &&
    domCssInConflict &&
    Number.isFinite(domLiveTopInset) &&
    liveGeometryReady &&
    liveSampleStats.count >= 1;

  const evaluateCandidate = (source, activeDomTopInset) => {
    if (!Number.isFinite(konvaTopInset) || !Number.isFinite(activeDomTopInset)) {
      return {
        source,
        activeDomTopInset,
        rawOffset: null,
        snappedOffset: toFiniteNumber(fallbackOffset, 0),
        pixelSnapStep: null,
        pixelSnapUsed: false,
        appliedOffset: toFiniteNumber(fallbackOffset, 0),
        blockedReason: "missing-metrics",
      };
    }
    const rawOffset = konvaTopInset - activeDomTopInset;
    if (!Number.isFinite(rawOffset)) {
      return {
        source,
        activeDomTopInset,
        rawOffset: null,
        snappedOffset: toFiniteNumber(fallbackOffset, 0),
        pixelSnapStep: null,
        pixelSnapUsed: false,
        appliedOffset: toFiniteNumber(fallbackOffset, 0),
        blockedReason: "invalid-raw-offset",
      };
    }
    if (
      (Number.isFinite(halfLineHeight) && Math.abs(rawOffset) > halfLineHeight) ||
      Math.abs(rawOffset) > saneLimit
    ) {
      return {
        source,
        activeDomTopInset,
        rawOffset,
        snappedOffset: toFiniteNumber(fallbackOffset, 0),
        pixelSnapStep: null,
        pixelSnapUsed: false,
        appliedOffset: toFiniteNumber(fallbackOffset, 0),
        blockedReason: "out-of-range",
      };
    }

    const snap = resolvePixelSnap(rawOffset);
    return {
      source,
      activeDomTopInset,
      rawOffset,
      snappedOffset: snap.snappedOffset,
      pixelSnapStep: snap.pixelSnapStep,
      pixelSnapUsed: snap.pixelSnapUsed,
      appliedOffset: snap.snappedOffset,
      blockedReason: null,
    };
  };

  const candidateOrder = (() => {
    if (preferDomCssOnDisagreement) return ["domCss", "domProbe", "domLiveFirstGlyph"];
    if (preferLiveForLargeCssOffset) return ["domLiveFirstGlyph", "domCss", "domProbe"];
    if (domCssReliable) return ["domCss", "domProbe", "domLiveFirstGlyph"];
    if (liveFallbackReliable) return ["domLiveFirstGlyph", "domProbe", "domCss"];
    return ["domProbe", "domCss", "domLiveFirstGlyph"];
  })();

  const resolveCandidateInset = (source) => {
    if (source === "domCss") return domTopInset;
    if (source === "domProbe") return domProbeTopInset;
    if (source === "domLiveFirstGlyph") return domLiveTopInset;
    return null;
  };

  let selected = null;
  const rejected = [];
  for (const source of candidateOrder) {
    const candidate = evaluateCandidate(source, resolveCandidateInset(source));
    if (!candidate.blockedReason) {
      selected = candidate;
      break;
    }
    rejected.push(candidate);
  }
  if (!selected) {
    const fallbackCandidate = rejected[0] || evaluateCandidate("domProbe", domProbeTopInset);
    selected = {
      ...fallbackCandidate,
      source: fallbackCandidate.source || "domProbe",
      appliedOffset: toFiniteNumber(fallbackOffset, 0),
      snappedOffset: toFiniteNumber(fallbackOffset, 0),
      pixelSnapStep: null,
      pixelSnapUsed: false,
      blockedReason: fallbackCandidate.blockedReason || "missing-metrics",
    };
  }

  const conservativeLargeOffsetLimitPx = Math.min(2.2, Math.max(1.6, safeLineHeight * 0.04));
  const fontUnavailableCapPx = 1.2;
  const strictLargeStableCapPx = 1.2;
  const fontSpecificLargeStableCapPx = resolveFontSpecificStableCapPx(fontFamily);
  const shouldApplyStrictLargeStableCap =
    selected.source === "domCss" &&
    domCssReliable &&
    !domCssInConflict &&
    Number.isFinite(domCssRawOffsetPx) &&
    Math.abs(domCssRawOffsetPx) >= 4.5 &&
    Number.isFinite(domSourceDeltaPx) &&
    domSourceDeltaPx >= 2;
  const shouldApplyFontSpecificCap =
    Number.isFinite(fontSpecificLargeStableCapPx) &&
    selected.source === "domCss" &&
    domCssReliable &&
    !domCssInConflict &&
    Number.isFinite(domCssRawOffsetPx) &&
    Math.abs(domCssRawOffsetPx) >= 3.5;
  const shouldApplyFontSpecificZeroDrift =
    shouldUseFontSpecificZeroDrift(fontFamily) &&
    shouldApplyFontSpecificCap &&
    Number.isFinite(domCssRawOffsetPx) &&
    Math.abs(domCssRawOffsetPx) >= 3.5;
  const effectiveLargeOffsetLimitPx =
    fontLoadAvailable === false
      ? Math.min(conservativeLargeOffsetLimitPx, fontUnavailableCapPx)
      : (
        shouldApplyStrictLargeStableCap
          ? Math.min(conservativeLargeOffsetLimitPx, strictLargeStableCapPx)
          : conservativeLargeOffsetLimitPx
      );
  const effectiveLargeOffsetLimitWithFontCapPx =
    shouldApplyFontSpecificCap
      ? Math.min(effectiveLargeOffsetLimitPx, Number(fontSpecificLargeStableCapPx))
      : effectiveLargeOffsetLimitPx;
  const selectedAppliedOffset = toFiniteNumber(selected.appliedOffset, fallbackOffset);
  const shouldDampenLargeStableOffset =
    selected.source === "domCss" &&
    domCssReliable &&
    liveFallbackReliable &&
    !domCssInConflict &&
    Number.isFinite(selectedAppliedOffset) &&
    Math.abs(selectedAppliedOffset) > effectiveLargeOffsetLimitWithFontCapPx;
  const dampenedAppliedOffset = shouldDampenLargeStableOffset
    ? Math.sign(selectedAppliedOffset) * effectiveLargeOffsetLimitWithFontCapPx
    : selectedAppliedOffset;
  const finalAppliedOffset = shouldApplyFontSpecificZeroDrift ? 0 : dampenedAppliedOffset;
  const isGreatVibesFont = String(fontFamily || "").toLowerCase().includes("great vibes");
  const shouldNeutralizeSevereLiveDisagreement =
    severeDomSourceDisagreement &&
    selected.source === "domLiveFirstGlyph" &&
    !isGreatVibesFont;
  const finalAppliedOffsetAfterSevereLiveGuard = shouldNeutralizeSevereLiveDisagreement
    ? 0
    : finalAppliedOffset;
  const normalizedFontFamilyForNudge = normalizeFontFamilyForNudge(fontFamily);
  const fontSpecificPerceptualNudge = resolveFontSpecificPerceptualNudge(fontFamily);
  const fontSpecificPerceptualNudgePx = toFiniteNumber(fontSpecificPerceptualNudge?.valuePx);
  const fontSpecificPerceptualNudgeSource = fontSpecificPerceptualNudge?.source || null;
  const fontSpecificPerceptualNudgeModeRaw = fontSpecificPerceptualNudge?.mode || null;
  const fontSpecificPerceptualNudgeMode =
    Number.isFinite(fontSpecificPerceptualNudgePx) &&
    (fontSpecificPerceptualNudgeModeRaw !== "absolute" && fontSpecificPerceptualNudgeModeRaw !== "additive")
      ? "additive"
      : fontSpecificPerceptualNudgeModeRaw;
  const shouldApplyAbsolutePerceptualNudge =
    Number.isFinite(fontSpecificPerceptualNudgePx) &&
    fontSpecificPerceptualNudgeMode === "absolute" &&
    shouldApplyFontSpecificZeroDrift;
  const shouldApplyAdditivePerceptualNudge =
    Number.isFinite(fontSpecificPerceptualNudgePx) &&
    fontSpecificPerceptualNudgeMode === "additive";
  const finalAppliedOffsetWithPerceptualNudge = shouldApplyAbsolutePerceptualNudge
    ? Number(fontSpecificPerceptualNudgePx)
    : (
      shouldApplyAdditivePerceptualNudge
        ? finalAppliedOffsetAfterSevereLiveGuard + Number(fontSpecificPerceptualNudgePx)
        : finalAppliedOffsetAfterSevereLiveGuard
    );

  const modelOffsetPx = roundInlineMetric(
    toFiniteNumber(finalAppliedOffsetWithPerceptualNudge, fallbackOffset)
  );
  const revision = computeSnapshotRevision(previousSnapshot, selected.source, modelOffsetPx);

  return {
    status: "resolved",
    source: selected.source,
    modelOffsetPx,
    visualOffsetPx: modelOffsetPx,
    revision,
    coordinateSpace: "content-ink",
    frozen: false,
    blockedReason: selected.blockedReason || null,
    diagnostics: {
      domTopInset: roundInlineMetric(domTopInset),
      domProbeTopInset: roundInlineMetric(domProbeTopInset),
      domLiveTopInset: roundInlineMetric(domLiveTopInset),
      activeDomTopInset: roundInlineMetric(selected.activeDomTopInset),
      konvaTopInset: roundInlineMetric(konvaTopInset),
      rawOffset: roundInlineMetric(selected.rawOffset),
      saneLimit: roundInlineMetric(saneLimit),
      snappedOffset: roundInlineMetric(selected.snappedOffset),
      pixelSnapStep: selected.pixelSnapStep,
      pixelSnapUsed: Boolean(selected.pixelSnapUsed),
      domSourceDeltaPx: roundInlineMetric(domSourceDeltaPx),
      domSourceDivergenceLimitPx: roundInlineMetric(domSourceDivergenceLimitPx),
      liveSourceDeltaPx: roundInlineMetric(liveSourceDeltaPx),
      liveSourceDivergenceLimitPx: roundInlineMetric(liveSourceDivergenceLimitPx),
      liveStabilityEpsilonPx: roundInlineMetric(liveStabilityEpsilonPx),
      liveSampleCount: Number(liveSampleStats.count || 0),
      liveSampleDeltaPx: roundInlineMetric(liveSampleStats.delta),
      liveSampleStable,
      liveGeometryReady,
      fontFamilyRaw: String(fontFamily || "") || null,
      fontFamilyNormalizedForNudge: normalizedFontFamilyForNudge || null,
      domCssReliable,
      severeDomSourceDisagreement,
      liveFallbackReliable,
      preferDomCssOnDisagreement,
      domCssRawOffsetPx: roundInlineMetric(domCssRawOffsetPx),
      domCssInConflict,
      preferLiveForLargeCssOffset,
      largeStableOffsetLimitPx: roundInlineMetric(effectiveLargeOffsetLimitWithFontCapPx),
      largeStableOffsetBaseLimitPx: roundInlineMetric(conservativeLargeOffsetLimitPx),
      largeStableOffsetFontUnavailableCapPx: roundInlineMetric(fontUnavailableCapPx),
      largeStableOffsetStrictCapPx: roundInlineMetric(strictLargeStableCapPx),
      largeStableOffsetStrictCapApplied: shouldApplyStrictLargeStableCap,
      largeStableOffsetFontSpecificCapPx: roundInlineMetric(fontSpecificLargeStableCapPx),
      largeStableOffsetFontSpecificCapApplied: shouldApplyFontSpecificCap,
      largeStableOffsetFontSpecificZeroDriftApplied: shouldApplyFontSpecificZeroDrift,
      largeStableOffsetFontSpecificPerceptualNudgePx: roundInlineMetric(
        fontSpecificPerceptualNudgePx
      ),
      largeStableOffsetFontSpecificPerceptualNudgeSource: fontSpecificPerceptualNudgeSource,
      largeStableOffsetFontSpecificPerceptualNudgeMode: fontSpecificPerceptualNudgeMode,
      largeStableOffsetFontSpecificPerceptualNudgeApplied:
        shouldApplyAbsolutePerceptualNudge || shouldApplyAdditivePerceptualNudge,
      largeStableOffsetFontSpecificPerceptualNudgeAppliedAs:
        shouldApplyAbsolutePerceptualNudge
          ? "absolute"
          : (shouldApplyAdditivePerceptualNudge ? "additive" : null),
      fontLoadAvailable:
        typeof fontLoadAvailable === "boolean" ? fontLoadAvailable : null,
      largeStableOffsetDampened: shouldDampenLargeStableOffset,
      largeStableOffsetDampenedFromPx: roundInlineMetric(selectedAppliedOffset),
      largeStableOffsetDampenedToPx: roundInlineMetric(dampenedAppliedOffset),
      largeStableOffsetFinalAppliedPx: roundInlineMetric(finalAppliedOffset),
      severeLiveDisagreementGuardApplied: shouldNeutralizeSevereLiveDisagreement,
      severeLiveDisagreementGuardFromPx: roundInlineMetric(finalAppliedOffset),
      severeLiveDisagreementGuardToPx: roundInlineMetric(
        finalAppliedOffsetAfterSevereLiveGuard
      ),
      largeStableOffsetFinalAppliedWithPerceptualNudgePx: roundInlineMetric(
        finalAppliedOffsetWithPerceptualNudge
      ),
      largeStableOffsetPolicyVersion: LARGE_STABLE_OFFSET_POLICY_VERSION,
      dpr: roundInlineMetric(resolvedDpr),
      rejectedCandidates: rejected.map((candidate) => ({
        source: candidate.source,
        blockedReason: candidate.blockedReason,
        rawOffset: roundInlineMetric(candidate.rawOffset),
      })),
    },
  };
}

export function normalizeInlineOverlayEngine(engine) {
  return "phase_atomic_v2";
}

export function computeInlineAlignmentOffsetV2({
  domCssInkProbe,
  domInkProbe,
  domLiveFirstGlyphTopInsetPx,
  domLiveFirstGlyphSamples = [],
  domLiveGeometryUsable = false,
  konvaInkProbe,
  editableLineHeightPx,
  fontFamily = "",
  fontLoadAvailable = null,
  fallbackOffset = 0,
  previousSnapshot = null,
  dpr = null,
}) {
  const snapshot = resolveVerticalAuthoritySnapshot({
    domCssInkProbe,
    domInkProbe,
    domLiveFirstGlyphTopInsetPx,
    domLiveFirstGlyphSamples,
    domLiveGeometryUsable,
    konvaInkProbe,
    editableLineHeightPx,
    fontFamily,
    fontLoadAvailable,
    fallbackOffset,
    previousSnapshot,
    dpr,
  });
  const diagnostics = snapshot?.diagnostics || {};
  return {
    source: snapshot?.source || "domProbe",
    domTopInset: diagnostics.domTopInset ?? null,
    domProbeTopInset: diagnostics.domProbeTopInset ?? null,
    domLiveTopInset: diagnostics.domLiveTopInset ?? null,
    activeDomTopInset: diagnostics.activeDomTopInset ?? null,
    konvaTopInset: diagnostics.konvaTopInset ?? null,
    rawOffset: diagnostics.rawOffset ?? null,
    saneLimit: diagnostics.saneLimit ?? null,
    snappedOffset: diagnostics.snappedOffset ?? null,
    pixelSnapStep: diagnostics.pixelSnapStep ?? null,
    pixelSnapUsed: Boolean(diagnostics.pixelSnapUsed),
    appliedOffset: snapshot?.visualOffsetPx ?? 0,
    blockedReason: snapshot?.blockedReason || null,
    domSourceDeltaPx: diagnostics.domSourceDeltaPx ?? null,
    domSourceDivergenceLimitPx: diagnostics.domSourceDivergenceLimitPx ?? null,
    liveSourceDeltaPx: diagnostics.liveSourceDeltaPx ?? null,
    liveSourceDivergenceLimitPx: diagnostics.liveSourceDivergenceLimitPx ?? null,
    liveStabilityEpsilonPx: diagnostics.liveStabilityEpsilonPx ?? null,
    liveSampleCount: diagnostics.liveSampleCount ?? 0,
    liveSampleDeltaPx: diagnostics.liveSampleDeltaPx ?? null,
    liveSampleStable: Boolean(diagnostics.liveSampleStable),
    liveGeometryReady: Boolean(diagnostics.liveGeometryReady),
    fontFamilyRaw: diagnostics.fontFamilyRaw ?? null,
    fontFamilyNormalizedForNudge: diagnostics.fontFamilyNormalizedForNudge ?? null,
    domCssReliable: Boolean(diagnostics.domCssReliable),
    severeDomSourceDisagreement: Boolean(diagnostics.severeDomSourceDisagreement),
    preferDomCssOnDisagreement: Boolean(diagnostics.preferDomCssOnDisagreement),
    domCssRawOffsetPx: diagnostics.domCssRawOffsetPx ?? null,
    domCssInConflict: Boolean(diagnostics.domCssInConflict),
    preferLiveForLargeCssOffset: Boolean(diagnostics.preferLiveForLargeCssOffset),
    largeStableOffsetLimitPx: diagnostics.largeStableOffsetLimitPx ?? null,
    largeStableOffsetBaseLimitPx: diagnostics.largeStableOffsetBaseLimitPx ?? null,
    largeStableOffsetFontUnavailableCapPx:
      diagnostics.largeStableOffsetFontUnavailableCapPx ?? null,
    largeStableOffsetStrictCapPx: diagnostics.largeStableOffsetStrictCapPx ?? null,
    largeStableOffsetStrictCapApplied: Boolean(
      diagnostics.largeStableOffsetStrictCapApplied
    ),
    largeStableOffsetFontSpecificCapPx:
      diagnostics.largeStableOffsetFontSpecificCapPx ?? null,
    largeStableOffsetFontSpecificCapApplied: Boolean(
      diagnostics.largeStableOffsetFontSpecificCapApplied
    ),
    largeStableOffsetFontSpecificZeroDriftApplied: Boolean(
      diagnostics.largeStableOffsetFontSpecificZeroDriftApplied
    ),
    largeStableOffsetFontSpecificPerceptualNudgePx:
      diagnostics.largeStableOffsetFontSpecificPerceptualNudgePx ?? null,
    largeStableOffsetFontSpecificPerceptualNudgeSource:
      diagnostics.largeStableOffsetFontSpecificPerceptualNudgeSource ?? null,
    largeStableOffsetFontSpecificPerceptualNudgeMode:
      diagnostics.largeStableOffsetFontSpecificPerceptualNudgeMode ?? null,
    largeStableOffsetFontSpecificPerceptualNudgeApplied: Boolean(
      diagnostics.largeStableOffsetFontSpecificPerceptualNudgeApplied
    ),
    largeStableOffsetFontSpecificPerceptualNudgeAppliedAs:
      diagnostics.largeStableOffsetFontSpecificPerceptualNudgeAppliedAs ?? null,
    fontLoadAvailable:
      typeof diagnostics.fontLoadAvailable === "boolean"
        ? diagnostics.fontLoadAvailable
        : null,
    largeStableOffsetDampened: Boolean(diagnostics.largeStableOffsetDampened),
    largeStableOffsetDampenedFromPx: diagnostics.largeStableOffsetDampenedFromPx ?? null,
    largeStableOffsetDampenedToPx: diagnostics.largeStableOffsetDampenedToPx ?? null,
    largeStableOffsetFinalAppliedPx: diagnostics.largeStableOffsetFinalAppliedPx ?? null,
    severeLiveDisagreementGuardApplied: Boolean(
      diagnostics.severeLiveDisagreementGuardApplied
    ),
    severeLiveDisagreementGuardFromPx:
      diagnostics.severeLiveDisagreementGuardFromPx ?? null,
    severeLiveDisagreementGuardToPx:
      diagnostics.severeLiveDisagreementGuardToPx ?? null,
    largeStableOffsetFinalAppliedWithPerceptualNudgePx:
      diagnostics.largeStableOffsetFinalAppliedWithPerceptualNudgePx ?? null,
    largeStableOffsetPolicyVersion: diagnostics.largeStableOffsetPolicyVersion ?? null,
    liveFallbackReliable: Boolean(diagnostics.liveFallbackReliable),
    status: snapshot?.status || "resolved",
    revision: Number(snapshot?.revision || 1),
    coordinateSpace: snapshot?.coordinateSpace || "content-ink",
    modelOffsetPx: snapshot?.modelOffsetPx ?? 0,
    visualOffsetPx: snapshot?.visualOffsetPx ?? 0,
    frozen: Boolean(snapshot?.frozen),
    diagnostics,
  };
}

export function pushInlineTraceEvent(eventName, payload = {}) {
  if (typeof window === "undefined") return;
  const list = Array.isArray(window.__INLINE_TRACE) ? window.__INLINE_TRACE : [];
  const nowIso = new Date().toISOString();
  const perfMs =
    typeof window.performance?.now === "function"
      ? roundInlineMetric(Number(window.performance.now()), 3)
      : null;
  list.push({
    ts: nowIso,
    perfMs,
    eventName,
    ...payload,
  });
  if (list.length > INLINE_TRACE_RING_MAX) {
    list.splice(0, list.length - INLINE_TRACE_RING_MAX);
  }
  window.__INLINE_TRACE = list;
}

export function summarizeInlineTrace({
  trace = [],
  maxErrorPx = 0.5,
  maxVisualDriftPx = maxErrorPx,
  phases = ["after-first-paint", "post-layout"],
} = {}) {
  const filtered = trace.filter((entry) => phases.includes(entry?.phase || entry?.eventName));
  const failures = filtered.filter((entry) => {
    const dx = Math.abs(Number(entry?.dx || 0));
    const dy = Math.abs(Number(entry?.dy || 0));
    return dx > maxErrorPx || dy > maxErrorPx;
  });
  const visualDriftFailures = filtered.filter((entry) => {
    const visualDy = Number(entry?.domVisualDy);
    if (!Number.isFinite(visualDy)) return false;
    return Math.abs(visualDy) > maxVisualDriftPx;
  });
  const resolvedOffsets = filtered
    .map((entry) => Number(entry?.offsetYResolved))
    .filter((value) => Number.isFinite(value));
  const maxResolvedOffsetAbsPx = resolvedOffsets.length
    ? Math.max(...resolvedOffsets.map((value) => Math.abs(value)))
    : null;
  const resolvedOffsetSpreadPx = resolvedOffsets.length > 1
    ? Math.max(...resolvedOffsets) - Math.min(...resolvedOffsets)
    : 0;
  return {
    sampleCount: filtered.length,
    maxErrorPx,
    maxVisualDriftPx,
    failures: failures.length,
    visualDriftFailures: visualDriftFailures.length,
    maxResolvedOffsetAbsPx: roundInlineMetric(maxResolvedOffsetAbsPx),
    resolvedOffsetSpreadPx: roundInlineMetric(resolvedOffsetSpreadPx),
    passRate:
      filtered.length > 0
        ? roundInlineMetric(((filtered.length - failures.length) / filtered.length) * 100, 2)
        : null,
  };
}
