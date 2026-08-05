import Link from "next/link";
import ReportsNav from "@/components/ops/ReportsNav";

// A pre-app weekly update, rendered as the printed copy of the original email
// — not the editable form. **bold** markers from the archive become real bold;
// everything else keeps the email's own line breaks.
export default function PrintedUpdate({
  date,
  text,
}: {
  date: string;
  text: string;
}) {
  const paragraphs = text.split(/\n\n+/);
  const renderBold = (line: string) =>
    line.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
      part.startsWith("**") && part.endsWith("**") ? (
        <strong key={i}>{part.slice(2, -2)}</strong>
      ) : (
        <span key={i}>{part}</span>
      )
    );

  return (
    <>
      <ReportsNav active="Weekly update" />
      <div className="mx-auto max-w-[840px] px-5 md:px-12 pb-16">
        <div className="pt-8 flex flex-wrap items-baseline justify-between gap-3">
          <h1 className="font-barlowc font-semibold text-[30px] md:text-[40px] leading-none">
            Weekly Update: {date}
          </h1>
          <Link href="/reports" className="text-[13.5px] text-ops-accent underline">
            Back to this week
          </Link>
        </div>
        <p className="mt-2 text-[13px] text-[rgba(26,26,26,.62)]">
          Printed copy of the original email — from before updates moved into the app.
        </p>
        <div className="mt-6 border-t-2 border-ops-text pt-5">
          {paragraphs.map((p, i) => (
            <p key={i} className="mb-4 text-[15px] leading-[1.65] whitespace-pre-wrap">
              {renderBold(p)}
            </p>
          ))}
        </div>
      </div>
    </>
  );
}
