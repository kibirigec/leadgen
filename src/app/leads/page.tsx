import { getSavedLeadsAction } from "@/actions/leads";
import { LeadsClient } from "@/components/LeadsClient";

export const dynamic = "force-dynamic";

export default async function SavedLeadsPage() {
  const leads = await getSavedLeadsAction();

  return <LeadsClient initialLeads={leads} />;
}
