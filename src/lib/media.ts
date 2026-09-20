/**
 * Shared imagery.
 *
 * The hero photograph is named once. It was a literal inside Hero.tsx, and this
 * repository has twice had to sweep dead image URLs that had been copied
 * between files; a second literal on the sign-in page would be a third chance
 * to make the same mistake.
 *
 * Unsplash resizes per `w`, so each surface asks for roughly the width it
 * renders instead of every surface pulling the 2400px original. Nothing new is
 * introduced here — this is the photograph the homepage already ships.
 */
const HERO_PHOTO = 'https://images.unsplash.com/photo-1465495976277-4387d4b0b4c6';

export function heroPhotoUrl(width: number): string {
  return `${HERO_PHOTO}?ixlib=rb-1.2.1&auto=format&fit=crop&w=${width}&q=80`;
}
