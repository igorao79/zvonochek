'use client'

import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { User } from '@/lib/types'

export default function ProfilePage() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [displayName, setDisplayName] = useState('')
  const [fullName, setFullName] = useState('')
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    loadProfile()
  }, [])

  const loadProfile = async () => {
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser()
      if (!authUser) {
        router.push('/login')
        return
      }

      const { data: profile, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', authUser.id)
        .single()

      if (error && error.code !== 'PGRST116') { // PGRST116 = not found
        throw error
      }

      const userData: User = profile || {
        id: authUser.id,
        email: authUser.email || '',
        display_name: '',
        full_name: '',
        avatar_url: '',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }

      setUser(userData)
      setDisplayName(userData.display_name || '')
      setFullName(userData.full_name || '')
    } catch (error) {
      console.error('Error loading profile:', error)
      alert('Ошибка загрузки профиля')
    } finally {
      setLoading(false)
    }
  }

  const saveProfile = async () => {
    if (!user) return

    setSaving(true)
    try {
      const { error } = await supabase
        .from('profiles')
        .upsert({
          id: user.id,
          email: user.email,
          display_name: displayName,
          full_name: fullName,
          avatar_url: user.avatar_url,
          updated_at: new Date().toISOString()
        })

      if (error) throw error

      alert('Профиль сохранен!')
      router.push('/')
    } catch (error) {
      console.error('Error saving profile:', error)
      alert('Ошибка сохранения профиля')
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
            className="bg-blue-500 hover:bg-blue-600 px-6 py-2 rounded-lg"
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
          className="bg-gray-600 hover:bg-gray-700 px-4 py-2 rounded-lg transition"
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
                      {displayName.charAt(0).toUpperCase() || user.email.charAt(0).toUpperCase()}
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
                  className="bg-blue-500 hover:bg-blue-600 px-4 py-2 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
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
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Как вас будут видеть другие пользователи"
                className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent backdrop-blur-lg"
                maxLength={50}
              />
              <p className="text-xs text-gray-400 mt-1">
                Это имя будет видно другим пользователям в списке контактов
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Полное имя</label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Ваше полное имя (опционально)"
                className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent backdrop-blur-lg"
                maxLength={100}
              />
            </div>
          </div>

          {/* Actions */}
          <div className="mt-8 flex gap-4">
            <button
              onClick={saveProfile}
              disabled={saving || !displayName.trim()}
              className="flex-1 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 px-6 py-3 rounded-lg font-semibold transition flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  Сохранение...
                </>
              ) : (
                'Сохранить изменения'
              )}
            </button>
            <button
              onClick={() => router.push('/')}
              className="bg-gray-600 hover:bg-gray-700 px-6 py-3 rounded-lg font-semibold transition"
            >
              Отмена
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
