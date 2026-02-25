/**
 * Utility to extract latitude and longitude from Google Maps URLs.
 */

export interface Coordinates {
  lat: number
  lng: number
}

export const extractCoordsFromUrl = (url: string): Coordinates | null => {
  // Regex patterns for different Google Maps URL formats

  // 1. Pattern: @lat,lng (e.g., .../@-34.6037,-58.3816,15z...)
  const atPattern = /@(-?\d+\.\d+),(-?\d+\.\d+)/

  // 2. Pattern: q=lat,lng (e.g., ...?q=-34.6037,-58.3816...)
  const qPattern = /[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/

  // 3. Pattern: !3dlat!4dlng (e.g., ...!3d-34.6037!4d-58.3816...)
  const dPattern = /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/

  const patterns = [atPattern, qPattern, dPattern]

  for (const pattern of patterns) {
    const match = url.match(pattern)
    if (match && match[1] && match[2]) {
      return {
        lat: parseFloat(match[1]),
        lng: parseFloat(match[2])
      }
    }
  }

  return null
}
