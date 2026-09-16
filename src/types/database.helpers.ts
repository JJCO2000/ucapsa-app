import type { Database } from './database.types';

export type PublicTableName = keyof Database['public']['Tables'];
export type TableRow<T extends PublicTableName> = Database['public']['Tables'][T]['Row'];
export type TableInsert<T extends PublicTableName> = Database['public']['Tables'][T]['Insert'];
export type TableUpdate<T extends PublicTableName> = Database['public']['Tables'][T]['Update'];
