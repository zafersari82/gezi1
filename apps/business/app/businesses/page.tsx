import { BusinessChooser } from "../../components/business-chooser";
import { getMemberships } from "../../lib/context";

export default async function BusinessPage() {
  const memberships = await getMemberships();
  return (
    <main className="chooser-page">
      <div className="brand">
        <span className="brand-mark">V</span>VADO Business
      </div>
      <h1>Hangi işletmeyle devam edelim?</h1>
      <p className="muted">Yalnızca etkin üyeliğinin bulunduğu işletmeler gösterilir.</p>
      <BusinessChooser memberships={memberships} />
    </main>
  );
}
