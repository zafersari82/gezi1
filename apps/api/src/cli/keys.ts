import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseEnv } from "node:util";

import { loadEnvFile } from "../core/config";
import { StartupError } from "../core/errors";
import type { KeyEnv } from "../core/keys";
import { runKeyCommand } from "./key-commands";

/**
 * İmza anahtarlarını üretir, eski sistemden geçirir, döndürür ve denetler:
 * `npm run keys -- <komut>` veya canlıda `node dist/cli/keys.js <komut>`.
 */

/** `--from -`: dosya standart girdiden okunur; kapsayıcıya dosya bağlamak gerekmez. */
const STDIN = "-";

function readFile(file: string): string {
  if (file === STDIN) {
    if (process.stdin.isTTY) {
      throw new StartupError(
        "`--from -` dosyayı standart girdiden okur: komutun sonuna `< dosya` ekleyin.",
      );
    }
    return readFileSync(process.stdin.fd, "utf8");
  }
  // npm betiği paketin klasöründe çalıştırır; dosya yolu ise komutun yazıldığı klasöre göredir.
  const path = resolve(process.env.INIT_CWD ?? process.cwd(), file);
  try {
    return readFileSync(path, "utf8");
  } catch {
    throw new StartupError(`Dosya okunamadı: ${path}`);
  }
}

function readEnv(file: string | undefined): KeyEnv {
  let source: NodeJS.Dict<string> = process.env;
  if (file === undefined) loadEnvFile();
  else source = parseEnv(readFile(file));
  return {
    VADO_OTP_KEYS: source.VADO_OTP_KEYS,
    VADO_QR_KEYS: source.VADO_QR_KEYS,
    VADO_OPENID_KEY: source.VADO_OPENID_KEY,
    VADO_IDENTITY_KEYS: source.VADO_IDENTITY_KEYS,
    VADO_APP_SECRET: source.VADO_APP_SECRET,
  };
}

try {
  console.log(runKeyCommand(process.argv.slice(2), readEnv, Date.now()).join("\n"));
} catch (error) {
  console.error(error instanceof StartupError ? error.message : error);
  process.exit(1);
}
