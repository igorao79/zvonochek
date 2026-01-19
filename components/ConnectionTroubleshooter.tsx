'use client'

import React, { useState } from 'react'
import { diagnoseConnectionFailure, logNetworkDiagnostics, NetworkDiagnostics } from '@/utils/networkDiagnostics'

interface ConnectionTroubleshooterProps {
  isOpen: boolean
  onClose: () => void
}

export default function ConnectionTroubleshooter({ isOpen, onClose }: ConnectionTroubleshooterProps) {
  const [diagnostics, setDiagnostics] = useState<NetworkDiagnostics | null>(null)
  const [isRunning, setIsRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const runDiagnostics = async () => {
    setIsRunning(true)
    setError(null)
    setDiagnostics(null)

    try {
      console.log('🔍 Запуск диагностики сети...')
      const result = await diagnoseConnectionFailure()
      setDiagnostics(result)
      logNetworkDiagnostics(result)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Неизвестная ошибка'
      setError(errorMessage)
      console.error('❌ Ошибка диагностики:', err)
    } finally {
      setIsRunning(false)
    }
  }

  const getNatTypeDescription = (natType: string) => {
    switch (natType) {
      case 'open': return 'Открытая сеть (идеально для P2P)'
      case 'full-cone': return 'Full-cone NAT (хорошая совместимость)'
      case 'restricted': return 'Restricted NAT (ограниченные входящие соединения)'
      case 'port-restricted': return 'Port-restricted NAT (строгие ограничения)'
      case 'symmetric': return 'Symmetric NAT (требуется TURN сервер)'
      default: return 'Не удалось определить'
    }
  }

  const getConnectionQuality = (diagnostics: NetworkDiagnostics) => {
    if (diagnostics.packetLoss > 10 || diagnostics.latency > 300 || diagnostics.jitter > 100) {
      return { status: 'Плохое', color: 'text-red-400', icon: '❌' }
    } else if (diagnostics.packetLoss > 5 || diagnostics.latency > 150 || diagnostics.jitter > 50) {
      return { status: 'Среднее', color: 'text-yellow-400', icon: '⚠️' }
    } else {
      return { status: 'Хорошее', color: 'text-green-400', icon: '✅' }
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-[#1A1A1D] border border-gray-700 rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold text-white">Диагностика соединения</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-2xl"
          >
            ×
          </button>
        </div>

        {!diagnostics && !isRunning && (
          <div className="text-center py-8">
            <div className="text-gray-300 mb-4">
              Диагностика поможет определить проблемы с WebRTC соединением
            </div>
            <button
              onClick={runDiagnostics}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium transition-colors"
            >
              🚀 Запустить диагностику
            </button>
          </div>
        )}

        {isRunning && (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
            <div className="text-gray-300">Выполняется диагностика сети...</div>
          </div>
        )}

        {error && (
          <div className="bg-red-900 border border-red-700 text-red-200 p-4 rounded-lg mb-6">
            <div className="font-medium mb-2">❌ Ошибка диагностики:</div>
            <div>{error}</div>
          </div>
        )}

        {diagnostics && (
          <div className="space-y-6">
            {/* Общее состояние */}
            <div className="bg-gray-800 p-4 rounded-lg">
              <h3 className="text-lg font-medium text-white mb-3">Общее состояние</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-gray-400 text-sm">Качество соединения</div>
                  <div className={`text-lg font-medium ${getConnectionQuality(diagnostics).color}`}>
                    {getConnectionQuality(diagnostics).icon} {getConnectionQuality(diagnostics).status}
                  </div>
                </div>
                <div>
                  <div className="text-gray-400 text-sm">TURN серверы</div>
                  <div className={`text-lg font-medium ${diagnostics.turnAvailable ? 'text-green-400' : 'text-red-400'}`}>
                    {diagnostics.turnAvailable ? '✅ Доступны' : '❌ Недоступны'}
                  </div>
                </div>
              </div>
            </div>

            {/* Детальная информация */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Сеть и NAT */}
              <div className="bg-gray-800 p-4 rounded-lg">
                <h4 className="text-md font-medium text-white mb-3">Сеть и NAT</h4>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-gray-400">Тип NAT:</span>
                    <span className="text-white">{diagnostics.natType}</span>
                  </div>
                  <div className="text-sm text-gray-300 mt-1">
                    {getNatTypeDescription(diagnostics.natType)}
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Firewall:</span>
                    <span className={diagnostics.firewallDetected ? 'text-red-400' : 'text-green-400'}>
                      {diagnostics.firewallDetected ? 'Обнаружен' : 'Не обнаружен'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Качество соединения */}
              <div className="bg-gray-800 p-4 rounded-lg">
                <h4 className="text-md font-medium text-white mb-3">Качество соединения</h4>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-gray-400">Задержка:</span>
                    <span className="text-white">{Math.round(diagnostics.latency)}ms</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Jitter:</span>
                    <span className="text-white">{Math.round(diagnostics.jitter)}ms</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Потери пакетов:</span>
                    <span className="text-white">{Math.round(diagnostics.packetLoss)}%</span>
                  </div>
                  {diagnostics.turnLatency && (
                    <div className="flex justify-between">
                      <span className="text-gray-400">TURN задержка:</span>
                      <span className="text-white">{Math.round(diagnostics.turnLatency)}ms</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Рекомендации */}
            <div className="bg-gray-800 p-4 rounded-lg">
              <h4 className="text-md font-medium text-white mb-3">💡 Рекомендации</h4>
              <ul className="space-y-2">
                {diagnostics.recommendations.map((rec, index) => (
                  <li key={index} className="text-gray-300 flex items-start">
                    <span className="text-blue-400 mr-2">•</span>
                    {rec}
                  </li>
                ))}
              </ul>
            </div>

            {/* Повторная диагностика */}
            <div className="flex justify-center pt-4">
              <button
                onClick={runDiagnostics}
                disabled={isRunning}
                className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50"
              >
                🔄 Повторить диагностику
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
