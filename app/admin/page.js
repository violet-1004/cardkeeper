import AdminClient from './AdminClient';
import { fetchSeriesAndGroups } from './actions';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';
export const revalidate = 0; // 🌟 確保伺服器端每次都重新抓取資料，絕對不使用舊快取

export default async function AdminPage() {
    let seriesData = [];
    let groupsData = [];
    
    try {
        const data = await fetchSeriesAndGroups();
        if (data) {
            seriesData = data.seriesData || [];
            groupsData = data.groupsData || [];
        }
    } catch (error) {
        console.error("AdminPage Fetch Error:", error);
    }

    return <AdminClient initialSeries={seriesData} initialGroups={groupsData} />;
}
