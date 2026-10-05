import type { Metadata } from "next";

import { LoginForm } from "@/components/login-form";

export const metadata: Metadata = { title: "Giriş" };

export default function LoginPage() {
  return (
    <>
      <h1>Giriş</h1>
      <p className="lead">Panele kendi hesabınla ve iki adımlı doğrulamayla girersin.</p>
      <LoginForm />
    </>
  );
}
