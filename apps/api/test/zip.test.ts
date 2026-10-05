import { deflateRawSync } from "node:zlib";

import { describe, expect, it } from "vitest";

import { readZip, writeZip, ZipError, type ZipLimits } from "../src/core/zip";
import { type CraftedEntry, type CraftOptions, craftZip } from "./support/zip-craft";

const LIMITS: ZipLimits = { files: 10, totalBytes: 100_000 };
const text = (value: string) => Buffer.from(value);

function read(entries: readonly CraftedEntry[], options?: CraftOptions, limits = LIMITS) {
  return readZip(craftZip(entries, options), limits);
}

/** Arşivin verilen iletiyle reddedildiğini doğrular. */
function expectRejected(run: () => unknown, message: RegExp): void {
  expect(run).toThrow(ZipError);
  expect(run).toThrow(message);
}

describe("zip okuyucu: geçerli arşivler", () => {
  it("depolanmış ve sıkıştırılmış dosyaları okur", () => {
    const repeated = text("VADO ".repeat(400));
    const entries = read([
      { name: "index.html", data: text("<!doctype html>") },
      { name: "assets/app.js", data: repeated, method: 8 },
      { name: "bos.txt" },
    ]);
    expect(entries.map((entry) => entry.path)).toEqual(["index.html", "assets/app.js", "bos.txt"]);
    expect(entries[0]?.data.toString()).toBe("<!doctype html>");
    expect(entries[1]?.data.equals(repeated)).toBe(true);
    expect(entries[2]?.data).toHaveLength(0);
  });

  it("klasör kayıtlarını atlar, arşiv açıklamasını kabul eder", () => {
    const entries = read(
      [
        { name: "assets/" },
        { name: "assets/app.js", data: text("x"), madeBy: 0x0314, mode: 0o100644 },
      ],
      { comment: text("üretim paketi") },
    );
    expect(entries.map((entry) => entry.path)).toEqual(["assets/app.js"]);
  });

  it("boş arşivi dosyasız olarak okur", () => {
    expect(read([])).toEqual([]);
  });
});

describe("zip okuyucu: reddedilen arşivler", () => {
  it.each([
    ["boş dosya", Buffer.alloc(0)],
    ["zip olmayan içerik", text("<!doctype html><title>zip değil</title>")],
    ["yarıda kesilmiş arşiv", craftZip([{ name: "a.js", data: text("abc") }]).subarray(0, 40)],
  ])("zip olmayan veriyi reddeder: %s", (_label, archive) => {
    expectRejected(() => readZip(archive, LIMITS), /zip arşivi değil/);
  });

  it("başına ya da sonuna veri eklenmiş arşivi reddeder", () => {
    const entry = { name: "a.js", data: text("abc") };
    expectRejected(() => read([entry], { prefix: text("#!/bin/sh\n") }), /tutarsız/);
    expectRejected(() => read([entry], { suffix: text("ek veri") }), /zip arşivi değil/);
  });

  it("şifreli dosyayı reddeder", () => {
    expectRejected(() => read([{ name: "a.js", data: text("abc"), flags: 0x0001 }]), /Şifreli/);
    expectRejected(
      () => read([{ name: "a.js", data: text("abc"), local: { flags: 0x0001 } }]),
      /tutarsız/,
    );
  });

  it("sembolik bağlantıyı ve özel dosyaları reddeder", () => {
    const link = { name: "config.json", data: text("/etc/passwd"), madeBy: 0x0314 };
    expectRejected(() => read([{ ...link, mode: 0o120777 }]), /Sembolik bağlantı/);
    expectRejected(() => read([{ ...link, mode: 0o060644 }]), /Sembolik bağlantı/);
  });

  it("ASCII dışı dosya adını reddeder", () => {
    expectRejected(() => read([{ name: "görsel.png", data: text("x") }]), /ASCII/);
    expectRejected(() => read([{ name: Buffer.from("a\u0000.js"), data: text("x") }]), /ASCII/);
  });

  it("aynı adı büyük küçük harf farkıyla yineleyen arşivi reddeder", () => {
    expectRejected(
      () =>
        read([
          { name: "index.html", data: text("a") },
          { name: "INDEX.html", data: text("b") },
        ]),
      /birden çok kez/,
    );
  });

  it("desteklenmeyen sıkıştırma yöntemini reddeder", () => {
    expectRejected(() => read([{ name: "a.js", data: text("abc"), method: 12 }]), /yöntemi/);
  });

  it("dosya sayısı sınırını aşan arşivi reddeder", () => {
    const many = Array.from({ length: 4 }, (_, index) => ({ name: `f${index}.js` }));
    expectRejected(() => read(many, {}, { files: 3, totalBytes: 100 }), /en çok 3 dosya/);
    const folders = Array.from({ length: 7 }, (_, index) => ({ name: `d${index}/` }));
    expectRejected(() => read(folders, {}, { files: 3, totalBytes: 100 }), /en çok 3 dosya/);
  });

  it("açılmış boyutu sınırı aşan arşivi, tek bayt açmadan reddeder", () => {
    const zeros = Buffer.alloc(60_000);
    expectRejected(
      () =>
        read([
          { name: "a.js", data: zeros, method: 8 },
          { name: "b.js", data: zeros, method: 8 },
        ]),
      /açılmış boyutu sınırı/,
    );
  });

  it("bildirdiğinden büyük açılan dosyayı reddeder (zip bombası)", () => {
    const bomb = deflateRawSync(Buffer.alloc(5_000_000));
    expectRejected(
      () => read([{ name: "a.js", method: 8, body: bomb, size: 10, crc: 0 }]),
      /bildirilen boyuttan büyük/,
    );
  });

  it("boyutu ya da sağlama toplamı tutmayan dosyayı reddeder", () => {
    expectRejected(() => read([{ name: "a.js", data: text("abc"), crc: 1 }]), /bozuk/);
    expectRejected(() => read([{ name: "a.js", data: text("abc"), size: 2 }]), /bozuk/);
    expectRejected(
      () => read([{ name: "a.js", data: text("abc"), method: 8, body: text("deflate değil") }]),
      /açılamadı/,
    );
  });

  it("dizini ile yerel başlığı farklı şeyler söyleyen arşivi reddeder", () => {
    expectRejected(
      () => read([{ name: "zararsiz.txt", data: text("abc"), local: { name: "zararli.js" } }]),
      /tutarsız/,
    );
    expectRejected(
      () => read([{ name: "a.js", data: text("abc"), local: { method: 8 } }]),
      /tutarsız/,
    );
    expectRejected(() => read([{ name: "a.js", data: text("abc"), offset: 5 }]), /tutarsız/);
    expectRejected(() => read([{ name: "a.js", data: text("abc"), offset: 90_000 }]), /tutarsız/);
  });

  it("aynı veriyi birden çok dosya olarak gösteren arşivi reddeder", () => {
    // İkinci kayıt, birinci dosyanın verisinin içine gömülmüş bir yerel başlığı gösterir.
    const inner = craftZip([{ name: "b.js", data: text("gizli") }]).subarray(0, 30 + 4 + 5);
    expectRejected(
      () =>
        read([
          { name: "a.txt", data: inner },
          { name: "b.js", data: text("gizli"), offset: 30 + 5, directoryOnly: true },
        ]),
      /üst üste biniyor/,
    );
  });

  it("ZIP64 ve çok parçalı arşivleri reddeder", () => {
    const entry = { name: "a.js", data: text("abc") };
    expectRejected(() => read([entry], { count: 0xffff }), /ZIP64|Çok parçalı/);
    expectRejected(() => read([entry], { disk: 1 }), /Çok parçalı/);
    expectRejected(() => read([{ ...entry, size: 0xffffffff }]), /ZIP64/);
  });

  it("veri taşıyan klasör kaydını reddeder", () => {
    expectRejected(() => read([{ name: "assets/", data: text("abc") }]), /Klasör kaydı/);
  });

  it("dizindeki kayıt sayısı gerçek sayıyla tutmayan arşivi reddeder", () => {
    expectRejected(() => read([{ name: "a.js", data: text("abc") }], { count: 2 }), /tutarsız/);
  });
});

describe("zip yazıcı", () => {
  const files = [
    { path: "index.html", data: text("<!doctype html>") },
    { path: "assets/app.js", data: text("console.log('merhaba');".repeat(50)) },
    { path: "icon.png", data: Buffer.from([0x89, 0x50, 0x4e, 0x47]) },
  ];

  it("yazdığını okuyucu aynen geri okur", () => {
    const entries = readZip(writeZip(files), LIMITS);
    expect(entries.map((entry) => entry.path)).toEqual(["assets/app.js", "icon.png", "index.html"]);
    for (const file of files) {
      const found = entries.find((entry) => entry.path === file.path);
      expect(found?.data.equals(file.data)).toBe(true);
    }
  });

  it("aynı dosyalar, veriliş sırasından bağımsız olarak bayt bayt aynı arşivi verir", () => {
    expect(writeZip([...files].reverse()).equals(writeZip(files))).toBe(true);
  });
});
