import type { Metadata } from "next";
import { Inter, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-ui",
  subsets: ["latin"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-mono",
  weight: ["500", "600", "700"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Delivery & Truck",
  description: "Fleet dispatch and daily vehicle inspection for Delivery & Truck",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${plexMono.variable}`}>
        {children}
      </body>
    </html>
  );
}
