/**
 * User.avatar historically holds EITHER 2-char initials (legacy rows) or an
 * actual picture — a Cloudinary https URL from the profile upload, or a
 * data:image base64 string. Callers need to know which before rendering, so
 * they can show an <Image> and fall back to initials only when there's no photo.
 */
export const isPhoto = (a) => typeof a === 'string' && /^(https?:|data:image)/.test(a);

/** Photo URI for a user, or null when they have none set. */
export const photoUri = (a) => (isPhoto(a) ? a : null);

/** Fallback monogram: first letter of the first two words (e.g. "Abid Khan" → "AK"). */
export const initialsOf = (name = '') => {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'U';
  const first = parts[0][0] || '';
  const second = parts.length > 1 ? (parts[1][0] || '') : (parts[0][1] || '');
  return (first + second).toUpperCase() || 'U';
};
