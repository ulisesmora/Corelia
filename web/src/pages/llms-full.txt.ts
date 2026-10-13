// /llms-full.txt — todo el contenido textual del estudio para asistentes de IA
// (descripciones completas, sobre nosotros, FAQs y precios). Ver seo/llms.ts.
import { buildLlmsText } from '../seo/llms';

export const prerender = false;

export async function GET() {
  return new Response(await buildLlmsText(true), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=0, s-maxage=600' },
  });
}
