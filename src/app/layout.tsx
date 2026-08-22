import type { Metadata } from "next";
import "./globals.css";
import { CartProvider } from "@/lib/cart";

export const metadata: Metadata = {
  title: "Dawg Dashboard",
  description: "Multi-facility dog boarding & daycare operations",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        {/* Typeface from the approved redesign — IBM Plex Sans. Loaded as a
            runtime stylesheet (not next/font) so builds don't depend on
            Google Fonts being reachable from the build machine. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
        <script
          // Runs before paint to avoid a dark-mode flash for returning users
          // who've explicitly toggled dark mode on this device. Every fresh
          // browser starts in light mode regardless of OS/system dark-mode
          // setting — only an explicit tap of the toggle switches it, and
          // that choice is remembered per-device via localStorage.
          dangerouslySetInnerHTML={{
            __html: `(function(){try{if(localStorage.getItem('dawg-theme')==='dark'){document.documentElement.classList.add('dark');}}catch(e){}})();`,
          }}
        />
      </head>
      <body className="bg-[#f5f6f8] font-sans text-[#15181d] antialiased dark:bg-slate-950 dark:text-slate-100">
        <CartProvider>{children}</CartProvider>
      </body>
    </html>
  );
}
