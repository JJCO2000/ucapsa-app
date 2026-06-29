export type AppRole = "client" | "member" | "admin" | "super_admin";

export type MembershipStatus =
  | "none"
  | "pending"
  | "active"
  | "expired"
  | "rejected"
  | "cancelled";

export type AudienceType = "public" | "clients" | "members" | "admins";

export type PaymentStatus = "pending" | "paid" | "cancelled";

export type Profile = {
  id: string;
  user_id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  role: AppRole;
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
  created_at: string;
  updated_at: string;
};

export type Announcement = {
  id: string;
  title: string;
  content: string;
  audience: AudienceType;
  is_pinned: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type UcapsaEvent = {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  start_date: string;
  end_date: string | null;
  audience: AudienceType;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type Payment = {
  id: string;
  user_id: string;
  amount: number;
  concept: string;
  status: PaymentStatus;
  payment_method: string | null;
  paid_at: string | null;
  registered_by: string | null;
  created_at: string;
  updated_at: string;
};

export type UserProfile = Profile;
