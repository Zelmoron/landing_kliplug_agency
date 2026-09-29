import type { APIRoute } from 'astro';
import { getStrip } from '../data/strip';

export const GET: APIRoute = async () => {
  const { body } = await getStrip();
  return new Response(body, { headers: { 'Content-Type': 'image/webp' } });
};
