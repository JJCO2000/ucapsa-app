import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { ucapsaBrand } from '../../constants/brand';
import type { CalendarServiceKind } from '../../utils/calendar-service-rings.utils';

const RING_SIZE = 40;
const CENTER = RING_SIZE / 2;
const RADIUS = 17;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const STROKE = 4.5;

const KIND_COLORS: Record<CalendarServiceKind, string> = {
  puppy: ucapsaBrand.colors.gold,
  comandos: ucapsaBrand.colors.blue,
  activity: ucapsaBrand.colors.red,
};

const KIND_LABELS: Record<CalendarServiceKind, string> = {
  puppy: 'Puppy',
  comandos: 'Comandos',
  activity: 'Otras actividades',
};

type Props = {
  dayNumber: number;
  dateLabel: string;
  kinds: readonly CalendarServiceKind[];
  selected: boolean;
  today: boolean;
  outsideMonth: boolean;
  dataIncomplete?: boolean;
  onPress: () => void;
};

export const CalendarActivityRing = memo(function CalendarActivityRing({
  dayNumber,
  dateLabel,
  kinds,
  selected,
  today,
  outsideMonth,
  dataIncomplete = false,
  onPress,
}: Props) {
  const count = kinds.length;
  const hasScheduledService = count > 0;
  const arc = count > 0 ? CIRCUMFERENCE / count : CIRCUMFERENCE;
  // Small gaps delimit equal sectors without losing the three activity colors.
  const visibleArc = count > 1 ? arc - 2 : arc;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={dateLabel + (today ? ', hoy' : '') + ': ' + (count > 0
        ? kinds.map((kind) => KIND_LABELS[kind]).join(', ')
        : dataIncomplete
          ? 'Información de actividades sin verificar'
          : 'Sin clases ni actividades programadas')
        + (dataIncomplete && count > 0 ? '. Pueden faltar otras actividades por sincronizar' : '')}
      onPress={onPress}
      style={[styles.hitTarget, outsideMonth && styles.outsideMonth]}
    >
      <View style={styles.ringArea}>
        <Svg width={RING_SIZE} height={RING_SIZE} style={styles.absoluteRing}>
          {count === 0 ? (
            <Circle
              cx={CENTER} cy={CENTER} r={RADIUS}
              fill="none"
              stroke={ucapsaBrand.colors.adminBorder}
              strokeWidth={STROKE}
              strokeDasharray={dataIncomplete ? '3 4' : undefined}
            />
          ) : kinds.map((kind, index) => (
            <Circle
              key={kind}
              cx={CENTER} cy={CENTER} r={RADIUS}
              fill="none"
              stroke={KIND_COLORS[kind]}
              strokeWidth={STROKE}
              strokeDasharray={count === 1
                ? undefined
                : `${visibleArc} ${CIRCUMFERENCE - visibleArc}`}
              strokeDashoffset={-index * arc}
              rotation={-90}
              originX={CENTER}
              originY={CENTER}
            />
          ))}
        </Svg>
        <View style={[
          styles.numberSurface,
          selected && (hasScheduledService ? styles.selectedServiceSurface : styles.selectedEmptySurface),
        ]}>
          <Text style={[
            styles.dayNumber,
            {
              color: hasScheduledService
                ? ucapsaBrand.colors.text
                : ucapsaBrand.colors.mutedNeutral,
            },
          ]}>{dayNumber}</Text>
        </View>
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  hitTarget: { minHeight: 48, alignItems: 'center', justifyContent: 'center', paddingVertical: 3 },
  outsideMonth: { opacity: 0.38 },
  ringArea: { width: RING_SIZE, height: RING_SIZE, alignItems: 'center', justifyContent: 'center' },
  absoluteRing: { position: 'absolute', top: 0, left: 0 },
  numberSurface: {
    width: 28, height: 28, borderRadius: 999,
    alignItems: 'center', justifyContent: 'center',
  },
  selectedServiceSurface: { backgroundColor: ucapsaBrand.colors.redSoft },
  selectedEmptySurface: { backgroundColor: ucapsaBrand.colors.graySoft },
  dayNumber: { fontSize: 16, lineHeight: 20, fontWeight: '900', includeFontPadding: false, textAlign: 'center' },
});
