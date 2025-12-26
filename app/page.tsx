'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import SimplePeer from 'simple-peer'
import { createPortal } from 'react-dom'
import Image from 'next/image'
import { WebRTCService, WebRTCRefs } from '@/lib/webrtc'
import { CallState, User } from '@/lib/types'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function AudioCallPage() {
  const [callState, setCallState] = useState<CallState>('idle')
  const [error, setError] = useState<string | null>(null)
  const [targetUserId, setTargetUserId] = useState<string>('')
  const [currentUser, setCurrentUser] = useState<User | null>(null)
  const [isMuted, setIsMuted] = useState(false)
  const [users, setUsers] = useState<User[]>([])
  const [incomingCallerId, setIncomingCallerId] = useState<string | null>(null)
  const [contacts, setContacts] = useState<string[]>([])
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false)

  // Settings modal state
  const [settingsUser, setSettingsUser] = useState<User | null>(null)
  const [settingsLoading, setSettingsLoading] = useState(false)
  const [settingsSaving, setSettingsSaving] = useState(false)
  const [settingsDisplayName, setSettingsDisplayName] = useState('')
  const [settingsFullName, setSettingsFullName] = useState('')
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

  const loadUsers = async () => {
    try {
      const response = await fetch('/api/users')
      const data = await response.json()

      if (response.ok) {
        setUsers(data.users || [])
      } else {
        console.error('Error loading users:', data.error)
      }
    } catch (error) {
      console.error('Error loading users:', error)
    }
  }

  useEffect(() => {
    // Инициализация пользователя и каналов
    const initApp = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }
      // Загружаем профиль пользователя
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()

      if (!profileError && profile) {
        setCurrentUser({
          id: user.id,
          email: user.email || '',
          display_name: profile.display_name,
          full_name: profile.full_name,
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
          full_name: '',
          avatar_url: '',
          created_at: user.created_at || '',
          updated_at: user.updated_at || '',
          online: true
        })
      }

      // Инициализация канала для получения входящих звонков ПЕРВЫМ ДЕЛОМ
      if (webrtcServiceRef.current) {
        try {
          await webrtcServiceRef.current.initializeSignalChannel()
          console.log(`✅ [User ${user.id.slice(0, 8)}] Signal channel ready for incoming calls`)
        } catch (err) {
          console.error('Error initializing signal channel:', err)
        }
      }

      // Загружаем контакты из localStorage
      const savedContacts = localStorage.getItem('audioCallContacts')
      if (savedContacts) {
        try {
          setContacts(JSON.parse(savedContacts))
        } catch (e) {
          console.error('Error loading contacts:', e)
        }
      }

      // Загружаем список всех пользователей
      await loadUsers()
    }

    initApp()
    const webrtcRefs: WebRTCRefs = {
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
          // Peer автоматически инициализируется в WebRTCService при получении offer
          console.log(`📞 Входящий звонок от пользователя ${callerId?.slice(0, 8)}...`)
        } else if (state === 'connected') {
          setIncomingCallerId(null)
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
    })

    return () => {
      webrtcServiceRef.current?.disconnect()
    }
  }, [router, supabase])

  const handleStartCall = async (userId: string) => {
    if (!userId.trim()) {
      setError('Не указан пользователь для звонка')
      return
    }
    setError(null)
    setTargetUserId(userId)
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

  const handleEndCall = async () => {
    await webrtcServiceRef.current?.endCall()
    setTargetUserId('')
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
      setSettingsFullName(currentUser.full_name || '')
    }
    setIsSettingsModalOpen(true)
  }

  const closeSettingsModal = () => {
    setIsSettingsModalOpen(false)
    setSettingsUser(null)
    setSettingsDisplayName('')
    setSettingsFullName('')
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
      setSettingsFullName(userData.full_name || '')
    } catch (error) {
      console.error('Error loading profile for settings:', error)
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
          full_name: settingsFullName,
          avatar_url: settingsUser.avatar_url,
          updated_at: new Date().toISOString()
        })

      if (error) throw error

      // Update current user state
      setCurrentUser({
        ...settingsUser,
        display_name: settingsDisplayName,
        full_name: settingsFullName
      })

      closeSettingsModal()
    } catch (error) {
      console.error('Error saving profile:', error)
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
      console.error('Error uploading avatar:', error)
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
      console.error('Error creating profile:', error)
      alert('Не удалось создать профиль')
    }
  }

  const toggleMute = () => {
    if (localAudioRef.current && localAudioRef.current.srcObject) {
      const stream = localAudioRef.current.srcObject as MediaStream
      stream.getAudioTracks().forEach(track => {
        track.enabled = !track.enabled
      })
      setIsMuted(!isMuted)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 text-white p-4">
      {/* Header */}
      <div className="max-w-4xl mx-auto mb-8 flex justify-between items-center">
        <div className="flex items-center gap-4">
          {currentUser && (
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-gradient-to-br from-blue-400 to-purple-400 rounded-full flex items-center justify-center overflow-hidden">
                {currentUser.avatar_url ? (
        <Image
                    src={currentUser.avatar_url}
                    alt="Your avatar"
                    width={32}
                    height={32}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="text-sm text-white">
                    {currentUser.display_name?.charAt(0).toUpperCase() || currentUser.email?.charAt(0).toUpperCase()}
                  </span>
                )}
              </div>
              <div>
                <p className="text-sm font-medium">
                  {currentUser.display_name || currentUser.email?.split('@')[0]}
                </p>
                <p className="text-xs text-gray-400">Онлайн</p>
              </div>
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={openSettingsModal}
            className="bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500 px-4 py-2 rounded-lg transition"
          >
            Настройки
          </button>
          <button
            onClick={handleLogout}
            className="bg-red-500/20 hover:bg-red-500/30 border border-red-500 px-4 py-2 rounded-lg transition"
          >
            Выйти
          </button>
        </div>
      </div>

      {/* Интерфейс звонков - всегда виден */}
      <div className="max-w-4xl mx-auto mb-8">
        <div className={`relative p-6 rounded-2xl backdrop-blur-lg border-2 transition-all ${
          callState === 'idle' ? 'bg-white/5 border-white/10' :
          callState === 'calling' ? 'bg-yellow-500/20 border-yellow-500' :
          callState === 'receiving' ? 'bg-blue-500/20 border-blue-500' :
          'bg-green-500/20 border-green-500'
        }`}>
            <div className="flex items-center justify-center gap-6 relative z-10">
            {/* Левая сторона - пользователь */}
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-gradient-to-br from-blue-400 to-purple-400 rounded-full flex items-center justify-center overflow-hidden">
                {currentUser?.avatar_url ? (
                  <Image
                    src={currentUser.avatar_url}
                    alt="Your avatar"
                    width={48}
                    height={48}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="text-lg text-white">
                    {currentUser?.display_name?.charAt(0).toUpperCase() || currentUser?.email?.charAt(0).toUpperCase()}
                  </span>
                )}
              </div>
                <div className="text-left">
                  <p className="font-medium text-sm">
                    {currentUser?.display_name || currentUser?.email?.split('@')[0] || 'Вы'}
                  </p>
                  <p className="text-xs text-gray-400">
                    {callState === 'idle' && 'Готов к звонку'}
                    {callState === 'calling' && 'Звонок...'}
                    {callState === 'receiving' && 'Ожидание'}
                    {callState === 'connected' && 'На связи'}
                  </p>
                </div>
              </div>

            {/* Волны + Центральная иконка */}
            <div className="flex-1 flex items-center justify-center relative z-10 px-4">
              {/* Левая дуга */}
              {callState === 'idle' && (
                <div
                  className="relative"
                  style={{
                    width: '60px',
                    height: '60px',
                    transform: 'rotate(-45deg) translate(-30px, -10px)'
                  }}
                >
                  {/* Первый круг (самый большой) */}
                  <div
                    className="absolute bottom-0 left-0 border-4 border-green-400"
                    style={{
                      width: '60px',
                      height: '60px',
                      borderRadius: '0 100% 0 0',
                      borderStyle: 'solid',
                      borderWidth: '4px 4px 0 0',
                      animation: 'wifiAnimation 3s infinite',
                      animationDelay: '800ms'
                    }}
                  ></div>

                  {/* Второй круг */}
                  <div
                    className="absolute bottom-0 left-0 border-4 border-green-400"
                    style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: '0 100% 0 0',
                      borderStyle: 'solid',
                      borderWidth: '4px 4px 0 0',
                      animation: 'wifiAnimation 3s infinite',
                      animationDelay: '400ms'
                    }}
                  ></div>

                  {/* Третий круг */}
                  <div
                    className="absolute bottom-0 left-0 border-4 border-green-400"
                    style={{
                      width: '24px',
                      height: '24px',
                      borderRadius: '0 100% 0 0',
                      borderStyle: 'solid',
                      borderWidth: '4px 4px 0 0',
                      animation: 'wifiAnimation 3s infinite',
                      animationDelay: '0ms'
                    }}
                  ></div>

                  {/* Четвертый круг (центральная точка) */}
                  <div
                    className="absolute bottom-0 left-0 bg-green-400"
                    style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%'
                    }}
                  ></div>
                </div>
              )}

              {/* Центральная иконка */}
              <div className="flex items-center justify-center">
                {callState === 'idle' && <span className="text-4xl">📞</span>}
                {callState === 'calling' && <span className="text-4xl animate-pulse">📞</span>}
                {callState === 'receiving' && <span className="text-4xl">📲</span>}
                {callState === 'connected' && <span className="text-4xl">✅</span>}
              </div>

              {/* Правая дуга */}
              {callState === 'idle' && (
                <div
                  className="relative"
                  style={{
                    width: '60px',
                    height: '60px',
                    transform: 'rotate(45deg) translate(30px, -10px)'
                  }}
                >
                  {/* Первый круг (самый большой) */}
                  <div
                    className="absolute bottom-0 left-0 border-4 border-green-400"
                    style={{
                      width: '60px',
                      height: '60px',
                      borderRadius: '0 100% 0 0',
                      borderStyle: 'solid',
                      borderWidth: '4px 4px 0 0',
                      animation: 'wifiAnimation 3s infinite',
                      animationDelay: '800ms'
                    }}
                  ></div>

                  {/* Второй круг */}
                  <div
                    className="absolute bottom-0 left-0 border-4 border-green-400"
                    style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: '0 100% 0 0',
                      borderStyle: 'solid',
                      borderWidth: '4px 4px 0 0',
                      animation: 'wifiAnimation 3s infinite',
                      animationDelay: '400ms'
                    }}
                  ></div>

                  {/* Третий круг */}
                  <div
                    className="absolute bottom-0 left-0 border-4 border-green-400"
                    style={{
                      width: '24px',
                      height: '24px',
                      borderRadius: '0 100% 0 0',
                      borderStyle: 'solid',
                      borderWidth: '4px 4px 0 0',
                      animation: 'wifiAnimation 3s infinite',
                      animationDelay: '0ms'
                    }}
                  ></div>

                  {/* Четвертый круг (центральная точка) */}
                  <div
                    className="absolute bottom-0 left-0 bg-green-400"
                    style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%'
                    }}
                  ></div>
                </div>
              )}
            </div>

              {/* Правая сторона - собеседник */}
              <div className="flex items-center gap-3">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center overflow-hidden transition-all duration-300 ${
                  callState === 'connected' ? 'ring-2 ring-green-400' : ''
                }`}>
                  {callState === 'idle' && (
                    <div className="flex space-x-1">
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '0ms'}}></div>
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '150ms'}}></div>
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '300ms'}}></div>
                    </div>
                  )}
                  {(callState === 'calling' || callState === 'receiving') && (
                    // Анимированные три точки
                    <div className="flex space-x-1">
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '0ms'}}></div>
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '150ms'}}></div>
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '300ms'}}></div>
                    </div>
                  )}
                  {callState === 'connected' && (
                    users.find(u => u.id === targetUserId)?.avatar_url ? (
                      <Image
                        src={users.find(u => u.id === targetUserId)?.avatar_url || ''}
                        alt="Peer avatar"
                        width={48}
                        height={48}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-green-400 to-blue-400 flex items-center justify-center">
                        <span className="text-white text-lg">
                          {(users.find(u => u.id === targetUserId)?.display_name || 'С').charAt(0).toUpperCase()}
                        </span>
                      </div>
                    )
                  )}
                </div>
                <div className="text-right">
                  <p className="font-medium text-sm">
                    {callState === 'idle' && 'Собеседник'}
                    {callState === 'calling' && 'Собеседник'}
                    {callState === 'receiving' && `От ${incomingCallerId?.slice(0, 8)}...`}
                    {callState === 'connected' && (users.find(u => u.id === targetUserId)?.display_name || 'Собеседник')}
                  </p>
                  <p className="text-xs text-gray-400">
                    {callState === 'idle' && 'Позвони мне'}
                    {callState === 'calling' && 'Вызов...'}
                    {callState === 'receiving' && 'Входящий'}
                    {callState === 'connected' && 'Подключен'}
                  </p>
                </div>
              </div>
            </div>

          {/* Кнопки управления - только для активных звонков */}
          {callState !== 'idle' && (
            <div className="mt-6 flex justify-center gap-4">
              {callState === 'receiving' && (
                <>
                  <button
                    onClick={() => {
                      webrtcServiceRef.current?.answerCall(incomingCallerId || '')
                      setIncomingCallerId(null)
                    }}
                    className="bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 px-6 py-3 rounded-xl font-semibold transition flex items-center gap-2 shadow-lg shadow-green-500/50"
                  >
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" />
                    </svg>
                    Ответить
                  </button>
                  <button
                    onClick={() => {
                      webrtcServiceRef.current?.endCall()
                      setIncomingCallerId(null)
                    }}
                    className="bg-gradient-to-r from-red-500 to-pink-500 hover:from-red-600 hover:to-pink-600 px-6 py-3 rounded-xl font-semibold transition flex items-center gap-2 shadow-lg shadow-red-500/50"
                  >
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" />
                    </svg>
                    Отклонить
                  </button>
                </>
              )}

              {(callState === 'calling' || callState === 'connected') && (
                <div className="flex gap-4">
                  <button
                    onClick={toggleMute}
                    className={`${
                      isMuted
                        ? 'bg-yellow-500/20 hover:bg-yellow-500/30 border-yellow-500'
                        : 'bg-white/10 hover:bg-white/20 border-white/30'
                    } border-2 px-6 py-3 rounded-xl font-semibold transition flex items-center gap-2 backdrop-blur-lg`}
                  >
                    <span className="text-xl">{isMuted ? '🔇' : '🎤'}</span>
                    {isMuted ? 'Включить' : 'Выключить'}
                  </button>

                  <button
                    onClick={handleEndCall}
                    className="bg-gradient-to-r from-red-500 to-pink-500 hover:from-red-600 hover:to-pink-600 px-6 py-3 rounded-xl font-semibold transition flex items-center gap-2 shadow-lg shadow-red-500/50"
                  >
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" />
                    </svg>
                    Завершить
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Аудио элементы (скрыты) */}
      <audio ref={localAudioRef} autoPlay muted className="hidden" />
      <audio ref={remoteAudioRef} autoPlay className="hidden" />


      {/* Панель управления */}
      {callState === 'idle' && (
        <div className="max-w-4xl mx-auto">
          <div className="bg-white/5 backdrop-blur-xl rounded-2xl p-8 border border-white/10">
            <h2 className="text-2xl font-bold mb-6 text-center">Начать звонок</h2>
            
            {error && (
              <div className="mt-6 bg-red-500/20 border border-red-500 text-red-200 px-6 py-4 rounded-xl backdrop-blur-lg">
                ⚠️ {error}
              </div>
            )}
            
            {/* Список пользователей */}
            {/* Контакты */}
            {contacts.length > 0 && (
              <div className="mt-8">
                <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
                  <span>📞</span> Мои контакты:
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {contacts.map(contactId => (
                    <div key={contactId} className="bg-white/10 backdrop-blur-lg rounded-xl p-4 border border-white/20">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-gradient-to-br from-blue-400 to-purple-400 rounded-full flex items-center justify-center">
                            <span className="text-lg">👤</span>
                          </div>
                          <div>
                            <p className="font-medium text-sm">Пользователь</p>
                            <p className="text-xs text-gray-400 font-mono">{contactId.slice(0, 12)}...</p>
                          </div>
                        </div>
                        <button
                          onClick={() => removeContact(contactId)}
                          className="text-red-400 hover:text-red-300 transition"
                          title="Удалить контакт"
                        >
                          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                          </svg>
                        </button>
                      </div>
                      <button
                        onClick={() => handleStartCall(contactId)}
                        disabled={callState !== 'idle'}
                        className="w-full bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 px-4 py-2 rounded-lg font-semibold transition flex items-center justify-center gap-2 text-sm shadow-lg shadow-green-500/50 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" />
                        </svg>
                        Позвонить
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Список всех пользователей */}
            <div className="mt-8">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-lg flex items-center gap-2">
                  <span>👥</span> Все пользователи
                </h3>
                <button
                  onClick={loadUsers}
                  className="bg-white/10 hover:bg-white/20 px-4 py-2 rounded-lg text-sm transition"
                >
                  Обновить
                </button>
              </div>

              {users.length > 0 ? (
                <div className="grid gap-3">
                  {users.map(user => (
                    <div key={user.id} className="bg-white/10 backdrop-blur-lg rounded-xl p-4 border border-white/20">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center overflow-hidden ${
                            user.online ? 'ring-2 ring-green-400' : ''
                          }`}>
                            {user.avatar_url ? (
                              <Image
                                src={user.avatar_url}
                                alt="Avatar"
                                width={40}
                                height={40}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className={`w-full h-full flex items-center justify-center ${
                                user.online ? 'bg-green-500/20' : 'bg-gray-500/20'
                              }`}>
                                <span className="text-lg">
                                  {(user.display_name || user.email.split('@')[0]).charAt(0).toUpperCase()}
                                </span>
                              </div>
                            )}
                          </div>
                          <div>
                            <p className="font-medium text-sm">
                              {user.display_name || user.email.split('@')[0]}
                            </p>
                            <div className="flex items-center gap-2">
                              <span className={`w-2 h-2 rounded-full ${user.online ? 'bg-green-400' : 'bg-gray-400'}`}></span>
                              <p className="text-xs text-gray-400">{user.online ? 'Онлайн' : 'Оффлайн'}</p>
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          {contacts.includes(user.id) ? (
                            <button
                              onClick={() => removeContact(user.id)}
                              className="text-red-400 hover:text-red-300 transition p-1"
                              title="Удалить из контактов"
                            >
                              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                              </svg>
                            </button>
                          ) : (
                            <button
                              onClick={() => addContactToList(user.id)}
                              className="text-blue-400 hover:text-blue-300 transition p-1"
                              title="Добавить в контакты"
                            >
                              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                <path d="M8 9a3 3 0 100-6 3 3 0 000 6zM8 11a6 6 0 016 6H2a6 6 0 016-6zM16 7a1 1 0 10-2 0v1h-1a1 1 0 100 2h1v1a1 1 0 102 0v-1h1z" />
                              </svg>
                            </button>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={(e) => {
                          e.preventDefault()
                          handleStartCall(user.id)
                        }}
                        disabled={callState !== 'idle'}
                        className="w-full bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 px-4 py-2 rounded-lg font-semibold transition flex items-center justify-center gap-2 text-sm shadow-lg shadow-green-500/50 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" />
                        </svg>
                        Позвонить
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <div className="bg-yellow-500/20 border border-yellow-500 rounded-xl p-6 max-w-md mx-auto">
                    <p className="text-yellow-200 mb-4">Пользователи не найдены. Возможно, нужно настроить базу данных.</p>
                    <div className="flex gap-2 justify-center">
                      <button
                        onClick={createProfile}
                        className="bg-blue-500 hover:bg-blue-600 px-4 py-2 rounded-lg text-sm transition"
                      >
                        Создать мой профиль
                      </button>
                      <button
                        onClick={loadUsers}
                        className="bg-white/10 hover:bg-white/20 px-4 py-2 rounded-lg text-sm transition"
                      >
                        Обновить список
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

          </div>
        </div>
      )}

      {/* Settings Modal */}
      {isSettingsModalOpen && createPortal(
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={closeSettingsModal}
        >
          <div
            className="bg-gradient-to-br from-slate-900 to-purple-900 rounded-xl border border-white/20 shadow-2xl max-w-md w-full max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {settingsLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
              </div>
            ) : settingsUser ? (
              <>
                {/* Modal Header */}
                <div className="p-4 border-b border-white/10">
                  <div className="flex justify-between items-center">
                    <h2 className="text-xl font-bold text-white">Настройки профиля</h2>
                    <button
                      onClick={closeSettingsModal}
                      className="text-gray-400 hover:text-white transition"
                    >
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>

                {/* Modal Content */}
                <div className="p-4">
                  {/* Avatar Section */}
                  <div className="mb-6">
                    <h3 className="text-lg font-semibold text-white mb-3">Аватар</h3>
                    <div className="flex items-center gap-4">
                      <div className="relative">
                        <div className="w-16 h-16 bg-gradient-to-br from-blue-400 to-purple-400 rounded-full flex items-center justify-center overflow-hidden">
                          {settingsUser.avatar_url ? (
                            <Image
                              src={settingsUser.avatar_url}
                              alt="Avatar"
                              width={64}
                              height={64}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <span className="text-xl text-white">
                              {settingsDisplayName.charAt(0).toUpperCase() || settingsUser.email.charAt(0).toUpperCase()}
                            </span>
                          )}
                        </div>
                        {settingsUploading && (
                          <div className="absolute inset-0 bg-black/50 rounded-full flex items-center justify-center">
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                          </div>
                        )}
                      </div>
                      <div>
                        <input
                          ref={settingsFileInputRef}
                          type="file"
                          accept="image/*"
                          onChange={handleSettingsFileSelect}
                          className="hidden"
                        />
                        <button
                          onClick={() => settingsFileInputRef.current?.click()}
                          disabled={settingsUploading}
                          className="bg-blue-500 hover:bg-blue-600 px-4 py-2 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed text-white"
                        >
                          {settingsUploading ? 'Загрузка...' : 'Изменить аватар'}
                        </button>
                        <p className="text-sm text-gray-400 mt-2">
                          Максимальный размер: 2MB<br />
                          Форматы: JPG, PNG, GIF
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Profile Info */}
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-white mb-1">Email</label>
                      <input
                        type="email"
                        value={settingsUser.email}
                        disabled
                        className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-300 cursor-not-allowed text-sm"
                      />
                      <p className="text-xs text-gray-400 mt-1">Email изменить нельзя</p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-white mb-1">
                        Отображаемое имя <span className="text-red-400">*</span>
                      </label>
                      <input
                        type="text"
                        value={settingsDisplayName}
                        onChange={(e) => setSettingsDisplayName(e.target.value)}
                        placeholder="Как вас будут видеть другие пользователи"
                        className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent backdrop-blur-lg text-white placeholder-gray-400 text-sm"
                        maxLength={50}
                      />
                      <p className="text-xs text-gray-400 mt-1">
                        Это имя будет видно другим пользователям в списке контактов
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-white mb-1">Полное имя</label>
                      <input
                        type="text"
                        value={settingsFullName}
                        onChange={(e) => setSettingsFullName(e.target.value)}
                        placeholder="Ваше полное имя (опционально)"
                        className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent backdrop-blur-lg text-white placeholder-gray-400 text-sm"
                        maxLength={100}
                      />
                    </div>
                  </div>

                  {/* Modal Actions */}
                  <div className="mt-6 flex gap-3">
                    <button
                      onClick={saveSettingsProfile}
                      disabled={settingsSaving || !settingsDisplayName.trim()}
                      className="flex-1 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 px-4 py-2 rounded-lg font-semibold transition flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm"
                    >
                      {settingsSaving ? (
                        <>
                          <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white"></div>
                          Сохранение...
                        </>
                      ) : (
                        'Сохранить'
                      )}
                    </button>
                    <button
                      onClick={closeSettingsModal}
                      className="bg-gray-600 hover:bg-gray-700 px-4 py-2 rounded-lg font-semibold transition text-white text-sm"
                    >
                      Отмена
                    </button>
                  </div>
                </div>
              </>
            ) : null}
          </div>
        </div>,
        document.body
      )}

    </div>
  )
}
