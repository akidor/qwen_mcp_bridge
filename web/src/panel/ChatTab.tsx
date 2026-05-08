import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { getChartSpec, MiniChart, ChartSpec } from "../charts/auto_chart";
import ChartModal from "../charts/ChartModal";
import MassModal from "../three/MassModal";
import type { SceneData } from "../three/scene-types";

type ChatRole = "user" | "assistant" | "system";

type ToolEvent =
  | { kind: "start"; name: string; argsPreview: string }
  | {
      kind: "end";
      name: string;
      durationMs: number;
      resultSize: number;
      error: boolean;
      resultText?: string;
      sceneData?: SceneData;
      sceneCandidates?: Array<{
        id: string;
        typology: string;
        metrics: { floors: number; height: number; gfa: number; far: number; bcr: number };
      }>;
    };

type ChatMessage = {
  role: ChatRole;
  content: string;
  reasoning?: string;
  toolEvents?: ToolEvent[];
  toolsExpanded?: boolean;
};

interface ChatTabProps {
  model: string;
  systemPrompt: string;
  disableThinking: boolean;
  onLastChunk?: (chunk: unknown) => void;
  onToolResult?: (toolName: string, resultText: string) => void;  // T5에서 사용
  drawnFeatures?: { id: string; geometry: GeoJSON.Geometry; label: string; ts?: number }[];
  mode?: "desktop" | "mobile";
  onUiAction?: (action: string, params: any) => void;
  wmsLeafLabels?: string[];
}

export default function ChatTab({ model, systemPrompt, disableThinking, onLastChunk, onToolResult, drawnFeatures = [], mode = "desktop", onUiAction, wmsLeafLabels = [] }: ChatTabProps) {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "assistant", content: "준비됨. 자연어로 질의하거나 `/도움말`로 슬래시 명령을 확인하세요." },
  ]);
  const [isSending, setIsSending] = useState(false);
  const [modalSpec, setModalSpec] = useState<ChartSpec | null>(null);
  const [massModal, setMassModal] = useState<{ sceneData: SceneData; defaultCandidateId?: string } | null>(null);
  const [autocompleteOpen, setAutocompleteOpen] = useState(false);
  const [autocompleteIdx, setAutocompleteIdx] = useState(0);
  const composerFormRef = useRef<HTMLFormElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const messageListRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  // 사용자가 위로 스크롤한 상태인지 추적. streaming 중 smooth 애니메이션 누적으로 viewport가
  // distance > 120 영역에 밀려 자동 스크롤이 끊기는 회귀 방지.
  const userNearBottomRef = useRef(true);

  function handleListScroll() {
    const el = messageListRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    userNearBottomRef.current = distance < 120;
  }

  useEffect(() => {
    // 모바일은 column-reverse로 새 메시지가 자동으로 composer 직하에 등장 — 자동 스크롤 불필요.
    if (mode === "mobile") return;
    if (!userNearBottomRef.current) return;
    // 데스크톱은 시간순(맨 아래가 최신) — behavior:"auto"로 smooth 큐 누적 없이 즉시 하단 고정.
    messagesEndRef.current?.scrollIntoView({ behavior: "auto" });
  }, [messages, mode]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const prompt = input.trim();
    if (!prompt || isSending) return;

    if (prompt.startsWith("/")) {
      const r = parseSlashCommand(prompt, wmsLeafLabels);
      if (r === "help") {
        setMessages((cur) => [
          ...cur,
          { role: "user", content: prompt },
          { role: "assistant", content: HELP_MESSAGE },
        ]);
      } else if (r) {
        onUiAction?.(r.name, r.params);
        setMessages((cur) => [
          ...cur,
          { role: "user", content: prompt },
          { role: "assistant", content: `[UI] ${r.summary}` },
        ]);
      } else {
        setMessages((cur) => [
          ...cur,
          { role: "user", content: prompt },
          { role: "assistant", content: "[UI] 알 수 없는 슬래시 명령. /도움말 로 목록 확인." },
        ]);
      }
      setInput("");
      if (textareaRef.current) textareaRef.current.style.height = "auto";
      setAutocompleteOpen(false);
      return;
    }

    const baseMessages = [...messages, { role: "user" as const, content: prompt }];
    setMessages(baseMessages);
    setInput("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
    setIsSending(true);

    collapsePreviousAssistantTools();

    const assistantIdx = baseMessages.length;
    setMessages((current) => [
      ...current,
      { role: "assistant", content: "", reasoning: "", toolEvents: [], toolsExpanded: false },
    ]);

    const requestMessages: Array<{ role: ChatRole; content: string }> = [];
    if (systemPrompt.trim()) requestMessages.push({ role: "system", content: systemPrompt.trim() });
    requestMessages.push(
      ...baseMessages.filter((m) => m.role !== "system").map((m) => ({ role: m.role, content: m.content }))
    );

    const payload: Record<string, unknown> = {
      model,
      messages: requestMessages,
      stream: true,
      temperature: 0.7,
    };
    if (disableThinking) payload.chat_template_kwargs = { enable_thinking: false };

    abortRef.current = new AbortController();

    try {
      const response = await fetch("/api/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: abortRef.current.signal,
      });
      if (!response.ok) throw new Error((await response.text()) || `HTTP ${response.status}`);
      if (!response.body) throw new Error("response body가 없습니다");

      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";

        for (const ev of events) {
          const line = ev.trim();
          if (!line.startsWith("data:")) continue;
          const dataStr = line.slice("data:".length).trim();
          if (dataStr === "[DONE]") {
            buffer = "";
            break;
          }
          let data: any;
          try {
            data = JSON.parse(dataStr);
          } catch {
            continue;
          }
          onLastChunk?.(data);

          if (data.type === "ui_action") {
            onUiAction?.(data.action, data.params);
            continue;
          }
          if (data.type === "tool_call_start") {
            appendToolEvent(setMessages, assistantIdx, {
              kind: "start",
              name: data.name,
              argsPreview: data.args_preview ?? "",
            });
            continue;
          }
          if (data.type === "tool_call_end") {
            const resultText = typeof data.result_text === "string" ? data.result_text : "";
            const scene = parseSceneData(data.name, resultText);
            const sceneCandidates = scene?.candidates?.map((c: any) => ({
              id: c.id,
              typology: c.typology,
              metrics: {
                floors: c.metrics?.floors ?? 0,
                height: c.metrics?.height ?? 0,
                gfa: c.metrics?.gfa ?? 0,
                far: c.metrics?.far ?? 0,
                bcr: c.metrics?.bcr ?? 0,
              },
            }));
            appendToolEvent(setMessages, assistantIdx, {
              kind: "end",
              name: data.name,
              durationMs: data.duration_ms ?? 0,
              resultSize: data.result_size ?? 0,
              error: !!data.error,
              resultText,
              sceneData: scene?.sceneData,
              sceneCandidates,
            });
            onToolResult?.(data.name, resultText);
            continue;
          }
          if (data.type === "status") continue;

          const choice = data.choices?.[0];
          if (!choice) continue;
          const delta = choice.delta || {};
          if (typeof delta.content === "string" && delta.content.length > 0) {
            appendAssistantContent(setMessages, assistantIdx, delta.content);
          }
          const reasoningChunk = delta.reasoning_content ?? delta.reasoning;
          if (typeof reasoningChunk === "string" && reasoningChunk.length > 0) {
            appendAssistantReasoning(setMessages, assistantIdx, reasoningChunk);
          }
        }
        if (events.length > 0 && events[events.length - 1].includes("[DONE]")) break;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      appendAssistantContent(setMessages, assistantIdx, `\n\n⚠ 오류: ${message}`);
    } finally {
      setIsSending(false);
      abortRef.current = null;
    }
  }

  function handleAbort() {
    abortRef.current?.abort();
  }

  function collapsePreviousAssistantTools() {
    setMessages((cur) =>
      cur.map((m) => (m.role === "assistant" && m.toolsExpanded ? { ...m, toolsExpanded: false } : m))
    );
  }

  function handleAttachGeometry() {
    if (!drawnFeatures || drawnFeatures.length === 0) return;
    // ts 최대값 = 가장 최근 그리거나 수정한 feature
    const latest = [...drawnFeatures].sort((a: any, b: any) => (b.ts ?? 0) - (a.ts ?? 0))[0];
    const prefix = `[geometry: ${JSON.stringify(latest.geometry)}]\n`;
    setInput((cur) => {
      // 이미 [geometry: ...] prefix가 있으면 그 라인을 교체 (중복 방지)
      if (cur.startsWith("[geometry:")) {
        const newlineIdx = cur.indexOf("\n");
        const rest = newlineIdx === -1 ? "" : cur.slice(newlineIdx + 1);
        return prefix + rest;
      }
      return prefix + cur;
    });
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      composerFormRef.current?.requestSubmit();
    }
  }

  function getAutocompleteSuggestions(text: string): string[] {
    if (!text.startsWith("/")) return [];
    const body = text.slice(1).trim();
    const tokens = body.split(/\s+/);
    const cmd = tokens[0];

    if (tokens.length <= 1) {
      const all = ["배경", "레이어", "3d", "그리기", "이동", "지우기", "도움말"];
      const lower = (cmd ?? "").toLowerCase();
      return all.filter((c) => c.toLowerCase().startsWith(lower));
    }

    if (cmd === "배경") {
      const partial = (tokens[1] ?? "").toLowerCase();
      return Object.keys(BASEMAP_KO_TO_EN).filter((k) => k.toLowerCase().startsWith(partial));
    }

    if (cmd === "레이어" || cmd === "wms" || cmd === "layer") {
      const last = tokens[tokens.length - 1] ?? "";
      const isOnOffKw = last && Object.keys(ON_OFF_KO).some((k) => k.startsWith(last));
      const labelPartial = (isOnOffKw ? tokens.slice(1, -1) : tokens.slice(1)).join(" ").toLowerCase();
      if (!labelPartial) return wmsLeafLabels.slice(0, 8);
      return wmsLeafLabels.filter((l) => l.toLowerCase().includes(labelPartial)).slice(0, 8);
    }

    if (cmd === "3d") {
      const partial = (tokens[1] ?? "").toLowerCase();
      const all = ["켜", "끄기", "지형", "건물"];
      return all.filter((c) => c.toLowerCase().startsWith(partial));
    }

    if (cmd === "그리기") {
      const partial = (tokens[1] ?? "").toLowerCase();
      return ["켜", "끄기"].filter((c) => c.toLowerCase().startsWith(partial));
    }

    if (cmd === "지우기") {
      const partial = (tokens[1] ?? "").toLowerCase();
      return Object.keys(CLEAR_CATEGORY_KO_TO_EN).filter((k) => k.toLowerCase().startsWith(partial));
    }

    return [];
  }

  const autocompleteItems = autocompleteOpen ? getAutocompleteSuggestions(input) : [];

  const isGeometryAttached = input.startsWith("[geometry:");
  function handleDetachGeometry() {
    setInput((cur) => {
      if (!cur.startsWith("[geometry:")) return cur;
      const nl = cur.indexOf("\n");
      return nl === -1 ? "" : cur.slice(nl + 1);
    });
  }

  const composerForm = (
    <form ref={composerFormRef} className={`composer ${mode === "mobile" ? "mobile-composer" : ""}`} onSubmit={handleSubmit}>
      {drawnFeatures && drawnFeatures.length > 0 && (
        <div className="attach-badges-row">
          {drawnFeatures.map((f) => {
            const isLatest = drawnFeatures[drawnFeatures.length - 1].id === f.id;
            const attached = isGeometryAttached && isLatest;
            return (
              <button
                key={f.id}
                type="button"
                className={`attach-badge${attached ? " attached" : ""}`}
                onClick={attached ? handleDetachGeometry : handleAttachGeometry}
                title={attached ? "첨부 해제" : `${f.label}을 채팅에 첨부`}
              >
                📎 {f.label}{attached ? " ✕" : ""}
              </button>
            );
          })}
        </div>
      )}
      <div className="composer-input-row">
      <textarea
        ref={textareaRef}
        value={input}
        onChange={(event) => {
          const v = event.target.value;
          setInput(v);
          autoResizeTextarea(event.currentTarget);
          setAutocompleteOpen(v.startsWith("/"));
          setAutocompleteIdx(0);
        }}
        onKeyDown={(event) => {
          // 한글 IME composition 중에는 자동완성 키 가로채지 않음 (방향키로 후보 이동 등 IME 사용).
          if (event.nativeEvent.isComposing) return;
          if (autocompleteOpen && autocompleteItems.length > 0) {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setAutocompleteIdx((i) => (i + 1) % autocompleteItems.length);
              return;
            }
            if (event.key === "ArrowUp") {
              event.preventDefault();
              setAutocompleteIdx((i) => (i - 1 + autocompleteItems.length) % autocompleteItems.length);
              return;
            }
            if (event.key === "Tab" || (event.key === "Enter" && !event.shiftKey)) {
              event.preventDefault();
              const pick = autocompleteItems[autocompleteIdx];
              if (!pick) {
                // items가 줄어들어 idx가 stale인 경우 — 그냥 닫기.
                setAutocompleteOpen(false);
                return;
              }
              const replaced = applyAutocomplete(input, pick);
              setInput(replaced);
              setAutocompleteOpen(false);
              if (textareaRef.current) autoResizeTextarea(textareaRef.current);
              return;
            }
            if (event.key === "Escape") {
              event.preventDefault();
              setAutocompleteOpen(false);
              return;
            }
          }
          handleComposerKeyDown(event);
        }}
        placeholder="예: 역삼동 738번지의 PNU와 면적 알려줘"
        rows={1}
      />
      {mode === "mobile" && (
        isSending ? (
          <button type="button" className="primary-button mobile-send" onClick={handleAbort} title="중단">
            ⏹
          </button>
        ) : (
          <button type="submit" className="primary-button mobile-send" disabled={!input.trim()} title="전송">
            ↑
          </button>
        )
      )}
      </div>
      {autocompleteOpen && autocompleteItems.length > 0 && (
        <ul className="slash-autocomplete">
          {autocompleteItems.map((item, i) => (
            <li
              key={item}
              className={`slash-autocomplete-item ${i === autocompleteIdx ? "active" : ""}`}
              onMouseDown={(e) => {
                e.preventDefault();
                setInput(applyAutocomplete(input, item));
                setAutocompleteOpen(false);
                textareaRef.current?.focus();
              }}
            >
              {item}
            </li>
          ))}
        </ul>
      )}
      {mode !== "mobile" && (
        <div className="composer-row">
          <span className="composer-hint">Enter 전송 · Shift+Enter 줄바꿈</span>
          <div style={{ display: "flex", gap: 8 }}>
            {isSending ? (
              <button type="button" className="secondary-button" onClick={handleAbort}>
                중단
              </button>
            ) : null}
            <button type="submit" className="primary-button" disabled={isSending}>
              {isSending ? "..." : "전송"}
            </button>
          </div>
        </div>
      )}
    </form>
  );

  return (
    <div className={`chat-tab ${mode === "mobile" ? "mobile" : ""}`}>
      {mode === "mobile" && composerForm}
      <div ref={messageListRef} onScroll={handleListScroll} className={`message-list ${mode === "mobile" ? "mobile" : ""}`}>
        {messages.map((message, index) => (
          <article key={`${message.role}-${index}`} className={`message ${message.role}`}>
            <div className="message-avatar" aria-hidden="true">
              {message.role === "assistant" ? "🤖" : message.role === "user" ? "👤" : "⚙️"}
            </div>
            <div className="message-body">
              <p className="message-role">{message.role}</p>
              {message.reasoning ? (
                <details className="reasoning-block">
                  <summary>thinking ({message.reasoning.length} chars)</summary>
                  <pre>{redactPnu(message.reasoning, prevUserAsksPnu(messages, index))}</pre>
                </details>
              ) : null}
              {message.role === "assistant" && message.toolEvents && message.toolEvents.length > 0 ? (() => {
                const counts = countToolGroups(message.toolEvents);
                const expanded = message.toolsExpanded !== false;
                return (
                  <div className="tool-events-block">
                    <button
                      type="button"
                      className="tool-badge-row"
                      onClick={() => {
                        setMessages((cur) =>
                          cur.map((m, mi) => (mi === index ? { ...m, toolsExpanded: !expanded } : m))
                        );
                      }}
                    >
                      <span className="tool-badge">🔧 {counts.tools}</span>
                      <span className="tool-badge-toggle">{expanded ? "▲" : "▼"}</span>
                    </button>
                    {expanded ? (
                      <div className="tool-events-detail">
                        <div className="tool-pills">
                          {message.toolEvents.map((te, i) =>
                            te.kind === "start" ? (
                              <span key={i} className="tool-pill running" title={te.name}>
                                🔧 {prettyToolName(te.name)}
                              </span>
                            ) : (
                              <span key={i} className={`tool-pill ${te.error ? "err" : "ok"}`} title={te.name}>
                                {te.error ? "✗" : "✓"} {prettyToolName(te.name)} · {te.durationMs}ms · {te.resultSize}B
                              </span>
                            )
                          )}
                        </div>
                        {message.toolEvents.map((te, i) => {
                          if (te.kind !== "end" || te.error || !te.resultText) return null;
                          const spec = getChartSpec(te.name, te.resultText);
                          if (!spec) return null;
                          return (
                            <div
                              key={`chart-${i}`}
                              onClick={() => setModalSpec(spec)}
                              style={{ cursor: "pointer" }}
                            >
                              <MiniChart spec={spec} />
                            </div>
                          );
                        })}
                        {message.toolEvents.map((ev, i) =>
                          ev.kind === "end" && ev.sceneCandidates && ev.sceneCandidates.length > 0 ? (
                            <div key={`mass-${i}`} className="mass-thumbnail-card">
                              <div className="mass-thumbnail-title">🏢 매스 후보 {ev.sceneCandidates.length}개</div>
                              <ul className="mass-thumbnail-list">
                                {ev.sceneCandidates.map((c) => (
                                  <li key={c.id} className="mass-thumbnail-item">
                                    <span className="mass-thumbnail-id">{c.id}</span>
                                    <span className="mass-thumbnail-meta">
                                      {c.typology} · {c.metrics.floors}층 · {Math.round(c.metrics.gfa)}㎡ · 용적 {Math.round(c.metrics.far)}%
                                    </span>
                                    <button
                                      className="mass-thumbnail-btn"
                                      onClick={() => {
                                        if (ev.sceneData) {
                                          setMassModal({ sceneData: ev.sceneData, defaultCandidateId: c.id });
                                        }
                                      }}
                                      title="3D 풀스크린 뷰어"
                                    >
                                      🏢 3D
                                    </button>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ) : null
                        )}
                      </div>
                    ) : null}
                  </div>
                );
              })() : null}
              {message.role === "assistant" ? (
                <div className="message-content markdown-body">
                  {message.content ? (
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{redactPnu(message.content, prevUserAsksPnu(messages, index))}</ReactMarkdown>
                  ) : isSending && index === messages.length - 1 ? (
                    <span className="dots">…</span>
                  ) : null}
                </div>
              ) : (
                <p className="message-content">{message.content}</p>
              )}
            </div>
          </article>
        ))}
        <div ref={messagesEndRef} />
      </div>
      {mode !== "mobile" && composerForm}
      <ChartModal spec={modalSpec} onClose={() => setModalSpec(null)} />
      {massModal && (
        <MassModal
          open={true}
          onClose={() => setMassModal(null)}
          sceneData={massModal.sceneData}
          defaultCandidateId={massModal.defaultCandidateId}
        />
      )}
    </div>
  );
}

function autoResizeTextarea(el: HTMLTextAreaElement) {
  el.style.height = "auto";
  const next = Math.min(el.scrollHeight, 192); // max 8 lines × 24px line-height
  el.style.height = `${next}px`;
}

// 19자리 숫자 PNU와 dash 형식 PNU(`1168010100-100-1`)을 답변에서 redact.
// 사용자가 직접 PNU/코드/식별자를 요청한 경우엔 그대로 둠.
const PNU_DASH_RE = /\b\d{10}[-_]\d+[-_]\d+\b/g;
const PNU_19_RE = /\b\d{19}\b/g;
const PNU_ASK_RE = /(PNU|pnu|식별자|필지\s*코드|코드를?\s*알려|19\s*자리)/;

function prevUserAsksPnu(messages: ChatMessage[], assistantIdx: number): boolean {
  for (let i = assistantIdx - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role === "user") return PNU_ASK_RE.test(m.content);
  }
  return false;
}

function redactPnu(text: string, allow: boolean): string {
  if (allow) return text;
  return text.replace(PNU_DASH_RE, "(필지)").replace(PNU_19_RE, "(필지)");
}

// MCP 영문 풀네임 → 한국어 위트 라벨. 도메인 단위 별칭 + 일부 동작은 더 구체적으로.
const TOOL_PRETTY: Record<string, string> = {
  // locate
  "locate__search_address": "📍 주소 검색",
  "locate__search_facility": "🏷️ 시설 검색",
  "locate__make_buffer": "⭕ 버퍼",
  "locate__parcels_in_boundary": "🗺️ 영역 내 필지",
  "locate__pnu_to_geometry": "🧭 PNU 좌표화",
  // inspect
  "inspect__zoning": "🏛️ 용도지역",
  "inspect__land_use": "🌳 토지이용",
  "inspect__road_width": "🛣️ 진입도로",
  "inspect__floor_area_ratio_limit": "📐 용적률",
  // reach
  "reach__isochrone_walk": "🚶 보행 등시선",
  "reach__isochrone_bike": "🚴 자전거 등시선",
  "reach__isochrone_transit": "🚌 대중교통 등시선",
  "reach__isochrone_car": "🚗 차량 등시선",
  "reach__poi_in_isochrone": "🏪 등시선 POI",
  "reach__poi_in_radius": "🏪 반경 POI",
  // analyze
  "analyze__find_parcels": "🔍 필지 찾기",
  "analyze__parcel_aggregation": "📊 필지 집계",
  // simulate
  "simulate__shadow_analysis": "☀️ 그림자",
  "simulate__earthwork": "⛰️ 토공",
  // estimate
  "estimate__cost_quick": "💰 빠른 견적",
  "estimate__cost_detail": "💰 상세 견적",
  "estimate__parking": "🅿️ 주차",
  "estimate__households": "🏘️ 세대수",
  // design
  "design__generate_scene": "🏗️ 매스 디자인",
  // export
  "export__pdf": "📄 PDF",
  "export__dxf": "📐 DXF",
  "export__3d": "🧊 3D",
  "export__ifc": "🏢 IFC",
  // ui
  "ui__set_basemap": "🗺️ 배경 변경",
  "ui__toggle_wms_layer": "🪟 레이어 토글",
  "ui__set_3d": "🧱 3D 토글",
  "ui__enable_draw": "✏️ 그리기",
  "ui__fly_to": "🚀 이동",
  "ui__clear_layers": "🧹 정리",
};
const DOMAIN_PRETTY: Record<string, string> = {
  locate: "📍 필지툴",
  inspect: "🏛️ 규제툴",
  reach: "🚶 등시선툴",
  analyze: "🔍 분석툴",
  simulate: "☀️ 시뮬툴",
  estimate: "💰 추정툴",
  design: "🏗️ 디자인툴",
  export: "📤 내보내기툴",
  ui: "🖱️ UI툴",
};
function prettyToolName(name: string): string {
  if (TOOL_PRETTY[name]) return TOOL_PRETTY[name];
  const domain = name.split("__")[0];
  if (DOMAIN_PRETTY[domain]) return DOMAIN_PRETTY[domain];
  return name;
}

function countToolGroups(toolEvents: ToolEvent[] | undefined): { tools: number; charts: number; masses: number } {
  if (!toolEvents) return { tools: 0, charts: 0, masses: 0 };
  let tools = 0, charts = 0, masses = 0;
  for (const ev of toolEvents) {
    if (ev.kind !== "end") continue;
    tools += 1;
    if (ev.resultText && getChartSpec(ev.name, ev.resultText)) charts += 1;
    if (ev.sceneCandidates && ev.sceneCandidates.length > 0) masses += ev.sceneCandidates.length;
  }
  return { tools, charts, masses };
}

function parseSceneData(toolName: string, resultText: string): { sceneData: SceneData; candidates: any[] } | null {
  if (toolName !== "design__generate_scene") return null;
  if (!resultText) return null;
  try {
    const parsed = JSON.parse(resultText);
    const result = parsed?.result ?? parsed;
    const sceneData = result?.scene_data;
    if (!sceneData || typeof sceneData !== "object") return null;
    const candidates = sceneData.candidates ?? [];
    return { sceneData, candidates };
  } catch {
    return null;
  }
}

function appendAssistantContent(setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>, idx: number, chunk: string) {
  setMessages((current) => {
    const next = [...current];
    if (next[idx]) next[idx] = { ...next[idx], content: (next[idx].content || "") + chunk };
    return next;
  });
}

function appendAssistantReasoning(setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>, idx: number, chunk: string) {
  setMessages((current) => {
    const next = [...current];
    if (next[idx]) next[idx] = { ...next[idx], reasoning: (next[idx].reasoning || "") + chunk };
    return next;
  });
}

function appendToolEvent(setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>, idx: number, event: ToolEvent) {
  setMessages((current) => {
    const next = [...current];
    if (next[idx]) next[idx] = { ...next[idx], toolEvents: [...(next[idx].toolEvents || []), event] };
    return next;
  });
}

// Markdown trailing 2-space로 줄바꿈 강제 (ReactMarkdown은 단일 \n을 공백으로 취급).
const HELP_MESSAGE = [
  "[UI] 슬래시 명령:",
  "/배경 [백지도|일반|위성|야간|하이브리드] — 배경 지도 변경",
  "/레이어 <이름> [켜|끄기] — WMS overlay 토글 (이름 부분 매칭)",
  "/3d [켜|끄기] — 지형+건물 모두",
  "/3d 지형 [켜|끄기] / /3d 건물 [켜|끄기] — 개별",
  "/그리기 [켜|끄기] — 그리기 모드",
  "/이동 <lng> <lat> [<zoom>] — 카메라 이동",
  "/지우기 [전체|도구|그리기|wms] — 레이어 정리",
  "/도움말 — 이 메시지",
].join("  \n");

const BASEMAP_KO_TO_EN: Record<string, string> = {
  "백지도": "white",
  "일반": "base",
  "위성": "satellite",
  "야간": "midnight",
  "하이브리드": "hybrid",
};

const ON_OFF_KO: Record<string, boolean> = {
  "켜": true, "켜기": true, "on": true, "활성": true, "활성화": true,
  "끄기": false, "꺼": false, "off": false, "비활성": false, "비활성화": false,
};

const CLEAR_CATEGORY_KO_TO_EN: Record<string, string> = {
  "전체": "all", "all": "all",
  "도구": "tools", "tools": "tools",
  "그리기": "draw", "draw": "draw",
  "wms": "wms", "오버레이": "wms",
};

interface SlashResult {
  name: string;
  params: any;
  summary: string;
}

function parseSlashCommand(input: string, wmsLeafLabels: string[]): SlashResult | "help" | null {
  const trimmed = input.trim();
  if (!trimmed.startsWith("/")) return null;
  const body = trimmed.slice(1).trim();
  if (!body) return null;
  const tokens = body.split(/\s+/);
  const cmd = tokens[0];
  const rest = tokens.slice(1);

  if (cmd === "도움말" || cmd === "help") return "help";

  if (cmd === "배경" || cmd === "basemap") {
    const kindKo = rest[0];
    if (!kindKo) return null;
    const kindEn = BASEMAP_KO_TO_EN[kindKo];
    if (!kindEn) return null;
    return { name: "ui__set_basemap", params: { kind: kindEn }, summary: `배경 지도 → ${kindKo}` };
  }

  if (cmd === "레이어" || cmd === "wms" || cmd === "layer") {
    if (rest.length < 2) return null;
    const last = rest[rest.length - 1];
    const onOff = ON_OFF_KO[last];
    if (typeof onOff !== "boolean") return null;
    const labelTokens = rest.slice(0, -1);
    const labelInput = labelTokens.join(" ");
    const lower = labelInput.toLowerCase();
    // 매칭 실패 시 null — 사용자에게 "알 수 없는 슬래시" fallback 메시지로 알림.
    const match = wmsLeafLabels.find((l) => l.toLowerCase().includes(lower));
    if (!match) return null;
    return {
      name: "ui__toggle_wms_layer",
      params: { label: match, on: onOff },
      summary: `${match} 레이어 ${onOff ? "켜기" : "끄기"}`,
    };
  }

  if (cmd === "3d" || cmd === "3D") {
    if (rest.length === 0) return null;
    let target: "terrain" | "buildings" | "both" = "both";
    let onOffToken = rest[0];
    if (rest[0] === "지형" || rest[0] === "terrain") {
      target = "terrain";
      onOffToken = rest[1] ?? "";
    } else if (rest[0] === "건물" || rest[0] === "buildings") {
      target = "buildings";
      onOffToken = rest[1] ?? "";
    }
    const onOff = ON_OFF_KO[onOffToken];
    if (typeof onOff !== "boolean") return null;
    const params: any = {};
    if (target === "terrain" || target === "both") params.terrain = onOff;
    if (target === "buildings" || target === "both") params.buildings = onOff;
    return {
      name: "ui__set_3d",
      params,
      summary: `3D ${target === "terrain" ? "지형" : target === "buildings" ? "건물" : "지형+건물"} ${onOff ? "켜기" : "끄기"}`,
    };
  }

  if (cmd === "그리기" || cmd === "draw") {
    const onOff = ON_OFF_KO[rest[0] ?? ""];
    if (typeof onOff !== "boolean") return null;
    return { name: "ui__enable_draw", params: { on: onOff }, summary: `그리기 ${onOff ? "켜기" : "끄기"}` };
  }

  if (cmd === "이동" || cmd === "fly" || cmd === "flyto") {
    if (rest.length < 2) return null;
    const lng = parseFloat(rest[0]);
    const lat = parseFloat(rest[1]);
    if (!isFinite(lng) || !isFinite(lat)) return null;
    const zoom = rest.length >= 3 ? parseFloat(rest[2]) : undefined;
    const params: any = { lng, lat };
    if (typeof zoom === "number" && isFinite(zoom)) params.zoom = zoom;
    return { name: "ui__fly_to", params, summary: `(${lng.toFixed(4)}, ${lat.toFixed(4)})로 이동` };
  }

  if (cmd === "지우기" || cmd === "clear") {
    const catKo = rest[0] ?? "전체";
    const catEn = CLEAR_CATEGORY_KO_TO_EN[catKo] ?? catKo;
    if (!["all", "tools", "draw", "wms"].includes(catEn)) return null;
    return { name: "ui__clear_layers", params: { category: catEn }, summary: `${catKo} 레이어 정리` };
  }

  return null;
}

function applyAutocomplete(input: string, pick: string): string {
  if (!input.startsWith("/")) return input + " " + pick + " ";
  const body = input.slice(1);
  const tokens = body.split(/\s+/);
  if (tokens.length === 0 || (tokens.length === 1 && tokens[0] === "")) {
    return "/" + pick + " ";
  }
  tokens[tokens.length - 1] = pick;
  return "/" + tokens.join(" ") + " ";
}
