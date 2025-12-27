'use client'

import Image from 'next/image'
import { useRef, useState, useEffect } from 'react'
import { User, CallState } from '@/lib/types'
import { FiPhone, FiPhoneIncoming, FiPhoneCall, FiMic, FiMicOff } from 'react-icons/fi'
import { MdCallEnd } from 'react-icons/md'
import { AiOutlineCheck } from 'react-icons/ai'

interface CallInterfaceProps {
  callState: CallState
  currentUser: User | null
  users: User[]
  targetUserId: string
  incomingCallerId: string | null
  currentPeerId?: string | null // ID текущего собеседника
  voiceActivity: { local: boolean, remote: boolean }
  isMuted: boolean
  remoteMuted?: boolean // Статус микрофона собеседника
  onAcceptCall: () => void
  onRejectCall: () => void
  onStartCall: (userId: string) => void
  onEndCall: () => void
  onToggleMute: () => void
}

export default function CallInterface({
  callState,
  currentUser,
  users,
  targetUserId,
  incomingCallerId,
  currentPeerId,
  voiceActivity,
  isMuted,
  remoteMuted = false,
  onAcceptCall,
  onRejectCall,
  onStartCall,
  onEndCall,
  onToggleMute
}: CallInterfaceProps) {
  const [callDuration, setCallDuration] = useState(0)
  const callStartTime = useRef<number | null>(null)

  const targetUser = users.find(u => u.id === targetUserId)
  const callerUser = users.find(u => u.id === incomingCallerId)

  // Определяем ID текущего собеседника
  // Приоритет: currentPeerId (сохраненный), затем targetUserId, затем incomingCallerId
  const peerUserId = currentPeerId || targetUserId || incomingCallerId
  const currentPeerUser = users.find(u => u.id === peerUserId)


  // Таймер звонка
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null

    if (callState === 'connected') {
      if (!callStartTime.current) {
        callStartTime.current = Date.now()
      }
      interval = setInterval(() => {
        if (callStartTime.current) {
          setCallDuration(Math.floor((Date.now() - callStartTime.current) / 1000))
        }
      }, 1000)
    } else {
      if (interval) {
        clearInterval(interval)
      }
      if (callState === 'idle') {
        callStartTime.current = null
        setCallDuration(0)
      }
    }

    return () => {
      if (interval) {
        clearInterval(interval)
      }
    }
  }, [callState])

  // Форматирование времени
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  return (
    <div className="max-w-4xl mx-auto mb-6 sm:mb-8">
      <div className={`relative p-4 sm:p-6 rounded-2xl backdrop-blur-lg border-2 transition-all ${
      callState === 'idle' ? 'bg-[#4E4E50]/10 border-[#4E4E50]/20' :
      callState === 'calling' ? 'bg-[#950740]/20 border-[#950740] shadow-lg shadow-[#950740]/20' :
      callState === 'receiving' ? 'bg-[#C3073F]/20 border-[#C3073F] shadow-lg shadow-[#C3073F]/20 animate-pulse' :
      'bg-[#6F2232]/20 border-[#6F2232] shadow-lg shadow-[#6F2232]/20'
      }`}>
        {/* Статус звонка */}
        {callState !== 'idle' && (
          <div className="text-center mb-2">
            {callState !== 'connected' && (
              <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold ${
                callState === 'calling' ? 'bg-[#950740]/20 text-[#950740] border-2 border-[#950740]/40' :
                'bg-[#C3073F]/20 text-[#C3073F] border-2 border-[#C3073F]/40 animate-pulse'
              }`}>
                {callState === 'calling' && <FiPhoneCall className="w-4 h-4" />}
                {callState === 'receiving' && <FiPhoneIncoming className="w-4 h-4" />}
                <span>
                  {callState === 'calling' && 'Исходящий звонок'}
                  {callState === 'receiving' && 'Входящий звонок'}
                </span>
              </div>
            )}
            {callState === 'connected' && (
              <div className="flex flex-col items-center gap-1">
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold bg-[#6F2232]/20 text-[#6F2232] border-2 border-[#6F2232]/40">
                  <AiOutlineCheck className="w-4 h-4" />
                  <span>На связи</span>
                </div>
                <div className="text-xs text-gray-400 font-mono">
                  {formatDuration(callDuration)}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-6 relative z-10">
          {/* Левая сторона - пользователь */}
          <div className="flex flex-col items-center gap-1 sm:gap-2">
            <div className={`w-10 h-10 sm:w-12 sm:h-12 bg-gradient-to-br from-[#6F2232] to-[#950740] rounded-full flex items-center justify-center overflow-hidden transition-all duration-300 relative ${
              callState === 'connected' && voiceActivity.local ? 'ring-4 ring-[#C3073F] animate-pulse' : ''
            }`}>
              {currentUser?.avatar_url ? (
                <Image
                  src={currentUser.avatar_url}
                  alt="Your avatar"
                  width={40}
                  height={40}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-sm sm:text-lg text-white">
                  {currentUser?.display_name?.charAt(0).toUpperCase() || currentUser?.email?.charAt(0).toUpperCase()}
                </span>
              )}
              {/* Индикатор выключенного микрофона */}
              {callState === 'connected' && isMuted && (
                <div className="absolute -bottom-1 -right-1 w-4 h-4 sm:w-5 sm:h-5 bg-red-500 border-2 border-white rounded-full flex items-center justify-center">
                  <FiMicOff className="w-2 h-2 sm:w-2.5 sm:h-2.5 text-white" />
                </div>
              )}
            </div>
            <div className="text-center">
              <p className="font-medium text-xs sm:text-sm">
                {currentUser?.display_name || currentUser?.email?.split('@')[0] || 'Вы'}
              </p>
            </div>
          </div>

          {/* Волны + Центральная иконка */}
          <div className="flex-1 flex items-center justify-center relative z-10">
            <div className="flex items-center justify-center">
              {/* Левая дуга */}
              {callState === 'idle' && (
                <div
                  className="relative"
                  style={{
                    width: '60px',
                    height: '60px',
                    transform: 'rotate(225deg)'
                  }}
                >
                  {/* Первый круг (самый большой) */}
                  <div
                    className="absolute bottom-0 left-0 border-4 border-[#950740]"
                    style={{
                      width: '60px',
                      height: '60px',
                      borderRadius: '0 100% 0 0',
                      borderStyle: 'solid',
                      borderWidth: '4px 4px 0 0',
                      animation: 'wifiAnimation 4s infinite ease-in-out',
                      animationDelay: '2s'
                    }}
                  ></div>

                  {/* Второй круг */}
                  <div
                    className="absolute bottom-0 left-0 border-4 border-[#950740]"
                    style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: '0 100% 0 0',
                      borderStyle: 'solid',
                      borderWidth: '4px 4px 0 0',
                      animation: 'wifiAnimation 4s infinite ease-in-out',
                      animationDelay: '1s'
                    }}
                  ></div>

                  {/* Третий круг */}
                  <div
                    className="absolute bottom-0 left-0 border-4 border-[#950740]"
                    style={{
                      width: '24px',
                      height: '24px',
                      borderRadius: '0 100% 0 0',
                      borderStyle: 'solid',
                      borderWidth: '4px 4px 0 0',
                      animation: 'wifiAnimation 4s infinite ease-in-out',
                      animationDelay: '0s'
                    }}
                  ></div>

                  {/* Четвертый круг (центральная точка) */}
                  <div
                    className="absolute bottom-0 left-0 bg-[#C3073F]"
                    style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%'
                    }}
                  ></div>
                </div>
              )}

              {/* Центральная иконка */}
              <div className="flex items-center justify-center mx-8">
                {callState === 'idle' && <FiPhone className="text-4xl text-[#6F2232]" />}
                {callState === 'calling' && <FiPhoneCall className="text-4xl text-[#950740] animate-pulse" />}
                {callState === 'receiving' && <FiPhoneIncoming className="text-4xl text-[#C3073F] animate-bounce" />}
                {callState === 'connected' && <AiOutlineCheck className="text-4xl text-[#6F2232]" />}
              </div>

              {/* Правая дуга */}
              {callState === 'idle' && (
                <div
                  className="relative"
                  style={{
                    width: '60px',
                    height: '60px',
                    transform: 'rotate(45deg)'
                  }}
                >
                  {/* Первый круг (самый большой) */}
                  <div
                    className="absolute bottom-0 left-0 border-4 border-[#950740]"
                    style={{
                      width: '60px',
                      height: '60px',
                      borderRadius: '0 100% 0 0',
                      borderStyle: 'solid',
                      borderWidth: '4px 4px 0 0',
                      animation: 'wifiAnimation 4s infinite ease-in-out',
                      animationDelay: '2s'
                    }}
                  ></div>

                  {/* Второй круг */}
                  <div
                    className="absolute bottom-0 left-0 border-4 border-[#950740]"
                    style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: '0 100% 0 0',
                      borderStyle: 'solid',
                      borderWidth: '4px 4px 0 0',
                      animation: 'wifiAnimation 4s infinite ease-in-out',
                      animationDelay: '1s'
                    }}
                  ></div>

                  {/* Третий круг */}
                  <div
                    className="absolute bottom-0 left-0 border-4 border-[#950740]"
                    style={{
                      width: '24px',
                      height: '24px',
                      borderRadius: '0 100% 0 0',
                      borderStyle: 'solid',
                      borderWidth: '4px 4px 0 0',
                      animation: 'wifiAnimation 4s infinite ease-in-out',
                      animationDelay: '0s'
                    }}
                  ></div>

                  {/* Четвертый круг (центральная точка) */}
                  <div
                    className="absolute bottom-0 left-0 bg-[#C3073F]"
                    style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%'
                    }}
                  ></div>
                </div>
              )}
            </div>
          </div>

          {/* Правая сторона - собеседник */}
          <div className="flex flex-col items-center gap-1 sm:gap-2">
            <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center overflow-hidden transition-all duration-300 relative ${
              callState === 'connected' ? (voiceActivity.local || voiceActivity.remote ? 'ring-4 ring-[#C3073F] animate-pulse' : 'ring-2 ring-[#6F2232]') :
              callState === 'receiving' ? 'ring-2 ring-[#C3073F] animate-pulse' : ''
            }`}>
              {callState === 'idle' && (
                <div className="flex space-x-1">
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '0ms'}}></div>
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '150ms'}}></div>
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '300ms'}}></div>
                </div>
              )}
              {callState === 'receiving' && callerUser && (
                callerUser?.avatar_url ? (
                  <Image
                    src={callerUser.avatar_url}
                    alt="Caller avatar"
                    width={48}
                    height={48}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-[#C3073F] to-[#950740] flex items-center justify-center">
                    <span className="text-white text-lg">
                      {(callerUser?.display_name || 'З').charAt(0).toUpperCase()}
                    </span>
                  </div>
                )
              )}
              {callState === 'calling' && (
                currentPeerUser?.avatar_url ? (
                  <Image
                    src={currentPeerUser.avatar_url}
                    alt="Calling avatar"
                    width={48}
                    height={48}
                    className="w-full h-full object-cover grayscale opacity-60"
                  />
                ) : (
                  <div className="w-full h-full bg-gray-400 flex items-center justify-center">
                    <span className="text-white text-lg">
                      {(currentPeerUser?.display_name || 'С').charAt(0).toUpperCase()}
                    </span>
                  </div>
                )
              )}
              {callState === 'connected' && (
                currentPeerUser?.avatar_url ? (
                  <Image
                    src={currentPeerUser.avatar_url}
                    alt="Peer avatar"
                    width={48}
                    height={48}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-[#6F2232] to-[#950740] flex items-center justify-center">
                    <span className="text-white text-lg">
                      {(currentPeerUser?.display_name || 'С').charAt(0).toUpperCase()}
                    </span>
                  </div>
                )
              )}
              {/* Индикатор выключенного микрофона собеседника */}
              {callState === 'connected' && remoteMuted && (
                <div className="absolute -bottom-1 -right-1 w-4 h-4 sm:w-5 sm:h-5 bg-red-500 border-2 border-white rounded-full flex items-center justify-center">
                  <FiMicOff className="w-2 h-2 sm:w-2.5 sm:h-2.5 text-white" />
                </div>
              )}
            </div>
            <div className="text-center">
              <p className="font-medium text-xs sm:text-sm">
                {callState === 'idle' && 'Ожидание'}
                {callState === 'calling' && (currentPeerUser?.display_name || 'Звонок...')}
                {callState === 'receiving' && (currentPeerUser?.display_name || 'Входящий')}
                {callState === 'connected' && (currentPeerUser?.display_name || 'Собеседник')}
              </p>
            </div>
          </div>
        </div>

        {/* Кнопки управления - только для активных звонков */}
        {callState !== 'idle' && (
          <div className="mt-4 sm:mt-6 flex flex-col sm:flex-row justify-center gap-3 sm:gap-4">
            {callState === 'receiving' && (
              <>
                  <button
                    onClick={onAcceptCall}
                    className="cursor-pointer bg-gradient-to-r from-[#6F2232] to-[#950740] hover:from-[#950740] hover:to-[#C3073F] px-4 sm:px-6 py-2 sm:py-3 rounded-xl font-semibold transition flex items-center justify-center gap-2 shadow-lg shadow-[#6F2232]/50 text-sm sm:text-base"
                  >
                  <FiPhone className="w-4 h-4 sm:w-5 sm:h-5" />
                  Ответить
                </button>
                  <button
                    onClick={onRejectCall}
                    className="cursor-pointer bg-gradient-to-r from-[#4E4E50] to-[#6F2232] hover:from-[#6F2232] hover:to-[#950740] px-4 sm:px-6 py-2 sm:py-3 rounded-xl font-semibold transition flex items-center justify-center gap-2 shadow-lg shadow-[#4E4E50]/50 text-sm sm:text-base"
                  >
                  <MdCallEnd className="w-4 h-4 sm:w-5 sm:h-5" />
                  Отклонить
                </button>
              </>
            )}

            {(callState === 'calling' || callState === 'connected') && (
              <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 w-full sm:w-auto">
                  <button
                    onClick={onToggleMute}
                    className={`cursor-pointer ${
                      isMuted
                        ? 'bg-[#950740]/20 hover:bg-[#950740]/30 border-[#950740]'
                        : 'bg-[#4E4E50]/10 hover:bg-[#4E4E50]/20 border-[#4E4E50]/30'
                    } border-2 px-4 sm:px-6 py-2 sm:py-3 rounded-xl font-semibold transition flex items-center justify-center gap-2 backdrop-blur-lg text-sm sm:text-base`}
                  >
                  {isMuted ? <FiMicOff className="text-lg sm:text-xl" /> : <FiMic className="text-lg sm:text-xl" />}
                  {isMuted ? 'Включить' : 'Выключить'}
                </button>

                  <button
                    onClick={onEndCall}
                    className="cursor-pointer bg-gradient-to-r from-[#4E4E50] to-[#6F2232] hover:from-[#6F2232] hover:to-[#950740] px-4 sm:px-6 py-2 sm:py-3 rounded-xl font-semibold transition flex items-center justify-center gap-2 shadow-lg shadow-[#4E4E50]/50 text-sm sm:text-base"
                  >
                  <MdCallEnd className="w-4 h-4 sm:w-5 sm:h-5" />
                  Завершить
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
