import type { Metadata } from "next";
import {
  Cinzel,
  Cormorant_Garamond,
  Inter,
  JetBrains_Mono,
} from "next/font/google";
import "@rainbow-me/rainbowkit/styles.css";
import "./globals.css";

import { Providers } from "./providers";
import { Nav } from "../components/Nav";

export const dynamic = "force-dynamic";

const cinzelDisplay = Cinzel({
  variable: "--font-cinzel",
  subsets: ["latin"],
  weight: ["700", "900"],
});

const cormorantGaramond = Cormorant_Garamond({
  variable: "--font-cormorant",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const interBody = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Goldgard — Yield Shield of the LSTs",
  description: "Protect Thy Yield — The First Delta-Neutral LST Hook (Uniswap v4 Hook Demo)",
  icons: {
    icon: "/goldgard.png",
    shortcut: "/goldgard.png",
    apple: "/goldgard.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${cinzelDisplay.variable} ${cormorantGaramond.variable} ${interBody.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col gg-bg gg-runes">
        <Providers>
          <Nav />
          <main className="flex-1">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
