import { SummaryBoard } from '../../SummaryBoard';

export const runtime = 'edge';

// 依團體分開的總結網址，例如 /shop/CRAVITY/summary，排序與分配都只看該團體的訂單。
export default function GroupSummaryPage({ params }: { params: { group: string } }) {
    let name = params.group;
    try {
        name = decodeURIComponent(params.group);
    } catch {
        /* 保留原字串 */
    }
    return <SummaryBoard lockGroupName={name} />;
}
