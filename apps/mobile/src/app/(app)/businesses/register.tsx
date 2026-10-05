import {
  BUSINESS_DESCRIPTION_MAX,
  BUSINESS_NAME_MAX,
  type BusinessStatus,
  CATEGORIES,
  type Category,
  CATEGORY_LABELS,
  createBusinessBodySchema,
} from "@vado/contracts";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { errorMessage } from "@/api/client";
import { useCreateBusiness, useOwnedBusinesses } from "@/features/businesses/queries";
import { foldText } from "@/lib/text";
import { space } from "@/theme/tokens";
import { AppText } from "@/ui/app-text";
import { Tag } from "@/ui/badge";
import { Button } from "@/ui/button";
import { Chip } from "@/ui/chip";
import { useFeedback } from "@/ui/feedback";
import { ListRow } from "@/ui/list-row";
import { Screen } from "@/ui/screen";
import { TextField } from "@/ui/text-field";

const STATUS_LABELS: Record<BusinessStatus, string> = {
  pending: "Onay bekliyor",
  active: "Yayında",
  suspended: "Askıda",
};

/** İşletme adından adres önerir: "Kadıköy Berber" → "kadikoy-berber". */
function slugify(name: string): string {
  return foldText(name)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export default function RegisterBusinessScreen() {
  const owned = useOwnedBusinesses();
  const createBusiness = useCreateBusiness();
  const { notify } = useFeedback();
  const [name, setName] = useState("");
  const [category, setCategory] = useState<Category>("food");
  const [city, setCity] = useState("");
  const [description, setDescription] = useState("");
  const [taxNumber, setTaxNumber] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit() {
    const body = createBusinessBodySchema.safeParse({
      name,
      slug: slugify(name),
      category,
      city,
      description,
      ...(taxNumber.trim() === "" ? {} : { taxNumber: taxNumber.trim() }),
    });
    if (!body.success) {
      setError("Ad, şehir ve (yazdıysan) vergi numarasını kontrol et.");
      return;
    }
    setError(null);
    createBusiness.mutate(body.data, {
      onSuccess: () => {
        setName("");
        setCity("");
        setDescription("");
        setTaxNumber("");
        notify("Başvurun alındı. Onaylandığında işletmen listelenecek.");
      },
      onError: (cause) => {
        setError(errorMessage(cause));
      },
    });
  }

  return (
    <Screen scroll>
      {(owned.data ?? []).map((business) => (
        <ListRow
          key={business.id}
          title={business.name}
          subtitle={`${CATEGORY_LABELS[business.category]}, ${business.city}`}
          trailing={
            <Tag
              label={STATUS_LABELS[business.status]}
              tone={business.status === "active" ? "positive" : "warning"}
            />
          }
        />
      ))}

      <View style={styles.form}>
        <AppText color="muted">
          İşletme hesabın onaylandığında Keşfet bölümünde listelenir ve mini uygulamalar üzerinden
          ödeme alabilir.
        </AppText>
        <TextField
          label="İşletme adı"
          placeholder="Kadıköy Berber"
          value={name}
          onChangeText={setName}
          maxLength={BUSINESS_NAME_MAX}
          hint={name.trim() === "" ? undefined : `Adres: ${slugify(name)}`}
          testID="business-name"
        />
        <View style={styles.categories}>
          {CATEGORIES.map((item) => (
            <Chip
              key={item}
              label={CATEGORY_LABELS[item]}
              selected={item === category}
              onPress={() => {
                setCategory(item);
              }}
            />
          ))}
        </View>
        <TextField
          label="Şehir"
          placeholder="İstanbul"
          value={city}
          onChangeText={setCity}
          testID="business-city"
        />
        <TextField
          label="Tanıtım (isteğe bağlı)"
          value={description}
          onChangeText={setDescription}
          maxLength={BUSINESS_DESCRIPTION_MAX}
          multiline
        />
        <TextField
          label="Vergi kimlik numarası (isteğe bağlı)"
          value={taxNumber}
          onChangeText={setTaxNumber}
          keyboardType="number-pad"
          maxLength={11}
          hint="Şirketler için 10, şahıs işletmeleri için 11 hane."
          error={error}
        />
        <Button
          label="Başvuruyu gönder"
          onPress={submit}
          loading={createBusiness.isPending}
          testID="business-submit"
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  form: {
    gap: space.lg,
    padding: space.xl,
  },
  categories: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.sm,
  },
});
