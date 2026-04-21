import { useParams } from 'react-router-dom';
import PublicStatusPage from '@/components/PublicStatusPage';
import { SUPABASE_URL as supabaseUrl, SUPABASE_ANON_KEY as supabaseAnonKey } from '@/lib/supabase';

export default function StatusPageRoute() {
  const { slug } = useParams<{ slug: string }>();

  if (!slug) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-text-muted">
        <p>Slug no proporcionado</p>
      </div>
    );
  }

  return (
    <PublicStatusPage
      slug={slug}
      supabaseUrl={supabaseUrl}
      supabaseAnonKey={supabaseAnonKey}
    />
  );
}
