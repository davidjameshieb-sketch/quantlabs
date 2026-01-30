import { useEffect, useRef } from 'react';

interface Node {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  connections: number[];
}

export const NeuralBackground = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const nodesRef = useRef<Node[]>([]);
  const animationRef = useRef<number>();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // Initialize nodes
    const nodeCount = Math.floor((canvas.width * canvas.height) / 25000);
    nodesRef.current = Array.from({ length: nodeCount }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 0.5,
      vy: (Math.random() - 0.5) * 0.5,
      radius: Math.random() * 2 + 1,
      connections: [],
    }));

    const animate = () => {
      if (!ctx || !canvas) return;

      ctx.fillStyle = 'rgba(10, 12, 18, 0.1)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const nodes = nodesRef.current;
      const connectionDistance = 150;

      // Update and draw nodes
      nodes.forEach((node, i) => {
        // Update position
        node.x += node.vx;
        node.y += node.vy;

        // Bounce off edges
        if (node.x < 0 || node.x > canvas.width) node.vx *= -1;
        if (node.y < 0 || node.y > canvas.height) node.vy *= -1;

        // Keep in bounds
        node.x = Math.max(0, Math.min(canvas.width, node.x));
        node.y = Math.max(0, Math.min(canvas.height, node.y));

        // Draw connections
        for (let j = i + 1; j < nodes.length; j++) {
          const other = nodes[j];
          const dx = other.x - node.x;
          const dy = other.y - node.y;
          const distance = Math.sqrt(dx * dx + dy * dy);

          if (distance < connectionDistance) {
            const opacity = (1 - distance / connectionDistance) * 0.5;
            const gradient = ctx.createLinearGradient(node.x, node.y, other.x, other.y);
            gradient.addColorStop(0, `hsla(185, 100%, 50%, ${opacity})`);
            gradient.addColorStop(1, `hsla(270, 60%, 50%, ${opacity})`);
            
            ctx.beginPath();
            ctx.strokeStyle = gradient;
            ctx.lineWidth = 0.5;
            ctx.moveTo(node.x, node.y);
            ctx.lineTo(other.x, other.y);
            ctx.stroke();
          }
        }

        // Draw node
        const nodeGradient = ctx.createRadialGradient(
          node.x, node.y, 0,
          node.x, node.y, node.radius * 3
        );
        nodeGradient.addColorStop(0, 'hsla(185, 100%, 60%, 0.8)');
        nodeGradient.addColorStop(0.5, 'hsla(270, 60%, 50%, 0.4)');
        nodeGradient.addColorStop(1, 'transparent');

        ctx.beginPath();
        ctx.fillStyle = nodeGradient;
        ctx.arc(node.x, node.y, node.radius * 3, 0, Math.PI * 2);
        ctx.fill();

        ctx.beginPath();
        ctx.fillStyle = 'hsla(185, 100%, 70%, 0.9)';
        ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
        ctx.fill();
      });

      animationRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 -z-10"
      style={{ background: 'linear-gradient(180deg, hsl(230 25% 5%) 0%, hsl(230 30% 3%) 100%)' }}
    />
  );
};
