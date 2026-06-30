import { prisma } from './prisma';

const defaults: Record<string, string> = {
  centerName: 'Uptown Charlotte, NC',
  centerLat: '35.2271',
  centerLng: '-80.8431',
  radiusMiles: '100',
  minAcres: '20',
  gmailMaxResults: '100',
  alertEmail: process.env.ALERT_TO_EMAIL || '',
  gmailSearchQuery: 'newer_than:7d (from:crexi OR from:zillow OR from:landwatch OR from:redfin OR from:realtor OR from:loopnet OR subject:land OR subject:acre OR subject:acres OR subject:listing OR subject:auction OR subject:foreclosure OR subject:"coming soon" OR subject:rezoning)',
};

export async function getSetting(key: string) {
  const row = await prisma.setting.findUnique({ where: { key } });
  return row?.value ?? defaults[key] ?? '';
}

export async function getSettings() {
  const rows = await prisma.setting.findMany();
  const merged = { ...defaults };
  for (const row of rows) merged[row.key] = row.value;
  return merged;
}

export async function saveSettings(values: Record<string, string>) {
  for (const [key, value] of Object.entries(values)) {
    await prisma.setting.upsert({ where: { key }, create: { key, value }, update: { value } });
  }
}
