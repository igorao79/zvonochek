'use client'

import { createPortal } from 'react-dom'
import Image from 'next/image'
import { User } from '@/lib/types'
import { FiX, FiUpload } from 'react-icons/fi'

interface SettingsModalProps {
  isOpen: boolean
  user: User | null
  displayName: string
  uploading: boolean
  saving: boolean
  onClose: () => void
  onDisplayNameChange: (value: string) => void
  onAvatarSelect: () => void
  onSave: () => void
}

export default function SettingsModal({
  isOpen,
  user,
  displayName,
  uploading,
  saving,
  onClose,
  onDisplayNameChange,
  onAvatarSelect,
  onSave
}: SettingsModalProps) {
  if (!isOpen) return null

  return createPortal(
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
          className="bg-[#1A1A1D] rounded-xl border border-[#4E4E50]/30 shadow-2xl max-w-md w-full max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
                <div className="p-4 border-b border-[#4E4E50]/20">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-bold text-white">Настройки профиля</h2>
                    <button
                      onClick={onClose}
                      className="cursor-pointer text-[#4E4E50] hover:text-[#C3073F] transition"
                    >
              <FiX className="w-6 h-6" />
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
                        <div className="w-16 h-16 bg-gradient-to-br from-[#6F2232] to-[#950740] rounded-full flex items-center justify-center overflow-hidden">
                  {user?.avatar_url ? (
                    <Image
                      src={user.avatar_url}
                      alt="Avatar"
                      width={64}
                      height={64}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-xl text-white">
                      {displayName.charAt(0).toUpperCase() || user?.email.charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>
                {uploading && (
                  <div className="absolute inset-0 bg-black/50 rounded-full flex items-center justify-center">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  </div>
                )}
              </div>
              <div>
                <button
                  onClick={onAvatarSelect}
                  disabled={uploading}
                          className="cursor-pointer bg-[#950740] hover:bg-[#C3073F] px-4 py-2 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed text-white"
                >
                  <FiUpload className="w-4 h-4 inline mr-2" />
                  {uploading ? 'Загрузка...' : 'Изменить аватар'}
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
                value={user?.email || ''}
                disabled
                        className="w-full px-3 py-2 bg-[#4E4E50] border border-[#6F2232] rounded-lg text-gray-300 cursor-not-allowed text-sm"
              />
              <p className="text-xs text-gray-400 mt-1">Email изменить нельзя</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-white mb-1">
                Отображаемое имя <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => onDisplayNameChange(e.target.value)}
                placeholder="Как вас будут видеть другие пользователи"
                        className="w-full px-3 py-2 bg-[#4E4E50]/20 border border-[#4E4E50]/30 rounded-lg focus:ring-2 focus:ring-[#950740] focus:border-transparent backdrop-blur-lg text-white placeholder-gray-400 text-sm"
                maxLength={50}
              />
              <p className="text-xs text-gray-400 mt-1">
                Это имя будет видно другим пользователям в списке контактов
              </p>
            </div>

          </div>

          {/* Modal Actions */}
          <div className="mt-6 flex gap-3">
            <button
              onClick={onSave}
              disabled={saving || !displayName.trim()}
                      className="cursor-pointer flex-1 bg-gradient-to-r from-[#6F2232] to-[#950740] hover:from-[#950740] hover:to-[#C3073F] px-4 py-2 rounded-lg font-semibold transition flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm"
            >
              {saving ? (
                <>
                  <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white"></div>
                  Сохранение...
                </>
              ) : (
                'Сохранить'
              )}
            </button>
            <button
              onClick={onClose}
              className="cursor-pointer bg-[#4E4E50] hover:bg-[#6F2232] px-4 py-2 rounded-lg font-semibold transition text-white text-sm"
            >
              Отмена
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
