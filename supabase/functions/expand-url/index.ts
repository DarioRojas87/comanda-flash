import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { shortUrl } = await req.json()

    if (!shortUrl) {
      return new Response(JSON.stringify({ error: 'shortUrl is required' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      })
    }

    // Security check: only allow known Google Maps domains
    const trustedDomains = ['maps.app.goo.gl', 'goo.gl', 'maps.google.com', 'www.google.com']
    let url: URL
    try {
      url = new URL(shortUrl)
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid URL format' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      })
    }

    if (!trustedDomains.some((domain) => url.hostname.endsWith(domain))) {
      return new Response(JSON.stringify({ error: 'Domain not trusted' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 403,
      })
    }

    // Perform expansion
    const response = await fetch(shortUrl, {
      method: 'HEAD',
      redirect: 'follow',
    })

    return new Response(JSON.stringify({ expandedUrl: response.url }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return new Response(JSON.stringify({ error: message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})
