import type { Metadata } from "next";
import { Geist, Grenze } from "next/font/google";
import "./globals.css";

// Deux familles : identité fantasy pour les titres, lecture nette pour l'interface.
const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const grenze = Grenze({ weight: "800", variable: "--font-hero", subsets: ["latin"] });

const description = "Défends ton royaume en tout temps, en tout lieu. Tower defense médiéval-fantasy sur quatre cartes saisonnières, en solo, en coop ou en duel.";

// Aperçu des liens partagés (LinkedIn, Discord…) : l'image vient de
// app/opengraph-image.jpg et app/twitter-image.jpg, en URL absolue grâce à metadataBase.
export const metadata: Metadata = {
  metadataBase: new URL("https://kcd-formes.fr"),
  title: "War Seasons",
  description,
  openGraph: {
    type: "website",
    url: "/",
    siteName: "War Seasons",
    locale: "fr_FR",
    title: "War Seasons",
    description,
  },
  twitter: { card: "summary_large_image", title: "War Seasons", description },
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
