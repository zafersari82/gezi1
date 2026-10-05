import { parseArgs } from "node:util";

import {
  ADMIN_ROLE_LABELS,
  ADMIN_ROLES,
  adminCreateAccountBodySchema,
  type AdminTemporaryPassword,
  adminUsernameSchema,
} from "@vado/contracts";

import { CLI_ACTOR } from "../core/audit";
import { loadConfig, loadEnvFile } from "../core/config";
import type { AppContext } from "../core/context";
import { createDatabase } from "../core/database";
import { AppError, StartupError } from "../core/errors";
import { turkishErrors } from "../core/http";
import { createAppKeys } from "../core/keys";
import { pendingMigrations } from "../core/migrator";
import { createLocalPackageStore } from "../providers/package-store";
import { createLocalStorage } from "../providers/storage";
import { createServices } from "../services";

/**
 * Panel hesaplarını komut satırından yönetir: `npm run admins -- <komut>`, canlıda
 * `node dist/cli/admins.js <komut>`.
 *
 * İlk sahip hesabı yalnızca buradan açılır; sonraki hesapları sahip panelden açar. Varsayılan parola
 * yoktur: geçici parola rastgele üretilir, bir kez gösterilir ve ilk girişte değiştirilir. Panele
 * erişimi kalmayan bir sahip için parola ve ikinci adım da buradan sıfırlanır.
 */
const USAGE = `Kullanım:
  npm run admins -- create --username <ad> --name "<görünen ad>" --role <rol>
  npm run admins -- list
  npm run admins -- reset-password --username <ad>
  npm run admins -- reset-2fa --username <ad>

Roller: ${ADMIN_ROLES.map((role) => `${role} (${ADMIN_ROLE_LABELS[role]})`).join(", ")}
Canlı ortamda: node dist/cli/admins.js <komut> …`;

function printTemporaryPassword({ account, temporaryPassword }: AdminTemporaryPassword): void {
  console.log(
    `Hesap: ${account.username} (${account.displayName}, ${ADMIN_ROLE_LABELS[account.role]})`,
  );
  console.log(`Geçici parola: ${temporaryPassword}`);
  console.log(
    "Parola bir daha gösterilmez. Kişiye güvenli bir yoldan iletin; ilk girişte parolasını " +
      "değiştirir ve iki adımlı doğrulamayı kurar.",
  );
}

async function main(): Promise<void> {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      username: { type: "string" },
      name: { type: "string" },
      role: { type: "string" },
    },
  });
  const [command] = positionals;
  if (command === undefined) throw new StartupError(USAGE);

  loadEnvFile();
  const config = loadConfig();
  const pending = await pendingMigrations(config.databaseUrl);
  if (pending.length > 0) {
    throw new StartupError(
      `Uygulanmamış şema dosyaları var (${pending.join(", ")}). Önce şemayı yükseltin: ` +
        "npm run db:migrate (canlıda: node dist/cli/migrate.js).",
    );
  }

  const db = createDatabase(config.databaseUrl, 2);
  try {
    const context: AppContext = {
      config,
      db,
      log: { info: () => undefined, warn: () => undefined, error: () => undefined },
      keys: createAppKeys(config.keys),
      storage: await createLocalStorage(config.storageDir, config.publicUrl),
      packageStore: await createLocalPackageStore(config.packageDir),
      sms: { sendOtp: () => Promise.resolve() },
      realtime: { emit: () => undefined, disconnectSession: () => undefined },
    };
    const { adminAccounts } = createServices(context);
    const account = async () => {
      const username = adminUsernameSchema.safeParse(values.username);
      if (!username.success) throw new StartupError(`--username eksik ya da geçersiz.\n\n${USAGE}`);
      return adminAccounts.findByUsername(username.data);
    };

    switch (command) {
      case "create": {
        const body = adminCreateAccountBodySchema.safeParse(
          { username: values.username, displayName: values.name, role: values.role },
          { error: turkishErrors },
        );
        if (!body.success) {
          const problems = body.error.issues.map(
            (issue) => `  - ${issue.path.join(".")}: ${issue.message}`,
          );
          throw new StartupError(`Bilgiler geçersiz:\n${problems.join("\n")}\n\n${USAGE}`);
        }
        printTemporaryPassword(await adminAccounts.createAccount(CLI_ACTOR, body.data));
        break;
      }
      case "list": {
        const accounts = await adminAccounts.listAccounts();
        if (accounts.length === 0) console.log("Henüz panel hesabı yok.");
        for (const item of accounts) {
          const notes = [
            item.status === "disabled" ? "kapalı" : null,
            item.totpEnabled ? null : "ikinci adım kurulmadı",
            item.lockedUntil === null ? null : `kilitli: ${item.lockedUntil}`,
          ].filter((note) => note !== null);
          const suffix = notes.length === 0 ? "" : ` [${notes.join(", ")}]`;
          console.log(
            `${item.username}\t${item.displayName}\t${ADMIN_ROLE_LABELS[item.role]}${suffix}`,
          );
        }
        break;
      }
      case "reset-password":
        printTemporaryPassword(await adminAccounts.resetPassword(CLI_ACTOR, (await account()).id));
        break;
      case "reset-2fa": {
        const reset = await adminAccounts.resetTotp(CLI_ACTOR, (await account()).id);
        console.log(
          `${reset.username}: iki adımlı doğrulama sıfırlandı, açık oturumlar kapandı. Bir sonraki ` +
            "girişte yeniden kurulur.",
        );
        break;
      }
      default:
        throw new StartupError(USAGE);
    }
  } finally {
    await db.close();
  }
}

main().catch((error: unknown) => {
  if (error instanceof AppError) console.error(error.message);
  else console.error(error instanceof StartupError ? error.message : error);
  process.exit(1);
});
