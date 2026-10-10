import {
  BUSINESS_DESCRIPTION_MAX,
  BUSINESS_NAME_MAX,
  type BusinessStatus,
  CATEGORIES,
  type Category,
  CATEGORY_LABELS,
  createBusinessBodySchema,
  STUDIO_TEMPLATES,
  type StudioTemplate,
  type StudioTemplateId,
} from "@vado/contracts";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { errorMessage } from "@/api/client";
import { useCreateBusiness, useOwnedBusinesses } from "@/features/businesses/queries";
import { foldText } from "@/lib/text";
import { colors, radius, space } from "@/theme/tokens";
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

/** Kullanıcı adres bilmek zorunda değildir; adres işletme adından türetilir. */
function slugify(name: string): string {
  return foldText(name)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function TemplateOption({
  template,
  selected,
  onPress,
}: {
  template: StudioTemplate;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={`${template.name}. ${template.description}`}
      onPress={onPress}
      style={[styles.template, selected && styles.selectedTemplate]}
      testID={`studio-template-${template.id}`}
    >
      <View
        style={[
          styles.templatePreview,
          { backgroundColor: template.accent },
          template.layout === "editorial" && styles.editorialPreview,
          template.layout === "compact" && styles.compactPreview,
          template.layout === "enterprise" && styles.enterprisePreview,
        ]}
      >
        <View
          style={[
            styles.previewHeading,
            template.layout === "editorial" && styles.editorialHeading,
          ]}
        />
        <View style={styles.previewRow}>
          <View style={styles.previewProduct} />
          <View style={styles.previewLines}>
            <View style={styles.previewLineLong} />
            <View style={styles.previewLineShort} />
          </View>
        </View>
        <View style={styles.previewBottom} />
      </View>
      <View style={styles.templateCopy}>
        <AppText variant="bodyStrong">{template.name}</AppText>
        <AppText variant="caption" color="muted">
          {template.description}
        </AppText>
        <AppText variant="micro" color={selected ? "teal" : "faint"}>
          {selected ? "Seçildi" : "Seçmek için dokun"}
        </AppText>
      </View>
    </Pressable>
  );
}

export default function RegisterBusinessScreen() {
  const owned = useOwnedBusinesses();
  const createBusiness = useCreateBusiness();
  const { notify } = useFeedback();
  const [step, setStep] = useState<"template" | "details">("template");
  const [name, setName] = useState("");
  const [category, setCategory] = useState<Category>("food");
  const [templateId, setTemplateId] = useState<StudioTemplateId | null>("food-fast");
  const [city, setCity] = useState("");
  const [description, setDescription] = useState("");
  const [taxNumber, setTaxNumber] = useState("");
  const [error, setError] = useState<string | null>(null);
  const templates = STUDIO_TEMPLATES.filter((item) => item.category === category);
  const selected = templates.find((item) => item.id === templateId);

  function selectCategory(value: Category) {
    setCategory(value);
    setTemplateId(STUDIO_TEMPLATES.find((item) => item.category === value)?.id ?? null);
  }

  function submit() {
    const body = createBusinessBodySchema.safeParse({
      name,
      slug: slugify(name),
      category,
      city,
      description,
      ...(selected === undefined ? {} : { templateId: selected.id }),
      ...(taxNumber.trim() === "" ? {} : { taxNumber: taxNumber.trim() }),
    });
    if (!body.success) {
      setError("İşletme adı, şehir ve varsa vergi numarasını kontrol et.");
      return;
    }
    setError(null);
    createBusiness.mutate(body.data, {
      onSuccess: () => {
        setName("");
        setCity("");
        setDescription("");
        setTaxNumber("");
        setStep("template");
        notify("Mağaza başvurun ve seçtiğin taslak kaydedildi. Yayın için onay gerekiyor.");
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
        <AppText variant="subheading">İşletmeni telefonundan kur</AppText>
        <AppText color="muted">
          {step === "template"
            ? "Önce işini ve sana uygun başlangıç taslağını seç. Sonra birkaç bilgi isteyeceğiz."
            : "Bir adım kaldı. Mağazan onaylanana kadar taslak olarak saklanır."}
        </AppText>
        {step === "template" ? (
          <>
            <AppText variant="bodyStrong">Ne iş yapıyorsun?</AppText>
            <View style={styles.categories}>
              {CATEGORIES.map((item) => (
                <Chip
                  key={item}
                  label={CATEGORY_LABELS[item]}
                  selected={item === category}
                  onPress={() => {
                    selectCategory(item);
                  }}
                />
              ))}
            </View>
            <AppText variant="bodyStrong">Mağaza görünümün</AppText>
            {templates.length === 0 ? (
              <View style={styles.notice}>
                <AppText color="muted">
                  Bu sektör için henüz hazır şablon yok. İşletme başvurusunu şablon seçmeden
                  yapabilirsin.
                </AppText>
              </View>
            ) : (
              templates.map((item) => (
                <TemplateOption
                  key={item.id}
                  template={item}
                  selected={item.id === selected?.id}
                  onPress={() => {
                    setTemplateId(item.id);
                  }}
                />
              ))
            )}
            {category === "beauty" && (
              <AppText variant="caption" color="muted">
                Berber ve salon şablonları taslak olarak kaydedilir. Randevu sistemi tamamlanınca
                kullanıma açılacak.
              </AppText>
            )}
            <Button
              label="Devam et"
              onPress={() => {
                setStep("details");
              }}
              testID="studio-next"
            />
          </>
        ) : (
          <>
            <AppText variant="caption" color="muted">
              {selected === undefined
                ? CATEGORY_LABELS[category]
                : `${CATEGORY_LABELS[category]} · ${selected.name}`}
            </AppText>
            <TextField
              label="İşletmenin adı"
              placeholder="Ahmet Usta Pilav"
              value={name}
              onChangeText={setName}
              maxLength={BUSINESS_NAME_MAX}
              hint={name.trim() === "" ? undefined : `Adres: ${slugify(name)}`}
              testID="business-name"
            />
            <TextField
              label="Şehir"
              placeholder="İstanbul"
              value={city}
              onChangeText={setCity}
              testID="business-city"
            />
            <TextField
              label="Kısa tanıtım (isteğe bağlı)"
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
              label="Başvuruyu ve mağaza taslağını oluştur"
              onPress={submit}
              loading={createBusiness.isPending}
              testID="business-submit"
            />
            <Button
              label="Şablon seçimine dön"
              variant="secondary"
              disabled={createBusiness.isPending}
              onPress={() => {
                setStep("template");
              }}
            />
          </>
        )}
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
  template: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.lg,
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: space.md,
  },
  selectedTemplate: {
    borderColor: colors.teal,
    borderWidth: 2,
  },
  templatePreview: {
    width: 88,
    height: 106,
    borderRadius: radius.md,
    padding: space.sm,
    gap: space.md,
  },
  compactPreview: {
    gap: space.sm,
  },
  editorialPreview: {
    justifyContent: "space-between",
  },
  enterprisePreview: {
    borderRadius: radius.sm,
    justifyContent: "space-evenly",
  },
  editorialHeading: {
    height: 28,
    width: "100%",
  },
  previewHeading: {
    height: 12,
    width: 56,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
  },
  previewRow: {
    flexDirection: "row",
    gap: space.xs,
  },
  previewProduct: {
    height: 34,
    width: 30,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
  },
  previewLines: {
    gap: space.sm,
    justifyContent: "center",
  },
  previewLineLong: {
    width: 22,
    height: 5,
    backgroundColor: colors.surface,
  },
  previewLineShort: {
    width: 14,
    height: 5,
    backgroundColor: colors.surface,
  },
  previewBottom: {
    height: 12,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
  },
  templateCopy: {
    flex: 1,
    gap: space.xs,
  },
  notice: {
    padding: space.lg,
    backgroundColor: colors.mist,
    borderRadius: radius.md,
  },
});
