'use client'

import Image from 'next/image'
import { User } from '@/lib/types'
import { FiPhone, FiPlus, FiMinus, FiRefreshCw, FiUser, FiUsers } from 'react-icons/fi'

interface UserListProps {
  users: User[]
  contacts: string[]
  onStartCall: (userId: string) => void
  onAddContact: (userId: string) => void
  onRemoveContact: (userId: string) => void
  onRefreshUsers: () => void
  onCreateProfile: () => void
}

export default function UserList({
  users,
  contacts,
  onStartCall,
  onAddContact,
  onRemoveContact,
  onRefreshUsers,
  onCreateProfile
}: UserListProps) {
  return (
    <div className="max-w-4xl mx-auto">
          <div className="bg-[#4E4E50]/5 backdrop-blur-xl rounded-2xl p-8 border border-[#4E4E50]/20">
        <h2 className="text-2xl font-bold mb-6 text-center">Начать звонок</h2>

        {/* Контакты */}
        {contacts.length > 0 && (
          <div className="mt-8">
            <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
              <FiPhone className="w-5 h-5" />
              Мои контакты:
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {contacts.map(contactId => (
                    <div key={contactId} className="bg-[#4E4E50]/10 backdrop-blur-lg rounded-xl p-4 border border-[#4E4E50]/30">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-gradient-to-br from-blue-400 to-purple-400 rounded-full flex items-center justify-center">
                        <FiUser className="w-6 h-6 text-white" />
                      </div>
                      <div>
                        <p className="font-medium text-sm">Пользователь</p>
                        <p className="text-xs text-gray-400 font-mono">{contactId.slice(0, 12)}...</p>
                      </div>
                    </div>
                        <button
                          onClick={() => onRemoveContact(contactId)}
                          className="cursor-pointer text-[#C3073F] hover:text-[#950740] transition"
                          title="Удалить контакт"
                        >
                      <FiMinus className="w-5 h-5" />
                    </button>
                  </div>
                      <button
                        onClick={() => onStartCall(contactId)}
                        className="cursor-pointer w-full bg-gradient-to-r from-[#6F2232] to-[#950740] hover:from-[#950740] hover:to-[#C3073F] px-4 py-2 rounded-lg font-semibold transition flex items-center justify-center gap-2 text-sm shadow-lg shadow-[#6F2232]/50"
                      >
                    <FiPhone className="w-4 h-4" />
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
                  <FiUsers className="w-5 h-5 inline mr-2" />
                  Все пользователи
                </h3>
                <button
                  onClick={onRefreshUsers}
                  className="cursor-pointer bg-[#950740]/20 hover:bg-[#950740]/30 border border-[#950740]/30 px-4 py-2 rounded-lg text-sm transition flex items-center gap-2"
                >
                  <FiRefreshCw className="w-4 h-4" />
                  Обновить
                </button>
          </div>

          {users.length > 0 ? (
            <div className="grid gap-3">
              {users.map(user => (
                    <div key={user.id} className="bg-[#4E4E50]/10 backdrop-blur-lg rounded-xl p-4 border border-[#4E4E50]/30">
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
                              onClick={() => onRemoveContact(user.id)}
                              className="cursor-pointer text-[#C3073F] hover:text-[#950740] transition p-1"
                              title="Удалить из контактов"
                            >
                          <FiMinus className="w-4 h-4" />
                        </button>
                      ) : (
                            <button
                              onClick={() => onAddContact(user.id)}
                              className="cursor-pointer text-[#950740] hover:text-[#C3073F] transition p-1"
                              title="Добавить в контакты"
                            >
                          <FiPlus className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => onStartCall(user.id)}
                    className="cursor-pointer w-full bg-gradient-to-r from-[#6F2232] to-[#950740] hover:from-[#950740] hover:to-[#C3073F] px-4 py-2 rounded-lg font-semibold transition flex items-center justify-center gap-2 text-sm shadow-lg shadow-[#6F2232]/50"
                  >
                    <FiPhone className="w-4 h-4" />
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
                    onClick={onCreateProfile}
                    className="bg-blue-500 hover:bg-blue-600 px-4 py-2 rounded-lg text-sm transition"
                  >
                    Создать мой профиль
                  </button>
                  <button
                    onClick={onRefreshUsers}
                    className="cursor-pointer bg-[#950740]/20 hover:bg-[#950740]/30 border border-[#950740]/30 px-4 py-2 rounded-lg text-sm transition"
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
  )
}
