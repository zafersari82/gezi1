import {
  REPORT_NOTE_MAX,
  REPORT_REASON_LABELS,
  REPORT_REASONS,
  type ReportReason,
  type ReportTargetType,
} from "@vado/contracts";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { errorMessage } from "@/api/client";
import { space } from "@/theme/tokens";
import { Button } from "@/ui/button";
import { Chip } from "@/ui/chip";
import { useFeedback } from "@/ui/feedback";
import { Sheet } from "@/ui/sheet";
import { TextField } from "@/ui/text-field";

import { useCreateReport } from "./queries";

/** Şikayet edilen kayıt. */
export interface ReportTarget {
  type: ReportTargetType;
  id: string;
}

interface ReportSheetProps {
  /** Şikayet edilecek kayıt; `null` iken pencere kapalıdır. */
  target: ReportTarget | null;
  onClose: () => void;
}

/** Kullanıcı, mesaj, paylaşım, işletme veya mini uygulama için şikayet formu. */
export function ReportSheet({ target, onClose }: ReportSheetProps) {
  const createReport = useCreateReport();
  const { notify } = useFeedback();
  const [reason, setReason] = useState<ReportReason>("spam");
  const [note, setNote] = useState("");

  function submit() {
    if (target === null) return;
    createReport.mutate(
      { targetType: target.type, targetId: target.id, reason, note: note.trim() },
      {
        onSuccess: () => {
          setNote("");
          onClose();
          notify("Şikayetin alındı. Ekibimiz inceleyecek.");
        },
        onError: (error) => {
          notify(errorMessage(error));
        },
      },
    );
  }

  return (
    <Sheet visible={target !== null} title="Şikayet et" onClose={onClose}>
      <View style={styles.reasons}>
        {REPORT_REASONS.map((item) => (
          <Chip
            key={item}
            label={REPORT_REASON_LABELS[item]}
            selected={item === reason}
            onPress={() => {
              setReason(item);
            }}
          />
        ))}
      </View>
      <TextField
        label="Açıklama (isteğe bağlı)"
        value={note}
        onChangeText={setNote}
        maxLength={REPORT_NOTE_MAX}
        multiline
      />
      <Button label="Şikayeti gönder" loading={createReport.isPending} onPress={submit} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  reasons: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.sm,
  },
});
