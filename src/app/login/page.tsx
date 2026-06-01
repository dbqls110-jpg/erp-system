import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { LoginForm } from "./LoginForm";

export default async function LoginPage() {
  const session = await getServerSession(authOptions);
  if (session?.user?.role && session.user.role !== "pending") {
    redirect("/dashboard");
  }
  return (
    <div className="min-h-screen flex items-center justify-center bg-hint-of-sky">
      <div className="w-full max-w-sm">
        <LoginForm />
      </div>
    </div>
  );
}
