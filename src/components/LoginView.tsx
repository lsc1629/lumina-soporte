import { useState } from 'react';
import { motion } from 'motion/react';
import { Headset, Mail, Lock, ArrowRight, Shield, User } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface LoginViewProps {
  onLogin: (role: 'admin' | 'client') => void;
  onForgotPassword: () => void;
}

export default function LoginView({ onLogin, onForgotPassword }: LoginViewProps) {
  const [role, setRole] = useState<'admin' | 'client'>('admin');
  const [isLoading, setIsLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    const { data, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError) {
      setError(authError.message === 'Invalid login credentials' 
        ? 'Credenciales inválidas. Verifica tu correo y contraseña.' 
        : authError.message === 'Email not confirmed'
        ? 'Debes confirmar tu correo electrónico antes de iniciar sesión.'
        : authError.message);
      setIsLoading(false);
      return;
    }

    if (data.user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', data.user.id)
        .single();

      const userRole = (profile?.role as 'admin' | 'client') || 'client';
      setIsLoading(false);
      onLogin(userRole);
    }
  };

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-background p-4 relative overflow-hidden">
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-primary/20 blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-secondary/20 blur-[120px] pointer-events-none"></div>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md"
      >
        <div className="glass-panel rounded-3xl p-8 shadow-2xl border border-border/50 relative overflow-hidden">
          <div className="flex flex-col items-center mb-8 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-secondary text-white shadow-lg glow-effect mb-4">
              <Headset size={32} />
            </div>
            <h1 className="font-display text-3xl font-bold tracking-tight text-white mb-1">
              Lumina<span className="text-primary">Support</span>
            </h1>
            <p className="text-sm text-text-muted">por Luis Salas Cortés</p>
          </div>

          <div className="flex p-1 mb-8 bg-surface/50 rounded-xl border border-border">
            <button
              type="button"
              onClick={() => setRole('admin')}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium rounded-lg transition-all ${
                role === 'admin' 
                  ? 'bg-primary text-white shadow-md' 
                  : 'text-text-muted hover:text-white'
              }`}
            >
              <Shield size={16} />
              Administrador
            </button>
            <button
              type="button"
              onClick={() => setRole('client')}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium rounded-lg transition-all ${
                role === 'client' 
                  ? 'bg-secondary text-white shadow-md shadow-secondary/20' 
                  : 'text-text-muted hover:text-white'
              }`}
            >
              <User size={16} />
              Cliente
            </button>
          </div>

          <form onSubmit={handleLogin} className="space-y-5">
            <div className="space-y-2">
              <label className="text-sm font-medium text-text-muted">Correo Electrónico</label>
              <div className="relative">
                <input 
                  type="email" 
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="correo@ejemplo.com"
                  className="w-full rounded-xl border border-border bg-surface/50 px-4 py-3 pl-11 text-sm text-white outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                />
                <Mail size={18} className="absolute left-4 top-3.5 text-text-muted" />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-text-muted">Contraseña</label>
                <button type="button" onClick={onForgotPassword} className="text-xs font-medium text-primary hover:text-primary-hover transition-colors">
                  ¿Olvidaste tu contraseña?
                </button>
              </div>
              <div className="relative">
                <input 
                  type="password" 
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-xl border border-border bg-surface/50 px-4 py-3 pl-11 text-sm text-white outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                />
                <Lock size={18} className="absolute left-4 top-3.5 text-text-muted" />
              </div>
            </div>

            {error && (
              <div className="rounded-lg bg-danger/10 border border-danger/20 px-4 py-3 text-sm text-danger">
                {error}
              </div>
            )}

            <button 
              type="submit"
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3.5 text-sm font-bold text-white transition-all hover:bg-primary-hover shadow-lg shadow-primary/20 disabled:opacity-70 mt-4"
            >
              {isLoading ? (
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : (
                <>
                  Iniciar Sesión
                  <ArrowRight size={18} />
                </>
              )}
            </button>
          </form>
        </div>
        
        <p className="text-center text-xs text-text-muted mt-8">
          &copy; {new Date().getFullYear()} Lumina Support. Todos los derechos reservados.
        </p>
      </motion.div>
    </div>
  );
}
