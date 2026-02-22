import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Sidebar } from '@/components/layout/sidebar';
import { Topbar } from '@/components/layout/topbar';
import { MainContent } from '@/components/layout/main-content';
import { StockDetailProvider } from '@/contexts/stock-detail-context';
import { ROUTES } from '@/lib/constants';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect(ROUTES.LOGIN);
  }

  // Fetch profile
  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name')
    .eq('id', user.id)
    .single();

  return (
    <div className="min-h-screen bg-zinc-950">
      <Sidebar />
      <MainContent>
        <Topbar user={profile ? { display_name: profile.display_name, email: user.email! } : null} />
        <main className="p-6">
          <StockDetailProvider>{children}</StockDetailProvider>
        </main>
      </MainContent>
    </div>
  );
}
