import { supabase } from '../lib/supabase';
import { normalizeContactPhone } from '../utils/phone-contact';

export type FamilyMemberInput = {
  fullName: string;
  email: string;
  phone: string;
};

export type FamilyMemberSaved = FamilyMemberInput & { id: string };

export function normalizeFamilyMembers(members: FamilyMemberInput[]) {
  // Cap per operation, not a commercial membership limit.
  if (members.length > 30) throw new Error('Agrega los familiares en grupos de hasta 30 personas.');
  const seen = new Set<string>();
  return members.map((member, index) => {
    const full_name = member.fullName.trim();
    const email = member.email.trim().toLowerCase();
    const phone = member.phone.trim() ? normalizeContactPhone(member.phone) : '';
    if (full_name.length < 2 || full_name.length > 120 || /[\x00-\x1F\x7F]/.test(full_name)) {
      throw new Error('Escribe el nombre completo del integrante ' + (index + 1) + '.');
    }
    if (!email && !phone) {
      throw new Error('Agrega correo o celular del integrante ' + (index + 1) + '.');
    }
    if (email && (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
      throw new Error('Revisa el correo del integrante ' + (index + 1) + '.');
    }
    const key = [full_name.toLocaleLowerCase('es-MX'), email, phone].join('|');
    if (seen.has(key)) throw new Error('Hay un familiar repetido en la lista.');
    seen.add(key);
    return { full_name, email, phone };
  });
}

type RpcResult = { data: unknown; error: { message: string } | null };

export async function getAdminPreregisteredFamily(intakeProgramId: string): Promise<FamilyMemberSaved[]> {
  const rpc = supabase.rpc.bind(supabase) as unknown as
    (name: 'admin_get_preregistered_family_members',
      args: { p_intake_program_id: string }) => PromiseLike<RpcResult>;
  const { data, error } = await rpc('admin_get_preregistered_family_members', {
    p_intake_program_id: intakeProgramId,
  });
  if (error) throw new Error(error.message);
  if (!Array.isArray(data)) throw new Error('No se pudo consultar la familia.');
  return data.map((row: unknown) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      throw new Error('La información de la familia no es válida.');
    }
    const v = row as Record<string, unknown>;
    if (typeof v.id !== 'string' || typeof v.full_name !== 'string') {
      throw new Error('Faltan datos de un integrante.');
    }
    return {
      id: v.id,
      fullName: v.full_name,
      email: typeof v.email === 'string' ? v.email : '',
      phone: typeof v.phone === 'string' ? v.phone : '',
    };
  });
}

export async function addAdminPreregisteredFamily(intakeProgramId: string, members: FamilyMemberInput[]): Promise<number> {
  const normalized = normalizeFamilyMembers(members);
  if (!normalized.length) throw new Error('Agrega al menos un integrante.');
  const rpc = supabase.rpc.bind(supabase) as unknown as
    (name: 'admin_add_preregistered_family_members',
      args: { p_intake_program_id: string; p_family_members: ReturnType<typeof normalizeFamilyMembers> })
      => PromiseLike<RpcResult>;
  const { data, error } = await rpc('admin_add_preregistered_family_members', {
    p_intake_program_id: intakeProgramId,
    p_family_members: normalized,
  });
  if (error) throw new Error(error.message);
  if (typeof data !== 'number' || !Number.isSafeInteger(data) || data < 0) {
    throw new Error('No se pudo confirmar la familia registrada.');
  }
  return data;
}
