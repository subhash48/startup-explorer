import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Startup Explorer — Know before you apply",
  description:
    "A clearer picture of your next opportunity. Understand a startup’s product, customers, and team before applying.",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
