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
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 14,
  },
  value: {
    color: '#0f172a',
    fontSize: 26,
    fontWeight: '900',
  },
  label: {
    marginTop: 2,
    color: '#64748b',
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  helper: {
    marginTop: 6,
    color: '#94a3b8',
    fontSize: 12,
    lineHeight: 17,
  },
});
