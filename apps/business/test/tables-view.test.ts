import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";

import { TablesView } from "../components/tables-view";
it.each(["owner", "manager", "staff"])("%s rolünde masa QR yetkisi görünümde korunur", (role) => {
  const html = renderToStaticMarkup(
    createElement(TablesView, {
      businessId: "business",
      appInstanceId: "instance",
      branches: [],
      initialRequests: [],
      initial: [
        {
          id: "table",
          branchId: "branch",
          appInstanceId: "instance",
          label: "Masa 1",
          active: true,
          version: 1,
          sessionId: null,
        },
      ],
      canWrite: role !== "staff",
    }),
  );
  if (role === "staff") {
    expect(html).not.toContain("Masa QR");
    expect(html).not.toContain("QR kodunu seç");
    expect(html).toContain("Bir masanın hesabını seç");
  } else {
    expect(html).toContain("Masa QR");
    expect(html).toContain("QR kodunu seç");
  }
});
