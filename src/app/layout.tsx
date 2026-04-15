import type { Metadata } from "next";
import { Bricolage_Grotesque, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

const linkyDisplay = Bricolage_Grotesque({
  variable: "--font-linky-display",
  subsets: ["latin"],
});

const linkyMono = IBM_Plex_Mono({
  variable: "--font-linky-mono",
  weight: ["400", "500", "600"],
  subsets: ["latin"],
});

function getMetadataBase(): URL {
  const fallback = "https://getalinky.com";

  try {
    return new URL(process.env.LINKY_BASE_URL ?? fallback);
  } catch {
    return new URL(fallback);
  }
}

export const metadata: Metadata = {
  metadataBase: getMetadataBase(),
  title: "Linky - One short link for many tabs",
  description:
    "Create one short Linky URL that opens all your saved links from a single landing page.",
  icons: {
    icon: [{ url: "/icon", type: "image/png" }],
    shortcut: [{ url: "/icon", type: "image/png" }],
    apple: [{ url: "/apple-icon", type: "image/png" }],
  },
  openGraph: {
    title: "Linky - One short link for many tabs",
    description:
      "Create one short Linky URL that opens all your saved links from a single landing page.",
    url: "https://getalinky.com",
    siteName: "Linky",
    type: "website",
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "Linky logo: black forward slash on white background.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Linky - One short link for many tabs",
    description:
      "Create one short Linky URL that opens all your saved links from a single landing page.",
    images: ["/twitter-image"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${linkyDisplay.variable} ${linkyMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
