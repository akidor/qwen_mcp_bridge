declare global {
  interface Window {
    kakao: any;
  }
}

const SDK_BASE = "https://dapi.kakao.com/v2/maps/sdk.js";
let sdkLoadPromise: Promise<void> | null = null;

export const KAKAO_JS_KEY: string = import.meta.env.VITE_KAKAO_JAVASCRIPT_KEY ?? "";

export function loadKakaoSdk(appkey: string): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if (window.kakao && window.kakao.maps && typeof window.kakao.maps.Map === "function") {
    return Promise.resolve();
  }
  if (sdkLoadPromise) return sdkLoadPromise;
  sdkLoadPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `${SDK_BASE}?appkey=${encodeURIComponent(appkey)}&autoload=false`;
    script.async = true;
    script.onload = () => {
      const k = window.kakao;
      if (!k || !k.maps) {
        sdkLoadPromise = null;
        reject(new Error("Kakao SDK loaded but kakao.maps unavailable"));
        return;
      }
      k.maps.load(() => resolve());
    };
    script.onerror = () => {
      sdkLoadPromise = null;
      reject(new Error("Kakao SDK script load failed"));
    };
    document.head.appendChild(script);
  });
  return sdkLoadPromise;
}

/**
 * MapLibre zoom (0~22) ↔ Kakao Map level (1=가까움, 14=멀음) 근사 매핑.
 * - kakao L1 ≈ 20m/px, L14 ≈ 16km/px
 * - ml z18 ≈ 0.6m/px (적도), z6 ≈ 2.4km/px
 * - 단순 선형: kakaoLv = clamp(round(20 - z), 1, 14)
 */
export function mapLibreZoomToKakaoLevel(z: number): number {
  return Math.max(1, Math.min(14, Math.round(20 - z)));
}

export interface KakaoMapHandle {
  setView(lng: number, lat: number, mlZoom: number): void;
  resize(): void;
  destroy(): void;
}

export function createKakaoMap(
  container: HTMLElement,
  lng: number,
  lat: number,
  mlZoom: number,
): KakaoMapHandle {
  const k = window.kakao;
  const map = new k.maps.Map(container, {
    center: new k.maps.LatLng(lat, lng),
    level: mapLibreZoomToKakaoLevel(mlZoom),
    draggable: false,
    scrollwheel: false,
    disableDoubleClick: true,
    disableDoubleClickZoom: true,
    keyboardShortcuts: false,
    zoomable: false,
  });
  return {
    setView(nextLng, nextLat, nextZoom) {
      map.setCenter(new k.maps.LatLng(nextLat, nextLng));
      map.setLevel(mapLibreZoomToKakaoLevel(nextZoom));
    },
    resize() {
      map.relayout();
    },
    destroy() {
      // Kakao SDK는 명시적 destroy가 없음 — 컨테이너 비우면 GC 대상.
      while (container.firstChild) container.removeChild(container.firstChild);
    },
  };
}
