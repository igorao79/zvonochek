'use client'

import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { User } from '@/lib/types'

export default function ProfilePage() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    loadProfile()
  }, [])

  const loadProfile = async () => {
    try {
      console.log('🔄 Загрузка профиля...')

      const { data: { user: authUser }, error: authError } = await supabase.auth.getUser()
      console.log('👤 Auth user:', {
        user: authUser,
        user_metadata: authUser?.user_metadata,
        raw_user_meta_data: authUser?.app_metadata,
        error: authError
      })

      if (authError || !authUser) {
        console.log('❌ Пользователь не аутентифицирован')
        router.push('/login')
        return
      }

      // Берем данные из auth.users raw_user_meta_data в первую очередь
      // В Supabase raw_user_meta_data доступен как app_metadata
      const displayNameFromAuth = authUser.app_metadata?.display_name ||
                                 authUser.user_metadata?.display_name ||
                                 authUser.user_metadata?.name

      console.log('🔍 Данные из auth.users:', {
        display_name: displayNameFromAuth,
        app_metadata: authUser.app_metadata,
        user_metadata: authUser.user_metadata,
        source: displayNameFromAuth ? (authUser.app_metadata?.display_name ? 'app_metadata' : 'user_metadata') : 'none'
      })

      // Также проверяем таблицу profiles для дополнительных данных (аватар)
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', authUser.id)
        .single()

      console.log('📋 Профиль из таблицы profiles:', { profile, error })

      // Приоритет: auth.users метаданные, затем profiles таблица
      const userData: User = {
        id: authUser.id,
        email: authUser.email || '',
        display_name: displayNameFromAuth || profile?.display_name || '',
        avatar_url: profile?.avatar_url || '',
        created_at: profile?.created_at || authUser.created_at || new Date().toISOString(),
        updated_at: profile?.updated_at || authUser.updated_at || new Date().toISOString()
      }

      // Если в auth.users нет метаданных, но в profiles есть - синхронизируем
      if (!displayNameFromAuth && profile?.display_name) {
        console.log('🔄 Синхронизация: копируем данные из profiles в auth.users metadata')
        try {
          await supabase.auth.updateUser({
            data: {
              display_name: profile.display_name
            }
          })
          console.log('✅ Метаданные синхронизированы')
        } catch (syncError) {
          console.warn('⚠️ Не удалось синхронизировать метаданные:', syncError)
        }
      }

      console.log('✅ Финальные данные пользователя:', {
        id: userData.id,
        email: userData.email,
        display_name: userData.display_name,
        source: displayNameFromAuth ? 'auth.users metadata' : profile ? 'profiles table' : 'default',
        hasAuthMetadata: !!displayNameFromAuth,
        hasProfile: !!profile
      })

      // Предупреждение если данные из разных источников
      if (displayNameFromAuth && profile?.display_name && displayNameFromAuth !== profile.display_name) {
        console.warn('⚠️ Несоответствие данных:', {
          auth_metadata: displayNameFromAuth,
          profiles_table: profile.display_name
        })
      }

      setUser(userData)
    } catch (error) {
      console.error('❌ Error loading profile:', error)
      alert('Ошибка загрузки профиля')
    } finally {
      setLoading(false)
    }
  }

  const saveProfile = async () => {
    if (!user) return

    console.log('🔄 Начинаем сохранение профиля:', {
      id: user.id,
      display_name: user.display_name,
      avatar_url: user.avatar_url
    })

    setSaving(true)

    try {
      // Проверяем аутентификацию
      const { data: { session }, error: sessionError } = await supabase.auth.getSession()
      console.log('🔐 Сессия:', { session: !!session, error: sessionError })

      if (sessionError || !session) {
        throw new Error('Пользователь не аутентифицирован')
      }

      // Проверяем, существует ли профиль
      const { data: existingProfile, error: checkError } = await supabase
        .from('profiles')
        .select('id, display_name')
        .eq('id', user.id)
        .single()

      console.log('📋 Существующий профиль:', { data: existingProfile, error: checkError })

      let result
      if (existingProfile) {
        // Профиль существует - обновляем
        console.log('📝 Обновляем существующий профиль...')
        result = await supabase
          .from('profiles')
        .update({
          display_name: user.display_name?.trim() || '',
          avatar_url: user.avatar_url,
          updated_at: new Date().toISOString()
        })
          .eq('id', user.id)
          .select()
      } else {
        // Профиль не существует - создаем
        console.log('🆕 Создаем новый профиль...')
        result = await supabase
          .from('profiles')
          .insert({
            id: user.id,
            email: user.email,
            display_name: user.display_name?.trim() || '',
            avatar_url: user.avatar_url
          })
          .select()
      }

      console.log('💾 Результат сохранения:', { data: result.data, error: result.error })

      if (result.error) {
        throw result.error
      }

      if (!result.data || result.data.length === 0) {
        throw new Error('Данные не были сохранены')
      }

      // Проверяем, что данные действительно сохранились
      const { data: verifyData, error: verifyError } = await supabase
        .from('profiles')
        .select('display_name')
        .eq('id', user.id)
        .single()

      console.log('✅ Проверка сохраненных данных:', { data: verifyData, error: verifyError })

      if (verifyError) {
        console.warn('⚠️ Не удалось проверить сохраненные данные:', verifyError)
      } else if (verifyData.display_name !== (user.display_name?.trim() || '')) {
        console.warn('⚠️ Display name не совпадает:', {
          expected: user.display_name?.trim() || '',
          actual: verifyData.display_name
        })
      }

      // Также обновляем raw_user_meta_data в auth.users через RPC функцию
      const { data: rpcResult, error: authUpdateError } = await supabase.rpc('update_user_metadata_admin', {
        user_id: user.id,
        display_name: user.display_name?.trim() || ''
      })

      console.log('🔄 RPC результат:', { data: rpcResult, error: authUpdateError })

      if (authUpdateError) {
        console.warn('⚠️ Не удалось обновить raw_user_meta_data через RPC:', authUpdateError)
        // Попробуем updateUser как fallback
        const { error: fallbackError } = await supabase.auth.updateUser({
          data: {
            display_name: user.display_name?.trim() || ''
          }
        })
        if (fallbackError) {
          console.warn('⚠️ Fallback (user_metadata) тоже не сработал:', fallbackError)
        } else {
          console.log('✅ user_metadata обновлены через fallback')
        }
      } else {
        console.log('✅ raw_user_meta_data обновлены в auth.users через RPC')
      }

      // Обновляем локальное состояние
      setUser({
        ...user,
        display_name: user.display_name?.trim() || ''
      })

      alert(`✅ Профиль успешно сохранен!\nОтображаемое имя: "${user.display_name?.trim() || ''}"`)

      // Не переходим сразу, даем пользователю увидеть изменения
      setTimeout(() => {
        router.push('/')
      }, 2000)

    } catch (error) {
      console.error('❌ Ошибка сохранения профиля:', error)

      let errorMessage = 'Неизвестная ошибка'
      if (error instanceof Error) {
        errorMessage = error.message
      } else if (typeof error === 'object' && error !== null && 'message' in error) {
        errorMessage = (error as any).message
      }

      alert(`❌ Ошибка сохранения профиля:\n${errorMessage}\n\nПроверьте консоль для подробностей.`)
    } finally {
      setSaving(false)
    }
  }

  const uploadAvatar = async (file: File) => {
    if (!user) return

    setUploading(true)
    try {
      // Удаляем старый аватар если есть
      if (user.avatar_url) {
        const oldPath = user.avatar_url.split('/').pop()
        if (oldPath) {
          await supabase.storage.from('avatars').remove([`${user.id}/${oldPath}`])
        }
      }

      // Загружаем новый аватар
      const fileExt = file.name.split('.').pop()
      const fileName = `${Date.now()}.${fileExt}`
      const filePath = `${user.id}/${fileName}`

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
        .eq('id', user.id)

      if (updateError) throw updateError

      setUser({ ...user, avatar_url: avatarUrl })
      alert('Аватар загружен!')
    } catch (error) {
      console.error('Error uploading avatar:', error)
      alert('Ошибка загрузки аватара')
    } finally {
      setUploading(false)
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
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
      uploadAvatar(file)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 text-white flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white"></div>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 text-white flex items-center justify-center">
        <div className="text-center">
          <p className="text-xl mb-4">Пользователь не найден</p>
          <button
            onClick={() => router.push('/login')}
            className="cursor-pointer bg-blue-500 hover:bg-blue-600 px-6 py-2 rounded-lg"
          >
            Войти
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 text-white p-4">
      {/* Header */}
      <div className="max-w-2xl mx-auto mb-8 flex justify-between items-center">
        <h1 className="text-3xl font-bold">Настройки профиля</h1>
        <button
          onClick={() => router.push('/')}
          className="cursor-pointer bg-gray-600 hover:bg-gray-700 px-4 py-2 rounded-lg transition"
        >
          Назад
        </button>
      </div>

      {/* Profile Form */}
      <div className="max-w-2xl mx-auto">
        <div className="bg-white/5 backdrop-blur-xl rounded-2xl p-8 border border-white/10">
          {/* Avatar Section */}
          <div className="mb-8">
            <h2 className="text-xl font-semibold mb-4">Аватар</h2>
            <div className="flex items-center gap-6">
              <div className="relative">
                <div className="w-24 h-24 bg-gradient-to-br from-blue-400 to-purple-400 rounded-full flex items-center justify-center overflow-hidden">
                  {user.avatar_url ? (
                    <img
                      src={user.avatar_url}
                      alt="Avatar"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-3xl text-white">
                      {user.display_name?.charAt(0).toUpperCase() || user.email.charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>
                {uploading && (
                  <div className="absolute inset-0 bg-black/50 rounded-full flex items-center justify-center">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white"></div>
                  </div>
                )}
              </div>
              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="cursor-pointer bg-blue-500 hover:bg-blue-600 px-4 py-2 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
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
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium mb-2">Email</label>
              <input
                type="email"
                value={user.email}
                disabled
                className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-gray-300 cursor-not-allowed"
              />
              <p className="text-xs text-gray-400 mt-1">Email изменить нельзя</p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                Отображаемое имя <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={user.display_name || ''}
                onChange={(e) => setUser({...user, display_name: e.target.value})}
                placeholder="Как вас будут видеть другие пользователи"
                className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent backdrop-blur-lg"
                maxLength={50}
              />
              <p className="text-xs text-gray-400 mt-1">
                Это имя будет видно другим пользователям в списке контактов
              </p>
            </div>

          </div>

          {/* Actions */}
          <div className="mt-8 flex gap-4">
            <button
              onClick={saveProfile}
              disabled={saving || !user.display_name?.trim()}
              className="cursor-pointer flex-1 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 px-6 py-3 rounded-lg font-semibold transition flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed relative"
            >
              {saving && (
                <div className="absolute inset-0 bg-green-600/20 rounded-lg animate-pulse flex items-center justify-center">
                  <div className="flex items-center gap-2 text-white">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    <span className="text-sm">Отправка в Supabase...</span>
                  </div>
                </div>
              )}
              <span className={saving ? 'opacity-50' : ''}>
                Сохранить изменения
              </span>
            </button>
            <button
              onClick={() => router.push('/')}
              className="cursor-pointer bg-gray-600 hover:bg-gray-700 px-6 py-3 rounded-lg font-semibold transition"
            >
              Отмена
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

