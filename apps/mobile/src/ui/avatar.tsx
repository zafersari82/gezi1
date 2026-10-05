import { Image } from "expo-image";
import { StyleSheet, View } from "react-native";

import { hashOf, initialsOf } from "@/lib/text";
import { accentFor, colors } from "@/theme/tokens";

import { AppText } from "./app-text";
import { Icon } from "./icon";

interface AvatarProps {
  /** Baş harfler ve zemin rengi bu addan türetilir. */
  name: string;
  imageUrl: string | null;
  size?: number;
  /** Grup sohbetleri baş harf yerine grup simgesiyle gösterilir. */
  group?: boolean;
}

/** VADO logosundaki gibi köşeleri yuvarlatılmış kare profil resmi. */
export function Avatar({ name, imageUrl, size = 48, group = false }: AvatarProps) {
  const shape = { width: size, height: size, borderRadius: size * 0.3 };

  if (imageUrl !== null) {
    return (
      <Image
        source={{ uri: imageUrl }}
        style={[shape, styles.image]}
        contentFit="cover"
        transition={150}
        accessibilityIgnoresInvertColors
      />
    );
  }

  const background = group ? colors.tealSoft : accentFor(hashOf(name));
  return (
    <View style={[shape, styles.placeholder, { backgroundColor: background }]}>
      {group ? (
        <Icon name="people" size={size * 0.5} color="teal" />
      ) : (
        <AppText
          color="white"
          style={{ fontSize: size * 0.38, lineHeight: size * 0.5, fontWeight: "600" }}
        >
          {initialsOf(name)}
        </AppText>
      )}
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
