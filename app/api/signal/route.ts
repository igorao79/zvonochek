import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { logger } from '@/lib/logger'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Получаем текущего пользователя
    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { to, from, type, signal } = await request.json()

    if (!to || !from || !type) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Создаем канал для получателя
    const targetChannel = (await supabase).channel(`webrtc:${to}`)

    // Отправляем сигнал
    await targetChannel.subscribe()

    await targetChannel.send({
      type: 'broadcast',
      event: 'webrtc_signal',
      payload: {
        type,
        signal,
        from
      }
    })

    logger.log(`📤 HTTP API: Signal sent from ${from.slice(0, 8)} to ${to.slice(0, 8)}: ${signal.type}`)

    return NextResponse.json({ success: true })
  } catch (error) {
    logger.error('Error in signal API:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
