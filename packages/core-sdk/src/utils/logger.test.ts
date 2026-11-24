import { describe, it, expect, vi, beforeEach } from 'vitest';
import { logger, setLogLevel, getLogLevel } from './logger.js';

describe('logger', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    setLogLevel('debug');
  });

  it('round-trips the log level', () => {
    setLogLevel('error');
    expect(getLogLevel()).toBe('error');
    setLogLevel('debug');
    expect(getLogLevel()).toBe('debug');
  });

  it('emits error messages with metadata', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    logger.error('something failed', { code: 42 });
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining('stellar-privacy:error'),
      'something failed',
      expect.objectContaining({ code: 42 }),
    );
  });

  it('emits warn and info messages', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    logger.warn('careful');
    logger.info('hello');
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('stellar-privacy:warn'), 'careful');
    expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining('stellar-privacy:info'), 'hello');
  });

  it('filters out messages below the configured level', () => {
    setLogLevel('error');
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    logger.info('should be filtered');
    logger.error('should pass');
    expect(infoSpy).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('stellar-privacy:error'),
      'should pass',
    );
  });

  it('omits metadata when none is provided', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    logger.warn('bare message');
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('stellar-privacy:warn'), 'bare message');
  });
});
