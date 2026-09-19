import type { Database } from '../types/database.types';

export type ClientCompetitionInput =
  Database['public']['Views']['ucapsa_competition_ranges']['Row'];

export type ClientCompetitionLeaderboardRow =
  Database['public']['Views']['ucapsa_competition_leaderboard']['Row'];

export type ClientOfficialExamResult =
  Database['public']['Views']['ucapsa_exam_official_results']['Row'];

export type ClientExamItem =
  Database['public']['Tables']['ucapsa_exam_items']['Row'];

export type ClientExamItemResult =
  Database['public']['Tables']['ucapsa_exam_item_results']['Row'];

export type ClientConstancyEvent =
  Database['public']['Views']['ucapsa_constancy_events']['Row'];
