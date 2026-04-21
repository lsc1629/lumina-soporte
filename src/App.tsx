import { useState } from 'react';
import MainLayout from '@/components/MainLayout';
import ClientLayout from '@/components/ClientLayout';
import LoginView from '@/components/LoginView';
import ForgotPasswordView from '@/components/ForgotPasswordView';
import ClientPreviewSelector from '@/components/ClientPreviewSelector';

export default function App() {
  const [authState, setAuthState] = useState<'login' | 'admin' | 'client' | 'forgot-password' | 'admin-select-client' | 'admin-preview-client'>('login');
  const [previewClientId, setPreviewClientId] = useState<string | null>(null);

  if (authState === 'login') return <LoginView onLogin={setAuthState} onForgotPassword={() => setAuthState('forgot-password')} />;
  if (authState === 'forgot-password') return <ForgotPasswordView onBack={() => setAuthState('login')} />;
  if (authState === 'admin') return <MainLayout onLogout={() => setAuthState('login')} onPreviewClient={() => setAuthState('admin-select-client')} />;
  if (authState === 'client') return <ClientLayout onLogout={() => setAuthState('login')} />;
  if (authState === 'admin-select-client') return <ClientPreviewSelector onSelect={(id) => { setPreviewClientId(id); setAuthState('admin-preview-client'); }} onBack={() => setAuthState('admin')} />;
  if (authState === 'admin-preview-client') return <ClientLayout onLogout={() => setAuthState('login')} onBackToAdmin={() => { setPreviewClientId(null); setAuthState('admin'); }} previewClientId={previewClientId} />;

  return null;
}
