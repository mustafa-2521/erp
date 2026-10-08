import { ImageResponse } from 'next/og';

export const dynamic = 'force-static';

const ICONS: Record<string, { size: number; pad: number; radius: number }> = {
  'icon-192.png': { size: 192, pad: 0, radius: 40 },
  'icon-512.png': { size: 512, pad: 0, radius: 108 },
  // Maskable: artwork stays inside the central safe zone and the background bleeds to the edges.
  'maskable-512.png': { size: 512, pad: 76, radius: 0 },
  'apple-180.png': { size: 180, pad: 0, radius: 0 },
};

export const generateStaticParams = () => Object.keys(ICONS).map(name => ({ name }));

export async function GET(_req: Request, { params }: { params: Promise<{ name: string }> }) {
  const spec = ICONS[(await params).name];
  if (!spec) return new Response('Not found', { status: 404 });
  const { size, pad, radius } = spec;
  const drop = (size - pad * 2) * 0.46;

  return new ImageResponse(
    <div style={{ width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0F172A', borderRadius: radius }}>
      <div style={{ width: drop, height: drop, background: '#34D399', borderRadius: '50% 0 50% 50%', transform: 'rotate(45deg)', display: 'flex' }} />
    </div>,
    { width: size, height: size, headers: { 'Cache-Control': 'public, max-age=31536000, immutable' } },
  );
}
