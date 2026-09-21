import {
  isProgramCompletionAchievementCode,
  type ProgramCompletionAchievementCode,
} from '../constants/programCompletion';
import { supabase } from '../lib/supabase';
import { clearAchievementCacheForUser } from './achievements-cache.service';

async function getCurrentUserId() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const userId = data.session?.user?.id;
  if (!userId) throw new Error('No hay sesion activa.');
  return userId;
}

export async function grantTrainingAchievementToDog(
  userId: string,
  dogId: string,
  achievementCode: ProgramCompletionAchievementCode,
): Promise<void> {
  const cleanUserId = userId.trim();
  const cleanDogId = dogId.trim();
  if (!cleanUserId) throw new Error('No se encontró el cliente.');
  if (!cleanDogId) throw new Error('Selecciona un perro.');
  if (!isProgramCompletionAchievementCode(achievementCode)) {
    throw new Error('Ese código no es un logro formal de entrenamiento UCAPSA.');
  }

  const { error } = await supabase.rpc('admin_grant_ucapsa_training_achievement', {
    p_dog_id: cleanDogId,
    p_achievement_code: achievementCode,
  });
  if (error) throw error;

  await clearAchievementCacheForUser(cleanUserId);
}

export async function awardAchievementToUser(
  userId: string,
  achievementCode: string,
): Promise<void> {
  if (isProgramCompletionAchievementCode(achievementCode)) {
    throw new Error(
      'Los logros de Puppy y Comandos deben otorgarse al perro mediante el flujo formal de entrenamiento.',
    );
  }

  const adminUserId = await getCurrentUserId();
  const { error } = await supabase
    .from('user_achievements')
    .upsert(
      {
        user_id: userId,
        dog_id: null,
        achievement_code: achievementCode,
        source_type: 'manual_admin',
        source_id: null,
        awarded_by: adminUserId,
      },
      { onConflict: 'user_id,achievement_code', ignoreDuplicates: true },
    );

  if (error) throw error;
  await clearAchievementCacheForUser(userId);
}
