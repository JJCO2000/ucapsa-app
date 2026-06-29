import { Pressable, StyleSheet, Text, View } from 'react-native';

type MemberCardProps = {
  name: string;
  email?: string | null;
  memberNumber?: string | null;
  status?: string | null;
  paymentStatus?: string | null;
  onPress?: () => void;
};

export function MemberCard({
  name,
  email,
  memberNumber,
  status,
  paymentStatus,
  onPress,
}: MemberCardProps) {
  return (
    <Pressable
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.header}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{name.slice(0, 1).toUpperCase()}</Text>
        </View>
        <View style={styles.info}>
          <Text style={styles.name}>{name}</Text>
          {email ? <Text style={styles.email}>{email}</Text> : null}
          <Text style={styles.meta}>Socio: {memberNumber || 'Pendiente'}</Text>
        </View>
      </View>

      <View style={styles.badges}>
        {status ? <Text style={styles.badge}>{status}</Text> : null}
        {paymentStatus ? <Text style={styles.badge}>{paymentStatus}</Text> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 12,
    borderRadius: 18,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 16,
  },
  pressed: {
    opacity: 0.86,
    transform: [{ scale: 0.995 }],
  },
  header: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0f766e',
  },
  avatarText: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '900',
  },
  info: {
    flex: 1,
  },
  name: {
    color: '#0f172a',
    fontSize: 16,
    fontWeight: '900',
  },
  email: {
    marginTop: 2,
    color: '#64748b',
    fontSize: 13,
    fontWeight: '700',
  },
  meta: {
    marginTop: 4,
    color: '#0f766e',
    fontSize: 12,
    fontWeight: '900',
  },
  badges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  badge: {
    overflow: 'hidden',
    borderRadius: 999,
    backgroundColor: '#ccfbf1',
    color: '#0f766e',
    paddingHorizontal: 10,
    paddingVertical: 5,
    fontSize: 12,
    fontWeight: '900',
  },
});
