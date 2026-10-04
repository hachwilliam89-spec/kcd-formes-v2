import type { Metadata } from "next";
import { Alegreya, Geist, Geist_Mono, Grenze, MedievalSharp, Pixelify_Sans } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Polices pixel-art / médiévale du HUD (voir globals.css : .font-pixel / .font-med).
const medievalSharp = MedievalSharp({
  weight: "400",
  variable: "--font-med",
  subsets: ["latin"],
});

const pixelifySans = Pixelify_Sans({
  variable: "--font-pixel",
  subsets: ["latin"],
});

// Titres (Grenze, entre romain et gothique) et textes de présentation (Alegreya) :
// plus lisibles que la police pixel en grand ou en phrases.
const grenze = Grenze({
  weight: "800",
  variable: "--font-hero",
  subsets: ["latin"],
});

const alegreya = Alegreya({
  weight: "500",
  variable: "--font-prose",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "4 War Seasons",
  description: "Quatre saisons, un royaume à défendre. Tower defense fantasy en solo, coopération et versus.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="fr"
      translate="no"
      className={`notranslate ${geistSans.variable} ${geistMono.variable} ${medievalSharp.variable} ${pixelifySans.variable} ${grenze.variable} ${alegreya.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
