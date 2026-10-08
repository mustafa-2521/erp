import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'Mustafa Inks ERP',
    short_name: 'Inks ERP',
    description: 'Sales, purchases, inventory and accounts for Mustafa Inks. Works offline.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    background_color: '#0F172A',
    theme_color: '#0F172A',
    categories: ['business', 'productivity'],
    icons: [
      { src: '/pwa-icon/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/pwa-icon/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/pwa-icon/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'Sales', url: '/?tab=Sales', icons: [{ src: '/pwa-icon/icon-192.png', sizes: '192x192' }] },
      { name: 'Inventory', url: '/?tab=Inventory', icons: [{ src: '/pwa-icon/icon-192.png', sizes: '192x192' }] },
    ],
  };
}
