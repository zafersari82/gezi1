import { Stack, useLocalSearchParams } from "expo-router";

import { LEGAL_DOCUMENTS, type LegalDocumentId } from "@/features/legal/documents";
import { AppText } from "@/ui/app-text";
import { Screen } from "@/ui/screen";

export default function LegalDocumentScreen() {
  const { document } = useLocalSearchParams<{ document: string }>();
  const id: LegalDocumentId = document === "privacy" ? "privacy" : "terms";
  const { title, paragraphs } = LEGAL_DOCUMENTS[id];

  return (
    <Screen scroll padded>
      <Stack.Screen options={{ title }} />
      {paragraphs.map((paragraph) => (
        <AppText key={paragraph}>{paragraph}</AppText>
      ))}
    </Screen>
  );
}
