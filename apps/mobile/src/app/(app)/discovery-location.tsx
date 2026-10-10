import { useQuery } from "@tanstack/react-query";
import { locationCountriesSchema, type LocationPlace,locationPlacesSchema } from "@vado/contracts";
import { router } from "expo-router";
import { useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";

import { api } from "@/api/client";
import { useDiscoveryLocation } from "@/features/discovery/discovery-location";
import { colors, space } from "@/theme/tokens";
import { AppText } from "@/ui/app-text";
import { Button } from "@/ui/button";
import { Chip } from "@/ui/chip";

/** Zorunlu GPS yerine, telefon üzerinden açık il ve ilçe seçimi. */
export default function DiscoveryLocationScreen() {
  const { location, save } = useDiscoveryLocation();
  const [provinceId, setProvinceId] = useState(location?.provinceId ?? "");
  const [districtId, setDistrictId] = useState(location?.districtId ?? "");
  const [busy, setBusy] = useState(false);
  const countries = useQuery({
    queryKey: ["locations", "countries"],
    queryFn: () =>
      api
        .get<unknown>("/v1/location/countries")
        .then((data) => locationCountriesSchema.parse(data)),
  });
  const trId = countries.data?.items.find((country) => country.code === "TR")?.id;
  const provinces = useQuery({
    queryKey: ["locations", "provinces", trId],
    enabled: trId !== undefined,
    queryFn: () =>
      api
        .get<unknown>(`/v1/location/countries/${trId}/provinces`)
        .then((data) => locationPlacesSchema.parse(data)),
  });
  const districts = useQuery({
    queryKey: ["locations", "districts", provinceId],
    enabled: provinceId !== "",
    queryFn: () =>
      api
        .get<unknown>(`/v1/location/provinces/${provinceId}/districts`)
        .then((data) => locationPlacesSchema.parse(data)),
  });
  const selectedProvince = provinces.data?.items.find((item) => item.id === provinceId);
  const selectedDistrict = districts.data?.items.find((item) => item.id === districtId);
  async function apply(value: { province: LocationPlace; district?: LocationPlace } | null) {
    setBusy(true);
    try {
      await save(
        value === null
          ? null
          : {
              provinceId: value.province.id,
              provinceName: value.province.name,
              ...(value.district === undefined
                ? {}
                : {
                    districtId: value.district.id,
                    districtName: value.district.name,
                  }),
            },
      );
      router.back();
    } finally {
      setBusy(false);
    }
  }
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <AppText variant="heading">Nerede hizmet arıyorsun?</AppText>
      <AppText color="muted">İlini ve dilersen ilçeni seç. Konum izni vermen gerekmiyor.</AppText>
      <AppText variant="title">İl</AppText>
      <View style={styles.options}>
        {(provinces.data?.items ?? []).map((province) => (
          <Chip
            key={province.id}
            label={province.name}
            selected={province.id === provinceId}
            onPress={() => {
              setProvinceId(province.id);
              setDistrictId("");
            }}
          />
        ))}
      </View>
      {(provinces.isPending || (districts.isPending && provinceId !== "")) && (
        <AppText color="muted">Konumlar yükleniyor…</AppText>
      )}
      {(countries.isError || provinces.isError || districts.isError) && (
        <AppText color="muted">Konumlar yüklenemedi. Tekrar açarak deneyebilirsin.</AppText>
      )}
      {provinceId !== "" && (
        <>
          <AppText variant="title">İlçe (isteğe bağlı)</AppText>
          <View style={styles.options}>
            <Chip
              label="İlin tamamı"
              selected={districtId === ""}
              onPress={() => { setDistrictId(""); }}
            />
            {(districts.data?.items ?? []).map((district) => (
              <Chip
                key={district.id}
                label={district.name}
                selected={district.id === districtId}
                onPress={() => { setDistrictId(district.id); }}
              />
            ))}
          </View>
        </>
      )}
      <Button
        label="Bu konumda keşfet"
        loading={busy}
        disabled={
          selectedProvince === undefined || (districtId !== "" && selectedDistrict === undefined)
        }
        onPress={() => {
          if (selectedProvince !== undefined)
            void apply({
              province: selectedProvince,
              ...(selectedDistrict === undefined ? {} : { district: selectedDistrict }),
            });
        }}
      />
      <Button
        label="Tüm Türkiye'yi göster"
        variant="secondary"
        loading={busy}
        onPress={() => {
          void apply(null);
        }}
      />
    </ScrollView>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  content: { padding: space.lg, gap: space.md, paddingBottom: space.xl },
  options: { flexDirection: "row", flexWrap: "wrap", gap: space.xs },
});
