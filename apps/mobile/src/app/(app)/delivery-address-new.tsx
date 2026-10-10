import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  locationAddressBodySchema,
  locationAddressSchema,
  locationCountriesSchema,
  locationPlacesSchema,
} from "@vado/contracts";
import * as Crypto from "expo-crypto";
import { router } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { api, errorMessage } from "@/api/client";
import { saveDeliveryPreference } from "@/features/discovery/delivery-filter";
import { space } from "@/theme/tokens";
import { AppText } from "@/ui/app-text";
import { Button } from "@/ui/button";
import { Chip } from "@/ui/chip";
import { Screen } from "@/ui/screen";
import { TextField } from "@/ui/text-field";

/** Telefon üzerinden kayıtlı teslimat adresi: GPS zorunlu değil. */
export default function NewDeliveryAddressScreen() {
  const queryClient = useQueryClient();
  const [provinceId, setProvinceId] = useState("");
  const [districtId, setDistrictId] = useState("");
  const [neighborhoodId, setNeighborhoodId] = useState("");
  const [label, setLabel] = useState("Ev");
  const [recipientName, setRecipientName] = useState("");
  const [phone, setPhone] = useState("");
  const [addressLine, setAddressLine] = useState("");
  const [door, setDoor] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const countries = useQuery({
    queryKey: ["locations", "countries"],
    queryFn: () =>
      api
        .get<unknown>("/v1/location/countries")
        .then((data) => locationCountriesSchema.parse(data)),
  });
  const countryId = countries.data?.items.find((c) => c.code === "TR")?.id;
  const provinces = useQuery({
    queryKey: ["locations", "provinces", countryId],
    enabled: countryId !== undefined,
    queryFn: () =>
      api
        .get<unknown>(`/v1/location/countries/${countryId}/provinces`)
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
  const neighborhoods = useQuery({
    queryKey: ["locations", "neighborhoods", districtId],
    enabled: districtId !== "",
    queryFn: () =>
      api
        .get<unknown>(`/v1/location/districts/${districtId}/neighborhoods`)
        .then((data) => locationPlacesSchema.parse(data)),
  });

  async function save() {
    const parsed = locationAddressBodySchema.safeParse({
      countryId,
      provinceId,
      districtId,
      neighborhoodId,
      label,
      recipientName,
      phone,
      addressLine,
      door,
      note,
    });
    if (!parsed.success) {
      setError(
        "İl, ilçe, mahalle, ad, +90 ile başlayan telefon, açık adres ve kapı numarası alanlarını kontrol et.",
      );
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await api.postIdempotent<unknown>(
        "/v1/location/addresses",
        Crypto.randomUUID(),
        parsed.data,
      );
      const address = locationAddressSchema.parse(response);
      await saveDeliveryPreference(address.id);
      queryClient.setQueryData(["discovery-delivery-address"], address.id);
      await queryClient.invalidateQueries({ queryKey: ["discovery", "saved-addresses"] });
      router.back();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen
      scroll
      padded
      footer={
        <Button
          label="Adresi kaydet ve teslimat için seç"
          loading={busy}
          onPress={() => void save()}
          testID="save-discovery-address"
        />
      }
    >
      <AppText variant="heading">Teslimat adresi</AppText>
      <AppText color="muted">
        GPS izni gerekmiyor. Seçtiğin mahalleye teslimat yapan şubeleri göstereceğiz.
      </AppText>
      <AppText variant="title">İl</AppText>
      <View style={styles.choices}>
        {(provinces.data?.items ?? []).map((province) => (
          <Chip
            key={province.id}
            label={province.name}
            selected={provinceId === province.id}
            onPress={() => {
              setProvinceId(province.id);
              setDistrictId("");
              setNeighborhoodId("");
            }}
          />
        ))}
      </View>
      {provinceId !== "" && (
        <>
          <AppText variant="title">İlçe</AppText>
          <View style={styles.choices}>
            {(districts.data?.items ?? []).map((district) => (
              <Chip
                key={district.id}
                label={district.name}
                selected={districtId === district.id}
                onPress={() => {
                  setDistrictId(district.id);
                  setNeighborhoodId("");
                }}
              />
            ))}
          </View>
        </>
      )}
      {districtId !== "" && (
        <>
          <AppText variant="title">Mahalle</AppText>
          <View style={styles.choices}>
            {(neighborhoods.data?.items ?? []).map((neighborhood) => (
              <Chip
                key={neighborhood.id}
                label={neighborhood.name}
                selected={neighborhoodId === neighborhood.id}
                onPress={() => {
                  setNeighborhoodId(neighborhood.id);
                }}
              />
            ))}
          </View>
        </>
      )}
      {(countries.isError || provinces.isError || districts.isError || neighborhoods.isError) && (
        <AppText color="coral">Adres konumları yüklenemedi. Bağlantını kontrol et.</AppText>
      )}
      <TextField label="Adres etiketi" value={label} onChangeText={setLabel} maxLength={60} />
      <TextField
        label="Teslim alacak kişinin adı"
        value={recipientName}
        onChangeText={setRecipientName}
        maxLength={120}
        autoCapitalize="words"
      />
      <TextField
        label="Telefon"
        value={phone}
        onChangeText={setPhone}
        keyboardType="phone-pad"
        placeholder="+905551112233"
        maxLength={16}
      />
      <TextField
        label="Açık adres"
        value={addressLine}
        onChangeText={setAddressLine}
        maxLength={500}
        multiline
        placeholder="Cadde, sokak ve bina numarası"
      />
      <TextField label="Daire / Kapı" value={door} onChangeText={setDoor} maxLength={80} />
      <TextField
        label="Teslimat notu (isteğe bağlı)"
        value={note}
        onChangeText={setNote}
        maxLength={500}
      />
      {error !== null && <AppText color="coral">{error}</AppText>}
    </Screen>
  );
}

const styles = StyleSheet.create({
  choices: { flexDirection: "row", flexWrap: "wrap", gap: space.xs },
});
