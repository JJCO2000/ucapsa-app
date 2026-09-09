import type { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
  type ScrollViewProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { ucapsaBrand } from '../../constants/brand';

type ScreenProps = {
  children: ReactNode;
  scroll?: boolean;
  keyboardAware?: boolean;
  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
  edges?: Edge[];
  refreshControl?: ScrollViewProps['refreshControl'];
  backgroundColor?: string;
};

export function Screen({
  children,
  scroll = true,
  keyboardAware = false,
  style,
  contentContainerStyle,
  edges = ['top', 'left', 'right'],
  refreshControl,
  backgroundColor = ucapsaBrand.colors.background,
}: ScreenProps) {
  const content = scroll ? (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      refreshControl={refreshControl}
      style={{ backgroundColor }}
      contentContainerStyle={[styles.content, contentContainerStyle]}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.content, { backgroundColor }, contentContainerStyle]}>{children}</View>
  );

  const safeContent = (
    <SafeAreaView edges={edges} style={[styles.safe, { backgroundColor }, style]}>
      {content}
    </SafeAreaView>
  );

  if (!keyboardAware) return safeContent;

  return (
    <KeyboardAvoidingView
      style={styles.keyboard}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {safeContent}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  keyboard: { flex: 1 },
  safe: { flex: 1 },
  content: {
    width: '100%',
    maxWidth: 820,
    alignSelf: 'center',
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 28,
  },
});
