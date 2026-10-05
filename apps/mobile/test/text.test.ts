import { describe, expect, it } from "vitest";

import { compareTr, foldText, hashOf, initialsOf, upperCaseTr } from "@/lib/text";

describe("foldText", () => {
  it("noktalı ve noktasız i harflerini aynı sonuca indirger", () => {
    expect(foldText("IŞIK")).toBe("isik");
    expect(foldText("Işık")).toBe("isik");
    expect(foldText("isik")).toBe("isik");
    expect(foldText("İSTANBUL")).toBe("istanbul");
  });

  it("Türkçe harfleri yalın karşılıklarına çevirir ve boşlukları kırpar", () => {
    expect(foldText("  Çağrı Öztürk  ")).toBe("cagri ozturk");
    expect(foldText("Şükrü Kâğıt")).toBe("sukru kagit");
  });
});

describe("upperCaseTr", () => {
  it("i harfini İ, ı harfini I yapar", () => {
    expect(upperCaseTr("ilik")).toBe("İLİK");
    expect(upperCaseTr("ılık")).toBe("ILIK");
  });
});

describe("initialsOf", () => {
  it("ilk ve son sözcüğün baş harflerini alır", () => {
    expect(initialsOf("Ayşe Yılmaz")).toBe("AY");
    expect(initialsOf("Mehmet Ali Demir")).toBe("MD");
  });

  it("tek sözcükte tek harf döndürür ve Türkçe büyük harf kullanır", () => {
    expect(initialsOf("ilker")).toBe("İ");
    expect(initialsOf("  ışıl  ")).toBe("I");
  });

  it("boş adda boş metin döndürür", () => {
    expect(initialsOf("   ")).toBe("");
  });
});

describe("hashOf", () => {
  it("aynı metne hep aynı sayıyı verir", () => {
    expect(hashOf("ayse")).toBe(hashOf("ayse"));
    expect(hashOf("ayse")).not.toBe(hashOf("mehmet"));
    expect(Number.isSafeInteger(hashOf("x".repeat(500)))).toBe(true);
  });
});

describe("compareTr", () => {
  it("Türkçe alfabe sırasını kullanır", () => {
    const names = ["Zeynep", "Şule", "Çağla", "Can", "Ömer", "Okan", "Ilgın", "İpek"];
    expect([...names].sort(compareTr)).toEqual([
      "Can",
      "Çağla",
      "Ilgın",
      "İpek",
      "Okan",
      "Ömer",
      "Şule",
      "Zeynep",
    ]);
  });
});
