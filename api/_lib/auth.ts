import { createAnonClientWithAuth } from './supabase';

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export const getBearerToken = (req: any): string | null => {
  const header = req.headers?.authorization || req.headers?.Authorization;
  if (typeof header !== 'string') return null;
  const [scheme, token] = header.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) return null;
  return token;
};

export const requireUser = async (req: any) => {
  const token = getBearerToken(req);
  if (!token) throw new ApiError(401, 'Unauthorized');

  const authedSupabase = createAnonClientWithAuth(token);
  const { data, error } = await authedSupabase.auth.getUser();
  if (error || !data.user) throw new ApiError(401, 'Unauthorized');

  return { user: data.user, token, authedSupabase };
};

export const getUserRole = async (authedSupabase: any, userId: string): Promise<'student' | 'parent' | null> => {
  const { data, error } = await authedSupabase
    .from('users')
    .select('role')
    .eq('id', userId)
    .single();

  if (error || !data?.role) return null;
  if (data.role === 'student' || data.role === 'parent') return data.role;
  return null;
};
