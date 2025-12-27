'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { logger } from '@/lib/logger'

interface AuthFormProps {
  initialMode?: 'login' | 'register'
}

export default function AuthForm({ initialMode = 'login' }: AuthFormProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isSignUp, setIsSignUp] = useState(initialMode === 'register')
  const [showEmailModal, setShowEmailModal] = useState(false)
  const [emailExists, setEmailExists] = useState(false)
  const [displayNameExists, setDisplayNameExists] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  // Валидация email
  const validateEmail = async (email: string) => {
    if (!email) return false

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id')
        .eq('email', email)
        .single()

      if (error && error.code !== 'PGRST116') { // PGRST116 = not found
        logger.error('Error checking email:', error)
        // Если нет подключения к Supabase, считаем email валидным
        setEmailExists(false)
        return true
      }

      setEmailExists(!!data)
      return !data // true если email свободен
    } catch (err) {
      logger.error('Email validation error:', err)
      // При ошибке сети считаем email валидным
      setEmailExists(false)
      return true
    }
  }

  // Валидация display name
  const validateDisplayName = async (displayName: string) => {
    if (!displayName) return false

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id')
        .eq('display_name', displayName)
        .single()

      if (error && error.code !== 'PGRST116') { // PGRST116 = not found
        logger.error('Error checking display name:', error)
        // Если нет подключения к Supabase, считаем display name валидным
        setDisplayNameExists(false)
        return true
      }

      setDisplayNameExists(!!data)
      return !data // true если display name свободен
    } catch (err) {
      logger.error('Display name validation error:', err)
      // При ошибке сети считаем display name валидным
      setDisplayNameExists(false)
      return true
    }
  }

  // Debounced валидация
  useEffect(() => {
    if (isSignUp && email) {
      const timeoutId = setTimeout(() => validateEmail(email), 500)
      return () => clearTimeout(timeoutId)
    } else {
      setEmailExists(false)
    }
  }, [email, isSignUp])

  useEffect(() => {
    if (isSignUp && displayName) {
      const timeoutId = setTimeout(() => validateDisplayName(displayName), 500)
      return () => clearTimeout(timeoutId)
    } else {
      setDisplayNameExists(false)
    }
  }, [displayName, isSignUp])

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      if (isSignUp) {
        // Проверяем валидность перед отправкой
        const emailValid = await validateEmail(email)
        const displayNameValid = await validateDisplayName(displayName)

        if (!emailValid) {
          throw new Error('Этот email уже зарегистрирован')
        }

        if (!displayNameValid) {
          throw new Error('Это имя уже используется')
        }

        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback`,
            data: {
              display_name: displayName,
            },
          },
        })
        if (error) throw error
        setShowEmailModal(true)
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        })
        if (error) throw error
        router.push('/')
        router.refresh()
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const isFormValid = () => {
    if (!email || !password) return false
    if (isSignUp) {
      if (!displayName) return false
      if (emailExists || displayNameExists) return false
    }
    return true
  }

  return (
    <>
      <div className="bg-[#4E4E50]/10 backdrop-blur-lg p-6 sm:p-8 rounded-2xl border border-[#4E4E50]/30 shadow-2xl w-full max-w-md">
        <h1 className="text-2xl sm:text-3xl font-bold text-center mb-2 bg-gradient-to-r from-[#950740] to-[#C3073F] bg-clip-text text-transparent">
          {isSignUp ? 'Регистрация' : 'Вход'}
        </h1>
        <p className="text-center text-gray-400 mb-6 text-sm sm:text-base">
          {isSignUp
            ? 'Создайте аккаунт для видеозвонков'
            : 'Войдите для начала видеозвонков'}
        </p>

        <form onSubmit={handleAuth} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-1">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className={`w-full px-4 py-3 bg-[#4E4E50]/20 border rounded-lg backdrop-blur-lg text-white placeholder-gray-400 transition ${
                email && isSignUp && emailExists
                  ? 'border-red-500 focus:ring-red-500 focus:border-red-500'
                  : 'border-[#4E4E50]/30 focus:ring-[#950740] focus:border-[#950740]'
              }`}
              placeholder="your@email.com"
            />
            {email && isSignUp && emailExists && (
              <p className="text-red-400 text-xs mt-1">Этот email уже зарегистрирован</p>
            )}
          </div>

          {isSignUp && (
            <div>
              <label htmlFor="displayName" className="block text-sm font-medium text-gray-300 mb-1">
                Отображаемое имя
              </label>
              <input
                id="displayName"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                required
                maxLength={50}
                className={`w-full px-4 py-3 bg-[#4E4E50]/20 border rounded-lg backdrop-blur-lg text-white placeholder-gray-400 transition ${
                  displayName && displayNameExists
                    ? 'border-red-500 focus:ring-red-500 focus:border-red-500'
                    : 'border-[#4E4E50]/30 focus:ring-[#950740] focus:border-[#950740]'
                }`}
                placeholder="Как вас будут видеть другие пользователи"
              />
              {displayName && displayNameExists && (
                <p className="text-red-400 text-xs mt-1">Это имя уже используется</p>
              )}
            </div>
          )}

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-300 mb-1">
              Пароль
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="w-full px-4 py-3 bg-[#4E4E50]/20 border border-[#4E4E50]/30 rounded-lg focus:ring-2 focus:ring-[#950740] focus:border-[#950740] backdrop-blur-lg text-white placeholder-gray-400 transition"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <div className="bg-red-500/20 border border-red-500/30 text-red-300 px-4 py-3 rounded-lg text-sm backdrop-blur-lg">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !isFormValid()}
            className="cursor-pointer w-full bg-gradient-to-r from-[#6F2232] to-[#950740] hover:from-[#950740] hover:to-[#C3073F] disabled:from-gray-600 disabled:to-gray-700 text-white font-semibold py-3 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-[#6F2232]/50"
          >
            {loading ? 'Загрузка...' : isSignUp ? 'Зарегистрироваться' : 'Войти'}
          </button>
        </form>

        <div className="mt-6 text-center">
          <button
            onClick={() => {
              setIsSignUp(!isSignUp)
              setError(null)
              setEmailExists(false)
              setDisplayNameExists(false)
            }}
            className="cursor-pointer text-[#950740] hover:text-[#C3073F] font-medium text-sm transition"
          >
            {isSignUp ? 'Уже есть аккаунт? Войти' : 'Нет аккаунта? Зарегистрироваться'}
          </button>
        </div>
      </div>

      {/* Модальное окно для подтверждения email */}
      {showEmailModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#4E4E50]/10 backdrop-blur-lg p-6 sm:p-8 rounded-2xl border border-[#4E4E50]/30 shadow-2xl w-full max-w-md">
            <div className="flex flex-col items-center mb-3 sm:mb-4">
              <Image
                src="/images/favicon.ico"
                alt="Звоночек"
                width={48}
                height={48}
                className="w-12 h-12 mb-2"
              />
              <h2 className="text-xl sm:text-2xl font-bold text-center bg-gradient-to-r from-[#950740] to-[#C3073F] bg-clip-text text-transparent">
                Почта отправлена!
              </h2>
            </div>
            <p className="text-center text-gray-300 mb-4 sm:mb-6 text-sm sm:text-base">
              Проверьте вашу почту и перейдите по ссылке для подтверждения регистрации.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={() => setShowEmailModal(false)}
                className="cursor-pointer flex-1 bg-[#6F2232]/20 hover:bg-[#6F2232]/30 border border-[#6F2232]/30 text-gray-300 hover:text-white font-semibold py-3 rounded-lg transition order-2 sm:order-1"
              >
                Понятно
              </button>
              <button
                onClick={() => {
                  setShowEmailModal(false)
                  setIsSignUp(false)
                }}
                className="cursor-pointer flex-1 bg-gradient-to-r from-[#6F2232] to-[#950740] hover:from-[#950740] hover:to-[#C3073F] text-white font-semibold py-3 rounded-lg transition shadow-lg shadow-[#6F2232]/50 order-1 sm:order-2"
              >
                Войти
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
