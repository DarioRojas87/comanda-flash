import React, { useState } from 'react'
import { useGoogleMaps } from '../hooks/useGoogleMaps'

export const GoogleMapsTester: React.FC = () => {
  const [url, setUrl] = useState('')
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null)
  const { processShortUrl, loading, error } = useGoogleMaps()

  const handleProcess = async () => {
    const result = await processShortUrl(url)
    if (result) {
      setCoords(result)
    }
  }

  return (
    <div className="p-4 border rounded-lg shadow-sm bg-white dark:bg-gray-800">
      <h2 className="text-xl font-bold mb-4">Google Maps Link Extractor</h2>

      <div className="flex flex-col gap-2">
        <label htmlFor="maps-url" className="text-sm font-medium">
          Paste WhatsApp/Google Maps short link:
        </label>
        <input
          id="maps-url"
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://maps.app.goo.gl/..."
          className="p-2 border rounded dark:bg-gray-700 dark:border-gray-600"
        />
        <button
          onClick={handleProcess}
          disabled={loading || !url}
          className="bg-blue-600 text-white p-2 rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? 'Processing...' : 'Extract Coordinates'}
        </button>
      </div>

      {error && (
        <div className="mt-4 p-2 bg-red-100 text-red-700 rounded border border-red-200">
          {error}
        </div>
      )}

      {coords && (
        <div className="mt-4 p-4 bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-300 rounded border border-green-200 dark:border-green-800">
          <p className="font-semibold">Coordinates Extracted:</p>
          <p>Latitude: {coords.lat}</p>
          <p>Longitude: {coords.lng}</p>
          <a
            href={`https://www.google.com/maps?q=${coords.lat},${coords.lng}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:underline text-sm block mt-2"
          >
            Verify on Google Maps
          </a>
        </div>
      )}
    </div>
  )
}
