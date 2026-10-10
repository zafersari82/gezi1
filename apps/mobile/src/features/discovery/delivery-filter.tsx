import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { idSchema, locationAddressesSchema } from "@vado/contracts";
import { router } from "expo-router";
import { StyleSheet, View } from "react-native";

import { api } from "@/api/client";
import { space } from "@/theme/tokens";
import { AppText } from "@/ui/app-text";
import { Button } from "@/ui/button";
import { Chip } from "@/ui/chip";

const savedKey = "vado.discovery.delivery-address.v1";
const queryKey = ["discovery-delivery-address"] as const;

/** Tercih cihazda kalır. API adresin sahipliğini her aramada tekrar denetler. */
async function readSavedAddressId(): Promise<string | null> {
  const saved = await AsyncStorage.getItem(savedKey).catch(() => null);
  return saved !== null && idSchema.safeParse(saved).success ? saved : null;
}

export async function saveDeliveryPreference(addressId: string | null): Promise<void> {
  if (addressId === null) await AsyncStorage.removeItem(savedKey);
  else await AsyncStorage.setItem(savedKey, idSchema.parse(addressId));
}

export function useDeliveryDiscovery() {
  const client = useQueryClient();
  const preference = useQuery({ queryKey, queryFn: readSavedAddressId, staleTime: Infinity });
  const addresses = useQuery({
    queryKey: ["discovery", "saved-addresses"],
    queryFn: () =>
      api
        .get<unknown>("/v1/location/addresses")
        .then((data) => locationAddressesSchema.parse(data)),
  });
  const selectedId = preference.data ?? null;
  const selectedAddress =
    addresses.data?.items.find((address) => address.id === selectedId) ?? null;
  // Bozuk ağ yanıtında teslimat filtresini sessizce kaldırarak genel sonuç sunma.
  const pending =
    preference.isPending || addresses.isPending || (selectedId !== null && addresses.isError);

  async function select(addressId: string | null) {
    if (addressId !== null && !addresses.data?.items.some((address) => address.id === addressId)) {
      return;
    }
    await saveDeliveryPreference(addressId);
    client.setQueryData(queryKey, addressId);
  }
  return {
    addresses: addresses.data?.items ?? [],
    addressId: selectedAddress?.id ?? null,
    selectedAddress,
    pending,
    error: addresses.isError,
    staleSelection: selectedId !== null && addresses.isSuccess && selectedAddress === null,
    select,
  };
}

export type DeliveryDiscovery = ReturnType<typeof useDeliveryDiscovery>;

/** Keşfet ve Arama için ortak adres seçim alanı; izinsiz GPS istemez. */
export function DeliveryAddressFilter({ filter }: { filter: DeliveryDiscovery }) {
  return (
    <View style={styles.container}>
      <AppText variant="caption" color="muted">
        Adrese teslimat · Kayıtlı adresini seç
      </AppText>
      <View style={styles.chips}>
        <Chip
          label="Yerel keşif"
          selected={filter.addressId === null}
          onPress={() => void filter.select(null)}
        />
        {filter.addresses.map((address) => (
          <Chip
            key={address.id}
            label={`${address.label} · ${address.geography.neighborhood.name}`}
            selected={filter.addressId === address.id}
            onPress={() => void filter.select(address.id)}
          />
        ))}
      </View>
      <Button
        label="Yeni teslimat adresi ekle"
        variant="secondary"
        size="small"
        onPress={() => {
          router.push("/delivery-address-new");
        }}
      />
      {filter.error && (
        <AppText variant="caption" color="muted">
          Adresler okunamadı. Teslimat sonuçları yüklenmeyecek.
        </AppText>
      )}
      {filter.staleSelection && (
        <AppText variant="caption" color="muted">
          Önceden seçtiğin adres artık kullanılamıyor. Yeniden seçebilirsin.
        </AppText>
      )}
      {filter.addressId !== null && (
        <AppText variant="caption" color="muted">
          Yalnız seçili adrese şu an teslimat sunan şubeler listelenir. Son ücret ve uygunluk
          siparişte tekrar onaylanır.
        </AppText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: space.sm, paddingHorizontal: space.lg, paddingVertical: space.sm },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.xs },
});
