import type { Metadata } from "next";
import "./globals.css";

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
          // Runs before paint to avoid a light-mode flash for users with a
          // saved or system dark preference.
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('dawg-theme');var d=window.matchMedia('(prefers-color-scheme: dark)').matches;if(t==='dark'||(!t&&d)){document.documentElement.classList.add('dark');}}catch(e){}})();`,
          }}
        />
      </head>
      <body className="bg-neutral-50 text-neutral-900 antialiased dark:bg-neutral-950 dark:text-neutral-100">
        {children}
      </body>
    </html>
  );
}
