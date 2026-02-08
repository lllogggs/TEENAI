import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TEENAI",
  description: "AI 메신저와 부모 대시보드가 결합된 학습 파트너",
  manifest: "/manifest.json",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
