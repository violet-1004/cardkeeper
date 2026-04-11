import AdminClient from './AdminClient';
import { fetchSeriesAndGroups } from './actions';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export default async function AdminPage() {
    const { seriesData, groupsData } = await fetchSeriesAndGroups();
    return <AdminClient initialSeries={seriesData} initialGroups={groupsData} />;
}
