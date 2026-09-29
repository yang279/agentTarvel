import { useCallback, useRef, useState, useEffect } from "react";
import type { TripPlan } from "@travel/shared";
import {
  streamChat,
  listConversations,
  getConversation,
  deleteConversation,
  type ConversationSummary,
} from "./lib/api";
import { ItineraryView } from "./components/ItineraryView";
import { AmapMap } from "./components/AmapMap";

const QUICK_STARTS = [
  "我想去杭州玩3天，2个人，喜欢美食和自然风光",
  "带爸妈去北京玩4天，偏好历史文化，预算中等",
  "去成都吃3天，4个朋友，重点是火锅和小吃",
];

type ChatItem =
  | { kind: "user" | "assistant"; content: string }
  | { kind: "think"; stage: string; content: string };

interface SessionState {
  key: string;
  conversationId?: string;
  seq: number;
  items: ChatItem[];
  status: string;
  loading: boolean;
  itinerary: TripPlan | null;
  selectedKey: string | null;
  error: string;
}

function emptySession(key: string): SessionState {
  return {
    key,
    seq: 0,
    items: [],
    status: "",
    loading: false,
    itinerary: null,
    selectedKey: null,
    error: "",
  };
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" });
}

function ThinkBlock({ stage, content }: { stage: string; content: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="think-block">
      <button className="think-toggle" onClick={() => setOpen((o) => !o)}>
        <span className="think-caret">{open ? "▾" : "▸"}</span>
        思考过程 · {stage}
      </button>
      {open && <div className="think-content">{content}</div>}
    </div>
  );
}

export default function App() {
  const [sessions, setSessions] = useState<Record<string, SessionState>>({});
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [loadFailed, setLoadFailed] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [mapSplit, setMapSplit] = useState<number>(() => {
    try {
      const v = localStorage.getItem("mapSplit");
      const n = v ? parseFloat(v) : 0.35;
      return Number.isFinite(n) && n >= 0.15 && n <= 0.85 ? n : 0.35;
    } catch {
      return 0.35;
    }
  });
  const inputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const resultBodyRef = useRef<HTMLDivElement>(null);
  const mapBoxRef = useRef<HTMLDivElement>(null);
  const keyCounter = useRef(0);

  const active = activeKey ? sessions[activeKey] : null;
  const items = active?.items ?? [];
  const status = active?.status ?? "";
  const loading = active?.loading ?? false;
  const itinerary = active?.itinerary ?? null;
  const selectedKey = active?.selectedKey ?? null;
  const error = active?.error ?? "";

  const loadList = useCallback(async () => {
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        setConversations(await listConversations());
        setLoadFailed(false);
        return;
      } catch {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      }
    }
    setLoadFailed(true);
  }, []);

  useEffect(() => {
    loadList();
  }, [loadList]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [items, status]);

  function newKey(): string {
    keyCounter.current++;
    return `local-${keyCounter.current}`;
  }

  function newChat() {
    const key = newKey();
    setSessions((prev) => ({ ...prev, [key]: emptySession(key) }));
    setActiveKey(key);
    setIsFullscreen(false);
    inputRef.current?.focus();
  }

  function setActiveSessionError(key: string, message: string) {
    setSessions((prev) => {
      const s = prev[key];
      return s ? { ...prev, [key]: { ...s, error: message } } : prev;
    });
  }

  async function switchTo(id: string) {
    if (id === activeKey) return;
    if (sessions[id]) {
      setActiveKey(id);
      setIsFullscreen(false);
      return;
    }
    try {
      const detail = await getConversation(id);
      setSessions((prev) => {
        if (prev[id]) return prev;
        return {
          ...prev,
          [id]: {
            key: id,
            conversationId: id,
            seq: 0,
            items: detail.messages.map((m) => ({
              kind: m.role as "user" | "assistant",
              content: m.content,
            })),
            status: "",
            loading: false,
            itinerary: detail.itinerary,
            selectedKey: null,
            error: "",
          },
        };
      });
      setActiveKey(id);
      setIsFullscreen(false);
    } catch (e) {
      if (activeKey) setActiveSessionError(activeKey, (e as Error).message);
    }
  }

  async function del(id: string) {
    const wasActive = id === activeKey;
    setConversations((prev) => prev.filter((c) => c.id !== id));
    setSessions((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    if (wasActive) {
      const key = newKey();
      setSessions((prev) => ({ ...prev, [key]: emptySession(key) }));
      setActiveKey(key);
      setIsFullscreen(false);
    }
    try {
      await deleteConversation(id);
    } catch (e) {
      loadList();
      if (activeKey) setActiveSessionError(activeKey, `删除失败：${(e as Error).message}`);
    }
  }

  async function send(text: string) {
    const content = text.trim();
    if (!content) return;

    let key: string;
    let seq: number;
    let conversationId: string | undefined;
    if (activeKey && sessions[activeKey]) {
      key = activeKey;
      seq = sessions[activeKey].seq;
      conversationId = sessions[activeKey].conversationId;
    } else {
      key = newKey();
      seq = 0;
      conversationId = undefined;
      setSessions((prev) => ({ ...prev, [key]: emptySession(key) }));
      setActiveKey(key);
    }

    const mySeq = seq + 1;
    setSessions((prev) => {
      const existing = prev[key] ?? emptySession(key);
      return {
        ...prev,
        [key]: {
          ...existing,
          seq: mySeq,
          loading: true,
          error: "",
          status: "正在思考…",
          items: [...existing.items, { kind: "user" as const, content }],
        },
      };
    });
    if (inputRef.current) inputRef.current.value = "";

    let sessionRef = key;

    try {
      await streamChat(conversationId, content, {
        onMeta: (id) => {
          const oldKey = sessionRef;
          setSessions((prev) => {
            const cur = prev[oldKey];
            if (!cur) return prev;
            const next = { ...prev };
            next[id] = { ...cur, key: id, conversationId: id };
            if (oldKey !== id) delete next[oldKey];
            return next;
          });
          setActiveKey((prev) => (prev === oldKey ? id : prev));
          sessionRef = id;
          loadList();
        },
        onStatus: (msg, think) => {
          const k = sessionRef;
          setSessions((prev) => {
            const s = prev[k];
            if (!s || s.seq !== mySeq) return prev;
            return {
              ...prev,
              [k]: {
                ...s,
                status: msg,
                items: think
                  ? [...s.items, { kind: "think" as const, stage: msg, content: think }]
                  : s.items,
              },
            };
          });
        },
        onDone: (event) => {
          const k = sessionRef;
          setSessions((prev) => {
            const s = prev[k];
            if (!s || s.seq !== mySeq) return prev;
            return {
              ...prev,
              [k]: {
                ...s,
                loading: false,
                status: "",
                items: [
                  ...s.items,
                  { kind: "assistant" as const, content: event.reply || "已生成行程。" },
                ],
                itinerary: event.itinerary ?? s.itinerary,
                selectedKey: event.itinerary ? null : s.selectedKey,
              },
            };
          });
          loadList();
        },
        onError: (msg) => {
          const k = sessionRef;
          setSessions((prev) => {
            const s = prev[k];
            if (!s || s.seq !== mySeq) return prev;
            return { ...prev, [k]: { ...s, loading: false, status: "", error: msg } };
          });
        },
      });
    } catch (e) {
      const k = sessionRef;
      setSessions((prev) => {
        const s = prev[k];
        if (!s || s.seq !== mySeq) return prev;
        return {
          ...prev,
          [k]: { ...s, loading: false, status: "", error: (e as Error).message },
        };
      });
    }
  }

  function onSelect(key: string) {
    if (!activeKey) return;
    setSessions((prev) => {
      const s = prev[activeKey];
      return s ? { ...prev, [activeKey]: { ...s, selectedKey: key } } : prev;
    });
  }

  function onResizerDown(e: React.MouseEvent) {
    const container = resultBodyRef.current;
    const mapBox = mapBoxRef.current;
    if (!container || !mapBox) return;
    e.preventDefault();

    const rect = container.getBoundingClientRect();
    const horizontal = isFullscreen;
    const startPos = horizontal ? e.clientX : e.clientY;
    const startSize = horizontal ? rect.width : rect.height;
    const startSplit = mapSplit;

    const clamp = (v: number) => Math.min(0.85, Math.max(0.15, v));

    const onMove = (ev: MouseEvent) => {
      const delta = horizontal ? ev.clientX - startPos : startPos - ev.clientY;
      const next = clamp(startSplit + delta / startSize);
      mapBox.style.flex = `0 0 ${next * 100}%`;
    };
    const onUp = (ev: MouseEvent) => {
      const delta = horizontal ? ev.clientX - startPos : startPos - ev.clientY;
      const next = clamp(startSplit + delta / startSize);
      setMapSplit(next);
      try {
        localStorage.setItem("mapSplit", String(next));
      } catch {
        // ignore
      }
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="logo">🌍 旅游推荐 Agent</div>
        <div className="subtitle">用一句话定制你的专属游玩方案</div>
      </header>

      <div className="main">
        <div className={`sidebar${isFullscreen ? " hidden" : ""}`}>
          <button className="new-chat" onClick={newChat}>
            ＋ 新建行程
          </button>
          <div className="conv-list">
            {loadFailed && (
              <button className="conv-retry" onClick={loadList}>
                会话加载失败 · 点此重试
              </button>
            )}
            {conversations.map((c) => {
              const generating = !!sessions[c.id]?.loading;
              return (
                <div
                  key={c.id}
                  className={`conv-item${c.id === activeKey ? " active" : ""}`}
                  onClick={() => switchTo(c.id)}
                >
                  <span className="conv-title">{c.title || "未命名会话"}</span>
                  {generating && <span className="conv-generating">生成中</span>}
                  <span className="conv-time">{formatTime(c.createdAt)}</span>
                  <button
                    className="conv-del"
                    title="删除"
                    onClick={(e) => {
                      e.stopPropagation();
                      del(c.id);
                    }}
                  >
                    ×
                  </button>
                </div>
              );
            })}
            {!loadFailed && conversations.length === 0 && (
              <div className="conv-empty">暂无历史会话</div>
            )}
          </div>
        </div>

        <div className={`chat-panel${isFullscreen ? " hidden" : ""}`}>
          <div className="messages">
            {items.length === 0 && (
              <div className="welcome">
                <p>告诉我你的旅行计划，我会为你定制一份真实、可执行的游玩方案。</p>
                <p>例如：目的地、天数、人数、预算、兴趣偏好。</p>
                <div className="quick-starts">
                  {QUICK_STARTS.map((q) => (
                    <button key={q} className="quick" onClick={() => send(q)}>
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {items.map((item, i) =>
              item.kind === "think" ? (
                <ThinkBlock key={i} stage={item.stage} content={item.content} />
              ) : (
                <div key={i} className={`msg ${item.kind}`}>
                  <div className="avatar">{item.kind === "user" ? "我" : "旅"}</div>
                  <div className={`bubble ${item.kind}`}>{item.content}</div>
                </div>
              ),
            )}
            {status && (
              <div className="msg assistant">
                <div className="avatar">旅</div>
                <div className="bubble assistant typing">
                  <span className="spinner" /> {status}
                </div>
              </div>
            )}
            {error && <div className="bubble error">⚠️ {error}</div>}
            <div ref={bottomRef} />
          </div>

          <form
            className="composer"
            onSubmit={(e) => {
              e.preventDefault();
              send(inputRef.current?.value ?? "");
            }}
          >
            <input
              ref={inputRef}
              placeholder="例如：我想去杭州玩3天，2个人，喜欢美食"
              disabled={loading}
            />
            <button type="submit" disabled={loading}>
              发送
            </button>
          </form>
        </div>

        <div className={`result-panel${isFullscreen ? " fullscreen" : ""}`}>
          {itinerary ? (
            <>
              <div className="result-toolbar">
                <button
                  className="fs-btn"
                  onClick={() => setIsFullscreen((v) => !v)}
                >
                  {isFullscreen ? "✕ 退出全屏" : "⛶ 全屏"}
                </button>
              </div>
              <div className="result-body" ref={resultBodyRef}>
                <div className="result-scroll">
                  <ItineraryView
                    itinerary={itinerary}
                    selectedKey={selectedKey}
                    onSelect={onSelect}
                  />
                </div>
                <div className="resizer" onMouseDown={onResizerDown} />
                <div
                  className="map-box"
                  ref={mapBoxRef}
                  style={{ flex: `0 0 ${mapSplit * 100}%` }}
                >
                  <AmapMap
                    itinerary={itinerary}
                    selectedKey={selectedKey}
                    onSelect={onSelect}
                  />
                </div>
              </div>
            </>
          ) : (
            <div className="result-empty">
              <div className="empty-emoji">🗺️</div>
              <p>生成的行程会展示在这里</p>
              <p className="muted">包含逐日安排、真实景点与地图路线</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}