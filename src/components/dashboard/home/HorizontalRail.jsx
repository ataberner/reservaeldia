import { useCallback, useEffect, useRef, useState } from "react";

function setResolvedRef(ref, value) {
  if (!ref) return;
  if (typeof ref === "function") {
    ref(value);
    return;
  }
  ref.current = value;
}

export default function HorizontalRail({
  children,
  viewportRef = null,
  className = "",
  trackClassName = "",
  onScroll,
}) {
  const localViewportRef = useRef(null);
  const [viewportNode, setViewportNode] = useState(null);

  const handleViewportRef = useCallback((node) => {
    localViewportRef.current = node;
    setViewportNode(node);
    setResolvedRef(viewportRef, node);
  }, [viewportRef]);

  useEffect(() => {
    if (!viewportNode) return undefined;

    const handleWheel = (event) => {
      const activeViewportNode = localViewportRef.current;
      if (!activeViewportNode) return;

      const hasHorizontalOverflow =
        activeViewportNode.scrollWidth > activeViewportNode.clientWidth + 8;
      if (!hasHorizontalOverflow) return;
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;

      if (event.cancelable) {
        event.preventDefault();
      }
      activeViewportNode.scrollLeft += event.deltaY;
    };

    viewportNode.addEventListener("wheel", handleWheel, { passive: false });

    return () => {
      viewportNode.removeEventListener("wheel", handleWheel);
    };
  }, [viewportNode]);

  return (
    <div className={`relative ${className}`}>
      <div
        ref={handleViewportRef}
        onScroll={onScroll}
        className="-mt-3 overflow-x-auto overflow-y-hidden pb-3 pt-3 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <div className={`flex gap-4 ${trackClassName}`}>{children}</div>
      </div>
      <div className="pointer-events-none absolute inset-y-0 left-0 hidden w-10 bg-gradient-to-r from-white via-white/92 to-transparent lg:block" />
      <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-10 bg-gradient-to-l from-white via-white/92 to-transparent lg:block" />
    </div>
  );
}
