import { useEffect, useRef, useState } from "react";
import {
  loadKakaoSdk,
  createKakaoMap,
  KAKAO_JS_KEY,
  type KakaoMapHandle,
} from "./kakao_basemap";

interface Props {
  map: any | null;
  visible: boolean;
}

export default function KakaoBaseMap({ map, visible }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const handleRef = useRef<KakaoMapHandle | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible || !map || !containerRef.current) return;
    if (!KAKAO_JS_KEY) {
      setError("VITE_KAKAO_JAVASCRIPT_KEY 미설정 — .env.local 추가 필요");
      return;
    }
    let disposed = false;
    let detach: (() => void) | null = null;

    loadKakaoSdk(KAKAO_JS_KEY)
      .then(() => {
        if (disposed || !containerRef.current) return;
        const center = map.getCenter();
        const zoom = map.getZoom();
        const handle = createKakaoMap(containerRef.current, center.lng, center.lat, zoom);
        handleRef.current = handle;
        // 처음 토글 켰을 때 컨테이너 사이즈 잡힘 → relayout
        requestAnimationFrame(() => handle.resize());

        const onMove = () => {
          if (!handleRef.current) return;
          const c = map.getCenter();
          handleRef.current.setView(c.lng, c.lat, map.getZoom());
        };
        map.on("move", onMove);
        map.on("zoom", onMove);
        detach = () => {
          map.off("move", onMove);
          map.off("zoom", onMove);
        };
        setError(null);
      })
      .catch((e: unknown) => {
        const msg = e instanceof Error ? e.message : String(e);
        if (!disposed) setError(`Kakao SDK 로드 실패: ${msg}`);
      });

    return () => {
      disposed = true;
      if (detach) detach();
      if (handleRef.current) {
        handleRef.current.destroy();
        handleRef.current = null;
      }
    };
  }, [visible, map]);

  return (
    <>
      <div
        ref={containerRef}
        className="kakao-basemap-layer"
        style={{ display: visible ? "block" : "none" }}
      />
      {visible && error && (
        <div className="kakao-basemap-error">{error}</div>
      )}
    </>
  );
}
