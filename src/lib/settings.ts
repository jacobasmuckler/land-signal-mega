import { prisma } from './prisma';

const defaults: Record<string, string> = {
  centerName: 'Uptown Charlotte, NC',
  centerLat: '35.2271',
  centerLng: '-80.8431',
  radiusMiles: '100',
  minAcres: '20',
  gmailMaxResults: '100',
  alertEmail: process.env.ALERT_TO_EMAIL || '',
  gmailSearchQuery: 'newer_than:30d (from:crexi OR from:landwatch OR from:land.com OR from:landsofamerica OR from:landandfarm OR from:support@land.com) -subject:"weekly report" -subject:"daily report" -subject:recap',
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
