import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type ChatRole = "user" | "assistant" | "system";

type ChatMessage = {
  role: ChatRole;
  content: string;
  reasoning?: string;
  toolEvents?: ToolEvent[];
};

type ToolEvent =
  | { kind: "start"; name: string; argsPreview: string }
  | { kind: "end"; name: string; durationMs: number; resultSize: number; error: boolean };

type ModelListResponse = {
  data?: Array<{ id: string }>;
};

const DEFAULT_MODEL = "Qwen/Qwen3.6-35B-A3B";
const DEFAULT_SYSTEM_PROMPT = "한국어로 짧고 명확하게 답해.";
const DEFAULT_PROMPT = "역삼동 738번지의 PNU와 면적 알려줘";

export default function App() {
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [systemPrompt, setSystemPrompt] = useState(DEFAULT_SYSTEM_PROMPT);
  const [input, setInput] = useState(DEFAULT_PROMPT);
  const [disableThinking, setDisableThinking] = useState(true);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content: "준비됨. 자연어로 질의하면 urban_mcp 8 도메인 52 도구가 필요할 때 자동 호출됩니다."
    }
  ]);
  const [status, setStatus] = useState("Ready.");
  const [metrics, setMetrics] = useState("");
  const [rawJson, setRawJson] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const composerFormRef = useRef<HTMLFormElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    void loadModels();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isSending]);

  async function loadModels() {
    setIsLoadingModels(true);
    setStatus("모델 목록 로딩 중...");
    try {
      const response = await fetch("/api/v1/models");
      const json = (await response.json()) as ModelListResponse;
      if (!response.ok) throw new Error(JSON.stringify(json));
      const models = (json.data ?? []).map((entry) => entry.id);
      setAvailableModels(models);
      if (models[0]) setModel(models[0]);
      setStatus(`모델 ${models.length}개 로드됨.`);
    } catch (error) {
      setStatus(`모델 목록 실패.\n${getErrorMessage(error)}`);
    } finally {
      setIsLoadingModels(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const prompt = input.trim();
    if (!prompt || isSending) return;

    const baseMessages = [...messages, { role: "user" as const, content: prompt }];
    setMessages(baseMessages);
    setInput("");
    setIsSending(true);
    setStatus("스트리밍 시작...");
    setMetrics("");
    setRawJson("");

    // 새 assistant placeholder를 추가 — chunks가 여기에 누적됨
    const assistantIdx = baseMessages.length;
    setMessages((current) => [
      ...current,
      { role: "assistant", content: "", reasoning: "", toolEvents: [] }
    ]);

    const requestMessages: Array<{ role: ChatRole; content: string }> = [];
    if (systemPrompt.trim()) {
      requestMessages.push({ role: "system", content: systemPrompt.trim() });
    }
    requestMessages.push(
      ...baseMessages
        .filter((m) => m.role !== "system")
        .map((m) => ({ role: m.role, content: m.content }))
    );

    const payload: Record<string, unknown> = {
      model,
      messages: requestMessages,
      stream: true,
      temperature: 0.7
    };
    if (disableThinking) {
      payload.chat_template_kwargs = { enable_thinking: false };
    }

    const startedAt = performance.now();
    abortRef.current = new AbortController();

    let totalCompletionTokens = 0;
    let totalPromptTokens = 0;
    let lastChunk: unknown = null;
    let toolCalls = 0;

    try {
      const response = await fetch("/api/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: abortRef.current.signal
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || `HTTP ${response.status}`);
      }
      if (!response.body) {
        throw new Error("response body가 없습니다");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // SSE는 \n\n 으로 이벤트 구분
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
          lastChunk = data;

          // 커스텀 이벤트
          if (data.type === "tool_call_start") {
            toolCalls += 1;
            appendToolEvent(setMessages, assistantIdx, {
              kind: "start",
              name: data.name,
              argsPreview: data.args_preview ?? ""
            });
            setStatus(`🔧 ${data.name} 호출 중...`);
            continue;
          }
          if (data.type === "tool_call_end") {
            appendToolEvent(setMessages, assistantIdx, {
              kind: "end",
              name: data.name,
              durationMs: data.duration_ms ?? 0,
              resultSize: data.result_size ?? 0,
              error: !!data.error
            });
            setStatus(`✓ ${data.name} (${data.duration_ms}ms, ${data.result_size}B)`);
            continue;
          }
          if (data.type === "status") {
            setStatus(data.message || "");
            continue;
          }

          // OpenAI 표준 chunk
          const choice = data.choices?.[0];
          if (!choice) continue;
          const delta = choice.delta || {};

          if (typeof delta.content === "string" && delta.content.length > 0) {
            appendAssistantContent(setMessages, assistantIdx, delta.content);
          }
          // vLLM은 reasoning_parser=qwen3에서 `reasoning` 필드 사용. OpenAI 표준은 `reasoning_content`.
          const reasoningChunk = delta.reasoning_content ?? delta.reasoning;
          if (typeof reasoningChunk === "string" && reasoningChunk.length > 0) {
            appendAssistantReasoning(setMessages, assistantIdx, reasoningChunk);
          }

          if (data.usage) {
            totalCompletionTokens = data.usage.completion_tokens ?? totalCompletionTokens;
            totalPromptTokens = data.usage.prompt_tokens ?? totalPromptTokens;
          }
        }

        if (events.length > 0 && events[events.length - 1].includes("[DONE]")) break;
      }

      const elapsedSeconds = (performance.now() - startedAt) / 1000;
      setStatus(`완료 (${elapsedSeconds.toFixed(1)}s, tool ${toolCalls}회)`);
      setMetrics(
        [
          `elapsed_s: ${elapsedSeconds.toFixed(2)}`,
          `tool_calls: ${toolCalls}`,
          `prompt_tokens: ${totalPromptTokens || "n/a"}`,
          `completion_tokens: ${totalCompletionTokens || "n/a"}`
        ].join("\n")
      );
      setRawJson(JSON.stringify(lastChunk ?? {}, null, 2));
    } catch (error) {
      const message = getErrorMessage(error);
      appendAssistantContent(setMessages, assistantIdx, `\n\n⚠ 오류: ${message}`);
      setStatus(`오류: ${message}`);
    } finally {
      setIsSending(false);
      abortRef.current = null;
    }
  }

  function handleAbort() {
    abortRef.current?.abort();
    setStatus("사용자가 중단함.");
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      composerFormRef.current?.requestSubmit();
    }
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <p className="eyebrow">urban-chat</p>
          <h1>Qwen × urban_mcp</h1>
          <p className="lede">
            자연어 질의 → urban_mcp 도구 자동 호출 → 한국어 답변. <code>/api</code> ↔ bridge:8090.
          </p>
        </div>

        <section className="panel">
          <div className="field">
            <label htmlFor="model">Model</label>
            <div className="model-row">
              <select
                id="model"
                value={model}
                onChange={(event) => setModel(event.target.value)}
              >
                {availableModels.length === 0 ? (
                  <option value={model}>{model}</option>
                ) : (
                  availableModels.map((entry) => (
                    <option key={entry} value={entry}>
                      {entry}
                    </option>
                  ))
                )}
              </select>
              <button
                type="button"
                className="secondary-button"
                onClick={() => void loadModels()}
                disabled={isLoadingModels}
              >
                {isLoadingModels ? "..." : "새로고침"}
              </button>
            </div>
          </div>

          <div className="field">
            <label htmlFor="systemPrompt">System prompt (사용자 추가)</label>
            <textarea
              id="systemPrompt"
              value={systemPrompt}
              onChange={(event) => setSystemPrompt(event.target.value)}
              placeholder="브릿지 system prompt와 합쳐짐"
              rows={3}
            />
          </div>

          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={disableThinking}
              onChange={(event) => setDisableThinking(event.target.checked)}
            />
            <span>thinking 끄기 (빠른 응답)</span>
          </label>
        </section>

        <section className="panel">
          <p className="panel-title">Status</p>
          <pre className="status-box">{status}</pre>
          <p className="panel-title">Metrics</p>
          <pre className="status-box">{metrics || "요청 없음"}</pre>
        </section>
      </aside>

      <main className="chat-stage">
        <section className="chat-panel">
          <div className="chat-header">
            <div>
              <p className="eyebrow">대화</p>
              <h2>도시 분석 · 자연어</h2>
            </div>
            <span className="badge">streaming · {disableThinking ? "no-think" : "thinking"}</span>
          </div>

          <div className="message-list">
            {messages.map((message, index) => (
              <article key={`${message.role}-${index}`} className={`message ${message.role}`}>
                <p className="message-role">{message.role}</p>
                {message.reasoning ? (
                  <details className="reasoning-block">
                    <summary>thinking ({message.reasoning.length} chars)</summary>
                    <pre>{message.reasoning}</pre>
                  </details>
                ) : null}
                {message.toolEvents && message.toolEvents.length > 0 ? (
                  <ul className="tool-events">
                    {message.toolEvents.map((te, i) =>
                      te.kind === "start" ? (
                        <li key={i} className="tool-start">🔧 {te.name}({te.argsPreview})</li>
                      ) : (
                        <li key={i} className={te.error ? "tool-end error" : "tool-end ok"}>
                          {te.error ? "✗" : "✓"} {te.name} · {te.durationMs}ms · {te.resultSize}B
                        </li>
                      )
                    )}
                  </ul>
                ) : null}
                {message.role === "assistant" ? (
                  <div className="message-content markdown-body">
                    {message.content ? (
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {message.content}
                      </ReactMarkdown>
                    ) : isSending && index === messages.length - 1 ? (
                      <span className="dots">…</span>
                    ) : null}
                  </div>
                ) : (
                  <p className="message-content">{message.content}</p>
                )}
              </article>
            ))}
            <div ref={messagesEndRef} />
          </div>

          <form ref={composerFormRef} className="composer" onSubmit={handleSubmit}>
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={handleComposerKeyDown}
              placeholder="자연어 질의를 입력하세요"
              rows={4}
            />
            <div className="composer-row">
              <p className="composer-hint">
                Enter 전송 · Shift+Enter 줄바꿈
              </p>
              <div style={{ display: "flex", gap: 8 }}>
                {isSending ? (
                  <button type="button" className="secondary-button" onClick={handleAbort}>
                    중단
                  </button>
                ) : null}
                <button type="submit" className="primary-button" disabled={isSending}>
                  {isSending ? "스트리밍 중..." : "전송"}
                </button>
              </div>
            </div>
          </form>
        </section>

        <section className="json-panel">
          <div className="chat-header">
            <div>
              <p className="eyebrow">Debug</p>
              <h2>마지막 chunk</h2>
            </div>
          </div>
          <pre className="json-box">{rawJson || "응답 없음"}</pre>
        </section>
      </main>
    </div>
  );
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return String(error);
}

function appendAssistantContent(
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>,
  idx: number,
  chunk: string
) {
  setMessages((current) => {
    const next = [...current];
    if (next[idx]) {
      next[idx] = {
        ...next[idx],
        content: (next[idx].content || "") + chunk
      };
    }
    return next;
  });
}

function appendAssistantReasoning(
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>,
  idx: number,
  chunk: string
) {
  setMessages((current) => {
    const next = [...current];
    if (next[idx]) {
      next[idx] = {
        ...next[idx],
        reasoning: (next[idx].reasoning || "") + chunk
      };
    }
    return next;
  });
}

function appendToolEvent(
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>,
  idx: number,
  event: ToolEvent
) {
  setMessages((current) => {
    const next = [...current];
    if (next[idx]) {
      next[idx] = {
        ...next[idx],
        toolEvents: [...(next[idx].toolEvents || []), event]
      };
    }
    return next;
  });
}
