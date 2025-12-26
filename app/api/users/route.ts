import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const supabase = await createClient()

    // Получаем текущего пользователя
    const { data: { user }, error: userError } = await supabase.auth.getUser()

    console.log('Current user check:', {
      user: user ? { id: user.id, email: user.email } : null,
      error: userError
    })

    if (userError || !user) {
      console.log('User not authenticated, returning 401')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Сначала проверяем, существует ли таблица profiles
    const { data: tableCheck, error: tableError } = await supabase
      .from('profiles')
      .select('count')
      .limit(1)

    if (tableError) {
      console.error('Table check error:', tableError)

      if (tableError.code === '42P01') { // relation does not exist
        console.log('Table profiles does not exist')

        // Попробуем создать профиль для текущего пользователя
        const { error: insertError } = await supabase
          .from('profiles')
          .insert({
            id: user.id,
            email: user.email,
            full_name: user.user_metadata?.full_name || user.user_metadata?.name
          })

        if (insertError) {
          console.error('Error creating profile:', insertError)
        }

        return NextResponse.json({
          users: [],
          message: 'Таблица profiles не найдена. Выполните SQL скрипт supabase-setup.sql в Supabase Dashboard. Попытались создать профиль для текущего пользователя.',
          currentUser: { id: user.id, email: user.email }
        })
      }

      return NextResponse.json({
        error: 'Database error',
        details: tableError.message,
        code: tableError.code
      }, { status: 500 })
    }

    // Получаем всех пользователей из таблицы profiles
    const { data: users, error: usersError } = await supabase
      .from('profiles')
      .select('id, email, display_name, full_name, avatar_url, last_seen, created_at, updated_at')
      .order('created_at', { ascending: false })

    console.log('Users query result:', {
      usersCount: users?.length || 0,
      error: usersError,
      currentUserId: user.id
    })

    if (usersError) {
      console.error('Error fetching users:', usersError)
      return NextResponse.json({
        error: 'Failed to fetch users',
        details: usersError.message,
        code: usersError.code
      }, { status: 500 })
    }

    // Получаем профиль текущего пользователя
    const { data: currentUserProfile, error: currentUserError } = await supabase
      .from('profiles')
      .select('id, email, display_name, full_name, avatar_url, last_seen, created_at, updated_at')
      .eq('id', user.id)
      .single()

    // Определяем онлайн статус на основе last_seen (последние 5 минут)
    const ONLINE_THRESHOLD_MINUTES = 5
    const now = new Date()
    const onlineThreshold = new Date(now.getTime() - ONLINE_THRESHOLD_MINUTES * 60 * 1000)

    const usersWithStatus = (users || []).map(user => ({
      ...user,
      online: user.last_seen ? new Date(user.last_seen) > onlineThreshold : false
    }))

    // Добавляем текущего пользователя в список
    const currentUserWithStatus = currentUserProfile ? {
      ...currentUserProfile,
      online: currentUserProfile.last_seen ? new Date(currentUserProfile.last_seen) > onlineThreshold : false
    } : null

    console.log('Returning users:', usersWithStatus.length)

    return NextResponse.json({
      users: usersWithStatus,
      currentUser: currentUserWithStatus,
      debug: {
        currentUser: user.email,
        totalUsers: usersWithStatus.length,
        onlineThreshold: `${ONLINE_THRESHOLD_MINUTES} minutes`
      }
    })
  } catch (error) {
    console.error('Unexpected error in users API:', error)
    return NextResponse.json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
