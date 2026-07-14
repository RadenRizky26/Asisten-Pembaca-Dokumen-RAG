import type { Metadata } from "next";
import { Providers } from "@/components/Providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Pembaca Dokumen",
  description: "RAG Document Assistant",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id" suppressHydrationWarning>
      <body className={`font-sans bg-canvas text-ink antialiased`}>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}

