import { useParams } from 'react-router-dom';
import PublicStatusPage from '@/components/PublicStatusPage';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

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
