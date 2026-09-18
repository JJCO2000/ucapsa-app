import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Redirect, router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import { KeyboardAwareModal } from '../../components/ui/KeyboardAwareModal';
import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { ucapsaBrand } from '../../constants/brand';
import { useSession } from '../../hooks/useSession';
import {
  createRestaurantCategory,
  createRestaurantItem,
  getAdminRestaurantMenu,
  updateRestaurantCategory,
  updateRestaurantItem,
  type RestaurantMenuCategory,
  type RestaurantMenuItem,
  type RestaurantMenuSection,
} from '../../services/restaurant-menu.service';

function money(value: number) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 2 }).format(value);
}

function errorMessage(cause: unknown, fallback: string) {
  if (cause instanceof Error && cause.message.trim()) return cause.message;
  if (cause && typeof cause === 'object' && 'message' in cause && typeof (cause as { message?: unknown }).message === 'string') {
    const message = String((cause as { message: string }).message).trim();
    if (message) return message;
  }
  return fallback;
}

export default function AdminRestaurantScreen() {
  const { isAdmin } = useSession();
  const [sections, setSections] = useState<RestaurantMenuSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [categoryOpen, setCategoryOpen] = useState(false);
  const [categoryEditing, setCategoryEditing] = useState<RestaurantMenuCategory | null>(null);
  const [categoryName, setCategoryName] = useState('');

  const [itemOpen, setItemOpen] = useState(false);
  const [itemEditing, setItemEditing] = useState<RestaurantMenuItem | null>(null);
  const [itemCategoryId, setItemCategoryId] = useState<string | null>(null);
  const [itemName, setItemName] = useState('');
  const [itemDescription, setItemDescription] = useState('');
  const [itemPrice, setItemPrice] = useState('');
  const [itemAvailable, setItemAvailable] = useState(true);

  const load = useCallback(async () => {
    if (!isAdmin) return;
    setError(null);
    try {
      setSections(await getAdminRestaurantMenu());
    } catch (cause) {
      setError(errorMessage(cause, 'No se pudo cargar el menú. Revisa tu conexión y vuelve a intentarlo.'));
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  useFocusEffect(useCallback(() => { setLoading(true); void load(); return undefined; }, [load]));

  if (!isAdmin) return <Redirect href="/home" />;

  async function refresh() {
    setRefreshing(true);
    try { await load(); } finally { setRefreshing(false); }
  }

  function openNewCategory() {
    setCategoryEditing(null);
    setCategoryName('');
    setCategoryOpen(true);
  }

  function openCategory(category: RestaurantMenuCategory) {
    setCategoryEditing(category);
    setCategoryName(category.name);
    setCategoryOpen(true);
  }

  async function saveCategory() {
    if (!categoryName.trim()) {
      Alert.alert('Falta el nombre', 'Escribe el nombre de la categoría.');
      return;
    }
    setSaving(true);
    try {
      if (categoryEditing) await updateRestaurantCategory(categoryEditing.id, { name: categoryName });
      else await createRestaurantCategory({ name: categoryName, sort_order: sections.length });
      setCategoryOpen(false);
      await load();
    } catch (cause) {
      Alert.alert('No se pudo guardar', errorMessage(cause, 'No pudimos guardar la categoría. Revisa tu sesión y conexión e intenta de nuevo.'));
    } finally {
      setSaving(false);
    }
  }

  function openNewItem(categoryId: string) {
    setItemEditing(null);
    setItemCategoryId(categoryId);
    setItemName('');
    setItemDescription('');
    setItemPrice('');
    setItemAvailable(true);
    setItemOpen(true);
  }

  function openItem(item: RestaurantMenuItem) {
    setItemEditing(item);
    setItemCategoryId(item.category_id);
    setItemName(item.name);
    setItemDescription(item.description ?? '');
    setItemPrice(String(item.price));
    setItemAvailable(item.is_available);
    setItemOpen(true);
  }

  async function saveItem() {
    const price = Number(itemPrice.replace(',', '.'));
    if (!itemCategoryId || !itemName.trim() || !Number.isFinite(price) || price < 0) {
      Alert.alert('Revisa los datos', 'Nombre y precio válido son obligatorios.');
      return;
    }

    setSaving(true);
    try {
      const input = {
        category_id: itemCategoryId,
        name: itemName,
        description: itemDescription,
        price,
        is_available: itemAvailable,
      };
      if (itemEditing) await updateRestaurantItem(itemEditing.id, input);
      else await createRestaurantItem(input);
      setItemOpen(false);
      await load();
    } catch (cause) {
      Alert.alert('No se pudo guardar', errorMessage(cause, 'No pudimos guardar el producto. Revisa tu sesión y conexión e intenta de nuevo.'));
    } finally {
      setSaving(false);
    }
  }

  async function runAndReload(action: () => Promise<void>) {
    setSaving(true);
    try {
      await action();
      await load();
    } catch (cause) {
      Alert.alert('No se pudo completar', errorMessage(cause, 'Revisa tu sesión y conexión e intenta de nuevo.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <KeyboardAwareScreen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={ucapsaBrand.colors.red} />}>
      <View style={styles.headerRow}>
        <Pressable onPress={() => router.back()} style={styles.backButton}><MaterialIcons name="arrow-back" size={24} color={ucapsaBrand.colors.redDark} /></Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.kicker}>Administración</Text>
          <Text style={styles.title}>Restaurante</Text>
          <Text style={styles.subtitle}>Edita el menú que ven clientes y visitantes.</Text>
        </View>
        <Pressable style={styles.addButton} onPress={openNewCategory}><MaterialIcons name="add" size={20} color={ucapsaBrand.colors.surface} /><Text style={styles.addText}>Categoría</Text></Pressable>
      </View>

      {loading ? <View style={styles.loading}><ActivityIndicator color={ucapsaBrand.colors.red} /><Text style={styles.muted}>Cargando menú...</Text></View> : null}

      {error ? (
        <View style={styles.errorCard}>
          <Text style={styles.errorTitle}>No se pudo abrir el menú</Text>
          <Text style={styles.muted}>{error}</Text>
          <Text style={styles.setupText}>La base del restaurante ya está configurada. Si vuelve a fallar, el mensaje de arriba indica el problema real para poder corregirlo.</Text>
          <Pressable style={styles.retryButton} onPress={() => void load()}><Text style={styles.retryText}>Reintentar</Text></Pressable>
        </View>
      ) : null}

      {!loading && !error && sections.length === 0 ? (
        <View style={styles.emptyCard}>
          <MaterialIcons name="restaurant-menu" size={32} color={ucapsaBrand.colors.redDark} />
          <Text style={styles.emptyTitle}>Empieza por una categoría</Text>
          <Text style={styles.muted}>El menú está listo. Crea categorías y después agrega productos, precios y disponibilidad.</Text>
          <Pressable style={styles.primaryButton} onPress={openNewCategory}><Text style={styles.primaryText}>Crear categoría</Text></Pressable>
        </View>
      ) : null}

      {sections.map((section) => (
        <View key={section.category.id} style={styles.sectionCard}>
          <View style={styles.categoryHeader}>
            <Pressable style={{ flex: 1 }} onPress={() => openCategory(section.category)}>
              <Text style={styles.categoryTitle}>{section.category.name}</Text>
              <Text style={styles.categoryMeta}>{section.category.is_active ? 'Visible' : 'Oculta'} · {section.items.length} productos</Text>
            </Pressable>
            <Switch value={section.category.is_active} disabled={saving} onValueChange={(value) => void runAndReload(() => updateRestaurantCategory(section.category.id, { is_active: value }).then(() => undefined))} />
          </View>

          {section.items.map((item, index) => (
            <Pressable key={item.id} onPress={() => openItem(item)} style={[styles.itemRow, index === section.items.length - 1 && styles.itemRowLast]}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.itemName}>{item.name}</Text>
                <Text style={styles.itemMeta}>{money(item.price)} · {item.is_available ? 'Disponible' : 'Agotado'}</Text>
                {item.description ? <Text numberOfLines={2} style={styles.itemDescription}>{item.description}</Text> : null}
              </View>
              <MaterialIcons name="chevron-right" size={22} color={ucapsaBrand.colors.redDark} />
            </Pressable>
          ))}

          <Pressable style={styles.addItemButton} onPress={() => openNewItem(section.category.id)}>
            <MaterialIcons name="add" size={18} color={ucapsaBrand.colors.redDark} />
            <Text style={styles.addItemText}>Añadir producto</Text>
          </Pressable>
        </View>
      ))}

      <KeyboardAwareModal visible={categoryOpen} onClose={() => setCategoryOpen(false)}>
        <Text style={styles.modalKicker}>Restaurante</Text>
        <Text style={styles.modalTitle}>{categoryEditing ? 'Editar categoría' : 'Nueva categoría'}</Text>
        <Text style={styles.label}>Nombre</Text>
        <TextInput value={categoryName} onChangeText={setCategoryName} placeholder="Ej. Bebidas" style={styles.input} />
        <Pressable disabled={saving} style={[styles.primaryButton, saving && styles.disabled]} onPress={() => void saveCategory()}><Text style={styles.primaryText}>{saving ? 'Guardando...' : 'Guardar categoría'}</Text></Pressable>
      </KeyboardAwareModal>

      <KeyboardAwareModal visible={itemOpen} onClose={() => setItemOpen(false)}>
        <Text style={styles.modalKicker}>Restaurante</Text>
        <Text style={styles.modalTitle}>{itemEditing ? 'Editar producto' : 'Nuevo producto'}</Text>
        <Text style={styles.label}>Nombre</Text>
        <TextInput value={itemName} onChangeText={setItemName} placeholder="Nombre del producto" style={styles.input} />
        <Text style={styles.label}>Descripción</Text>
        <TextInput value={itemDescription} onChangeText={setItemDescription} placeholder="Opcional" multiline style={[styles.input, styles.textArea]} />
        <Text style={styles.label}>Precio MXN</Text>
        <TextInput value={itemPrice} onChangeText={setItemPrice} placeholder="0.00" keyboardType="decimal-pad" style={styles.input} />
        <View style={styles.switchRow}>
          <View style={{ flex: 1 }}><Text style={styles.label}>Disponible</Text><Text style={styles.hint}>Apágalo cuando se haya agotado.</Text></View>
          <Switch value={itemAvailable} onValueChange={setItemAvailable} />
        </View>
        <Pressable disabled={saving} style={[styles.primaryButton, saving && styles.disabled]} onPress={() => void saveItem()}><Text style={styles.primaryText}>{saving ? 'Guardando...' : 'Guardar producto'}</Text></Pressable>
      </KeyboardAwareModal>
    </KeyboardAwareScreen>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 18 },
  backButton: { width: 44, height: 44, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: ucapsaBrand.colors.redSoft },
  kicker: { color: ucapsaBrand.colors.redDark, fontSize: 11, fontWeight: '900', textTransform: 'uppercase' },
  title: { color: ucapsaBrand.colors.text, fontSize: 28, fontWeight: '900' },
  subtitle: { color: ucapsaBrand.colors.muted, fontSize: 12, lineHeight: 17, fontWeight: '700' },
  addButton: { minHeight: 42, borderRadius: 14, backgroundColor: ucapsaBrand.colors.red, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 5 },
  addText: { color: ucapsaBrand.colors.surface, fontSize: 12, fontWeight: '900' },
  loading: { flexDirection: 'row', gap: 9, alignItems: 'center', paddingVertical: 12 },
  muted: { color: ucapsaBrand.colors.muted, fontSize: 12, lineHeight: 18, fontWeight: '700' },
  errorCard: { gap: 8, borderRadius: 20, borderWidth: 1, borderColor: ucapsaBrand.colors.dangerBorder, backgroundColor: ucapsaBrand.colors.dangerSoft, padding: 16 },
  errorTitle: { color: ucapsaBrand.colors.danger, fontSize: 16, fontWeight: '900' },
  setupText: { color: ucapsaBrand.colors.text, fontSize: 11, lineHeight: 17, fontWeight: '700' },
  retryButton: { alignSelf: 'flex-start', borderRadius: 12, backgroundColor: ucapsaBrand.colors.red, paddingHorizontal: 13, paddingVertical: 9 },
  retryText: { color: ucapsaBrand.colors.surface, fontWeight: '900' },
  emptyCard: { alignItems: 'center', gap: 9, borderRadius: 22, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, padding: 24 },
  emptyTitle: { color: ucapsaBrand.colors.text, fontSize: 18, fontWeight: '900' },
  sectionCard: { borderRadius: 20, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, overflow: 'hidden', marginBottom: 14 },
  categoryHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, backgroundColor: ucapsaBrand.colors.redSoftMuted },
  categoryTitle: { color: ucapsaBrand.colors.text, fontSize: 17, fontWeight: '900' },
  categoryMeta: { color: ucapsaBrand.colors.muted, fontSize: 11, fontWeight: '700', marginTop: 2 },
  iconButton: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: ucapsaBrand.colors.surface },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 70, padding: 14, borderBottomWidth: 1, borderBottomColor: ucapsaBrand.colors.border },
  itemRowLast: { borderBottomWidth: 0 },
  itemName: { color: ucapsaBrand.colors.text, fontSize: 14, fontWeight: '900' },
  itemMeta: { color: ucapsaBrand.colors.redDark, fontSize: 11, fontWeight: '800', marginTop: 2 },
  itemDescription: { color: ucapsaBrand.colors.muted, fontSize: 11, lineHeight: 16, fontWeight: '700', marginTop: 2 },
  addItemButton: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderTopWidth: 1, borderTopColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.redPale },
  addItemText: { color: ucapsaBrand.colors.redDark, fontSize: 12, fontWeight: '900' },
  modalKicker: { color: ucapsaBrand.colors.redDark, fontSize: 11, fontWeight: '900', textTransform: 'uppercase' },
  modalTitle: { color: ucapsaBrand.colors.text, fontSize: 26, fontWeight: '900', marginBottom: 14 },
  label: { color: ucapsaBrand.colors.text, fontSize: 13, fontWeight: '900', marginTop: 8, marginBottom: 6 },
  hint: { color: ucapsaBrand.colors.muted, fontSize: 11, lineHeight: 16, fontWeight: '700' },
  input: { borderRadius: 15, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, color: ucapsaBrand.colors.text, paddingHorizontal: 13, paddingVertical: 11, fontSize: 14 },
  textArea: { minHeight: 88, textAlignVertical: 'top' },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 8 },
  primaryButton: { minHeight: 50, borderRadius: 15, backgroundColor: ucapsaBrand.colors.red, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, marginTop: 16 },
  primaryText: { color: ucapsaBrand.colors.surface, fontSize: 14, fontWeight: '900' },
  deleteButton: { minHeight: 46, borderRadius: 15, borderWidth: 1, borderColor: ucapsaBrand.colors.dangerBorder, backgroundColor: ucapsaBrand.colors.dangerSoft, alignItems: 'center', justifyContent: 'center', marginTop: 10 },
  deleteText: { color: ucapsaBrand.colors.danger, fontSize: 13, fontWeight: '900' },
  disabled: { opacity: 0.55 },
});
