import type { Metadata } from 'next';
import { Bebas_Neue, Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
const geist = Geist({ variable: '--font-geist', subsets: ['latin'] });
const mono = Geist_Mono({ variable: '--font-mono', subsets: ['latin'] });
const display = Bebas_Neue({ variable: '--font-display', subsets: ['latin'], weight: '400' });
export const metadata: Metadata = { metadataBase: new URL('https://doomsday-protocol.jeromequeck2004.chatgpt.site'), title: 'Doomsday Protocol · Marvel Watch Tracker', description: 'An episode-exact Marvel planner with saved progress, nightly slates, and a Doomsday finish forecast.', openGraph: { title: 'Doomsday Protocol', description: 'Know what is next. Be ready for Doom.', images: ['/og.svg'] }, twitter: { card: 'summary_large_image', title: 'Doomsday Protocol', description: 'Know what is next. Be ready for Doom.', images: ['/og.svg'] } };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body className={`${geist.variable} ${mono.variable} ${display.variable}`}>{children}</body></html>; }
