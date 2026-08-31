import { ucapsaBrand } from '../../constants/brand';
import { StyleSheet, Text, View } from 'react-native';

type AdminMetricCardProps = {
  label: string;
  value: number | string;
  helper?: string;
};

export function AdminMetricCard({ label, value, helper }: AdminMetricCardProps) {
  return (
    <View style={styles.card}>
      <Text style={styles.value}>{value}</Text>
      <Text style={styles.label}>{label}</Text>
      {helper ? <Text style={styles.helper}>{helper}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 18,
    backgroundColor: ucapsaBrand.colors.surface,
    borderWidth: 1,
    borderColor: ucapsaBrand.colors.borderNeutral,
    padding: 14,
  },
  value: {
    color: ucapsaBrand.colors.cameraDark,
    fontSize: 26,
    fontWeight: '900',
  },
  label: {
    marginTop: 2,
    color: ucapsaBrand.colors.mutedNeutral,
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  helper: {
    marginTop: 6,
    color: ucapsaBrand.colors.gray,
    fontSize: 12,
    lineHeight: 17,
  },
});
