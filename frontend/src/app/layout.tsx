import type { Metadata } from "next";
import { Inter, Courier_Prime } from "next/font/google";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { QueueProvider } from "@/components/providers/QueueProvider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "sonner";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const courierPrime = Courier_Prime({
  variable: "--font-courier-prime",
  subsets: ["latin"],
  weight: ["400", "700"],
});

export const metadata: Metadata = {
  title: "FrameReader — Video to Screenplay",
  description:
    "Paste a video URL, get a professionally formatted screenplay-style script with dialogue, character identification, timestamps, and meaningful action descriptions.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} ${courierPrime.variable} font-sans antialiased`}>
        <ThemeProvider>
          <QueueProvider>
            <TooltipProvider>
              {children}
              <Toaster richColors position="bottom-right" />
            </TooltipProvider>
          </QueueProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
