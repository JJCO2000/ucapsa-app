// Compatibility facade for practice consumers.
export { buildPracticeEngagementStats } from './practice.domain';
export type {
  PracticeActivityEntry,
  PracticeActivitySnapshot,
  PracticeEngagementStats,
} from './practice.domain';

export * from './practice-activity.service';
export * from './practice-sync.service';
