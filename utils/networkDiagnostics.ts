'use client'

/**
 * Диагностика сетевых проблем для WebRTC соединений
 * Проверяет NAT, firewall и качество интернет-соединения
 */

export interface NetworkDiagnostics {
  natType: 'unknown' | 'open' | 'full-cone' | 'restricted' | 'port-restricted' | 'symmetric'
  firewallDetected: boolean
  latency: number
  jitter: number
  packetLoss: number
  recommendations: string[]
}

// Основная функция диагностики
export const diagnoseConnectionFailure = async (): Promise<NetworkDiagnostics> => {
  console.log('🔍 Начинаем диагностику сети...')

  const diagnostics: NetworkDiagnostics = {
    natType: 'unknown',
    firewallDetected: false,
    latency: 0,
    jitter: 0,
    packetLoss: 0,
    recommendations: []
  }

  try {
    // Проверка качества соединения
    const connectionQuality = await testConnectionQuality()
    diagnostics.latency = connectionQuality.latency
    diagnostics.jitter = connectionQuality.jitter
    diagnostics.packetLoss = connectionQuality.packetLoss

    // Проверка NAT типа
    const natResult = await detectNATType()
    diagnostics.natType = natResult.natType
    diagnostics.firewallDetected = natResult.firewallDetected

    // Генерация рекомендаций
    diagnostics.recommendations = generateRecommendations(diagnostics)

    console.log('📊 Результаты диагностики:', diagnostics)
    return diagnostics

  } catch (error) {
    console.error('Ошибка при диагностике сети:', error)
    diagnostics.recommendations = [
      'Проверьте подключение к интернету',
      'Попробуйте перезагрузить роутер',
      'Временно отключите firewall/антивирус'
    ]
    return diagnostics
  }
}

// Тестирование качества соединения
const testConnectionQuality = async (): Promise<{latency: number, jitter: number, packetLoss: number}> => {
  const results: number[] = []
  const testCount = 10

  for (let i = 0; i < testCount; i++) {
    try {
      const start = performance.now()
      // Используем Google DNS для теста
      await fetch('https://8.8.8.8/', {
        method: 'HEAD',
        mode: 'no-cors',
        cache: 'no-cache'
      })
      const end = performance.now()
      results.push(end - start)
    } catch (error) {
      console.warn(`Тест ${i + 1} провален:`, error)
    }

    // Задержка между тестами
    await new Promise(resolve => setTimeout(resolve, 200))
  }

  if (results.length === 0) {
    return { latency: 0, jitter: 0, packetLoss: 100 }
  }

  const latency = results.reduce((a, b) => a + b) / results.length
  const jitter = calculateJitter(results)
  const packetLoss = ((testCount - results.length) / testCount) * 100

  return { latency, jitter, packetLoss }
}

// Расчет jitter (вариации задержки)
const calculateJitter = (latencies: number[]): number => {
  if (latencies.length < 2) return 0

  const diffs: number[] = []
  for (let i = 1; i < latencies.length; i++) {
    diffs.push(Math.abs(latencies[i] - latencies[i - 1]))
  }

  return diffs.reduce((a, b) => a + b) / diffs.length
}

// Определение типа NAT
const detectNATType = async (): Promise<{natType: NetworkDiagnostics['natType'], firewallDetected: boolean}> => {
  try {
    // Простая проверка STUN сервера
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    })

    let natType: NetworkDiagnostics['natType'] = 'unknown'
    const firewallDetected = false

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        pc.close()
        resolve({ natType: 'restricted', firewallDetected: true })
      }, 5000)

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          const candidate = event.candidate.candidate

          // Анализ типа кандидата
          if (candidate.includes('srflx')) {
            natType = 'full-cone'
          } else if (candidate.includes('relay')) {
            natType = 'symmetric'
          } else if (candidate.includes('host')) {
            natType = 'open'
          }

          clearTimeout(timeout)
          pc.close()
          resolve({ natType, firewallDetected })
        }
      }

      pc.createDataChannel('test')
      pc.createOffer().then(offer => pc.setLocalDescription(offer))
    })

  } catch (error) {
    console.warn('Не удалось определить тип NAT:', error)
    return { natType: 'unknown', firewallDetected: true }
  }
}

// Генерация рекомендаций на основе диагностики
const generateRecommendations = (diagnostics: NetworkDiagnostics): string[] => {
  const recommendations: string[] = []

  // Рекомендации по качеству соединения
  if (diagnostics.latency > 200) {
    recommendations.push('Высокая задержка (>200мс). Используйте проводное подключение')
  }

  if (diagnostics.jitter > 50) {
    recommendations.push('Высокий jitter (>50мс). Проверьте стабильность интернета')
  }

  if (diagnostics.packetLoss > 5) {
    recommendations.push('Потери пакетов (>5%). Проверьте подключение к интернету')
  }

  // Рекомендации по NAT/Firewall
  switch (diagnostics.natType) {
    case 'symmetric':
      recommendations.push('Symmetric NAT обнаружен. Рекомендуется TURN сервер')
      break
    case 'restricted':
    case 'port-restricted':
      recommendations.push('Restricted NAT. Попробуйте другой браузер или сеть')
      break
    case 'unknown':
      recommendations.push('Не удалось определить тип NAT. Проверьте firewall')
      break
  }

  if (diagnostics.firewallDetected) {
    recommendations.push('Firewall блокирует соединения. Временно отключите firewall')
  }

  // Общие рекомендации
  if (recommendations.length === 0) {
    recommendations.push('Соединение выглядит стабильным. Проверьте собеседника')
  } else {
    recommendations.push('Перезагрузите роутер и попробуйте снова')
    recommendations.push('Используйте VPN если проблема сохраняется')
  }

  return recommendations
}

// Функция для логирования диагностики в консоль
export const logNetworkDiagnostics = (diagnostics: NetworkDiagnostics) => {
  console.group('🌐 Диагностика сети')
  console.log('📊 NAT тип:', diagnostics.natType)
  console.log('🔥 Firewall:', diagnostics.firewallDetected ? 'Обнаружен' : 'Не обнаружен')
  console.log('⏱️ Задержка:', `${Math.round(diagnostics.latency)}ms`)
  console.log('📈 Jitter:', `${Math.round(diagnostics.jitter)}ms`)
  console.log('📦 Потери пакетов:', `${Math.round(diagnostics.packetLoss)}%`)

  console.group('💡 Рекомендации:')
  diagnostics.recommendations.forEach(rec => console.log('•', rec))
  console.groupEnd()
  console.groupEnd()
}
