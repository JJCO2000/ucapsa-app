export type AppRole = 'client' | 'member' | 'admin' | 'super_admin';

export type MembershipStatus =
  | 'none'
  | 'pending'
  | 'active'
  | 'expired'
  | 'rejected'
  | 'cancelled';

export type AudienceType = 'public' | 'clients' | 'members' | 'admins';

export type PaymentStatus = 'pending' | 'paid' | 'cancelled';

export type UcapsaColorKey = 'red' | 'blue' | 'yellow' | 'green' | 'purple' | 'gray';

export type UcapsaPriority = 'low' | 'normal' | 'high' | 'urgent';

export type MembershipPaymentStatus =
  | 'none'
  | 'pending'
  | 'paid'
  | 'not_required'
  | 'overdue';

export type ManualPaymentStatus = MembershipPaymentStatus;

export type EventRepeatType =
  | 'none'
  | 'daily'
  | 'weekly'
  | 'biweekly'
  | 'monthly'
  | 'custom_days';

export type Profile = {
  id: string;
  user_id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  role: AppRole;
  dog_name?: string | null;
  avatar_color?: string | null;
  deletion_requested_at?: string | null;
  deletion_request_reason?: string | null;
  created_at: string;
  updated_at: string;
};

export type UserProfile = Profile;


export type MembershipDeleteRequestStatus = 'pending' | 'approved' | 'rejected';

export type MembershipDeleteRequest = {
  id: string;
  membership_id: string;
  user_id: string;
  requested_by: string | null;
  resolved_by: string | null;
  status: MembershipDeleteRequestStatus;
  reason: string | null;
  snapshot_member_number: string | null;
  snapshot_name: string | null;
  snapshot_email: string | null;
  requested_at: string;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
};

export type Membership = {
  id: string;
  user_id: string;
  member_number: string | null;
  status: MembershipStatus;
  start_date: string | null;
  end_date: string | null;
  qr_token: string;
  approved_by: string | null;
  current_payment_status?: MembershipPaymentStatus | null;
  last_payment_at?: string | null;
  payment_notes?: string | null;
  created_at: string;
  updated_at: string;
  profile?: Profile | null;
};

export type UcapsaEvent = {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  start_date: string;
  end_date: string | null;
  audience: AudienceType;
  is_published: boolean;
  archived_at: string | null;
  repeat_type?: EventRepeatType | null;
  repeat_interval_days?: number | null;
  repeat_limit?: number | null;
  has_time?: boolean | null;
  recurrence_key?: string | null;
  recurrence_label?: string | null;
  color_key?: UcapsaColorKey | null;
  priority?: UcapsaPriority | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type EventOccurrence = {
  id: string;
  event_id: string;
  event: UcapsaEvent;
  occurrence_index: number;
  start_date: string;
  end_date: string | null;
  is_recurring: boolean;
  repeat_label?: string | null;

  occurrence_key?: string;
  title?: string;
  description?: string | null;
  location?: string | null;
  audience?: AudienceType;
  source_event?: UcapsaEvent;
};

export type Announcement = {
  id: string;
  title: string;
  content: string;
  audience: AudienceType;
  is_pinned: boolean;
  is_published: boolean;
  archived_at: string | null;
  event_id: string | null;
  announcement_date?: string | null;
  color_key?: UcapsaColorKey | null;
  priority?: UcapsaPriority | null;
  event?: UcapsaEvent | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type Payment = {
  id: string;
  user_id: string;
  membership_id?: string | null;
  amount: number;
  concept: string;
  status: PaymentStatus;
  payment_method: string | null;
  paid_at: string | null;
  registered_by: string | null;
  notes?: string | null;
  period_label?: string | null;
  created_at: string;
  updated_at: string;
};






export type ProgramCode = 'puppy' | 'comandos';

export type ProgramRepeatType = 'weekly' | 'biweekly';

export type ProgramEnrollmentStatus = 'active' | 'completed' | 'cancelled';

export type ProgramLevel = 'base' | 'principiante' | 'medio' | 'avanzado';

export type UcapsaProgram = {
  id: string;
  code: ProgramCode;
  name: string;
  description: string | null;
  required_attendances: number;
  color_key: UcapsaColorKey;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type ProgramSchedule = {
  id: string;
  program_id: string;
  name: string;
  day_of_week: number;
  start_time: string;
  repeat_type: ProgramRepeatType;
  cycle_start_date: string | null;
  sequence_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type ProgramEnrollment = {
  id: string;
  user_id: string;
  program_id: string;
  schedule_id: string;
  dog_name: string | null;
  physical_card_number: string | null;
  qr_token: string;
  status: ProgramEnrollmentStatus;
  attendances_count: number;
  program_level: ProgramLevel;
  last_attendance_at: string | null;
  notes: string | null;
  started_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ProgramAttendance = {
  id: string;
  enrollment_id: string;
  attendance_date: string;
  marked_by: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type ProgramEnrollmentWithDetails = {
  enrollment: ProgramEnrollment;
  program: UcapsaProgram;
  schedule: ProgramSchedule;
  profile: Profile | null;
  attendances: ProgramAttendance[];
};



export type ProgramClassCancellation = {
  id: string;
  schedule_id: string;
  cancellation_date: string;
  reason: string | null;
  announcement_id: string | null;
  created_by: string | null;
  restored_at: string | null;
  restored_by: string | null;
  created_at: string;
  updated_at: string;
  schedule?: ProgramSchedule | null;
};


