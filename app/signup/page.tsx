import { redirect } from "next/navigation";

// The opt-in form now lives at /sms (canonical CTA URL for the A2P campaign).
// Keep /signup working for any older links by redirecting.
export default function SignupRedirect() {
  redirect("/sms");
}
