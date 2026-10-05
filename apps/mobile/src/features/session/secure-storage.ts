import * as SecureStore from "expo-secure-store";

/**
 * Oturum belirtecinin saklandığı yer. Telefonda işletim sisteminin şifreli deposu kullanılır;
 * web önizlemesinin karşılığı `secure-storage.web.ts` dosyasındadır.
 */
export const secureStorage = {
  get: (key: string): Promise<string | null> => SecureStore.getItemAsync(key),
  set: (key: string, value: string): Promise<void> => SecureStore.setItemAsync(key, value),
  remove: (key: string): Promise<void> => SecureStore.deleteItemAsync(key),
};
