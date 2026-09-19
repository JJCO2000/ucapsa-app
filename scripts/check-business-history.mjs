import fs from 'node:fs';

const sql = fs.readFileSync('supabase/sql/ucapsa-business-history-no-delete.sql', 'utf8');
const progressionSql = fs.readFileSync('supabase/sql/ucapsa-program-progression-history-preservation.sql', 'utf8');
const achievementHistorySql = fs.readFileSync('supabase/sql/ucapsa-training-achievement-history-hardening.sql', 'utf8');
const trainingAchievementSql = fs.readFileSync('supabase/sql/ucapsa-rango-1-training-achievements.sql', 'utf8');
const coursePathSql = fs.readFileSync('supabase/sql/ucapsa-course-path-and-points-access.sql', 'utf8');
const legacyProgressionSql = fs.readFileSync('supabase/sql/ucapsa-membership-lifetime-and-comandos-progression.sql', 'utf8');
const pkg = fs.readFileSync('package.json', 'utf8');

const files = {
  announcementsService: fs.readFileSync('src/services/announcements.mutations.ts', 'utf8'),
  eventsService: fs.readFileSync('src/services/events.service.ts', 'utf8'),
  programsService: fs.readFileSync('src/services/programs.service.ts', 'utf8'),
  restaurantService: fs.readFileSync('src/services/restaurant-menu.service.ts', 'utf8'),
  achievementsService: fs.readFileSync('src/services/achievements.service.ts', 'utf8'),
  announcementsUi: fs.readFileSync('src/app/admin/announcements.tsx', 'utf8'),
  eventsUi: fs.readFileSync('src/app/admin/events.tsx', 'utf8'),
  cancellationsUi: fs.readFileSync('src/app/admin/class-cancellations.tsx', 'utf8'),
  restaurantUi: fs.readFileSync('src/app/admin/restaurant.tsx', 'utf8'),
  usersUi: fs.readFileSync('src/app/admin/users.tsx', 'utf8'),
};

for (const token of [
  'drop policy if exists "announcements_admin_delete"',
  'drop policy if exists "events_admin_delete"',
  'drop policy if exists "program_class_cancellations_admin_delete"',
  'drop policy if exists "Admins can delete restaurant categories"',
  'drop policy if exists "Admins can delete restaurant items"',
  'drop policy if exists "user_achievements_admin_delete"',
  'revoke delete on table public.announcements',
  'revoke delete on table public.events',
  'revoke delete on table public.program_class_cancellations',
  'revoke delete on table public.restaurant_menu_categories',
  'revoke delete on table public.restaurant_menu_items',
  'revoke delete on table public.user_achievements',
]) {
  if (!sql.includes(token)) {
    throw new Error('Business history SQL contract missing: ' + token);
  }
}

for (const [name, text, forbidden] of [
  ['announcements service', files.announcementsService, 'deleteAnnouncement'],
  ['events service', files.eventsService, 'deleteEvent'],
  ['programs service', files.programsService, 'deleteProgramClassCancellation'],
  ['restaurant service', files.restaurantService, 'deleteRestaurantCategory'],
  ['restaurant service', files.restaurantService, 'deleteRestaurantItem'],
  ['achievements service', files.achievementsService, 'revokeAchievementFromUser'],
  ['announcements UI', files.announcementsUi, 'deleteAnnouncement'],
  ['events UI', files.eventsUi, 'deleteEvent'],
  ['cancellations UI', files.cancellationsUi, 'deleteProgramClassCancellation'],
  ['restaurant UI', files.restaurantUi, 'deleteRestaurantCategory'],
  ['restaurant UI', files.restaurantUi, 'deleteRestaurantItem'],
  ['users UI', files.usersUi, 'revokeAchievementFromUser'],
  ['users UI', files.usersUi, 'Quitar logro'],
]) {
  if (text.includes(forbidden)) {
    throw new Error(name + ' reintroduced destructive business history action: ' + forbidden);
  }
}

if (/\.from\(['"](?:announcements|events|program_class_cancellations|restaurant_menu_categories|restaurant_menu_items|user_achievements)['"]\)[\s\S]{0,180}\.delete\s*\(\s*\)/.test(Object.values(files).join('\n'))) {
  throw new Error('A protected business-history table is physically deleted from app code.');
}

if (!files.announcementsService.includes('archiveAnnouncement') || !files.eventsService.includes('archiveEvent')) {
  throw new Error('Archive lifecycle is missing for announcements/events.');
}

if (!files.cancellationsUi.includes('Reactivar') || !files.restaurantUi.includes('is_active') || !files.restaurantUi.includes('is_available')) {
  throw new Error('Lifecycle alternatives are missing for cancellation/restaurant records.');
}

if (/create or replace function public\.admin_revoke_ucapsa_training_achievement/i.test(trainingAchievementSql)) {
  throw new Error('Destructive training-achievement revoke RPC was reintroduced.');
}

if (/delete\s+from\s+public\.user_achievements\b/i.test(trainingAchievementSql)) {
  throw new Error('Training achievement SQL physically deletes historical awards.');
}

if (!/drop function if exists public\.admin_revoke_ucapsa_training_achievement\(uuid,text\)/i.test(achievementHistorySql)) {
  throw new Error('Training achievement history hardening does not retire the destructive RPC.');
}

for (const [name, text] of [
  ['canonical course progression', coursePathSql],
  ['legacy Comandos setup', legacyProgressionSql],
  ['production progression migration', progressionSql],
]) {
  if (/delete\s+from\s+public\.program_enrollments\b/i.test(text)) {
    throw new Error(name + ' physically deletes program enrollment history.');
  }
}

for (const token of [
  "status = 'cancelled'",
  'cancelled_at = coalesce(child.cancelled_at, now())',
  "status = 'active'",
  'cancelled_at = null',
  'unlocked_from_enrollment_id = p_enrollment_id',
]) {
  if (!progressionSql.includes(token)) {
    throw new Error('Program progression history contract missing: ' + token);
  }
}

if (!/drop function if exists public\.ucapsa_unlock_next_comandos_level\(uuid\)/i.test(progressionSql)) {
  throw new Error('Legacy Comandos-only progression helper is not retired.');
}

if (!pkg.includes('"check:business-history"')) {
  throw new Error('npm verify does not include the business-history guard.');
}

console.log('UCAPSA business history preservation: PASS');
