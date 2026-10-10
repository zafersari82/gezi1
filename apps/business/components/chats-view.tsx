"use client";

import {
  businessChatInboxSchema,
  businessChatMessageSchema,
  businessChatMessagesSchema,
  type BusinessChatOrder,
  businessChatOrderSchema,
  businessChatOrderStatusLabel,
  type BusinessChatReply,
  businessChatReplySchema,
} from "@vado/contracts";
import { type SyntheticEvent, useState } from "react";
import { z } from "zod";

import { call, errorMessage } from "../lib/client";

type Inbox = z.infer<typeof businessChatInboxSchema>;
type ChatMessage = z.infer<typeof businessChatMessageSchema>;

const orderLink = /^Siparişim\s*\nvado:\/\/\/orders\/([0-9a-f-]{36})\/([0-9a-f-]{36})$/i;
function ChatOrderRow({ conversationId, body }: { conversationId: string; body: string }) {
  const match = orderLink.exec(body.trim());
  const [order, setOrder] = useState<BusinessChatOrder | null>(null);
  const [error, setError] = useState("");
  if (
    match === null ||
    match[1]?.toLowerCase() !== conversationId.toLowerCase() ||
    match[2] === undefined
  )
    return <p>{body}</p>;
  const orderId = match[2];
  return (
    <div>
      <button
        type="button"
        onClick={() => {
          setError("");
          void call(
            businessChatOrderSchema,
            `/api/business/chats/${conversationId}/orders/${orderId}`,
          )
            .then(setOrder)
            .catch((cause: unknown) => {
              setError(errorMessage(cause));
            });
        }}
      >
        Siparişin güncel durumunu görüntüle
      </button>
      {order && (
        <p>
          {order.branchName} · {businessChatOrderStatusLabel(order.status)} ·{" "}
          {(order.totalMinor / 100).toLocaleString("tr-TR", { style: "currency", currency: "TRY" })}
        </p>
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}

/** İşletme gelen kutusu: aynı sohbet/mesaj motoru, fakat ayrı işletme erişim sınırı. */
export function ChatsView({ initial }: { initial: Inbox }) {
  const [inbox, setInbox] = useState(initial);
  const [selected, setSelected] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [olderCursor, setOlderCursor] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function load(conversationId: string) {
    setBusy(true);
    setError("");
    setSelected(conversationId);
    setMessages([]);
    setOlderCursor(null);
    try {
      const data = await call(
        businessChatMessagesSchema,
        `/api/business/chats/${conversationId}/messages?limit=30`,
      );
      setMessages(data.items);
      setOlderCursor(data.nextCursor);
      await call(
        z.object({ ok: z.boolean() }),
        `/api/business/chats/${conversationId}/read`,
        "POST",
        {},
      );
      setInbox((previous) => ({
        ...previous,
        items: previous.items.map((item) =>
          item.conversationId === conversationId ? { ...item, unreadCount: 0 } : item,
        ),
      }));
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  async function send(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (selected === null || busy) return;
    const body: BusinessChatReply = { body: text, clientId: crypto.randomUUID() };
    const checked = businessChatReplySchema.safeParse(body);
    if (!checked.success) {
      setError("Mesaj 1–4000 karakter arasında olmalı.");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const item = await call(
        businessChatMessageSchema,
        `/api/business/chats/${selected}/messages`,
        "POST",
        checked.data,
      );
      setMessages((previous) => [item, ...previous]);
      setInbox((previous) => ({
        ...previous,
        items: previous.items.map((thread) =>
          thread.conversationId === selected
            ? { ...thread, lastMessage: item.body, updatedAt: item.createdAt }
            : thread,
        ),
      }));
      setText("");
      setNotice("Yanıt gönderildi.");
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  async function moreInbox() {
    if (inbox.nextCursor === null || busy) return;
    setBusy(true);
    try {
      const page = await call(
        businessChatInboxSchema,
        `/api/business/chats?limit=30&cursor=${encodeURIComponent(inbox.nextCursor)}`,
      );
      setInbox((current) => ({
        items: [
          ...current.items,
          ...page.items.filter(
            (t) => !current.items.some((old) => old.conversationId === t.conversationId),
          ),
        ],
        nextCursor: page.nextCursor,
      }));
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }
  async function older() {
    if (!selected || !olderCursor || busy) return;
    setBusy(true);
    try {
      const page = await call(
        businessChatMessagesSchema,
        `/api/business/chats/${selected}/messages?limit=30&cursor=${encodeURIComponent(olderCursor)}`,
      );
      setMessages((previous) => [
        ...previous,
        ...page.items.filter((m) => !previous.some((p) => p.id === m.id)),
      ]);
      setOlderCursor(page.nextCursor);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="business-chats">
      <section aria-label="Gelen kutusu" className="business-chats-inbox">
        <h2>Gelen kutusu</h2>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            window.location.reload();
          }}
        >
          Yenile
        </button>
        {inbox.items.length === 0 && <p className="muted">Henüz müşteri mesajı yok.</p>}
        {inbox.items.map((thread) => (
          <button
            key={thread.conversationId}
            type="button"
            disabled={busy}
            className={selected === thread.conversationId ? "chat-thread active" : "chat-thread"}
            onClick={() => void load(thread.conversationId)}
          >
            <strong>{thread.customerName}</strong>
            {thread.unreadCount > 0 && (
              <span aria-label={`${thread.unreadCount} yeni mesaj`}>
                {" "}
                · {thread.unreadCount} yeni
              </span>
            )}
            <span>{thread.lastMessage ?? "Mesaj"}</span>
          </button>
        ))}
        {inbox.nextCursor !== null && (
          <button type="button" disabled={busy} onClick={() => void moreInbox()}>
            Daha fazla sohbet
          </button>
        )}
      </section>
      <section aria-label="İşletme sohbeti" className="business-chats-detail">
        {selected === null ? (
          <p className="muted">Konuşmak için soldan müşteri seç.</p>
        ) : (
          <>
            <h2>
              {inbox.items.find((item) => item.conversationId === selected)?.customerName ??
                "Müşteri"}
            </h2>
            <button type="button" disabled={busy} onClick={() => void load(selected)}>
              Mesajları yenile
            </button>
            {olderCursor !== null && (
              <button type="button" disabled={busy} onClick={() => void older()}>
                Eski mesajlar
              </button>
            )}
            <ol className="chat-messages">
              {[...messages].reverse().map((message) => (
                <li key={message.id}>
                  <strong>{message.fromCustomer ? "Müşteri" : "İşletme"}</strong>
                  <ChatOrderRow
                    conversationId={message.conversationId}
                    body={message.body || (message.kind === "image" ? "Fotoğraf" : "")}
                  />
                  <small>{new Date(message.createdAt).toLocaleString("tr-TR")}</small>
                </li>
              ))}
            </ol>
            <form onSubmit={(event) => void send(event)}>
              <label htmlFor="chat-reply">İşletme adına yanıtla</label>
              <textarea
                id="chat-reply"
                rows={3}
                maxLength={4000}
                value={text}
                onChange={(event) => {
                  setText(event.target.value);
                }}
              />
              <button
                className="primary-button"
                type="submit"
                disabled={busy || text.trim().length === 0}
              >
                Gönder
              </button>
            </form>
          </>
        )}
        {error && <p role="alert">{error}</p>}
        {notice && <p role="status">{notice}</p>}
      </section>
    </div>
  );
}
