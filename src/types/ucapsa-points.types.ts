export const UCAPSA_POINT_SOURCE_TYPES = [
  'member_visit',
  'class_attendance',
  'evaluation',
  'special_event',
  'admin_adjustment',
] as const;

export type UcapsaPointSourceType = (typeof UCAPSA_POINT_SOURCE_TYPES)[number];

export type UcapsaPointsSeasonStatus = 'draft' | 'active' | 'closed';
export type UcapsaPointsEligibilityScope = 'members' | 'all_clients';

export type UcapsaPointsSeason = {
  id: string;
  code: string;
  name: string;
  starts_at: string;
  ends_at: string;
  status: UcapsaPointsSeasonStatus;
  eligibility_scope: UcapsaPointsEligibilityScope;
};

export type UcapsaPointsRule = {
  id: string;
  season_id: string;
  code: string;
  label: string;
  source_type: UcapsaPointSourceType | string;
  default_points: number;
  is_active: boolean;
  max_awards_per_day: number | null;
};

export type UcapsaPointsTier = {
  id: string;
  season_id: string;
  code: string;
  label: string;
  min_points: number;
  sort_order: number;
  icon_key: string | null;
};

export type UcapsaPointsProfile = {
  user_id: string;
  leaderboard_dog_id: string | null;
  is_participating: boolean;
};

export type UcapsaPointsLedgerEntry = {
  id: string;
  season_id: string;
  user_id: string;
  rule_code: string;
  source_type: UcapsaPointSourceType | string;
  source_id: string | null;
  dedupe_key: string;
  points: number;
  reason: string;
  reversal_of_id: string | null;
  awarded_by: string | null;
  occurred_at: string;
  created_at: string;
};

export type UcapsaPointsLeaderboardRow = {
  rank: number;
  user_id?: string;
  dog_id: string | null;
  display_name: string;
  total_points: number;
  tier_code: string | null;
  tier_label: string | null;
  is_current_user: boolean;
};

export type UcapsaPointsSummary = {
  season: UcapsaPointsSeason;
  total_points: number;
  rank: number | null;
  participants: number;
  current_tier: UcapsaPointsTier | null;
  next_tier: UcapsaPointsTier | null;
  points_to_next_tier: number | null;
  leaderboard_dog_id: string | null;
};

export const UCAPSA_POINTS_MVP = {
  eligibilityScope: 'members' as const,
  initialSourceType: 'member_visit' as const,
  automaticAwardsEnabled: false,
} as const;
