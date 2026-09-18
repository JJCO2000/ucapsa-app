import { supabase } from '../lib/supabase';

export type RestaurantMenuCategory = {
  id: string;
  name: string;
  sort_order: number;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type RestaurantMenuItem = {
  id: string;
  category_id: string;
  name: string;
  description: string | null;
  price: number;
  image_url: string | null;
  sort_order: number;
  is_available: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type RestaurantMenuSection = {
  category: RestaurantMenuCategory;
  items: RestaurantMenuItem[];
};

export type RestaurantCategoryInput = {
  name: string;
  sort_order?: number;
  is_active?: boolean;
};

export type RestaurantItemInput = {
  category_id: string;
  name: string;
  description?: string | null;
  price: number;
  image_url?: string | null;
  sort_order?: number;
  is_available?: boolean;
};

function db() {
  // Las tablas se añaden en Cambio 4.1. El cast temporal evita desalinear los tipos
  // generados hasta volver a ejecutar `supabase gen types` contra el proyecto remoto.
  return supabase as any;
}

function normalizeCategory(value: any): RestaurantMenuCategory {
  return {
    ...value,
    sort_order: Number(value.sort_order ?? 0),
    is_active: Boolean(value.is_active),
  } as RestaurantMenuCategory;
}

function normalizeItem(value: any): RestaurantMenuItem {
  return {
    ...value,
    price: Number(value.price ?? 0),
    sort_order: Number(value.sort_order ?? 0),
    is_available: Boolean(value.is_available),
  } as RestaurantMenuItem;
}

function groupMenu(categories: RestaurantMenuCategory[], items: RestaurantMenuItem[]) {
  return categories.map((category) => ({
    category,
    items: items
      .filter((item) => item.category_id === category.id)
      .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, 'es')),
  }));
}

export async function getRestaurantMenu(): Promise<RestaurantMenuSection[]> {
  const [categoryResult, itemResult] = await Promise.all([
    db().from('restaurant_menu_categories').select('*').eq('is_active', true).order('sort_order').order('name'),
    db().from('restaurant_menu_items').select('*').eq('is_available', true).order('sort_order').order('name'),
  ]);

  if (categoryResult.error) throw categoryResult.error;
  if (itemResult.error) throw itemResult.error;

  const categories = (categoryResult.data ?? []).map(normalizeCategory) as RestaurantMenuCategory[];
  const activeCategoryIds = new Set(categories.map((category) => category.id));
  const items = ((itemResult.data ?? []).map(normalizeItem) as RestaurantMenuItem[])
    .filter((item) => activeCategoryIds.has(item.category_id));

  return groupMenu(categories, items);
}

export async function getAdminRestaurantMenu(): Promise<RestaurantMenuSection[]> {
  const [categoryResult, itemResult] = await Promise.all([
    db().from('restaurant_menu_categories').select('*').order('sort_order').order('name'),
    db().from('restaurant_menu_items').select('*').order('sort_order').order('name'),
  ]);

  if (categoryResult.error) throw categoryResult.error;
  if (itemResult.error) throw itemResult.error;

  return groupMenu(
    (categoryResult.data ?? []).map(normalizeCategory) as RestaurantMenuCategory[],
    (itemResult.data ?? []).map(normalizeItem) as RestaurantMenuItem[],
  );
}

export async function createRestaurantCategory(input: RestaurantCategoryInput) {
  const { data: authResult } = await supabase.auth.getUser();
  const { data, error } = await db()
    .from('restaurant_menu_categories')
    .insert({
      name: input.name.trim(),
      sort_order: input.sort_order ?? 0,
      is_active: input.is_active ?? true,
      created_by: authResult.user?.id ?? null,
    })
    .select('*')
    .single();
  if (error) throw error;
  return normalizeCategory(data);
}

export async function updateRestaurantCategory(categoryId: string, input: Partial<RestaurantCategoryInput>) {
  const payload: Record<string, unknown> = {};
  if (input.name !== undefined) payload.name = input.name.trim();
  if (input.sort_order !== undefined) payload.sort_order = input.sort_order;
  if (input.is_active !== undefined) payload.is_active = input.is_active;

  const { data, error } = await db().from('restaurant_menu_categories').update(payload).eq('id', categoryId).select('*').single();
  if (error) throw error;
  return normalizeCategory(data);
}


export async function createRestaurantItem(input: RestaurantItemInput) {
  const { data: authResult } = await supabase.auth.getUser();
  const { data, error } = await db()
    .from('restaurant_menu_items')
    .insert({
      category_id: input.category_id,
      name: input.name.trim(),
      description: input.description?.trim() || null,
      price: Number(input.price),
      image_url: input.image_url?.trim() || null,
      sort_order: input.sort_order ?? 0,
      is_available: input.is_available ?? true,
      created_by: authResult.user?.id ?? null,
    })
    .select('*')
    .single();
  if (error) throw error;
  return normalizeItem(data);
}

export async function updateRestaurantItem(itemId: string, input: Partial<RestaurantItemInput>) {
  const payload: Record<string, unknown> = {};
  if (input.category_id !== undefined) payload.category_id = input.category_id;
  if (input.name !== undefined) payload.name = input.name.trim();
  if (input.description !== undefined) payload.description = input.description?.trim() || null;
  if (input.price !== undefined) payload.price = Number(input.price);
  if (input.image_url !== undefined) payload.image_url = input.image_url?.trim() || null;
  if (input.sort_order !== undefined) payload.sort_order = input.sort_order;
  if (input.is_available !== undefined) payload.is_available = input.is_available;

  const { data, error } = await db().from('restaurant_menu_items').update(payload).eq('id', itemId).select('*').single();
  if (error) throw error;
  return normalizeItem(data);
}

