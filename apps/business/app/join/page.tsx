import { JoinInvitationLoader } from "../../components/join-invitation-loader";

export default function JoinPage() {
  return (
    <main className="chooser-page">
      <div className="brand">
        <span className="brand-mark">V</span>VADO Business
      </div>
      <JoinInvitationLoader />
    </main>
  );
}
