import type { Metadata } from "next";
import "./globals.css";
import { OSShell } from "@/components/os/OSShell";

export const metadata: Metadata = {
  title: "flick-owens.dev",
  description: "A Wii-menu-shaped gallery of things I like.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full overflow-hidden">
        <OSShell>{children}</OSShell>
      </body>
    </html>
  );
}
