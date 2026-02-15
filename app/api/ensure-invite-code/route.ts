import { NextResponse } from 'next/server';
import { createAuthedSupabase, supabaseAdmin } from '../_lib/supabaseServer';

const generateCode = () => Math.random().toString(36).slice(2, 8).toUpperCase();

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get('authorization');
    const authedClient = createAuthedSupabase(authHeader);
    const { data: authResult, error: authError } = await authedClient.auth.getUser();

    if (authError || !authResult.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = authResult.user.id;

    const { data: userRow, error: rowError } = await supabaseAdmin
      .from('users')
      .select('id, role, my_invite_code')
      .eq('id', userId)
      .single();

    if (rowError || !userRow || userRow.role !== 'parent') {
      return NextResponse.json({ error: 'Parent not found' }, { status: 404 });
    }

    if (userRow.my_invite_code) {
      return NextResponse.json({ code: userRow.my_invite_code });
    }

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const nextCode = generateCode();
      const { error: updateError } = await supabaseAdmin
        .from('users')
        .update({ my_invite_code: nextCode })
        .eq('id', userId)
        .is('my_invite_code', null);

      if (!updateError) {
        return NextResponse.json({ code: nextCode });
      }
    }

    return NextResponse.json({ error: 'Failed to generate code' }, { status: 500 });
  } catch (error) {
    console.error('ensure invite code error:', error);
    return NextResponse.json({ error: 'Failed to ensure invite code' }, { status: 500 });
  }
}
