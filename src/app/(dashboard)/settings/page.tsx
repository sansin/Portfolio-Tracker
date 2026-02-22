'use client';

import * as React from 'react';
import { User, Key, Bell, Shield, Palette, Download, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/toast';
import { Modal, ModalHeader, ModalTitle, ModalDescription, ModalFooter } from '@/components/ui/modal';
import { createClient } from '@/lib/supabase/client';

export default function SettingsPage() {
  const [displayName, setDisplayName] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [resetLoading, setResetLoading] = React.useState(false);
  const [exportLoading, setExportLoading] = React.useState(false);
  const [showDeleteAccount, setShowDeleteAccount] = React.useState(false);

  React.useEffect(() => {
    async function loadProfile() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setEmail(user.email || '');
        const { data: profile } = await supabase.from('profiles').select('display_name').eq('id', user.id).single();
        if (profile) setDisplayName(profile.display_name || '');
      }
    }
    loadProfile();
  }, []);

  async function handleUpdateProfile(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase.from('profiles').update({ display_name: displayName }).eq('id', user.id);
    if (error) {
      toast('error', 'Failed to update profile', error.message);
    } else {
      toast('success', 'Profile updated');
    }
    setLoading(false);
  }

  async function handleExportData() {
    setExportLoading(true);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const [{ data: portfolios }, { data: transactions }] = await Promise.all([
        supabase.from('portfolios').select('*').eq('user_id', user.id),
        supabase.from('transactions').select('*, asset:assets!asset_id(symbol, name)'),
      ]);

      const exportData = {
        exportedAt: new Date().toISOString(),
        portfolios: portfolios || [],
        transactions: (transactions || []).map((t: any) => ({
          symbol: t.asset?.symbol,
          name: t.asset?.name,
          type: t.transaction_type,
          quantity: t.quantity,
          price_per_unit: t.price_per_unit,
          total_amount: t.total_amount,
          fees: t.fees,
          date: t.transaction_date,
          notes: t.notes,
        })),
      };

      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `portfolio-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast('success', 'Data exported successfully');
    } catch {
      toast('error', 'Failed to export data');
    } finally {
      setExportLoading(false);
    }
  }

  return (
    <div className="space-y-6 animate-fade-in max-w-2xl">
      <h1 className="text-2xl font-bold tracking-tight text-zinc-100">Settings</h1>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-indigo-500/10 flex items-center justify-center">
              <User className="h-5 w-5 text-indigo-400" />
            </div>
            <div>
              <CardTitle className="text-base">Profile</CardTitle>
              <CardDescription>Manage your account information</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleUpdateProfile} className="space-y-4">
            <Input label="Display name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Your name" />
            <Input label="Email" value={email} disabled className="opacity-60" />
            <Button type="submit" loading={loading} size="sm">Save Changes</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-amber-500/10 flex items-center justify-center">
              <Key className="h-5 w-5 text-amber-400" />
            </div>
            <div>
              <CardTitle className="text-base">API Keys</CardTitle>
              <CardDescription>Configure AI and market data providers</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-zinc-500">API key configuration will be available in a future update. Currently using server-side configurations.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-emerald-500/10 flex items-center justify-center">
              <Shield className="h-5 w-5 text-emerald-400" />
            </div>
            <div>
              <CardTitle className="text-base">Security</CardTitle>
              <CardDescription>Password and authentication settings</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Button variant="outline" size="sm" loading={resetLoading} onClick={async () => {
            if (!email) {
              toast('error', 'No email address found');
              return;
            }
            setResetLoading(true);
            const supabase = createClient();
            const { error } = await supabase.auth.resetPasswordForEmail(email);
            if (error) {
              toast('error', 'Failed to send reset email', error.message);
            } else {
              toast('success', 'Password reset email sent', 'Check your inbox for the reset link');
            }
            setResetLoading(false);
          }}>
            Change Password
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-violet-500/10 flex items-center justify-center">
              <Palette className="h-5 w-5 text-violet-400" />
            </div>
            <div>
              <CardTitle className="text-base">Appearance</CardTitle>
              <CardDescription>Customize how the app looks</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-zinc-300">Theme</p>
              <p className="text-xs text-zinc-500 mt-0.5">Dark mode is currently the default. Light mode coming soon.</p>
            </div>
            <span className="text-xs text-zinc-500 bg-zinc-800 px-2.5 py-1 rounded-full">Dark</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-blue-500/10 flex items-center justify-center">
              <Download className="h-5 w-5 text-blue-400" />
            </div>
            <div>
              <CardTitle className="text-base">Data Export</CardTitle>
              <CardDescription>Download all your portfolio and transaction data</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <p className="text-sm text-zinc-400">Export all data as JSON for backup or migration.</p>
            <Button variant="outline" size="sm" loading={exportLoading} onClick={handleExportData}>
              <Download className="h-4 w-4" />
              Export
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-red-500/20">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-red-500/10 flex items-center justify-center">
              <AlertTriangle className="h-5 w-5 text-red-400" />
            </div>
            <div>
              <CardTitle className="text-base text-red-400">Danger Zone</CardTitle>
              <CardDescription>Irreversible actions</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-zinc-300">Delete account</p>
              <p className="text-xs text-zinc-500 mt-0.5">Permanently delete your account and all associated data.</p>
            </div>
            <Button variant="destructive" size="sm" onClick={() => setShowDeleteAccount(true)}>
              Delete Account
            </Button>
          </div>
        </CardContent>
      </Card>

      <Modal open={showDeleteAccount} onClose={() => setShowDeleteAccount(false)}>
        <ModalHeader>
          <ModalTitle>Delete Account</ModalTitle>
          <ModalDescription>This action is permanent and cannot be undone. All your portfolios, transactions, and settings will be deleted.</ModalDescription>
        </ModalHeader>
        <ModalFooter>
          <Button variant="ghost" onClick={() => setShowDeleteAccount(false)}>Cancel</Button>
          <Button variant="destructive" onClick={() => {
            toast('error', 'Account deletion is handled by support. Please contact support@example.com.');
            setShowDeleteAccount(false);
          }}>I understand, delete my account</Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}
