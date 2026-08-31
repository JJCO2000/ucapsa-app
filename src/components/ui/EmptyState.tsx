import { ucapsaBrand } from '../../constants/brand';
import { Pressable, StyleSheet, Text, View } from 'react-native';

type EmptyStateProps = {
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
};

export function EmptyState({ title, message, actionLabel, onAction }: EmptyStateProps) {
  return (
    <View style={styles.box}>
      <Text style={styles.title}>{title}</Text>
      {message ? <Text style={styles.message}>{message}</Text> : null}
      {actionLabel && onAction ? (
        <Pressable onPress={onAction} style={styles.button}>
          <Text style={styles.buttonText}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    gap: 8,
    borderRadius: 18,
    backgroundColor: ucapsaBrand.colors.surface,
    borderWidth: 1,
    borderColor: ucapsaBrand.colors.borderNeutral,
    padding: 18,
  },
  title: {
    color: ucapsaBrand.colors.cameraDark,
    fontSize: 16,
    fontWeight: '900',
  },
  message: {
    color: ucapsaBrand.colors.mutedNeutral,
    fontSize: 14,
    lineHeight: 20,
  },
  button: {
    alignSelf: 'flex-start',
    marginTop: 4,
    borderRadius: 14,
    backgroundColor: ucapsaBrand.colors.green,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  buttonText: {
    color: ucapsaBrand.colors.surface,
    fontWeight: '900',
  },
});
