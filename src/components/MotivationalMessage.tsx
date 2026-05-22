import { motion } from 'framer-motion';
import { Quote } from 'lucide-react';

interface Props {
  message: string;
}

export function MotivationalMessage({ message }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex items-start gap-3 px-5 py-4 rounded-xl border border-subtle bg-gradient-to-r from-accent-soft via-card to-card"
    >
      <Quote size={16} className="text-accent-fg shrink-0 mt-0.5" />
      <p className="text-sm text-secondary italic">{message}</p>
    </motion.div>
  );
}
