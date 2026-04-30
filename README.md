# Weather

Weather is a static web app for viewing New York rain forecasts. It uses Weather.gov hourly forecast data for regional rain timing, Mapbox for the base map, and RainViewer radar tiles for live precipitation overlays.

## Features

- New York State map with regional forecast markers
- Live radar precipitation overlay
- Regional rain likelihood cards
- NYC approximate rain windows
- Next 12-hour NYC forecast

## API Key

A Mapbox public access token is required for the map.

1. Copy `config.example.js` to `config.js`.
2. Replace `YOUR_MAPBOX_PUBLIC_TOKEN` with your Mapbox public token.
3. Do not commit `config.js`; it is ignored by Git.

For a public GitHub Pages deployment, use a restricted public Mapbox token limited to your site URL.
