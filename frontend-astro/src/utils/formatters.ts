// Currency formatters
export const formatIDR = (amount: number): string => {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
};

export const formatUSD = (amount: number): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount);
};

// Number formatters
export const formatNumber = (num: number): string => {
  return new Intl.NumberFormat('id-ID').format(num);
};

export const formatCompactNumber = (num: number): string => {
  return new Intl.NumberFormat('id-ID', {
    notation: 'compact',
    compactDisplay: 'short',
  }).format(num);
};

// Percentage formatter
export const formatPercentage = (value: number, decimals = 2): string => {
  return `${(value * 100).toFixed(decimals)}%`;
};

// Date formatters
export const formatDate = (date: string | Date): string => {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('id-ID', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(d);
};

export const formatDateShort = (date: string | Date): string => {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('id-ID', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(d);
};

// Pokemon type colors
export const getTypeColor = (type: string): string => {
  const colors: Record<string, string> = {
    fire: 'bg-red-500 text-white',
    water: 'bg-blue-500 text-white',
    grass: 'bg-green-500 text-white',
    lightning: 'bg-yellow-500 text-black',
    psychic: 'bg-purple-500 text-white',
    fighting: 'bg-orange-700 text-white',
    darkness: 'bg-slate-800 text-white',
    metal: 'bg-gray-500 text-white',
    fairy: 'bg-pink-400 text-white',
    dragon: 'bg-indigo-600 text-white',
    colorless: 'bg-gray-300 text-black',
  };
  return colors[type?.toLowerCase()] || 'bg-gray-400 text-white';
};

// Rarity colors
export const getRarityColor = (rarity: string): string => {
  const colors: Record<string, string> = {
    c: 'text-gray-500',
    u: 'text-blue-500',
    r: 'text-purple-500',
    rr: 'text-pink-500',
    sr: 'text-yellow-500',
    sar: 'text-orange-500',
    ur: 'text-red-500',
  };
  return colors[rarity?.toLowerCase()] || 'text-gray-500';
};

// Slugify
export const slugify = (text: string): string => {
  return text
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\w\-]+/g, '')
    .replace(/\-\-+/g, '-')
    .trim();
};

// Truncate text
export const truncate = (text: string, maxLength: number): string => {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + '...';
};

// Debounce function
export const debounce = <T extends (...args: any[]) => any>(
  func: T,
  wait: number
): ((...args: Parameters<T>) => void) => {
  let timeout: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
};

// Throttle function
export const throttle = <T extends (...args: any[]) => any>(
  func: T,
  limit: number
): ((...args: Parameters<T>) => void) => {
  let inThrottle: boolean;
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
};

// Calculate exchange rate
export const convertUSDtoIDR = (usd: number, rate: number): number => {
  return usd * rate;
};

export const convertIDRtoUSD = (idr: number, rate: number): number => {
  return idr / rate;
};

// Capitalize first letter
export const capitalize = (text: string): string => {
  return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
};

// Format regulation mark
export const formatRegulationMark = (mark: string): string => {
  return mark.toUpperCase();
};
