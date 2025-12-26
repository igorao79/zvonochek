'use client'

import Image from 'next/image'
import { User } from '@/lib/types'
import { FiSettings, FiLogOut } from 'react-icons/fi'

interface HeaderProps {
  currentUser: User | null
  onOpenSettings: () => void
  onLogout: () => void
}

export default function Header({ currentUser, onOpenSettings, onLogout }: HeaderProps) {
  return (
    <div className="w-screen py-6 bg-white/5 backdrop-blur-md border-b border-white/10 shadow-xl mb-12 -mx-4">
      <div className="max-w-4xl mx-auto flex justify-between items-center">
      {/* Название приложения слева */}
      <div className="flex items-center gap-4">
        <Image
          src="/images/logo.webp"
          alt="Звоночек Logo"
          width={48}
          height={48}
          className="w-12 h-12 object-contain"
        />
        <h1 className="text-3xl font-bold bg-gradient-to-r from-[#950740] to-[#C3073F] bg-clip-text text-transparent tracking-wide">
          Звоночек
        </h1>
      </div>

      {/* Правый блок с кнопками и аватаром */}
      <div className="flex items-center gap-4">
        {/* Аватар пользователя */}
        {currentUser && (
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-[#6F2232] to-[#950740] rounded-full flex items-center justify-center overflow-hidden shadow-lg">
              {currentUser.avatar_url ? (
                <Image
                  src={currentUser.avatar_url}
                  alt="Your avatar"
                  width={40}
                  height={40}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-lg text-white font-semibold">
                  {currentUser.display_name?.charAt(0).toUpperCase() || currentUser.email?.charAt(0).toUpperCase()}
                </span>
              )}
            </div>
            <div className="hidden md:block">
              <p className="text-sm font-medium">
                {currentUser.display_name || currentUser.email?.split('@')[0]}
              </p>
              <p className="text-xs text-gray-400">Онлайн</p>
            </div>
          </div>
        )}

        {/* Кнопки */}
        <div className="flex gap-2">
          <button
            onClick={onOpenSettings}
            className="cursor-pointer bg-[#950740]/20 hover:bg-[#950740]/30 border border-[#950740] px-4 py-2 rounded-lg transition hover:shadow-lg"
          >
            <FiSettings className="w-4 h-4 inline mr-2" />
            Настройки
          </button>
          <button
            onClick={onLogout}
            className="cursor-pointer bg-[#6F2232]/20 hover:bg-[#6F2232]/30 border border-[#6F2232] px-4 py-2 rounded-lg transition hover:shadow-lg"
          >
            <FiLogOut className="w-4 h-4 inline mr-2" />
            Выйти
          </button>
        </div>
      </div>
    </div>
    </div>
  )
}
