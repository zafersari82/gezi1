import { Lattice } from "@/components/lattice";

/** Giriş sayfaları: kenar çubuğu yok, oturum gerekmez. */
export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <main className="auth">
      <div className="brand auth-brand">
        <Lattice />
        <span className="brand-name">VADO</span>
        <span className="brand-role">Control</span>
      </div>
      <div className="panel auth-card">{children}</div>
    </main>
  );
}
