import { ShopCatalog } from '../ShopCatalog';

export const runtime = 'edge';

// 依團體分開的選購網址，例如 /shop/CRAVITY 只顯示該團體的小卡（依團體名稱比對，忽略大小寫）。
export default function GroupShopPage({ params }: { params: { group: string } }) {
    let name = params.group;
    try {
        name = decodeURIComponent(params.group);
    } catch {
        /* 保留原字串 */
    }
    return <ShopCatalog lockGroupName={name} />;
}
