'use client'

import SimplePeer from 'simple-peer'
import type { PeerRefs } from '@/lib/types'
import useCallStore from '@/store/useCallStore'
import { resilientChannelManager } from '@/utils/resilientChannelManager'
import { diagnoseConnectionFailure } from './networkDiagnostics'

// Функция для попытки переподключения
export const attemptReconnection = (
  peerRefs: PeerRefs,
  userId: string | null,
  isInCall: boolean,
  targetUserId: string | null,
  initializePeer: (isInitiator: boolean) => Promise<void>
) => {
  const { reconnectTimeoutRef, reconnectAttemptsRef } = peerRefs

  if (reconnectTimeoutRef.current || !isInCall || !targetUserId) {
    return
  }

  const maxRetries = 3
  const currentAttempt = reconnectAttemptsRef.current + 1

  if (currentAttempt > maxRetries) {
    console.error(`🔄 [User ${userId?.slice(0, 8)}] Max reconnection attempts reached, ending call`)
    const { setError, endCall } = useCallStore.getState()

    // Полная очистка всех ресурсов перед завершением звонка
    cleanupAllPeerResources(peerRefs, userId)

    setError('Соединение потеряно и не может быть восстановлено')
    endCall()
    return
  }

  console.log(`🔄 [User ${userId?.slice(0, 8)}] Attempting reconnection ${currentAttempt}/${maxRetries}`)
  reconnectAttemptsRef.current = currentAttempt

  // Увеличиваем задержки для уменьшения нагрузки на сеть
  const delay = Math.min(1000 * Math.pow(1.5, currentAttempt - 1), 5000) // Экспоненциальная задержка

  reconnectTimeoutRef.current = setTimeout(() => {
    reconnectTimeoutRef.current = null

    if (isInCall && targetUserId) {
      console.log(`🔄 [User ${userId?.slice(0, 8)}] Reinitializing peer connection`)

      // Полная очистка старого соединения
      cleanupAllPeerResources(peerRefs, userId)

      // Создаем новое соединение
      const wasInitiator = useCallStore.getState().isCalling
      initializePeer(wasInitiator)
    }
  }, delay)
}

// Функция для сброса счетчика переподключений
export const resetReconnectionCounter = (peerRefs: PeerRefs) => {
  const { reconnectAttemptsRef, reconnectTimeoutRef } = peerRefs

  reconnectAttemptsRef.current = 0
  if (reconnectTimeoutRef.current) {
    clearTimeout(reconnectTimeoutRef.current)
    reconnectTimeoutRef.current = null
  }
}

// Функция для обработки ошибок peer соединения
export const handlePeerError = (
  err: Error,
  peerRefs: PeerRefs,
  userId: string | null,
  targetUserId: string | null,
  isInCall: boolean,
  initializePeer: (isInitiator: boolean) => Promise<void>
) => {
  // Проверяем, является ли это ожидаемой ошибкой при закрытии
  const isExpectedCloseError = err instanceof Error && (
    err.message.includes('InvalidStateError') ||
    err.message.includes('wrong state') ||
    err.message.includes('already have a remote') ||
    err.message.includes('User-Initiated Abort') ||
    err.message.includes('OperationError: User-Initiated Abort') ||
    err.message.includes('Close called') ||
    err.message.includes('connection closed') ||
    err.message.includes('DataChannel closing') ||
    err.message.includes('RTCPeerConnection closed')
  )

  if (isExpectedCloseError) {
    // Тихое логирование для ожидаемых ошибок при закрытии
    console.log(`📞 [User ${userId?.slice(0, 8)}] Expected peer close:`, err.message)
    return
  }

  // Специальная обработка для "Connection failed"
  if (err.message.includes('Connection failed')) {
    console.error(`📞 [User ${userId?.slice(0, 8)}] WebRTC Connection failed - возможные причины:`)
    console.error('  🔌 NAT/Firewall блокирует соединение')
    console.error('  🌐 Проблемы с STUN/TURN серверами')
    console.error('  📡 Плохое интернет-соединение')
    console.error('  👤 Собеседник внезапно отключился')

    // Попробуем диагностировать ICE состояние
    const peer = peerRefs.peerRef.current
    if (peer && !peer.destroyed) {
      const pc = (peer as any)._pc
      if (pc) {
        console.error(`📊 ICE диагностика:`, {
          connectionState: pc.connectionState,
          iceConnectionState: pc.iceConnectionState,
          iceGatheringState: pc.iceGatheringState,
          signalingState: pc.signalingState,
          localDescription: !!pc.localDescription,
          remoteDescription: !!pc.remoteDescription
        })
      }
    }

    // Запускаем диагностику сети в фоне
    diagnoseConnectionFailure().catch(error => {
      console.warn('Ошибка диагностики сети:', error)
    })

    const { setError, endCall } = useCallStore.getState()
    setError('Не удалось установить соединение. Проверьте интернет и попробуйте снова.')
    endCall()
    return
  }

  // Логируем другие неожиданные ошибки
  console.error(`📞 [User ${userId?.slice(0, 8)}] Unexpected peer error:`, err)

  const { setError, endCall } = useCallStore.getState()
  setError('Ошибка соединения: ' + err.message)
  endCall()
}

// Функция для полной очистки всех peer-ресурсов
export const cleanupAllPeerResources = (peerRefs: PeerRefs, userId: string | null) => {
  console.log(`🧹 [User ${userId?.slice(0, 8)}] Starting comprehensive cleanup`)

  // Очищаем все таймауты и интервалы
  if (peerRefs.reconnectTimeoutRef.current) {
    clearTimeout(peerRefs.reconnectTimeoutRef.current)
    peerRefs.reconnectTimeoutRef.current = null
  }

  if (peerRefs.keepAliveIntervalRef.current) {
    clearInterval(peerRefs.keepAliveIntervalRef.current)
    peerRefs.keepAliveIntervalRef.current = null
  }

  if (peerRefs.connectionCheckIntervalRef.current) {
    clearInterval(peerRefs.connectionCheckIntervalRef.current)
    peerRefs.connectionCheckIntervalRef.current = null
  }

  // Очищаем буферы
  peerRefs.signalBufferRef.current = []
  peerRefs.lastKeepAliveRef.current = 0
  peerRefs.reconnectAttemptsRef.current = 0

  // Очищаем WebRTC каналы через resilientChannelManager
  if (userId) {
    try {
      resilientChannelManager.removeChannel(`webrtc:${userId}`)
      console.log(`🧹 [User ${userId?.slice(0, 8)}] Cleaned up WebRTC channel`)
    } catch (err) {
      console.warn(`🧹 [User ${userId?.slice(0, 8)}] Error cleaning WebRTC channel:`, err)
    }
  }

  // Уничтожаем peer connection с дополнительными проверками
  if (peerRefs.peerRef.current) {
    try {
      if (!peerRefs.peerRef.current.destroyed) {
        // Удаляем все event listeners перед уничтожением
        peerRefs.peerRef.current.removeAllListeners()
        peerRefs.peerRef.current.destroy()
      }
    } catch (err) {
      // Тихо обрабатываем ожидаемые ошибки при закрытии
      if (err instanceof Error && (
        err.message.includes('User-Initiated Abort') ||
        err.message.includes('Close called') ||
        err.message.includes('already destroyed')
      )) {
        console.log(`🧹 [User ${userId?.slice(0, 8)}] Expected error during peer cleanup:`, err.message)
      } else {
        console.warn(`🧹 [User ${userId?.slice(0, 8)}] Unexpected error during peer cleanup:`, err)
      }
    } finally {
      peerRefs.peerRef.current = null
    }
  }

  console.log(`🧹 [User ${userId?.slice(0, 8)}] Comprehensive cleanup completed`)
}

// Функция для обработки закрытия peer соединения
export const handlePeerClose = (
  peerRefs: PeerRefs,
  userId: string | null,
  stopKeepAlive: (peerRefs: PeerRefs, userId: string | null) => void,
  stopConnectionMonitoring: (peerRefs: PeerRefs, userId: string | null) => void
) => {
  console.log('Peer connection closed')

  // Останавливаем keep-alive и мониторинг
  stopKeepAlive(peerRefs, userId)
  stopConnectionMonitoring(peerRefs, userId)

  // Не вызываем endCall() здесь, чтобы избежать рекурсии
  // endCall() будет вызван через обработчик события в CallInterface
}
