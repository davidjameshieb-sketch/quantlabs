// Stripe product and price configuration for QuantLabs Edge Access
// These IDs map to actual Stripe resources — update here if prices change

export const STRIPE_CONFIG = {
  edge: {
    product_id: "prod_Tviz4qSCNegI8W",
    price_id: "price_1SxrXzEs4tTFGskp7uqVmJyq",
    name: "QuantLabs Edge Access",
    price: 45,
    originalPrice: 95,
    interval: "month" as const,
  },
} as const;

export const isEdgeProduct = (productId: string | null): boolean => {
  return productId === STRIPE_CONFIG.edge.product_id;
};
