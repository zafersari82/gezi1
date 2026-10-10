import { type Business, type Category, CATEGORY_LABELS, type MiniApp } from "@vado/contracts";

import { compareTr, foldText } from "@/lib/text";

/** Keşif aynı işletmeyi ve mini uygulamayı farklı türler olarak sunar. */
export type DiscoveryKind = "all" | "business" | "miniapp";
export type DiscoveryResult =
  | { kind: "business"; business: Business }
  | { kind: "miniapp"; miniApp: MiniApp };

interface SearchDiscoveryOptions {
  businesses: Business[];
  miniApps: MiniApp[];
  query: string;
  category: Category | null;
  kind: DiscoveryKind;
}

/**
 * Halihazırda API tarafından listelenen doğrulanmış işletme ve yayındaki uygulamalarda arar.
 * Her sözcük aranır; Türkçe aksanlar ve harf büyüklüğü sonucu etkilemez.
 * Bu, tüm sistemin arandığı sunucu taraflı bir arama motoru değildir.
 */
export function searchDiscovery({
  businesses,
  miniApps,
  query,
  category,
  kind,
}: SearchDiscoveryOptions): DiscoveryResult[] {
  const terms = foldText(query).split(/\s+/).filter(Boolean);
  const matches = (name: string, description: string, itemCategory: Category): boolean => {
    if (category !== null && itemCategory !== category) return false;
    const haystack = foldText(`${name} ${description} ${CATEGORY_LABELS[itemCategory]}`);
    return terms.every((term) => haystack.includes(term));
  };

  const results: DiscoveryResult[] = [];
  if (kind !== "miniapp") {
    for (const business of businesses) {
      if (matches(business.name, `${business.description} ${business.city}`, business.category)) {
        results.push({ kind: "business", business });
      }
    }
  }
  if (kind !== "business") {
    for (const miniApp of miniApps) {
      if (matches(miniApp.name, `${miniApp.description} ${miniApp.developerName}`, miniApp.category)) {
        results.push({ kind: "miniapp", miniApp });
      }
    }
  }

  /** Adla eşleşenler önce gösterilir; aynı puanda kararlı Türkçe ad sırası kullanılır. */
  const score = (item: DiscoveryResult): number => {
    if (terms.length === 0) return 0;
    const name = foldText(item.kind === "business" ? item.business.name : item.miniApp.name);
    const needle = terms.join(" ");
    if (name === needle) return 3;
    if (name.startsWith(needle)) return 2;
    if (terms.every((term) => name.includes(term))) return 1;
    return 0;
  };
  results.sort((left, right) => {
    const byScore = score(right) - score(left);
    if (byScore !== 0) return byScore;
    const leftName = left.kind === "business" ? left.business.name : left.miniApp.name;
    const rightName = right.kind === "business" ? right.business.name : right.miniApp.name;
    const byName = compareTr(leftName, rightName);
    if (byName !== 0) return byName;
    const leftId = left.kind === "business" ? left.business.id : left.miniApp.id;
    const rightId = right.kind === "business" ? right.business.id : right.miniApp.id;
    return `${left.kind}-${leftId}`.localeCompare(`${right.kind}-${rightId}`);
  });
  return results;
}
