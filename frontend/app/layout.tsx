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
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                var t=localStorage.getItem("theme");
                if(t==="dark") document.documentElement.classList.add("dark");
                else if(!t||t==="system"){
                  if(window.matchMedia("(prefers-color-scheme: dark)").matches)
                    document.documentElement.classList.add("dark");
                }
              }catch(e){}
            `,
          }}
        />
      </head>
      <body className="font-sans bg-canvas text-ink antialiased">
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
