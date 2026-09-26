import type { Metadata } from "next";
import type { ReactNode } from "react";
import localFont from "next/font/local";
import { Provider } from "@/components/ui/provider";
import "./bridge.css";
const bricolage = localFont({
  src: "./fonts/bricolage-grotesque.ttf",
  variable: "--font-bricolage",
  display: "swap",
  weight: "200 800",
});
const source = localFont({
  src: "./fonts/source-sans-3.ttf",
  variable: "--font-source",
  display: "swap",
  weight: "200 900",
});
export const metadata: Metadata = {
  title: "Bridge · Your weekly meal planner",
  description:
    "Explore a week of meals around your household, food preferences, and budget. An interactive Bridge prototype.",
};
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${bricolage.variable} ${source.variable}`}>
      <body>
        <Provider>{children}</Provider>
      </body>
    </html>
  );
}
