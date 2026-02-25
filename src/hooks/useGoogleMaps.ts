import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { extractCoordsFromUrl, type Coordinates } from '../utils/googleMapsParser'

export const useGoogleMaps = () => {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const processShortUrl = async (shortUrl: string): Promise<Coordinates | null> => {
    setLoading(true)
    setError(null)

    try {
      // 1. Call the Supabase Edge Function to expand the URL
      const { data, error: functionError } = await supabase.functions.invoke('expand-url', {
        body: { shortUrl }
      })

      if (functionError) {
        throw new Error(functionError.message || 'Error expanding URL')
      }

      if (data?.error) {
        throw new Error(data.error)
      }

      const expandedUrl = data?.expandedUrl

      if (!expandedUrl) {
        throw new Error('No expanded URL returned')
      }

      // 2. Parse the coordinates from the expanded URL
      const coords = extractCoordsFromUrl(expandedUrl)

      if (!coords) {
        throw new Error('Could not extract coordinates from the expanded URL')
      }

      return coords
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error processing Google Maps link'
      setError(message)
      console.error('useGoogleMaps Error:', err)
      return null
    } finally {
      setLoading(false)
    }
  }

  return {
    processShortUrl,
    loading,
    error
  }
}
