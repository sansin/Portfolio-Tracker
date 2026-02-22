import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data, error } = await supabase
    .from('portfolios')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[portfolios] GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch portfolios' }, { status: 500 });
  }

  return NextResponse.json({ data });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();

  // Input validation
  const name = body.name?.trim();
  if (!name || name.length > 100) {
    return NextResponse.json({ error: 'Portfolio name must be 1-100 characters' }, { status: 400 });
  }
  if (body.color && !/^#[0-9a-fA-F]{6}$/.test(body.color)) {
    return NextResponse.json({ error: 'Invalid color format (use #RRGGBB)' }, { status: 400 });
  }
  if (body.description && body.description.length > 500) {
    return NextResponse.json({ error: 'Description must be under 500 characters' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('portfolios')
    .insert({
      user_id: user.id,
      name,
      description: body.description || null,
      color: body.color || '#6366f1',
      is_default: body.is_default || false,
    })
    .select()
    .single();

  if (error) {
    console.error('[portfolios] POST error:', error);
    return NextResponse.json({ error: 'Failed to create portfolio' }, { status: 500 });
  }

  return NextResponse.json({ data }, { status: 201 });
}
