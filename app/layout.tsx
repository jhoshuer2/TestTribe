import type { ReactNode } from "react";
import "@fontsource-variable/bricolage-grotesque";
import "../styles/tokens.css";
import "../styles/hero.css";

export const metadata = { title: "The Test Tribe" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
