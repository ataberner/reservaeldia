import { useEffect, useState } from "react";

export default function useIsTouchLike(forceMobile = false) {
  const [isTouchLike, setIsTouchLike] = useState(Boolean(forceMobile));

  useEffect(() => {
    if (typeof window === "undefined") return;

    const mqCoarse = window.matchMedia("(pointer: coarse)");
    const mqTablet = window.matchMedia("(max-width: 1024px)");

    const update = () => {
      const hasTouchSupport =
        "ontouchstart" in window || navigator.maxTouchPoints > 0;
      setIsTouchLike(Boolean(forceMobile) || mqCoarse.matches || (mqTablet.matches && hasTouchSupport));
    };

    update();
    mqCoarse.addEventListener?.("change", update);
    mqTablet.addEventListener?.("change", update);
    window.addEventListener("orientationchange", update);

    return () => {
      mqCoarse.removeEventListener?.("change", update);
      mqTablet.removeEventListener?.("change", update);
      window.removeEventListener("orientationchange", update);
    };
  }, [forceMobile]);

  return isTouchLike;
}
