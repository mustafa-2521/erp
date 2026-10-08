import './globals.css';
import type { Metadata, Viewport } from 'next';
import { Fira_Code, Fira_Sans } from 'next/font/google';
import { PwaRegister } from '@/components/pwa-register';

const sans = Fira_Sans({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-sans', display: 'swap' });
const mono = Fira_Code({ subsets: ['latin'], weight: ['500', '600'], variable: '--font-mono', display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'Mustafa Inks ERP', template: '%s · Mustafa Inks ERP' },
  description: 'Manufacturing ERP for sales, purchases, inventory and accounts. Works offline.',
  applicationName: 'Mustafa Inks ERP',
  appleWebApp: { capable: true, title: 'Inks ERP', statusBarStyle: 'black-translucent' },
  formatDetection: { telephone: false },
  icons: { icon: '/pwa-icon/icon-192.png', apple: '/pwa-icon/apple-180.png' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  colorScheme: 'light dark',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#0F172A' },
    { media: '(prefers-color-scheme: dark)', color: '#0B1120' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        {/* Apply the saved theme before first paint to avoid a light/dark flash. */}
        <script dangerouslySetInnerHTML={{ __html: "try{var t=localStorage.getItem('theme');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}" }} />
      </head>
      <body>
        <a href="#main" className="skip-link">Skip to content</a>
        {children}
        <PwaRegister />
      </body>
    </html>
  );
}
