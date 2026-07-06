import { AISLE_ICONS } from '../constants';

export function getIcon(aisle) {
  if (!aisle) return AISLE_ICONS['default'];
  for (const [key, icon] of Object.entries(AISLE_ICONS)) {
    if (aisle.toLowerCase().includes(key.toLowerCase())) return icon;
  }
  return AISLE_ICONS['default'];
}

export function scaleQty(qpp, servings) {
  if (!qpp) return '';
  const match = String(qpp).match(/^([\d.]+)\s*(.*)$/);
  if (!match) return qpp;
  const scaled = Math.round(parseFloat(match[1]) * servings * 10) / 10;
  return `${scaled}${match[2] ? ' ' + match[2] : ''}`;
}

export async function copyToClipboard(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    await navigator.clipboard.writeText(text);
  } else {
    throw new Error('Clipboard API not available');
  }
}

// ── NEW RAG PRICING UTILITIES ──

export function parseQuantity(qtyStr) {
  if (!qtyStr) return { value: 1, unit: 'count' };
  
  const cleanStr = String(qtyStr).toLowerCase().trim();
  const match = cleanStr.match(/^([\d.]+)\s*([a-zA-Z]+)?/);
  if (!match) return { value: 1, unit: 'count' };
  
  const value = parseFloat(match[1]);
  let unit = match[2] || 'count';
  
  // Standardise common abbreviations
  if (unit === 'ltr' || unit === 'liters' || unit === 'litre' || unit === 'liter') unit = 'l';
  if (unit === 'ml' || unit === 'milliliters') unit = 'ml';
  if (unit === 'pieces' || unit === 'piece' || unit === 'pcs') unit = 'pc';
  if (unit === 'grams' || unit === 'gram' || unit === 'gms') unit = 'g';
  if (unit === 'kilograms' || unit === 'kilogram' || unit === 'kgs') unit = 'kg';
  if (unit === 'milligrams' || unit === 'mg') unit = 'mg';
  
  return { value, unit };
}

export function convertToBaseUnit(value, unit) {
  const cleanUnit = unit.toLowerCase();
  
  // Weight standard base: grams (g)
  if (cleanUnit === 'kg') return { value: value * 1000, baseUnit: 'g' };
  if (cleanUnit === 'g') return { value: value, baseUnit: 'g' };
  if (cleanUnit === 'mg') return { value: value / 1000, baseUnit: 'g' };
  
  // Volume standard base: milliliters (ml)
  if (cleanUnit === 'l') return { value: value * 1000, baseUnit: 'ml' };
  if (cleanUnit === 'ml') return { value: value, baseUnit: 'ml' };
  
  // Counts (pc, eggs, bananas, etc.)
  return { value, baseUnit: 'count' };
}

export function calculatePacksRequired(requiredQtyStr, packSizeStr) {
  if (!requiredQtyStr || !packSizeStr) return 1;

  const req = parseQuantity(requiredQtyStr);
  const pack = parseQuantity(packSizeStr);
  
  const reqBase = convertToBaseUnit(req.value, req.unit);
  const packBase = convertToBaseUnit(pack.value, pack.unit);
  
  // Incompatible unit types default to 1 pack to prevent shopping list blockages
  if (reqBase.baseUnit !== packBase.baseUnit) {
    return 1;
  }
  
  if (packBase.value <= 0) return 1;
  
  return Math.ceil(reqBase.value / packBase.value);
}
