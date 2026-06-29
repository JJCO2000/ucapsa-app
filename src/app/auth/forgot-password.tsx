import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

export default function ForgotPasswordScreen() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Recuperar contrasena</Text>
      <Text style={styles.text}>
        Esta pantalla queda preparada. La recuperacion real se conecta despues.
      </Text>

      <Pressable onPress={() => router.push('/auth/login' as never)} style={styles.button}>
        <Text style={styles.buttonText}>Volver a login</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    color: '#ffffff',
    fontSize: 30,
    fontWeight: '900',
    marginBottom: 12,
  },
  text: {
    color: '#cbd5e1',
    fontSize: 16,
    lineHeight: 24,
    marginBottom: 24,
  },
  button: {
    alignItems: 'center',
    backgroundColor: '#0f766e',
    borderRadius: 16,
    minHeight: 52,
    justifyContent: 'center',
  },
  buttonText: {
    color: '#ffffff',
    fontWeight: '900',
    fontSize: 16,
  },
});
