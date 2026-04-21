import { motion } from 'motion/react';

export default function LoadingScreen({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`flex flex-col items-center justify-center gap-4 ${compact ? 'h-48' : 'min-h-[60vh]'}`}>
      {/* Animated dots */}
      <div className="flex items-center gap-1.5">
        {[0, 1, 2, 3, 4].map(i => (
          <motion.div
            key={i}
            className="h-2 w-2 rounded-full bg-primary"
            animate={{
              scale: [1, 1.8, 1],
              opacity: [0.3, 1, 0.3],
            }}
            transition={{
              duration: 1,
              repeat: Infinity,
              delay: i * 0.15,
              ease: 'easeInOut',
            }}
          />
        ))}
      </div>

      {/* Progress bar */}
      <div className="w-48 h-1 rounded-full bg-surface-hover overflow-hidden">
        <motion.div
          className="h-full rounded-full bg-gradient-to-r from-primary via-primary-hover to-primary"
          animate={{ x: ['-100%', '100%'] }}
          transition={{
            duration: 1.2,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
          style={{ width: '60%' }}
        />
      </div>

      {!compact && (
        <motion.p
          className="text-xs text-text-muted"
          animate={{ opacity: [0.4, 0.8, 0.4] }}
          transition={{ duration: 2, repeat: Infinity }}
        >
          Cargando...
        </motion.p>
      )}
    </div>
  );
}
