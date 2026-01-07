'use client'

import Image from 'next/image'
import { User } from '@/lib/types'

interface AvatarProps {
  user: User | null
  size?: 'sm' | 'md' | 'lg' | 'xl'
  priority?: boolean
  className?: string
  alt?: string
  showFallback?: boolean
  fallbackClassName?: string
}

const sizeMap = {
  sm: { width: 32, height: 32, className: 'w-8 h-8' },
  md: { width: 40, height: 40, className: 'w-10 h-10 sm:w-12 sm:h-12' },
  lg: { width: 48, height: 48, className: 'w-12 h-12' },
  xl: { width: 64, height: 64, className: 'w-16 h-16' }
}

const blurDataURLs = {
  sm: "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzIiIGhlaWdodD0iMzIiIHZpZXdCb3g9IjAgMCAzMiAzMiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iMTYiIGN5PSIxNiIgcj0iMTYiIGZpbGw9IiM0RTFFNTAiLz4KPHN2ZyB3aWR0aD0iMTIiIGhlaWdodD0iMTIiIHZpZXdCb3g9IjAgMCAxMiAxMiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIiB4PSI2IiB5PSI2Ij4KPGNpcmNsZSBjeD0iNiIgY3k9IjUiIHI9IjEiIGZpbGw9IiM2RjIyMzIiLz4KPHBhdGggZD0iTTYgOWM0IDAgOC0yIDgtN3MtNC03LTgtN3oiIGZpbGw9IiM2RjIyMzIiLz4KPC9zdmc+Cjwvc3ZnPgo8L3N2Zz4K",
  md: "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iMjAiIGN5PSIyMCIgcj0iMjAiIGZpbGw9IiM0RTFFNTAiLz4KPHN2ZyB3aWR0aD0iMTYiIGhlaWdodD0iMTYiIHZpZXdCb3g9IjAgMCAxNiAxNiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIiB4PSI4IiB5PSI4Ij4KPGNpcmNsZSBjeD0iOCIgY3k9IjciIHI9IjEiIGZpbGw9IiM2RjIyMzIiLz4KPHBhdGggZD0iOCA5YzQgMCAxMC0yIDEwLTdzLTYtNy0xMC03eiIgZmlsbD0iIzZGMjIzMiIvPgo8L3N2Zz4KPC9zdmc+Cg==",
  lg: "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDgiIGhlaWdodD0iNDgiIHZpZXdCb3g9IjAgMCA0OCA0OCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iMjQiIGN5PSIyNCIgcj0iMjQiIGZpbGw9IiM0RTFFNTAiLz4KPHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHZpZXdCb3g9IjAgMCAyMCAyMCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIiB4PSI4IiB5PSI4Ij4KPGNpcmNsZSBjeD0iMTAiIGN5PSI5IiByPSIxIiBmaWxsPSIjNkYyMjMyIi8+CjxwYXRoIGQ9Ik0xMCAxNGM0IDAgMTAtMiAxMC04cy02LTgtMTAtOHoiIGZpbGw9IiM2RjIyMzIiLz4KPC9zdmc+Cjwvc3ZnPgo8L3N2Zz4K",
  xl: "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjQiIGhlaWdodD0iNjQiIHZpZXdCb3g9IjAgMCA2NCA2NCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iMzIiIGN5PSIzMiIgcj0iMzIiIGZpbGw9IiM0RTFFNTAiLz4KPHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIiB4PSIyMCIgeT0iMjAiPgo8Y2lyY2xlIGN4PSIxMiIgY3k9IjEwIiByPSIyIiBmaWxsPSIjNkYyMjMyIi8+CjxwYXRoIGQ9Ik0xMiAxNWM0IDAgOC0yIDgtN3MtNC03LTgtN3oiIGZpbGw9IiM2RjIyMzIiLz4KPC9zdmc+Cjwvc3ZnPgo8L3N2Zz4K"
}

export default function Avatar({
  user,
  size = 'md',
  priority = false,
  className = '',
  alt = 'Avatar',
  showFallback = true,
  fallbackClassName = ''
}: AvatarProps) {
  const sizeConfig = sizeMap[size]

  if (!user) {
    return showFallback ? (
      <div className={`bg-gradient-to-br from-[#6F2232] to-[#950740] rounded-full flex items-center justify-center overflow-hidden ${sizeConfig.className} ${className}`}>
        <span className={`text-white font-semibold ${fallbackClassName}`}>
          ?
        </span>
      </div>
    ) : null
  }

  return (
    <div className={`bg-gradient-to-br from-[#6F2232] to-[#950740] rounded-full flex items-center justify-center overflow-hidden ${sizeConfig.className} ${className}`}>
      {user.avatar_url ? (
        <Image
          src={user.avatar_url}
          alt={alt}
          width={sizeConfig.width}
          height={sizeConfig.height}
          className="w-full h-full object-cover"
          priority={priority}
          placeholder="blur"
          blurDataURL={blurDataURLs[size]}
        />
      ) : (
        <span className={`text-white font-semibold ${fallbackClassName}`}>
          {(user.display_name || user.email || '?').charAt(0).toUpperCase()}
        </span>
      )}
    </div>
  )
}

