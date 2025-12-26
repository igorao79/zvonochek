import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST() {
  try {
    const supabase = await createClient()

    // Получаем текущего пользователя
    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Проверяем, существует ли профиль
    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', user.id)
      .single()

    if (existingProfile) {
      return NextResponse.json({
        message: 'Profile already exists',
        profile: existingProfile
      })
    }

    // Создаем профиль
    const { data: profile, error: insertError } = await supabase
      .from('profiles')
      .insert({
        id: user.id,
        email: user.email,
        full_name: user.user_metadata?.full_name || user.user_metadata?.name
      })
      .select()
      .single()

    if (insertError) {
      console.error('Error creating profile:', insertError)
      return NextResponse.json({
        error: 'Failed to create profile',
        details: insertError.message
      }, { status: 500 })
    }

    return NextResponse.json({
      message: 'Profile created successfully',
      profile
    })
  } catch (error) {
    console.error('Error in profile API:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

