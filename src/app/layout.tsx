import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { SITE_URL } from "@/lib/base-path";

const bricolage = localFont({
  src: "./fonts/bricolage-grotesque-300-800.woff2",
  weight: "300 800",
  style: "normal",
  display: "swap",
  variable: "--font-bricolage",
});

const jetbrains = localFont({
  src: [
    { path: "./fonts/jetbrains-mono-400.woff2", weight: "400", style: "normal" },
    { path: "./fonts/jetbrains-mono-500.woff2", weight: "500", style: "normal" },
    { path: "./fonts/jetbrains-mono-600.woff2", weight: "600", style: "normal" },
    { path: "./fonts/jetbrains-mono-700.woff2", weight: "700", style: "normal" },
  ],
  display: "swap",
  variable: "--font-jetbrains",
});

export const metadata: Metadata = {
  title: {
    default: "cmdlib — write Minecraft datapacks without launching the game",
    template: "%s · cmdlib",
  },
  description:
    "cmdlib is a browser-native Minecraft datapack IDE with a real command runtime, a live world preview, and version-aware linting for 26.3 and the versions before it.",
  applicationName: "cmdlib",
  keywords: [
    "Minecraft",
    "datapack",
    "mcfunction",
    "IDE",
    "editor",
    "simulator",
    "26.3",
    "Wilderness Bound",
  ],
  authors: [{ name: "cmdlib" }],
  metadataBase: new URL(SITE_URL),
  alternates: { canonical: "/" },
  openGraph: {
    title: "cmdlib — write the game, don't launch it",
    description:
      "A browser-native datapack IDE with a real command runtime and a live world preview.",
    type: "website",
    url: SITE_URL,
    images: [{ url: `${SITE_URL}/og.png`, width: 1200, height: 630, alt: "cmdlib" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "cmdlib — write the game, don't launch it",
    description:
      "A browser-native datapack IDE with a real command runtime and a live world preview.",
    images: [`${SITE_URL}/og.png`],
  },
  icons: { icon: `${SITE_URL}/icon.svg` },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#08090b",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${bricolage.variable} ${jetbrains.variable}`}>
      <body className="grain">{children}</body>
    </html>
  );
}
