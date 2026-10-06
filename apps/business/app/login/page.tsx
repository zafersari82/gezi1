import { LoginForm } from "../../components/login-form";

export default function LoginPage() {
  return (
    <main className="login-page">
      <div className="login-brand">
        <span className="brand-mark">V</span>
        <span>
          VADO <small>BUSINESS</small>
        </span>
      </div>
      <section className="login-card">
        <span className="eyebrow">İşletmenin kontrolü sende</span>
        <h1>Güne buradan başla.</h1>
        <p className="muted">
          Kendi VADO hesabınla giriş yap. Üyesi olduğun işletmeler seni bekliyor.
        </p>
        <LoginForm />
      </section>
      <p className="login-foot">Tek hesap. İşletmenin bütün işleri.</p>
    </main>
  );
}
