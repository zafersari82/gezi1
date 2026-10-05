import {
  type ConfigField,
  configProblemSchema,
  type ConfigValues,
  packageProblemSchema,
} from "@vado/contracts";
import { z } from "zod";

import type { ConfigFormValues } from "./form-state";

/** Ayar alanının formdaki adı. */
export const configFieldName = (key: string) => `config.${key}`;

const CHECKED = "on";

/** Kayıtlı ayarları formda gösterilecek metinlere çevirir; değeri olmayan alan varsayılanını alır. */
export function toConfigFormValues(
  fields: readonly ConfigField[],
  config: ConfigValues,
): ConfigFormValues {
  return Object.fromEntries(
    fields.map((field) => {
      const value = config[field.key] ?? field.default;
      if (field.type === "boolean") return [field.key, value === true ? CHECKED : ""];
      return [field.key, value === undefined ? "" : String(value)];
    }),
  );
}

/** Gönderilen formdaki ayarları, her alanın yazıldığı haliyle okur. */
export function readConfigFormValues(
  fields: readonly ConfigField[],
  formData: FormData,
): ConfigFormValues {
  return Object.fromEntries(
    fields.map((field) => {
      const value = formData.get(configFieldName(field.key));
      return [field.key, typeof value === "string" ? value.trim() : ""];
    }),
  );
}

/**
 * Formdaki metinleri alanların türüne göre API'ye gönderilecek değerlere çevirir. Boş bırakılan
 * alan gönderilmez; zorunlu olup olmadığına ve varsayılanına API karar verir. Sayıya çevrilemeyen
 * değer olduğu gibi gönderilir ki API alanı adıyla reddetsin.
 */
export function toConfigInput(
  fields: readonly ConfigField[],
  values: ConfigFormValues,
): Record<string, unknown> {
  const input: Record<string, unknown> = {};
  for (const field of fields) {
    const value = values[field.key] ?? "";
    if (field.type === "boolean") input[field.key] = value === CHECKED;
    else if (value === "") continue;
    else if (field.type === "number") {
      const parsed = Number(value.replace(",", "."));
      input[field.key] = Number.isFinite(parsed) ? parsed : value;
    } else input[field.key] = value;
  }
  return input;
}

/** API'nin döndürdüğü ayar sorunlarını alanların görünen adlarıyla yazar. */
export function describeConfigProblems(fields: readonly ConfigField[], details: unknown): string[] {
  const problems = z.array(configProblemSchema).safeParse(details);
  if (!problems.success) return [];
  return problems.data.map(({ key, message }) => {
    const label = fields.find((field) => field.key === key)?.label ?? key;
    return `${label}: ${message}`;
  });
}

/** API'nin reddettiği paketin sorunlarını dosya adıyla yazar. */
export function describePackageProblems(details: unknown): string[] {
  const problems = z.array(packageProblemSchema).safeParse(details);
  if (!problems.success) return [];
  return problems.data.map(({ file, message }) =>
    file === null ? message : `${file}: ${message}`,
  );
}
