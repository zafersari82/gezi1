import { router, Stack } from "expo-router";

import { useSession } from "@/features/session/session-provider";
import { EmptyState } from "@/ui/states";

/** Var olmayan bir adres ya da geçersiz bir bağlantı açıldığında gösterilir. */
export default function NotFoundScreen() {
  const { state } = useSession();
  // Oturum yokken uygulama ekranları kapalıdır; dönülecek yer karşılama ekranıdır.
  const home = state.status === "signedIn" ? "/" : "/welcome";

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <EmptyState
        icon="compass-outline"
        title="Sayfa bulunamadı"
        message="Açmak istediğin bağlantı geçersiz ya da kaldırılmış olabilir."
        actionLabel="Ana sayfaya dön"
        onAction={() => {
          router.replace(home);
        }}
      />
    </>
  );
}
