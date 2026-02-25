export function parseLocationUrl(url: string): { lat: number; lng: number } | null {
  if (!url) return null

  // Typical Google maps URL with @lat,lng
  // https://www.google.com/maps/@-34.60,-58.38,15z
  const regexAt = /@(-?\d+\.\d+),(-?\d+\.\d+)/
  const matchAt = url.match(regexAt)
  if (matchAt) {
    return {
      lat: parseFloat(matchAt[1]),
      lng: parseFloat(matchAt[2])
    }
  }

  // Google maps URL with q=lat,lng
  // https://maps.google.com/?q=-34.60,-58.38
  const regexQ = /[?&]q=(-?\d+\.\d+)[,%](-?\d+\.\d+)/
  const matchQ = url.match(regexQ)
  if (matchQ) {
    return {
      lat: parseFloat(matchQ[1]),
      lng: parseFloat(matchQ[2])
    }
  }

  // Google Maps short URLs (requires expansion in a real app,
  // but for simple regex we just support raw coordinates if present)
  // For other WhatsApp shared locations with native coordinates
  const regexGeneric = /(-?\d+\.\d+),\s*(-?\d+\.\d+)/
  const matchGeneric = url.match(regexGeneric)
  if (matchGeneric) {
    return {
      lat: parseFloat(matchGeneric[1]),
      lng: parseFloat(matchGeneric[2])
    }
  }

  return null
}
