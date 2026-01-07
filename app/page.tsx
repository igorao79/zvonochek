'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import SimplePeer from 'simple-peer'
import { WebRTCService } from '@/lib/webrtc'
import { CallState, User, PeerRefs } from '@/lib/types'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { logger } from '@/lib/logger'
import Header from '@/components/Header'
import CallInterface from '@/components/CallInterface'
import UserList from '@/components/UserList'
import SettingsModal from '@/components/SettingsModal'
import FloatingLines from '@/components/FloatingLines'
import ScreenShareDisplay from '@/components/ScreenShareDisplay'

export default function AudioCallPage() {
  const [callState, setCallState] = useState<CallState>('idle')
  const [error, setError] = useState<string | null>(null)
  const [targetUserId, setTargetUserId] = useState<string>('')
  const [currentUser, setCurrentUser] = useState<User | null>(null)
  const [loadingProfile, setLoadingProfile] = useState(true)
  const [isMuted, setIsMuted] = useState(false)
  const [allUsers, setAllUsers] = useState<User[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [incomingCallerId, setIncomingCallerId] = useState<string | null>(null)
  const [currentPeerId, setCurrentPeerId] = useState<string | null>(null)
  const [contacts, setContacts] = useState<string[]>([])
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false)
  const [loadingUsers, setLoadingUsers] = useState(true)
  const [isLoadingUsers, setIsLoadingUsers] = useState(false) // Флаг для предотвращения одновременных вызовов
  const [voiceActivity, setVoiceActivity] = useState<{ local: boolean, remote: boolean }>({ local: false, remote: false })
  const [remoteMuted, setRemoteMuted] = useState(false)
  const [remoteVoiceActivity, setRemoteVoiceActivity] = useState(false)
  const [isStreaming, setIsStreaming] = useState(false)
  const [remoteScreenStream, setRemoteScreenStream] = useState<MediaStream | null>(null)
  const [localScreenStream, setLocalScreenStream] = useState<MediaStream | null>(null)

  // Debug: отслеживаем изменения remoteMuted
  useEffect(() => {
    console.log(`🎤 remoteMuted changed to: ${remoteMuted}`)
  }, [remoteMuted])

  // Settings modal state
  const [settingsUser, setSettingsUser] = useState<User | null>(null)
  const [settingsLoading, setSettingsLoading] = useState(false)
  const [settingsSaving, setSettingsSaving] = useState(false)

  const initCompletedRef = useRef(false) // Флаг завершения инициализации
  const [settingsDisplayName, setSettingsDisplayName] = useState('')
  const [settingsUploading, setSettingsUploading] = useState(false)
  const settingsFileInputRef = useRef<HTMLInputElement>(null)

  const localAudioRef = useRef<HTMLAudioElement>(null)
  const remoteAudioRef = useRef<HTMLAudioElement>(null)
  const webrtcServiceRef = useRef<WebRTCService | null>(null)

  // Refs для WebRTC
  const peerRef = useRef<SimplePeer.Instance | null>(null)
  const signalBufferRef = useRef<Array<{type: string, signal?: SimplePeer.SignalData, from: string}>>([])
  const keepAliveIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const connectionCheckIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const lastKeepAliveRef = useRef<number>(0)
  const reconnectAttemptsRef = useRef<number>(0)

  const router = useRouter()
  const supabase = createClient()

  // Функция для определения онлайн статуса
  const isUserOnline = (lastSeen: string | null): boolean => {
    if (!lastSeen) return false
    const lastSeenDate = new Date(lastSeen)
    const now = new Date()
    const diffSeconds = (now.getTime() - lastSeenDate.getTime()) / 1000
    return diffSeconds < 60 // Онлайн, если активность была менее 1 минуты назад
  }

  const loadUsers = async (userOverride?: User) => {
    const userToUse = userOverride || currentUser
    if (!userToUse) {
      logger.log('loadUsers: No current user, skipping')
      return
    }

    if (isLoadingUsers) {
      logger.log('loadUsers: Already loading, skipping duplicate call')
      return
    }

    logger.log('loadUsers: Starting user load')
    setIsLoadingUsers(true)
    setLoadingUsers(true)

    // Таймаут для предотвращения бесконечной загрузки
    const timeoutId = setTimeout(() => {
      logger.warn('User loading timeout - forcing stop loading')
      setLoadingUsers(false)
    }, 10000) // 10 секунд таймаут

    try {
      const controller = new AbortController()
      const timeoutId2 = setTimeout(() => controller.abort(), 8000) // 8 секунд на запрос

      logger.log('Starting users fetch...')

      const response = await fetch('/api/users', {
        signal: controller.signal,
        headers: {
          'Cache-Control': 'no-cache'
        }
      })

      clearTimeout(timeoutId2)
      logger.log('Users fetch completed with status:', response.status)

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const data = await response.json()
      logger.log('Users data received:', { usersCount: data.users?.length || 0, hasError: !!data.error })

      if (data.users) {
        // Сохраняем всех пользователей
        setAllUsers(data.users)

        // Фильтруем текущего пользователя и контакты из списка
        const filteredUsers = data.users.filter((user: User) =>
          user.id !== userToUse.id && !contacts.includes(user.id)
        )
        logger.log('All users count:', data.users.length, 'Filtered users count:', filteredUsers.length)
        setUsers(filteredUsers)
      } else {
        logger.warn('No users data received, setting empty list')
        setUsers([])
      }
    } catch (error) {
      logger.error('Error loading users:', error)
      // В случае ошибки показываем пустой список
      setUsers([])

      if (error && typeof error === 'object' && 'name' in error && error.name === 'AbortError') {
        logger.warn('Request was aborted due to timeout')
      }
    } finally {
      clearTimeout(timeoutId)
      setLoadingUsers(false)
      setIsLoadingUsers(false)
      logger.log('loadUsers: Finished loading')
    }
  }

  useEffect(() => {
    // Предотвращаем повторную инициализацию
    if (initCompletedRef.current) {
      logger.log('initApp: Already initialized, skipping')
      return
    }

    // Инициализация пользователя и каналов - запускается только один раз при монтировании
    const initApp = async () => {
      logger.log('initApp: Starting initialization')

      // Ждем небольшую задержку для стабильности
      await new Promise(resolve => setTimeout(resolve, 100))

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        logger.log('initApp: No authenticated user found, redirecting to login')
        router.push('/login')
        return
      }
      // Загружаем профиль пользователя
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()

      // Устанавливаем данные пользователя
      if (!profileError && profile) {
        setCurrentUser({
          id: user.id,
          email: user.email || '',
          display_name: profile.display_name,
          avatar_url: profile.avatar_url,
          created_at: profile.created_at,
          updated_at: profile.updated_at,
          online: true
        })
      } else {
        // Если профиля нет, создаем базовый
        setCurrentUser({
          id: user.id,
          email: user.email || '',
          display_name: '',
          avatar_url: '',
          created_at: user.created_at || '',
          updated_at: user.updated_at || '',
          online: true
        })
      }

      // Профиль загружен - завершаем загрузку ПОСЛЕ установки данных
      setLoadingProfile(false)

      // Инициализация канала для получения входящих звонков ПЕРВЫМ ДЕЛОМ
      if (webrtcServiceRef.current) {
        try {
          await webrtcServiceRef.current.initializeSignalChannel()
          logger.log(`✅ [User ${user.id.slice(0, 8)}] Signal channel ready for incoming calls`)
        } catch (err) {
          logger.error('Error initializing signal channel:', err)
        }
      }

      // Загружаем профиль пользователя
      const { data: userProfile, error: userProfileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()

      let currentUserData = null
      if (!userProfileError && userProfile) {
        logger.log('initApp: Setting current user profile')
        currentUserData = {
          id: userProfile.id,
          email: userProfile.email,
          display_name: userProfile.display_name,
          avatar_url: userProfile.avatar_url,
          created_at: userProfile.created_at,
          updated_at: userProfile.updated_at,
          online: true
        }
        setCurrentUser(currentUserData)
      }

      // Загружаем контакты из localStorage
      const savedContacts = localStorage.getItem('audioCallContacts')
      if (savedContacts) {
        try {
          setContacts(JSON.parse(savedContacts))
        } catch (e) {
          logger.error('Error loading contacts:', e)
        }
      }

      // Небольшая задержка для стабильности
      await new Promise(resolve => setTimeout(resolve, 300))

      // Загружаем список всех пользователей
      logger.log('initApp: Loading users')
      if (currentUserData) {
        await loadUsers(currentUserData)
      } else {
        logger.warn('initApp: No user profile available for loading users')
      }

      // Отмечаем завершение инициализации
      initCompletedRef.current = true
      logger.log('initApp: Initialization completed')
    }

    initApp()
    const webrtcRefs: PeerRefs = {
      peerRef,
      signalBufferRef,
      keepAliveIntervalRef,
      connectionCheckIntervalRef,
      reconnectTimeoutRef,
      lastKeepAliveRef,
      reconnectAttemptsRef
    }
    webrtcServiceRef.current = new WebRTCService(webrtcRefs)

    webrtcServiceRef.current.setCallbacks({
      onStateChange: (state) => {
        setCallState(state)
        if (state === 'receiving') {
          const callerId = webrtcServiceRef.current?.getIncomingCallerId() || null
          setIncomingCallerId(callerId)
          setCurrentPeerId(callerId) // Устанавливаем собеседника при входящем звонке
          // Устанавливаем peerUserId в WebRTCService
          if (webrtcServiceRef.current && callerId) {
            webrtcServiceRef.current.setPeerUserId(callerId)
          }
          // Начальный статус микрофона будет получен через WebRTC канал при подключении
          // Peer автоматически инициализируется в WebRTCService при получении offer
          logger.log(`📞 Входящий звонок от пользователя ${callerId?.slice(0, 8)}...`)
        } else if (state === 'connected') {
          // Сохраняем информацию о собеседнике для определения currentPeerUser
          const peerId = targetUserId || incomingCallerId
          if (peerId) {
            setCurrentPeerId(peerId)
            // Устанавливаем peerUserId в WebRTCService
            if (webrtcServiceRef.current) {
              webrtcServiceRef.current.setPeerUserId(peerId)
              // Отправляем текущий статус микрофона собеседнику при подключении
              webrtcServiceRef.current.sendMuteStatus(isMuted)
              console.log(`🎤 Call connected with peer: ${peerId.slice(0, 8)}, sent current mute status: ${isMuted}`)
            }
          }
        } else if (state === 'idle') {
          // Очищаем при завершении звонка
          setCurrentPeerId(null)
          setIsStreaming(false)
          setRemoteScreenStream(null)
          // Очищаем peerUserId в WebRTCService
          if (webrtcServiceRef.current) {
            webrtcServiceRef.current.setPeerUserId(null)
          }
        }
      },
      onRemoteStream: (stream) => {
        if (remoteAudioRef.current) {
          remoteAudioRef.current.srcObject = stream
        }
      },
      onLocalStream: (stream) => {
        if (localAudioRef.current) {
          localAudioRef.current.srcObject = stream
        }
      },
      onError: (error) => {
        setError(error)
        setIncomingCallerId(null)
      },
      onRemoteMutedChange: (muted) => {
        setRemoteMuted(muted)
        console.log(`🎤 Remote mic status changed: ${muted ? 'muted' : 'unmuted'}`)
      },
      onRemoteVoiceActivityChange: (active) => {
        setRemoteVoiceActivity(active)
        // Тихое логирование - не спамим в консоль
        if (Math.random() < 0.01) { // 1% от изменений
          console.log(`🗣️ Remote voice activity: ${active ? 'speaking' : 'quiet'}`)
        }
      },
      onRemoteScreenStream: (stream) => {
        setRemoteScreenStream(stream)
        console.log(`📺 Remote screen stream: ${stream ? 'received' : 'stopped'}`)
      },
    })

    return () => {
      webrtcServiceRef.current?.disconnect()
    }
  }, [router, supabase]) // Инициализация запускается только один раз при монтировании

  // Синхронизация онлайн статуса с Supabase
  useEffect(() => {
    if (!currentUser) {
      logger.log('Online status effect: No current user, skipping')
      return
    }

    const updateOnlineStatus = async () => {
      try {
        const { error } = await supabase
          .from('profiles')
          .update({ last_seen: new Date().toISOString() })
          .eq('id', currentUser.id)

        if (error) {
          logger.warn('Failed to update online status:', error)
        }
      } catch (error) {
        logger.warn('Network error updating online status:', error)
      }
    }

    // Обновляем статус сразу при загрузке
    updateOnlineStatus()

    // И затем каждые 30 секунд
    const interval = setInterval(updateOnlineStatus, 30 * 1000) // 30 секунд

    // Также обновляем при активности пользователя
    let activityTimeout: NodeJS.Timeout

    const handleActivity = () => {
      clearTimeout(activityTimeout)
      activityTimeout = setTimeout(() => {
        updateOnlineStatus()
      }, 5000) // Обновляем через 5 секунд после последней активности
    }

    // Слушаем события активности
    document.addEventListener('mousedown', handleActivity)
    document.addEventListener('keydown', handleActivity)
    document.addEventListener('scroll', handleActivity)
    document.addEventListener('touchstart', handleActivity)

    return () => {
      clearInterval(interval)
      clearTimeout(activityTimeout)
      document.removeEventListener('mousedown', handleActivity)
      document.removeEventListener('keydown', handleActivity)
      document.removeEventListener('scroll', handleActivity)
      document.removeEventListener('touchstart', handleActivity)
    }
  }, [currentUser, supabase])

  // Realtime обновление списка пользователей (для онлайн статуса)
  useEffect(() => {
    if (!currentUser) return

    // Подписка на изменения в таблице profiles только для обновления списка пользователей
    const profilesChannel = supabase
      .channel('profiles_realtime')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'profiles'
      }, (payload) => {
        // Если изменился профиль текущего пользователя, обновляем его данные
        if (payload.new && typeof payload.new === 'object' && 'id' in payload.new && payload.new.id === currentUser.id) {
          const profileData = payload.new as User
          setCurrentUser({
            id: profileData.id || currentUser.id,
            email: profileData.email || currentUser.email,
            display_name: profileData.display_name || currentUser.display_name,
            avatar_url: profileData.avatar_url || currentUser.avatar_url,
            created_at: profileData.created_at || currentUser.created_at,
            updated_at: profileData.updated_at || currentUser.updated_at,
            online: true
          })
        }

        // Обновляем статус пользователя в списке в реальном времени
        setUsers(prevUsers => {
          const updatedUser = payload.new as User

          // Если это текущий пользователь, пропускаем (он не должен быть в списке)
          if (currentUser && updatedUser.id === currentUser.id) {
            return prevUsers
          }

          const existingUserIndex = prevUsers.findIndex(user => user.id === updatedUser.id)

          if (existingUserIndex >= 0) {
            // Обновляем существующего пользователя
            const newUsers = [...prevUsers]
            newUsers[existingUserIndex] = {
              ...newUsers[existingUserIndex],
              display_name: updatedUser.display_name || newUsers[existingUserIndex].display_name,
              avatar_url: updatedUser.avatar_url || newUsers[existingUserIndex].avatar_url,
              last_seen: updatedUser.last_seen || newUsers[existingUserIndex].last_seen,
              online: isUserOnline(updatedUser.last_seen || null)
            }
            return newUsers
          } else {
            // Добавляем нового пользователя
            return [...prevUsers, {
              id: updatedUser.id,
              email: updatedUser.email,
              display_name: updatedUser.display_name,
              avatar_url: updatedUser.avatar_url,
              last_seen: updatedUser.last_seen,
              created_at: updatedUser.created_at,
              updated_at: updatedUser.updated_at,
              online: isUserOnline(updatedUser.last_seen || null)
            }]
          }
        })
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('✅ Subscribed to profiles realtime for user updates')
        }
      })

    // Также обновляем статусы каждые 30 секунд для надежности
    const usersUpdateInterval = setInterval(() => {
      if (!isLoadingUsers && currentUser) {
        loadUsers()
      }
    }, 30 * 1000)

    return () => {
      clearInterval(usersUpdateInterval)
      supabase.removeChannel(profilesChannel)
    }
  }, [currentUser, supabase])

  // Voice Activity Detection
  useEffect(() => {
    if (callState !== 'connected') {
      setVoiceActivity({ local: false, remote: false })
      return
    }

    const audioContext = new ((window as typeof window & { webkitAudioContext?: typeof AudioContext }).AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext!)()
    let localAnalyser: AnalyserNode | null = null
    let remoteAnalyser: AnalyserNode | null = null
    let localSource: MediaStreamAudioSourceNode | null = null
    let remoteSource: MediaStreamAudioSourceNode | null = null
    let animationFrame: number
    let lastSentLocalActivity = false
    let lastSentTime = 0
    const SEND_INTERVAL = 2000 // Отправляем сигнал не чаще чем раз в 2 секунды

    const initVoiceDetection = async () => {
      try {
        // Local voice detection (microphone input)
        const localStream = webrtcServiceRef.current?.getLocalStream()
        if (localStream) {
          localSource = audioContext.createMediaStreamSource(localStream)
          localAnalyser = audioContext.createAnalyser()
          localAnalyser.fftSize = 256
          localAnalyser.smoothingTimeConstant = 0.3
          localSource.connect(localAnalyser)
        }

        // Remote voice detection (incoming audio)
        if (remoteAudioRef.current?.srcObject) {
          remoteSource = audioContext.createMediaStreamSource(remoteAudioRef.current.srcObject as MediaStream)
          remoteAnalyser = audioContext.createAnalyser()
          remoteAnalyser.fftSize = 256
          remoteAnalyser.smoothingTimeConstant = 0.3
          remoteSource.connect(remoteAnalyser)
        }

        const detectVoice = () => {
          const newVoiceActivity = { local: false, remote: false }
          const now = Date.now()

          // Check local voice
          if (localAnalyser) {
            const localDataArray = new Uint8Array(localAnalyser.frequencyBinCount)
            localAnalyser.getByteFrequencyData(localDataArray)
            const localAverage = localDataArray.reduce((a: number, b: number) => a + b) / localAnalyser.frequencyBinCount
            newVoiceActivity.local = localAverage > 15 // Lower threshold for voice detection
          }

          // Check remote voice
          if (remoteAnalyser) {
            const remoteDataArray = new Uint8Array(remoteAnalyser.frequencyBinCount)
            remoteAnalyser.getByteFrequencyData(remoteDataArray)
            const remoteAverage = remoteDataArray.reduce((a: number, b: number) => a + b) / remoteAnalyser.frequencyBinCount
            newVoiceActivity.remote = remoteAverage > 15 // Lower threshold for voice detection
          }

          // Обновляем локальное состояние без задержек
          setVoiceActivity({ local: newVoiceActivity.local, remote: remoteVoiceActivity })

          // Отправляем статус голосовой активности только если:
          // 1. Изменилось состояние активности
          // 2. Прошло достаточно времени с момента последней отправки
          if (webrtcServiceRef.current && callState === 'connected' &&
              (newVoiceActivity.local !== lastSentLocalActivity || now - lastSentTime > SEND_INTERVAL)) {
            webrtcServiceRef.current.sendVoiceActivityStatus(newVoiceActivity.local)
            lastSentLocalActivity = newVoiceActivity.local
            lastSentTime = now

            // Логируем только изменения состояния
            if (newVoiceActivity.local !== voiceActivity.local) {
              logger.log('Voice activity changed:', {
                local: newVoiceActivity.local ? 'ACTIVE' : 'quiet',
                level: localAnalyser ? (new Uint8Array(localAnalyser.frequencyBinCount).reduce((a: number, b: number) => a + b) / localAnalyser.frequencyBinCount) : 0
              })
            }
          }

          animationFrame = requestAnimationFrame(detectVoice)
        }

        detectVoice()
      } catch (error) {
        logger.warn('Voice detection initialization failed:', error)
      }
    }

    initVoiceDetection()

    return () => {
      if (animationFrame) {
        cancelAnimationFrame(animationFrame)
      }
      if (localSource) {
        localSource.disconnect()
      }
      if (remoteSource) {
        remoteSource.disconnect()
      }
      if (audioContext.state !== 'closed') {
        audioContext.close()
      }
    }
  }, [callState, voiceActivity.local]) // Добавили зависимость от voiceActivity.local

  const handleStartCall = async (userId: string) => {
    if (!userId.trim()) {
      setError('Не указан пользователь для звонка')
      return
    }
    setError(null)
    setTargetUserId(userId)
    setCurrentPeerId(userId) // Устанавливаем собеседника сразу при начале звонка
    // Устанавливаем peerUserId в WebRTCService
    if (webrtcServiceRef.current) {
      webrtcServiceRef.current.setPeerUserId(userId)
    }

    // Всегда начинаем со включенным микрофоном
    setIsMuted(false)

    await webrtcServiceRef.current?.startCall(userId)
  }

  const addContactToList = (userId: string) => {
    if (contacts.includes(userId)) return
    const newContacts = [...contacts, userId]
    setContacts(newContacts)
    localStorage.setItem('audioCallContacts', JSON.stringify(newContacts))
  }

  const removeContact = (contactId: string) => {
    const newContacts = contacts.filter(id => id !== contactId)
    setContacts(newContacts)
    localStorage.setItem('audioCallContacts', JSON.stringify(newContacts))
  }

  // Автоматическая фильтрация пользователей при изменении контактов
  React.useEffect(() => {
    if (allUsers.length > 0 && currentUser) {
      const filteredUsers = allUsers.filter((user: User) =>
        user.id !== currentUser.id && !contacts.includes(user.id)
      )
      setUsers(filteredUsers)
      logger.log('Auto-filtered users count:', filteredUsers.length)
    }
  }, [contacts, allUsers, currentUser])

  const handleEndCall = async () => {
    // Останавливаем стрим экрана если он активен
    if (isStreaming) {
      webrtcServiceRef.current?.stopScreenShare()
      setIsStreaming(false)
    }

    await webrtcServiceRef.current?.endCall()

    // Сбрасываем статус микрофона в базе данных
    if (currentUser) {
      try {
        await supabase
          .from('profiles')
          .update({ mute_status: false })
          .eq('id', currentUser.id)
      } catch (error) {
        logger.error('Error resetting mute status:', error)
      }
    }

    setTargetUserId('')
    setIncomingCallerId(null)
    setCurrentPeerId(null)
    setRemoteMuted(false)
    setRemoteScreenStream(null)
    setCallState('idle')
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  // Settings modal functions
  const openSettingsModal = () => {
    if (currentUser) {
      setSettingsUser(currentUser)
      setSettingsDisplayName(currentUser.display_name || '')
    }
    setIsSettingsModalOpen(true)
  }

  const closeSettingsModal = () => {
    setIsSettingsModalOpen(false)
    setSettingsUser(null)
    setSettingsDisplayName('')
  }

  const loadSettingsProfile = useCallback(async () => {
    if (!currentUser) return

    setSettingsLoading(true)
    try {
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', currentUser.id)
        .single()

      if (error && error.code !== 'PGRST116') { // PGRST116 = not found
        throw error
      }

      const userData: User = profile || currentUser
      setSettingsUser(userData)
      setSettingsDisplayName(userData.display_name || '')
    } catch (error) {
      logger.error('Error loading profile for settings:', error)
    } finally {
      setSettingsLoading(false)
    }
  }, [currentUser, supabase])

  const saveSettingsProfile = async () => {
    if (!settingsUser) return

    setSettingsSaving(true)
    try {
      const { error } = await supabase
        .from('profiles')
        .upsert({
          id: settingsUser.id,
          email: settingsUser.email,
          display_name: settingsDisplayName,
          avatar_url: settingsUser.avatar_url,
          updated_at: new Date().toISOString()
        })

      if (error) throw error

      // Update current user state
      setCurrentUser({
        ...settingsUser,
        display_name: settingsDisplayName
      })

      closeSettingsModal()
    } catch (error) {
      logger.error('Error saving profile:', error)
      alert('Ошибка сохранения профиля')
    } finally {
      setSettingsSaving(false)
    }
  }

  const uploadSettingsAvatar = async (file: File) => {
    if (!settingsUser) return

    setSettingsUploading(true)
    try {
      // Удаляем старый аватар если есть
      if (settingsUser.avatar_url) {
        const oldPath = settingsUser.avatar_url.split('/').pop()
        if (oldPath) {
          await supabase.storage.from('avatars').remove([`${settingsUser.id}/${oldPath}`])
        }
      }

      // Загружаем новый аватар
      const fileExt = file.name.split('.').pop()
      const fileName = `${Date.now()}.${fileExt}`
      const filePath = `${settingsUser.id}/${fileName}`

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file)

      if (uploadError) throw uploadError

      // Получаем публичный URL
      const { data } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath)

      const avatarUrl = data.publicUrl

      // Обновляем профиль
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: avatarUrl })
        .eq('id', settingsUser.id)

      if (updateError) throw updateError

      const updatedUser = { ...settingsUser, avatar_url: avatarUrl }
      setSettingsUser(updatedUser)
      setCurrentUser(updatedUser)
    } catch (error) {
      logger.error('Error uploading avatar:', error)
      alert('Ошибка загрузки аватара')
    } finally {
      setSettingsUploading(false)
    }
  }

  const handleSettingsFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      if (file.size > 2 * 1024 * 1024) { // 2MB
        alert('Файл слишком большой. Максимальный размер: 2MB')
        return
      }
      if (!file.type.startsWith('image/')) {
        alert('Пожалуйста, выберите изображение')
        return
      }
      uploadSettingsAvatar(file)
    }
  }

  // Load settings when modal opens
  useEffect(() => {
    if (isSettingsModalOpen && currentUser) {
      loadSettingsProfile()
    }
  }, [isSettingsModalOpen, currentUser, loadSettingsProfile])

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isSettingsModalOpen) {
        closeSettingsModal()
      }
    }

    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [isSettingsModalOpen])

  const createProfile = async () => {
    try {
      const response = await fetch('/api/profile', { method: 'POST' })
      const data = await response.json()

      if (response.ok) {
        alert('Профиль создан успешно!')
        loadUsers() // Перезагружаем список пользователей
      } else {
        alert('Ошибка создания профиля: ' + data.error)
      }
    } catch (error) {
      logger.error('Error creating profile:', error)
      alert('Не удалось создать профиль')
    }
  }

  const toggleMute = async () => {
    if (localAudioRef.current && localAudioRef.current.srcObject) {
      const stream = localAudioRef.current.srcObject as MediaStream
      const newMutedState = !isMuted

      // Меняем локальное состояние и audio track
      stream.getAudioTracks().forEach(track => {
        track.enabled = !newMutedState
      })
      setIsMuted(newMutedState)

      console.log(`🎤 Local mic toggled to: ${newMutedState ? 'muted' : 'unmuted'}`)
      console.log(`🔍 Current call state: ${callState}, currentPeerId: ${currentPeerId}`)

      // Отправляем статус собеседнику через WebRTC канал
      if (callState === 'connected' && webrtcServiceRef.current) {
        console.log(`🔍 WebRTC service exists, sending mute status...`)
        try {
          await webrtcServiceRef.current.sendMuteStatus(newMutedState)
          console.log(`📡 Sent mic status update to peer: ${newMutedState ? 'muted' : 'unmuted'}`)
        } catch (error) {
          console.error('❌ Error sending mic status update:', error)
        }
      } else {
        console.log(`⚠️ Cannot send mute status: callState=${callState}, webrtcService=${!!webrtcServiceRef.current}`)
      }
    }
  }

  const toggleScreenShare = async () => {
    if (!webrtcServiceRef.current) return

    try {
      if (isStreaming) {
        // Останавливаем стрим
        webrtcServiceRef.current.stopScreenShare()
        setIsStreaming(false)
        setLocalScreenStream(null)
        console.log('📺 Screen sharing stopped')
      } else {
        // Начинаем стрим
        const success = await webrtcServiceRef.current.startScreenShare()
        if (success) {
          setIsStreaming(true)
          // Получаем локальный screen стрим для отображения
          const localStream = webrtcServiceRef.current.getLocalScreenStream()
          setLocalScreenStream(localStream)
          console.log('📺 Screen sharing started')
        }
      }
    } catch (error) {
      console.error('❌ Error toggling screen share:', error)
      setError('Ошибка при переключении демонстрации экрана')
    }
  } 

  return (
    <div className="min-h-screen bg-[#1A1A1D] text-white relative">
      {/* Animated background */}
      <div className="fixed inset-0 z-0" style={{
        width: '100vw',
        height: '100vh',
        willChange: 'transform',
        backfaceVisibility: 'hidden',
        transform: 'translateZ(0)',
        contain: 'layout style paint'
      }}>
        <FloatingLines
          enabledWaves={['top', 'middle', 'bottom']}
          lineCount={[10, 15, 20]}
          lineDistance={[8, 6, 4]}
          bendRadius={5.0}
          bendStrength={-0.5}
          mouseDamping={0.03}
          interactive={true}
          parallax={true}
          parallaxStrength={0.3}
          linesGradient={['#1A1A1D', '#4E4E50', '#6F2232', '#950740', '#C3073F']}
          animationSpeed={0.8}
          mixBlendMode="screen"
        />
        </div>
      {/* Content */}
      <div className="relative z-10 px-4">
        {/* Header */}
        <Header
          currentUser={currentUser}
          loadingProfile={loadingProfile}
          onOpenSettings={openSettingsModal}
          onLogout={handleLogout}
        />

      {/* Интерфейс звонков - всегда виден */}
      <CallInterface
        callState={callState}
        currentUser={currentUser}
        users={users}
        allUsers={allUsers}
        targetUserId={targetUserId}
        incomingCallerId={incomingCallerId}
        currentPeerId={currentPeerId}
        voiceActivity={voiceActivity}
        isMuted={isMuted}
        remoteMuted={remoteMuted}
        remoteVoiceActivity={remoteVoiceActivity}
        isStreaming={isStreaming}
        onAcceptCall={() => {
          // Всегда начинаем со включенным микрофоном при ответе на звонок
          setIsMuted(false)
          webrtcServiceRef.current?.answerCall(incomingCallerId || '')
          // Не сбрасываем incomingCallerId, чтобы знать с кем разговариваем
        }}
        onRejectCall={() => {
          webrtcServiceRef.current?.endCall()
          setIncomingCallerId(null)
          setCallState('idle')
        }}
        onEndCall={handleEndCall}
        onToggleMute={toggleMute}
        onToggleScreenShare={toggleScreenShare}
      />

      {/* Аудио элементы (скрыты) */}
      <audio ref={localAudioRef} autoPlay muted className="hidden" />
      <audio ref={remoteAudioRef} autoPlay className="hidden" />

      {/* Панель управления */}
      {callState === 'idle' && (
        <UserList
          users={users}
          allUsers={allUsers}
          contacts={contacts}
          loading={loadingUsers}
          onStartCall={handleStartCall}
          onAddContact={addContactToList}
          onRemoveContact={removeContact}
          onRefreshUsers={loadUsers}
          onCreateProfile={createProfile}
        />
      )}

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsModalOpen}
        user={settingsUser}
        displayName={settingsDisplayName}
        uploading={settingsUploading}
        saving={settingsSaving}
        onClose={closeSettingsModal}
        onDisplayNameChange={setSettingsDisplayName}
        onAvatarSelect={() => settingsFileInputRef.current?.click()}
        onSave={saveSettingsProfile}
      />

      {/* Local Screen Share Display (для пользователя, который запускает стрим) */}
      <ScreenShareDisplay
        stream={localScreenStream}
        isLocal={true}
        onClose={() => {
          // При закрытии локального стрима останавливаем его
          if (isStreaming) {
            toggleScreenShare()
          }
          console.log('📺 Local screen share display closed by user')
        }}
      />

      {/* Remote Screen Share Display (для просмотра стрима собеседника) */}
      <ScreenShareDisplay
        stream={remoteScreenStream}
        isLocal={false}
        onClose={() => {
          // При закрытии окна стрима ничего не делаем,
          // стрим остановится автоматически когда собеседник остановит демонстрацию
          console.log('📺 Remote screen share display closed by user')
        }}
      />

        {/* Hidden file input for avatar upload */}
        <input
          ref={settingsFileInputRef}
          type="file"
          accept="image/*"
          onChange={handleSettingsFileSelect}
          className="hidden"
        />
        </div>
    </div>
  )
}
