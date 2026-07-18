import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import {
  ASSISTANT_GUIDED_TOUR_CONTROLS_ATTR,
  ASSISTANT_GUIDED_TOUR_HYDRATION_ATTR,
  ASSISTANT_GUIDED_TOUR_PHASES,
  ASSISTANT_GUIDED_TOUR_TARGET_ATTR,
  ASSISTANT_GUIDED_TOUR_TARGETS,
  ASSISTANT_GUIDED_TOUR_TOOLTIP_PLACEMENTS,
  areAssistantGuidedTourInitialFieldsHydrated,
  closeAssistantGuidedTourSession,
  createAssistantGuidedTourPreferencePatch,
  createAssistantGuidedTourSessionKey,
  isAssistantGuidedTourFirstNamesSubstep,
  getAssistantGuidedTourMessage,
  getAssistantGuidedTourPositionKey,
  reconcileAssistantGuidedTourPosition,
  resolveAssistantGuidedTourOverlayRect,
  resolveAssistantGuidedTourTargetId,
  resolveAssistantGuidedTourTooltipPosition,
  resolveInitialAssistantGuidedTourPhase,
  resolveNextAssistantGuidedTourFieldPhase,
  shouldAdvanceAssistantGuidedTourFieldEditSignal,
  shouldAutoStartAssistantGuidedTour,
} from "@/domain/editor/assistantGuidedTour";
import {
  logAssistantTourDebug,
  shouldDebugAssistantTour,
} from "./assistantTourDebug";
import styles from "./AssistantGuidedTour.module.css";

const VIEWPORT_MARGIN_PX = 12;
const TARGET_PADDING_PX = 6;
const TOOLTIP_GAP_PX = 14;
const FALLBACK_TOOLTIP_WIDTH_PX = 320;
const FALLBACK_TOOLTIP_HEIGHT_PX = 154;
const MOBILE_TOUR_BREAKPOINT_PX = 768;
const MOBILE_VIEWPORT_MARGIN_PX = 8;
const MOBILE_TARGET_PADDING_PX = 4;
const MOBILE_TOOLTIP_GAP_PX = 8;
const MOBILE_BOTTOM_CONTROLS_GAP_PX = 12;
const MOBILE_FIELD_TOOLTIP_WIDTH_PX = 204;
const MOBILE_ACTION_TOOLTIP_WIDTH_PX = 164;
const MOBILE_TOOLTIP_MIN_WIDTH_PX = 144;
const MOBILE_TOOLTIP_MIN_HEIGHT_PX = 58;
const TOUR_MEASUREMENT_TOLERANCE_PX = 1;
const MOBILE_FIELD_PLACEMENT_PRIORITY = Object.freeze([
  ASSISTANT_GUIDED_TOUR_TOOLTIP_PLACEMENTS.TOP,
  ASSISTANT_GUIDED_TOUR_TOOLTIP_PLACEMENTS.BOTTOM,
  ASSISTANT_GUIDED_TOUR_TOOLTIP_PLACEMENTS.RIGHT,
  ASSISTANT_GUIDED_TOUR_TOOLTIP_PLACEMENTS.LEFT,
]);
const MOBILE_ACTION_PLACEMENT_PRIORITY = Object.freeze([
  ASSISTANT_GUIDED_TOUR_TOOLTIP_PLACEMENTS.LEFT,
  ASSISTANT_GUIDED_TOUR_TOOLTIP_PLACEMENTS.RIGHT,
  ASSISTANT_GUIDED_TOUR_TOOLTIP_PLACEMENTS.BOTTOM,
  ASSISTANT_GUIDED_TOUR_TOOLTIP_PLACEMENTS.TOP,
]);

function buildTourTargetSelector(targetId) {
  return `[${ASSISTANT_GUIDED_TOUR_TARGET_ATTR}="${targetId}"]`;
}

function buildTourControlsSelector() {
  return `[${ASSISTANT_GUIDED_TOUR_CONTROLS_ATTR}="true"]`;
}

function isElementUsable(element) {
  if (!element || !element.isConnected) return false;
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return false;
  const style = window.getComputedStyle(element);
  return style.display !== "none" && style.visibility !== "hidden";
}

function readElementRect(element) {
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  if (!Number.isFinite(rect.width) || !Number.isFinite(rect.height)) return null;
  const overlayRect = resolveAssistantGuidedTourOverlayRect({
    rect,
    visualViewport: typeof window !== "undefined" ? window.visualViewport : null,
  });
  return {
    left: Math.round(overlayRect.left),
    top: Math.round(overlayRect.top),
    width: Math.round(overlayRect.width),
    height: Math.round(overlayRect.height),
    right: Math.round(overlayRect.right),
    bottom: Math.round(overlayRect.bottom),
  };
}

function isMobileTourViewport(viewport) {
  return (
    Number(viewport?.width) > 0 &&
    Number(viewport?.width) < MOBILE_TOUR_BREAKPOINT_PX
  );
}

function isAssistantTourActionTarget(targetId) {
  return (
    targetId === ASSISTANT_GUIDED_TOUR_TARGETS.ASSISTANT_NEXT ||
    targetId === ASSISTANT_GUIDED_TOUR_TARGETS.ASSISTANT_PREVIEW
  );
}

function readAssistantControlsRoot(targetElement = null) {
  if (typeof document === "undefined") return null;
  const selector = buildTourControlsSelector();
  const localRoot = targetElement?.closest?.(selector);
  if (isElementUsable(localRoot)) return localRoot;
  const root = document.querySelector(selector);
  return isElementUsable(root) ? root : null;
}

function readMobileTourAvoidRects({
  targetId,
  targetElement,
  previousTargetId = "",
} = {}) {
  if (typeof document === "undefined") return [];

  const panel = document.getElementById("sidebar-panel");
  const contentTarget = document.querySelector(
    buildTourTargetSelector(ASSISTANT_GUIDED_TOUR_TARGETS.ASSISTANT_CONTENT)
  );
  const contextRoot = contentTarget || panel;

  const avoidElements = new Set();
  const addAvoidElement = (element) => {
    if (!element || !isElementUsable(element)) return;
    if (element === targetElement) return;
    if (targetElement?.contains?.(element)) return;
    if (targetElement && element.contains?.(targetElement)) return;
    avoidElements.add(element);
  };
  const previousTarget = previousTargetId
    ? document.querySelector(buildTourTargetSelector(previousTargetId))
    : null;
  addAvoidElement(previousTarget);

  const controlsRoot = readAssistantControlsRoot(targetElement);
  if (controlsRoot) {
    if (!targetElement || !controlsRoot.contains(targetElement)) {
      addAvoidElement(controlsRoot);
    } else {
      controlsRoot
        .querySelectorAll?.(["button", '[role="button"]'].join(","))
        .forEach(addAvoidElement);
    }
  }

  if (contextRoot && isAssistantTourActionTarget(targetId)) {
    contextRoot
      .querySelectorAll?.(`[${ASSISTANT_GUIDED_TOUR_TARGET_ATTR}]`)
      .forEach((element) => {
        const semanticTargetId = element.getAttribute(
          ASSISTANT_GUIDED_TOUR_TARGET_ATTR
        );
        if (!semanticTargetId) return;
        if (semanticTargetId === targetId) return;
        if (semanticTargetId === ASSISTANT_GUIDED_TOUR_TARGETS.ASSISTANT_CONTENT) {
          return;
        }
        addAvoidElement(element);
      });

    contextRoot
      .querySelectorAll?.(
        [
          "input",
          "textarea",
          "select",
          "button",
          '[role="button"]',
          '[role="switch"]',
          '[contenteditable="true"]',
        ].join(",")
      )
      .forEach(addAvoidElement);
  }

  return [...avoidElements].map(readElementRect).filter(Boolean);
}

function readAssistantActionTargetElement() {
  if (typeof document === "undefined") return null;
  const nextTarget = document.querySelector(
    buildTourTargetSelector(ASSISTANT_GUIDED_TOUR_TARGETS.ASSISTANT_NEXT)
  );
  if (isElementUsable(nextTarget)) return nextTarget;

  const previewTarget = document.querySelector(
    buildTourTargetSelector(ASSISTANT_GUIDED_TOUR_TARGETS.ASSISTANT_PREVIEW)
  );
  return isElementUsable(previewTarget) ? previewTarget : null;
}

function resolveMobileTourPositioningViewport({
  viewport,
  targetId,
  targetElement,
} = {}) {
  if (!isMobileTourViewport(viewport)) return viewport;
  if (isAssistantTourActionTarget(targetId)) return viewport;

  const controlsRoot = readAssistantControlsRoot(targetElement);
  const actionTarget = readAssistantActionTargetElement();
  const lowerBoundaryElement =
    controlsRoot && (!targetElement || !controlsRoot.contains(targetElement))
      ? controlsRoot
      : actionTarget;
  if (!lowerBoundaryElement || lowerBoundaryElement === targetElement) {
    return viewport;
  }
  if (targetElement?.contains?.(actionTarget)) return viewport;

  const actionRect = readElementRect(lowerBoundaryElement);
  const viewportTop = Number(viewport?.top);
  const viewportHeight = Number(viewport?.height);
  if (!Number.isFinite(viewportTop) || !Number.isFinite(viewportHeight)) {
    return viewport;
  }
  const viewportBottom = viewportTop + viewportHeight;
  const safeBottom = Number(actionRect?.top) - MOBILE_BOTTOM_CONTROLS_GAP_PX;
  if (!Number.isFinite(safeBottom) || safeBottom <= viewportTop) {
    return viewport;
  }
  if (safeBottom >= viewportBottom) return viewport;

  return {
    ...viewport,
    height: Math.max(0, safeBottom - viewportTop),
  };
}

function areNumbersClose(first, second, tolerance = TOUR_MEASUREMENT_TOLERANCE_PX) {
  return Math.abs(Number(first) - Number(second)) <= tolerance;
}

function areRectsEqual(first, second) {
  if (!first || !second) return first === second;
  return (
    areNumbersClose(first.left, second.left) &&
    areNumbersClose(first.top, second.top) &&
    areNumbersClose(first.width, second.width) &&
    areNumbersClose(first.height, second.height)
  );
}

function areViewportsEqual(first, second) {
  if (!first || !second) return first === second;
  return (
    areNumbersClose(Math.round(first.left), Math.round(second.left)) &&
    areNumbersClose(Math.round(first.top), Math.round(second.top)) &&
    areNumbersClose(Math.round(first.width), Math.round(second.width)) &&
    areNumbersClose(Math.round(first.height), Math.round(second.height))
  );
}

function areSizesEqual(first, second) {
  if (!first || !second) return first === second;
  return (
    areNumbersClose(first.width, second.width) &&
    areNumbersClose(first.height, second.height)
  );
}

function readTooltipNaturalSize(element) {
  const rect = element?.getBoundingClientRect?.();
  if (!rect) return null;

  const style = window.getComputedStyle(element);
  const borderX =
    (Number.parseFloat(style.borderLeftWidth) || 0) +
    (Number.parseFloat(style.borderRightWidth) || 0);
  const borderY =
    (Number.parseFloat(style.borderTopWidth) || 0) +
    (Number.parseFloat(style.borderBottomWidth) || 0);
  const naturalWidth = Math.max(
    rect.width,
    Number(element.scrollWidth) + borderX
  );
  const naturalHeight = Math.max(
    rect.height,
    Number(element.scrollHeight) + borderY
  );

  return {
    width: Math.round(naturalWidth) || FALLBACK_TOOLTIP_WIDTH_PX,
    height: Math.round(naturalHeight) || FALLBACK_TOOLTIP_HEIGHT_PX,
  };
}

function isScrollableElement(element) {
  if (!element) return false;
  const style = window.getComputedStyle(element);
  const overflowY = style.overflowY || style.overflow || "";
  return (
    /(auto|scroll|overlay)/.test(overflowY) &&
    element.scrollHeight > element.clientHeight + 1
  );
}

function findSidebarScrollParent(target, panel) {
  let current = target?.parentElement || null;
  while (current && current !== panel) {
    if (isScrollableElement(current)) return current;
    current = current.parentElement;
  }
  return isScrollableElement(panel) ? panel : null;
}

function isRectInsideViewport(rect) {
  if (!rect) return false;
  const viewport = readTourViewport();
  const overlayRect = resolveAssistantGuidedTourOverlayRect({
    rect,
    visualViewport: typeof window !== "undefined" ? window.visualViewport : null,
  });
  return (
    overlayRect.top >= viewport.top + VIEWPORT_MARGIN_PX &&
    overlayRect.left >= viewport.left + VIEWPORT_MARGIN_PX &&
    overlayRect.bottom <= viewport.top + viewport.height - VIEWPORT_MARGIN_PX &&
    overlayRect.right <= viewport.left + viewport.width - VIEWPORT_MARGIN_PX
  );
}

function readDashboardHeaderBottom() {
  if (typeof document === "undefined" || typeof window === "undefined") return 0;
  const header = document.querySelector('[data-dashboard-header="true"]');
  const rect = header?.getBoundingClientRect?.();
  const measuredBottom = rect ? Number(rect.bottom) || 0 : 0;
  const cssHeight = Number.parseFloat(
    window
      .getComputedStyle(document.documentElement)
      .getPropertyValue("--dashboard-header-height")
  );
  return Math.max(measuredBottom, Number.isFinite(cssHeight) ? cssHeight : 0, 0);
}

function readTourViewport() {
  if (typeof window === "undefined") {
    return { left: 0, top: 0, width: 0, height: 0 };
  }

  const visualViewport = window.visualViewport;
  const left = Number(visualViewport?.offsetLeft) || 0;
  const viewportTop = Number(visualViewport?.offsetTop) || 0;
  const width = Number(visualViewport?.width) || window.innerWidth || 0;
  const visualBottom =
    viewportTop + (Number(visualViewport?.height) || window.innerHeight || 0);
  const top = Math.max(viewportTop, readDashboardHeaderBottom());

  return {
    left,
    top,
    width,
    height: Math.max(0, visualBottom - top),
  };
}

function scrollTargetIntoView(target, { reducedMotion = false } = {}) {
  if (!target || typeof window === "undefined") return;
  const rect = target.getBoundingClientRect();
  if (isRectInsideViewport(rect)) return;

  const behavior = reducedMotion ? "auto" : "smooth";
  const panel = document.getElementById("sidebar-panel");
  if (panel && panel.contains(target)) {
    const scrollParent = findSidebarScrollParent(target, panel);
    if (!scrollParent) return;

    const parentRect = scrollParent.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const topDelta =
      targetRect.top -
      parentRect.top -
      (parentRect.height - targetRect.height) / 2;

    scrollParent.scrollTo({
      top: scrollParent.scrollTop + topDelta,
      behavior,
    });
    return;
  }

  target.scrollIntoView({
    behavior,
    block: "center",
    inline: "nearest",
  });
}

function resolveTargetScrollOwner(target) {
  if (typeof document === "undefined" || typeof window === "undefined") {
    return null;
  }
  const panel = document.getElementById("sidebar-panel");
  if (panel && panel.contains(target)) {
    return findSidebarScrollParent(target, panel);
  }
  return window;
}

function resolveArrowClass(placement) {
  if (placement === "left") return styles.arrowLeft;
  if (placement === "top") return styles.arrowTop;
  if (placement === "bottom") return styles.arrowBottom;
  return styles.arrowRight;
}

function readInputValue(element) {
  if (!element) return "";
  return typeof element.value === "string" ? element.value : "";
}

function resolveInputElement(element) {
  if (!element) return null;
  if (element.matches?.("input, textarea, select")) return element;
  return element.querySelector?.("input, textarea, select") || null;
}

function readTargetInputValue(targetId) {
  if (typeof document === "undefined") return "";
  const target = document.querySelector(buildTourTargetSelector(targetId));
  return readInputValue(resolveInputElement(target));
}

function readTargetHydrated(targetId) {
  if (typeof document === "undefined") return false;
  const target = document.querySelector(buildTourTargetSelector(targetId));
  return target?.getAttribute?.(ASSISTANT_GUIDED_TOUR_HYDRATION_ATTR) === "true";
}

function readFirstNamesTargetsHydrated() {
  return areAssistantGuidedTourInitialFieldsHydrated({
    eventNameHydrated: readTargetHydrated(
      ASSISTANT_GUIDED_TOUR_TARGETS.EVENT_NAME
    ),
    primaryNameHydrated: readTargetHydrated(
      ASSISTANT_GUIDED_TOUR_TARGETS.PERSON_PRIMARY
    ),
    secondaryNameHydrated: readTargetHydrated(
      ASSISTANT_GUIDED_TOUR_TARGETS.PERSON_SECONDARY
    ),
  });
}

function readActiveElementDebugState() {
  if (typeof document === "undefined") return null;
  const activeElement = document.activeElement;
  if (!activeElement) return null;
  const tourTarget = activeElement.closest?.(
    `[${ASSISTANT_GUIDED_TOUR_TARGET_ATTR}]`
  );

  return {
    tagName: activeElement.tagName || "",
    id: activeElement.id || "",
    name: activeElement.getAttribute?.("name") || "",
    targetId:
      activeElement.getAttribute?.(ASSISTANT_GUIDED_TOUR_TARGET_ATTR) ||
      tourTarget?.getAttribute?.(ASSISTANT_GUIDED_TOUR_TARGET_ATTR) ||
      "",
    value: readInputValue(resolveInputElement(activeElement)),
  };
}

function readTargetDebugState(targetId) {
  if (typeof document === "undefined") {
    return {
      targetId,
      exists: false,
    };
  }

  const target = document.querySelector(buildTourTargetSelector(targetId));
  const input = resolveInputElement(target);
  const value = readInputValue(input);

  return {
    targetId,
    exists: Boolean(target),
    isConnected: target?.isConnected === true,
    usable: target ? isElementUsable(target) : false,
    hydrated:
      target?.getAttribute?.(ASSISTANT_GUIDED_TOUR_HYDRATION_ATTR) === "true",
    tagName: target?.tagName || "",
    id: target?.id || "",
    inputTagName: input?.tagName || "",
    inputId: input?.id || "",
    value,
    trimmedValid: value.trim() !== "",
    isActive:
      Boolean(input && input === document.activeElement) ||
      Boolean(target && target === document.activeElement) ||
      Boolean(target?.contains?.(document.activeElement)),
    rect: readElementRect(target),
  };
}

function readFirstNamesDebugSnapshot() {
  return {
    fieldsHydrated: readFirstNamesTargetsHydrated(),
    eventName: readTargetDebugState(ASSISTANT_GUIDED_TOUR_TARGETS.EVENT_NAME),
    primaryName: readTargetDebugState(
      ASSISTANT_GUIDED_TOUR_TARGETS.PERSON_PRIMARY
    ),
    secondaryName: readTargetDebugState(
      ASSISTANT_GUIDED_TOUR_TARGETS.PERSON_SECONDARY
    ),
  };
}

function readDebugStack() {
  try {
    const stack = new Error("assistant-tour-debug-stack").stack;
    return stack ? stack.split("\n").slice(2, 9).join("\n") : "";
  } catch {
    return "";
  }
}

function isFirstNamesFieldPhase(phase) {
  return (
    phase === ASSISTANT_GUIDED_TOUR_PHASES.EVENT_NAME ||
    phase === ASSISTANT_GUIDED_TOUR_PHASES.PERSON_PRIMARY ||
    phase === ASSISTANT_GUIDED_TOUR_PHASES.PERSON_SECONDARY
  );
}

function isFirstNamesInitialPhase(phase) {
  return (
    phase === ASSISTANT_GUIDED_TOUR_PHASES.CONTENT ||
    phase === ASSISTANT_GUIDED_TOUR_PHASES.EVENT_NAME ||
    phase === ASSISTANT_GUIDED_TOUR_PHASES.PERSON_NAMES ||
    phase === ASSISTANT_GUIDED_TOUR_PHASES.PERSON_PRIMARY ||
    phase === ASSISTANT_GUIDED_TOUR_PHASES.PERSON_SECONDARY
  );
}

function doesElementMatchTourTarget(element, targetId) {
  if (!element || !targetId) return false;
  return element.getAttribute?.(ASSISTANT_GUIDED_TOUR_TARGET_ATTR) === targetId;
}

export default function AssistantGuidedTour({
  draftKey = "",
  userUid = "",
  editorReady = false,
  editorReadOnly = false,
  preferencesLoaded = false,
  assistantTourOptOut = false,
  assistantTourSaving = false,
  onAssistantTourPreferenceChange = null,
  onRequestAssistantMode = null,
  isPreviewOpen = false,
  assistantState = null,
  fieldEditSignal = null,
  openingKey = "",
}) {
  const [mounted, setMounted] = useState(false);
  const [phase, setPhase] = useState(ASSISTANT_GUIDED_TOUR_PHASES.CONTENT);
  const [targetElement, setTargetElement] = useState(null);
  const [targetRect, setTargetRect] = useState(null);
  const [tooltipSize, setTooltipSize] = useState({
    width: FALLBACK_TOOLTIP_WIDTH_PX,
    height: FALLBACK_TOOLTIP_HEIGHT_PX,
  });
  const [viewportSnapshot, setViewportSnapshot] = useState(() => ({
    left: 0,
    top: 0,
    width: 0,
    height: 0,
  }));
  const [firstNamesTargetsHydrated, setFirstNamesTargetsHydrated] =
    useState(false);
  const [closedSessionKey, setClosedSessionKey] = useState("");
  const [completedSessionKey, setCompletedSessionKey] = useState("");
  const [preferenceError, setPreferenceError] = useState("");
  const [reducedMotion, setReducedMotion] = useState(false);
  const [firstNamesHydrationReadyKey, setFirstNamesHydrationReadyKey] =
    useState("");
  const tooltipRef = useRef(null);
  const positionKeyRef = useRef("");
  const assistantActivationSessionRef = useRef("");
  const fieldAdvancedByTransitionRef = useRef({});
  const fieldEditSignalConsumedRef = useRef({});
  const contentAdvancedRef = useRef("");
  const scrolledTargetRef = useRef("");
  const previousEditedTargetIdRef = useRef("");
  const previousPhaseRef = useRef("");
  const previousCanRenderTourRef = useRef(null);
  const measureDebugSignatureRef = useRef("");
  const latestDebugStateRef = useRef({});
  const lastMobileTooltipPlacementRef = useRef("");

  const sessionKey = useMemo(
    () => createAssistantGuidedTourSessionKey({ draftKey, userUid }),
    [draftKey, userUid]
  );
  const currentStep = assistantState?.currentStep || null;
  const currentSubstep = assistantState?.currentSubstep || null;
  const assistantActive = assistantState?.active === true;
  const assistantMounted = assistantState?.mounted === true;
  const assistantNextIsPreview = assistantState?.nextIsPreview === true;
  const assistantProgressLabel = assistantState?.progressLabel || "";
  const firstNamesSubstep = useMemo(
    () =>
      isAssistantGuidedTourFirstNamesSubstep({
        currentStep,
        currentSubstep,
      }),
    [currentStep, currentSubstep]
  );
  const assistantPositionKey = useMemo(
    () =>
      getAssistantGuidedTourPositionKey({
        currentStep,
        currentSubstep,
        currentStepIndex: assistantState?.currentStepIndex,
        currentSubstepIndex: assistantState?.currentSubstepIndex,
      }),
    [
      assistantState?.currentStepIndex,
      assistantState?.currentSubstepIndex,
      currentStep,
      currentSubstep,
    ]
  );
  const firstNamesHydrationKey = useMemo(
    () => {
      const safeOpeningKey = String(openingKey || sessionKey || "").trim();
      const safePositionKey = String(assistantPositionKey || "").trim();
      if (!safeOpeningKey || !safePositionKey) return "";
      return `${safeOpeningKey}:${safePositionKey}:first-names-hydrated`;
    },
    [assistantPositionKey, openingKey, sessionKey]
  );
  const initialPhase = useMemo(
    () =>
      resolveInitialAssistantGuidedTourPhase({
        currentStep,
        currentSubstep,
        isPreviewStep: assistantNextIsPreview,
      }),
    [assistantNextIsPreview, currentStep, currentSubstep]
  );
  const targetId = useMemo(
    () =>
      resolveAssistantGuidedTourTargetId({
        phase,
        isPreviewStep: assistantNextIsPreview,
      }),
    [assistantNextIsPreview, phase]
  );
  const message = useMemo(
    () =>
      getAssistantGuidedTourMessage({
        phase: assistantNextIsPreview
          ? ASSISTANT_GUIDED_TOUR_PHASES.PREVIEW
          : phase,
        currentStep,
        currentSubstep,
      }),
    [assistantNextIsPreview, currentStep, currentSubstep, phase]
  );

  useEffect(() => {
    latestDebugStateRef.current = {
      draftKey,
      sessionKey,
      openingKey,
      phase,
      targetId,
      assistantActive,
      assistantMounted,
      assistantPositionKey,
      assistantStepIndex: assistantState?.currentStepIndex,
      assistantSubstepIndex: assistantState?.currentSubstepIndex,
    };
  });

  const updateViewportSnapshot = useCallback(() => {
    if (typeof window === "undefined") return;
    const nextViewport = readTourViewport();
    setViewportSnapshot((currentViewport) =>
      areViewportsEqual(currentViewport, nextViewport)
        ? currentViewport
        : nextViewport
    );
  }, []);

  useEffect(() => {
    setMounted(true);
    if (typeof window !== "undefined") {
      setViewportSnapshot(readTourViewport());
    }
  }, []);

  useEffect(() => {
    logAssistantTourDebug("mount", () => ({
      draftKey,
      sessionKey,
      openingKey,
      phase,
      targetId,
      assistantActive,
      assistantMounted,
      assistantStepIndex: assistantState?.currentStepIndex,
      assistantSubstepIndex: assistantState?.currentSubstepIndex,
      assistantPositionKey,
      firstNames: readFirstNamesDebugSnapshot(),
      activeElement: readActiveElementDebugState(),
    }));
    return () => {
      logAssistantTourDebug("unmount", () => ({
        ...latestDebugStateRef.current,
        firstNames: readFirstNamesDebugSnapshot(),
        activeElement: readActiveElementDebugState(),
      }));
    };
  }, []);

  useEffect(() => {
    if (previousPhaseRef.current === phase) return;
    logAssistantTourDebug("phase-change", () => ({
      previousPhase: previousPhaseRef.current,
      nextPhase: phase,
      targetId,
      draftKey,
      sessionKey,
      openingKey,
      assistantPositionKey,
      assistantStepIndex: assistantState?.currentStepIndex,
      assistantSubstepIndex: assistantState?.currentSubstepIndex,
      firstNames: readFirstNamesDebugSnapshot(),
      activeElement: readActiveElementDebugState(),
    }));
    previousPhaseRef.current = phase;
  }, [
    assistantPositionKey,
    assistantState?.currentStepIndex,
    assistantState?.currentSubstepIndex,
    draftKey,
    openingKey,
    phase,
    sessionKey,
    targetId,
  ]);

  useEffect(() => {
    if (!mounted || typeof window === "undefined") return undefined;
    const mediaQuery = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!mediaQuery) return undefined;

    const sync = () => setReducedMotion(mediaQuery.matches === true);
    sync();
    mediaQuery.addEventListener?.("change", sync);
    return () => mediaQuery.removeEventListener?.("change", sync);
  }, [mounted]);

  useEffect(() => {
    logAssistantTourDebug("state-reset", () => ({
      reason: "session-key-changed",
      draftKey,
      sessionKey,
      openingKey,
      phase,
      targetId,
      assistantPositionKey,
      firstNames: readFirstNamesDebugSnapshot(),
      activeElement: readActiveElementDebugState(),
      stack: readDebugStack(),
    }));
    positionKeyRef.current = "";
    assistantActivationSessionRef.current = "";
    fieldAdvancedByTransitionRef.current = {};
    fieldEditSignalConsumedRef.current = {};
    contentAdvancedRef.current = "";
    scrolledTargetRef.current = "";
    previousEditedTargetIdRef.current = "";
    lastMobileTooltipPlacementRef.current = "";
    setTargetElement(null);
    setTargetRect(null);
    setFirstNamesTargetsHydrated(false);
    setFirstNamesHydrationReadyKey("");
    setPreferenceError("");
  }, [sessionKey]);

  useEffect(() => {
    setFirstNamesHydrationReadyKey("");
  }, [assistantPositionKey]);

  useEffect(() => {
    logAssistantTourDebug("target-state-reset", () => ({
      reason: "position-substep-or-target-changed",
      draftKey,
      sessionKey,
      openingKey,
      phase,
      targetId,
      assistantPositionKey,
      firstNamesSubstep,
      firstNames: readFirstNamesDebugSnapshot(),
      activeElement: readActiveElementDebugState(),
      stack: readDebugStack(),
    }));
    scrolledTargetRef.current = "";
    lastMobileTooltipPlacementRef.current = "";
    setTargetElement(null);
    setTargetRect(null);
    setFirstNamesTargetsHydrated(false);
  }, [assistantPositionKey, firstNamesSubstep, targetId]);

  useEffect(() => {
    if (!sessionKey) return;
    if (!assistantActive) return;

    const result = reconcileAssistantGuidedTourPosition({
      previousPositionKey: positionKeyRef.current,
      nextPositionKey: assistantPositionKey,
      nextPhase: initialPhase,
    });

    if (!positionKeyRef.current || result.changed || assistantNextIsPreview) {
      const reconcileReason = !positionKeyRef.current
        ? "initial-position"
        : assistantNextIsPreview
          ? "preview-position"
          : "assistant-position-changed";
      logAssistantTourDebug("position-reconcile", () => ({
        reason: reconcileReason,
        previousPositionKey: positionKeyRef.current,
        nextPositionKey: assistantPositionKey,
        nextPhase: result.phase,
        currentPhase: phase,
        draftKey,
        sessionKey,
        openingKey,
        assistantStepIndex: assistantState?.currentStepIndex,
        assistantSubstepIndex: assistantState?.currentSubstepIndex,
        firstNames: readFirstNamesDebugSnapshot(),
        activeElement: readActiveElementDebugState(),
      }));
      logAssistantTourDebug("phase-request", () => ({
        source: "position-reconcile",
        reason: reconcileReason,
        fromPhase: phase,
        toPhase: result.phase,
        previousPositionKey: positionKeyRef.current,
        nextPositionKey: assistantPositionKey,
        draftKey,
        sessionKey,
        openingKey,
        assistantStepIndex: assistantState?.currentStepIndex,
        assistantSubstepIndex: assistantState?.currentSubstepIndex,
        firstNames: readFirstNamesDebugSnapshot(),
        activeElement: readActiveElementDebugState(),
        stack: readDebugStack(),
      }));
      positionKeyRef.current = assistantPositionKey;
      if (result.changed || assistantNextIsPreview) {
        previousEditedTargetIdRef.current = "";
      }
      setPhase(result.phase);
      scrolledTargetRef.current = "";
    }
  }, [
    assistantActive,
    assistantNextIsPreview,
    assistantPositionKey,
    assistantState?.currentStepIndex,
    assistantState?.currentSubstepIndex,
    draftKey,
    initialPhase,
    openingKey,
    sessionKey,
  ]);

  useEffect(() => {
    if (!sessionKey) return;
    if (!editorReady || editorReadOnly) return;
    if (!preferencesLoaded || assistantTourOptOut === true) return;
    if (closedSessionKey === sessionKey || completedSessionKey === sessionKey) return;
    if (assistantActive) return;
    if (assistantActivationSessionRef.current === sessionKey) return;
    if (typeof onRequestAssistantMode !== "function") return;

    assistantActivationSessionRef.current = sessionKey;
    logAssistantTourDebug("assistant-activation-request", () => ({
      reason: "tour-auto-start-needs-assistant-mode",
      draftKey,
      sessionKey,
      openingKey,
      editorReady,
      editorReadOnly,
      preferencesLoaded,
      assistantTourOptOut,
      assistantActive,
      assistantMounted,
      assistantPositionKey,
      assistantStepIndex: assistantState?.currentStepIndex,
      assistantSubstepIndex: assistantState?.currentSubstepIndex,
      firstNames: readFirstNamesDebugSnapshot(),
      activeElement: readActiveElementDebugState(),
      stack: readDebugStack(),
    }));
    onRequestAssistantMode();
  }, [
    assistantActive,
    assistantTourOptOut,
    closedSessionKey,
    completedSessionKey,
    editorReady,
    editorReadOnly,
    onRequestAssistantMode,
    preferencesLoaded,
    sessionKey,
  ]);

  const measureTarget = useCallback(() => {
    if (!mounted || typeof document === "undefined") return;
    updateViewportSnapshot();
    const nextFirstNamesTargetsHydrated = firstNamesSubstep
      ? readFirstNamesTargetsHydrated()
      : true;
    setFirstNamesTargetsHydrated(nextFirstNamesTargetsHydrated);
    const nextElement = document.querySelector(buildTourTargetSelector(targetId));
    const nextElementUsable = isElementUsable(nextElement);
    const nextRect = nextElementUsable ? readElementRect(nextElement) : null;
    if (shouldDebugAssistantTour()) {
      const measureDebugSignature = JSON.stringify({
        targetId,
        exists: Boolean(nextElement),
        usable: nextElementUsable,
        rect: nextRect,
        firstNamesTargetsHydrated: nextFirstNamesTargetsHydrated,
        firstNames: readFirstNamesDebugSnapshot(),
      });
      if (measureDebugSignatureRef.current !== measureDebugSignature) {
        measureDebugSignatureRef.current = measureDebugSignature;
        logAssistantTourDebug("target-measure", () => ({
          targetId,
          exists: Boolean(nextElement),
          usable: nextElementUsable,
          rect: nextRect,
          hydrated:
            nextElement?.getAttribute?.(ASSISTANT_GUIDED_TOUR_HYDRATION_ATTR) ===
            "true",
          ...latestDebugStateRef.current,
          firstNamesSubstep,
          firstNamesTargetsHydrated: nextFirstNamesTargetsHydrated,
          firstNames: readFirstNamesDebugSnapshot(),
          activeElement: readActiveElementDebugState(),
        }));
      }
    }
    if (!nextElementUsable) {
      setTargetElement(null);
      setTargetRect(null);
      return;
    }

    setTargetElement((currentElement) =>
      currentElement === nextElement ? currentElement : nextElement
    );
    setTargetRect((currentRect) =>
      areRectsEqual(currentRect, nextRect) ? currentRect : nextRect
    );
  }, [firstNamesSubstep, mounted, targetId, updateViewportSnapshot]);

  useEffect(() => {
    if (!mounted || typeof document === "undefined") return undefined;
    if (!sessionKey || !assistantMounted) return undefined;
    if (closedSessionKey === sessionKey || completedSessionKey === sessionKey) {
      return undefined;
    }
    if (assistantTourOptOut === true || editorReadOnly) return undefined;

    logAssistantTourDebug("dom-observer-subscribe", () => ({
      source: "mutation-observer",
      draftKey,
      sessionKey,
      openingKey,
      phase,
      targetId,
      assistantPositionKey,
      assistantMounted,
      firstNames: readFirstNamesDebugSnapshot(),
      activeElement: readActiveElementDebugState(),
    }));
    measureTarget();
    const observer = new MutationObserver(measureTarget);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: [
        "class",
        "style",
        "hidden",
        "disabled",
        ASSISTANT_GUIDED_TOUR_TARGET_ATTR,
        ASSISTANT_GUIDED_TOUR_HYDRATION_ATTR,
      ],
    });

    return () => {
      logAssistantTourDebug("dom-observer-cleanup", () => ({
        source: "mutation-observer",
        draftKey,
        sessionKey,
        openingKey,
        phase,
        targetId,
        assistantPositionKey,
        firstNames: readFirstNamesDebugSnapshot(),
        activeElement: readActiveElementDebugState(),
      }));
      observer.disconnect();
    };
  }, [
    assistantMounted,
    assistantTourOptOut,
    closedSessionKey,
    completedSessionKey,
    editorReadOnly,
    measureTarget,
    mounted,
    sessionKey,
  ]);

  useEffect(() => {
    if (!targetElement || typeof window === "undefined") return undefined;

    logAssistantTourDebug("target-observers-subscribe", () => ({
      source: "resize-scroll-observers",
      targetId,
      target: readTargetDebugState(targetId),
      ...latestDebugStateRef.current,
      firstNames: readFirstNamesDebugSnapshot(),
      activeElement: readActiveElementDebugState(),
    }));
    let updateFrame = 0;
    const update = () => {
      updateViewportSnapshot();
      const nextRect = readElementRect(targetElement);
      setTargetRect((currentRect) =>
        areRectsEqual(currentRect, nextRect) ? currentRect : nextRect
      );
    };
    const scheduleUpdate = () => {
      if (updateFrame) return;
      updateFrame = window.requestAnimationFrame(() => {
        updateFrame = 0;
        update();
      });
    };

    update();
    const resizeObserver =
      typeof ResizeObserver === "function"
        ? new ResizeObserver(scheduleUpdate)
        : null;
    resizeObserver?.observe(targetElement);
    const panel = document.getElementById("sidebar-panel");
    if (panel) resizeObserver?.observe(panel);
    const controlsRoot = readAssistantControlsRoot(targetElement);
    if (controlsRoot) resizeObserver?.observe(controlsRoot);
    const scrollOwner = resolveTargetScrollOwner(targetElement);
    window.addEventListener("resize", scheduleUpdate);
    scrollOwner?.addEventListener?.("scroll", scheduleUpdate, { passive: true });
    window.visualViewport?.addEventListener?.("resize", scheduleUpdate);
    window.visualViewport?.addEventListener?.("scroll", scheduleUpdate);

    return () => {
      logAssistantTourDebug("target-observers-cleanup", () => ({
        source: "resize-scroll-observers",
        targetId,
        target: readTargetDebugState(targetId),
        ...latestDebugStateRef.current,
        firstNames: readFirstNamesDebugSnapshot(),
        activeElement: readActiveElementDebugState(),
      }));
      if (updateFrame) {
        window.cancelAnimationFrame(updateFrame);
        updateFrame = 0;
      }
      resizeObserver?.disconnect();
      window.removeEventListener("resize", scheduleUpdate);
      scrollOwner?.removeEventListener?.("scroll", scheduleUpdate);
      window.visualViewport?.removeEventListener?.("resize", scheduleUpdate);
      window.visualViewport?.removeEventListener?.("scroll", scheduleUpdate);
    };
  }, [targetElement, updateViewportSnapshot]);

  useEffect(() => {
    if (!tooltipRef.current || typeof ResizeObserver !== "function") return undefined;
    logAssistantTourDebug("tooltip-resize-observer-subscribe", () => ({
      source: "tooltip-resize-observer",
      targetId,
      ...latestDebugStateRef.current,
      firstNames: readFirstNamesDebugSnapshot(),
    }));
    let updateFrame = 0;
    const update = () => {
      updateViewportSnapshot();
      const nextSize = readTooltipNaturalSize(tooltipRef.current);
      if (!nextSize) return;
      setTooltipSize((currentSize) =>
        areSizesEqual(currentSize, nextSize) ? currentSize : nextSize
      );
    };
    const scheduleUpdate = () => {
      if (typeof window === "undefined") return;
      if (updateFrame) return;
      updateFrame = window.requestAnimationFrame(() => {
        updateFrame = 0;
        update();
      });
    };

    update();
    const observer = new ResizeObserver(scheduleUpdate);
    observer.observe(tooltipRef.current);
    return () => {
      logAssistantTourDebug("tooltip-resize-observer-cleanup", () => ({
        source: "tooltip-resize-observer",
        targetId,
        ...latestDebugStateRef.current,
        firstNames: readFirstNamesDebugSnapshot(),
      }));
      if (updateFrame) {
        window.cancelAnimationFrame(updateFrame);
        updateFrame = 0;
      }
      observer.disconnect();
    };
  }, [targetElement, updateViewportSnapshot]);

  const targetReadyForCurrentPhase = Boolean(
    targetElement &&
      targetRect &&
      doesElementMatchTourTarget(targetElement, targetId)
  );
  const waitingForFirstNamesInitialization =
    firstNamesSubstep &&
    isFirstNamesInitialPhase(phase) &&
    (!firstNamesHydrationKey ||
      firstNamesHydrationReadyKey !== firstNamesHydrationKey);
  const canEvaluateTour =
    shouldAutoStartAssistantGuidedTour({
      draftKey: sessionKey,
      editorReady,
      assistantMounted,
      targetsReady: targetReadyForCurrentPhase,
      preferencesLoaded,
      assistantTourOptOut,
      editorReadOnly,
    }) &&
    closedSessionKey !== sessionKey &&
    completedSessionKey !== sessionKey &&
    phase !== ASSISTANT_GUIDED_TOUR_PHASES.COMPLETE;
  const canRenderTour = canEvaluateTour && !waitingForFirstNamesInitialization;

  useEffect(() => {
    if (previousCanRenderTourRef.current === canRenderTour) return;
    logAssistantTourDebug("can-render-change", () => ({
      previousCanRenderTour: previousCanRenderTourRef.current,
      nextCanRenderTour: canRenderTour,
      draftKey,
      sessionKey,
      openingKey,
      phase,
      targetId,
      targetReady: targetReadyForCurrentPhase,
      canEvaluateTour,
      waitingForFirstNamesInitialization,
      firstNamesHydrationKey,
      firstNamesHydrationReadyKey,
      editorReady,
      editorReadOnly,
      preferencesLoaded,
      assistantTourOptOut,
      assistantMounted,
      firstNamesSubstep,
      firstNamesTargetsHydrated,
      closedSessionKey,
      completedSessionKey,
      assistantPositionKey,
      assistantStepIndex: assistantState?.currentStepIndex,
      assistantSubstepIndex: assistantState?.currentSubstepIndex,
      firstNames: readFirstNamesDebugSnapshot(),
      activeElement: readActiveElementDebugState(),
    }));
    previousCanRenderTourRef.current = canRenderTour;
  }, [
    assistantMounted,
    assistantPositionKey,
    assistantState?.currentStepIndex,
    assistantState?.currentSubstepIndex,
    assistantTourOptOut,
    canEvaluateTour,
    canRenderTour,
    closedSessionKey,
    completedSessionKey,
    draftKey,
    editorReadOnly,
    editorReady,
    firstNamesHydrationKey,
    firstNamesHydrationReadyKey,
    firstNamesSubstep,
    firstNamesTargetsHydrated,
    openingKey,
    phase,
    preferencesLoaded,
    sessionKey,
    targetElement,
    targetId,
    targetRect,
    targetReadyForCurrentPhase,
    waitingForFirstNamesInitialization,
  ]);

  useEffect(() => {
    if (!canRenderTour || !targetElement) return;
    const scrollKey = `${sessionKey}:${assistantPositionKey}:${targetId}`;
    if (scrolledTargetRef.current === scrollKey) return;
    scrolledTargetRef.current = scrollKey;
    logAssistantTourDebug("scroll-target-into-view", () => ({
      scrollKey,
      targetId,
      target: readTargetDebugState(targetId),
      ...latestDebugStateRef.current,
      reducedMotion,
      firstNames: readFirstNamesDebugSnapshot(),
      activeElement: readActiveElementDebugState(),
    }));
    scrollTargetIntoView(targetElement, { reducedMotion });
  }, [
    assistantPositionKey,
    canRenderTour,
    reducedMotion,
    sessionKey,
    targetElement,
    targetId,
  ]);

  useEffect(() => {
    if (
      !canEvaluateTour ||
      !firstNamesSubstep ||
      phase !== ASSISTANT_GUIDED_TOUR_PHASES.EVENT_NAME
    ) {
      return;
    }
    if (!firstNamesTargetsHydrated) return;
    if (!firstNamesHydrationKey) return;
    if (firstNamesHydrationReadyKey === firstNamesHydrationKey) return;

    logAssistantTourDebug("initial-target-ready", () => ({
      hydrationKey: firstNamesHydrationKey,
      currentPhase: phase,
      fixedInitialPhase: ASSISTANT_GUIDED_TOUR_PHASES.EVENT_NAME,
      draftKey,
      sessionKey,
      openingKey,
      assistantPositionKey,
      firstNamesTargetsHydrated,
      assistantStepIndex: assistantState?.currentStepIndex,
      assistantSubstepIndex: assistantState?.currentSubstepIndex,
      firstNames: readFirstNamesDebugSnapshot(),
      activeElement: readActiveElementDebugState(),
      stack: readDebugStack(),
    }));
    setFirstNamesHydrationReadyKey(firstNamesHydrationKey);
  }, [
    assistantPositionKey,
    assistantState?.currentStepIndex,
    assistantState?.currentSubstepIndex,
    canEvaluateTour,
    draftKey,
    firstNamesHydrationKey,
    firstNamesHydrationReadyKey,
    firstNamesSubstep,
    firstNamesTargetsHydrated,
    openingKey,
    phase,
    sessionKey,
  ]);

  useEffect(() => {
    if (!sessionKey || !assistantActive) return;
    if (!isFirstNamesFieldPhase(phase)) return;
    if (closedSessionKey === sessionKey || completedSessionKey === sessionKey) {
      return;
    }
    if (!fieldEditSignal || typeof fieldEditSignal !== "object") return;
    const signalKey = String(fieldEditSignal.id || "");
    if (!signalKey) return;
    if (fieldEditSignalConsumedRef.current[signalKey] === true) {
      logAssistantTourDebug("field-edit-signal-ignored", () => ({
        reason: "already-consumed",
        signal: fieldEditSignal,
        currentPhase: phase,
        expectedTargetId: resolveAssistantGuidedTourTargetId({
          phase,
          isPreviewStep: false,
        }),
        draftKey,
        sessionKey,
        openingKey,
        assistantPositionKey,
        firstNames: readFirstNamesDebugSnapshot(),
        activeElement: readActiveElementDebugState(),
      }));
      return;
    }
    fieldEditSignalConsumedRef.current[signalKey] = true;

    const expectedTargetId = resolveAssistantGuidedTourTargetId({
      phase,
      isPreviewStep: false,
    });
    const transitionKey = `${sessionKey}:${assistantPositionKey}:${phase}`;
    const shouldAdvance = shouldAdvanceAssistantGuidedTourFieldEditSignal({
      expectedTargetId,
      signalTargetId: fieldEditSignal.targetId,
      signalValue: fieldEditSignal.value,
      alreadyAdvanced: fieldAdvancedByTransitionRef.current[transitionKey] === true,
    });
    logAssistantTourDebug("field-edit-signal-evaluated", () => ({
      signal: fieldEditSignal,
      signalKey,
      expectedTargetId,
      transitionKey,
      currentPhase: phase,
      shouldAdvance,
      alreadyAdvanced:
        fieldAdvancedByTransitionRef.current[transitionKey] === true,
      draftKey,
      sessionKey,
      openingKey,
      assistantPositionKey,
      assistantStepIndex: assistantState?.currentStepIndex,
      assistantSubstepIndex: assistantState?.currentSubstepIndex,
      firstNames: readFirstNamesDebugSnapshot(),
      activeElement: readActiveElementDebugState(),
      stack: readDebugStack(),
    }));
    if (!shouldAdvance) return;

    fieldAdvancedByTransitionRef.current[transitionKey] = true;
    const nextPhase = resolveNextAssistantGuidedTourFieldPhase(phase);
    previousEditedTargetIdRef.current = expectedTargetId;
    logAssistantTourDebug("phase-request", () => ({
      source: "field-edit-signal",
      fromPhase: phase,
      toPhase: nextPhase,
      signal: fieldEditSignal,
      expectedTargetId,
      transitionKey,
      draftKey,
      sessionKey,
      openingKey,
      assistantPositionKey,
      assistantStepIndex: assistantState?.currentStepIndex,
      assistantSubstepIndex: assistantState?.currentSubstepIndex,
      firstNames: readFirstNamesDebugSnapshot(),
      activeElement: readActiveElementDebugState(),
      stack: readDebugStack(),
    }));
    setPhase(nextPhase);
    scrolledTargetRef.current = "";
  }, [
    assistantActive,
    assistantPositionKey,
    closedSessionKey,
    completedSessionKey,
    fieldEditSignal,
    phase,
    sessionKey,
  ]);

  useEffect(() => {
    if (
      !canRenderTour ||
      phase !== ASSISTANT_GUIDED_TOUR_PHASES.CONTENT ||
      !targetElement
    ) {
      return undefined;
    }

    const transitionKey = `${sessionKey}:${assistantPositionKey}:content`;
    logAssistantTourDebug("content-listeners-subscribe", () => ({
      transitionKey,
      targetId,
      target: readTargetDebugState(targetId),
      ...latestDebugStateRef.current,
      firstNames: readFirstNamesDebugSnapshot(),
      activeElement: readActiveElementDebugState(),
    }));
    const handleInteraction = (event) => {
      const eventTarget = event?.target;
      const accepted =
        event?.isTrusted === true &&
        targetElement.isConnected === true &&
        targetElement.contains(eventTarget) &&
        contentAdvancedRef.current !== transitionKey;
      logAssistantTourDebug("content-interaction-event", () => ({
        transitionKey,
        eventType: event?.type || "",
        eventIsTrusted: event?.isTrusted === true,
        targetConnected: targetElement.isConnected === true,
        eventTargetMatches: targetElement.contains(eventTarget),
        alreadyAdvanced: contentAdvancedRef.current === transitionKey,
        accepted,
        currentPhase: phase,
        targetId,
        eventTarget: {
          tagName: eventTarget?.tagName || "",
          id: eventTarget?.id || "",
          targetId:
            eventTarget?.getAttribute?.(ASSISTANT_GUIDED_TOUR_TARGET_ATTR) ||
            eventTarget
              ?.closest?.(`[${ASSISTANT_GUIDED_TOUR_TARGET_ATTR}]`)
              ?.getAttribute?.(ASSISTANT_GUIDED_TOUR_TARGET_ATTR) ||
            "",
          value: readInputValue(resolveInputElement(eventTarget)),
        },
        ...latestDebugStateRef.current,
        firstNames: readFirstNamesDebugSnapshot(),
        activeElement: readActiveElementDebugState(),
        stack: readDebugStack(),
      }));
      if (event?.isTrusted !== true) return;
      if (targetElement.isConnected !== true) return;
      if (!targetElement.contains(event.target)) return;
      if (contentAdvancedRef.current === transitionKey) return;
      contentAdvancedRef.current = transitionKey;
      logAssistantTourDebug("phase-request", () => ({
        source: "content-interaction",
        eventType: event?.type || "",
        eventIsTrusted: event?.isTrusted === true,
        fromPhase: phase,
        toPhase: ASSISTANT_GUIDED_TOUR_PHASES.NEXT,
        transitionKey,
        targetId,
        ...latestDebugStateRef.current,
        firstNames: readFirstNamesDebugSnapshot(),
        activeElement: readActiveElementDebugState(),
        stack: readDebugStack(),
      }));
      setPhase(ASSISTANT_GUIDED_TOUR_PHASES.NEXT);
      scrolledTargetRef.current = "";
    };

    targetElement.addEventListener("input", handleInteraction, true);
    targetElement.addEventListener("change", handleInteraction, true);
    targetElement.addEventListener("click", handleInteraction, true);
    return () => {
      logAssistantTourDebug("content-listeners-cleanup", () => ({
        transitionKey,
        targetId,
        target: readTargetDebugState(targetId),
        ...latestDebugStateRef.current,
        firstNames: readFirstNamesDebugSnapshot(),
        activeElement: readActiveElementDebugState(),
      }));
      targetElement.removeEventListener("input", handleInteraction, true);
      targetElement.removeEventListener("change", handleInteraction, true);
      targetElement.removeEventListener("click", handleInteraction, true);
    };
  }, [assistantPositionKey, canRenderTour, phase, sessionKey, targetElement]);

  useEffect(() => {
    if (
      !canRenderTour ||
      phase !== ASSISTANT_GUIDED_TOUR_PHASES.PREVIEW ||
      !targetElement
    ) {
      return undefined;
    }

    logAssistantTourDebug("preview-listener-subscribe", () => ({
      targetId,
      target: readTargetDebugState(targetId),
      ...latestDebugStateRef.current,
      firstNames: readFirstNamesDebugSnapshot(),
      activeElement: readActiveElementDebugState(),
    }));
    const complete = (event) => {
      logAssistantTourDebug("preview-click", () => ({
        eventType: event?.type || "",
        eventIsTrusted: event?.isTrusted === true,
        targetId,
        target: readTargetDebugState(targetId),
        ...latestDebugStateRef.current,
        firstNames: readFirstNamesDebugSnapshot(),
        activeElement: readActiveElementDebugState(),
        stack: readDebugStack(),
      }));
      logAssistantTourDebug("phase-request", () => ({
        source: "preview-click",
        eventType: event?.type || "",
        eventIsTrusted: event?.isTrusted === true,
        fromPhase: phase,
        toPhase: ASSISTANT_GUIDED_TOUR_PHASES.COMPLETE,
        targetId,
        ...latestDebugStateRef.current,
        firstNames: readFirstNamesDebugSnapshot(),
        activeElement: readActiveElementDebugState(),
        stack: readDebugStack(),
      }));
      setCompletedSessionKey(sessionKey);
      setPhase(ASSISTANT_GUIDED_TOUR_PHASES.COMPLETE);
    };

    targetElement.addEventListener("click", complete, true);
    return () => {
      logAssistantTourDebug("preview-listener-cleanup", () => ({
        targetId,
        target: readTargetDebugState(targetId),
        ...latestDebugStateRef.current,
        firstNames: readFirstNamesDebugSnapshot(),
        activeElement: readActiveElementDebugState(),
      }));
      targetElement.removeEventListener("click", complete, true);
    };
  }, [canRenderTour, phase, sessionKey, targetElement]);

  useEffect(() => {
    if (isPreviewOpen !== true) return;
    if (phase !== ASSISTANT_GUIDED_TOUR_PHASES.PREVIEW) return;
    logAssistantTourDebug("phase-request", () => ({
      source: "preview-open",
      fromPhase: phase,
      toPhase: ASSISTANT_GUIDED_TOUR_PHASES.COMPLETE,
      draftKey,
      sessionKey,
      openingKey,
      assistantPositionKey,
      firstNames: readFirstNamesDebugSnapshot(),
      activeElement: readActiveElementDebugState(),
      stack: readDebugStack(),
    }));
    setCompletedSessionKey(sessionKey);
    setPhase(ASSISTANT_GUIDED_TOUR_PHASES.COMPLETE);
  }, [isPreviewOpen, phase, sessionKey]);

  const handleClose = useCallback(() => {
    logAssistantTourDebug("manual-close", () => ({
      draftKey,
      sessionKey,
      openingKey,
      phase,
      targetId,
      assistantPositionKey,
      firstNames: readFirstNamesDebugSnapshot(),
      activeElement: readActiveElementDebugState(),
    }));
    closeAssistantGuidedTourSession({});
    setClosedSessionKey(sessionKey);
  }, [assistantPositionKey, draftKey, openingKey, phase, sessionKey, targetId]);

  const handlePreferenceChange = useCallback(
    (event) => {
      const checked = event.target.checked === true;
      setPreferenceError("");
      logAssistantTourDebug("preference-change", () => ({
        assistantTourOptOut: checked,
        draftKey,
        sessionKey,
        openingKey,
        phase,
        targetId,
        assistantPositionKey,
        firstNames: readFirstNamesDebugSnapshot(),
        activeElement: readActiveElementDebugState(),
      }));
      if (typeof onAssistantTourPreferenceChange !== "function") return;

      void onAssistantTourPreferenceChange(
        createAssistantGuidedTourPreferencePatch({
          assistantTourOptOut: checked,
        })
      ).catch(() => {
        setPreferenceError("No se pudo guardar la preferencia.");
      });
    },
    [
      assistantPositionKey,
      draftKey,
      onAssistantTourPreferenceChange,
      openingKey,
      phase,
      sessionKey,
      targetId,
    ]
  );

  if (!mounted || !canRenderTour || !targetRect) return null;

  const mobileTourViewport = isMobileTourViewport(viewportSnapshot);
  const actionTarget = isAssistantTourActionTarget(targetId);
  const targetPadding = mobileTourViewport
    ? MOBILE_TARGET_PADDING_PX
    : TARGET_PADDING_PX;
  const tooltipGap = mobileTourViewport
    ? MOBILE_TOOLTIP_GAP_PX
    : TOOLTIP_GAP_PX;
  const viewportMargin = mobileTourViewport
    ? MOBILE_VIEWPORT_MARGIN_PX
    : VIEWPORT_MARGIN_PX;
  const mobileTooltipMaxWidth = actionTarget
    ? MOBILE_ACTION_TOOLTIP_WIDTH_PX
    : MOBILE_FIELD_TOOLTIP_WIDTH_PX;
  const effectiveTooltipSize = mobileTourViewport
    ? {
        width: Math.min(
          tooltipSize.width || FALLBACK_TOOLTIP_WIDTH_PX,
          mobileTooltipMaxWidth
        ),
        height: tooltipSize.height || FALLBACK_TOOLTIP_HEIGHT_PX,
      }
    : tooltipSize;
  const placementPriority = mobileTourViewport
    ? actionTarget
      ? MOBILE_ACTION_PLACEMENT_PRIORITY
      : MOBILE_FIELD_PLACEMENT_PRIORITY
    : undefined;
  const avoidRects = mobileTourViewport
    ? readMobileTourAvoidRects({
        targetId,
        targetElement,
        previousTargetId: previousEditedTargetIdRef.current,
      })
    : [];
  const positioningViewport = mobileTourViewport
    ? resolveMobileTourPositioningViewport({
        viewport: viewportSnapshot,
        targetId,
        targetElement,
      })
    : viewportSnapshot;

  const paddedRect = {
    left: targetRect.left - targetPadding,
    top: targetRect.top - targetPadding,
    width: targetRect.width + targetPadding * 2,
    height: targetRect.height + targetPadding * 2,
  };
  const tooltipPosition = resolveAssistantGuidedTourTooltipPosition({
    targetRect: paddedRect,
    tooltipSize: effectiveTooltipSize,
    viewport: positioningViewport,
    margin: viewportMargin,
    gap: tooltipGap,
    placementPriority,
    preferredPlacement: mobileTourViewport
      ? lastMobileTooltipPlacementRef.current
      : "",
    avoidRects,
    minWidth: mobileTourViewport ? MOBILE_TOOLTIP_MIN_WIDTH_PX : undefined,
    minHeight: mobileTourViewport ? MOBILE_TOOLTIP_MIN_HEIGHT_PX : undefined,
  });
  if (mobileTourViewport) {
    lastMobileTooltipPlacementRef.current = tooltipPosition.placement || "";
  } else {
    lastMobileTooltipPlacementRef.current = "";
  }
  const tooltipStyle = {
    left: `${tooltipPosition.left}px`,
    top: `${tooltipPosition.top}px`,
    width: `${tooltipPosition.width}px`,
    maxHeight:
      tooltipPosition.maxHeight &&
      tooltipPosition.maxHeight <
        effectiveTooltipSize.height - TOUR_MEASUREMENT_TOLERANCE_PX
      ? `${tooltipPosition.maxHeight}px`
      : undefined,
    "--tour-arrow-offset": `${tooltipPosition.arrowOffset}px`,
  };
  const spotlightStyle = {
    left: `${paddedRect.left}px`,
    top: `${paddedRect.top}px`,
    width: `${paddedRect.width}px`,
    height: `${paddedRect.height}px`,
  };

  return createPortal(
    <div className={styles.root} aria-live="polite">
      <div className={styles.spotlight} style={spotlightStyle} />
      <section
        ref={tooltipRef}
        className={styles.tooltip}
        style={tooltipStyle}
        role="group"
        aria-label="Visita guiada del Asistente"
      >
        <span
          className={`${styles.arrow} ${resolveArrowClass(tooltipPosition.placement)}`}
          aria-hidden="true"
        />
        <div className={styles.tooltipHeader}>
          <span className={styles.progress}>
            {assistantProgressLabel || "1/1"}
          </span>
          <button
            type="button"
            className={styles.closeButton}
            onClick={handleClose}
            aria-label="Cerrar visita guiada"
            title="Cerrar"
          >
            <X size={17} strokeWidth={2} aria-hidden="true" />
          </button>
        </div>
        <p className={styles.message}>{message}</p>
        <label className={styles.preference}>
          <input
            type="checkbox"
            checked={assistantTourOptOut === true}
            disabled={assistantTourSaving === true}
            onChange={handlePreferenceChange}
          />
          <span>No volver a mostrar</span>
        </label>
        {preferenceError ? (
          <p className={styles.message} role="alert">
            {preferenceError}
          </p>
        ) : null}
      </section>
    </div>,
    document.body
  );
}
