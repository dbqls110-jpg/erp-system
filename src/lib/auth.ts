import { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { prisma } from "@/lib/prisma";

/** role 을 DB 에서 다시 읽는 주기. 짧을수록 반영이 빠르고 DB 왕복이 는다. */
const ROLE_REFRESH_MS = 60_000;

export const authOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET,
  providers: [
    GoogleProvider({
      clientId: process.env.AUTH_GOOGLE_ID!,
      clientSecret: process.env.AUTH_GOOGLE_SECRET!,
      authorization: { params: { prompt: "select_account" } },
      checks: ["state"],
    }),
  ],
  session: { strategy: "jwt" },
  callbacks: {
    async jwt({ token, account, profile }) {
      if (account?.provider === "google" && account.access_token) {
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
      }
      if (account?.provider === "google" && profile?.email) {
        try {
          const users = await prisma.$queryRaw<
            Array<{
              id: string;
              role: string;
              name: string | null;
              image: string | null;
              partnerId: string | null;
              customerId: string | null;
            }>
          >`SELECT id, role, name, image, "partnerId", "customerId" FROM users WHERE email = ${profile.email}`;
          let dbUser = users[0];

          if (!dbUser) {
            const countResult = await prisma.$queryRaw<Array<{ count: bigint }>>`SELECT COUNT(*) as count FROM users`;
            const count = Number(countResult[0].count);
            const newUsers = await prisma.$queryRaw<
              Array<{
                id: string;
                role: string;
                name: string | null;
                image: string | null;
                partnerId: string | null;
                customerId: string | null;
              }>
            >`
              INSERT INTO users (id, email, name, image, role, active, "createdAt", "updatedAt")
              VALUES (gen_random_uuid()::text, ${profile.email}, ${profile.name ?? null},
                ${(profile as { picture?: string }).picture ?? null},
                ${count === 0 ? "admin" : "pending"}, true, NOW(), NOW())
              RETURNING id, role, name, image, "partnerId", "customerId"
            `;
            dbUser = newUsers[0];
          }

          token.id = dbUser.id;
          token.role = dbUser.role;
          token.partnerId = dbUser.partnerId;
          token.customerId = dbUser.customerId;
          token.roleCheckedAt = Date.now();
          token.name = dbUser.name;
          token.picture = dbUser.image;

          // 출근 자동 기록 (당일 첫 로그인만)
          if (dbUser.role !== "pending") {
            const today = new Date().toISOString().split("T")[0];
            await prisma.$executeRaw`
              INSERT INTO attendances (id, "userId", date, "clockIn", "createdAt", "updatedAt")
              VALUES (gen_random_uuid()::text, ${dbUser.id}, ${today}, NOW(), NOW(), NOW())
              ON CONFLICT ("userId", date) DO NOTHING
            `;
          }
        } catch (err) {
          console.error("[ERP Auth Error]", err);
          token.id = token.sub ?? "unknown";
          token.role = "pending";
          token.partnerId = null;
          token.customerId = null;
        }
      }
      // 로그인 이후에도 role 을 주기적으로 다시 읽는다.
      //
      // account 는 최초 로그인 때만 채워지므로 위 블록은 그때 한 번만 돈다. 그래서
      // 관리자가 레벨을 바꿔도 상대가 로그아웃했다 다시 들어오기 전까지는 옛 권한이
      // 그대로였다. 권한을 바꿨는데 언제 적용될지 모르는 상태는 관리자에게 위험하다.
      //
      // 매 요청마다 조회하면 이 콜백이 거의 모든 요청에서 도는 만큼 DB 왕복이 는다.
      // 1분에 한 번으로 제한한다 — 권한 변경이 1분 안에 반영되면 충분하고,
      // 사용자 한 명당 분당 한 번은 예전에 없앤 폴링보다 훨씬 가볍다.
      if (token.id && Date.now() - ((token.roleCheckedAt as number) ?? 0) > ROLE_REFRESH_MS) {
        try {
          // 연결(어느 파트너·거래처인지)도 함께 읽는다. 관리자가 승인하며 연결을
          // 바꿔도 상대가 재로그인해야 반영되면 안 된다.
          const rows = await prisma.$queryRaw<
            Array<{ role: string; partnerId: string | null; customerId: string | null }>
          >`
            SELECT role, "partnerId", "customerId" FROM users WHERE id = ${token.id as string}
          `;
          if (rows[0]) {
            token.role = rows[0].role;
            token.partnerId = rows[0].partnerId;
            token.customerId = rows[0].customerId;
          }
          token.roleCheckedAt = Date.now();
        } catch (err) {
          // 조회에 실패하면 기존 role 을 유지한다. 여기서 권한을 낮추면 DB 가
          // 잠깐 흔들릴 때 멀쩡한 사용자가 화면에서 튕긴다.
          console.error("[ERP Auth] role 갱신 실패", err);
        }
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = (token.role as string) ?? "pending";
        session.user.partnerId = (token.partnerId as string | null) ?? null;
        session.user.customerId = (token.customerId as string | null) ?? null;
      }
      session.accessToken = token.accessToken as string | undefined;
      return session;
    },
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
};
