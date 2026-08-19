"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useSession, displayHeadingStyle, inputStyle } from "@/components/ui";

interface Thread {
  threadKey: string;
  otherUserId: string;
  otherDisplayName: string | null;
  otherAvatarUrl: string | null;
  lastMessage: string | null;
  lastMessageAt: string;
  lastMessageFromMe: boolean;
}

interface ChatMessage {
  messageId: string;
  senderId: string;
  fromMe: boolean;
  body: string | null;
  createdAt: string;
}

/**
 * Direct messaging — an Exclusive-subscription benefit (see
 * src/lib/messaging/access.ts): a fan only sees this working with
 * creators they actively subscribe to, and a creator only with their own
 * active subscribers. Simple two-pane inbox, no realtime/websockets —
 * polls the open conversation, matching this app's existing pattern of
 * plain fetch-on-interval rather than a persistent connection.
 */
export default function MessagesPage() {
  return (
    <Suspense fallback={<main style={mainStyle} />}>
      <MessagesPageInner />
    </Suspense>
  );
}

function MessagesPageInner() {
  const { user, loading } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeUserId = searchParams.get("with");

  const [threads, setThreads] = useState<Thread[]>([]);
  const [threadsLoading, setThreadsLoading] = useState(true);

  function reloadThreads() {
    setThreadsLoading(true);
    fetch("/api/messages/threads")
      .then((r) => (r.ok ? r.json() : { threads: [] }))
      .then((body) => setThreads(body.threads ?? []))
      .finally(() => setThreadsLoading(false));
  }

  useEffect(() => {
    if (user) reloadThreads();
  }, [user]);

  if (loading) return <main style={mainStyle} />;
  if (!user) {
    return (
      <main style={mainStyle}>
        <h1 style={displayHeadingStyle}>Sign in required</h1>
      </main>
    );
  }

  const activeThread = threads.find((t) => t.otherUserId === activeUserId);

  return (
    <main style={mainStyle}>
      <h1 style={displayHeadingStyle}>Messages</h1>
      <p style={{ color: "var(--text-muted)", fontSize: "0.88rem", marginBottom: "1.75rem" }}>
        {user.role === "CREATOR"
          ? "Only your active Exclusive subscribers can message you here."
          : "You can message any creator you actively subscribe to (Exclusive)."}
      </p>
      <div style={layoutStyle}>
        <div style={threadListStyle}>
          {threadsLoading ? (
            <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>Loading...</p>
          ) : threads.length === 0 ? (
            <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
              No conversations yet.{" "}
              {user.role !== "CREATOR" && "Subscribe to a creator, then message them from their profile."}
            </p>
          ) : (
            threads.map((t) => (
              <button
                key={t.threadKey}
                onClick={() => router.push(`/messages?with=${t.otherUserId}`)}
                style={threadRowStyle(t.otherUserId === activeUserId)}
              >
                <div style={threadAvatarStyle}>
                  {t.otherAvatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={t.otherAvatarUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  ) : (
                    (t.otherDisplayName ?? "?").charAt(0).toUpperCase()
                  )}
                </div>
                <div style={{ overflow: "hidden", textAlign: "left" }}>
                  <div style={{ fontWeight: 600, fontSize: "0.9rem" }}>{t.otherDisplayName ?? "Unnamed"}</div>
                  <div style={threadPreviewStyle}>
                    {t.lastMessageFromMe ? "You: " : ""}
                    {t.lastMessage ?? ""}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
        <div style={conversationPaneStyle}>
          {activeUserId ? (
            <Conversation otherUserId={activeUserId} onSent={reloadThreads} />
          ) : (
            <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>Select a conversation.</p>
          )}
        </div>
      </div>
    </main>
  );
}

function Conversation({ otherUserId, onSent }: { otherUserId: string; onSent: () => void }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  function reload() {
    setError(null);
    fetch(`/api/messages/${otherUserId}`)
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => null);
          throw new Error(body?.error ?? "Couldn't load this conversation.");
        }
        return r.json();
      })
      .then((body) => setMessages(body.messages ?? []))
      .catch((e) => setError(e.message));
  }

  useEffect(reload, [otherUserId]);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "nearest" });
  }, [messages]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim()) return;
    setSending(true);
    const res = await fetch(`/api/messages/${otherUserId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: draft.trim() }),
    });
    setSending(false);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.error ?? "Couldn't send that.");
      return;
    }
    setDraft("");
    reload();
    onSent();
  }

  if (error) return <div style={{ color: "var(--danger)", fontSize: "0.85rem" }}>{error}</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={messageListStyle}>
        {messages.map((m) => (
          <div key={m.messageId} style={messageBubbleRowStyle(m.fromMe)}>
            <div style={messageBubbleStyle(m.fromMe)}>{m.body}</div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <form onSubmit={send} style={composerStyle}>
        <input
          style={{ ...inputStyle, marginTop: 0, flex: 1 }}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Message..."
          maxLength={4000}
        />
        <button type="submit" disabled={sending || !draft.trim()} style={sendButtonStyle}>
          Send
        </button>
      </form>
    </div>
  );
}

const mainStyle: React.CSSProperties = { padding: "2.5rem 1.75rem", maxWidth: "980px", margin: "0 auto" };

const layoutStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "260px 1fr",
  gap: "1.25rem",
  height: "560px",
};

const threadListStyle: React.CSSProperties = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: "14px",
  padding: "0.75rem",
  overflowY: "auto",
  display: "flex",
  flexDirection: "column",
  gap: "0.35rem",
};

function threadRowStyle(active: boolean): React.CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: "0.6rem",
    padding: "0.55rem",
    borderRadius: "10px",
    background: active ? "var(--accent-soft)" : "transparent",
    border: "none",
    cursor: "pointer",
    width: "100%",
  };
}

const threadAvatarStyle: React.CSSProperties = {
  width: "36px",
  height: "36px",
  borderRadius: "50%",
  background: "var(--surface-raised)",
  border: "1px solid var(--border)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontWeight: 600,
  color: "var(--accent)",
  overflow: "hidden",
  flexShrink: 0,
};

const threadPreviewStyle: React.CSSProperties = {
  fontSize: "0.78rem",
  color: "var(--text-muted)",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

const conversationPaneStyle: React.CSSProperties = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: "14px",
  padding: "1rem",
  display: "flex",
  flexDirection: "column",
};

const messageListStyle: React.CSSProperties = {
  flex: 1,
  overflowY: "auto",
  display: "flex",
  flexDirection: "column",
  gap: "0.5rem",
  paddingRight: "0.25rem",
};

function messageBubbleRowStyle(fromMe: boolean): React.CSSProperties {
  return { display: "flex", justifyContent: fromMe ? "flex-end" : "flex-start" };
}

function messageBubbleStyle(fromMe: boolean): React.CSSProperties {
  return {
    maxWidth: "75%",
    padding: "0.55rem 0.8rem",
    borderRadius: "14px",
    fontSize: "0.88rem",
    background: fromMe ? "var(--accent)" : "var(--surface-raised)",
    color: fromMe ? "var(--bg)" : "var(--text)",
  };
}

const composerStyle: React.CSSProperties = {
  display: "flex",
  gap: "0.6rem",
  marginTop: "0.75rem",
};

const sendButtonStyle: React.CSSProperties = {
  background: "var(--accent)",
  color: "var(--bg)",
  border: "none",
  borderRadius: "var(--radius)",
  padding: "0 1.1rem",
  fontWeight: 600,
  fontSize: "0.85rem",
  cursor: "pointer",
};
