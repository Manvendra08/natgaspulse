import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "../styles/globals.css";

const inter = Inter({
    subsets: ["latin"],
    weight: ["300", "400", "500", "600", "700", "800"],
    variable: "--font-inter"
});

export const metadata: Metadata = {
    title: "NatGasPulse - Natural Gas Trading Intelligence",
    description: "Real-time natural gas market data, EIA storage reports, weather forecasts, and trading signals for NYMEX and MCX markets",
    icons: {
        icon: "/natgaspulse_icon.png",
        shortcut: "/natgaspulse_icon.png",
        apple: "/natgaspulse_icon.png"
    }
};

import { ThemeProvider } from "@/components/providers/ThemeProvider";
import Footer from "@/components/Footer";

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="en" suppressHydrationWarning>
            <body className={`${inter.className} antialiased`}>
                <ThemeProvider>
                    <div className="min-h-screen flex flex-col">
                        <div className="flex-1">
                            {children}
                        </div>
                        <Footer />
                    </div>
                </ThemeProvider>
            </body>
        </html>
    );
}
