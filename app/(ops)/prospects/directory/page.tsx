import SalesProspectsPage from "../../../sales/prospects/page";
import { SubNav } from "@/components/ops/Bits";

export const dynamic = "force-dynamic";

// Directory — the full prospect CRM (map, detail, touchpoint log), inside the
// ops shell. The board on /prospects links here for individual records.
export default function OpsProspectDirectoryPage({
  searchParams,
}: {
  searchParams?: { id?: string };
}) {
  return (
    <>
      <SubNav
        items={[
          { label: "Pipeline", href: "/prospects" },
          { label: "Directory & map", href: "/prospects/directory", active: true },
        ]}
      />
      <SalesProspectsPage searchParams={searchParams} />
    </>
  );
}
