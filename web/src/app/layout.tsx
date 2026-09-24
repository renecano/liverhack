import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { MascotaFlotante } from "@/components/MascotaFlotante";
import { AsistenteHM } from "@/components/AsistenteHM";
import "./globals.css";
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "LivHire",
  description: "Proceso interno de atracción de talento",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es-MX"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <MascotaFlotante />
        <AsistenteHM />
      </body>
    </html>
  );
}
