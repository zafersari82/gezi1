/**
 * Web önizlemesinde şifreli depo yoktur; belirteç tarayıcının yerel deposunda tutulur.
 * Web sürümü geliştirme ve tanıtım içindir.
 */
export const secureStorage = {
  get: (key: string): Promise<string | null> => Promise.resolve(window.localStorage.getItem(key)),
  set: (key: string, value: string): Promise<void> => {
    window.localStorage.setItem(key, value);
    return Promise.resolve();
  },
  remove: (key: string): Promise<void> => {
    window.localStorage.removeItem(key);
    return Promise.resolve();
  },
};
