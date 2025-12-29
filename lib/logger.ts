/**
 * Logger utility that only logs in development mode
 * Prevents console logs from appearing in production
 */

type LogLevel = 'log' | 'warn' | 'error'

class Logger {
  private isDev = process.env.NODE_ENV === 'development'

  private shouldLog(level: LogLevel): boolean {
    // Always log errors, but only log/warn in development
    return level === 'error' || this.isDev
  }

  log(...args: any[]): void {
    if (this.shouldLog('log')) {
      console.log(...args)
    }
  }

  warn(...args: any[]): void {
    if (this.shouldLog('warn')) {
      console.warn(...args)
    }
  }

  error(...args: any[]): void {
    if (this.shouldLog('error')) {
      console.error(...args)
    }
  }
}

export const logger = new Logger()


