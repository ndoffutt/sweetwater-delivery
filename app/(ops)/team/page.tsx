import SettingsPage from "../../settings/page";
import { SubNav } from "@/components/ops/Bits";

export const dynamic = "force-dynamic";

// Team — drivers, PINs and account management (the old Settings page), inside
// the ops shell.
export default function OpsTeamPage() {
  return (
    <>
      <SubNav items={[{ label: "Team & settings", href: "/team", active: true }]} />
      <SettingsPage />
    </>
  );
}
