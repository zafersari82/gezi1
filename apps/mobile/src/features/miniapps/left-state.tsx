import { EmptyState } from "@/ui/states";

interface LeftStateProps {
  onReopen: () => void;
}

/**
 * Mini uygulama açıldığı belgeden ayrılmaya çalıştığında penceresinin yerine gösterilir: başka
 * bir adrese gitmek istemiş ya da sayfasını yeniden yüklemiş olabilir.
 */
export function LeftState({ onReopen }: LeftStateProps) {
  return (
    <EmptyState
      icon="alert-circle-outline"
      title="Mini uygulama kapatıldı"
      message="Mini uygulama sayfasını yenilemeye ya da başka bir sayfa açmaya çalıştı. Güvenliğin için kapatıldı."
      actionLabel="Yeniden aç"
      onAction={onReopen}
    />
  );
}
