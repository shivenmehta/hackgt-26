import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Provider } from "@/components/ui/provider";

export const metadata: Metadata = {
  title: "HackGT 2026",
  description: "A food planning project for HackGT 2026.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Provider>{children}</Provider>
      </body>
    </html>
  );
}
