import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { StyleSheet, Text, View } from 'react-native';

import {
  DOG_AVATAR_OPTIONS,
  dogAvatarForeground,
  normalizeDogAvatarColor,
  normalizeDogAvatarKey,
  type DogAvatarColor,
  type DogAvatarKey,
} from '../../constants/dogAvatar';

export function DogAvatar({
  avatarKey,
  avatarColor,
  size = 52,
  accessibilityLabel,
}: {
  avatarKey?: DogAvatarKey | string | null;
  avatarColor?: DogAvatarColor | string | null;
  size?: number;
  accessibilityLabel?: string;
}) {
  const normalizedKey = normalizeDogAvatarKey(avatarKey);
  const normalizedColor = normalizeDogAvatarColor(avatarColor);
  const option = DOG_AVATAR_OPTIONS.find((item) => item.key === normalizedKey) ?? DOG_AVATAR_OPTIONS[0];
  const foreground = dogAvatarForeground(normalizedColor);
  const radius = Math.max(14, Math.round(size * 0.32));

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel ?? 'Avatar del perro'}
      style={[
        styles.base,
        {
          width: size,
          height: size,
          borderRadius: radius,
          backgroundColor: normalizedColor,
        },
      ]}
    >
      {option.kind === 'emoji' ? (
        <Text
          allowFontScaling={false}
          style={{ fontSize: Math.round(size * 0.5), lineHeight: Math.round(size * 0.62) }}
        >
          {option.value}
        </Text>
      ) : (
        <MaterialCommunityIcons
          name={option.value as keyof typeof MaterialCommunityIcons.glyphMap}
          size={Math.round(size * 0.54)}
          color={foreground}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
});
