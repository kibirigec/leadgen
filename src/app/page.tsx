import { getSavedLeadsAction } from "@/actions/leads";
import { DashboardClient } from "@/components/DashboardClient";

export const dynamic = "force-dynamic";

export default async function SavedLeadsPage() {
  const leads = await getSavedLeadsAction();

  return <DashboardClient initialLeads={leads} />;
}
