import type { Database as GeneratedDatabase } from './database.generated';

type PublicSchema = GeneratedDatabase['public'];
type MemberVisitsTable = PublicSchema['Tables']['member_visits'];
type ProgramAttendancesTable = PublicSchema['Tables']['program_attendances'];

type OfflineMemberVisitsTable = Omit<MemberVisitsTable, 'Row' | 'Insert' | 'Update'> & {
  Row: MemberVisitsTable['Row'] & { client_event_id: string | null };
  Insert: MemberVisitsTable['Insert'] & { client_event_id?: string | null };
  Update: MemberVisitsTable['Update'] & { client_event_id?: string | null };
};

type OfflineProgramAttendancesTable = Omit<ProgramAttendancesTable, 'Row' | 'Insert' | 'Update'> & {
  Row: ProgramAttendancesTable['Row'] & { client_event_id: string | null };
  Insert: ProgramAttendancesTable['Insert'] & { client_event_id?: string | null };
  Update: ProgramAttendancesTable['Update'] & { client_event_id?: string | null };
};

type MemberVisitResult = {
  visit_id: string | null;
  result: string;
  message: string;
};

type ProgramAttendanceResult = {
  attendance_id: string | null;
  session_id: string | null;
  result: string;
  message: string;
};

type OfflineFunctions = Omit<
  PublicSchema['Functions'],
  'register_member_visit_from_qr' | 'register_program_attendance_from_qr'
> & {
  register_member_visit_from_qr:
    | {
        Args: { p_qr_token: string };
        Returns: MemberVisitResult[];
      }
    | {
        Args: { p_qr_token: string; p_client_event_id: string };
        Returns: MemberVisitResult[];
      }
    | {
        Args: { p_qr_token: string; p_client_event_id: string; p_captured_at: string };
        Returns: MemberVisitResult[];
      };
  register_program_attendance_from_qr:
    | {
        Args: { p_qr_token: string; p_enrollment_id: string };
        Returns: ProgramAttendanceResult[];
      }
    | {
        Args: { p_qr_token: string; p_enrollment_id: string; p_confirm_outside_window: boolean };
        Returns: ProgramAttendanceResult[];
      }
    | {
        Args: {
          p_qr_token: string;
          p_enrollment_id: string;
          p_confirm_outside_window: boolean;
          p_client_event_id: string;
          p_captured_at: string;
        };
        Returns: ProgramAttendanceResult[];
      };
};

type OfflinePublicSchema = Omit<PublicSchema, 'Tables' | 'Functions'> & {
  Tables: Omit<PublicSchema['Tables'], 'member_visits' | 'program_attendances'> & {
    member_visits: OfflineMemberVisitsTable;
    program_attendances: OfflineProgramAttendancesTable;
  };
  Functions: OfflineFunctions;
};

/**
 * Tipos canónicos de la app.
 *
 * `database.generated.ts` sigue siendo la captura generada de Supabase. Este overlay
 * mantiene tipadas las adiciones de la migración offline mientras la captura completa
 * se regenera en el siguiente source-of-truth sync, sin desactivar tipos con `any`.
 */
export type Database = Omit<GeneratedDatabase, 'public'> & {
  public: OfflinePublicSchema;
};
