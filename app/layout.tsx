
import React from 'react';
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TEENAI - 청소년을 위한 프리미엄 AI 멘토",
  description: "안전하고 똑똑한 청소년 AI 멘토링 서비스",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <head>
        <link href="https://fonts.googleapis.com/css2?family=Pretendard:wght@100;400;700;900&display=swap" rel="stylesheet" />
      </head>
      <body className="font-sans antialiased text-slate-900 bg-[#F8FAFC]">
        {children}
      </body>
    </html>
  );
}
