import { ShopProvider } from './ShopProvider';
import { ShopNav } from './ShopNav';

export const metadata = {
    title: '小卡選購',
    description: '販售中的小卡選購與結單總結',
    robots: { index: false, follow: false },
};

export default function ShopLayout({ children }: { children: React.ReactNode }) {
    return (
        <ShopProvider>
            <div className="min-h-screen bg-[#f7f8fb] text-gray-800">
                <ShopNav />
                {children}
            </div>
        </ShopProvider>
    );
}
