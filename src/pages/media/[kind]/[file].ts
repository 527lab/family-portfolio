import type { APIRoute } from 'astro';
import { FILE_RE, mediaPath, serveFile, type MediaKind } from '../../../server/media';
import { canManage, findWorkByFile } from '../../../server/works';

const TYPES: Record<string, string> = { webp: 'image/webp', mp4: 'video/mp4', webm: 'video/webm' };

export const GET: APIRoute = async ({ params, request, locals }) => {
  const kind = params.kind as MediaKind;
  const file = params.file ?? '';
  if (!['images', 'thumbs', 'videos'].includes(kind) || !FILE_RE.test(file)) return new Response('Not found', { status: 404 });
  // 只有已公開作品的檔案能被任何人讀取；草稿的檔案只有作者／管理員可以
  const work = findWorkByFile(kind, file);
  if (!work) return new Response('Not found', { status: 404 });
  const isPublic = work.status === 'published';
  if (!isPublic && !canManage(locals.user, work)) return new Response('Not found', { status: 404 });
  return serveFile(request, mediaPath(kind, file), TYPES[file.split('.')[1]], isPublic ? 'public, max-age=3600' : 'private, no-store');
};
