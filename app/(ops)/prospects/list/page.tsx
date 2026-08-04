import SalesProspectsPage from "../../../sales/prospects/page";
import ProspectsNav from "@/components/ops/ProspectsNav";

export const dynamic = "force-dynamic";

// List — the full prospect directory (list, map, detail, touchpoint log),
// inside the ops shell. The pipeline board links here for individual records.
export default function OpsProspectListPage({
  searchParams,
}: {
  searchParams?: { id?: string };
}) {
  return (
    <>
      <ProspectsNav active="List" />
      <SalesProspectsPage searchParams={searchParams} />
    </>
  );
}
