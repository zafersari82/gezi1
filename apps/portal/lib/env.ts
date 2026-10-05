/** Ortam değişkenini okur; boş bırakılan değişken tanımsız sayılır (bkz. .env.example). */
export function env(name: string): string | undefined {
  const value = process.env[name];
  return value === undefined || value === "" ? undefined : value;
}

export const isProduction = process.env.NODE_ENV === "production";
