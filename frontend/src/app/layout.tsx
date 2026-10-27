import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import "./globals.css";

export const metadata: Metadata = {
  title: "Blokzincir Gezgini",
  description: "Sıfırdan inşa edilmiş bir blokzincir için etkileşimli eğitim gezgini. Gerçek para yoktur.",
};

export const viewport: Viewport = {
  themeColor: "#07090d",
  colorScheme: "dark",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // Turkish, left-to-right.
    <html lang="tr" dir="ltr">
      <body>{children}</body>
    </html>
  );
}
