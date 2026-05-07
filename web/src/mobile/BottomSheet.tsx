import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";

interface Props {
  open: boolean;
  onClose: () => void;
  snapVh?: number;
  children: ReactNode;
}

const DEFAULT_SNAP = 60;
const EXPANDED_SNAP = 90;
const CLOSE_THRESHOLD_VH = 25;

export default function BottomSheet({ open, onClose, snapVh = DEFAULT_SNAP, children }: Props) {
  const [translateY, setTranslateY] = useState(100);
  const [dragging, setDragging] = useState(false);
  const dragStartRef = useRef<{ y: number; baseTranslate: number } | null>(null);

  useEffect(() => {
    if (open) {
      setTranslateY(100 - snapVh);
    } else {
      setTranslateY(100);
    }
  }, [open, snapVh]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  function vhFromPx(px: number): number {
    return (px / window.innerHeight) * 100;
  }

  function handlePointerDown(e: PointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragStartRef.current = { y: e.clientY, baseTranslate: translateY };
    setDragging(true);
  }

  function handlePointerMove(e: PointerEvent<HTMLDivElement>) {
    if (!dragStartRef.current) return;
    const deltaPx = e.clientY - dragStartRef.current.y;
    const deltaVh = vhFromPx(deltaPx);
    const next = Math.max(100 - EXPANDED_SNAP, Math.min(100, dragStartRef.current.baseTranslate + deltaVh));
    setTranslateY(next);
  }

  function handlePointerUp() {
    if (!dragStartRef.current) return;
    const traveled = translateY - dragStartRef.current.baseTranslate;
    dragStartRef.current = null;
    setDragging(false);
    if (traveled > CLOSE_THRESHOLD_VH) {
      onClose();
      return;
    }
    // snap
    const showHeight = 100 - translateY;
    if (showHeight > (snapVh + EXPANDED_SNAP) / 2) {
      setTranslateY(100 - EXPANDED_SNAP);
    } else if (showHeight < snapVh / 2) {
      onClose();
    } else {
      setTranslateY(100 - snapVh);
    }
  }

  if (!open && translateY >= 100) return null;

  return (
    <>
      <div
        className={`bs-dim${open ? " visible" : ""}`}
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className={`bottom-sheet${dragging ? " dragging" : ""}`}
        style={{ transform: `translateY(${translateY}vh)` }}
        role="dialog"
        aria-modal="true"
      >
        <div
          className="bs-handle"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          <div className="bs-handle-bar" />
        </div>
        <div className="bs-content">{children}</div>
      </div>
    </>
  );
}
