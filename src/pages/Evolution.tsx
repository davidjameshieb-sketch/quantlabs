import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { EvolutionContent } from '@/components/dashboard/evolution/EvolutionContent';
import { motion } from 'framer-motion';
import { Dna } from 'lucide-react';
import { IntelligenceModeBadge } from '@/components/dashboard/IntelligenceModeBadge';

const EvolutionPage = () => {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
          <div className="flex items-center gap-3 mb-1">
            <Dna className="w-7 h-7 text-[hsl(var(--neural-purple))]" />
            <h1 className="font-display text-2xl md:text-3xl font-bold text-gradient-neural">
              Market Evolution
            </h1>
            <IntelligenceModeBadge />
          </div>
          <p className="text-muted-foreground text-sm">
            Living ecosystem intelligence — controlled mutation, risk-anchored evolution, meta-governed adaptation.
          </p>
        </motion.div>
        <EvolutionContent />
      </div>
    </DashboardLayout>
  );
};

export default EvolutionPage;
