import SimplePeer from 'simple-peer'
import { createClient } from '@/lib/supabase/client'
import { CallState, PeerRefs } from '@/lib/types'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { logger } from '@/lib/logger'
import { resilientChannelManager } from '@/utils/resilientChannelManager'
import { handlePeerError, attemptReconnection, resetReconnectionCounter, handlePeerClose } from '@/utils/webrtcHelpers'

// Тип для доступа к RTCPeerConnection внутри SimplePeer
interface SimplePeerWithPC extends SimplePeer.Instance {
  _pc?: RTCPeerConnection
}

export class WebRTCService {
  private peer: SimplePeer.Instance | null = null
  private localStream: MediaStream | null = null
  private remoteStream: MediaStream | null = null
  private localScreenStream: MediaStream | null = null
  private remoteScreenStream: MediaStream | null = null
  private supabase = createClient()
  private channel: RealtimeChannel | null = null
  private currentUserId: string = ''
  private targetUserId: string | null = null
  private peerUserId: string | null = null
  private isCallActive = false
  private incomingCallerId: string | null = null
  private isRenegotiating = false // Флаг для отслеживания renegotiation процесса
  private ignoreOffersUntil = 0 // Время до которого игнорируем offer'ы (для защиты от ложных звонков)

  // Refs для управления состоянием
  private refs: PeerRefs

  private onStateChange?: (state: CallState) => void
  private onRemoteStream?: (stream: MediaStream) => void
  private onLocalStream?: (stream: MediaStream) => void
  private onError?: (error: string) => void
  private onRemoteMutedChange?: (muted: boolean) => void
  private onRemoteVoiceActivityChange?: (active: boolean) => void
  private onRemoteScreenStream?: (stream: MediaStream | null) => void

  // Звуки для звонков
  private ringtoneAudio: HTMLAudioElement | null = null
  private endCallAudio: HTMLAudioElement | null = null
  private startAudio: HTMLAudioElement | null = null
  private isRingtonePlaying = false

  // Кэш каналов для отправки сигналов
  private sendChannels: Map<string, RealtimeChannel> = new Map()

  // Обработчики завершения
  private connectionCheckInterval: NodeJS.Timeout | null = null
  private keepAliveInterval: NodeJS.Timeout | null = null
  private lastActivityTime = Date.now()
  private isOnline = true

  constructor(refs: PeerRefs) {
    this.refs = refs
    // Инициализация канала будет выполнена позже при первом использовании
    // Настраиваем обработчики завершения звонка
    this.setupCallTerminationHandlers()
    // Инициализируем звуки
    this.initializeSounds()
  }

  // Инициализация канала только для получения сигналов
  async initializeSignalChannel() {
    if (this.channel) {
      logger.log(`📺 [User ${this.currentUserId?.slice(0, 8)}] Signal channel already initialized`)
      return // Уже инициализирован
    }

    const { data: { user } } = await this.supabase.auth.getUser()
    if (!user) {
      logger.log('📺 No authenticated user, skipping channel initialization')
      return
    }

    this.currentUserId = user.id

    // Создаем устойчивый канал для получения входящих сигналов через ResilientChannelManager
    try {
      this.channel = await resilientChannelManager.createResilientChannel({
        channelName: `webrtc:${this.currentUserId}`,
        setup: (channel) => {
          return channel
            .on('broadcast', { event: 'webrtc_signal' }, (payload: { payload: { type: string, signal?: SimplePeer.SignalData, from: string } }) => {
              logger.log(`📡 [User ${this.currentUserId.slice(0, 8)}] Received signal from ${payload.payload.from.slice(0, 8)}:`, payload.payload.type)
              this.handleIncomingSignal(payload)
            })
            .on('presence', { event: 'sync' }, () => {
              logger.log(`👥 [User ${this.currentUserId.slice(0, 8)}] Channel presence synced`)
            })
        },
        onSubscribed: () => {
          logger.log(`✅ [User ${this.currentUserId.slice(0, 8)}] Successfully subscribed to resilient channel webrtc:${this.currentUserId}`)
        },
        onError: (error) => {
          logger.error(`❌ [User ${this.currentUserId.slice(0, 8)}] Resilient channel error:`, error)
        },
        // Настройки для WebRTC каналов - более агрессивное переподключение
        maxReconnectAttempts: 10,
        reconnectDelay: 2000,
        keepAliveInterval: 30000, // Каждые 30 секунд
        healthCheckInterval: 60000 // Каждые минуту
      })

      logger.log(`📺 [User ${this.currentUserId.slice(0, 8)}] Resilient signal channel initialized for receiving calls`)
    } catch (error) {
      logger.error(`💥 [User ${this.currentUserId.slice(0, 8)}] Failed to create resilient channel:`, error)
      throw error
    }
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
    onRemoteMutedChange?: (muted: boolean) => void
    onRemoteVoiceActivityChange?: (active: boolean) => void
    onRemoteScreenStream?: (stream: MediaStream | null) => void
  }) {
    this.onStateChange = callbacks.onStateChange
    this.onRemoteStream = callbacks.onRemoteStream
    this.onLocalStream = callbacks.onLocalStream
    this.onError = callbacks.onError
    this.onRemoteMutedChange = callbacks.onRemoteMutedChange
    this.onRemoteVoiceActivityChange = callbacks.onRemoteVoiceActivityChange
    this.onRemoteScreenStream = callbacks.onRemoteScreenStream
  }

  // Установка ID собеседника
  setPeerUserId(userId: string | null) {
    console.log(`👥 WebRTCService: Setting peer user ID from ${this.peerUserId?.slice(0, 8) || 'null'} to ${userId?.slice(0, 8) || 'null'}`)
    this.peerUserId = userId
    logger.log(`👥 WebRTCService: Peer user ID set to ${userId?.slice(0, 8) || 'null'}`)
  }

  // Отправка статуса микрофона собеседнику
  async sendMuteStatus(isMuted: boolean) {
    console.log(`🎤 sendMuteStatus called: isMuted=${isMuted}, peerUserId=${this.peerUserId?.slice(0, 8) || 'null'}, currentUserId=${this.currentUserId?.slice(0, 8) || 'null'}`)

    if (!this.peerUserId) {
      console.warn('❌ Cannot send mute status: no peer user ID')
      logger.warn('Cannot send mute status: no peer user ID')
      return
    }

    if (!this.currentUserId) {
      console.warn('❌ Cannot send mute status: no current user ID')
      return
    }

    try {
      console.log(`📤 Sending mute status signal: type='mute_status', from=${this.currentUserId.slice(0, 8)}, to=${this.peerUserId.slice(0, 8)}, muted=${isMuted}`)
      await this.sendSignal({
        type: 'mute_status',
        from: this.currentUserId,
        to: this.peerUserId,
        muted: isMuted
      })
      console.log(`✅ Mute status signal sent successfully`)
      logger.log(`📡 [User ${this.currentUserId.slice(0, 8)}] Sent mute status to ${this.peerUserId.slice(0, 8)}: ${isMuted ? 'muted' : 'unmuted'}`)
    } catch (error) {
      console.error('❌ Error sending mute status:', error)
      logger.error('Error sending mute status:', error)
    }
  }

  // Отправка статуса голосовой активности собеседнику
  async sendVoiceActivityStatus(isActive: boolean) {
    if (!this.peerUserId || !this.currentUserId) {
      // Тихая отправка - не логируем если нет peer
      return
    }

    try {
      await this.sendSignal({
        type: 'voice_activity',
        from: this.currentUserId,
        to: this.peerUserId,
        active: isActive
      })

      // Логируем только изменения состояния (не каждые 100ms)
      if (Math.random() < 0.01) { // 1% от отправок
        logger.log(`🗣️ [User ${this.currentUserId.slice(0, 8)}] Sent voice activity to ${this.peerUserId.slice(0, 8)}: ${isActive ? 'speaking' : 'quiet'}`)
      }
    } catch (error) {
      // Тихая ошибка - не прерываем работу
      if (Math.random() < 0.001) { // 0.1% от ошибок
        logger.warn('Voice activity signal failed (suppressed):', error)
      }
    }
  }

  // Отправка статуса демонстрации экрана собеседнику
  async sendScreenShareStatus(isSharing: boolean) {
    if (!this.peerUserId || !this.currentUserId) {
      logger.log('Cannot send screen share status: no peer user ID')
      return
    }

    try {
      await this.sendSignal({
        type: 'screen_share',
        from: this.currentUserId,
        to: this.peerUserId,
        sharing: isSharing
      })
      logger.log(`📺 [User ${this.currentUserId.slice(0, 8)}] Sent screen share status to ${this.peerUserId.slice(0, 8)}: ${isSharing ? 'sharing' : 'stopped'}`)
    } catch (error) {
      logger.error('Error sending screen share status:', error)
    }
  }

  // Начало демонстрации экрана
  async startScreenShare() {
    if (!this.peer || this.peer.destroyed) {
      logger.log('Cannot start screen share: no active peer connection')
      return false
    }

    try {
      logger.log('Requesting screen share access...')

      // Запрашиваем доступ к экрану
      this.localScreenStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 30 }
        },
        audio: false // Аудио экрана не передаем, чтобы избежать эха
      })

      logger.log('Screen share access granted, adding to peer...')

      // Устанавливаем флаг renegotiation
      this.isRenegotiating = true

      // Добавляем видео трек из screen стрима
      const videoTrack = this.localScreenStream.getVideoTracks()[0]
      if (videoTrack) {
        // Проверяем, есть ли уже видео трек в peer соединении
        const existingVideoTracks = this.localStream?.getVideoTracks() || []

        if (existingVideoTracks.length > 0) {
          // Заменяем существующий видео трек
          this.peer.replaceTrack(existingVideoTracks[0], videoTrack, this.localStream!)
          // Удаляем старый трек из локального стрима
          this.localStream!.removeTrack(existingVideoTracks[0])
        } else {
          // Добавляем новый видео трек
          this.peer.addTrack(videoTrack, this.localStream || new MediaStream())
        }

        // Добавляем новый трек в локальный стрим
        if (this.localStream) {
          this.localStream.addTrack(videoTrack)
        }

        // Отправляем специальный сигнал о начале renegotiation
        if (this.peerUserId) {
          this.sendSignal({
            type: 'renegotiate_start',
            from: this.currentUserId,
            to: this.peerUserId
          })
          logger.log('📤 Sent renegotiate_start signal')
        }

        // Обрабатываем окончание демонстрации (когда пользователь нажимает "Stop sharing")
        videoTrack.onended = () => {
          logger.log('Screen sharing ended by user')
          this.stopScreenShare()
        }

        // Отправляем статус screen_share сразу
        this.sendScreenShareStatus(true)
        logger.log('📺 Screen share status sent to peer')

        // Отправляем сигнал о завершении renegotiation через короткую задержку
        setTimeout(() => {
          if (this.peerUserId) {
            this.sendSignal({
              type: 'renegotiate_end',
              from: this.currentUserId,
              to: this.peerUserId
            })
            logger.log('🔄 Renegotiation end signal sent')
          }
        }, 1000)

        logger.log('Screen share started successfully')
        return true
      } else {
        logger.error('No video track found in screen stream')
        this.stopScreenShare()
        return false
      }
    } catch (error) {
      logger.error('Error starting screen share:', error)

      if (error instanceof Error) {
        if (error.name === 'NotAllowedError') {
          this.onError?.('Доступ к демонстрации экрана запрещен. Разрешите доступ в настройках браузера.')
        } else if (error.name === 'NotFoundError') {
          this.onError?.('Экран не найден для демонстрации.')
        } else {
          this.onError?.(`Ошибка демонстрации экрана: ${error.message}`)
        }
      } else {
        this.onError?.('Неизвестная ошибка при демонстрации экрана')
      }

      this.stopScreenShare()
      return false
    }
  }

  // Остановка демонстрации экрана
  stopScreenShare() {
    if (this.localScreenStream) {
      logger.log('Stopping screen share...')

      // Останавливаем видео треки screen стрима
      this.localScreenStream.getTracks().forEach(track => {
        track.stop()
        logger.log('Stopped screen track:', track.kind, track.label)
      })

      this.localScreenStream = null

      // Сбрасываем флаг renegotiation
      this.isRenegotiating = false

      // Устанавливаем период игнорирования offer'ов (5 секунд после остановки стрима)
      this.ignoreOffersUntil = Date.now() + 5000
      logger.log('🛡️ Ignoring offers for 5 seconds after screen share stop')

      // Отправляем статус собеседнику
      this.sendScreenShareStatus(false)

      // Примечание: НЕ удаляем видео трек из peer соединения,
      // чтобы избежать renegotiation и ложных звонков у собеседника

      logger.log('Screen share stopped')
    }
  }

  // Инициализация звуков для звонков
  async initializeSounds() {
    try {
      // Загружаем рингтон
      const { data: ringtoneData } = await this.supabase.storage
        .from('sounds')
        .getPublicUrl('ringtone.mp3')

      if (ringtoneData?.publicUrl) {
        this.ringtoneAudio = new Audio(ringtoneData.publicUrl)
        this.ringtoneAudio.loop = true
        this.ringtoneAudio.volume = 0.3
      }

      // Загружаем звук окончания звонка
      const { data: endCallData } = await this.supabase.storage
        .from('sounds')
        .getPublicUrl('endcall.mp3')

      if (endCallData?.publicUrl) {
        this.endCallAudio = new Audio(endCallData.publicUrl)
        this.endCallAudio.volume = 0.7
      }

      // Загружаем звук начала звонка
      const { data: startData } = await this.supabase.storage
        .from('sounds')
        .getPublicUrl('start.mp3')

      if (startData?.publicUrl) {
        this.startAudio = new Audio(startData.publicUrl)
        this.startAudio.volume = 0.8
      }

      logger.log('🔊 Sounds initialized successfully')
    } catch (error) {
      logger.error('❌ Error initializing sounds:', error)
    }
  }

  // Воспроизведение рингтона
  playRingtone() {
    if (this.ringtoneAudio && !this.isRingtonePlaying) {
      this.isRingtonePlaying = true
      this.ringtoneAudio.currentTime = 0
      this.ringtoneAudio.play().catch(err => {
        logger.error('❌ Error playing ringtone:', err)
        this.isRingtonePlaying = false
      })
    }
  }

  // Остановка рингтона
  stopRingtone() {
    if (this.ringtoneAudio && this.isRingtonePlaying) {
      this.ringtoneAudio.pause()
      this.ringtoneAudio.currentTime = 0
      this.isRingtonePlaying = false
    }
  }

  // Воспроизведение звука окончания звонка
  playEndCallSound() {
    if (this.endCallAudio) {
      this.endCallAudio.currentTime = 0
      this.endCallAudio.play().catch(err => {
        logger.error('❌ Error playing end call sound:', err)
      })
    }
  }

  // Воспроизведение звука начала звонка
  playStartSound() {
    if (this.startAudio) {
      this.startAudio.currentTime = 0
      this.startAudio.play().catch(err => {
        logger.error('❌ Error playing start sound:', err)
      })
    }
  }

  // Обработка завершения звонка от удаленного пользователя (без отправки сигнала обратно)
  handleRemoteEndCall() {
    logger.log(`📞 [User ${this.currentUserId.slice(0, 8)}] Handling remote end call - current state: isCallActive=${this.isCallActive}, targetUserId=${this.targetUserId?.slice(0, 8)}`)

    // Останавливаем рингтон и проигрываем звук окончания звонка
    this.stopRingtone()
    this.playEndCallSound()

    // Очищаем соединение без отправки сигнала
    this.isCallActive = false
    this.targetUserId = null
    this.incomingCallerId = null
    this.cleanup()

    // Устанавливаем состояние idle
    this.onStateChange?.('idle')

    // Показываем сообщение пользователю
    this.onError?.('Звонок завершен собеседником')
  }

  async startCall(targetUserId: string) {
    if (this.peer && !this.peer.destroyed) {
      logger.log('⚠️ Call already in progress, ignoring start call request')
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
      logger.log('⚠️ Call already in progress, ignoring answer call request')
      return
    }

    // Останавливаем рингтон при принятии звонка
    this.stopRingtone()

    // Инициализируем канал только при ответе на звонок
    await this.initializeSupabaseChannel()

    this.targetUserId = callerId
    this.isCallActive = true
    await this.initializePeer(false)

    // Отправляем сигнал звонящему о том, что звонок принят
    try {
      await this.sendSignal({
        type: 'call_accepted',
        from: this.currentUserId,
        to: callerId
      })
      logger.log(`📞 [User ${this.currentUserId.slice(0, 8)}] Sent call accepted signal to ${callerId.slice(0, 8)}`)
    } catch (error) {
      logger.warn('Failed to send call accepted signal:', error)
    }

    this.onStateChange?.('connected')
  }

  async endCall() {
    logger.log(`📞 [User ${this.currentUserId.slice(0, 8)}] Ending call - targetUserId: ${this.targetUserId?.slice(0, 8)}, isCallActive: ${this.isCallActive}`)

    // Останавливаем рингтон если он играет
    this.stopRingtone()

    // Проигрываем звук окончания звонка
    this.playEndCallSound()

    // Отправляем сигнал завершения через resilient канал
    if (this.targetUserId) {
      try {
        await this.sendSignal({
          type: 'end-call',
          from: this.currentUserId,
          to: this.targetUserId
        })
        logger.log('End call signal sent via resilient channel')
      } catch (err) {
        logger.error('Error sending end call signal:', err)
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
        logger.log('Peer already exists, destroying old one')
        this.peer.destroy()
        this.peer = null
      }

      // Запрашиваем микрофон только если его нет
      if (!this.localStream) {
        logger.log('Requesting microphone access...')
        logger.log('HTTPS check:', window.location.protocol === 'https:')

        // Получаем только аудио поток
        this.localStream = await navigator.mediaDevices.getUserMedia({
          video: false,
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        })
      } else {
        logger.log('Using existing microphone stream')
      }

      logger.log('Microphone access granted, stream:', {
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

      // Создаем SimplePeer с улучшенной конфигурацией ICE серверов
      const peerConfig = {
        initiator: isInitiator,
        trickle: true,
        stream: this.localStream,
        config: {
          iceServers: [
            // STUN серверы (для большинства случаев)
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' },
            { urls: 'stun:stun3.l.google.com:19302' },
            { urls: 'stun:stun4.l.google.com:19302' },

            // TURN серверы для случаев, когда STUN недостаточно
            // Эти серверы предоставлены сообществом для тестирования
            // В продакшене рекомендуется использовать собственные TURN серверы
            {
              urls: 'turn:openrelay.metered.ca:80',
              username: 'openrelayproject',
              credential: 'openrelayproject'
            },
            {
              urls: 'turn:openrelay.metered.ca:443',
              username: 'openrelayproject',
              credential: 'openrelayproject'
            },
            {
              urls: 'turn:openrelay.metered.ca:443?transport=tcp',
              username: 'openrelayproject',
              credential: 'openrelayproject'
            }
          ],
          // Оптимизации для лучшего соединения
          iceCandidatePoolSize: 10
        } as RTCConfiguration,
      }

      this.peer = new SimplePeer(peerConfig)

    // Обработчик сигналов
    this.peer.on('signal', async (data) => {
      try {
        // Проверяем что у нас есть targetUserId перед отправкой
        if (!this.targetUserId) {
          logger.log('⚠️ No targetUserId set, buffering signal until target is set')
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
        logger.error('Error sending signal:', err)
      }
    })

      // Обработчик подключения
      this.peer.on('connect', () => {
        logger.log('Peer connected!')
        this.isCallActive = true
        this.onStateChange?.('connected')

        // Проигрываем звук начала звонка
        this.playStartSound()

        // Сбрасываем счетчик переподключений
        this.refs.reconnectAttemptsRef.current = 0

        // Запускаем keep-alive механизм для поддержания соединения
        this.startKeepAlive()
      })

      // Обработчик получения remote stream
      this.peer.on('stream', (remoteStream: MediaStream) => {
        logger.log('Received remote stream:', {
          id: remoteStream.id,
          tracks: remoteStream.getTracks().map(track => ({
            kind: track.kind,
            label: track.label,
            enabled: track.enabled,
            muted: track.muted,
            readyState: track.readyState
          }))
        })

        // Сохраняем полный remote stream
        this.remoteStream = remoteStream
        this.onRemoteStream?.(remoteStream)

        // Проверяем и обрабатываем треки
        processRemoteTracks(remoteStream)

        // Добавляем обработчик изменения треков в stream'е
        remoteStream.onaddtrack = (event) => {
          logger.log('Track added to remote stream:', {
            kind: event.track.kind,
            label: event.track.label,
            id: event.track.id
          })

          // Если добавлен видео трек, обрабатываем как screen sharing
          if (event.track.kind === 'video') {
            const screenStream = new MediaStream([event.track])
            this.remoteScreenStream = screenStream
            this.onRemoteScreenStream?.(screenStream)
            logger.log('Screen sharing started via onaddtrack')
          }
        }

        remoteStream.onremovetrack = (event) => {
          logger.log('Track removed from remote stream:', {
            kind: event.track.kind,
            label: event.track.label,
            id: event.track.id
          })

          // Если удален видео трек, останавливаем screen sharing
          if (event.track.kind === 'video') {
            this.remoteScreenStream = null
            this.onRemoteScreenStream?.(null)
            logger.log('Screen sharing stopped via onremovetrack')
          }
        }
      })

      // Обработчик новых треков (для динамического добавления видео)
      this.peer.on('track', (track: MediaStreamTrack) => {
        logger.log('Received new track:', {
          kind: track.kind,
          label: track.label,
          id: track.id,
          enabled: track.enabled,
          readyState: track.readyState
        })

        // Если это видео трек, обрабатываем как screen sharing
        if (track.kind === 'video') {
          const screenStream = new MediaStream([track])
          this.remoteScreenStream = screenStream
          this.onRemoteScreenStream?.(screenStream)
          logger.log('Processed screen sharing track')
        }
      })

      // Функция для обработки треков remote stream
      const processRemoteTracks = (remoteStream: MediaStream) => {
        const audioTracks = remoteStream.getAudioTracks()
        const videoTracks = remoteStream.getVideoTracks()

        logger.log('Processing remote tracks:', {
          audio: audioTracks.length,
          video: videoTracks.length
        })

        // Обрабатываем видео треки (демонстрация экрана)
        if (videoTracks.length > 0) {
          const screenStream = new MediaStream(videoTracks)
          this.remoteScreenStream = screenStream
          this.onRemoteScreenStream?.(screenStream)
          logger.log('Screen sharing active with', videoTracks.length, 'video tracks')
        } else {
          // Если видео треков нет, очищаем screen stream
          if (this.remoteScreenStream) {
            this.remoteScreenStream = null
            this.onRemoteScreenStream?.(null)
            logger.log('Screen sharing stopped')
          }
        }
      }

      // Обработчик ошибок с улучшенной логикой
      this.peer.on('error', (err: Error) => {
        handlePeerError(
          err,
          this.refs,
          this.currentUserId,
          this.targetUserId,
          this.isCallActive,
          async (isInitiator: boolean) => {
            // Переинициализация peer соединения
            await this.initializePeer(isInitiator)
          }
        )
      })

      // Обработчик закрытия с улучшенной логикой
      this.peer.on('close', () => {
        handlePeerClose(
          this.refs,
          this.currentUserId,
          () => this.stopKeepAlive(),
          () => this.stopConnectionMonitoring()
        )
        this.onStateChange?.('idle')
      })

      this.refs.peerRef.current = this.peer

      // Обрабатываем буферизованные сигналы
      this.processBufferedSignals()

    } catch (err) {
      logger.error('Error initializing peer:', err)

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
    // Останавливаем все звуки
    this.stopRingtone()

    // Сбрасываем счетчики переподключения
    resetReconnectionCounter(this.refs)

    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        try {
          track.stop()
          logger.log('Stopped track:', track.kind, track.label)
        } catch (err) {
          logger.warn('Error stopping track:', err)
        }
      })
      this.localStream = null
    }

    if (this.localScreenStream) {
      this.localScreenStream.getTracks().forEach(track => {
        try {
          track.stop()
          logger.log('Stopped screen track:', track.kind, track.label)
        } catch (err) {
          logger.warn('Error stopping screen track:', err)
        }
      })
      this.localScreenStream = null
    }

    if (this.peer && !this.peer.destroyed) {
      this.peer.destroy()
      this.peer = null
    }

    this.remoteStream = null
    this.remoteScreenStream = null
    this.isCallActive = false
  }

  // Keep-alive механизм для поддержания соединения
  private startKeepAlive() {
    logger.log('🚀 Starting WebRTC keep-alive mechanism')

    // Отправляем keep-alive каждые 5 минут
    this.keepAliveInterval = setInterval(() => {
      if (this.peer && this.isCallActive && this.peerUserId) {
        try {
          // Отправляем пустой сигнал для поддержания соединения
          this.sendSignal({
            type: 'keep_alive',
            from: this.currentUserId,
            to: this.peerUserId
          })
          logger.log('💓 Keep-alive sent to maintain connection')
        } catch (error) {
          logger.warn('Failed to send keep-alive:', error)
        }
      }
    }, 5 * 60 * 1000) // 5 минут
  }

  private stopKeepAlive() {
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval)
      this.keepAliveInterval = null
      logger.log('🛑 Keep-alive mechanism stopped')
    }
  }

  disconnect() {
    // Останавливаем keep-alive
    this.stopKeepAlive()

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
      logger.log('🚨 Page unloading - checking for active call')

      if (this.isCallActive && this.targetUserId) {
        logger.log('🚨 Active call detected, sending end call signal before unload')

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
          logger.error('🚨 Failed to send end call signal on page unload:', err)
        }

        // Останавливаем все медиа потоки
        if (this.localStream) {
          this.localStream.getTracks().forEach(track => {
            try {
              track.stop()
            } catch (err) {
              logger.warn('🚨 Error stopping track on page unload:', err)
            }
          })
        }

        // Закрываем peer соединение
        if (this.peer && !this.peer.destroyed) {
          try {
            this.peer.destroy()
          } catch (err) {
            logger.warn('🚨 Error destroying peer on page unload:', err)
          }
        }
      }
    }

    // 2. Обработчик изменения видимости страницы
    const handleVisibilityChange = () => {
      const isHidden = document.hidden
      logger.log('Page visibility changed:', { hidden: isHidden, visibilityState: document.visibilityState })

      if (isHidden && this.isCallActive) {
        logger.log('Page hidden during call - monitoring connection')
        // Можно добавить дополнительную логику, например, уменьшить качество
      } else if (!isHidden) {
        logger.log('Page visible again - checking connection')
        this.lastActivityTime = Date.now()
      }
    }

    // 3. Обработчик изменения статуса сети
    const handleOnline = () => {
      logger.log('🔄 Network connection restored')
      this.isOnline = true
      this.lastActivityTime = Date.now()
    }

    const handleOffline = () => {
      logger.log('⚠️ Network connection lost')
      this.isOnline = false

      // Если мы в звонке, пытаемся восстановить соединение через 5 секунд
      if (this.isCallActive) {
        logger.log('📞 Call active - attempting reconnection in 5 seconds...')
        setTimeout(() => {
          if (!this.isOnline) {
            logger.log('📞 Network still unavailable - ending call')
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
        logger.log('⚠️ No activity for 30 seconds during call - checking connection')

        // Проверяем peer состояние
        if (this.peer) {
          const pc = (this.peer as SimplePeerWithPC)._pc
          if (pc && pc.connectionState === 'failed') {
            logger.log('📞 Peer connection failed - attempting reconnection')

            // Попытка переподключения вместо завершения звонка
            attemptReconnection(
              this.refs,
              this.currentUserId,
              this.isCallActive,
              this.targetUserId,
              async (isInitiator: boolean) => {
                // Переинициализация peer соединения
                await this.initializePeer(isInitiator)
              }
            )
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
    logger.log('🔄 Force resetting WebRTC state')

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
    logger.log('✅ WebRTC state force reset completed')
  }

  private handleIncomingSignal(payload: { payload: { type: string, signal?: SimplePeer.SignalData, from: string, muted?: boolean, active?: boolean, sharing?: boolean } }) {
    const { type, signal, from, muted } = payload.payload

    logger.log('📡 Received WebRTC signal:', payload)

    logger.log('📡 Signal processing check:', {
      hasPeer: !!this.peer,
      peerDestroyed: this.peer?.destroyed,
      signalFrom: from,
      expectedFrom: this.targetUserId,
      signalType: type,
      shouldProcess: this.peer && !this.peer.destroyed && from === this.targetUserId
    })

    // Обработка специальных сигналов (не WebRTC)
    if (type === 'end-call') {
      logger.log(`📞 [User ${this.currentUserId.slice(0, 8)}] Received end call signal from ${from.slice(0, 8)}`)
      this.handleRemoteEndCall()
      return
    }

    // Обработка keep_alive сигнала
    if (type === 'keep_alive') {
      logger.log(`💓 [User ${this.currentUserId.slice(0, 8)}] Received keep-alive from ${from.slice(0, 8)}`)
      // Ничего не делаем, просто подтверждаем получение
      return
    }

    // Обработка call_accepted сигнала
    if (type === 'call_accepted') {
      logger.log(`📞 [User ${this.currentUserId.slice(0, 8)}] Call accepted by ${from.slice(0, 8)}`)
      this.onStateChange?.('connected')
      return
    }

    // Обработка mute_status сигнала
    if (type === 'mute_status') {
      console.log(`🎤 🔴 RECEIVED MUTE STATUS: from=${from.slice(0, 8)}, muted=${muted}, type=${typeof muted}`)
      logger.log(`🎤 [User ${this.currentUserId.slice(0, 8)}] Received mute status from ${from.slice(0, 8)}: ${muted ? 'muted' : 'unmuted'}`)
      this.onRemoteMutedChange?.(muted!)
      return
    }

    // Обработка voice_activity сигнала
    if (type === 'voice_activity') {
      const active = payload.payload.active as boolean
      console.log(`🎤 🗣️ RECEIVED VOICE ACTIVITY: from=${from.slice(0, 8)}, active=${active}`)
      logger.log(`🎤 [User ${this.currentUserId.slice(0, 8)}] Received voice activity from ${from.slice(0, 8)}: ${active ? 'speaking' : 'quiet'}`)
      this.onRemoteVoiceActivityChange?.(active!)
      return
    }

    // Обработка screen_share сигнала
    if (type === 'screen_share') {
      const sharing = payload.payload.sharing as boolean
      console.log(`📺 RECEIVED SCREEN SHARE: from=${from.slice(0, 8)}, sharing=${sharing}`)
      logger.log(`📺 [User ${this.currentUserId.slice(0, 8)}] Received screen share status from ${from.slice(0, 8)}: ${sharing ? 'started' : 'stopped'}`)

      if (sharing) {
        // Если sharing=true, проверяем текущий remote stream на видео треки
        if (this.remoteStream) {
          const videoTracks = this.remoteStream.getVideoTracks()
          if (videoTracks.length > 0) {
            const screenStream = new MediaStream(videoTracks)
            this.remoteScreenStream = screenStream
            this.onRemoteScreenStream?.(screenStream)
            logger.log('Screen sharing activated from existing stream')
          } else {
            logger.log('Screen sharing signal received but no video tracks found in remote stream')
          }
        } else {
          logger.log('Screen sharing signal received but no remote stream available')
        }
      } else {
        // Если стрим остановлен, очищаем remote screen stream
        this.remoteScreenStream = null
        this.onRemoteScreenStream?.(null)
        logger.log('Screen sharing stopped')
      }
      return
    }

    // Обработка renegotiate_start сигнала
    if (type === 'renegotiate_start') {
      console.log(`🔄 RECEIVED RENEGOTIATE START: from=${from.slice(0, 8)}`)
      logger.log(`🔄 [User ${this.currentUserId.slice(0, 8)}] Received renegotiate_start from ${from.slice(0, 8)}`)
      this.isRenegotiating = true
      // Сбрасываем флаг через 10 секунд (на случай если что-то пойдет не так)
      setTimeout(() => {
        this.isRenegotiating = false
        logger.log('🔄 Renegotiation flag auto-reset after timeout')
      }, 10000)
      return
    }

    // Обработка renegotiate_end сигнала
    if (type === 'renegotiate_end') {
      console.log(`🔄 RECEIVED RENEGOTIATE END: from=${from.slice(0, 8)}`)
      logger.log(`🔄 [User ${this.currentUserId.slice(0, 8)}] Received renegotiate_end from ${from.slice(0, 8)}`)
      this.isRenegotiating = false
      return
    }

    // Проверяем что сигнал от правильного пользователя
    if (from === this.targetUserId || (type === 'offer' && !this.targetUserId)) {
      // Если это offer сигнал - проверяем, не является ли это частью renegotiation
      if (type === 'offer') {
        const now = Date.now()
        // Если мы в процессе renegotiation или в период игнорирования offer'ов, игнорируем offer как новый звонок
        if ((this.isRenegotiating && this.isCallActive) || now < this.ignoreOffersUntil) {
          logger.log(`🔄 [User ${this.currentUserId.slice(0, 8)}] Ignoring offer during renegotiation or cooldown from ${from.slice(0, 8)} (${now < this.ignoreOffersUntil ? 'cooldown' : 'renegotiation'})`)
          // Сбрасываем флаг renegotiation через 5 секунд (на случай если что-то пойдет не так)
          setTimeout(() => {
            this.isRenegotiating = false
            logger.log('🔄 Renegotiation flag reset after timeout')
          }, 5000)
        } else {
          logger.log(`📞 [User ${this.currentUserId.slice(0, 8)}] Received call offer from ${from.slice(0, 8)}`)
          this.incomingCallerId = from
          this.targetUserId = from
          this.onStateChange?.('receiving')

          // Запускаем рингтон для входящего звонка
          this.playRingtone()

          // Для offer сигнала - НЕ инициализируем peer автоматически!
          // Peer будет создан только после явного принятия звонка через answerCall()
          logger.log(`🎯 [User ${this.currentUserId.slice(0, 8)}] Received call offer from ${from.slice(0, 8)} - waiting for user acceptance`)
          this.isCallActive = false
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

            logger.log(`🔍 Peer states - signaling: ${signalingState}, localDesc: ${hasLocalDescription}, remoteDesc: ${hasRemoteDescription}`)
            logger.log(`🔄 Processing ${type} signal from ${from.slice(0, 8)}`)

            // Проверяем допустимость обработки сигнала в текущем состоянии
            if (type === 'offer') {
              // Offer можно принимать только в stable состоянии или если нет remote description
              if (signalingState !== 'stable' && hasRemoteDescription) {
                logger.log(`⚠️ Ignoring offer signal - invalid state (signaling: ${signalingState}, hasRemote: ${hasRemoteDescription})`)
                return
              }
            } else if (type === 'answer') {
              // Answer можно принимать только после отправки offer (have-local-offer)
              if (signalingState !== 'have-local-offer') {
                logger.log(`⚠️ Ignoring answer signal - not in have-local-offer state (current: ${signalingState})`)
                return
              }
            } else if (type === 'candidate') {
              // ICE candidates можно принимать в любое время после установки description
              if (!hasLocalDescription) {
                logger.log('⚠️ Ignoring ICE candidate - no local description set')
                return
              }
            }
          }

          this.peer.signal(signal!)
        } catch (err) {
          logger.error('Error processing signal:', err)

          // Детальная обработка ошибок
          if (err instanceof Error) {
            if (err.message.includes('destroyed')) {
              logger.log('Peer already destroyed, ignoring signal')
            } else if (err.message.includes('InvalidStateError') || err.message.includes('wrong state') || err.message.includes('Called in wrong state')) {
              logger.log(`Invalid peer state for ${type} signal: ${err.message}`)
              // Не буферизуем сигналы, которые вызывают ошибки состояния
            } else if (err.message.includes('remote description') || err.message.includes('local description')) {
              logger.log(`Description error for ${type} signal: ${err.message}`)
            } else {
              logger.warn('Unexpected peer error:', err.message)
            }
          }
        }
      } else {
        // Peer не готов - буферизуем сигнал (только WebRTC сигналы)
        if (signal && type && type !== 'end-call') {
          logger.log(`📦 Buffering ${type} signal from ${from.slice(0, 8)} (peer not ready)`)
          this.refs.signalBufferRef.current.push({ type, signal: signal as SimplePeer.SignalData, from })
          logger.log(`📦 Buffer size: ${this.refs.signalBufferRef.current.length}`)
        } else if (!type || type === 'undefined') {
          logger.warn(`⚠️ Ignoring invalid signal with type: ${type} from ${from.slice(0, 8)}`)
        }
      }
    } else {
      logger.log('Ignoring signal - wrong sender:', {
        from: from?.slice(0, 8),
        expectedFrom: this.targetUserId?.slice(0, 8)
      })
    }
  }

  processBufferedSignals() {
    const bufferedSignals = this.refs.signalBufferRef.current

    if (bufferedSignals.length > 0 && this.peer && !this.peer.destroyed) {
      logger.log(`🔄 Processing ${bufferedSignals.length} buffered signals`)

      bufferedSignals.forEach(({ type, signal, from }: { type: string, signal?: SimplePeer.SignalData, from: string }, index: number) => {
        try {
          if (signal) {
            logger.log(`🔄 Processing buffered signal ${index + 1}/${bufferedSignals.length}: ${type} from ${from.slice(0, 8)}`)
            this.peer!.signal(signal)
          }
        } catch (err) {
          logger.error(`Error processing buffered signal ${index + 1}:`, err)
          // Не пытаемся повторно обработать сигналы, которые вызывают ошибки
        }
      })

      // Очищаем буфер после обработки
      this.refs.signalBufferRef.current = []
      logger.log('✅ All buffered signals processed and buffer cleared')
    }
  }

  getIncomingCallerId(): string | null {
    return this.incomingCallerId
  }

  getLocalStream(): MediaStream | null {
    return this.localStream
  }

  getRemoteScreenStream(): MediaStream | null {
    return this.remoteScreenStream
  }

  getLocalScreenStream(): MediaStream | null {
    return this.localScreenStream
  }

  async sendSignal(data: { type: string, from: string, to: string, signal?: SimplePeer.SignalData, muted?: boolean, active?: boolean, sharing?: boolean }) {
    try {
      if (this.peer?.destroyed) {
        logger.log('Peer destroyed, not sending signal')
        return
      }

      logger.log(`📤 Sending signal to ${data.to.slice(0, 8)}:`, data.type)

      // Пробуем разные способы отправки сигналов

      // Способ 1: Через кэшированный realtime канал
      try {
        let targetChannel = this.sendChannels.get(data.to)

        if (!targetChannel) {
          const supabase = createClient()
          targetChannel = supabase.channel(`webrtc:${data.to}`)
          this.sendChannels.set(data.to, targetChannel)

          // Подписываемся на канал только если он новый
          await targetChannel.subscribe()
          logger.log(`📡 Subscribed to send channel for ${data.to.slice(0, 8)}`)
        }

        // Отправляем сигнал через кэшированный канал
        await targetChannel.send({
          type: 'broadcast',
          event: 'webrtc_signal',
          payload: {
            type: data.type,
            signal: data.signal,
            from: data.from,
            muted: data.muted,
            active: data.active,
            sharing: data.sharing
          }
        })

        logger.log('✅ Signal sent via cached realtime channel')
      } catch (realtimeError) {
        logger.warn('Realtime send failed, trying HTTP fallback:', realtimeError)

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
              signal: data.signal,
              muted: data.muted,
              active: data.active,
              sharing: data.sharing
            })
          })

          if (response.ok) {
            logger.log('✅ Signal sent via HTTP fallback')
          } else {
            logger.error('HTTP fallback failed:', await response.text())
          }
        } catch (httpError) {
          logger.error('Both realtime and HTTP fallback failed:', httpError)
        }
      }

      logger.log('Signal sent successfully')
    } catch (err) {
      logger.error('Error sending signal:', err)
    }
  }

  // Метод для получения списка пользователей
  async getUsers() {
    try {
      // В клиентском режиме мы не можем получить всех пользователей
      // Возвращаем пустой массив - пользователи должны обмениваться ID вручную
      return []
    } catch (error) {
      logger.error('Error fetching users:', error)
      return []
    }
  }

}

