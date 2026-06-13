import LoginScreen from "@/components/LoginScreen";
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";

export default async function LoginPage() {
  const session = await getSession();
  if (session) {
    redirect(session.role === "driver" ? "/driver" : "/owner");
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
