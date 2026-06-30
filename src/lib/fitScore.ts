export function calculateFitScore(args: { acreage: number; distance?: number | null; pricePerAcre?: number | null; zoning?: string | null; brokerEmail?: string | null; brokerPhone?: string | null }) {
  let score = 1;
  if (args.acreage >= 20) score += 1;
  if (args.acreage >= 50) score += 1;
  if (args.acreage >= 100) score += 1;
  if (args.distance != null && args.distance <= 50) score += 2;
  else if (args.distance != null && args.distance <= 100) score += 1;
  if (args.pricePerAcre != null && args.pricePerAcre < 50000) score += 2;
  else if (args.pricePerAcre != null && args.pricePerAcre < 100000) score += 1;
  if (args.zoning && /industrial|commercial|light industrial|heavy industrial/i.test(args.zoning)) score += 2;
  if (args.brokerEmail || args.brokerPhone) score += 1;
  return Math.min(10, score);
}
