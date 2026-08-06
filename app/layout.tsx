import type { Metadata } from "next";
import { M_PLUS_Rounded_1c } from "next/font/google";
import "./globals.css";

const mPlusRounded = M_PLUS_Rounded_1c({
  subsets: ["latin"],
  variable: "--font-dsi-rounded",
  display: "swap",
  weight: ["400", "500", "700"],
});

export const metadata: Metadata = {
  title: "flick-owens.dev — Nintendo DS firmware portfolio",
  description:
    "Flick Owens — an interactive portfolio presented through an original Nintendo DS firmware interface.",
  metadataBase: new URL("https://flick-owens.dev"),
  openGraph: {
    title: "flick-owens.dev — Nintendo DS firmware portfolio",
    description: "A small personal toybox booting through a pixel-authentic Nintendo DS menu.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className={`${mPlusRounded.variable} min-h-full`}>{children}</body>
    </html>
  );
}
