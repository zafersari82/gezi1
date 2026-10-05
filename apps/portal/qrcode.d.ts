/**
 * `qrcode` paketinin (1.5.4) panelin kullandığı tek işlevi. Paket kendi tip tanımlarını taşımaz;
 * tip paketi eklemek yerine yalnızca kullanılan imza burada yazılır.
 */
declare module "qrcode" {
  interface ToStringOptions {
    type: "svg";
    /** Kodun çevresindeki boşluk, modül sayısı. */
    margin?: number;
    errorCorrectionLevel?: "L" | "M" | "Q" | "H";
  }

  export function toString(text: string, options: ToStringOptions): Promise<string>;
}
