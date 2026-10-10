import { expect, test } from "vitest";

import {
  capabilitySettingBodySchema,
  engineCapabilityManifestSchema,
  engineCapabilityVersionSchema,
} from "../src";

test("yetenek ayarı JSON verisidir; işlev, sonsuz sayı ve bilinmeyen gövde alanı reddedilir", () => {
  const body = { version: "1.0.0", enabled: true, config: {} };
  expect(capabilitySettingBodySchema.safeParse(body).success).toBe(true);
  for (const config of [{ run: () => true }, { value: Infinity }])
    expect(capabilitySettingBodySchema.safeParse({ ...body, config }).success).toBe(false);
  expect(capabilitySettingBodySchema.safeParse({ ...body, import: "harici-kod" }).success).toBe(
    false,
  );
  for (const version of ["01.0.0", "1.0", "next", "1.0.0;run()"])
    expect(engineCapabilityVersionSchema.safeParse(version).success).toBe(false);
});

test("manifest ve JSON Schema alanı çalıştırılabilir kod içeremez", () => {
  const manifest = {
    id: "ordering",
    version: "1.0.0",
    engine: "ordering",
    dependsOn: [],
    configSchema: {},
    defaults: {},
    permissions: [],
    events: { publishes: [], subscribes: [] },
    stateMachine: { insertions: [] },
    api: [],
    customerBlocks: [],
    businessBlocks: [],
    validation: [],
  };
  expect(engineCapabilityManifestSchema.safeParse(manifest).success).toBe(true);
  expect(
    engineCapabilityManifestSchema.safeParse({
      ...manifest,
      load: "https://harici.example/code.js",
    }).success,
  ).toBe(false);
  expect(
    engineCapabilityManifestSchema.safeParse({ ...manifest, configSchema: { run: () => true } })
      .success,
  ).toBe(false);
  expect(
    engineCapabilityManifestSchema.safeParse({ ...manifest, validation: [() => true] }).success,
  ).toBe(false);
});

test("işletme manifesti iade ve değerlendirme görünümlerini tanır; bilinmeyeni reddeder", () => {
  const manifest = {
    id: "ordering",
    version: "1.0.0",
    engine: "ordering",
    dependsOn: [],
    configSchema: {},
    defaults: {},
    permissions: ["returns.read", "reviews.read"],
    events: { publishes: [], subscribes: [] },
    stateMachine: { insertions: [] },
    api: [],
    customerBlocks: [],
    businessBlocks: [
      { id: "returns", title: "İadeler", view: "returns", path: "/returns" },
      { id: "reviews", title: "Değerlendirmeler", view: "reviews", path: "/reviews" },
    ],
    validation: [],
  };
  expect(engineCapabilityManifestSchema.safeParse(manifest).success).toBe(true);
  expect(
    engineCapabilityManifestSchema.safeParse({
      ...manifest,
      businessBlocks: [{ id: "unknown", title: "Bilinmeyen", view: "admin", path: "/admin" }],
    }).success,
  ).toBe(false);
});
