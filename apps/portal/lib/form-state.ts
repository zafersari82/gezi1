/** Bir form gönderiminin sonucu. Hata olduğunda yazılanlar kaybolmasın diye değerler geri döner. */
export interface FormState<Values> {
  error: string | null;
  /** Hatanın ayrıntıları: reddedilen paketin sorunları, uymayan ayar alanları gibi. */
  problems?: string[];
  /** Son gönderim başarıyla kaydedildiyse `true`. */
  saved: boolean;
  values: Values;
}

/**
 * Formda gösterilecek değerler. Son gönderim reddedildiyse kullanıcının yazdıkları, aksi halde
 * sunucudaki güncel değerler gösterilir; böylece kayıt başka bir işlemle değiştiğinde (yeni sürüm
 * yayınlandı, yayın geri alındı) form eski değerlerle kalmaz.
 */
export function shownValues<Values>(state: FormState<Values>, current: Values): Values {
  return state.error === null ? current : state.values;
}

/**
 * Form öğesinin anahtarı: gösterilen değerler değiştiğinde alanlar yeni varsayılanlarıyla baştan
 * kurulur. Bileşenin kendisi yerinde kaldığı için son gönderimin sonucu ekranda kalır.
 */
export function formKey(values: unknown): string {
  return JSON.stringify(values);
}

export interface MiniAppFormValues {
  id: string;
  name: string;
  description: string;
  iconUrl: string;
  category: string;
  developerName: string;
  sortOrder: string;
  /** Aşağıdakiler yalnızca geliştiricinin sunucusundan açılan kayıtlarda kullanılır. */
  entryUrl: string;
  /** Her satırda bir kaynak. */
  allowedOrigins: string;
  capabilities: string[];
  version: string;
}

export const EMPTY_MINI_APP: MiniAppFormValues = {
  id: "",
  name: "",
  description: "",
  iconUrl: "",
  category: "other",
  developerName: "",
  sortOrder: "100",
  entryUrl: "",
  allowedOrigins: "",
  capabilities: [],
  version: "0.0.1",
};

export interface MerchantFormValues {
  merchantId: string;
  displayName: string;
  businessId: string;
}

export const EMPTY_MERCHANT: MerchantFormValues = {
  merchantId: "",
  displayName: "",
  businessId: "",
};

export interface PackageFormValues {
  id: string;
  name: string;
  developerName: string;
}

export const EMPTY_PACKAGE: PackageFormValues = { id: "", name: "", developerName: "" };

/** İnceleme kararı ve geri çekme formlarındaki gerekçe. */
export interface NoteFormValues {
  note: string;
}

export const EMPTY_NOTE: NoteFormValues = { note: "" };

/** Ayar formunda her alanın yazıldığı haliyle değeri: alan anahtarı → metin. */
export type ConfigFormValues = Record<string, string>;
