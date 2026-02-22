import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data, error } = await supabase
    .from('portfolios')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  if (error) {
    return NextResponse.json({ error: 'Portfolio not found' }, { status: 404 });
  }

  return NextResponse.json({ data });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();

  // Input validation (mirrors POST)
  if (body.name !== undefined) {
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name || name.length > 100) {
      return NextResponse.json({ error: 'Portfolio name must be 1-100 characters' }, { status: 400 });
    }
    body.name = name;
  }
  if (body.color !== undefined && !/^#[0-9a-fA-F]{6}$/.test(body.color)) {
    return NextResponse.json({ error: 'Invalid color format (use #RRGGBB)' }, { status: 400 });
  }
  if (body.description !== undefined && body.description !== null && body.description.length > 500) {
    return NextResponse.json({ error: 'Description must be under 500 characters' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('portfolios')
    .update({
      name: body.name,
      description: body.description,
      color: body.color,
      is_default: body.is_default,
    })
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single();

  if (error) {
    console.error('[portfolios/id] PATCH error:', error);
    return NextResponse.json({ error: 'Failed to update portfolio' }, { status: 500 });
  }

  return NextResponse.json({ data });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { error } = await supabase
    .from('portfolios')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) {
    console.error('[portfolios/id] DELETE error:', error);
    return NextResponse.json({ error: 'Failed to delete portfolio' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
