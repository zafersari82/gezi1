import type { Catalog } from "@vado/contracts";

export function selectionProblem(
  groups: Catalog["optionGroups"],
  selected: string[],
): string | null {
  const allowed = new Set(
    groups
      .filter((g) => g.active)
      .flatMap((g) => g.options.filter((o) => o.active).map((o) => o.id)),
  );
  if (new Set(selected).size !== selected.length || selected.some((id) => !allowed.has(id)))
    return "Seçenekler değişti. Ürünü yeniden aç.";
  for (const group of groups.filter((g) => g.active)) {
    const count = group.options.filter((o) => selected.includes(o.id)).length;
    if (count < group.minSelected || count > group.maxSelected)
      return `${group.name}: en az ${group.minSelected}, en çok ${group.maxSelected} seçim yap.`;
  }
  return null;
}

export const money = (minor: number): string =>
  new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" }).format(minor / 100);
export { formatBranchDateTime as dateTime } from "@vado/contracts";
export const states: Readonly<Record<string, string>> = {
  placed: "Kabul bekliyor",
  accepted: "Kabul edildi",
  preparing: "Hazırlanıyor",
  ready: "Hazır",
  completed: "Tamamlandı",
  rejected: "Reddedildi",
  cancelled: "İptal edildi",
};
