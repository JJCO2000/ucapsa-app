import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { AnnouncementCard } from '../../components/domain/AnnouncementCard';
import { useSession } from '../../hooks/useSession';
import {
  archiveAnnouncement,
  createAnnouncement,
  deleteAnnouncement,
  listAdminAnnouncements,
  restoreAnnouncement,
  setAnnouncementPublished,
  updateAnnouncement,
  type AnnouncementInput,
} from '../../services/announcements.service';
import type { Announcement, AudienceType } from '../../types/app.types';

const audienceOptions: Array<{ value: AudienceType; label: string }> = [
  { value: 'public', label: 'Publico' },
  { value: 'clients', label: 'Clientes' },
  { value: 'members', label: 'Socios' },
  { value: 'admins', label: 'Admins' },
];

const emptyForm: AnnouncementInput = {
  title: '',
  content: '',
  audience: 'public',
  is_pinned: false,
  is_published: true,
};

type AnnouncementFormProps = {
  title: string;
  form: AnnouncementInput;
  saving: boolean;
  error: string | null;
  submitLabel: string;
  onChange: (form: AnnouncementInput) => void;
  onCancel?: () => void;
  onSubmit: () => void;
};

function AnnouncementForm({
  title,
  form,
  saving,
  error,
  submitLabel,
  onChange,
  onCancel,
  onSubmit,
}: AnnouncementFormProps) {
  return (
    <View style={styles.formCard}>
      <Text style={styles.formTitle}>{title}</Text>

      <View style={styles.field}>
        <Text style={styles.label}>Titulo</Text>
        <TextInput
          value={form.title}
          onChangeText={(nextTitle) => onChange({ ...form, title: nextTitle })}
          placeholder="Ej. Cambio de horario"
          placeholderTextColor="#94a3b8"
          style={styles.input}
        />
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Contenido</Text>
        <TextInput
          value={form.content}
          onChangeText={(content) => onChange({ ...form, content })}
          placeholder="Escribe el comunicado oficial..."
          placeholderTextColor="#94a3b8"
          style={[styles.input, styles.textArea]}
          multiline
          textAlignVertical="top"
        />
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Audiencia</Text>
        <View style={styles.segmentWrap}>
          {audienceOptions.map((option) => {
            const selected = form.audience === option.value;
            return (
              <Pressable
                key={option.value}
                style={[styles.segmentButton, selected && styles.segmentButtonActive]}
                onPress={() => onChange({ ...form, audience: option.value })}
              >
                <Text style={[styles.segmentText, selected && styles.segmentTextActive]}>
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.switchRow}>
        <View style={styles.switchTextBox}>
          <Text style={styles.label}>Fijar arriba</Text>
          <Text style={styles.helpText}>Los anuncios fijados aparecen primero.</Text>
        </View>
        <Switch
          value={form.is_pinned}
          onValueChange={(is_pinned) => onChange({ ...form, is_pinned })}
        />
      </View>

      <View style={styles.switchRow}>
        <View style={styles.switchTextBox}>
          <Text style={styles.label}>Publicado</Text>
          <Text style={styles.helpText}>Si esta apagado, usuarios normales no lo ven.</Text>
        </View>
        <Switch
          value={form.is_published ?? true}
          onValueChange={(is_published) => onChange({ ...form, is_published })}
        />
      </View>

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <View style={styles.formActions}>
        {onCancel ? (
          <Pressable style={styles.cancelButton} onPress={onCancel} disabled={saving}>
            <Text style={styles.cancelButtonText}>Cancelar</Text>
          </Pressable>
        ) : null}

        <Pressable style={styles.saveButton} onPress={onSubmit} disabled={saving}>
          <Text style={styles.saveButtonText}>{saving ? 'Guardando...' : submitLabel}</Text>
        </Pressable>
      </View>
    </View>
  );
}

export default function AdminAnnouncementsScreen() {
  const { loading: sessionLoading, isAdmin } = useSession();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [createForm, setCreateForm] = useState<AnnouncementInput>(emptyForm);
  const [editForm, setEditForm] = useState<AnnouncementInput>(emptyForm);
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<Announcement | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editError, setEditError] = useState<string | null>(null);

  const loadAnnouncements = useCallback(async () => {
    try {
      setError(null);
      const rows = await listAdminAnnouncements();
      setAnnouncements(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar los anuncios.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) {
      loadAnnouncements();
    }
  }, [isAdmin, loadAnnouncements]);

  function openEditModal(announcement: Announcement) {
    setEditError(null);
    setSelectedAnnouncement(announcement);
    setEditForm({
      title: announcement.title,
      content: announcement.content,
      audience: announcement.audience,
      is_pinned: announcement.is_pinned,
      is_published: announcement.is_published,
    });
  }

  function closeEditModal() {
    setSelectedAnnouncement(null);
    setEditForm(emptyForm);
    setEditError(null);
  }

  async function handleCreate() {
    try {
      setSaving(true);
      setError(null);
      await createAnnouncement(createForm);
      setCreateForm(emptyForm);
      await loadAnnouncements();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar el anuncio.');
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdate() {
    if (!selectedAnnouncement) {
      return;
    }

    try {
      setSaving(true);
      setEditError(null);
      await updateAnnouncement(selectedAnnouncement.id, editForm);
      closeEditModal();
      await loadAnnouncements();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'No se pudo actualizar el anuncio.');
    } finally {
      setSaving(false);
    }
  }

  async function runAction(action: () => Promise<void>) {
    try {
      setError(null);
      await action();
      await loadAnnouncements();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo completar la accion.');
    }
  }

  function confirmDelete(announcement: Announcement) {
    Alert.alert(
      'Eliminar anuncio',
      `Esta accion borrara definitivamente: ${announcement.title}`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: () => runAction(() => deleteAnnouncement(announcement.id)),
        },
      ],
    );
  }

  if (sessionLoading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centerBox}>
          <Text style={styles.centerTitle}>Cargando permisos...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!isAdmin) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centerBox}>
          <Text style={styles.centerTitle}>Acceso restringido</Text>
          <Text style={styles.centerText}>Solo administradores pueden gestionar anuncios.</Text>
          <Pressable style={styles.primaryButton} onPress={() => router.replace('/home' as never)}>
            <Text style={styles.primaryButtonText}>Volver al inicio</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={loadAnnouncements} />}
      >
        <View style={styles.header}>
          <Text style={styles.eyebrow}>Admin</Text>
          <Text style={styles.title}>Gestion de anuncios</Text>
          <Text style={styles.subtitle}>
            Toca un anuncio para abrirlo en modo edicion. Tambien puedes publicarlo,
            despublicarlo, archivarlo, restaurarlo o eliminarlo.
          </Text>
        </View>

        <AnnouncementForm
          title="Nuevo anuncio"
          form={createForm}
          saving={saving}
          error={error}
          submitLabel="Crear anuncio"
          onChange={setCreateForm}
          onSubmit={handleCreate}
        />

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Todos los anuncios</Text>
          <Text style={styles.count}>{announcements.length}</Text>
        </View>

        <View style={styles.list}>
          {announcements.map((announcement) => (
            <AnnouncementCard
              key={announcement.id}
              announcement={announcement}
              showAdminActions
              onPress={() => openEditModal(announcement)}
              onEdit={() => openEditModal(announcement)}
              onTogglePublish={() =>
                runAction(() =>
                  setAnnouncementPublished(announcement.id, !announcement.is_published),
                )
              }
              onArchive={() => runAction(() => archiveAnnouncement(announcement.id))}
              onRestore={() => runAction(() => restoreAnnouncement(announcement.id))}
              onDelete={() => confirmDelete(announcement)}
            />
          ))}
        </View>
      </ScrollView>

      <Modal
        visible={Boolean(selectedAnnouncement)}
        animationType="slide"
        transparent
        onRequestClose={closeEditModal}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={styles.modalTitleBox}>
                <Text style={styles.modalEyebrow}>Editar anuncio</Text>
                <Text style={styles.modalTitle}>{selectedAnnouncement?.title ?? 'Anuncio'}</Text>
              </View>
              <Pressable style={styles.modalCloseButton} onPress={closeEditModal}>
                <Text style={styles.modalCloseText}>Cerrar</Text>
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={styles.modalScrollContent}>
              <AnnouncementForm
                title="Datos del anuncio"
                form={editForm}
                saving={saving}
                error={editError}
                submitLabel="Guardar cambios"
                onChange={setEditForm}
                onCancel={closeEditModal}
                onSubmit={handleUpdate}
              />
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  container: {
    gap: 16,
    padding: 20,
    paddingBottom: 36,
  },
  header: {
    gap: 6,
  },
  eyebrow: {
    color: '#0f766e',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  title: {
    color: '#0f172a',
    fontSize: 30,
    fontWeight: '900',
  },
  subtitle: {
    color: '#475569',
    fontSize: 15,
    lineHeight: 22,
  },
  formCard: {
    gap: 14,
    padding: 16,
    borderRadius: 22,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  formTitle: {
    color: '#0f172a',
    fontSize: 20,
    fontWeight: '900',
  },
  field: {
    gap: 7,
  },
  label: {
    color: '#0f172a',
    fontSize: 13,
    fontWeight: '900',
  },
  input: {
    minHeight: 48,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    color: '#0f172a',
    fontSize: 15,
  },
  textArea: {
    minHeight: 120,
  },
  segmentWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  segmentButton: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  segmentButtonActive: {
    backgroundColor: '#0f766e',
    borderColor: '#0f766e',
  },
  segmentText: {
    color: '#334155',
    fontSize: 12,
    fontWeight: '900',
  },
  segmentTextActive: {
    color: '#ffffff',
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 4,
  },
  switchTextBox: {
    flex: 1,
    gap: 2,
  },
  helpText: {
    color: '#64748b',
    fontSize: 12,
    lineHeight: 17,
  },
  errorText: {
    color: '#b91c1c',
    fontSize: 13,
    fontWeight: '700',
  },
  formActions: {
    flexDirection: 'row',
    gap: 10,
  },
  saveButton: {
    flex: 1,
    alignItems: 'center',
    padding: 14,
    borderRadius: 15,
    backgroundColor: '#0f766e',
  },
  saveButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '900',
  },
  cancelButton: {
    alignItems: 'center',
    padding: 14,
    borderRadius: 15,
    backgroundColor: '#f1f5f9',
  },
  cancelButtonText: {
    color: '#0f172a',
    fontSize: 14,
    fontWeight: '900',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    color: '#0f172a',
    fontSize: 20,
    fontWeight: '900',
  },
  count: {
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: '#e2e8f0',
    color: '#334155',
    fontSize: 12,
    fontWeight: '900',
  },
  list: {
    gap: 12,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(15, 23, 42, 0.52)',
  },
  modalCard: {
    maxHeight: '90%',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: '#f8fafc',
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    backgroundColor: '#ffffff',
  },
  modalTitleBox: {
    flex: 1,
    gap: 4,
  },
  modalEyebrow: {
    color: '#0f766e',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  modalTitle: {
    color: '#0f172a',
    fontSize: 20,
    fontWeight: '900',
  },
  modalCloseButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: '#f1f5f9',
  },
  modalCloseText: {
    color: '#0f172a',
    fontSize: 12,
    fontWeight: '900',
  },
  modalScrollContent: {
    padding: 16,
    paddingBottom: 28,
  },
  centerBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 24,
  },
  centerTitle: {
    color: '#0f172a',
    fontSize: 22,
    fontWeight: '900',
    textAlign: 'center',
  },
  centerText: {
    color: '#475569',
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  primaryButton: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: '#0f766e',
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '900',
  },
});
