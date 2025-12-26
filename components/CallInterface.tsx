'use client'

import Image from 'next/image'
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
  voiceActivity: { local: boolean, remote: boolean }
  isMuted: boolean
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
  voiceActivity,
  isMuted,
  onAcceptCall,
  onRejectCall,
  onStartCall,
  onEndCall,
  onToggleMute
}: CallInterfaceProps) {
  const targetUser = users.find(u => u.id === targetUserId)
  const callerUser = users.find(u => u.id === incomingCallerId)

  return (
    <div className="max-w-4xl mx-auto mb-8">
      <div className={`relative p-6 rounded-2xl backdrop-blur-lg border-2 transition-all ${
      callState === 'idle' ? 'bg-[#4E4E50]/10 border-[#4E4E50]/20' :
      callState === 'calling' ? 'bg-[#950740]/20 border-[#950740]' :
      callState === 'receiving' ? 'bg-[#C3073F]/20 border-[#C3073F]' :
      'bg-[#6F2232]/20 border-[#6F2232]'
      }`}>
        <div className="flex items-center justify-center gap-6 relative z-10">
          {/* Левая сторона - пользователь */}
          <div className="flex items-center gap-3">
            <div className={`w-12 h-12 bg-gradient-to-br from-[#6F2232] to-[#950740] rounded-full flex items-center justify-center overflow-hidden transition-all duration-300 relative ${
              callState === 'connected' && voiceActivity.local ? 'ring-4 ring-[#C3073F] animate-pulse' : ''
            }`}>
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
                {callState === 'idle' && <FiPhone className="text-4xl" />}
                {callState === 'calling' && <FiPhoneCall className="text-4xl animate-pulse" />}
                {callState === 'receiving' && <FiPhoneIncoming className="text-4xl" />}
                {callState === 'connected' && <AiOutlineCheck className="text-4xl" />}
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
          <div className="flex items-center gap-3">
            <div className={`w-12 h-12 rounded-full flex items-center justify-center overflow-hidden transition-all duration-300 relative ${
              callState === 'connected' ? (voiceActivity.local || voiceActivity.remote ? 'ring-4 ring-[#C3073F] animate-pulse' : 'ring-2 ring-[#6F2232]') : ''
            }`}>
              {callState === 'idle' && (
                <div className="flex space-x-1">
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '0ms'}}></div>
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '150ms'}}></div>
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '300ms'}}></div>
                </div>
              )}
              {callState === 'receiving' && (
                <div className="flex space-x-1">
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '0ms'}}></div>
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '150ms'}}></div>
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '300ms'}}></div>
                </div>
              )}
              {callState === 'calling' && (
                targetUser?.avatar_url ? (
                  <Image
                    src={targetUser.avatar_url}
                    alt="Calling avatar"
                    width={48}
                    height={48}
                    className="w-full h-full object-cover grayscale opacity-60"
                  />
                ) : (
                  <div className="w-full h-full bg-gray-400 flex items-center justify-center">
                    <span className="text-white text-lg">
                      {(targetUser?.display_name || 'С').charAt(0).toUpperCase()}
                    </span>
                  </div>
                )
              )}
              {callState === 'connected' && (
                targetUser?.avatar_url ? (
                  <Image
                    src={targetUser.avatar_url}
                    alt="Peer avatar"
                    width={48}
                    height={48}
                    className="w-full h-full object-cover"
                  />
                ) : (
                      <div className="w-full h-full bg-gradient-to-br from-[#6F2232] to-[#950740] flex items-center justify-center">
                    <span className="text-white text-lg">
                      {(targetUser?.display_name || 'С').charAt(0).toUpperCase()}
                    </span>
                  </div>
                )
              )}
            </div>
            <div className="text-right">
              <p className="font-medium text-sm">
                {callState === 'idle' && 'Собеседник'}
                {callState === 'calling' && (targetUser?.display_name || 'Собеседник')}
                {callState === 'receiving' && `От ${callerUser?.display_name || incomingCallerId?.slice(0, 8)}...`}
                {callState === 'connected' && (targetUser?.display_name || 'Собеседник')}
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
                    onClick={onAcceptCall}
                    className="cursor-pointer bg-gradient-to-r from-[#6F2232] to-[#950740] hover:from-[#950740] hover:to-[#C3073F] px-6 py-3 rounded-xl font-semibold transition flex items-center gap-2 shadow-lg shadow-[#6F2232]/50"
                  >
                  <FiPhone className="w-5 h-5" />
                  Ответить
                </button>
                  <button
                    onClick={onRejectCall}
                    className="cursor-pointer bg-gradient-to-r from-[#4E4E50] to-[#6F2232] hover:from-[#6F2232] hover:to-[#950740] px-6 py-3 rounded-xl font-semibold transition flex items-center gap-2 shadow-lg shadow-[#4E4E50]/50"
                  >
                  <MdCallEnd className="w-5 h-5" />
                  Отклонить
                </button>
              </>
            )}

            {(callState === 'calling' || callState === 'connected') && (
              <div className="flex gap-4">
                  <button
                    onClick={onToggleMute}
                    className={`cursor-pointer ${
                      isMuted
                        ? 'bg-[#950740]/20 hover:bg-[#950740]/30 border-[#950740]'
                        : 'bg-[#4E4E50]/10 hover:bg-[#4E4E50]/20 border-[#4E4E50]/30'
                    } border-2 px-6 py-3 rounded-xl font-semibold transition flex items-center gap-2 backdrop-blur-lg`}
                  >
                  {isMuted ? <FiMicOff className="text-xl" /> : <FiMic className="text-xl" />}
                  {isMuted ? 'Включить' : 'Выключить'}
                </button>

                  <button
                    onClick={onEndCall}
                    className="cursor-pointer bg-gradient-to-r from-[#4E4E50] to-[#6F2232] hover:from-[#6F2232] hover:to-[#950740] px-6 py-3 rounded-xl font-semibold transition flex items-center gap-2 shadow-lg shadow-[#4E4E50]/50"
                  >
                  <MdCallEnd className="w-5 h-5" />
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
