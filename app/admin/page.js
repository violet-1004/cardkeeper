import AdminClient from './AdminClient';
import { fetchSeriesAndGroups } from './actions';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';
export const revalidate = 0; // 🌟 確保伺服器端每次都重新抓取資料，絕對不使用舊快取

export default async function AdminPage() {
    const { seriesData, groupsData } = await fetchSeriesAndGroups();
    return <AdminClient initialSeries={seriesData} initialGroups={groupsData} />;
}
