import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      role: string;
      /**
       * 외부 사용자가 어느 자료에 속하는지. 내부 직원이면 둘 다 null.
       * 캘린더에서 무엇을 보일지 가르는 기준이라 세션에 실어 둔다.
       */
      partnerId: string | null;
      customerId: string | null;
    };
    accessToken?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: string;
    accessToken?: string;
    refreshToken?: string;
  }
}
