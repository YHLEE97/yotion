import type { Metadata } from 'next';
import './globals.css';
import './workspace.css';

export const metadata: Metadata = {
  title: 'Yotion — 나만의 작업 공간',
  description: '생각을 기록하고 페이지로 정리하는 독립 문서 작업 공간',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ko"><body>{children}</body></html>;
}
