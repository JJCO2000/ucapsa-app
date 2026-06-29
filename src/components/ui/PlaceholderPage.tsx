import { Link } from 'expo-router';
import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type PlaceholderLink = {
  label: string;
  href: string;
  variant?: 'primary' | 'secondary';
};

type PlaceholderCard = {
  title: string;
  body: string;
  meta?: string;
};

type PlaceholderPageProps = {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  cards?: PlaceholderCard[];
  links?: PlaceholderLink[];
  children?: ReactNode;
  theme?: 'light' | 'dark';
};

export function PlaceholderPage({
  eyebrow,
  title,
  subtitle,
  cards = [],
  links = [],
  children,
  theme = 'light',
}: PlaceholderPageProps) {
  const isDark = theme === 'dark';

  return (
    <SafeAreaView style={[styles.safeArea, isDark ? styles.safeDark : styles.safeLight]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.hero, isDark ? styles.heroDark : styles.heroLight]}>
          {eyebrow ? (
            <Text style={[styles.eyebrow, isDark ? styles.eyebrowDark : styles.eyebrowLight]}>
              {eyebrow}
            </Text>
          ) : null}

          <Text style={[styles.title, isDark ? styles.titleDark : styles.titleLight]}>
            {title}
          </Text>

          {subtitle ? (
            <Text style={[styles.subtitle, isDark ? styles.subtitleDark : styles.subtitleLight]}>
              {subtitle}
            </Text>
          ) : null}
        </View>

        {cards.length > 0 ? (
          <View style={styles.section}>
            {cards.map((card) => (
              <View key={`${card.title}-${card.body}`} style={[styles.card, isDark ? styles.cardDark : styles.cardLight]}>
                {card.meta ? <Text style={styles.meta}>{card.meta}</Text> : null}
                <Text style={[styles.cardTitle, isDark ? styles.cardTitleDark : styles.cardTitleLight]}>
                  {card.title}
                </Text>
                <Text style={[styles.cardBody, isDark ? styles.cardBodyDark : styles.cardBodyLight]}>
                  {card.body}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        {children}

        {links.length > 0 ? (
          <View style={styles.actions}>
            {links.map((link) => {
              const isPrimary = link.variant === 'primary';
              return (
                <Link
                  key={`${link.href}-${link.label}`}
                  href={link.href as never}
                  style={[
                    styles.action,
                    isPrimary ? styles.actionPrimary : styles.actionSecondary,
                  ]}
                >
                  {link.label}
                </Link>
              );
            })}
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  safeLight: {
    backgroundColor: '#f8fafc',
  },
  safeDark: {
    backgroundColor: '#0f172a',
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  hero: {
    borderRadius: 28,
    padding: 24,
    marginBottom: 18,
    borderWidth: 1,
  },
  heroLight: {
    backgroundColor: '#ffffff',
    borderColor: '#e2e8f0',
  },
  heroDark: {
    backgroundColor: '#111827',
    borderColor: '#334155',
  },
  eyebrow: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1.4,
    marginBottom: 10,
    textTransform: 'uppercase',
  },
  eyebrowLight: {
    color: '#0f766e',
  },
  eyebrowDark: {
    color: '#38bdf8',
  },
  title: {
    fontSize: 34,
    lineHeight: 40,
    fontWeight: '900',
    marginBottom: 10,
  },
  titleLight: {
    color: '#0f172a',
  },
  titleDark: {
    color: '#ffffff',
  },
  subtitle: {
    fontSize: 17,
    lineHeight: 25,
    fontWeight: '600',
  },
  subtitleLight: {
    color: '#475569',
  },
  subtitleDark: {
    color: '#cbd5e1',
  },
  section: {
    gap: 12,
  },
  card: {
    borderRadius: 22,
    padding: 18,
    borderWidth: 1,
  },
  cardLight: {
    backgroundColor: '#ffffff',
    borderColor: '#e2e8f0',
  },
  cardDark: {
    backgroundColor: '#111827',
    borderColor: '#334155',
  },
  meta: {
    color: '#0f766e',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  cardTitle: {
    fontSize: 19,
    fontWeight: '800',
    marginBottom: 6,
  },
  cardTitleLight: {
    color: '#0f172a',
  },
  cardTitleDark: {
    color: '#f8fafc',
  },
  cardBody: {
    fontSize: 15,
    lineHeight: 22,
  },
  cardBodyLight: {
    color: '#64748b',
  },
  cardBodyDark: {
    color: '#cbd5e1',
  },
  actions: {
    marginTop: 18,
    gap: 12,
  },
  action: {
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 18,
    overflow: 'hidden',
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '800',
  },
  actionPrimary: {
    backgroundColor: '#0f766e',
    color: '#ffffff',
  },
  actionSecondary: {
    backgroundColor: '#e0f2fe',
    color: '#0369a1',
  },
});
