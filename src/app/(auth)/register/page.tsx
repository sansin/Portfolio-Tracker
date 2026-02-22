'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { toast } from '@/components/ui/toast';
import { ROUTES, APP_NAME } from '@/lib/constants';

export default function RegisterPage() {
  const router = useRouter();
  const [loading, setLoading] = React.useState(false);
  const [form, setForm] = React.useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  function validate() {
    const errs: Record<string, string> = {};
    if (!form.name.trim()) errs.name = 'Name is required';
    if (!form.email.trim()) errs.email = 'Email is required';
    if (form.password.length < 8) errs.password = 'Password must be at least 8 characters';
    if (form.password !== form.confirmPassword) errs.confirmPassword = 'Passwords do not match';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    setLoading(true);
    const supabase = createClient();

    const { error } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
      options: {
        data: {
          full_name: form.name,
        },
      },
    });

    if (error) {
      // Supabase returns this when the email is already registered
      if (
        error.message.toLowerCase().includes('already registered') ||
        error.message.toLowerCase().includes('already been registered') ||
        error.message.toLowerCase().includes('user already registered')
      ) {
        setErrors({ email: 'An account with this email already exists.' });
        toast('error', 'Account already exists', 'Try signing in instead.');
      } else {
        toast('error', 'Registration failed', error.message);
      }
      setLoading(false);
      return;
    }

    toast('success', 'Account created!', 'Check your email to verify your account.');
    router.push(ROUTES.LOGIN);
  }

  function update(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: '' }));
  }

  return (
    <div className="animate-fade-in">
      <div className="text-center mb-8">
        <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-600 mb-4">
          <span className="text-white font-bold text-lg">F</span>
        </div>
        <h1 className="text-2xl font-bold text-zinc-100">{APP_NAME}</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Create your account</CardTitle>
          <CardDescription>Start tracking your portfolio in minutes</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleRegister} className="space-y-4">
            <Input
              label="Full name"
              placeholder="John Doe"
              value={form.name}
              onChange={(e) => update('name', e.target.value)}
              error={errors.name}
              autoComplete="name"
            />
            <Input
              label="Email"
              type="email"
              placeholder="you@example.com"
              value={form.email}
              onChange={(e) => update('email', e.target.value)}
              error={errors.email}
              autoComplete="email"
            />
            <Input
              label="Password"
              type="password"
              placeholder="••••••••"
              value={form.password}
              onChange={(e) => update('password', e.target.value)}
              error={errors.password}
              autoComplete="new-password"
            />
            <Input
              label="Confirm password"
              type="password"
              placeholder="••••••••"
              value={form.confirmPassword}
              onChange={(e) => update('confirmPassword', e.target.value)}
              error={errors.confirmPassword}
              autoComplete="new-password"
            />
            <Button type="submit" className="w-full" loading={loading}>
              Create account
            </Button>
          </form>

          {errors.email?.includes('already exists') && (
            <div className="mt-4 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-center">
              <p className="text-sm text-amber-300">
                This email is already registered.{' '}
                <Link href={ROUTES.LOGIN} className="font-medium text-indigo-400 hover:text-indigo-300 underline">
                  Sign in instead
                </Link>
              </p>
            </div>
          )}

          <p className="text-center text-sm text-zinc-500 mt-6">
            Already have an account?{' '}
            <Link href={ROUTES.LOGIN} className="text-indigo-400 hover:text-indigo-300 transition-colors">
              Sign in
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
