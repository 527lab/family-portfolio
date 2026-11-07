import { afterEach, describe, expect, it } from 'vitest';
import { clientIp, safeNext } from '../../src/server/http.ts';

describe('safeNext（登入後導回，防 open redirect）', () => {
  it('允許 /studio 底下的站內路徑', () => {
    expect(safeNext('/studio')).toBe('/studio');
    expect(safeNext('/studio/')).toBe('/studio/');
    expect(safeNext('/studio/new/')).toBe('/studio/new/');
    expect(safeNext('/studio/works/3/?a=1')).toBe('/studio/works/3/?a=1');
  });
  it('空值與非 /studio 路徑一律回到 /studio/', () => {
    for (const v of [null, undefined, '', '/', '/login/', '/studiox', '/studio-evil/', 'studio/']) {
      expect(safeNext(v), String(v)).toBe('/studio/');
    }
  });
  it('外部網址與協定相對網址不被接受', () => {
    for (const v of ['https://evil.example/studio/', '//evil.example/studio/', '//studio/', 'javascript:alert(1)', 'http://localhost/studio/']) {
      expect(safeNext(v), v).toBe('/studio/');
    }
  });
});

describe('clientIp（限流用來源 IP）', () => {
  const saved = process.env.TRUST_PROXY;
  afterEach(() => {
    if (saved === undefined) delete process.env.TRUST_PROXY;
    else process.env.TRUST_PROXY = saved;
  });
  const req = (h: Record<string, string> = {}) => new Request('http://localhost/login/', { headers: h });

  it('未啟用 TRUST_PROXY 時忽略 CF-Connecting-IP，避免被偽造來繞過限流', () => {
    delete process.env.TRUST_PROXY;
    expect(clientIp(req({ 'cf-connecting-ip': '1.2.3.4' }), '10.0.0.1')).toBe('10.0.0.1');
    expect(clientIp(req({ 'cf-connecting-ip': '1.2.3.4' }))).toBe('unknown');
  });
  it('TRUST_PROXY=true 時採用 CF-Connecting-IP，缺少時退回連線位址', () => {
    process.env.TRUST_PROXY = 'true';
    expect(clientIp(req({ 'cf-connecting-ip': '1.2.3.4' }), '10.0.0.1')).toBe('1.2.3.4');
    expect(clientIp(req(), '10.0.0.1')).toBe('10.0.0.1');
    expect(clientIp(req())).toBe('unknown');
  });
});

describe('configWarnings', () => {
  it('https 但沒設 TRUST_PROXY 時警告；設了或本機開發時不警告', async () => {
    const { configWarnings } = await import('../../src/server/config.ts');
    expect(configWarnings({ SITE_URL: 'https://a.example.com' }).length).toBe(1);
    expect(configWarnings({ SITE_URL: 'https://a.example.com', TRUST_PROXY: 'true' })).toEqual([]);
    expect(configWarnings({ SITE_URL: 'http://localhost:8080' })).toEqual([]);
  });
});
