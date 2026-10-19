import type { ReactNode } from "react";
import "../styles/tokens.css";

export const metadata = { title: "TestTribe" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
