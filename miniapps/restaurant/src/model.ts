export { formatBranchDateTime as dateTime } from "@vado/contracts";
export { money, selectionProblem } from "@vado/miniapp-shared/catalog-options";
export const states: Readonly<Record<string, string>> = {
  placed: "Kabul bekliyor",
  accepted: "Kabul edildi",
  preparing: "Hazırlanıyor",
  ready: "Hazır",
  completed: "Tamamlandı",
  rejected: "Reddedildi",
  cancelled: "İptal edildi",
};
