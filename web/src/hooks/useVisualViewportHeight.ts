import { useEffect, useState } from "react";

export interface ViewportInfo {
  height: number;
  isKeyboardOpen: boolean;
}

const KEYBOARD_THRESHOLD_PX = 100;

export function useVisualViewportHeight(): ViewportInfo {
  const [info, setInfo] = useState<ViewportInfo>(() => readViewport());

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = () => setInfo(readViewport());
    window.addEventListener("resize", handler);
    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", handler);
      window.visualViewport.addEventListener("scroll", handler);
    }
    return () => {
      window.removeEventListener("resize", handler);
      if (window.visualViewport) {
        window.visualViewport.removeEventListener("resize", handler);
        window.visualViewport.removeEventListener("scroll", handler);
      }
    };
  }, []);

  return info;
}

function readViewport(): ViewportInfo {
  if (typeof window === "undefined") return { height: 800, isKeyboardOpen: false };
  const inner = window.innerHeight;
  const vvHeight = window.visualViewport?.height ?? inner;
  const isKeyboardOpen = inner - vvHeight > KEYBOARD_THRESHOLD_PX;
  return { height: vvHeight, isKeyboardOpen };
}
