'use client'

import { use } from 'react'
import AuthForm from '@/components/AuthForm'

interface LoginPageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

export default function LoginPage({ searchParams }: LoginPageProps) {
  // Распаковываем searchParams с помощью React.use()
  const params = use(searchParams)

  // Определяем начальный режим на основе URL параметров
  const mode = params?.mode === 'register' ? 'register' : 'login'

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#1A1A1D]">
      <AuthForm initialMode={mode} />
    </div>
  )
}

