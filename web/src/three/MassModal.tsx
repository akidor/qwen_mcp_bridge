import { useEffect, useState } from "react";
import { SceneViewer, type LayerVisibility } from "./scene-viewer";
import type { SceneData } from "./scene-types";

interface Props {
  open: boolean;
  onClose: () => void;
  sceneData: SceneData | null;
  defaultCandidateId?: string;
}

const DEFAULT_LAYERS: LayerVisibility = {
  site: { visible: true, opacity: 1 },
  buildable: { visible: true, opacity: 1 },
  neighbors: { visible: true, opacity: 1 },
  nearbyBuildings: { visible: true, opacity: 1 },
  building: { visible: true, opacity: 1 },
  northSlope: { visible: true, opacity: 1 },
  terrain: { visible: true, opacity: 1 },
  parcelMap: { visible: false, opacity: 1 },
  zoningMap: { visible: false, opacity: 1 },
  roads: { visible: true, opacity: 1 },
  edgeDims: { visible: false, opacity: 1 },
  floorDims: { visible: false, opacity: 1 },
  slopeDims: { visible: false, opacity: 1 },
  setbackDims: { visible: false, opacity: 1 },
  labelAlwaysOnTop: { visible: true, opacity: 1 },
  parking: { visible: true, opacity: 1 },
  colDistances: { visible: false, opacity: 1 },
  basement: { visible: true, opacity: 1 },
};

export default function MassModal({ open, onClose, sceneData, defaultCandidateId }: Props) {
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(
    defaultCandidateId ?? null
  );

  useEffect(() => {
    if (open && defaultCandidateId) setSelectedCandidateId(defaultCandidateId);
  }, [open, defaultCandidateId]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open || !sceneData) return null;

  const candidates = sceneData.candidates ?? [];

  return (
    <>
      <div className="mass-modal-backdrop" onClick={onClose} aria-hidden="true" />
      <div className="mass-modal" role="dialog" aria-modal="true">
        <div className="mass-modal-header">
          <div className="mass-modal-chips">
            {candidates.map((c) => (
              <button
                key={c.id}
                className={`mass-chip${selectedCandidateId === c.id ? " active" : ""}`}
                onClick={() => setSelectedCandidateId(c.id)}
              >
                {c.id} · {c.typology}
              </button>
            ))}
          </div>
          <button className="mass-modal-close" onClick={onClose} aria-label="닫기">✕</button>
        </div>
        <div className="mass-modal-body">
          <SceneViewer
            sceneData={sceneData}
            selectedCandidateId={selectedCandidateId}
            layers={DEFAULT_LAYERS}
          />
        </div>
      </div>
    </>
  );
}
