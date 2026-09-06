import { supabase } from '../lib/supabase';
import type { MemberVisit } from '../types/app.types';
import { getMyProgramEnrollments } from './programs.service';
import { getMyPracticeActivity } from './practice.service';

export type ClientActivityFacts = {
  attendanceTotal: number;
  memberVisitsTotal: number;
  practiceTotal: number;
  currentPracticeStreak: number;
  longestPracticeStreak: number;
};

export async function getMyMemberVisits(userId: string, limit = 200): Promise<MemberVisit[]> {
  const { data, error } = await supabase
    .from('member_visits')
    .select('*')
    .eq('user_id', userId)
    .order('visited_at', { ascending: false })
    .limit(Math.max(1, Math.min(500, Math.round(limit))));
  if (error) throw error;
  return (data ?? []) as MemberVisit[];
}

export async function getMyClientActivityFacts(userId: string): Promise<ClientActivityFacts> {
  const [programs, visits, practice] = await Promise.all([
    getMyProgramEnrollments(),
    getMyMemberVisits(userId, 500),
    getMyPracticeActivity(userId, 3650),
  ]);

  return {
    attendanceTotal: programs.reduce((sum, item) => sum + item.attendances.length, 0),
    memberVisitsTotal: visits.length,
    practiceTotal: practice.entries.length,
    currentPracticeStreak: practice.stats.currentStreak,
    longestPracticeStreak: practice.stats.longestStreak,
  };
}
