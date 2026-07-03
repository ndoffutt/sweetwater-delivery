// Build a Google Voice click-to-call link so "Call" opens Google Voice (web or
// the installed GV app) instead of the device's default phone dialer.
// Format: https://voice.google.com/u/0/calls?a=nc,<E.164>  (a=nc = new call)
export function googleVoiceCallHref(phone: string | null | undefined): string {
  const d = (phone || "").replace(/\D/g, "");
  const e164 =
    d.length === 10 ? `+1${d}` : d.length === 11 && d[0] === "1" ? `+${d}` : `+${d}`;
  return `https://voice.google.com/u/0/calls?a=nc,${encodeURIComponent(e164)}`;
}

/** "6319079270" → "(631) 907-9270" for display. Unrecognized shapes pass through. */
export function formatPhone(phone: string | null | undefined): string {
  const raw = (phone || "").trim();
  const d = raw.replace(/\D/g, "");
  const ten = d.length === 11 && d[0] === "1" ? d.slice(1) : d;
  if (ten.length !== 10) return raw;
  return `(${ten.slice(0, 3)}) ${ten.slice(3, 6)}-${ten.slice(6)}`;
}
