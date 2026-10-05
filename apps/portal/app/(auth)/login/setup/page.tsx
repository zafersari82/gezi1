import type { Metadata } from "next";

import { TotpSetupForm } from "@/components/totp-setup-form";

export const metadata: Metadata = { title: "İki adımlı doğrulamayı kur" };

/**
 * Sayfa API'yi çağırmaz: sır, düğmeye basılınca sunucu işleviyle üretilir. Kurulum tamamlanınca
 * oturum çerezi yazılır ve sayfa yeniden çizilir; kurtarma kodları bu sırada kaybolmaz.
 */
export default function SetupPage() {
  return (
    <>
      <h1>İki adımlı doğrulamayı kur</h1>
      <p className="lead">
        Panele her girişte parolanın yanında telefonundaki doğrulama uygulamasının ürettiği kod
        istenir. Google Authenticator, Microsoft Authenticator ya da parola yöneticin bu kodu
        üretebilir.
      </p>
      <TotpSetupForm />
    </>
  );
}
