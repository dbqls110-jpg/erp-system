import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-XSS-Protection", value: "1; mode=block" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      // 카카오 지도 SDK 는 dapi.kakao.com 에서 받고, 그 SDK 가 다시 daumcdn 에서
      // 내부 스크립트를 불러온다. 둘 중 하나만 열면 지도가 뜨지 않는다.
      //
      // http:// 항목은 http://localhost 개발용이다. SDK 가 페이지 프로토콜을 따라가
      // 로컬에서는 http 로 내부 스크립트를 요청한다. 배포본은 https 라 SDK 도 https 를
      // 쓰고, 설령 http 로 요청해도 브라우저의 혼합 콘텐츠 차단에 먼저 걸리므로
      // 이 항목이 운영 환경을 느슨하게 만들지는 않는다.
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://dapi.kakao.com https://t1.daumcdn.net http://t1.daumcdn.net",
      "style-src 'self' 'unsafe-inline'",
      // 지도 타일과 마커 이미지가 daumcdn / kakaocdn 여러 호스트로 흩어져 온다.
      "img-src 'self' data: blob: https://lh3.googleusercontent.com https://lh4.googleusercontent.com https://*.daumcdn.net https://*.kakaocdn.net http://*.daumcdn.net",
      "font-src 'self'",
      // 브라우저는 기본적으로 동일 출처로만 통신한다(SSE 포함). DB 는 서버 사이드에서만 접근.
      // 카카오 지도는 타일 좌표와 검색 결과를 자기 서버에 직접 요청한다.
      "connect-src 'self' https://dapi.kakao.com https://*.daumcdn.net http://*.daumcdn.net",
      "frame-ancestors 'none'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  // Render runs the type check explicitly in render-build. Skipping Next's
  // duplicate checker keeps the production build within its memory limit.
  typescript: {
    ignoreBuildErrors: true,
  },
  // Google Drive와 PDF 파서는 서버에서만 실행한다. 브라우저 번들에 포함되면
  // PDF worker와 Node 전용 의존성이 함께 내려가므로 외부 패키지로 둔다.
  serverExternalPackages: ["googleapis", "pdf-parse"],
  // 견적서 원본 첨부(최대 50MB)를 Server Action이 받을 수 있게 한다.
  experimental: {
    serverActions: { bodySizeLimit: "50mb" },
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
