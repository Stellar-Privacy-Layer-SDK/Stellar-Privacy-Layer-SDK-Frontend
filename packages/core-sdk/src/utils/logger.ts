/**
 * Minimal structured logger for the SDK.
 *
 * - Level-filtered (debug < info < warn < error)
 * - Emits JSON-style metadata alongside messages
 * - Works in browsers and Node.js
 * - Level can be set at runtime via `setLogLevel` or the `SDK_LOG_LEVEL`
 *   environment variable (dev / Node environments).
 */

import type { LogLevel } from '../types';

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const DEFAULT_LEVEL: LogLevel = 'warn';

function resolveInitialLevel(): LogLevel {
  try {
    const env = typeof process !== 'undefined' ? process.env?.SDK_LOG_LEVEL : undefined;
    if (env && env in LEVEL_ORDER) return env as LogLevel;
  } catch {
    // environment unavailable (e.g. some bundlers)
  }
  return DEFAULT_LEVEL;
}

let currentLevel: LogLevel = resolveInitialLevel();

export function setLogLevel(level: LogLevel): void {
  currentLevel = level;
}

export function getLogLevel(): LogLevel {
  return currentLevel;
}

function emit(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[currentLevel]) return;

  const prefix = `[stellar-privacy:${level}]`;
  const hasMeta = meta !== undefined && Object.keys(meta).length > 0;

  try {
    const fn = level === 'debug' ? console.debug
      : level === 'info' ? console.info
      : level === 'warn' ? console.warn
      : console.error;
    if (typeof console === 'undefined' || typeof fn !== 'function') return;
    if (hasMeta) fn(prefix, message, meta);
    else fn(prefix, message);
  } catch {
    // logging must never break application flow
  }
}

export const logger = {
  debug(message: string, meta?: Record<string, unknown>): void {
    emit('debug', message, meta);
  },
  info(message: string, meta?: Record<string, unknown>): void {
    emit('info', message, meta);
  },
  warn(message: string, meta?: Record<string, unknown>): void {
    emit('warn', message, meta);
  },
  error(message: string, meta?: Record<string, unknown>): void {
    emit('error', message, meta);
  },
};
