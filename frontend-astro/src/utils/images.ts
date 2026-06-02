const API_BASE_URL = (import.meta.env.PUBLIC_API_URL || 'http://localhost:8080/api/v1').replace(/\/$/, '');
const BLOCKED_IMAGE_HOSTS = new Set([
  'pub-61ccf1b9e1ab4037b28e968ea11d9d1f.r2.dev',
]);

export function cardImageSrc(imageUrl?: string | null): string {
  if (!imageUrl) {
    return '';
  }

  if (imageUrl.startsWith('/')) {
    return imageUrl;
  }

  try {
    const parsed = new URL(imageUrl);
    if (BLOCKED_IMAGE_HOSTS.has(parsed.hostname)) {
      return '/placeholder-card.png';
    }
  } catch {
    return '/placeholder-card.png';
  }

  return `${API_BASE_URL}/cards/image-proxy?url=${encodeURIComponent(imageUrl)}`;
}

export function setPlaceholderImage(target: EventTarget | null) {
  const image = target as HTMLImageElement | null;
  if (!image || image.src.endsWith('/placeholder-card.png')) {
    return;
  }
  image.src = '/placeholder-card.png';
}
