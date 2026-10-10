import { Stack } from "expo-router";
import { useEffect } from "react";

import { outbox } from "@/features/chat/outbox";
import { PushListener } from "@/features/notifications/push-listener";
import { RealtimeProvider } from "@/features/realtime/realtime-provider";
import { useAppLock, watchAppLock } from "@/features/security/app-lock";
import { NewDeviceAlert } from "@/features/security/new-device-alert";
import { VerificationProvider } from "@/features/security/verification-provider";
import { useSession } from "@/features/session/session-provider";
import { stackScreenOptions } from "@/theme/navigation";

/**
 * Uygulama doğrudan bir iç ekrandan açıldığında (bağlantı, QR, web adresi) geri gidilecek yer
 * sekmelerdir.
 */
export const unstable_settings = { anchor: "(tabs)" };

/** Oturum açmış kullanıcının gördüğü tüm ekranlar. */
export default function AppLayout() {
  const { state } = useSession();
  const { locked } = useAppLock();

  // Çıkış yapıldığında gönderilmeyi bekleyen mesajlar da bırakılır.
  useEffect(() => outbox.clear, []);
  useEffect(() => watchAppLock(), []);

  // Çıkış sırasında gezgin kapanmadan önce bu ekran bir kez daha çizilebilir.
  if (state.status !== "signedIn") return null;
  const needsProfile = state.me.displayName === null;

  return (
    <RealtimeProvider>
      <VerificationProvider>
        <Stack screenOptions={stackScreenOptions}>
          {/* Kilitliyken diğer ekranlar gezginden çıkar; açık pencereler de onlarla kapanır. */}
          <Stack.Protected guard={locked}>
            <Stack.Screen name="locked" options={{ headerShown: false }} />
          </Stack.Protected>

          <Stack.Protected guard={!locked && needsProfile}>
            <Stack.Screen name="profile-setup" options={{ headerShown: false }} />
          </Stack.Protected>

          <Stack.Protected guard={!locked && !needsProfile}>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="chat/[id]/index" options={{ title: "" }} />
            <Stack.Screen name="chat/[id]/info" options={{ title: "Sohbet bilgisi" }} />
            <Stack.Screen name="chat/new" options={{ title: "Yeni sohbet" }} />
            <Stack.Screen name="contacts/add" options={{ title: "Kişi ekle" }} />
            <Stack.Screen name="contacts/requests" options={{ title: "Kişi istekleri" }} />
            <Stack.Screen name="user/[id]" options={{ title: "" }} />
            <Stack.Screen name="moments/index" options={{ title: "Anlar" }} />
            <Stack.Screen
              name="moments/compose"
              options={{ title: "Yeni paylaşım", presentation: "modal" }}
            />
            <Stack.Screen name="search" options={{ title: "VADO Arama" }} />
            <Stack.Screen name="miniapps/index" options={{ title: "Mini uygulamalar" }} />
            <Stack.Screen name="miniapps/[id]" options={{ headerShown: false }} />
            <Stack.Screen name="businesses/index" options={{ title: "İşletmeler" }} />
            <Stack.Screen name="businesses/[id]" options={{ title: "" }} />
            <Stack.Screen name="bookings/[businessId]" options={{ title: "Randevu al" }} />
            <Stack.Screen name="businesses/following" options={{ title: "Takip ettiklerim" }} />
            <Stack.Screen name="businesses/register" options={{ title: "İşletme başvurusu" }} />
            <Stack.Screen name="scan" options={{ title: "QR okut" }} />
            <Stack.Screen name="share-target" options={{ title: "VADO'da paylaş" }} />
            <Stack.Screen name="chat/[id]/products" options={{ title: "Ürün seç" }} />
            <Stack.Screen
              name="products/[businessId]/[branchId]/[itemId]"
              options={{ title: "Ürün" }}
            />
            <Stack.Screen name="chat/[id]/share" options={{ title: "Sohbette paylaş" }} />
            <Stack.Screen name="my-qr" options={{ title: "QR kodum" }} />
            <Stack.Screen name="payments" options={{ title: "Ödemeler" }} />
            <Stack.Screen name="settings/profile" options={{ title: "Profil" }} />
            <Stack.Screen name="settings/privacy" options={{ title: "Gizlilik" }} />
            <Stack.Screen
              name="settings/permissions"
              options={{ title: "Mini uygulama izinleri" }}
            />
            <Stack.Screen name="settings/sessions" options={{ title: "Oturumlar" }} />
            <Stack.Screen name="settings/notifications" options={{ title: "Bildirimler" }} />
          </Stack.Protected>
        </Stack>
        {!locked && <NewDeviceAlert />}
        <PushListener />
      </VerificationProvider>
    </RealtimeProvider>
  );
}
