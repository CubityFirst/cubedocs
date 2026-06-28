import { useEffect, useRef } from "react";

interface SwipeOptions {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  threshold?: number;
}

// A horizontal swipe should drive the sidebar only over plain content - not
// when it starts inside a region that consumes horizontal drags itself (a
// horizontally-scrollable element like the font-picker table, breadcrumb bar,
// wide tables, code blocks) or anything that explicitly opts out via
// `data-no-swipe`. Otherwise scrolling those sideways also toggles the sidebar.
function startsInSwipeExemptRegion(target: EventTarget | null): boolean {
  let el = target instanceof Element ? target : null;
  while (el && el !== document.body) {
    if (el.hasAttribute("data-no-swipe")) return true;
    const overflowX = window.getComputedStyle(el).overflowX;
    if ((overflowX === "auto" || overflowX === "scroll") && el.scrollWidth > el.clientWidth) {
      return true;
    }
    el = el.parentElement;
  }
  return false;
}

export function useSwipeGesture({ onSwipeLeft, onSwipeRight, threshold = 50 }: SwipeOptions) {
  const startX = useRef(0);
  const startY = useRef(0);
  const lastX = useRef(0);
  const lastY = useRef(0);
  const exempt = useRef(false);
  const leftRef = useRef(onSwipeLeft);
  const rightRef = useRef(onSwipeRight);

  leftRef.current = onSwipeLeft;
  rightRef.current = onSwipeRight;

  useEffect(() => {
    function onTouchStart(e: TouchEvent) {
      startX.current = e.touches[0].clientX;
      startY.current = e.touches[0].clientY;
      lastX.current = e.touches[0].clientX;
      lastY.current = e.touches[0].clientY;
      // Decide once, at gesture start, whether this touch is over a region
      // that owns horizontal dragging - if so, never treat it as a sidebar swipe.
      exempt.current = startsInSwipeExemptRegion(e.target);
    }

    function onTouchMove(e: TouchEvent) {
      lastX.current = e.touches[0].clientX;
      lastY.current = e.touches[0].clientY;
    }

    function evaluate(clientX: number, clientY: number) {
      if (exempt.current) return;
      const dx = clientX - startX.current;
      const dy = clientY - startY.current;
      if (Math.abs(dx) < threshold || Math.abs(dx) < Math.abs(dy)) return;
      if (dx < 0) leftRef.current?.();
      else rightRef.current?.();
    }

    function onTouchEnd(e: TouchEvent) {
      evaluate(e.changedTouches[0].clientX, e.changedTouches[0].clientY);
    }

    // When the browser cancels a touch (e.g. it claimed the gesture for native
    // scrolling), changedTouches may be empty - fall back to the last tracked position.
    function onTouchCancel(e: TouchEvent) {
      const x = e.changedTouches[0]?.clientX ?? lastX.current;
      const y = e.changedTouches[0]?.clientY ?? lastY.current;
      evaluate(x, y);
    }

    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchmove", onTouchMove, { passive: true });
    document.addEventListener("touchend", onTouchEnd, { passive: true });
    document.addEventListener("touchcancel", onTouchCancel, { passive: true });
    return () => {
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", onTouchEnd);
      document.removeEventListener("touchcancel", onTouchCancel);
    };
  }, [threshold]);
}
