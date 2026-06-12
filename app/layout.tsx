import type { Metadata, Viewport } from "next";
import SwRegister from "@/components/SwRegister";
import "./globals.css";

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
    <html lang="en">
      <body className="font-body text-charcoal bg-cream antialiased">
        <SwRegister />
        {children}
      </body>
    </html>
  );
}
