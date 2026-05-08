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
}

export default function ChatTab({ model, systemPrompt, disableThinking, onLastChunk, onToolResult, drawnFeatures = [], mode = "desktop" }: ChatTabProps) {
  const [input, setInput] = useState("역삼동 738번지의 PNU와 면적 알려줘");
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "assistant", content: "준비됨. 자연어로 질의하세요." },
  ]);
  const [isSending, setIsSending] = useState(false);
  const [modalSpec, setModalSpec] = useState<ChartSpec | null>(null);
  const [massModal, setMassModal] = useState<{ sceneData: SceneData; defaultCandidateId?: string } | null>(null);
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
    if (mode === "mobile") return;  // mobile column-reverse는 자동 스크롤 X
    if (!userNearBottomRef.current) return;
    // behavior:"auto"로 smooth animation 큐 누적·취소 없이 즉시 하단 고정.
    messagesEndRef.current?.scrollIntoView({ behavior: "auto" });
  }, [messages, mode]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const prompt = input.trim();
    if (!prompt || isSending) return;

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
      { role: "assistant", content: "", reasoning: "", toolEvents: [], toolsExpanded: true },
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

  const composerForm = (
    <form ref={composerFormRef} className={`composer ${mode === "mobile" ? "mobile-composer" : ""}`} onSubmit={handleSubmit}>
      <textarea
        ref={textareaRef}
        value={input}
        onChange={(event) => {
          setInput(event.target.value);
          autoResizeTextarea(event.currentTarget);
        }}
        onKeyDown={handleComposerKeyDown}
        placeholder="자연어로 질의..."
        rows={1}
      />
      <div className="composer-row">
        <span className="composer-hint">Enter 전송 · Shift+Enter 줄바꿈</span>
        <button
          type="button"
          className="attach-button"
          onClick={handleAttachGeometry}
          disabled={!drawnFeatures || drawnFeatures.length === 0}
          title={
            drawnFeatures && drawnFeatures.length > 0
              ? `가장 최근 그린 ${drawnFeatures[drawnFeatures.length - 1].label}을 채팅에 첨부`
              : "그린 영역 없음"
          }
        >
          📎 영역 첨부 ({drawnFeatures?.length ?? 0})
        </button>
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
                  <pre>{message.reasoning}</pre>
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
                      {counts.tools > 0 && <span className="tool-badge">🔧×{counts.tools}</span>}
                      {counts.charts > 0 && <span className="tool-badge">📊×{counts.charts}</span>}
                      {counts.masses > 0 && <span className="tool-badge">🏢×{counts.masses}</span>}
                      <span className="tool-badge-toggle">{expanded ? "▲" : "▼"}</span>
                    </button>
                    {expanded ? (
                      <div className="tool-events-detail">
                        <div className="tool-pills">
                          {message.toolEvents.map((te, i) =>
                            te.kind === "start" ? (
                              <span key={i} className="tool-pill running">🔧 {te.name}</span>
                            ) : (
                              <span key={i} className={`tool-pill ${te.error ? "err" : "ok"}`}>
                                {te.error ? "✗" : "✓"} {te.name} · {te.durationMs}ms · {te.resultSize}B
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
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
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
