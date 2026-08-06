// Spam scoring for the public delivery sign-up form.
//
// The form already had a honeypot, and the bots hitting it in Aug 2026 sailed
// past it — they only fill visible required fields. Six of eight sign-ups in
// one week were junk, all sharing a signature:
//
//   Jwzqoh   | Hziludthl, Bridgehampton, NY 43011 | notes: jXCHSQAiNhvDvyUtgy
//   Xawhzecu | Zjaicuawal, Bridgehampton, NY 85252 | notes: IqLATOnjFuxMxccl
//
// versus a real one:
//
//   Yvonne Bond | 811 Halsey Lane, Bridgehampton, NY 11932 | notes: (empty)
//
// Scored rather than hard-matched, and never a hard reject: a false positive
// costs a real delivery customer, which is far worse than a junk row the
// manager never sees. Anything flagged is still written down, just filed away
// instead of landing in the review queue.

export interface SignupSignals {
  fullName: string;
  address: string;
  notes?: string;
  /** ms between the form rendering and submit, when the client reports it. */
  elapsedMs?: number;
}

export interface SpamVerdict {
  score: number;
  spam: boolean;
  reasons: string[];
}

/** ZIPs we actually deliver to — the East End. Only meaningful when a ZIP is
 *  actually present: plenty of real customers write "53 Pauls lane" and stop,
 *  and an absent ZIP must never count against them. A real customer also once
 *  typed a New Jersey ZIP by mistake, so this can only ever corroborate. */
const ANY_ZIP = /\b\d{5}\b/;
const SERVICE_ZIP = /\b11(9[0-9]{2}|7[0-9]{2})\b/;

/** A human street line carries a number: "811 Halsey Lane". The bots emit a
 *  bare invented word. Checked against the FIRST comma-segment only — testing
 *  the whole string matches the ZIP's digits and the signal never fires. */
function hasStreetNumber(address: string): boolean {
  return /\d/.test((address.split(",")[0] ?? "").trim());
}

/** Vowel-starved strings like "Jwzqoh" or "Nhrpp" — real names and streets
 *  hold roughly 30–50% vowels; generated consonant soup sits far below. */
function vowelStarved(s: string): boolean {
  const letters = s.replace(/[^a-z]/gi, "");
  if (letters.length < 4) return false;
  const vowels = (letters.match(/[aeiou]/gi) || []).length;
  return vowels / letters.length < 0.28;
}

/** A single run of mixed-case letters and digits with no spaces — the shape of
 *  "jXCHSQAiNhvDvyUtgy". A person writing a note uses spaces. */
function randomBlob(s: string): boolean {
  const t = s.trim();
  if (t.length < 10 || /\s/.test(t)) return false;
  return /[a-z]/.test(t) && /[A-Z]/.test(t);
}

export function scoreSignup(input: SignupSignals): SpamVerdict {
  const reasons: string[] = [];
  const name = (input.fullName || "").trim();
  const address = (input.address || "").trim();
  const notes = (input.notes || "").trim();

  // GATE — an address with no street number at all. Checked against every
  // sign-up on record: true for all 9 bots, false for all 28 real customers,
  // including the ones who omit the town or ZIP. Nothing is filed away without
  // it, because every softer signal below has a real customer behind it:
  // "Schortzmann" and "Pattner" read as vowel-starved, and real people both
  // skip the ZIP and occasionally mistype one from out of state.
  const noStreetNumber = !!address && !hasStreetNumber(address);
  if (noStreetNumber) reasons.push("no-street-number");

  // Corroboration. A present-but-out-of-area ZIP counts; an absent one never
  // does.
  if (address && ANY_ZIP.test(address) && !SERVICE_ZIP.test(address)) {
    reasons.push("zip-outside-service-area");
  }
  if (vowelStarved(name)) reasons.push("name-not-word-like");
  if (vowelStarved(address.split(",")[0] ?? "")) reasons.push("street-not-word-like");
  if (randomBlob(notes)) reasons.push("notes-random-string");
  // Humans take longer than two seconds to fill five fields.
  if (input.elapsedMs != null && input.elapsedMs >= 0 && input.elapsedMs < 2000) {
    reasons.push("submitted-too-fast");
  }

  // The gate plus at least one corroborating signal. A bot that only trips the
  // gate still reaches the manager — better a junk row to dismiss than a lost
  // customer.
  const spam = noStreetNumber && reasons.length >= 2;
  return { score: reasons.length, spam, reasons };
}
