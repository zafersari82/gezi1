import { describe, expect, it } from "vitest";

import { isInScope, originOf } from "../src";

describe("originOf", () => {
  it("şema, alan adı ve portu döndürür", () => {
    expect(originOf("https://randevu.example.com/sayfa?x=1#y")).toBe("https://randevu.example.com");
    expect(originOf("http://localhost:5173/")).toBe("http://localhost:5173");
  });

  it("web dışı ve bozuk adreslerde null döner", () => {
    expect(originOf("javascript:alert(1)")).toBeNull();
    expect(originOf("file:///etc/passwd")).toBeNull();
    expect(originOf("vado://q/abc")).toBeNull();
    expect(originOf("adres değil")).toBeNull();
  });
});

describe("isInScope", () => {
  describe("kaynak öneki (geliştirme kaydı)", () => {
    const scope = ["https://randevu.example.com/", "https://cdn.example.com:8443/"];

    it("izinli kaynaktaki her yolu kabul eder", () => {
      expect(isInScope("https://randevu.example.com/odeme/3", scope)).toBe(true);
      expect(isInScope("https://randevu.example.com", scope)).toBe(true);
      expect(isInScope("https://cdn.example.com:8443/a.js", scope)).toBe(true);
    });

    it.each([
      ["https://randevu.example.com.kotu.site/", "alan adı öneki taklidi"],
      ["https://randevu.example.com@kotu.site/", "kullanıcı adı kısmında taklit"],
      ["https://kotu.site/?https://randevu.example.com/", "sorgu içinde taklit"],
      ["http://randevu.example.com/", "şema farkı"],
      ["https://randevu.example.com:444/", "port farkı"],
      ["https://alt.randevu.example.com/", "alt alan adı"],
      ["https://cdn.example.com/", "izinli kaynağın portsuz hali"],
      ["about:blank", "boş sayfa"],
      ["javascript:alert(1)", "betik adresi"],
      ["adres değil", "bozuk adres"],
    ])("%s adresini reddeder (%s)", (url) => {
      expect(isInScope(url, scope)).toBe(false);
    });
  });

  describe("yol öneki (paket)", () => {
    const base = "https://api.example.com/apps/randevu/0123abcd/";

    it("paketin kendi klasöründeki dosyaları kabul eder", () => {
      expect(isInScope(`${base}index.html`, [base])).toBe(true);
      expect(isInScope(`${base}assets/app.js?v=1#x`, [base])).toBe(true);
    });

    it.each([
      ["https://api.example.com/apps/randevu/ffff9999/index.html", "başka sürüm"],
      ["https://api.example.com/apps/baska/0123abcd/index.html", "başka uygulama"],
      ["https://api.example.com/v1/me", "API uç noktası"],
      ["https://api.example.com/media/foto.png", "medya"],
      [`${base}../../baska/0123abcd/index.html`, "üst klasöre çıkma"],
      [`${base}%2e%2e/%2e%2e/baska/index.html`, "kodlanmış üst klasör"],
      ["https://api.example.com/apps/randevu/0123abcd", "sondaki bölü olmadan önek"],
      [
        "https://api.example.com/apps/randevu/0123abcdef/index.html",
        "önekle başlayan başka klasör",
      ],
    ])("%s adresini reddeder (%s)", (url) => {
      expect(isInScope(url, [base])).toBe(false);
    });

    it("bölüyle bitmeyen öneki hiç eşleştirmez", () => {
      const open = "https://api.example.com/apps/randevu/0123abcd";
      expect(isInScope(`${open}/index.html`, [open])).toBe(false);
    });
  });
});
