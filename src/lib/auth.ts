import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { neon } from "@neondatabase/serverless";

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
          const sql = neon(process.env.DATABASE_URL!);

          // 기존 유저 조회
          const users = await sql`
            SELECT id, role, name, image FROM users WHERE email = ${profile.email}
          `;

          let dbUser = users[0];

          if (!dbUser) {
            // 첫 번째 유저이면 admin, 나머지는 pending
            const countResult = await sql`SELECT COUNT(*) as count FROM users`;
            const count = Number(countResult[0].count);

            const newUsers = await sql`
              INSERT INTO users (id, email, name, image, role, active, "createdAt", "updatedAt")
              VALUES (
                gen_random_uuid()::text,
                ${profile.email},
                ${profile.name ?? null},
                ${(profile as { picture?: string }).picture ?? null},
                ${count === 0 ? "admin" : "pending"},
                true,
                NOW(),
                NOW()
              )
              RETURNING id, role, name, image
            `;
            dbUser = newUsers[0];
          }

          token.id = dbUser.id;
          token.role = dbUser.role;
          token.name = dbUser.name;
          token.picture = dbUser.image;
        } catch (err) {
          console.error("[ERP Auth Error]", err);
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
