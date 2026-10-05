import { useState } from "react";
import { StyleSheet, TextInput, type TextInputProps, View } from "react-native";

import { colors, radius, space, typography } from "@/theme/tokens";

import { AppText } from "./app-text";

interface TextFieldProps extends Omit<TextInputProps, "style"> {
  label: string;
  /** Alanın altında gösterilen yardım metni. */
  hint?: string;
  /** Doluysa yardım metninin yerine hata olarak gösterilir. */
  error?: string | null;
  /** Girişin solunda sabit duran metin (ör. ülke kodu veya @). */
  prefix?: string;
}

export function TextField({ label, hint, error, prefix, multiline, ...input }: TextFieldProps) {
  const [focused, setFocused] = useState(false);
  const hasError = error !== undefined && error !== null && error !== "";
  const message = hasError ? error : hint;

  return (
    <View style={styles.field}>
      <AppText variant="callout" color="muted">
        {label}
      </AppText>
      <View
        style={[
          styles.box,
          multiline === true && styles.boxMultiline,
          focused && styles.boxFocused,
          hasError && styles.boxError,
        ]}
      >
        {prefix !== undefined && (
          <AppText variant="body" color="muted">
            {prefix}
          </AppText>
        )}
        <TextInput
          {...input}
          multiline={multiline}
          accessibilityLabel={label}
          placeholderTextColor={colors.faint}
          onFocus={(event) => {
            setFocused(true);
            input.onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            input.onBlur?.(event);
          }}
          style={[styles.input, multiline === true && styles.inputMultiline]}
        />
      </View>
      {message !== undefined && (
        <AppText variant="caption" color={hasError ? "coral" : "muted"}>
          {message}
        </AppText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    gap: space.xs + 2,
  },
  box: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    minHeight: 50,
    paddingHorizontal: space.lg,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  boxMultiline: {
    alignItems: "flex-start",
    paddingVertical: space.md,
  },
  boxFocused: {
    borderColor: colors.teal,
  },
  boxError: {
    borderColor: colors.coral,
  },
  input: {
    flex: 1,
    ...typography.body,
    color: colors.ink,
    paddingVertical: 0,
    // Web'de tarayıcının varsayılan odak çerçevesi yerine kutunun kenarlığı kullanılır.
    outlineWidth: 0,
  },
  inputMultiline: {
    minHeight: 88,
    verticalAlign: "top",
  },
});
