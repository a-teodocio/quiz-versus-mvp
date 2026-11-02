import { describe, expect, it } from 'vitest';
import { DEFAULT_MAX_ROOMS, DEFAULT_PORT } from './defaults.js';
import { ConfigError, loadConfig } from './server-config.js';

describe('loadConfig', () => {
  it('uses the defaults when nothing is set', () => {
    const config = loadConfig({}, '/work');
    expect(config.port).toBe(DEFAULT_PORT);
    expect(config.host).toBe('127.0.0.1');
    expect(config.maxRooms).toBe(DEFAULT_MAX_ROOMS);
    expect(config.contentRoot).toBe('/work/content');
    expect(config.allowedOrigins).toEqual([]);
  });

  it('reads settings from the environment', () => {
    const config = loadConfig(
      {
        PORT: '0',
        HOST: '0.0.0.0',
        CONTENT_ROOT: '/data',
        ALLOWED_ORIGINS: 'http://localhost:5173, https://quiz.example',
        MAX_ROOMS: '3',
      },
      '/work',
    );
    expect(config).toMatchObject({ port: 0, host: '0.0.0.0', contentRoot: '/data', maxRooms: 3 });
    expect(config.allowedOrigins).toEqual(['http://localhost:5173', 'https://quiz.example']);
  });

  it.each([
    ['PORT', 'eighty'],
    ['PORT', '-1'],
    ['PORT', '80.5'],
    ['MAX_ROOMS', '0'],
    ['IDLE_ROOM_MS', '0'],
  ])('refuses %s=%s instead of guessing', (name, value) => {
    expect(() => loadConfig({ [name]: value }, '/work')).toThrow(ConfigError);
  });
});
