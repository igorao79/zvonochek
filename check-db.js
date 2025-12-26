const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Переменные окружения не найдены!');
  console.log('Убедитесь, что в файле .env.local установлены:');
  console.log('NEXT_PUBLIC_SUPABASE_URL=...');
  console.log('SUPABASE_SERVICE_ROLE_KEY=...');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function checkDatabase() {
  console.log('🔍 Проверяем состояние базы данных...\n');

  try {
    // Проверяем таблицу profiles
    console.log('📋 Проверяем таблицу profiles...');
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('count', { count: 'exact', head: true });

    if (profilesError) {
      console.error('❌ Ошибка с таблицей profiles:', profilesError.message);
    } else {
      console.log('✅ Таблица profiles существует');
    }

    // Проверяем bucket avatars
    console.log('\n🖼️  Проверяем bucket avatars...');
    const { data: buckets, error: bucketsError } = await supabase.storage.listBuckets();

    if (bucketsError) {
      console.error('❌ Ошибка с storage buckets:', bucketsError.message);
    } else {
      const avatarsBucket = buckets.find(b => b.id === 'avatars');
      if (avatarsBucket) {
        console.log('✅ Bucket avatars существует');
      } else {
        console.log('❌ Bucket avatars не найден');
      }
    }

    // Проверяем политики RLS
    console.log('\n🔒 Проверяем политики RLS...');
    // Для этого нужен прямой запрос к базе данных
    console.log('ℹ️  Для проверки политик RLS используйте Supabase Dashboard');

    console.log('\n🎉 Проверка завершена!');
    console.log('Если есть ошибки, выполните supabase-setup.sql еще раз.');

  } catch (error) {
    console.error('❌ Ошибка при проверке:', error.message);
  }
}

checkDatabase();
