import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { StyleSheet, Text, View } from 'react-native';

import {
  DOG_AVATAR_OPTIONS,
  dogAvatarForeground,
  isAccessibleDogAvatarForeground,
  normalizeDogAvatarForegroundColor,
  normalizeDogAvatarColor,
  normalizeDogAvatarKey,
  type DogAvatarColor,
  type DogAvatarForegroundColor,
  type DogAvatarKey,
} from '../../constants/dogAvatar';

export function DogAvatar({
  avatarKey,
  avatarColor,
  avatarForegroundColor,
  size = 52,
  accessibilityLabel,
}: {
  avatarKey?: DogAvatarKey | string | null;
  avatarColor?: DogAvatarColor | string | null;
  avatarForegroundColor?: DogAvatarForegroundColor | string | null;
  size?: number;
  accessibilityLabel?: string;
}) {
  const normalizedKey = normalizeDogAvatarKey(avatarKey);
  const normalizedColor = normalizeDogAvatarColor(avatarColor);
  const option = DOG_AVATAR_OPTIONS.find((item) => item.key === normalizedKey) ?? DOG_AVATAR_OPTIONS[0];
  const requestedForeground = normalizeDogAvatarForegroundColor(avatarForegroundColor);
  const foreground = requestedForeground && isAccessibleDogAvatarForeground(normalizedColor, requestedForeground)
    ? requestedForeground : dogAvatarForeground(normalizedColor);
  // Conservar emojis actuales hasta que el propietario elija un color de dibujo.
  // Un emoji no admite tinte; su equivalente vectorial sí.
  const vectorEmoji: Record<string, { icon: string; badge?: string }> = {
    dog_face: { icon: 'dog' }, dog_side: { icon: 'dog-side' },
    poodle: { icon: 'dog', badge: 'star' },
    guide_dog: { icon: 'dog-side', badge: 'compass' },
    service_dog: { icon: 'dog', badge: 'shield-check' },
    paw: { icon: 'paw' },
  };
  const vector = option.kind === 'emoji' && requestedForeground ? vectorEmoji[normalizedKey] : null;
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
      {option.kind === 'emoji' && !vector ? (
        <Text
          allowFontScaling={false}
          style={{ fontSize: Math.round(size * 0.5), lineHeight: Math.round(size * 0.62) }}
        >
          {option.value}
        </Text>
      ) : (
        <>
          <MaterialCommunityIcons
            name={(vector?.icon ?? option.value) as keyof typeof MaterialCommunityIcons.glyphMap}
            size={Math.round(size * 0.54)}
            color={foreground}
          />
          {(vector?.badge ?? option.badge) ? (
            <MaterialCommunityIcons
              name={(vector?.badge ?? option.badge) as keyof typeof MaterialCommunityIcons.glyphMap}
              size={Math.round(size * 0.27)}
              color={foreground}
              style={{ position: 'absolute', right: Math.max(2, size * 0.07), bottom: Math.max(2, size * 0.07) }}
            />
          ) : null}
        </>
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
