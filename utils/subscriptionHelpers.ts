'use client'

/**
 * Вспомогательные функции для управления подписками Supabase
 * Обеспечивают надежную обработку состояний каналов
 */

export interface SubscriptionHandlerConfig {
  onSubscribed?: () => void
  onError?: (error: string) => void
  onTimeout?: (error: string) => void
  onClosed?: () => void
  suppressExpectedErrors?: boolean
  context?: string
}

// Создание обработчика подписки с улучшенной логикой ошибок
export const createSubscriptionHandler = (context: string, config: SubscriptionHandlerConfig) => {
  return {
    next: (status: string, err?: string) => {
      switch (status) {
        case 'SUBSCRIBED':
          console.log(`✅ [${context}] Channel subscribed successfully`)
          config.onSubscribed?.()
          break

        case 'CHANNEL_ERROR':
          const errorMsg = err || 'Unknown channel error'

          // Подавляем ожидаемые ошибки для WebRTC каналов
          if (config.suppressExpectedErrors && (
            errorMsg.includes('duplicate subscription') ||
            errorMsg.includes('already subscribed') ||
            errorMsg.includes('channel already exists') ||
            errorMsg.includes('realtime subscription already exists')
          )) {
            console.log(`🔇 [${context}] Suppressed expected error: ${errorMsg}`)
            return
          }

          console.error(`❌ [${context}] Channel error:`, errorMsg)
          config.onError?.(errorMsg)
          break

        case 'TIMED_OUT':
          console.warn(`⏱️ [${context}] Channel subscription timed out`)
          config.onTimeout?.('Subscription timed out')
          break

        case 'CLOSED':
          console.log(`🚪 [${context}] Channel closed`)
          config.onClosed?.()
          break

        default:
          console.log(`ℹ️ [${context}] Channel status: ${status}`)
      }
    },
    error: (error: Error) => {
      console.error(`💥 [${context}] Subscription error:`, error)
      config.onError?.(error.message)
    },
    complete: () => {
      console.log(`🏁 [${context}] Subscription completed`)
    }
  }
}

// Менеджер переподключений с защитой от бесконечных циклов
export const createReconnectionManager = (
  reconnectFn: () => Promise<void>,
  maxAttempts: number = 5,
  delay: number = 3000
) => {
  let attempts = 0
  let timeoutId: NodeJS.Timeout | null = null
  let isReconnecting = false

  const reconnect = async (): Promise<boolean> => {
    if (isReconnecting) {
      console.warn('Reconnection already in progress')
      return false
    }

    if (attempts >= maxAttempts) {
      console.error(`Max reconnection attempts (${maxAttempts}) reached`)
      return false
    }

    attempts++
    isReconnecting = true

    console.log(`🔄 Attempting reconnection ${attempts}/${maxAttempts}`)

    try {
      await new Promise(resolve => {
        timeoutId = setTimeout(resolve, delay)
      })

      await reconnectFn()
      console.log(`✅ Reconnection ${attempts} successful`)
      return true
    } catch (error) {
      console.error(`❌ Reconnection ${attempts} failed:`, error)
      isReconnecting = false
      return false
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId)
        timeoutId = null
      }
      isReconnecting = false
    }
  }

  const reset = () => {
    attempts = 0
    isReconnecting = false
    if (timeoutId) {
      clearTimeout(timeoutId)
      timeoutId = null
    }
  }

  const cancel = () => {
    if (timeoutId) {
      clearTimeout(timeoutId)
      timeoutId = null
    }
    isReconnecting = false
  }

  return {
    reconnect,
    reset,
    cancel,
    getAttempts: () => attempts,
    isReconnecting: () => isReconnecting
  }
}

// Логирование ошибок подписки с контекстом
export const logSubscriptionError = (context: string, error: any) => {
  console.error(`[${context}] Subscription error:`, {
    message: error?.message || 'Unknown error',
    stack: error?.stack,
    timestamp: new Date().toISOString(),
    context
  })
}

// Проверка здоровья канала
export const isChannelHealthy = (channel: any): boolean => {
  if (!channel) return false

  try {
    // Проверяем основные свойства канала
    const state = channel.state
    const isSubscribed = state === 'joined' || state === 'subscribed'

    // Дополнительные проверки для Supabase каналов
    const hasSocket = channel.socket && !channel.socket.hasError
    const hasTopic = !!channel.topic

    return isSubscribed && hasSocket && hasTopic
  } catch (error) {
    console.warn('Error checking channel health:', error)
    return false
  }
}


