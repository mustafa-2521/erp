import type { NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

export const middleware = (request: NextRequest) => updateSession(request);

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.webmanifest|offline.html|pwa-icon|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
