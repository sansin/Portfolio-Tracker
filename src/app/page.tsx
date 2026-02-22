import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ROUTES, APP_NAME, APP_DESCRIPTION } from '@/lib/constants';
import { BarChart3, Upload, Sparkles, Shield } from 'lucide-react';

export default async function HomePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (user) {
    redirect(ROUTES.ANALYTICS);
  }

  return (
    <div className="min-h-screen bg-zinc-950">
      {/* Nav */}
      <nav className="flex items-center justify-between px-6 py-4 border-b border-zinc-800/50">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-indigo-600 flex items-center justify-center">
            <span className="text-white font-bold text-sm">F</span>
          </div>
          <span className="text-lg font-semibold text-zinc-100">{APP_NAME}</span>
        </div>
        <div className="flex items-center gap-3">
          <Link href={ROUTES.LOGIN}>
            <Button variant="ghost">Sign in</Button>
          </Link>
          <Link href={ROUTES.REGISTER}>
            <Button>Get Started</Button>
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <div className="max-w-4xl mx-auto px-6 py-24 text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-indigo-500/20 bg-indigo-500/5 px-4 py-1.5 text-sm text-indigo-400 mb-8">
          <Sparkles className="h-4 w-4" />
          AI-Powered Portfolio Intelligence
        </div>
        <h1 className="text-5xl font-bold text-zinc-100 leading-tight mb-6">
          Track Every Trade.<br />
          <span className="text-indigo-400">Understand Every Move.</span>
        </h1>
        <p className="text-xl text-zinc-400 max-w-2xl mx-auto mb-10">
          {APP_DESCRIPTION}. Import from Robinhood, Fidelity, and Schwab in seconds.
        </p>
        <div className="flex items-center justify-center gap-4">
          <Link href={ROUTES.REGISTER}>
            <Button size="lg">Start Tracking — Free</Button>
          </Link>
          <Link href={ROUTES.LOGIN}>
            <Button variant="outline" size="lg">Sign In</Button>
          </Link>
        </div>
      </div>

      {/* Features */}
      <div className="max-w-5xl mx-auto px-6 pb-24">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[
            {
              icon: Upload,
              title: 'Smart Import',
              desc: 'CSV, screenshots, or paste — AI parses your trades instantly.',
            },
            {
              icon: BarChart3,
              title: 'Rich Analytics',
              desc: 'P&L, allocation, sector exposure, performance charts.',
            },
            {
              icon: Sparkles,
              title: 'AI Insights',
              desc: 'Earnings summaries, recommendations, portfolio health scores.',
            },
            {
              icon: Shield,
              title: 'Private & Secure',
              desc: 'Row-level security. Your data is yours alone.',
            },
          ].map((f) => (
            <div
              key={f.title}
              className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 text-left"
            >
              <div className="inline-flex items-center justify-center h-10 w-10 rounded-lg bg-indigo-600/10 mb-4">
                <f.icon className="h-5 w-5 text-indigo-400" />
              </div>
              <h3 className="text-sm font-semibold text-zinc-100 mb-1">{f.title}</h3>
              <p className="text-sm text-zinc-500">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
