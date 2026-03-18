import { useEffect, useMemo, useState } from "react";

function normalizeText(value) {
  return String(value || "").trim();
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function resolveScale(stage, stageRect) {
  const stageWidth =
    typeof stage?.width === "function" ? Number(stage.width()) : Number(stage?.attrs?.width);
  const stageHeight =
    typeof stage?.height === "function" ? Number(stage.height()) : Number(stage?.attrs?.height);

  const x = Number.isFinite(stageWidth) && stageWidth > 0 ? stageRect.width / stageWidth : 1;
  const y = Number.isFinite(stageHeight) && stageHeight > 0 ? stageRect.height / stageHeight : 1;

  return {
    x: Number.isFinite(x) && x > 0 ? x : 1,
    y: Number.isFinite(y) && y > 0 ? y : 1,
  };
}

export default function TemplateFieldBadgeOverlay({
  layoutRootRef,
  stageRef,
  elementRefs,
  selectedElementId,
  hoveredElementId,
  fieldIndexByElementId,
  fieldsSchema,
  isMobile = false,
}) {
  const [runtimeDragActive, setRuntimeDragActive] = useState(false);
  const [badgeState, setBadgeState] = useState({
    visible: false,
    text: "",
    left: 0,
    top: 0,
  });

  const safeFieldIndexByElementId =
    fieldIndexByElementId && typeof fieldIndexByElementId === "object"
      ? fieldIndexByElementId
      : {};
  const safeFieldsSchema = Array.isArray(fieldsSchema) ? fieldsSchema : [];

  const fieldByKey = useMemo(() => {
    const map = new Map();
    safeFieldsSchema.forEach((field) => {
      const key = normalizeText(field?.key);
      if (!key) return;
      map.set(key, field);
    });
    return map;
  }, [safeFieldsSchema]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const syncDragState = () => {
      setRuntimeDragActive(Boolean(window._isDragging));
    };

    const onDragStart = () => setRuntimeDragActive(true);
    const onDragEnd = () => syncDragState();

    window.addEventListener("dragging-start", onDragStart);
    window.addEventListener("dragging-end", onDragEnd);
    syncDragState();

    return () => {
      window.removeEventListener("dragging-start", onDragStart);
      window.removeEventListener("dragging-end", onDragEnd);
    };
  }, []);

  useEffect(() => {
    const root = layoutRootRef?.current;
    if (!root || typeof window === "undefined") {
      setBadgeState((prev) => ({ ...prev, visible: false }));
      return undefined;
    }

    const sync = () => {
      if (runtimeDragActive) {
        setBadgeState((prev) =>
          prev.visible ? { ...prev, visible: false } : prev
        );
        return;
      }

      const candidateIds = [normalizeText(selectedElementId), normalizeText(hoveredElementId)].filter(Boolean);
      const candidateId = candidateIds.find(
        (id) => normalizeText(safeFieldIndexByElementId[id])
      );
      if (!candidateId) {
        setBadgeState((prev) =>
          prev.visible ? { ...prev, visible: false } : prev
        );
        return;
      }

      const fieldKey = normalizeText(safeFieldIndexByElementId[candidateId]);
      const field = fieldByKey.get(fieldKey);
      if (!field) {
        setBadgeState((prev) =>
          prev.visible ? { ...prev, visible: false } : prev
        );
        return;
      }

      const stage = stageRef?.current?.getStage?.() || stageRef?.current;
      const stageContainer =
        stage && typeof stage.container === "function" ? stage.container() : null;
      const node = elementRefs?.current?.[candidateId];
      if (!stage || !stageContainer || !node || typeof node.getClientRect !== "function") {
        setBadgeState((prev) =>
          prev.visible ? { ...prev, visible: false } : prev
        );
        return;
      }

      try {
        const rootRect = root.getBoundingClientRect();
        const stageRect = stageContainer.getBoundingClientRect();
        const box = node.getClientRect({
          relativeTo: stage,
          skipShadow: true,
        });
        const scale = resolveScale(stage, stageRect);
        const rawLeft = stageRect.left + box.x * scale.x + 8;
        const rawTop = stageRect.top + box.y * scale.y - (isMobile ? 24 : 20);
        const badgeWidth = isMobile ? 180 : 220;
        const badgeHeight = isMobile ? 24 : 22;

        const left = clamp(rawLeft - rootRect.left, 4, Math.max(4, rootRect.width - badgeWidth - 4));
        const top = clamp(rawTop - rootRect.top, 4, Math.max(4, rootRect.height - badgeHeight - 4));

        const label = normalizeText(field?.label) || fieldKey;
        setBadgeState({
          visible: true,
          text: `Campo: ${label}`,
          left,
          top,
        });
      } catch {
        setBadgeState((prev) =>
          prev.visible ? { ...prev, visible: false } : prev
        );
      }
    };

    sync();

    const handle = () => sync();
    window.addEventListener("resize", handle);
    window.addEventListener("scroll", handle, true);
    const onElementRefRegistered = () => sync();
    window.addEventListener("element-ref-registrado", onElementRefRegistered);

    return () => {
      window.removeEventListener("resize", handle);
      window.removeEventListener("scroll", handle, true);
      window.removeEventListener("element-ref-registrado", onElementRefRegistered);
    };
  }, [
    elementRefs,
    fieldByKey,
    hoveredElementId,
    isMobile,
    layoutRootRef,
    safeFieldIndexByElementId,
    selectedElementId,
    stageRef,
    runtimeDragActive,
  ]);

  if (!badgeState.visible) return null;

  return (
    <div
      className="pointer-events-none absolute z-[65] max-w-[220px] rounded-md border border-violet-300 bg-violet-600/95 px-2 py-1 text-[11px] font-medium text-white shadow-lg"
      style={{
        left: `${badgeState.left}px`,
        top: `${badgeState.top}px`,
        backdropFilter: "blur(2px)",
      }}
    >
      {badgeState.text}
    </div>
  );
}
