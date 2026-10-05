import * as LocalAuthentication from "expo-local-authentication";

/**
 * Kullanıcının cihazın başında olduğunu işletim sistemine doğrulatır: parmak izi, yüz ya da ekran
 * kilidi şifresi. Web önizlemesindeki karşılığı `presence.web.ts` dosyasındadır.
 */

/** Cihazda parmak izi, yüz ya da ekran kilidi şifresi tanımlı mı? */
export async function canConfirmPresence(): Promise<boolean> {
  const level = await LocalAuthentication.getEnrolledLevelAsync();
  return level !== LocalAuthentication.SecurityLevel.NONE;
}

/** Cihazın kilidini sorar; kullanıcı doğrulanırsa `true`, vazgeçer ya da doğrulanamazsa `false`. */
export async function confirmPresence(reason: string): Promise<boolean> {
  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: reason,
    cancelLabel: "Vazgeç",
  });
  return result.success;
}
