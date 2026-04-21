import { useState } from 'react';
import { motion } from 'motion/react';
import { Headset, Mail, ArrowLeft, CheckCircle2 } from 'lucide-react';

interface ForgotPasswordViewProps {
  onBack: () => void;
}

export default function ForgotPasswordView({ onBack }: ForgotPasswordViewProps) {
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setTimeout(() => {
      setIsLoading(false);
      setIsSubmitted(true);
    }, 800);
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
            <h1 className="font-display text-2xl font-bold tracking-tight text-white mb-2">
              Recuperar Contraseña
            </h1>
            <p className="text-sm text-text-muted">
              Ingresa tu correo electrónico y te enviaremos las instrucciones para restablecer tu contraseña.
            </p>
          </div>

          {isSubmitted ? (
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center text-center space-y-4 mb-6"
            >
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-success/20 text-success mb-2">
                <CheckCircle2 size={32} />
              </div>
              <h2 className="text-lg font-semibold text-white">¡Correo Enviado!</h2>
              <p className="text-sm text-text-muted">
                Hemos enviado un enlace de recuperación a tu correo electrónico. Por favor revisa tu bandeja de entrada o carpeta de spam.
              </p>
            </motion.div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <label className="text-sm font-medium text-text-muted">Correo Electrónico</label>
                <div className="relative">
                  <input 
                    type="email" 
                    required
                    placeholder="tu@correo.com"
                    className="w-full rounded-xl border border-border bg-surface/50 px-4 py-3 pl-11 text-sm text-white outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                  />
                  <Mail size={18} className="absolute left-4 top-3.5 text-text-muted" />
                </div>
              </div>

              <button 
                type="submit"
                disabled={isLoading}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3.5 text-sm font-bold text-white transition-all hover:bg-primary-hover shadow-lg shadow-primary/20 disabled:opacity-70 mt-4"
              >
                {isLoading ? (
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                ) : (
                  'Enviar Enlace de Recuperación'
                )}
              </button>
            </form>
          )}

          <div className="mt-8 text-center">
            <button 
              onClick={onBack}
              className="inline-flex items-center gap-2 text-sm font-medium text-text-muted hover:text-white transition-colors"
            >
              <ArrowLeft size={16} />
              Volver al inicio de sesión
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
