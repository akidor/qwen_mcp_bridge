import { useEffect, useRef, type ReactNode } from "react";

interface Props {
  mapSlot: ReactNode;
  mapBarSlot: ReactNode;
  chatSlot: ReactNode;
  isKeyboardOpen: boolean;
  visualViewportHeightPx: number;
}

export default function MobileLayout({
  mapSlot,
  mapBarSlot,
  chatSlot,
  isKeyboardOpen,
  visualViewportHeightPx,
}: Props) {
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (rootRef.current) {
      rootRef.current.style.setProperty("--vv-height", `${visualViewportHeightPx}px`);
    }
  }, [visualViewportHeightPx]);

  return (
    <div
      ref={rootRef}
      className={`mobile-layout${isKeyboardOpen ? " keyboard-open" : ""}`}
    >
      <div className="mobile-map-slot">
        {mapSlot}
        {mapBarSlot}
      </div>
      <div className="mobile-chat-slot">{chatSlot}</div>
    </div>
  );
}
