interface DebugTabProps {
  lastChunk: unknown;
}

export default function DebugTab({ lastChunk }: DebugTabProps) {
  return (
    <div className="debug-tab">
      <div className="field">
        <label>마지막 SSE chunk</label>
        <pre className="json-box">
          {lastChunk ? JSON.stringify(lastChunk, null, 2) : "응답 없음"}
        </pre>
      </div>
      <p style={{ fontSize: 11, color: "var(--fg-muted)", margin: 0 }}>
        활성 layer 토글·줌·차트는 좌상단 🗂️ 레이어 패널로 이전됨.
      </p>
    </div>
  );
}
