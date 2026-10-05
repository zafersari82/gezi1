import type { MiniApp } from "@vado/contracts";
import { Image } from "expo-image";
import { StyleSheet, View } from "react-native";

import { hashOf, upperCaseTr } from "@/lib/text";
import { accentFor, colors } from "@/theme/tokens";
import { AppText } from "@/ui/app-text";

interface MiniAppIconProps {
  miniApp: Pick<MiniApp, "name" | "iconUrl">;
  size?: number;
}

/** Mini uygulamanın simgesi; simge tanımlı değilse adının baş harfi gösterilir. */
export function MiniAppIcon({ miniApp, size = 48 }: MiniAppIconProps) {
  const shape = { width: size, height: size, borderRadius: size * 0.24 };

  if (miniApp.iconUrl !== null) {
    return <Image source={{ uri: miniApp.iconUrl }} style={[shape, styles.image]} />;
  }
  return (
    <View style={[shape, styles.placeholder, { backgroundColor: accentFor(hashOf(miniApp.name)) }]}>
      <AppText
        color="white"
        style={{ fontSize: size * 0.44, lineHeight: size * 0.56, fontWeight: "700" }}
      >
        {upperCaseTr(miniApp.name.trim()[0] ?? "")}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  image: {
    backgroundColor: colors.mist,
  },
  placeholder: {
    alignItems: "center",
    justifyContent: "center",
  },
});
