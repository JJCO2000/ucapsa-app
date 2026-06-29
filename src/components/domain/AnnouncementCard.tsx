import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Announcement, AudienceType } from '../../types/app.types';

const audienceLabels: Record<AudienceType, string> = {
  public: 'Publico',
  clients: 'Clientes',
  members: 'Socios',
  admins: 'Administracion',
};

type AnnouncementCardProps = {
  announcement: Announcement;
  showAdminActions?: boolean;
  onPress?: () => void;
  onEdit?: () => void;
  onArchive?: () => void;
  onRestore?: () => void;
  onDelete?: () => void;
  onTogglePublish?: () => void;
};

function formatDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return 'Fecha no disponible';
  }

  return date.toLocaleDateString('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function AnnouncementCard({
  announcement,
  showAdminActions = false,
  onPress,
  onEdit,
  onArchive,
  onRestore,
  onDelete,
  onTogglePublish,
}: AnnouncementCardProps) {
  const isArchived = Boolean(announcement.archived_at);
  const isHidden = isArchived || !announcement.is_published;

  return (
    <Pressable
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        isHidden && styles.hiddenCard,
        onPress && styles.pressableCard,
        pressed && onPress && styles.pressedCard,
      ]}
    >
      <View style={styles.topRow}>
        <View style={styles.badgesRow}>
          {announcement.is_pinned ? <Text style={styles.pinnedBadge}>Fijado</Text> : null}
          <Text style={styles.audienceBadge}>{audienceLabels[announcement.audience]}</Text>
          {announcement.is_published ? (
            <Text style={styles.publishedBadge}>Publicado</Text>
          ) : (
            <Text style={styles.unpublishedBadge}>Despublicado</Text>
          )}
          {isArchived ? <Text style={styles.archivedBadge}>Archivado</Text> : null}
        </View>
        <Text style={styles.date}>{formatDate(announcement.created_at)}</Text>
      </View>

      <Text style={styles.title}>{announcement.title}</Text>
      <Text style={styles.content}>{announcement.content}</Text>

      {showAdminActions ? (
        <View style={styles.actionsWrap}>
          <Pressable style={styles.secondaryButton} onPress={onEdit}>
            <Text style={styles.secondaryButtonText}>Editar</Text>
          </Pressable>

          <Pressable style={styles.secondaryButton} onPress={onTogglePublish}>
            <Text style={styles.secondaryButtonText}>
              {announcement.is_published ? 'Despublicar' : 'Publicar'}
            </Text>
          </Pressable>

          {isArchived ? (
            <Pressable style={styles.secondaryButton} onPress={onRestore}>
              <Text style={styles.secondaryButtonText}>Restaurar</Text>
            </Pressable>
          ) : (
            <Pressable style={styles.secondaryButton} onPress={onArchive}>
              <Text style={styles.secondaryButtonText}>Archivar</Text>
            </Pressable>
          )}

          <Pressable style={styles.dangerButton} onPress={onDelete}>
            <Text style={styles.dangerButtonText}>Eliminar</Text>
          </Pressable>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 10,
    padding: 16,
    borderRadius: 20,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  pressableCard: {
    borderColor: '#99f6e4',
  },
  pressedCard: {
    transform: [{ scale: 0.99 }],
    backgroundColor: '#f0fdfa',
  },
  hiddenCard: {
    opacity: 0.72,
    backgroundColor: '#f8fafc',
  },
  topRow: {
    gap: 8,
  },
  badgesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  pinnedBadge: {
    overflow: 'hidden',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: '#fef3c7',
    color: '#92400e',
    fontSize: 11,
    fontWeight: '800',
  },
  audienceBadge: {
    overflow: 'hidden',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: '#ccfbf1',
    color: '#0f766e',
    fontSize: 11,
    fontWeight: '800',
  },
  publishedBadge: {
    overflow: 'hidden',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: '#dcfce7',
    color: '#166534',
    fontSize: 11,
    fontWeight: '800',
  },
  unpublishedBadge: {
    overflow: 'hidden',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: '#fee2e2',
    color: '#991b1b',
    fontSize: 11,
    fontWeight: '800',
  },
  archivedBadge: {
    overflow: 'hidden',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: '#e2e8f0',
    color: '#334155',
    fontSize: 11,
    fontWeight: '800',
  },
  date: {
    color: '#64748b',
    fontSize: 12,
    fontWeight: '600',
  },
  title: {
    color: '#0f172a',
    fontSize: 18,
    fontWeight: '900',
  },
  content: {
    color: '#334155',
    fontSize: 14,
    lineHeight: 21,
  },
  actionsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingTop: 4,
  },
  secondaryButton: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 12,
    backgroundColor: '#f1f5f9',
  },
  secondaryButtonText: {
    color: '#0f172a',
    fontSize: 12,
    fontWeight: '800',
  },
  dangerButton: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 12,
    backgroundColor: '#fee2e2',
  },
  dangerButtonText: {
    color: '#991b1b',
    fontSize: 12,
    fontWeight: '900',
  },
});
