'use client'

import Image from 'next/image'
import { User } from '@/lib/types'
import { FiSettings, FiLogOut, FiWifi } from 'react-icons/fi'
// useState and useLayoutEffect are not used in this component

interface HeaderProps {
  currentUser: User | null
  loadingProfile?: boolean
  onOpenSettings: () => void
  onOpenTroubleshooter: () => void
  onLogout: () => void
}

export default function Header({ currentUser, loadingProfile = false, onOpenSettings, onOpenTroubleshooter, onLogout }: HeaderProps) {
  // Управление появлением профиля - используем useMemo вместо state для избежания лишних ререндеров
  const showRealContent = currentUser && !loadingProfile
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
                    priority
                    placeholder="blur"
                    blurDataURL="data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzIiIGhlaWdodD0iMzIiIHZpZXdCb3g9IjAgMCAzMiAzMiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iMTYiIGN5PSIxNiIgcj0iMTYiIGZpbGw9IiM0RTFFNTAiLz4KPHN2ZyB3aWR0aD0iMTIiIGhlaWdodD0iMTIiIHZpZXdCb3g9IjAgMCAxMiAxMiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIiB4PSI2IiB5PSI2Ij4KPGNpcmNsZSBjeD0iNiIgY3k9IjUiIHI9IjEiIGZpbGw9IiM2RjIyMzIiLz4KPHBhdGggZD0iTTYgOWM0IDAgOC0yIDgtN3MtNC03LTgtN3oiIGZpbGw9IiM2RjIyMzIiLz4KPC9zdmc+Cjwvc3ZnPgo8L3N2Zz4K"
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
            onClick={onOpenTroubleshooter}
            className="cursor-pointer bg-blue-600/20 hover:bg-blue-600/30 border border-blue-600 px-2 py-1 rounded-lg transition hover:shadow-lg flex items-center justify-center gap-1 min-w-[32px] h-8"
            title="Диагностика соединения"
          >
            <FiWifi className="w-4 h-4 flex-shrink-0" />
            <span className="hidden xs:inline text-sm">Диагностика</span>
          </button>
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
