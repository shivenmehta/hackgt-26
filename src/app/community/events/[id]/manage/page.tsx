import EventPage from "@/components/location/event";
import { CommunityShell } from "@/components/location/shared";
export const metadata = { robots: { index: false, follow: false } };
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <CommunityShell>
      <EventPage id={decodeURIComponent(id)} manage={true} />
    </CommunityShell>
  );
}
