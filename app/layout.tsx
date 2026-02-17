import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TEENAI - 청소년 AI 멘토",
  description: "안전하고 유익한 청소년 전용 AI 상담 서비스",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
