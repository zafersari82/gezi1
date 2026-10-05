import type { Metadata } from "next";
import Link from "next/link";

import { SecondFactorForm } from "@/components/second-factor-form";

export const metadata: Metadata = { title: "İki adımlı doğrulama" };

export default function VerifyPage() {
  return (
    <>
      <h1>İki adımlı doğrulama</h1>
      <p className="lead">Parolan doğrulandı. Girişi tamamlamak için ikinci adımı geç.</p>
      <SecondFactorForm />
      <p className="auth-footer">
        <Link href="/login">Başka bir hesapla gir</Link>
      </p>
    </>
  );
}
