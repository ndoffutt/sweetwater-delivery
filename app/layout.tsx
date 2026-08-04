import type { Metadata, Viewport } from "next";
import { Lora, Poppins, Barlow, Barlow_Condensed } from "next/font/google";
import SwRegister from "@/components/SwRegister";
import ErrorCatcher from "@/components/ErrorCatcher";
import "./globals.css";

// Brand fonts per the Sweetwater's brand spec: Lora for display, Poppins for
// body/UI. Self-hosted through next/font — no render-blocking Google Fonts
// request, no flash of fallback text on the road.
const lora = Lora({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-lora",
  display: "swap",
});
const poppins = Poppins({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  variable: "--font-poppins",
  display: "swap",
});
// Ops Hub (owner console) type: condensed headings over a normal body face.
const barlow = Barlow({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-barlow",
  display: "swap",
});
const barlowCondensed = Barlow_Condensed({
  subsets: ["latin"],
  weight: ["400", "600"],
  variable: "--font-barlow-condensed",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Sweetwater's Delivery",
  description: "Sweetwater's Cleaners Driver Delivery App",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "SW Delivery",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#02733e",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${lora.variable} ${poppins.variable} ${barlow.variable} ${barlowCondensed.variable}`}>
      <body className="font-body text-charcoal bg-cream antialiased">
        <SwRegister />
        <ErrorCatcher />
        {children}
      </body>
    </html>
  );
}
