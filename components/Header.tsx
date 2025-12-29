'use client'

import Image from 'next/image'
import { User } from '@/lib/types'
import { FiSettings, FiLogOut } from 'react-icons/fi'
import { useEffect, useState } from 'react'

interface HeaderProps {
  currentUser: User | null
  loadingProfile?: boolean
  onOpenSettings: () => void
  onLogout: () => void
}

export default function Header({ currentUser, loadingProfile = false, onOpenSettings, onLogout }: HeaderProps) {
  const [showRealContent, setShowRealContent] = useState(false)

  // Задержка появления реального контента после загрузки данных
  useEffect(() => {
    // Устанавливаем с задержкой только когда пользователь загружен
    if (currentUser && !loadingProfile) {
      const timer = setTimeout(() => {
        setShowRealContent(true)
      }, 1000) // 1 секунда задержки

      return () => clearTimeout(timer)
    }
  }, [currentUser, loadingProfile])
  return (
    <div className="w-screen py-3 sm:py-4 md:py-6 bg-white/5 backdrop-blur-md border-b border-white/10 shadow-xl mb-8 md:mb-12 -mx-4">
      <div className="max-w-4xl mx-auto px-4 flex justify-between items-center">
      {/* Название приложения слева */}
      <div className="flex items-center gap-2 sm:gap-3 md:gap-4">
        <Image
          src="/images/logo.webp"
          alt="Звоночек Logo"
          width={32}
          height={32}
          className="w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 object-contain"
        />
        <h1 className="text-xl sm:text-2xl md:text-3xl font-bold bg-gradient-to-r from-[#950740] to-[#C3073F] bg-clip-text text-transparent tracking-wide">
          Звоночек
        </h1>
      </div>

      {/* Правый блок с кнопками и аватаром */}
      <div className="flex items-center gap-2 sm:gap-3 md:gap-4">
        {/* Аватар пользователя */}
        <div className="relative">
          {/* Skeleton - показывается пока загружается или не прошло время задержки */}
          {(loadingProfile || !currentUser || !showRealContent) && (
            <div className={`flex items-center gap-2 sm:gap-3 transition-opacity duration-500 ${showRealContent ? 'opacity-0 absolute inset-0' : 'opacity-100'}`}>
              <div className="w-8 h-8 sm:w-9 sm:h-9 md:w-10 md:h-10 bg-gray-300 rounded-full animate-pulse shadow-lg"></div>
              <div className="flex flex-col space-y-1">
                <div className="w-16 h-3 bg-gray-300 rounded animate-pulse"></div>
                <div className="w-12 h-2 bg-gray-300 rounded animate-pulse"></div>
              </div>
            </div>
          )}

          {/* Реальный контент - появляется поэтапно после задержки */}
          {currentUser && showRealContent && (
            <div className="flex items-center gap-2 sm:gap-3">
              {/* Аватар - появляется первым */}
              <div className="w-8 h-8 sm:w-9 sm:h-9 md:w-10 md:h-10 bg-gradient-to-br from-[#6F2232] to-[#950740] rounded-full flex items-center justify-center overflow-hidden shadow-lg animate-fadeInAvatar">
                {currentUser.avatar_url ? (
                  <Image
                    src={currentUser.avatar_url}
                    alt="Your avatar"
                    width={32}
                    height={32}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="text-sm sm:text-base md:text-lg text-white font-semibold">
                    {currentUser.display_name?.charAt(0).toUpperCase() || currentUser.email?.charAt(0).toUpperCase()}
                  </span>
                )}
              </div>

              {/* Текст - появляется с задержкой */}
              <div className="hidden md:flex flex-col space-y-1 animate-fadeInText">
                <p className="text-sm font-medium">
                  {currentUser.display_name || currentUser.email?.split('@')[0]}
                </p>
                <p className="text-xs text-gray-400">Онлайн</p>
              </div>
            </div>
          )}
        </div>

        {/* Кнопки */}
        <div className="flex gap-1 sm:gap-2">
          <button
            onClick={onOpenSettings}
            className="cursor-pointer bg-[#950740]/20 hover:bg-[#950740]/30 border border-[#950740] px-2 py-1 rounded-lg transition hover:shadow-lg flex items-center justify-center gap-1 min-w-[32px] h-8"
          >
            <FiSettings className="w-4 h-4 flex-shrink-0" />
            <span className="hidden xs:inline text-sm">Настройки</span>
          </button>
          <button
            onClick={onLogout}
            className="cursor-pointer bg-[#6F2232]/20 hover:bg-[#6F2232]/30 border border-[#6F2232] px-2 py-1 rounded-lg transition hover:shadow-lg flex items-center justify-center gap-1 min-w-[32px] h-8"
          >
            <FiLogOut className="w-4 h-4 flex-shrink-0" />
            <span className="hidden xs:inline text-sm">Выйти</span>
          </button>
        </div>
      </div>
    </div>
    </div>
  )
}
