import { useEffect, useRef, useState } from "react";
import HorizontalRail from "@/components/dashboard/home/HorizontalRail";

const TEMPLATE_ITEM_WIDTH_CLASS = "w-[220px] shrink-0 sm:w-[236px] lg:w-[248px] xl:w-[258px]";

export default function InfiniteTemplateRail({
  items,
  renderItem,
  getItemKey,
  itemWidthClass = TEMPLATE_ITEM_WIDTH_CLASS,
}) {
  const safeItems = Array.isArray(items) ? items : [];
  const viewportRef = useRef(null);
  const centerSegmentRef = useRef(null);
  const segmentWidthRef = useRef(0);
  const [canLoop, setCanLoop] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const measure = () => {
      const segmentWidth = centerSegmentRef.current?.scrollWidth || 0;
      const viewportWidth = viewportRef.current?.clientWidth || 0;
      const shouldLoop = safeItems.length > 1 && segmentWidth > viewportWidth + 24;

      segmentWidthRef.current = segmentWidth;
      setCanLoop(shouldLoop);

      window.requestAnimationFrame(() => {
        if (!viewportRef.current) return;
        viewportRef.current.scrollLeft = shouldLoop ? segmentWidth : 0;
      });
    };

    measure();

    if (typeof ResizeObserver === "undefined") return undefined;

    const observer = new ResizeObserver(() => {
      measure();
    });

    if (viewportRef.current) observer.observe(viewportRef.current);
    if (centerSegmentRef.current) observer.observe(centerSegmentRef.current);

    return () => observer.disconnect();
  }, [safeItems]);

  const handleScroll = () => {
    if (!canLoop) return;

    const viewportNode = viewportRef.current;
    const segmentWidth = segmentWidthRef.current;
    if (!viewportNode || !segmentWidth) return;

    if (viewportNode.scrollLeft <= segmentWidth * 0.5) {
      viewportNode.scrollLeft += segmentWidth;
      return;
    }

    if (viewportNode.scrollLeft >= segmentWidth * 1.5) {
      viewportNode.scrollLeft -= segmentWidth;
    }
  };

  const renderSegment = (segmentId, ref = null) => (
    <div ref={ref} className="flex gap-4">
      {safeItems.map((item, index) => {
        const itemKey =
          typeof getItemKey === "function"
            ? getItemKey(item, index)
            : `${segmentId}-${index}`;
        return (
          <div key={`${segmentId}-${itemKey}`} className={itemWidthClass}>
            {renderItem(item, index)}
          </div>
        );
      })}
    </div>
  );

  if (!safeItems.length) return null;

  return (
    <HorizontalRail
      viewportRef={viewportRef}
      onScroll={handleScroll}
      trackClassName={canLoop ? "gap-0" : ""}
    >
      {canLoop ? (
        <>
          {renderSegment("leading")}
          {renderSegment("center", centerSegmentRef)}
          {renderSegment("trailing")}
        </>
      ) : (
        renderSegment("center", centerSegmentRef)
      )}
    </HorizontalRail>
  );
}
