import { supabase } from '../lib/supabase';
import type {
  MembershipDogAccess,
  ProgramCode,
  ProgramLevel,
} from '../types/app.types';
import { getDogsForUser, type BasicDog } from './dogs.service';

export type MembershipDogAccessRow = MembershipDogAccess & {
  dog: BasicDog | null;
};

export async function getMembershipDogAccessForUser(
  userId: string,
  membershipId: string,
): Promise<MembershipDogAccessRow[]> {
  const cleanUserId = userId.trim();
  const cleanMembershipId = membershipId.trim();
  if (!cleanUserId || !cleanMembershipId) return [];

  const [accessResult, dogs] = await Promise.all([
    supabase
      .from('membership_dog_access')
      .select('*')
      .eq('membership_id', cleanMembershipId)
      .eq('user_id', cleanUserId)
      .order('created_at', { ascending: true }),
    getDogsForUser(cleanUserId),
  ]);

  if (accessResult.error) throw accessResult.error;
  const dogById = new Map(dogs.map((dog) => [dog.id, dog]));
  return ((accessResult.data ?? []) as MembershipDogAccess[]).map((row) => ({
    ...row,
    dog: dogById.get(row.dog_id) ?? null,
  }));
}

export async function getMyMembershipDogAccess(
  membershipId: string,
): Promise<MembershipDogAccess[]> {
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  const userId = authData.user?.id;
  if (!userId) return [];

  const { data, error } = await supabase
    .from('membership_dog_access')
    .select('*')
    .eq('membership_id', membershipId)
    .eq('user_id', userId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data ?? []) as MembershipDogAccess[];
}

export async function setMembershipDogCoverageAdmin(input: {
  membershipId: string;
  dogId: string;
  covered: boolean;
}): Promise<void> {
  const { error } = await supabase.rpc('admin_set_membership_dog_coverage', {
    p_membership_id: input.membershipId,
    p_dog_id: input.dogId,
    p_is_covered: input.covered,
  });
  if (error) throw error;
}

export async function setMemberDogTrainingStageAdmin(input: {
  membershipId: string;
  dogId: string;
  programCode: ProgramCode;
  programLevel: ProgramLevel;
  reason?: string | null;
}): Promise<string> {
  const { data, error } = await supabase.rpc('admin_set_member_dog_training_stage', {
    p_membership_id: input.membershipId,
    p_dog_id: input.dogId,
    p_program_code: input.programCode,
    p_program_level: input.programLevel,
    p_reason: input.reason?.trim() || undefined,
  });
  if (error) throw error;
  if (!data) throw new Error('No se pudo actualizar la etapa del perro.');
  return String(data);
}
