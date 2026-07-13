import type { Metadata } from "next";
import { Be_Vietnam_Pro } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import { Shell } from "@/components/layout/shell";
import { Providers } from "@/components/providers";
import { Toaster } from "@/components/ui/toaster";

const beVietnamPro = Be_Vietnam_Pro({
  weight: ["300", "400", "500", "600", "700"],
  subsets: ["latin", "latin-ext", "vietnamese"],
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: "EasySalon CRM",
  description: "Salon Management System",
};

// External origins to preconnect to (DNS + TCP + TLS handshake done early so
// the first API/font/image request is faster). Added as <link> in <head> below
// because Next.js metadata `other.link` doesn't reliably render preconnect tags.
const PRECONNECT_ORIGINS = [
  "https://itatgyopxsiiurdjmtmy.supabase.co",
  "https://pub-ec79af41a5e447858ff5ee3d6363641a.r2.dev",
];

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="vi"
      className={cn("h-full", "antialiased", beVietnamPro.variable, "font-sans")}
    >
      <head>
        {PRECONNECT_ORIGINS.map((origin) => (
          <link key={origin} rel="preconnect" href={origin} />
        ))}
      </head>
      <body className="min-h-full flex flex-col">
        <Providers>
          <Shell>{children}</Shell>
          <Toaster />
        </Providers>
      </body>
    </html>
  );
}
