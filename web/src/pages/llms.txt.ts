// /llms.txt — resumen en texto plano para asistentes de IA (ver seo/llms.ts).
import { buildLlmsText } from '../seo/llms';

export const prerender = false;

export async function GET() {
  return new Response(await buildLlmsText(false), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=0, s-maxage=600' },
  });
}
