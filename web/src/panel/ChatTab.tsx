import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type ChatRole = "user" | "assistant" | "system";

type ToolEvent =
  | { kind: "start"; name: string; argsPreview: string }
  | { kind: "end"; name: string; durationMs: number; resultSize: number; error: boolean; resultText?: string };

type ChatMessage = {
  role: ChatRole;
  content: string;
  reasoning?: string;
  toolEvents?: ToolEvent[];
};

interface ChatTabProps {
  model: string;
  systemPrompt: string;
  disableThinking: boolean;
  onLastChunk?: (chunk: unknown) => void;
  onToolResult?: (toolName: string, resultText: string) => void;  // T5에서 사용
}

export default function ChatTab({ model, systemPrompt, disableThinking, onLastChunk, onToolResult }: ChatTabProps) {
  const [input, setInput] = useState("역삼동 738번지의 PNU와 면적 알려줘");
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "assistant", content: "준비됨. 자연어로 질의하세요." },
  ]);
  const [isSending, setIsSending] = useState(false);
  const composerFormRef = useRef<HTMLFormElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isSending]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const prompt = input.trim();
    if (!prompt || isSending) return;

    const baseMessages = [...messages, { role: "user" as const, content: prompt }];
    setMessages(baseMessages);
    setInput("");
    setIsSending(true);

    const assistantIdx = baseMessages.length;
    setMessages((current) => [...current, { role: "assistant", content: "", reasoning: "", toolEvents: [] }]);

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
            appendToolEvent(setMessages, assistantIdx, {
              kind: "end",
              name: data.name,
              durationMs: data.duration_ms ?? 0,
              resultSize: data.result_size ?? 0,
              error: !!data.error,
              resultText,
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

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      composerFormRef.current?.requestSubmit();
    }
  }

  return (
    <div className="chat-tab">
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
            ) : null}
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
          </article>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <form ref={composerFormRef} className="composer" onSubmit={handleSubmit}>
        <textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={handleComposerKeyDown}
          placeholder="자연어로 질의..."
          rows={3}
        />
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
      </form>
    </div>
  );
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
