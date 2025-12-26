import SimplePeer from 'simple-peer'
import { createClient } from '@/lib/supabase/client'
import { CallState } from '@/lib/types'
import type { RealtimeChannel } from '@supabase/supabase-js'

// Тип для доступа к RTCPeerConnection внутри SimplePeer
interface SimplePeerWithPC extends SimplePeer.Instance {
  _pc?: RTCPeerConnection
}

export interface WebRTCRefs {
  peerRef: React.MutableRefObject<SimplePeer.Instance | null>
  signalBufferRef: React.MutableRefObject<Array<{type: string, signal?: SimplePeer.SignalData, from: string}>>
  keepAliveIntervalRef: React.MutableRefObject<NodeJS.Timeout | null>
  connectionCheckIntervalRef: React.MutableRefObject<NodeJS.Timeout | null>
  reconnectTimeoutRef: React.MutableRefObject<NodeJS.Timeout | null>
  lastKeepAliveRef: React.MutableRefObject<number>
  reconnectAttemptsRef: React.MutableRefObject<number>
}

export class WebRTCService {
  private peer: SimplePeer.Instance | null = null
  private localStream: MediaStream | null = null
  private remoteStream: MediaStream | null = null
  private supabase = createClient()
  private channel: RealtimeChannel | null = null
  private currentUserId: string = ''
  private targetUserId: string | null = null
  private isCallActive = false
  private incomingCallerId: string | null = null

  // Refs для управления состоянием
  private refs: WebRTCRefs

  private onStateChange?: (state: CallState) => void
  private onRemoteStream?: (stream: MediaStream) => void
  private onLocalStream?: (stream: MediaStream) => void
  private onError?: (error: string) => void

  // Кэш каналов для отправки сигналов
  private sendChannels: Map<string, RealtimeChannel> = new Map()

  // Обработчики завершения
  private connectionCheckInterval: NodeJS.Timeout | null = null
  private lastActivityTime = Date.now()
  private isOnline = true

  constructor(refs: WebRTCRefs) {
    this.refs = refs
    // Инициализация канала будет выполнена позже при первом использовании
    // Настраиваем обработчики завершения звонка
    this.setupCallTerminationHandlers()
  }

  // Инициализация канала только для получения сигналов
  async initializeSignalChannel() {
    if (this.channel) {
      console.log(`📺 [User ${this.currentUserId?.slice(0, 8)}] Signal channel already initialized`)
      return // Уже инициализирован
    }

    const { data: { user } } = await this.supabase.auth.getUser()
    if (!user) {
      console.log('📺 No authenticated user, skipping channel initialization')
      return
    }

    this.currentUserId = user.id

    // Создаем канал только для получения входящих сигналов
    this.channel = this.supabase.channel(`webrtc:${this.currentUserId}`)

    this.channel
      .on('broadcast', { event: 'webrtc_signal' }, (payload: { payload: { type: string, signal?: SimplePeer.SignalData, from: string } }) => {
        console.log(`📡 [User ${this.currentUserId.slice(0, 8)}] Received signal from ${payload.payload.from.slice(0, 8)}:`, payload.payload.type)
        this.handleIncomingSignal(payload)
      })
      .on('presence', { event: 'sync' }, () => {
        console.log(`👥 [User ${this.currentUserId.slice(0, 8)}] Channel presence synced`)
      })
      .subscribe((status) => {
        console.log(`📺 [User ${this.currentUserId.slice(0, 8)}] Channel status:`, status)
        if (status === 'SUBSCRIBED') {
          console.log(`✅ [User ${this.currentUserId.slice(0, 8)}] Successfully subscribed to channel webrtc:${this.currentUserId}`)
        }
      })

    console.log(`📺 [User ${this.currentUserId.slice(0, 8)}] Signal channel initialized for receiving calls`)
  }

  private async initializeSupabaseChannel() {
    // Канал уже инициализирован в конструкторе, просто проверяем
    if (!this.channel) {
      await this.initializeSignalChannel()
    }
  }

  setCallbacks(callbacks: {
    onStateChange?: (state: CallState) => void
    onRemoteStream?: (stream: MediaStream) => void
    onLocalStream?: (stream: MediaStream) => void
    onError?: (error: string) => void
  }) {
    this.onStateChange = callbacks.onStateChange
    this.onRemoteStream = callbacks.onRemoteStream
    this.onLocalStream = callbacks.onLocalStream
    this.onError = callbacks.onError
  }

  async startCall(targetUserId: string) {
    if (this.peer && !this.peer.destroyed) {
      console.log('⚠️ Call already in progress, ignoring start call request')
      return
    }

    // Инициализируем канал только при начале звонка
    await this.initializeSupabaseChannel()

    this.targetUserId = targetUserId
    this.isCallActive = true
    this.onStateChange?.('calling')
    await this.initializePeer(true)
  }

  async answerCall(callerId: string) {
    if (this.peer && !this.peer.destroyed) {
      console.log('⚠️ Call already in progress, ignoring answer call request')
      return
    }

    // Инициализируем канал только при ответе на звонок
    await this.initializeSupabaseChannel()

    this.targetUserId = callerId
    this.isCallActive = true
    await this.initializePeer(false)
    this.onStateChange?.('connected')
  }

  async endCall() {
    // Отправляем сигнал завершения через Supabase канал
    if (this.targetUserId) {
      try {
        const supabase = createClient()
        const targetChannel = supabase.channel(`webrtc:${this.targetUserId}`)
        await targetChannel.subscribe()

        await targetChannel.send({
          type: 'broadcast',
          event: 'webrtc_signal',
          payload: {
            signal: { type: 'end-call' },
            from: this.currentUserId
          }
        })
        console.log('End call signal sent')
      } catch (err) {
        console.error('Error sending end call signal:', err)
      }
    }

    this.isCallActive = false
    this.targetUserId = null
    this.incomingCallerId = null

    this.cleanup()
    this.onStateChange?.('idle')
  }

  private async initializePeer(isInitiator: boolean) {
    try {
      // Предотвращаем создание нескольких peer соединений
      if (this.peer && !this.peer.destroyed) {
        console.log('Peer already exists, destroying old one')
        this.peer.destroy()
        this.peer = null
      }

      console.log('Requesting microphone access...')
      console.log('HTTPS check:', window.location.protocol === 'https:')

      // Получаем только аудио поток
      this.localStream = await navigator.mediaDevices.getUserMedia({
        video: false,
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      })

      console.log('Microphone access granted, stream:', {
        id: this.localStream.id,
        tracks: this.localStream.getTracks().map(track => ({
          kind: track.kind,
          label: track.label,
          enabled: track.enabled,
          muted: track.muted,
          readyState: track.readyState
        }))
      })

      this.onLocalStream?.(this.localStream)

      // Создаем SimplePeer
      const peerConfig = {
        initiator: isInitiator,
        trickle: true,
        stream: this.localStream,
        config: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
          ],
        },
      }

      this.peer = new SimplePeer(peerConfig)

    // Обработчик сигналов
    this.peer.on('signal', async (data) => {
      try {
        // Проверяем что у нас есть targetUserId перед отправкой
        if (!this.targetUserId) {
          console.log('⚠️ No targetUserId set, buffering signal until target is set')
          this.refs.signalBufferRef.current.push({ type: data.type, signal: data as SimplePeer.SignalData, from: this.currentUserId })
          return
        }

        await this.sendSignal({
          type: data.type,
          from: this.currentUserId,
          to: this.targetUserId,
          signal: data,
        })
      } catch (err) {
        console.error('Error sending signal:', err)
      }
    })

      // Обработчик подключения
      this.peer.on('connect', () => {
        console.log('Peer connected!')
        this.isCallActive = true
        this.onStateChange?.('connected')

        // Сбрасываем счетчик переподключений
        this.refs.reconnectAttemptsRef.current = 0
      })

      // Обработчик получения remote stream
      this.peer.on('stream', (remoteStream: MediaStream) => {
        console.log('Received remote stream:', {
          id: remoteStream.id,
          tracks: remoteStream.getTracks().map(track => ({
            kind: track.kind,
            label: track.label,
            enabled: track.enabled,
            muted: track.muted,
            readyState: track.readyState
          }))
        })

        this.remoteStream = remoteStream
        this.onRemoteStream?.(remoteStream)
      })

      // Обработчик ошибок
      this.peer.on('error', (err: Error) => {
        console.error('Peer error:', err)
        this.onError?.(`Ошибка соединения: ${err.message}`)
        this.cleanup()
        this.onStateChange?.('idle')
      })

      // Обработчик закрытия
      this.peer.on('close', () => {
        console.log('Peer connection closed')
        this.cleanup()
        this.onStateChange?.('idle')
      })

      this.refs.peerRef.current = this.peer

      // Обрабатываем буферизованные сигналы
      this.processBufferedSignals()

    } catch (err) {
      console.error('Error initializing peer:', err)

      // Детальная диагностика ошибок
      if (err instanceof Error) {
        if (err.name === 'NotAllowedError') {
          this.onError?.('Доступ к микрофону запрещен. Разрешите доступ в настройках браузера.')
        } else if (err.name === 'NotFoundError') {
          this.onError?.('Микрофон не найден. Проверьте подключение микрофона.')
        } else if (err.name === 'NotReadableError') {
          this.onError?.('Микрофон занят другим приложением.')
        } else if (err.name === 'OverconstrainedError') {
          this.onError?.('Запрошенные параметры микрофона не поддерживаются.')
        } else if (err.name === 'SecurityError') {
          this.onError?.('Требуется HTTPS для доступа к микрофону в продакшене.')
        } else if (err.name === 'AbortError') {
          this.onError?.('Запрос на доступ к микрофону был отменен.')
        } else {
          this.onError?.(`Ошибка доступа к микрофону: ${err.message}`)
        }
      } else {
        this.onError?.('Неизвестная ошибка при получении доступа к микрофону')
      }

      this.cleanup()
      this.onStateChange?.('idle')
    }
  }

  private cleanup() {
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        try {
          track.stop()
          console.log('Stopped track:', track.kind, track.label)
        } catch (err) {
          console.warn('Error stopping track:', err)
        }
      })
      this.localStream = null
    }

    if (this.peer && !this.peer.destroyed) {
      this.peer.destroy()
      this.peer = null
    }

    this.remoteStream = null
    this.isCallActive = false
  }

  disconnect() {
    this.cleanup()
    if (this.channel) {
      this.supabase.removeChannel(this.channel)
      this.channel = null
    }
    // Очищаем все каналы
    this.sendChannels.clear()
    // Останавливаем мониторинг соединения
    this.stopConnectionMonitoring()
  }

  // Идеальная обработка завершения звонка
  private setupCallTerminationHandlers() {
    if (typeof window === 'undefined') return

    // 1. Обработчик закрытия вкладки/браузера
    const handleBeforeUnload = async () => {
      console.log('🚨 Page unloading - checking for active call')

      if (this.isCallActive && this.targetUserId) {
        console.log('🚨 Active call detected, sending end call signal before unload')

        // Отправляем сигнал завершения синхронно
        try {
          if (this.targetUserId) {
        await this.sendSignal({
          type: 'end-call',
          from: this.currentUserId,
          to: this.targetUserId
        })
          }
        } catch (err) {
          console.error('🚨 Failed to send end call signal on page unload:', err)
        }

        // Останавливаем все медиа потоки
        if (this.localStream) {
          this.localStream.getTracks().forEach(track => {
            try {
              track.stop()
            } catch (err) {
              console.warn('🚨 Error stopping track on page unload:', err)
            }
          })
        }

        // Закрываем peer соединение
        if (this.peer && !this.peer.destroyed) {
          try {
            this.peer.destroy()
          } catch (err) {
            console.warn('🚨 Error destroying peer on page unload:', err)
          }
        }
      }
    }

    // 2. Обработчик изменения видимости страницы
    const handleVisibilityChange = () => {
      const isHidden = document.hidden
      console.log('Page visibility changed:', { hidden: isHidden, visibilityState: document.visibilityState })

      if (isHidden && this.isCallActive) {
        console.log('Page hidden during call - monitoring connection')
        // Можно добавить дополнительную логику, например, уменьшить качество
      } else if (!isHidden) {
        console.log('Page visible again - checking connection')
        this.lastActivityTime = Date.now()
      }
    }

    // 3. Обработчик изменения статуса сети
    const handleOnline = () => {
      console.log('🔄 Network connection restored')
      this.isOnline = true
      this.lastActivityTime = Date.now()
    }

    const handleOffline = () => {
      console.log('⚠️ Network connection lost')
      this.isOnline = false

      // Если мы в звонке, пытаемся восстановить соединение через 5 секунд
      if (this.isCallActive) {
        console.log('📞 Call active - attempting reconnection in 5 seconds...')
        setTimeout(() => {
          if (!this.isOnline) {
            console.log('📞 Network still unavailable - ending call')
            this.endCall()
            this.onError?.('Соединение с интернетом потеряно. Звонок завершен.')
          }
        }, 5000)
      }
    }

    // Регистрируем обработчики
    window.addEventListener('beforeunload', handleBeforeUnload)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    // 4. Запускаем периодическую проверку соединения
    this.startConnectionMonitoring()

    // Сохраняем ссылки для очистки
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      this.stopConnectionMonitoring()
    }
  }

  private startConnectionMonitoring() {
    this.stopConnectionMonitoring() // Очищаем предыдущий интервал

    this.connectionCheckInterval = setInterval(() => {
      const now = Date.now()
      const timeSinceLastActivity = now - this.lastActivityTime

      // Если прошло больше 30 секунд без активности и мы в звонке
      if (timeSinceLastActivity > 30000 && this.isCallActive) {
        console.log('⚠️ No activity for 30 seconds during call - checking connection')

        // Проверяем peer состояние
        if (this.peer) {
          const pc = (this.peer as SimplePeerWithPC)._pc
          if (pc && pc.connectionState === 'failed') {
            console.log('📞 Peer connection failed - ending call')
            this.endCall()
            this.onError?.('Соединение прервано. Звонок завершен.')
          }
        }
      }

      // Обновляем время последней активности
      this.lastActivityTime = now
    }, 10000) // Проверяем каждые 10 секунд
  }

  private stopConnectionMonitoring() {
    if (this.connectionCheckInterval) {
      clearInterval(this.connectionCheckInterval)
      this.connectionCheckInterval = null
    }
  }

  // Метод для принудительного сброса состояния (для экстренных случаев)
  forceReset() {
    console.log('🔄 Force resetting WebRTC state')

    // Очищаем все состояния
    this.targetUserId = null
    this.incomingCallerId = null
    this.isCallActive = false

    // Очищаем буферы
    this.refs.signalBufferRef.current = []
    if (this.refs.keepAliveIntervalRef.current) {
      clearInterval(this.refs.keepAliveIntervalRef.current)
    }
    if (this.refs.connectionCheckIntervalRef.current) {
      clearInterval(this.refs.connectionCheckIntervalRef.current)
    }
    if (this.refs.reconnectTimeoutRef.current) {
      clearTimeout(this.refs.reconnectTimeoutRef.current)
    }

    // Сбрасываем счетчики
    this.refs.keepAliveIntervalRef.current = null
    this.refs.connectionCheckIntervalRef.current = null
    this.refs.reconnectTimeoutRef.current = null
    this.refs.lastKeepAliveRef.current = 0
    this.refs.reconnectAttemptsRef.current = 0

    // Очищаем peer
    if (this.peer && !this.peer.destroyed) {
      this.peer.destroy()
    }
    this.peer = null
    this.refs.peerRef.current = null

    // Очищаем каналы
    if (this.channel) {
      this.supabase.removeChannel(this.channel)
      this.channel = null
    }

    this.onStateChange?.('idle')
    console.log('✅ WebRTC state force reset completed')
  }

  private handleIncomingSignal(payload: { payload: { type: string, signal?: SimplePeer.SignalData, from: string } }) {
    const { type, signal, from } = payload.payload

    console.log('📡 Received WebRTC signal:', payload)

    console.log('📡 Signal processing check:', {
      hasPeer: !!this.peer,
      peerDestroyed: this.peer?.destroyed,
      signalFrom: from,
      expectedFrom: this.targetUserId,
      signalType: type,
      shouldProcess: this.peer && !this.peer.destroyed && from === this.targetUserId
    })

    // Обработка специальных сигналов (не WebRTC)
    if (type === 'end-call') {
      console.log(`📞 [User ${this.currentUserId.slice(0, 8)}] Received end call signal from ${from.slice(0, 8)}`)
      this.endCall()
      this.onError?.('Звонок завершен собеседником')
      return
    }

    // Проверяем что сигнал от правильного пользователя
    if (from === this.targetUserId || (type === 'offer' && !this.targetUserId)) {
      // Если это offer сигнал - это входящий звонок
      if (type === 'offer') {
      console.log(`📞 [User ${this.currentUserId.slice(0, 8)}] Received call offer from ${from.slice(0, 8)}`)
      this.incomingCallerId = from
      this.targetUserId = from
      this.onStateChange?.('receiving')

      // Для offer сигнала - сразу инициализируем peer как receiver
      // Проверяем что мы не инициализируем повторно
      if (!this.peer && !this.refs.peerRef.current) {
        console.log(`🎯 [User ${this.currentUserId.slice(0, 8)}] Auto-initializing peer as receiver on offer signal`)
        // Небольшая задержка для обработки UI и предотвращения race conditions
        setTimeout(() => {
          if (!this.peer && !this.refs.peerRef.current && this.targetUserId === from) {
            console.log(`✅ [User ${this.currentUserId.slice(0, 8)}] Confirmed auto-initialization as receiver`)
            this.isCallActive = true
            this.initializePeer(false).catch(err => {
              console.error('Error auto-initializing peer:', err)
            })
          } else {
            console.log(`❌ [User ${this.currentUserId.slice(0, 8)}] Auto-initialization cancelled - peer exists or target changed`)
          }
        }, 200) // Увеличиваем задержку
      } else {
        console.log(`⚠️ [User ${this.currentUserId.slice(0, 8)}] Peer already exists, skipping auto-initialization`)
      }
    }

      // Если peer готов, обрабатываем сигнал
      if (this.peer && !this.peer.destroyed) {
        try {
          // Проверяем состояние peer connection перед обработкой сигнала
          const pc = (this.peer as SimplePeerWithPC)._pc
          if (pc) {
            const signalingState = pc.signalingState
            const hasLocalDescription = !!pc.localDescription
            const hasRemoteDescription = !!pc.remoteDescription

            console.log(`🔍 Peer states - signaling: ${signalingState}, localDesc: ${hasLocalDescription}, remoteDesc: ${hasRemoteDescription}`)
            console.log(`🔄 Processing ${type} signal from ${from.slice(0, 8)}`)

            // Проверяем допустимость обработки сигнала в текущем состоянии
            if (type === 'offer') {
              // Offer можно принимать только в stable состоянии или если нет remote description
              if (signalingState !== 'stable' && hasRemoteDescription) {
                console.log(`⚠️ Ignoring offer signal - invalid state (signaling: ${signalingState}, hasRemote: ${hasRemoteDescription})`)
                return
              }
            } else if (type === 'answer') {
              // Answer можно принимать только после отправки offer (have-local-offer)
              if (signalingState !== 'have-local-offer') {
                console.log(`⚠️ Ignoring answer signal - not in have-local-offer state (current: ${signalingState})`)
                return
              }
            } else if (type === 'candidate') {
              // ICE candidates можно принимать в любое время после установки description
              if (!hasLocalDescription) {
                console.log('⚠️ Ignoring ICE candidate - no local description set')
                return
              }
            }
          }

          this.peer.signal(signal!)
        } catch (err) {
          console.error('Error processing signal:', err)

          // Детальная обработка ошибок
          if (err instanceof Error) {
            if (err.message.includes('destroyed')) {
              console.log('Peer already destroyed, ignoring signal')
            } else if (err.message.includes('InvalidStateError') || err.message.includes('wrong state') || err.message.includes('Called in wrong state')) {
              console.log(`Invalid peer state for ${type} signal: ${err.message}`)
              // Не буферизуем сигналы, которые вызывают ошибки состояния
            } else if (err.message.includes('remote description') || err.message.includes('local description')) {
              console.log(`Description error for ${type} signal: ${err.message}`)
            } else {
              console.warn('Unexpected peer error:', err.message)
            }
          }
        }
      } else {
        // Peer не готов - буферизуем сигнал (только WebRTC сигналы)
        if (signal && type !== 'end-call') {
          console.log(`📦 Buffering ${type} signal from ${from.slice(0, 8)} (peer not ready)`)
          this.refs.signalBufferRef.current.push({ type, signal: signal as SimplePeer.SignalData, from })
          console.log(`📦 Buffer size: ${this.refs.signalBufferRef.current.length}`)
        }
      }
    } else {
      console.log('Ignoring signal - wrong sender:', {
        from: from?.slice(0, 8),
        expectedFrom: this.targetUserId?.slice(0, 8)
      })
    }
  }

  private processBufferedSignals() {
    const bufferedSignals = this.refs.signalBufferRef.current

    if (bufferedSignals.length > 0 && this.peer && !this.peer.destroyed) {
      console.log(`🔄 Processing ${bufferedSignals.length} buffered signals`)

      bufferedSignals.forEach(({ type, signal, from }, index) => {
        try {
          if (signal) {
            console.log(`🔄 Processing buffered signal ${index + 1}/${bufferedSignals.length}: ${type} from ${from.slice(0, 8)}`)
            this.peer!.signal(signal)
          }
        } catch (err) {
          console.error(`Error processing buffered signal ${index + 1}:`, err)
          // Не пытаемся повторно обработать сигналы, которые вызывают ошибки
        }
      })

      // Очищаем буфер после обработки
      this.refs.signalBufferRef.current = []
      console.log('✅ All buffered signals processed and buffer cleared')
    }
  }

  getIncomingCallerId(): string | null {
    return this.incomingCallerId
  }

  private async sendSignal(data: { type: string, from: string, to: string, signal?: SimplePeer.SignalData }) {
    try {
      if (this.peer?.destroyed) {
        console.log('Peer destroyed, not sending signal')
        return
      }

      console.log(`📤 Sending signal to ${data.to.slice(0, 8)}:`, data.type)

      // Пробуем разные способы отправки сигналов

      // Способ 1: Через realtime канал с явным httpSend
      try {
        const supabase = createClient()
        const targetChannel = supabase.channel(`webrtc:${data.to}`)

        // Подписываемся на канал
        await targetChannel.subscribe()

        // Отправляем сигнал
        await targetChannel.send({
          type: 'broadcast',
          event: 'webrtc_signal',
          payload: {
            type: data.type,
            signal: data.signal,
            from: data.from
          }
        })

        console.log('✅ Signal sent via realtime channel')
      } catch (realtimeError) {
        console.warn('Realtime send failed, trying HTTP fallback:', realtimeError)

        // Способ 2: Через прямой HTTP запрос к нашему API
        try {
          const response = await fetch('/api/signal', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              to: data.to,
              from: data.from,
              signal: data.signal
            })
          })

          if (response.ok) {
            console.log('✅ Signal sent via HTTP fallback')
          } else {
            console.error('HTTP fallback failed:', await response.text())
          }
        } catch (httpError) {
          console.error('Both realtime and HTTP fallback failed:', httpError)
        }
      }

      console.log('Signal sent successfully')
    } catch (err) {
      console.error('Error sending signal:', err)
    }
  }

  // Метод для получения списка пользователей
  async getUsers() {
    try {
      // В клиентском режиме мы не можем получить всех пользователей
      // Возвращаем пустой массив - пользователи должны обмениваться ID вручную
      return []
    } catch (error) {
      console.error('Error fetching users:', error)
      return []
    }
  }
}

