import { useEffect } from "react";
import { ChartSpec, FullChart } from "./auto_chart";

interface ChartModalProps {
  spec: ChartSpec | null;
  onClose: () => void;
}

export default function ChartModal({ spec, onClose }: ChartModalProps) {
  useEffect(() => {
    if (!spec) return;
    function handleEsc(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [spec, onClose]);

  if (!spec) return null;

  return (
    <div className="chart-modal-backdrop" onClick={onClose}>
      <div className="chart-modal" onClick={(e) => e.stopPropagation()}>
        <button className="chart-modal-close" onClick={onClose} aria-label="닫기">
          ×
        </button>
        <FullChart spec={spec} />
      </div>
    </div>
  );
}
