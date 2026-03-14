import { useRef } from "react";

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

  const handleViewportRef = (node) => {
    localViewportRef.current = node;
    setResolvedRef(viewportRef, node);
  };

  const handleWheel = (event) => {
    const viewportNode = localViewportRef.current;
    if (!viewportNode) return;

    const hasHorizontalOverflow = viewportNode.scrollWidth > viewportNode.clientWidth + 8;
    if (!hasHorizontalOverflow) return;
    if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;

    event.preventDefault();
    viewportNode.scrollLeft += event.deltaY;
  };

  return (
    <div className={`relative ${className}`}>
      <div
        ref={handleViewportRef}
        onScroll={onScroll}
        onWheel={handleWheel}
        className="overflow-x-auto overflow-y-hidden pb-3 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <div className={`flex gap-4 ${trackClassName}`}>{children}</div>
      </div>
      <div className="pointer-events-none absolute inset-y-0 left-0 hidden w-10 bg-gradient-to-r from-white via-white/92 to-transparent lg:block" />
      <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-10 bg-gradient-to-l from-white via-white/92 to-transparent lg:block" />
    </div>
  );
}
