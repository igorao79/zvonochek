'use client'

import React, { useRef, useEffect, useState, useCallback } from 'react'
import { FiX, FiMaximize, FiMinimize, FiMove } from 'react-icons/fi'

interface ScreenShareDisplayProps {
  stream: MediaStream | null
  onClose?: () => void
  isLocal?: boolean // Флаг для локального просмотра стрима
}

export default function ScreenShareDisplay({ stream, onClose, isLocal = false }: ScreenShareDisplayProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [isMinimized, setIsMinimized] = useState(true)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })

  // Инициализация позиции после монтирования компонента
  useEffect(() => {
    setPosition({
      x: window.innerWidth - 340,
      y: window.innerHeight - 284
    })
  }, [])

  useEffect(() => {
    const videoElement = videoRef.current
    if (!videoElement) return

    if (stream) {
      videoElement.srcObject = stream
      videoElement.play().catch(console.error)
      console.log(`📺 ${isLocal ? 'Local' : 'Remote'} screen video started playing`)
    } else {
      videoElement.srcObject = null
      console.log(`📺 ${isLocal ? 'Local' : 'Remote'} screen video stopped`)
    }

    return () => {
      if (videoElement.srcObject) {
        videoElement.srcObject = null
      }
    }
  }, [stream, isLocal])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!isMinimized) return
    setIsDragging(true)
    setDragStart({
      x: e.clientX - position.x,
      y: e.clientY - position.y
    })
    e.preventDefault()
  }, [isMinimized, position])

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging) return
    const newX = Math.max(0, Math.min(window.innerWidth - 320, e.clientX - dragStart.x))
    const newY = Math.max(0, Math.min(window.innerHeight - 240, e.clientY - dragStart.y))
    setPosition({ x: newX, y: newY })
  }, [isDragging, dragStart])

  const handleMouseUp = useCallback(() => {
    setIsDragging(false)
  }, [])

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      return () => {
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
      }
    }
  }, [isDragging, handleMouseMove, handleMouseUp])

  if (!stream) return null

  return (
    <>
      {/* Миниатюрный режим */}
      {isMinimized && (
        <div
          className={`fixed z-50 cursor-${isDragging ? 'grabbing' : 'grab'} transition-none`}
          style={{
            left: position.x,
            top: position.y,
            width: '320px',
            height: '240px'
          }}
          onMouseDown={handleMouseDown}
        >
          <div className="relative bg-black rounded-lg overflow-hidden shadow-2xl w-full h-full">
            <div className="absolute top-2 left-2 z-10">
              <FiMove className="w-4 h-4 text-white/70" />
            </div>
            <div className="absolute top-2 right-2 z-10 flex gap-2">
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setIsMinimized(false)
                }}
                className="bg-black/50 hover:bg-black/70 text-white p-1.5 rounded-full transition-colors"
              >
                <FiMaximize className="w-3 h-3" />
              </button>
              {onClose && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onClose()
                  }}
                  className="bg-black/50 hover:bg-black/70 text-white p-1.5 rounded-full transition-colors"
                >
                  <FiX className="w-3 h-3" />
                </button>
              )}
            </div>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              controls={false}
              muted={isLocal}
              className="w-full h-full object-cover"
              style={{ backgroundColor: 'black' }}
              onPlay={() => {
                console.log(`📺 ${isLocal ? 'Local' : 'Remote'} screen video started playing`)
              }}
              onError={(e) => {
                console.error('📺 Screen video error:', e)
              }}
            />
            <div className="absolute bottom-2 left-2 bg-black/50 text-white px-2 py-1 rounded text-xs font-medium">
              {isLocal ? 'Ваш стрим' : 'Демонстрация экрана'}
            </div>
          </div>
        </div>
      )}

      {/* Полноэкранный режим */}
      {!isMinimized && (
        <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="relative w-full max-w-6xl max-h-full bg-black rounded-lg overflow-hidden shadow-2xl">
            <div className="absolute top-4 right-4 z-10 flex gap-2">
              <button
                onClick={() => setIsMinimized(true)}
                className="bg-black/50 hover:bg-black/70 text-white p-2 rounded-full transition-colors"
              >
                <FiMinimize className="w-4 h-4" />
              </button>
              {onClose && (
                <button
                  onClick={onClose}
                  className="bg-black/50 hover:bg-black/70 text-white p-2 rounded-full transition-colors"
                >
                  <FiX className="w-4 h-4" />
                </button>
              )}
            </div>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              controls={false}
              muted={isLocal}
              className="w-full h-auto max-h-[80vh] object-contain"
              style={{ backgroundColor: 'black' }}
              onPlay={() => {
                console.log(`📺 ${isLocal ? 'Local' : 'Remote'} screen video started playing`)
              }}
              onError={(e) => {
                console.error('📺 Screen video error:', e)
              }}
            />
            <div className="absolute bottom-4 left-4 bg-black/50 text-white px-3 py-1 rounded-full text-sm font-medium">
              {isLocal ? 'Ваш стрим' : 'Демонстрация экрана'}
            </div>
          </div>
        </div>
      )}
    </>
  )
}