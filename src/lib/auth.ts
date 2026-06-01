import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { prisma } from "@/lib/prisma";

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID!,
      clientSecret: process.env.AUTH_GOOGLE_SECRET!,
      authorization: { params: { prompt: "select_account" } },
    }),
  ],
  session: { strategy: "jwt" },
  callbacks: {
    async jwt({ token, account, profile }) {
      if (account?.provider === "google" && profile?.email) {
        try {
          let dbUser = await prisma.user.findUnique({
            where: { email: profile.email },
            select: { id: true, role: true, name: true, image: true },
          });

          if (!dbUser) {
            const count = await prisma.user.count();
            dbUser = await prisma.user.create({
              data: {
                email: profile.email,
                name: profile.name ?? null,
                image: (profile as { picture?: string }).picture ?? null,
                role: count === 0 ? "admin" : "pending",
              },
              select: { id: true, role: true, name: true, image: true },
            });
          }

          token.id = dbUser.id;
          token.role = dbUser.role;
          token.name = dbUser.name;
          token.picture = dbUser.image;
        } catch (err) {
          console.error("[ERP Auth Error]", JSON.stringify(err, Object.getOwnPropertyNames(err)));
          // DB 오류시 로그인 자체는 통과, 대기 상태로 처리
          token.id = token.sub ?? "unknown";
          token.role = "pending";
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = (token.role as string) ?? "pending";
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
});
