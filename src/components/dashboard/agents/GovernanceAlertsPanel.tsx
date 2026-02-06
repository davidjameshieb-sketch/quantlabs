// Governance Alerts Panel
// Real-time alerts when Meta-Controller intervenes

import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, Bell, ShieldAlert, Info, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { GovernanceAlert, ALERT_LABELS } from '@/lib/agents/ledgerTypes';
import { AGENT_DEFINITIONS } from '@/lib/agents/agentConfig';
import { cn } from '@/lib/utils';

interface GovernanceAlertsPanelProps {
  alerts: GovernanceAlert[];
}

const severityConfig = {
  info: {
    icon: <Info className="w-3.5 h-3.5" />,
    color: 'border-primary/30 bg-primary/5',
    badge: 'bg-primary/20 text-primary border-primary/30',
    iconColor: 'text-primary',
  },
  warning: {
    icon: <AlertTriangle className="w-3.5 h-3.5" />,
    color: 'border-neural-orange/30 bg-neural-orange/5',
    badge: 'bg-neural-orange/20 text-neural-orange border-neural-orange/30',
    iconColor: 'text-neural-orange',
  },
  critical: {
    icon: <ShieldAlert className="w-3.5 h-3.5" />,
    color: 'border-neural-red/30 bg-neural-red/5',
    badge: 'bg-neural-red/20 text-neural-red border-neural-red/30',
    iconColor: 'text-neural-red',
  },
};

const formatTimeAgo = (ts: number) => {
  const mins = Math.floor((Date.now() - ts) / 60000);
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ago`;
};

export const GovernanceAlertsPanel = ({ alerts }: GovernanceAlertsPanelProps) => {
  if (alerts.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Bell className="w-4 h-4 text-neural-orange" />
        <h4 className="text-xs font-display font-bold">Governance Alerts</h4>
        <Badge variant="outline" className="text-[10px] bg-neural-orange/10 text-neural-orange border-neural-orange/30">
          {alerts.filter(a => !a.resolved).length} active
        </Badge>
      </div>

      <div className="space-y-1.5">
        <AnimatePresence>
          {alerts.map((alert, i) => {
            const config = severityConfig[alert.severity];
            const agentDef = AGENT_DEFINITIONS[alert.agentId];
            return (
              <motion.div
                key={alert.id}
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className={cn(
                  'p-2.5 rounded-lg border transition-colors',
                  config.color,
                  alert.resolved && 'opacity-50'
                )}
              >
                <div className="flex items-start gap-2">
                  <span className={cn('mt-0.5 shrink-0', config.iconColor)}>{config.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <div className="flex items-center gap-1.5">
                        <Badge variant="outline" className={cn('text-[9px] px-1.5 py-0', config.badge)}>
                          {ALERT_LABELS[alert.type]}
                        </Badge>
                        <span className="text-[10px]">{agentDef.icon}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {alert.resolved && (
                          <span className="text-[9px] text-neural-green font-medium">Resolved</span>
                        )}
                        <span className="text-[10px] text-muted-foreground">{formatTimeAgo(alert.timestamp)}</span>
                      </div>
                    </div>
                    <p className="text-[10px] text-muted-foreground leading-relaxed">{alert.description}</p>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
};
