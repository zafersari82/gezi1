/**
 * Web önizlemesinde cihaz kilidi sorulamaz: yeniden doğrulama her zaman SMS koduyla yapılır ve
 * uygulama kilidi sunulmaz.
 */

export function canConfirmPresence(): Promise<boolean> {
  return Promise.resolve(false);
}

export function confirmPresence(_reason: string): Promise<boolean> {
  return Promise.resolve(false);
}
