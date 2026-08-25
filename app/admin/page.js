import { redirect } from 'next/navigation';

// 🌟 這裡原本是「後台資料同步管理」(批次抓取設定)，整個功能已經搬到
// /admin/sync 的「批次抓取設定」分頁，跟 POCA 對照設定、價格換算設定放在一起，
// 所以這個路由不再需要獨立畫面，直接導去 /admin/sync。
export default function AdminPage() {
    redirect('/admin/sync');
}
