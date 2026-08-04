import LoginScreen from "@/components/LoginScreen";
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: { [key: string]: string | string[] | undefined };
}) {
  const session = await getSession();

  // Bouncie's OAuth redirect lands here as "/?code=…". Hand it to the setup
  // page instead of bouncing to /owner, which silently dropped the code — the
  // reason approving the van looked like it "went straight to the homepage".
  const rawCode = searchParams?.code;
  const code = Array.isArray(rawCode) ? rawCode[0] : rawCode;
  if (code && session?.role === "admin") {
    redirect(`/dispatch/bouncie-setup?code=${encodeURIComponent(code)}`);
  }

  if (session) {
    redirect(session.role === "driver" ? "/driver" : session.role === "admin" ? "/today" : "/dispatch");
  }

  return (
    <div className="min-h-screen bg-green-primary flex flex-col items-center justify-center p-6">
      <div className="mb-12 text-center">
        <h1 className="font-serif text-4xl font-light text-cream mb-2">
          Sweetwater&apos;s
        </h1>
        <p className="font-body text-xs uppercase tracking-widest text-gold-primary">
          Delivery
        </p>
      </div>
      <LoginScreen />
    </div>
  );
}
