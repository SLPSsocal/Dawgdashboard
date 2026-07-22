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
      <body className="bg-slate-50 text-slate-900 antialiased dark:bg-slate-950 dark:text-slate-100">
        <CartProvider>{children}</CartProvider>
      </body>
    </html>
  );
}
