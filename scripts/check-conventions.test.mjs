import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

/** Denetim kuralının gerçek komut yoluyla ihlali yakaladığını sınar. */
async function expectRuleViolation(relativePath, content, expectedMessage) {
  const probe = join(ROOT, relativePath);
  await writeFile(probe, content);
  try {
    const result = spawnSync(process.execPath, ["scripts/check-conventions.mjs"], {
      cwd: ROOT,
      encoding: "utf8",
      timeout: 20_000,
    });
    assert.equal(result.status, 1, result.stderr);
    assert.ok(result.stderr.includes(`${relativePath}:1`), result.stderr);
    assert.match(result.stderr, expectedMessage);
  } finally {
    await unlink(probe);
  }
}

test("çekirdek TypeScript dosyasındaki sektör kavramını reddeder", async () => {
  await expectRuleViolation(
    "apps/api/src/core/alan-kurali-probe.ts",
    'export const category = "restaurant";\n',
    /Sektör kavramı/,
  );
});

test("yeni çekirdek şemasındaki sektör kavramını reddeder", async () => {
  await expectRuleViolation(
    "apps/api/migrations/0037_ordering_probe.sql",
    "-- Yeni sipariş çekirdeğinde kitchen adı kullanılamaz.\n",
    /Sektör kavramı/,
  );
});

test("eski masa köprüsü yönteminin SDK kaynaklarına eklenmesini reddeder", async () => {
  await expectRuleViolation(
    "packages/miniapp-sdk/src/eski-kopru-probe.ts",
    'export const method = "ordering.joinTable";\n',
    /Eski masa köprüsü/,
  );
});
