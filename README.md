# Weather

Updated: April 30, 2026

Weather is a static web app for viewing New York rain forecasts. It uses Weather.gov hourly forecast data for regional rain timing, Mapbox for the base map, and RainViewer radar tiles for live precipitation overlays.

## Features

- New York State map with regional forecast markers
- Live radar precipitation overlay
- Regional rain likelihood cards
- NYC approximate rain windows
- Next 12-hour NYC forecast

## Changes Made

- Renamed the app to Weather.
- Added a Mapbox-powered New York map.
- Added regional markers for New York City, Long Island, Hudson Valley, Capital Region, Catskills, Adirondacks, North Country, Central NY, Southern Tier, Finger Lakes, and Western NY.
- Added RainViewer radar tiles so rain appears as live precipitation patches on the map.
- Kept Weather.gov as the source for hourly forecast and rain timing data.
- Added `config.example.js` so the Mapbox API key is configured locally.
- Added `.gitignore` so `config.js` and local server logs are not committed.

## Mapbox API Key

A Mapbox public access token is required for the map.

### How To Get A Key

1. Go to https://account.mapbox.com/.
2. Create a Mapbox account or sign in.
3. Open the Access Tokens page: https://account.mapbox.com/access-tokens/.
4. Use the default public token or create a new public token.
5. The token should start with `pk.`.

### How To Use It

1. Copy `config.example.js` and rename the copy to `config.js`.
2. Replace `YOUR_MAPBOX_PUBLIC_TOKEN` with your Mapbox public token.
3. Keep `config.js` private; it is ignored by Git.

For a public GitHub Pages deployment, use a restricted public Mapbox token limited to your site URL.
