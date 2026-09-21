import {
  PROGRAM_COMPLETION_ACHIEVEMENT_CODES,
  type ProgramCompletionAchievementCode,
} from '../constants/programCompletion';
import { supabase } from '../lib/supabase';

export type MembershipEligibilitySource =
  | 'program_enrollment'
  | 'program_completion_achievement'
  | 'none';

export type MembershipEligibility = {
  eligible: boolean;
  source: MembershipEligibilitySource;
  enrollmentId: string | null;
  achievementCode: ProgramCompletionAchievementCode | null;
};

export async function getMembershipEligibilityForUser(
  userId: string,
): Promise<MembershipEligibility> {
  const { data: enrollment, error: enrollmentError } = await supabase
    .from('program_enrollments')
    .select('id,status')
    .eq('user_id', userId)
    .in('status', ['active', 'completed'])
    .limit(1)
    .maybeSingle();

  if (enrollmentError) throw enrollmentError;
  if (enrollment) {
    return {
      eligible: true,
      source: 'program_enrollment',
      enrollmentId: enrollment.id,
      achievementCode: null,
    };
  }

  // Legacy-safe evidence. Some historical customers have a completion medal but
  // no recoverable enrollment row. Do not fabricate an enrollment; accept the
  // explicit UCAPSA completion medal as evidence for membership eligibility.
  const { data: achievement, error: achievementError } = await supabase
    .from('user_achievements')
    .select('achievement_code')
    .eq('user_id', userId)
    .in('achievement_code', [...PROGRAM_COMPLETION_ACHIEVEMENT_CODES])
    .order('awarded_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (achievementError) throw achievementError;
  if (achievement?.achievement_code) {
    return {
      eligible: true,
      source: 'program_completion_achievement',
      enrollmentId: null,
      achievementCode: achievement.achievement_code as ProgramCompletionAchievementCode,
    };
  }

  return {
    eligible: false,
    source: 'none',
    enrollmentId: null,
    achievementCode: null,
  };
}

export async function getMyMembershipEligibility(): Promise<MembershipEligibility> {
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;

  const userId = authData.user?.id;
  if (!userId) throw new Error('No hay sesion activa.');
  return getMembershipEligibilityForUser(userId);
}
