import { Platform, Switch } from "react-native";

import { colors } from "@/theme/tokens";

interface ToggleProps {
  value: boolean;
  onChange: (value: boolean) => void;
  /** Ekran okuyucular için anahtarın neyi açıp kapattığı. */
  label: string;
  disabled?: boolean;
}

// react-native-web, açık durumdaki düğme rengini React Native tiplerinde bulunmayan ayrı bir
// özellikten okur; verilmezse düğme tarayıcıda farklı bir yeşille çizilir.
const WEB_PROPS = Platform.OS === "web" ? { activeThumbColor: colors.white } : {};

/** Açık/kapalı ayarlar için anahtar. */
export function Toggle({ value, onChange, label, disabled = false }: ToggleProps) {
  return (
    <Switch
      value={value}
      onValueChange={onChange}
      disabled={disabled}
      trackColor={{ true: colors.teal, false: colors.line }}
      thumbColor={colors.white}
      accessibilityLabel={label}
      {...WEB_PROPS}
    />
  );
}
