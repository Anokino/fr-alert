import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { SiteHeader } from "@/components/SiteHeader";

const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-bricolage",
  display: "swap",
});
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});
const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono-jb",
  display: "swap",
});

export const metadata: Metadata = {
  title: "France Alert — Danger près de chez moi ?",
  description:
    "Information de sécurité civile en temps réel : incendies, inondations, qualité de l'eau et de l'air, séismes, vigilance météo et rappels sanitaires. Signalez et informez-vous.",
};

export const viewport: Viewport = {
  themeColor: "#101827",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr">
      <body
        className={`${bricolage.variable} ${inter.variable} ${jetbrains.variable}`}
      >
        <a href="#contenu" className="skip-link">
          Aller au contenu
        </a>
        <div className="relative z-10 flex min-h-dvh flex-col">
          <SiteHeader />
          <main id="contenu" className="flex-1">
            {children}
          </main>
          <footer className="border-t border-border px-5 py-6 text-xs text-muted-foreground">
            <div className="mx-auto flex max-w-6xl flex-col gap-1">
              <p>
                France Alert — information de sécurité civile agrégée depuis des
                sources ouvertes. Ne remplace pas les consignes officielles.
              </p>
              <p>
                Urgence : <span className="font-mono text-foreground">112</span>{" "}
                · Pompiers <span className="font-mono text-foreground">18</span>{" "}
                · SAMU <span className="font-mono text-foreground">15</span>
              </p>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
