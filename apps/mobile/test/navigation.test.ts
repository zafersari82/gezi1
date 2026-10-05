import type { MiniApp } from "@vado/contracts";
import { describe, expect, it } from "vitest";

import {
  hasLeftScope,
  isBridgeSender,
  mainDocumentScope,
} from "../src/features/miniapps/navigation";

const DIGEST = "a".repeat(64);
const WRAPPER = `https://api.vado.test/apps/randevu/wrapper/${DIGEST}/`;
const FILES = `https://api.vado.test/apps/randevu/files/${DIGEST}/`;

const BASE = {
  id: "randevu",
  name: "Kadıköy Berber",
  description: "",
  iconUrl: null,
  category: "beauty",
  developerName: "VADO",
  verified: true,
  version: "1.0.0",
  capabilities: [],
  consentKey: "0123456789abcdef",
} satisfies Partial<MiniApp>;

/** Paketle yayınlanan kayıt: kabuk sarmalayıcı belgeyi açar, paket onun çerçevesinde çalışır. */
const PACKAGED: MiniApp = {
  ...BASE,
  source: "package",
  entryUrl: WRAPPER,
  scope: [WRAPPER, FILES],
};
/** Geliştirme sunucusundan açılan kayıt: sayfa doğrudan açılır. */
const DEVELOPMENT: MiniApp = {
  ...BASE,
  source: "url",
  entryUrl: "http://192.168.1.20:5173/",
  scope: ["http://192.168.1.20:5173/"],
};

describe("mini uygulamanın kapsamından çıkma", () => {
  const SCOPE = PACKAGED.scope;

  it("sarmalayıcı belge ve paketin dosyaları kapsam içindedir", () => {
    expect(hasLeftScope(WRAPPER, SCOPE)).toBe(false);
    expect(hasLeftScope(`${FILES}index.html`, SCOPE)).toBe(false);
    expect(hasLeftScope(`${FILES}sayfalar/odeme.html?adim=2#ozet`, SCOPE)).toBe(false);
  });

  it("boş sayfa kapsam dışı sayılmaz", () => {
    expect(hasLeftScope("about:blank", SCOPE)).toBe(false);
  });

  it("başka alan adı, API'nin başka yolları ve başka kaydın paketi kapsam dışıdır", () => {
    expect(hasLeftScope("https://example.com/", SCOPE)).toBe(true);
    expect(hasLeftScope("https://api.vado.test/v1/me", SCOPE)).toBe(true);
    expect(
      hasLeftScope(`https://api.vado.test/apps/baska-kayit/files/${DIGEST}/index.html`, SCOPE),
    ).toBe(true);
    expect(
      hasLeftScope(`https://api.vado.test/apps/randevu/files/${"b".repeat(64)}/index.html`, SCOPE),
    ).toBe(true);
    expect(
      hasLeftScope(`https://api.vado.test/apps/randevu/wrapper/${"b".repeat(64)}/`, SCOPE),
    ).toBe(true);
  });

  it("kapsamı taklit eden yazımlar kapsam dışıdır", () => {
    expect(hasLeftScope(`${FILES}../../../../v1/me`, SCOPE)).toBe(true);
    expect(
      hasLeftScope(`https://api.vado.test.example.com/apps/randevu/files/${DIGEST}/`, SCOPE),
    ).toBe(true);
    expect(
      hasLeftScope(`https://api.vado.test/apps/randevu/files/${DIGEST}sahte/index.html`, SCOPE),
    ).toBe(true);
  });

  it("web sayfası olmayan adresler kapsam dışıdır", () => {
    for (const url of [
      "javascript:alert(1)",
      "file:///etc/passwd",
      "intent://tara#Intent;end",
      "tel:112",
      "",
    ]) {
      expect(hasLeftScope(url, SCOPE), url).toBe(true);
    }
  });
});

describe("ana sayfa olarak durabilecek adresler", () => {
  it("paketle yayınlanan kayıtta ana sayfa yalnızca sarmalayıcı belgedir", () => {
    const scope = mainDocumentScope(PACKAGED);
    expect(hasLeftScope(WRAPPER, scope)).toBe(false);
    // Paketin dosyası çerçevede yüklenebilir ama görünümün ana sayfası olamaz.
    expect(hasLeftScope(`${FILES}index.html`, scope)).toBe(true);
    expect(hasLeftScope("https://api.vado.test/", scope)).toBe(true);
  });

  it("geliştirme adresiyle açılan kayıtta sayfa kendi kapsamında gezinebilir", () => {
    const scope = mainDocumentScope(DEVELOPMENT);
    expect(hasLeftScope("http://192.168.1.20:5173/odeme?adim=2", scope)).toBe(false);
    expect(hasLeftScope("http://192.168.1.20:4000/v1/me", scope)).toBe(true);
  });
});

describe("köprü iletisinin göndereni", () => {
  it("paketle yayınlanan kayıtta ileti sarmalayıcı belgeden gelmelidir", () => {
    // iOS: gönderen çerçevenin adresi; eski Android WebView: ana sayfanın adresi.
    expect(isBridgeSender(WRAPPER, PACKAGED)).toBe(true);
    // Güncel Android WebView ve tarayıcı: gönderenin kaynağı bildirilir.
    expect(isBridgeSender("https://api.vado.test", PACKAGED)).toBe(true);
    expect(isBridgeSender("https://api.vado.test/", PACKAGED)).toBe(true);
  });

  it("paketin çerçevesi köprüye sarmalayıcıyı atlayarak ulaşamaz", () => {
    // Paket kimliksiz bir kaynakta çalışır; Android bu kaynağı "null" diye bildirir.
    expect(isBridgeSender("null", PACKAGED)).toBe(false);
    expect(isBridgeSender("", PACKAGED)).toBe(false);
    // iOS paketin çerçevesinin adresini bildirir; ana sayfa başka bir sayfa olmuşsa onunkini.
    expect(isBridgeSender(`${FILES}index.html`, PACKAGED)).toBe(false);
    expect(isBridgeSender("https://api.vado.test/v1/me", PACKAGED)).toBe(false);
    expect(isBridgeSender(`https://api.vado.test/apps/baska/wrapper/${DIGEST}/`, PACKAGED)).toBe(
      false,
    );
  });

  it("başka kaynaktan gelen ileti işlenmez", () => {
    for (const url of [
      "https://example.com",
      "https://example.com/",
      "https://api.vado.test.example.com",
      "http://api.vado.test",
      "https://api.vado.test:8443",
      "about:blank",
    ]) {
      expect(isBridgeSender(url, PACKAGED), url).toBe(false);
    }
  });

  it("alt alan adı kipinde yalnızca kaydın kendi alan adı kabul edilir", () => {
    const wrapper = `https://randevu.mini.vado.test/wrapper/${DIGEST}/`;
    const files = `https://randevu.mini.vado.test/files/${DIGEST}/`;
    const hosted: MiniApp = { ...PACKAGED, entryUrl: wrapper, scope: [wrapper, files] };

    expect(isBridgeSender(wrapper, hosted)).toBe(true);
    expect(isBridgeSender("https://randevu.mini.vado.test", hosted)).toBe(true);
    expect(isBridgeSender("https://baska-kayit.mini.vado.test", hosted)).toBe(false);
    expect(isBridgeSender("https://api.vado.test", hosted)).toBe(false);
  });

  it("geliştirme adresiyle açılan kayıtta ileti kaydın adres kapsamından gelmelidir", () => {
    expect(isBridgeSender("http://192.168.1.20:5173/odeme", DEVELOPMENT)).toBe(true);
    expect(isBridgeSender("http://192.168.1.20:5173", DEVELOPMENT)).toBe(true);
    expect(isBridgeSender("http://192.168.1.20:4000", DEVELOPMENT)).toBe(false);
    expect(isBridgeSender("null", DEVELOPMENT)).toBe(false);
  });
});
