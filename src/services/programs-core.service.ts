// Compatibility barrel for existing programs-core imports.
export {
  buildOfficialAttendanceQrValue,
  formatNextProgramClassLabel,
  formatProgramScheduleDetailLabel,
  formatProgramScheduleDisplayLabel,
  formatProgramScheduleName,
  formatScheduleLabel,
  getDefaultProgramLevel,
  getNextProgramLevel,
  getNextProgramScheduleDate,
  getProgramCodeLabel,
  getProgramEnrollmentDogName,
  getProgramLevelDisplayLabel,
  getProgramLevelLabel,
  getProgramSchedulesForDate,
  getProgramStatusLabel,
  getRecommendedScheduleId,
  isProgramScheduleActiveOnDate,
  parseOfficialAttendanceQrValue,
  programLevelOptions,
  sortProgramSchedules,
} from './programs.domain';

export * from './program-schedules.service';
export * from './program-enrollments.service';
export * from './program-attendance.service';
