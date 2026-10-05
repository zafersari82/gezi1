import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { deflateRawSync } from "node:zlib";

import { type PackageFinding, type PackageProblem } from "@vado/contracts";
import { describe, expect, it } from "vitest";

import { AppError } from "../src/core/errors";
import { writeZip } from "../src/core/zip";
import { buildPackage } from "../src/modules/packages/package-directory";
import {
  type InspectedPackage,
  type InspectionRules,
  inspectPackage,
} from "../src/modules/packages/package-inspection";
import { packageArchive, packageFiles, type PackageSource } from "./support/packages";
import { craftZip } from "./support/zip-craft";

const RULES: InspectionRules = { maxArchiveBytes: 1024 * 1024, allowInsecureNetwork: false };
const SAMPLE: PackageSource = { id: "ornek-paket", version: "1.0.0" };

function inspect(source: Partial<PackageSource> = {}, rules = RULES): InspectedPackage {
  return inspectPackage(packageArchive({ ...SAMPLE, ...source }), rules);
}

/** Paketin reddedildiğini doğrular ve bulunan sorunları döndürür. */
function problemsOf(run: () => unknown): PackageProblem[] {
  try {
    run();
  } catch (error) {
    if (error instanceof AppError && error.code === "package_invalid") {
      return error.details as PackageProblem[];
    }
    throw error;
  }
  throw new Error("Paket reddedilmeliydi");
}

function findingsOf(files: PackageSource["files"]): PackageFinding[] {
  return inspect({ files }).findings;
}

describe("paket denetimi: kabul", () => {
  it("geçerli paketin bildirimini, dosyalarını ve özetini çıkarır", () => {
    const result = inspect();
    expect(result.manifest).toMatchObject({
      id: "ornek-paket",
      version: "1.0.0",
      entry: "index.html",
      icon: "icon.png",
      permissions: [],
      network: [],
    });
    expect(result.files.map((file) => file.path).sort()).toEqual([
      "assets/app.js",
      "assets/style.css",
      "icon.png",
      "index.html",
      "vado.app.json",
    ]);
    expect(result.files.find((file) => file.path === "assets/app.js")).toMatchObject({
      contentType: "text/javascript; charset=utf-8",
      sha256: expect.stringMatching(/^[0-9a-f]{64}$/) as string,
    });
    expect(result.digest).toMatch(/^[0-9a-f]{64}$/);
    expect(result.sizeBytes).toBe(result.files.reduce((total, file) => total + file.size, 0));
    expect(result.findings).toEqual([]);
  });

  it("özet arşivin sıkıştırma biçimine değil yalnızca dosyalara bağlıdır", () => {
    const files = packageFiles(SAMPLE);
    const stored = craftZip(Object.entries(files).map(([name, data]) => ({ name, data })));
    const deflated = craftZip(
      Object.entries(files)
        .reverse()
        .map(([name, data]) => ({
          name,
          data,
          method: 8,
          body: deflateRawSync(data, { level: 1 }),
        })),
      { comment: Buffer.from("başka bir araçla üretildi") },
    );
    expect(stored.equals(deflated)).toBe(false);
    expect(inspectPackage(stored, RULES).digest).toBe(inspect().digest);
    expect(inspectPackage(deflated, RULES).digest).toBe(inspect().digest);
  });

  it("tek bir bayt değişince özet değişir", () => {
    const changed = inspect({ files: { "assets/style.css": "body { margin: 1px; }\n" } });
    expect(changed.digest).not.toBe(inspect().digest);
    const renamed = inspect({
      files: { "assets/style.css": null, "assets/stil.css": "body { margin: 0; }\n" },
    });
    expect(renamed.digest).not.toBe(inspect().digest);
  });

  it("bildirim dosyasının başındaki BOM işaretini yok sayar", () => {
    const manifest = JSON.stringify({ manifest: 1, id: SAMPLE.id, version: "1.0.0", name: "BOM" });
    expect(inspect({ files: { "vado.app.json": `\uFEFF${manifest}` } }).manifest.name).toBe("BOM");
  });
});

describe("paket denetimi: ret", () => {
  it("sınırı aşan arşivi açmadan reddeder", () => {
    const archive = packageArchive(SAMPLE);
    expect(() =>
      inspectPackage(archive, { ...RULES, maxArchiveBytes: archive.length - 1 }),
    ).toThrow(expect.objectContaining({ code: "package_too_large" }) as Error);
  });

  it("açılmış boyutu arşiv sınırının dört katını aşan paketi reddeder", () => {
    const big = { "assets/veri.js": Buffer.alloc(4 * 1024 * 1024 + 1) };
    expect(problemsOf(() => inspect({ files: big }))).toEqual([
      { file: null, message: "Arşivin açılmış boyutu sınırı aşıyor." },
    ]);
  });

  it("zip olmayan dosyayı reddeder", () => {
    expect(problemsOf(() => inspectPackage(Buffer.from("zip değil"), RULES))).toEqual([
      { file: null, message: "Dosya bir zip arşivi değil." },
    ]);
  });

  it("bildirim dosyası kökte değilse nedenini söyler", () => {
    const nested = writeZip(
      Object.entries(packageFiles(SAMPLE)).map(([path, data]) => ({ path: `dist/${path}`, data })),
    );
    const problems = problemsOf(() => inspectPackage(nested, RULES));
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({ file: "vado.app.json" });
    expect(problems[0]?.message).toContain("arşivin kökünde");
  });

  it("geçersiz JSON bildirimi reddeder", () => {
    expect(problemsOf(() => inspect({ files: { "vado.app.json": "{ id: randevu }" } }))).toEqual([
      { file: "vado.app.json", message: "Dosya geçerli bir JSON değil." },
    ]);
  });

  it("bildirimdeki bütün sorunları alan adıyla ve Türkçe bildirir", () => {
    const problems = problemsOf(() =>
      inspect({
        manifest: {
          version: "1.0",
          entry: "main.js",
          engine: "food",
          permissions: ["contacts.read"],
          network: ["https://api.ornek.com/v1"],
        },
      }),
    );
    const messages = problems.map((problem) => problem.message);
    expect(problems.every((problem) => problem.file === "vado.app.json")).toBe(true);
    expect(messages).toEqual(
      expect.arrayContaining([
        "version: Sürüm numarası ana.alt.yama biçiminde olmalı (örnek: 1.4.0)",
        "entry: Giriş sayfası bir .html dosyası olmalı",
        'Tanınmayan anahtar: "engine"',
        "network.0: Adres yalnızca şema ve alan adından oluşmalı (örnek: https://api.ornek.com)",
      ]) as string[],
    );
    expect(messages.some((message) => message.startsWith("permissions.0: Geçersiz seçenek"))).toBe(
      true,
    );
  });

  it("kurallara uymayan dosya yollarını ve türlerini tek tek bildirir", () => {
    const problems = problemsOf(() =>
      inspect({
        files: {
          "../kacak.js": "x",
          ".env": "GIZLI=1",
          "__MACOSX/._index.html": "x",
          "assets/dosya adi.js": "x",
          "sunucu.php": "<?php",
          "modul.wasm": Buffer.from([0, 0x61, 0x73, 0x6d]),
          "arsiv.zip": "x",
          uzantisiz: "x",
        },
      }),
    );
    const byFile = new Map(problems.map((problem) => [problem.file, problem.message]));
    for (const path of ["../kacak.js", ".env", "__MACOSX/._index.html", "assets/dosya adi.js"]) {
      expect(byFile.get(path), path).toContain("Dosya yolu kurallara uymuyor");
    }
    for (const path of ["sunucu.php", "modul.wasm", "arsiv.zip", "uzantisiz"]) {
      expect(byFile.get(path), path).toBe("Bu dosya türü pakete giremez.");
    }
    expect(problems).toHaveLength(8);
  });

  it("bildirimdeki giriş sayfası ya da simge pakette yoksa reddeder", () => {
    expect(problemsOf(() => inspect({ manifest: { entry: "app/index.html" } }))).toEqual([
      { file: "app/index.html", message: "Giriş sayfası pakette yok." },
    ]);
    expect(problemsOf(() => inspect({ files: { "icon.png": null } }))).toEqual([
      { file: "icon.png", message: "Simge dosyası pakette yok." },
    ]);
  });

  it("şifresiz adresi yalnızca geliştirme kipinde kabul eder", () => {
    const manifest = {
      network: ["https://api.ornek.com", "http://localhost:3001", "ws://localhost:3002"],
    };
    expect(problemsOf(() => inspect({ manifest }))).toEqual([
      {
        file: "vado.app.json",
        message: "Yalnızca şifreli (https, wss) adreslere bağlanılabilir: http://localhost:3001",
      },
      {
        file: "vado.app.json",
        message: "Yalnızca şifreli (https, wss) adreslere bağlanılabilir: ws://localhost:3002",
      },
    ]);
    const relaxed = inspect({ manifest }, { ...RULES, allowInsecureNetwork: true });
    expect(relaxed.manifest.network).toHaveLength(3);
  });

  it("çok sayıda sorunu sınırlı bir listeyle bildirir", () => {
    const files = Object.fromEntries(
      Array.from({ length: 80 }, (_, index) => [`veri${index}.exe`, "x"]),
    );
    expect(problemsOf(() => inspect({ files }))).toHaveLength(50);
  });
});

describe("paket denetimi: otomatik bulgular", () => {
  const codes = (findings: PackageFinding[], level: PackageFinding["level"]) =>
    findings.filter((finding) => finding.level === level).map((finding) => finding.code);

  it("çalışma anında engellenecek betik kullanımlarını işaretler", () => {
    const findings = findingsOf({
      "assets/app.js": [
        'const sonuc = eval("1 + 1");',
        'const f = new Function("return this");',
        'localStorage.setItem("a", "1"); document.cookie = "a=1";',
        'navigator.serviceWorker.register("./sw.js"); new Worker("./w.js");',
        "WebAssembly.instantiate(bytes);",
        'window.open("https://ornek.com");',
        'import("https://cdn.ornek.com/kitaplik.js");',
      ].join("\n"),
    });
    expect(codes(findings, "blocked").sort()).toEqual([
      "dynamic_code",
      "popup",
      "remote_script",
      "wasm",
      "web_storage",
      "worker",
    ]);
    const dynamic = findings.find((finding) => finding.code === "dynamic_code");
    expect(dynamic).toMatchObject({ file: "assets/app.js" });
    expect(dynamic?.message).toContain("2 yerde geçiyor");
    expect(dynamic?.message).toContain("eval(");
  });

  it("gezinme denemelerini inceleyene bırakır", () => {
    const findings = findingsOf({
      "assets/app.js": 'window.location = "https://baska.ornek.com"; location.replace("/x");',
      "index.html":
        '<!doctype html><meta http-equiv="refresh" content="0; url=https://x.ornek.com">',
    });
    expect(codes(findings, "review")).toEqual(["navigation", "navigation"]);

    const reload = findingsOf({ "assets/app.js": "button.onclick = () => location.reload();" });
    expect(codes(reload, "review")).toEqual(["navigation"]);
    expect(reload[0]?.message).toContain("denerse kapatılır");
  });

  it("güvenlik politikasının sınırlayamadığı WebRTC kullanımını inceleyene bırakır", () => {
    const findings = findingsOf({
      "assets/app.js": [
        'const baglanti = new RTCPeerConnection({ iceServers: [{ urls: "stun:x.ornek.com" }] });',
        "const eski = new webkitRTCPeerConnection();",
        'baglanti.createDataChannel("veri");',
      ].join("\n"),
      "assets/temiz.js": "const RTCPeerConnectionYok = true;",
    });
    expect(codes(findings, "review")).toEqual(["peer_connection"]);
    expect(findings[0]).toMatchObject({ file: "assets/app.js" });
    expect(findings[0]?.message).toContain("2 yerde geçiyor");
    expect(findings[0]?.message).toContain("bildirmediği bir adrese veri gönderebilir");
  });

  it("sayfalardaki satır içi betiği, uzak kaynağı ve çerçeveyi işaretler", () => {
    const findings = findingsOf({
      "index.html": [
        "<!doctype html>",
        '<link rel="stylesheet" href="https://cdn.ornek.com/stil.css">',
        '<script src="//cdn.ornek.com/kitaplik.js"></script>',
        "<script>window.x = 1;</script>",
        '<script type="application/json">{"veri": 1}</script>',
        '<button onclick="gonder()">Gönder</button>',
        '<iframe src="https://ornek.com"></iframe>',
        '<form action="https://ornek.com/gonder"></form>',
        '<a href="javascript:void(0)">bağlantı</a>',
        '<script type="module" src="./assets/app.js"></script>',
      ].join("\n"),
    });
    expect(codes(findings, "blocked").sort()).toEqual([
      "embedded_frame",
      "form_action",
      "inline_handler",
      "inline_script",
      "javascript_url",
      "remote_resource",
      "remote_script",
    ]);
    const inline = findings.find((finding) => finding.code === "inline_script");
    expect(inline?.message).toContain("Geçtiği yer");
  });

  it("bildirilmemiş adresleri listeler; bildirilenleri ve XML ad alanlarını listelemez", () => {
    const result = inspect({
      manifest: { network: ["https://api.ornek.com"] },
      files: {
        "assets/app.js":
          'fetch("https://api.ornek.com/v1"); fetch("https://izleme.ornek.net/t"); ' +
          'const ns = "http://www.w3.org/2000/svg"; new WebSocket("wss://canli.ornek.net:8443/akis");',
      },
    });
    const undeclared = result.findings.filter((finding) => finding.code === "undeclared_host");
    expect(undeclared.map((finding) => finding.level)).toEqual(["info", "info"]);
    expect(undeclared.map((finding) => finding.message).join("\n")).toContain(
      "https://izleme.ornek.net",
    );
    expect(undeclared.map((finding) => finding.message).join("\n")).toContain(
      "wss://canli.ornek.net:8443",
    );
    expect(JSON.stringify(result.findings)).not.toContain("w3.org");
  });

  it("büyük paketi ve kaynak haritalarını bilgi olarak bildirir", () => {
    const large = { maxArchiveBytes: 5 * 1024 * 1024, allowInsecureNetwork: false };
    const findings = inspect(
      {
        files: {
          "assets/veri.js": `export const veri = "${"a".repeat(2 * 1024 * 1024)}";`,
          "assets/app.js.map": '{"version":3}',
        },
      },
      large,
    ).findings;
    expect(codes(findings, "info").sort()).toEqual(["large_package", "source_map"]);
    expect(findings.find((finding) => finding.code === "large_package")?.message).toContain(
      "2,0 MB",
    );
  });

  it("alıntılarda denetim karakteri bırakmaz ve en önemli bulguyu başa alır", () => {
    const findings = findingsOf({
      "assets/app.js": 'const a = "https://x.ornek.net";\n\u0000\teval("1");',
    });
    expect(findings.map((finding) => finding.level)).toEqual(["blocked", "info"]);
    expect(findings[0]?.message).not.toMatch(/\p{Cc}/u);
  });

  it("çok uzun ve kapanmayan etiketlerde takılmaz", () => {
    const hostile = `${"<a ".repeat(200_000)}${"x".repeat(500_000)}`;
    const large = { maxArchiveBytes: 5 * 1024 * 1024, allowInsecureNetwork: false };
    const started = Date.now();
    inspect({ files: { "sayfa.html": hostile, "assets/app.js": "(".repeat(300_000) } }, large);
    expect(Date.now() - started).toBeLessThan(5_000);
  });
});

describe("klasörden paketleme", () => {
  /** Verilen dosyaları geçici bir klasöre yazar, işlevi çalıştırır ve klasörü siler. */
  async function withDirectory<T>(
    files: Record<string, string | Buffer>,
    run: (directory: string) => Promise<T>,
  ): Promise<T> {
    const directory = await mkdtemp(join(tmpdir(), "vado-paket-"));
    try {
      for (const [path, data] of Object.entries(files)) {
        await mkdir(dirname(join(directory, path)), { recursive: true });
        await writeFile(join(directory, path), data);
      }
      return await run(directory);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }

  it("derleme çıktısını paketler; gizli dosya ve klasörleri atlar", async () => {
    const files = {
      ...packageFiles(SAMPLE),
      ".DS_Store": "x",
      ".vite/manifest.json": "{}",
      "assets/.gitkeep": "",
    };
    const built = await withDirectory(files, (directory) => buildPackage(directory, RULES));

    expect(built.skipped.sort()).toEqual([".DS_Store", ".vite", "assets/.gitkeep"]);
    expect(built.inspected.files.map((file) => file.path).sort()).toEqual(
      Object.keys(packageFiles(SAMPLE)).sort(),
    );
    // Klasörden üretilen paket, aynı dosyaların doğrudan yüklenmesiyle aynı özeti verir.
    expect(built.inspected.digest).toBe(inspect().digest);
  });

  it("aynı klasör her seferinde bayt bayt aynı arşivi üretir", async () => {
    const identical = await withDirectory(packageFiles(SAMPLE), async (directory) => {
      const first = await buildPackage(directory, RULES);
      const second = await buildPackage(directory, RULES);
      return first.archive.equals(second.archive);
    });
    expect(identical).toBe(true);
  });

  it("kurallara uymayan klasörü sunucudaki gibi reddeder", async () => {
    const files = { "index.html": "<!doctype html>", "sunucu.php": "<?php" };
    const problems = await withDirectory(files, async (directory) => {
      try {
        await buildPackage(directory, RULES);
      } catch (error) {
        if (error instanceof AppError) return error.details as PackageProblem[];
        throw error;
      }
      throw new Error("Klasör reddedilmeliydi");
    });
    expect(problems.map((problem) => problem.file).sort()).toEqual(["sunucu.php", "vado.app.json"]);
  });
});
