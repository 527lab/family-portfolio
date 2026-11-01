import { site } from '../data/site';

export const GET = () =>
  new Response(site.noindex ? 'User-agent: *\nDisallow: /\n' : 'User-agent: *\nAllow: /\n', {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
