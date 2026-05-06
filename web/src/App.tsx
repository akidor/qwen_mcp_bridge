import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";

type ChatRole = "user" | "assistant" | "system";

type ChatMessage = {
  role: ChatRole;
  content: string;
};

type ModelListResponse = {
  data?: Array<{ id: string }>;
};

type ChatResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
};

type KoreanNormalizationResult = {
  content: string;
  didRetry: boolean;
  strategy: string;
  failed: boolean;
  rawRetryContent?: string;
};

const DEFAULT_MODEL = "sakamakismile/Qwen3.6-35B-A3B-NVFP4";
const DEFAULT_SYSTEM_PROMPT = [
  "당신은 한국어 전용 AI 어시스턴트다.",
  "모든 답변은 반드시 자연스럽고 명확한 한국어로만 작성한다.",
  "일본어, 중국어, 영어 문장을 섞어 쓰지 않는다.",
  "모델 소개, 자기소개, 사과문, 메타 설명도 예외 없이 한국어로만 작성한다.",
  "한자, 히라가나, 가타카나, 일본어 문장 부호를 일반 문장에 사용하지 않는다.",
  "코드, API 이름, 파일 경로, 고유한 모델명처럼 번역하면 안 되는 항목만 원문 그대로 둘 수 있다.",
  "사용자가 다른 언어로 질문해도 먼저 한국어로만 답한다.",
  "짧고 직접적으로 답하되, 필요하면 핵심만 한국어로 정리한다.",
  "자신이 어떤 모델인지 설명할 때도 한국어 문장만 사용한다.",
  "외국어 표현이 떠오르더라도 반드시 한국어 표현으로 바꿔서 답한다.",
  "출력에 일본어, 중국어, 한자 중심 문장이 섞이면 스스로 한국어 문장으로 고쳐서 다시 출력한다."
].join(" ");
const DEFAULT_PROMPT =
  "한국어로 짧고 명확하게 답해. 지금 이 서버가 어떤 구조로 돌아가는지 설명해.";

export default function App() {
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [systemPrompt, setSystemPrompt] = useState(DEFAULT_SYSTEM_PROMPT);
  const [input, setInput] = useState(DEFAULT_PROMPT);
  const [disableThinking, setDisableThinking] = useState(true);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content:
        "준비되었습니다. 이 UI는 Vite 프록시를 통해 /api 요청을 127.0.0.1:8020으로 전달합니다."
    }
  ]);
  const [status, setStatus] = useState("Ready.");
  const [rawJson, setRawJson] = useState("");
  const [metrics, setMetrics] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const composerFormRef = useRef<HTMLFormElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    void loadModels();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isSending]);

  async function loadModels() {
    setIsLoadingModels(true);
    setStatus("Loading model list via proxy...");

    try {
      const response = await fetch("/api/v1/models");
      const json = (await response.json()) as ModelListResponse;

      if (!response.ok) {
        throw new Error(JSON.stringify(json, null, 2));
      }

      const models = (json.data ?? []).map((entry) => entry.id);
      setAvailableModels(models);
      if (models[0]) {
        setModel(models[0]);
      }
      setRawJson(JSON.stringify(json, null, 2));
      setStatus("Model list loaded.");
    } catch (error) {
      setStatus(`Model list request failed.\n${getErrorMessage(error)}`);
    } finally {
      setIsLoadingModels(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const prompt = input.trim();
    if (!prompt || isSending) {
      return;
    }

    const nextMessages = [...messages, { role: "user" as const, content: prompt }];
    setMessages(nextMessages);
    setInput("");
    setIsSending(true);
    setStatus("Sending request via /api proxy...");
    setRawJson("");
    setMetrics("");

    const requestMessages: ChatMessage[] = [];
    if (systemPrompt.trim()) {
      requestMessages.push({ role: "system", content: systemPrompt.trim() });
    }
    requestMessages.push(...nextMessages.filter((message) => message.role !== "system"));

    const payload: Record<string, unknown> = {
      model,
      messages: requestMessages,
      temperature: 0,
      max_tokens: 512
    };

    if (disableThinking) {
      payload.chat_template_kwargs = { enable_thinking: false };
    }

    const startedAt = performance.now();

    try {
      const response = await fetch("/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      const json = (await response.json()) as ChatResponse;
      if (!response.ok) {
        throw new Error(JSON.stringify(json, null, 2));
      }

      const answer =
        json.choices?.[0]?.message?.content?.trim() ||
        "The model returned an empty response.";
      const normalized = await normalizeKoreanAnswer(answer, requestMessages, prompt);
      const elapsedSeconds = (performance.now() - startedAt) / 1000;
      const usage = json.usage ?? {};
      const completionTokens = usage.completion_tokens ?? 0;
      const promptTokens = usage.prompt_tokens ?? 0;
      const totalTokens = usage.total_tokens ?? 0;
      const completionTps =
        completionTokens > 0 ? (completionTokens / elapsedSeconds).toFixed(2) : "n/a";

      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          content: normalized.content
        }
      ]);
      setRawJson(
        JSON.stringify(
          {
            backend_response: json,
            korean_normalization: {
              didRetry: normalized.didRetry,
              strategy: normalized.strategy,
              failed: normalized.failed,
              final_content: normalized.content,
              retry_raw_content: normalized.rawRetryContent ?? null
            }
          },
          null,
          2
        )
      );
      setMetrics(
        [
          `elapsed_s: ${elapsedSeconds.toFixed(2)}`,
          `prompt_tokens: ${promptTokens}`,
          `completion_tokens: ${completionTokens}`,
          `total_tokens: ${totalTokens}`,
          `completion_tps: ${completionTps}`,
          `thinking_disabled: ${disableThinking ? "true" : "false"}`,
          `korean_regenerated: ${normalized.didRetry ? "true" : "false"}`,
          `korean_normalization_strategy: ${normalized.strategy}`,
          `korean_normalization_failed: ${normalized.failed ? "true" : "false"}`
        ].join("\n")
      );
      setStatus("Request complete.");
    } catch (error) {
      const message = getErrorMessage(error);
      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          content: `Request failed.\n${message}`
        }
      ]);
      setStatus(`Request failed.\n${message}`);
    } finally {
      setIsSending(false);
    }
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.nativeEvent.isComposing) {
      return;
    }

    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      composerFormRef.current?.requestSubmit();
    }
  }

  async function normalizeKoreanAnswer(
    content: string,
    requestMessages: ChatMessage[],
    userPrompt: string
  ): Promise<KoreanNormalizationResult> {
    if (!containsForeignScriptNoise(content)) {
      return {
        content,
        didRetry: false,
        strategy: "none",
        failed: false
      };
    }

    const localFallback = buildLocalKoreanFallback(userPrompt);
    if (localFallback) {
      return {
        content: localFallback,
        didRetry: false,
        strategy: "local-fallback",
        failed: false,
        rawRetryContent: content
      };
    }

    try {
      const response = await fetch("/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model,
          messages: buildKoreanRetryMessages(requestMessages),
          temperature: 0,
          max_tokens: 512,
          chat_template_kwargs: {
            enable_thinking: false
          }
        })
      });

      const json = (await response.json()) as ChatResponse;
      const retried = json.choices?.[0]?.message?.content?.trim();

      if (!response.ok || !retried) {
        return {
          content: "응답을 한국어로 다시 생성하지 못했습니다. 같은 질문을 한 번 더 보내 주세요.",
          didRetry: true,
          strategy: "regenerate-failed",
          failed: true
        };
      }

      if (!containsForeignScriptNoise(retried)) {
        return {
          content: retried,
          didRetry: true,
          strategy: "regenerate-in-korean",
          failed: false,
          rawRetryContent: retried
        };
      }

      return {
        content: "응답이 한국어 정책을 다시 위반해서 표시하지 않았습니다. 같은 질문을 한 번 더 보내 주세요.",
        didRetry: true,
        strategy: "regenerate-blocked",
        failed: true,
        rawRetryContent: retried
      };
    } catch {
      return {
        content: "응답을 한국어로 다시 생성하지 못했습니다. 같은 질문을 한 번 더 보내 주세요.",
        didRetry: true,
        strategy: "regenerate-error",
        failed: true
      };
    };
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <p className="eyebrow">Proxy Chat</p>
          <h1>Qwen React UI</h1>
          <p className="lede">
            Vite dev server proxies <code>/api</code> to the local load balancer on
            <code> 127.0.0.1:8020</code>.
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
                {isLoadingModels ? "Loading..." : "Reload"}
              </button>
            </div>
          </div>

          <div className="field">
            <label htmlFor="systemPrompt">System prompt</label>
            <textarea
              id="systemPrompt"
              value={systemPrompt}
              onChange={(event) => setSystemPrompt(event.target.value)}
              placeholder="Optional system instruction"
              rows={4}
            />
          </div>

          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={disableThinking}
              onChange={(event) => setDisableThinking(event.target.checked)}
            />
            <span>Disable reasoning output</span>
          </label>
        </section>

        <section className="panel">
          <p className="panel-title">Status</p>
          <pre className="status-box">{status}</pre>
          <p className="panel-title">Metrics</p>
          <pre className="status-box">{metrics || "No request yet."}</pre>
        </section>
      </aside>

      <main className="chat-stage">
        <section className="chat-panel">
          <div className="chat-header">
            <div>
              <p className="eyebrow">Conversation</p>
              <h2>Proxy-backed chat</h2>
            </div>
            <span className="badge">{disableThinking ? "No-think" : "Thinking"}</span>
          </div>

          <div className="message-list">
            {messages.map((message, index) => (
              <article key={`${message.role}-${index}`} className={`message ${message.role}`}>
                <p className="message-role">{message.role}</p>
                <p className="message-content">{message.content}</p>
              </article>
            ))}
            {isSending ? (
              <article className="message assistant pending">
                <p className="message-role">assistant</p>
                <p className="message-content">Generating response...</p>
              </article>
            ) : null}
            <div ref={messagesEndRef} />
          </div>

          <form ref={composerFormRef} className="composer" onSubmit={handleSubmit}>
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={handleComposerKeyDown}
              placeholder="Ask the model something..."
              rows={5}
            />
            <div className="composer-row">
              <p className="composer-hint">
                Enter sends. Shift+Enter inserts a new line. Frontend calls
                <code> /api/v1/chat/completions</code>.
              </p>
              <button type="submit" className="primary-button" disabled={isSending}>
                {isSending ? "Sending..." : "Send"}
              </button>
            </div>
          </form>
        </section>

        <section className="json-panel">
          <div className="chat-header">
            <div>
              <p className="eyebrow">Debug</p>
              <h2>Raw JSON</h2>
            </div>
          </div>
          <pre className="json-box">{rawJson || "No response yet."}</pre>
        </section>
      </main>
    </div>
  );
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function containsForeignScriptNoise(text: string) {
  const hasJapaneseKana = /[\u3040-\u30ff\u31f0-\u31ff]/.test(text);
  const hasRepeatedCjk = /[\u4e00-\u9fff]{2,}/.test(text);
  const hasJapanesePunctuation = /[「」『』〜々〆ヵヶ]/.test(text);

  return hasJapaneseKana || hasRepeatedCjk || hasJapanesePunctuation;
}

function buildKoreanRetryMessages(requestMessages: ChatMessage[]): ChatMessage[] {
  const retrySystemPrompt = [
    DEFAULT_SYSTEM_PROMPT,
    "직전 응답은 한국어 정책을 위반해 폐기되었다.",
    "이전 응답을 번역하거나 다듬지 말고 같은 질문에 대해 처음부터 새로 답하라.",
    "반드시 한국어 문장만 사용하라.",
    "한자, 히라가나, 가타카나, 일본어, 중국어 문장을 출력하지 마라.",
    "설명이나 사족 없이 최종 답변 본문만 출력하라."
  ].join(" ");

  return [
    {
      role: "system",
      content: retrySystemPrompt
    },
    ...requestMessages.filter((message) => message.role !== "system")
  ];
}

function buildLocalKoreanFallback(userPrompt: string) {
  const normalized = userPrompt.replace(/\s+/g, " ").trim().toLowerCase();

  if (
    /무슨\s*모델|어떤\s*모델|정체|누구(야|임|냐)?|뭐하는|무엇을\s*하는|너\s*뭐/.test(
      normalized
    )
  ) {
    return [
      "저는 Qwen 계열 기반으로 동작하는 AI 어시스턴트입니다.",
      "질문 답변, 요약, 글쓰기, 코드 설명과 같은 작업을 한국어로 도와드릴 수 있습니다."
    ].join(" ");
  }

  if (
    /뭐.*할\s*수|무엇.*할\s*수|가능한\s*일|도움.*줄|기능|지원\s*가능|해줄\s*수/.test(
      normalized
    )
  ) {
    return [
      "저는 질문 답변, 요약, 문서 작성, 코드 설명, 초안 작성 같은 작업을 도와드릴 수 있습니다.",
      "원하는 작업을 한국어로 바로 말씀해 주세요."
    ].join(" ");
  }

  if (/안녕|반가워|처음|헬로|hello|hi|도와줘/.test(normalized)) {
    return "안녕하세요. 한국어로 질문해 주시면 답변, 요약, 글쓰기, 코드 관련 작업을 도와드릴 수 있습니다.";
  }

  return null;
}
