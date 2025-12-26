'use client'

import Image from 'next/image'
import { User } from '@/lib/types'
import { FiPhone, FiPlus, FiMinus, FiRefreshCw, FiUsers } from 'react-icons/fi'

interface UserListProps {
  users: User[]
  allUsers: User[]
  contacts: string[]
  loading: boolean
  onStartCall: (userId: string) => void
  onAddContact: (userId: string) => void
  onRemoveContact: (userId: string) => void
  onRefreshUsers: () => void
  onCreateProfile: () => void
}

export default function UserList({
  users,
  allUsers,
  contacts,
  loading,
  onStartCall,
  onAddContact,
  onRemoveContact,
  onRefreshUsers,
  onCreateProfile
}: UserListProps) {
  return (
    <div className="max-w-4xl mx-auto">
          <div className="bg-[#4E4E50]/5 backdrop-blur-xl rounded-2xl p-4 sm:p-6 md:p-8 border border-[#4E4E50]/20">
        <h2 className="text-xl sm:text-2xl font-bold mb-4 sm:mb-6 text-center">Начать звонок</h2>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-12 gap-4">
            <div className="flex items-center gap-3 text-gray-400">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[#950740]"></div>
              <span>Загрузка пользователей...</span>
            </div>
            <button
              onClick={() => window.location.reload()}
              className="cursor-pointer text-xs text-gray-500 hover:text-gray-300 underline"
              title="Если загрузка зависла, обновите страницу"
            >
              Загрузка зависла? Обновить страницу
            </button>
          </div>
        ) : (
          <>
            {/* Контакты */}
            {contacts.length > 0 && (
              <div className="mt-6 sm:mt-8">
                <h3 className="font-bold text-base sm:text-lg mb-3 sm:mb-4 flex items-center gap-2">
                  <FiPhone className="w-4 h-4 sm:w-5 sm:h-5" />
                  Мои контакты:
                </h3>
                <div className="grid grid-cols-2 xs:grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-2 sm:gap-3">
                  {contacts.map(contactId => {
                    const contactUser = allUsers.find(user => user.id === contactId)
                    return (
                      <div key={contactId} className="bg-[#4E4E50]/10 backdrop-blur-lg rounded-lg p-2 sm:p-3 border border-[#4E4E50]/30 flex flex-col items-center text-center relative">
                        {/* Кнопка удаления контакта - правый верхний угол */}
                        <button
                          onClick={() => onRemoveContact(contactId)}
                          className="cursor-pointer absolute top-1 right-1 text-gray-400 hover:text-gray-300 transition p-1 rounded-full hover:bg-white/10"
                          title="Удалить из контактов"
                        >
                          <FiMinus className="w-3 h-3" />
                        </button>

                        {/* Аватарка */}
                        <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center overflow-hidden mb-1 sm:mb-2 ${
                          contactUser?.online ? 'ring-2 ring-green-400' : ''
                        }`}>
                          {contactUser?.avatar_url ? (
                            <Image
                              src={contactUser.avatar_url}
                              alt="Avatar"
                              width={40}
                              height={40}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className={`w-full h-full flex items-center justify-center ${
                              contactUser?.online ? 'bg-green-500/20' : 'bg-gray-500/20'
                            }`}>
                              <span className="text-sm sm:text-base font-medium">
                                {(contactUser?.display_name || contactUser?.email?.split('@')[0] || 'П').charAt(0).toUpperCase()}
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Информация */}
                        <div className="mb-2 sm:mb-3 flex-1">
                          <p className="font-medium text-xs sm:text-sm truncate max-w-full">
                            {contactUser?.display_name || contactUser?.email?.split('@')[0] || 'Пользователь'}
                          </p>
                          <div className="flex items-center justify-center gap-1 mt-0.5">
                            <span className={`w-1.5 h-1.5 rounded-full ${contactUser?.online ? 'bg-green-400' : 'bg-gray-400'}`}></span>
                            <p className="text-xs text-gray-400">{contactUser?.online ? 'Онлайн' : 'Оффлайн'}</p>
                          </div>
                        </div>

                        {/* Кнопка позвонить */}
                        <button
                          onClick={() => onStartCall(contactId)}
                          className="cursor-pointer w-full bg-gradient-to-r from-[#6F2232] to-[#950740] hover:from-[#950740] hover:to-[#C3073F] px-2 py-1.5 rounded text-xs font-medium transition flex items-center justify-center gap-1 shadow-md shadow-[#6F2232]/30"
                        >
                          <FiPhone className="w-3 h-3" />
                          <span className="hidden sm:inline">Позвонить</span>
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Список всех пользователей */}
            <div className="mt-4 sm:mt-6">
                  <div className="flex items-center justify-between mb-2 sm:mb-3">
                    <h3 className="font-bold text-sm sm:text-base flex items-center gap-1 sm:gap-2">
                      <FiUsers className="w-3 h-3 sm:w-4 sm:h-4" />
                      <span className="hidden xs:inline">Все пользователи</span>
                      <span className="xs:hidden">Пользователи</span>
                    </h3>
                    <button
                      onClick={onRefreshUsers}
                      className="cursor-pointer bg-[#950740]/20 hover:bg-[#950740]/30 border border-[#950740]/30 px-2 sm:px-3 py-1 sm:py-1.5 rounded text-xs transition flex items-center gap-1 sm:gap-2"
                      title="Обновить список"
                    >
                      <FiRefreshCw className="w-3 h-3" />
                      <span className="hidden sm:inline">Обновить</span>
                    </button>
              </div>

              {users.length > 0 ? (
            <div className="grid grid-cols-2 xs:grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-2 sm:gap-3">
              {users.map(user => (
                <div key={user.id} className="bg-[#4E4E50]/10 backdrop-blur-lg rounded-lg p-2 sm:p-3 border border-[#4E4E50]/30 flex flex-col items-center text-center relative">
                  {/* Кнопка добавления в контакты - правый верхний угол */}
                  {!contacts.includes(user.id) && (
                    <button
                      onClick={() => onAddContact(user.id)}
                      className="cursor-pointer absolute top-1 right-1 text-[#950740] hover:text-[#C3073F] transition p-1 rounded-full hover:bg-white/10"
                      title="Добавить в контакты"
                    >
                      <FiPlus className="w-3 h-3" />
                    </button>
                  )}

                  {/* Аватарка */}
                  <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center overflow-hidden mb-1 sm:mb-2 ${
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
                        <span className="text-sm sm:text-base font-medium">
                          {(user.display_name || user.email.split('@')[0]).charAt(0).toUpperCase()}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Ник */}
                  <div className="mb-2 sm:mb-3">
                    <p className="font-medium text-xs sm:text-sm truncate max-w-full">
                      {user.display_name || user.email.split('@')[0]}
                    </p>
                    <div className="flex items-center justify-center gap-1 mt-0.5">
                      <span className={`w-1.5 h-1.5 rounded-full ${user.online ? 'bg-green-400' : 'bg-gray-400'}`}></span>
                      <p className="text-xs text-gray-400">{user.online ? 'Онлайн' : 'Оффлайн'}</p>
                    </div>
                  </div>

                  {/* Кнопка позвонить */}
                  <button
                    onClick={() => onStartCall(user.id)}
                    className="cursor-pointer w-full bg-gradient-to-r from-[#6F2232] to-[#950740] hover:from-[#950740] hover:to-[#C3073F] px-2 py-1.5 rounded text-xs font-medium transition flex items-center justify-center gap-1 shadow-md shadow-[#6F2232]/30"
                  >
                    <FiPhone className="w-3 h-3" />
                    <span className="hidden sm:inline">Позвонить</span>
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-400">
              <p>Пользователи не найдены</p>
            </div>
          )}
        </div>
        </>
        )}
      </div>
    </div>
  )
}
