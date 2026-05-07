import type { ReactNode } from "react";

interface Props {
  mode: "layer" | "settings" | "debug" | null;
  layerSlot: ReactNode;
  settingsSlot: ReactNode;
  debugSlot: ReactNode;
}

export default function BottomSheetContent({ mode, layerSlot, settingsSlot, debugSlot }: Props) {
  if (mode === "layer") return <div className="bs-pane">{layerSlot}</div>;
  if (mode === "settings") return <div className="bs-pane">{settingsSlot}</div>;
  if (mode === "debug") return <div className="bs-pane">{debugSlot}</div>;
  return null;
}
