import type { Metadata } from "next";
import { Geist, Grenze } from "next/font/google";
import "./globals.css";

// Deux familles : identité fantasy pour les titres, lecture nette pour l'interface.
const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const grenze = Grenze({ weight: "800", variable: "--font-hero", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "War Seasons",
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
      className={`notranslate ${geistSans.variable} ${grenze.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
