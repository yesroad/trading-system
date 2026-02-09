import { nowIso } from './date.js';

type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

interface LogEntry {
  level: LogLevel;
  service: string;
  message: string;
  timestamp: string;
  data?: unknown;
}

export class Logger {
  constructor(private serviceName: string) {}

  private log(level: LogLevel, message: string, data?: unknown) {
    const entry: LogEntry = {
      level,
      service: this.serviceName,
      message,
      timestamp: nowIso(),
      data,
    };

    const formatted = JSON.stringify(entry);

    switch (level) {
      case 'DEBUG':
      case 'INFO':
        console.log(formatted);
        break;
      case 'WARN':
        console.warn(formatted);
        break;
      case 'ERROR':
        console.error(formatted);
        break;
    }
  }

  debug(message: string, data?: unknown) {
    this.log('DEBUG', message, data);
  }

  info(message: string, data?: unknown) {
    this.log('INFO', message, data);
  }

  warn(message: string, data?: unknown) {
    this.log('WARN', message, data);
  }

  error(message: string, error?: unknown) {
    const errorData =
      error instanceof Error ? { message: error.message, stack: error.stack } : error;
    this.log('ERROR', message, errorData);
  }
}

export function createLogger(serviceName: string): Logger {
  return new Logger(serviceName);
}
