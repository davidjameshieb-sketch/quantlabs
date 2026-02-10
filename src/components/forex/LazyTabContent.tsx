import { useState, ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, PlayCircle } from 'lucide-react';

interface LazyTabContentProps {
  label: string;
  children: ReactNode;
}

export const LazyTabContent = ({ label, children }: LazyTabContentProps) => {
  const [loaded, setLoaded] = useState(false);

  if (!loaded) {
    return (
      <Card className="border-border/30 bg-card/50">
        <CardContent className="flex flex-col items-center justify-center py-16 gap-4">
          <PlayCircle className="w-10 h-10 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{label}</span> is not loaded to keep the page fast.
          </p>
          <Button variant="outline" size="sm" onClick={() => setLoaded(true)} className="gap-2">
            <Loader2 className="w-3.5 h-3.5" />
            Load {label}
          </Button>
        </CardContent>
      </Card>
    );
  }

  return <>{children}</>;
};
