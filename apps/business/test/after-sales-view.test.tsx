import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";

import { ReturnsView } from "../components/returns-view";
import { ReviewsView } from "../components/reviews-view";

const businessId = "1a8ec98b-29f2-4700-a83d-060e421ad831";
const orderId = "ffbc84ad-e29d-44ee-b237-2e75f4b13941";
const now = "2026-10-09T10:00:00.000Z";

test("iade ekranı işletme kapsamına ait başvuru tutarını ve durumunu gösterir", () => {
  const html = renderToStaticMarkup(
    createElement(ReturnsView, {
      initial: {
        items: [
          {
            id: "1918e9ce-06b3-4a67-ac66-0978d95b9db1",
            businessId,
            orderId,
            appInstanceId: "be1e62db-2e75-45f8-8d51-5842d2a6d9f7",
            businessCustomerId: "1c8ecb3b-3da8-451d-8950-e5a06e361e21",
            orderVersion: 2,
            kind: "refund",
            amountMinor: 1050,
            reason: "Eksik ürün",
            status: "pending",
            decisionReason: null,
            memberId: null,
            version: 1,
            receipt: null,
            createdAt: now,
            updatedAt: now,
          },
        ],
        nextCursor: null,
      },
    }),
  );
  expect(html).toContain("İade ve iptal talepleri");
  expect(html).toContain("Bekleyen");
  expect(html).toContain("10,50");
  expect(html).not.toContain("İşlem anahtarı");
});

test("personel yorumu görür ama yanıt yazma yetkisi olmadan açılır", () => {
  const initial = {
    items: [
      {
        id: "1b6fb94a-13a6-4191-ac39-f5e801f9d2e6",
        businessId,
        orderId,
        businessCustomerId: "0393aeda-105b-42cf-a19c-bba949af0854",
        rating: 4,
        comment: "Hızlı geldi",
        reply: null,
        visibility: "published" as const,
        version: 1,
        createdAt: now,
        updatedAt: now,
      },
    ],
    nextCursor: null,
  };
  const html = renderToStaticMarkup(createElement(ReviewsView, { initial, canReply: false }));
  expect(html).toContain("Hızlı geldi");
  expect(html).toContain("★★★★☆");
  expect(html).not.toContain("Yanıtı kaydet");
});
