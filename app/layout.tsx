import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ConvexAuthNextjsServerProvider } from "@convex-dev/auth/nextjs/server";
import { ConvexClientProvider } from "@/components/providers/convex-client-provider";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "Tradeline ERP", template: "%s · Tradeline ERP" },
  description: "Physical commodity trading ERP — suppliers, trades, contracts, B/L and dispatch.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <ConvexAuthNextjsServerProvider>
      <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
        <body className="min-h-full">
          <ConvexClientProvider>
            <TooltipProvider delayDuration={300}>{children}</TooltipProvider>
          </ConvexClientProvider>
          <Toaster richColors closeButton position="top-right" />
        </body>
      </html>
    </ConvexAuthNextjsServerProvider>
  );
}
