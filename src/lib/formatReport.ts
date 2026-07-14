// AI report text comes back as light markdown — render **bold** and
// [label](url) links, escape everything else, and drop tracking tails.
export function formatReport(text: string) {
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\?utm_source=openai/g, '')
    .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer" style="color:var(--cyan);text-decoration:underline">$1</a>')
    .replace(/\*\*(.+?)\*\*/g, '<b style="color:var(--amber)">$1</b>')
    .replace(/^#+\s*(.+)$/gm, '<b style="color:var(--amber)">$1</b>');
}

export const REPORT_META: Record<string, { icon: string; label: string }> = {
  deal: { icon: '💰', label: 'Deal analysis' },
  areastats: { icon: '📈', label: 'Exact area stats (county records)' },
  market: { icon: '📊', label: 'Market stats' },
  full: { icon: '📋', label: 'Zoning · schools · comps' },
  utilities: { icon: '⚡', label: 'Utilities' },
  soil: { icon: '🌱', label: 'Soil / septic' },
};

export const REPORT_ORDER = ['deal', 'areastats', 'market', 'full', 'utilities', 'soil'];
