"use client";

import {
  type ChannelPage,
  channelPageSchema,
  channelPostBodySchema,
  channelPostSchema,
} from "@vado/contracts";
import { type SyntheticEvent, useState } from "react";
import { z } from "zod";

import { call, errorMessage } from "../lib/client";

/** İşletme duyuruları düzenlenmez; yanlış duyuru geri çekilip yeni kayıt oluşturulur. */
export function ChannelsView({ initial }: { initial: ChannelPage }) {
  const [page, setPage] = useState(initial);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function publish(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = channelPostBodySchema.safeParse({ body });
    if (!parsed.success) {
      setError("Duyuru 1–500 karakter arasında olmalı.");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const post = await call(
        channelPostSchema,
        "/api/business/channel/posts",
        "POST",
        parsed.data,
      );
      setPage((previous) => ({ ...previous, items: [post, ...previous.items] }));
      setBody("");
      setNotice("Duyuru yayımlandı.");
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  async function withdraw(id: string) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await call(
        z.object({ ok: z.boolean() }),
        `/api/business/channel/posts/${id}/withdraw`,
        "POST",
        {},
      );
      setPage((previous) => ({
        ...previous,
        items: previous.items.filter((item) => item.id !== id),
      }));
      setNotice("Duyuru yayından kaldırıldı.");
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  async function more() {
    if (page.nextCursor === null || busy) return;
    setBusy(true);
    setError("");
    try {
      const next = await call(
        channelPageSchema,
        `/api/business/channel/posts?limit=20&cursor=${encodeURIComponent(page.nextCursor)}`,
      );
      setPage((previous) => ({
        items: [
          ...new Map([...previous.items, ...next.items].map((item) => [item.id, item])).values(),
        ],
        nextCursor: next.nextCursor,
      }));
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="channel-editor">
      <form onSubmit={(event) => void publish(event)}>
        <label htmlFor="channel-message">Yeni duyuru</label>
        <textarea
          id="channel-message"
          rows={4}
          maxLength={500}
          value={body}
          placeholder="Bugün mağazamızda neler var?"
          onChange={(event) => {
            setBody(event.target.value);
          }}
        />
        <p className="muted">{body.length}/500 · Takipçiler, VADO içinden görür.</p>
        <button
          className="primary-button"
          type="submit"
          disabled={busy || body.trim().length === 0}
        >
          Duyuruyu yayımla
        </button>
      </form>
      {error && (
        <p role="alert" className="channel-error">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="channel-notice">
          {notice}
        </p>
      )}
      <h2>Yayımlanan duyurular</h2>
      {page.items.length === 0 && <p className="muted">Henüz duyuru bulunmuyor.</p>}
      <ul className="channel-posts">
        {page.items.map((item) => (
          <li key={item.id}>
            <p>{item.body}</p>
            <small className="muted">{new Date(item.publishedAt).toLocaleString("tr-TR")}</small>
            <button type="button" disabled={busy} onClick={() => void withdraw(item.id)}>
              Yayından kaldır
            </button>
          </li>
        ))}
      </ul>
      {page.nextCursor && (
        <button type="button" disabled={busy} onClick={() => void more()}>
          Daha fazla yükle
        </button>
      )}
    </section>
  );
}
