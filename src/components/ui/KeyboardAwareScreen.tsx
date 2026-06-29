import type { ReactNode } from 'react';
import {
  type ScrollViewProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { type Edge } from 'react-native-safe-area-context';
import { Screen } from './Screen';

type KeyboardAwareScreenProps = {
  children: ReactNode;
  scroll?: boolean;
  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
  edges?: Edge[];
  refreshControl?: ScrollViewProps['refreshControl'];
};

export function KeyboardAwareScreen({
  children,
  scroll = true,
  style,
  contentContainerStyle,
  edges,
  refreshControl,
}: KeyboardAwareScreenProps) {
  return (
    <Screen
      scroll={scroll}
      keyboardAware
      style={style}
      contentContainerStyle={contentContainerStyle}
      edges={edges}
      refreshControl={refreshControl}
    >
      {children}
    </Screen>
  );
}
