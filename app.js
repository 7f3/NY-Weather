const REGIONS = [
  { id: "nyc", name: "New York City", short: "NYC", lat: 40.7128, lon: -74.0060 },
  { id: "li", name: "Long Island", short: "LI", lat: 40.8559, lon: -72.7809 },
  { id: "hudson", name: "Hudson Valley", short: "HV", lat: 41.7004, lon: -73.9210 },
  { id: "capital", name: "Capital Region", short: "ALB", lat: 42.6526, lon: -73.7562 },
  { id: "catskills", name: "Catskills", short: "CAT", lat: 42.0164, lon: -74.6910 },
  { id: "adirondacks", name: "Adirondacks", short: "ADK", lat: 43.9707, lon: -74.1646 },
  { id: "north", name: "North Country", short: "NC", lat: 44.6995, lon: -73.6550 },
  { id: "central", name: "Central NY", short: "CNY", lat: 43.0481, lon: -76.1474 },
  { id: "southern", name: "Southern Tier", short: "ST", lat: 42.0987, lon: -76.0471 },
  { id: "finger", name: "Finger Lakes", short: "FLX", lat: 42.8864, lon: -77.2810 },
  { id: "western", name: "Western NY", short: "BUF", lat: 42.8864, lon: -78.8784 }
];

const MAPBOX_TOKEN = window.WEATHER_CONFIG?.mapboxToken ?? "";
const RAINVIEWER_API = "https://api.rainviewer.com/public/weather-maps.json";
const rainWords = /\b(rain|showers?|thunderstorms?|drizzle|precipitation)\b/i;

const summaryEl = document.querySelector("#summary");
const updatedEl = document.querySelector("#updated");
const windowsEl = document.querySelector("#rain-windows");
const hourlyEl = document.querySelector("#hourly");
const refreshBtn = document.querySelector("#refresh");
const regionsEl = document.querySelector("#regions");
const mapEl = document.querySelector("#map");

let map;
let markers = new Map();
let radarFrames = [];
let radarPastFrames = [];
let radarNowcastFrames = [];
let radarFrameIndex = 0;
let radarInterval;
let radarPlaying = true;
let radarHost = "";
let latestResults = [];
let currentTimeInterval;

const timeFormatter = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
  timeZone: "America/New_York"
});

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "America/New_York"
});

const currentTimeFormatter = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
  timeZone: "America/New_York",
  timeZoneName: "short"
});

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function isRainy(period) {
  const chance = period.probabilityOfPrecipitation?.value ?? 0;
  return chance >= 30 || rainWords.test(period.shortForecast);
}

function formatTime(dateString) {
  return timeFormatter.format(new Date(dateString));
}

function formatWindow(start, end) {
  return `${formatTime(start)} - ${formatTime(end)}`;
}

function endOfPeriod(period) {
  const start = new Date(period.startTime);
  start.setHours(start.getHours() + 1);
  return start.toISOString();
}

function groupRainWindows(periods, hours = 36) {
  const windows = [];

  periods.slice(0, hours).forEach((period) => {
    if (!isRainy(period)) return;

    const latest = windows.at(-1);
    const chance = period.probabilityOfPrecipitation?.value ?? 0;
    const startMs = new Date(period.startTime).getTime();
    const end = endOfPeriod(period);
    const endMs = new Date(end).getTime();

    if (latest && latest.endMs === startMs) {
      latest.end = end;
      latest.endMs = endMs;
      latest.maxChance = Math.max(latest.maxChance, chance);
      latest.conditions.add(period.shortForecast);
      return;
    }

    windows.push({
      start: period.startTime,
      end,
      endMs,
      maxChance: chance,
      conditions: new Set([period.shortForecast])
    });
  });

  return windows;
}

function summarizeRegion(periods) {
  const next12 = periods.slice(0, 12);
  const selectedPeriod = periods[0];
  const windows = groupRainWindows(periods, 24);
  const maxChance = Math.max(...next12.map((period) => period.probabilityOfPrecipitation?.value ?? 0), 0);
  const selectedChance = selectedPeriod?.probabilityOfPrecipitation?.value ?? 0;
  const mentionsRain = rainWords.test(selectedPeriod?.shortForecast ?? "");
  const firstWindow = windows[0];

  let status = "clear";
  if (selectedChance >= 50 || mentionsRain) {
    status = "likely";
  } else if (selectedChance >= 25) {
    status = "possible";
  }

  return {
    status,
    maxChance,
    selectedChance,
    selectedTime: selectedPeriod?.startTime,
    window: firstWindow ? formatWindow(firstWindow.start, firstWindow.end) : "No likely rain window in the next 24 hours",
    condition: selectedPeriod?.shortForecast ?? "Forecast unavailable"
  };
}

function statusLabel(status) {
  if (status === "likely") return "Likely rain";
  if (status === "possible") return "Possible rain";
  return "Not likely";
}

function initMap() {
  if (!window.mapboxgl) {
    mapEl.textContent = "Map library could not load. Regional forecast cards are still available below.";
    return;
  }

  if (!MAPBOX_TOKEN || MAPBOX_TOKEN === "YOUR_MAPBOX_PUBLIC_TOKEN") {
    mapEl.classList.add("map-error");
    mapEl.innerHTML = `<div class="empty">Mapbox API key needed. Add a config.js file using config.example.js as a template.</div>`;
    return;
  }

  mapboxgl.accessToken = MAPBOX_TOKEN;
  map = new mapboxgl.Map({
    bounds: [
      [-79.95, 40.45],
      [-71.75, 45.05]
    ],
    container: "map",
    fitBoundsOptions: { padding: 36 },
    maxBounds: [
      [-81.2, 39.8],
      [-70.6, 45.7]
    ],
    pitchWithRotate: false,
    style: "mapbox://styles/mapbox/light-v11"
  });

  map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-left");

  map.on("load", () => {
    map.resize();
    loadRadarLayer();
    addRadarCredit();
    addRadarControls();
    startCurrentTimeStamp();
  });
}

async function loadRadarLayer() {
  if (!map) return;

  try {
    const response = await fetch(RAINVIEWER_API);
    if (!response.ok) throw new Error("Could not load radar overlay.");

    const data = await response.json();
    radarHost = data.host;
    radarPastFrames = data.radar?.past ?? [];
    radarNowcastFrames = data.radar?.nowcast ?? [];
    radarFrames = [...radarPastFrames, ...radarNowcastFrames];
    radarFrameIndex = Math.max(radarPastFrames.length - 1, 0);
    const latest = radarFrames[radarFrameIndex];

    if (!radarHost || !latest?.path) throw new Error("Radar overlay is unavailable right now.");

    buildRadarLayers();
    updateRadarForSelectedHour();
  } catch (error) {
    renderRadarStamp(null, error.message);
  }
}

function buildRadarLayers() {
  if (!map || !radarHost) return;

  radarFrames.forEach((frame, index) => {
    const sourceId = `rain-radar-${index}`;
    const layerId = `rain-radar-${index}`;
    const tileUrl = `${radarHost}${frame.path}/512/{z}/{x}/{y}/2/1_1.png`;

    if (!map.getSource(sourceId)) {
      map.addSource(sourceId, {
        type: "raster",
        tiles: [tileUrl],
        tileSize: 512,
        maxzoom: 10
      });
    }

    if (!map.getLayer(layerId)) {
      map.addLayer({
        id: layerId,
        type: "raster",
        source: sourceId,
        paint: {
          "raster-opacity": 0,
          "raster-fade-duration": 450
        }
      });
    }
  });
}

function showRadarFrame(index) {
  if (!map || !radarFrames[index]) return;

  radarFrames.forEach((frame, frameIndex) => {
    const layerId = `rain-radar-${frameIndex}`;
    if (map.getLayer(layerId)) {
      map.setPaintProperty(layerId, "raster-opacity", frameIndex === index ? 0.66 : 0);
    }
  });

  renderRadarStamp();
}

function updateRadarForSelectedHour() {
  if (!radarFrames.length) return;

  clearInterval(radarInterval);
  radarFrameIndex = Math.max(radarPastFrames.length - 1, 0);
  showRadarFrame(radarFrameIndex);
  startRadarAnimation();
}

function startRadarAnimation() {
  clearInterval(radarInterval);
  if (radarPastFrames.length < 2 || !radarPlaying) return;

  radarInterval = setInterval(() => {
    const pastStart = 0;
    const pastEnd = Math.max(radarPastFrames.length - 1, 0);
    radarFrameIndex = radarFrameIndex >= pastEnd ? pastStart : radarFrameIndex + 1;
    showRadarFrame(radarFrameIndex);
  }, 1000);
}

function renderRadarStamp(frameTime = null, errorMessage = "") {
  const existing = mapEl.querySelector(".radar-stamp");
  const stamp = existing ?? document.createElement("div");
  stamp.className = "radar-stamp";

  if (errorMessage) {
    stamp.textContent = errorMessage;
  } else {
    stamp.textContent = `Current time: ${currentTimeFormatter.format(new Date())}`;
  }

  if (!existing) mapEl.append(stamp);
}

function startCurrentTimeStamp() {
  renderRadarStamp();
  clearInterval(currentTimeInterval);
  currentTimeInterval = setInterval(() => renderRadarStamp(), 1000);
}

function addRadarControls() {
  if (mapEl.querySelector(".radar-toggle")) return;

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "radar-toggle";
  toggle.textContent = "Pause radar";
  toggle.addEventListener("click", () => {
    radarPlaying = !radarPlaying;
    toggle.textContent = radarPlaying ? "Pause radar" : "Play radar";

    if (!radarPlaying) {
      clearInterval(radarInterval);
      return;
    }

    if (radarFrames.length) {
      updateRadarForSelectedHour();
    } else {
      loadRadarLayer();
    }
  });

  mapEl.append(toggle);
}

function addRadarCredit() {
  if (mapEl.querySelector(".radar-credit")) return;

  const credit = document.createElement("a");
  credit.className = "radar-credit";
  credit.href = "https://www.rainviewer.com/";
  credit.target = "_blank";
  credit.rel = "noreferrer";
  credit.textContent = "Radar: RainViewer";
  mapEl.append(credit);
}

async function fetchHourlyForecast(region) {
  const pointUrl = `https://api.weather.gov/points/${region.lat},${region.lon}`;
  const pointResponse = await fetch(pointUrl, {
    headers: { "Accept": "application/geo+json" }
  });

  if (!pointResponse.ok) throw new Error("Could not reach the forecast office.");

  const pointData = await pointResponse.json();
  const hourlyResponse = await fetch(pointData.properties.forecastHourly);

  if (!hourlyResponse.ok) throw new Error("Could not load the hourly forecast.");

  const hourlyData = await hourlyResponse.json();
  return hourlyData.properties.periods ?? [];
}

function renderMapMarker(region, forecast) {
  if (!map || !window.mapboxgl) return;

  const time = forecast.selectedTime ? formatTime(forecast.selectedTime) : "selected hour";
  const label = `${region.name}: ${statusLabel(forecast.status)} at ${time}. ${forecast.selectedChance}% chance.`;
  const popupHtml = `
    <strong class="popup-title">${escapeHtml(region.name)}</strong>
    <p class="popup-detail">${escapeHtml(statusLabel(forecast.status))} at ${escapeHtml(time)}</p>
    <p class="popup-detail">${forecast.selectedChance}% chance</p>
    <p class="popup-detail">${escapeHtml(forecast.condition)}</p>
  `;
  const existing = markers.get(region.id);

  if (existing) {
    const element = existing.getElement();
    element.className = `map-pin ${forecast.status}`;
    element.querySelector("span").textContent = region.short;
    element.querySelector("small").textContent = `${forecast.selectedChance}%`;
    existing.setPopup(new mapboxgl.Popup({ offset: 28 }).setHTML(popupHtml));
    return;
  }

  const element = document.createElement("button");
  element.type = "button";
  element.className = `map-pin ${forecast.status}`;
  element.setAttribute("aria-label", label);
  element.innerHTML = `<span>${escapeHtml(region.short)}</span><small>${forecast.selectedChance}%</small>`;

  const marker = new mapboxgl.Marker({ element })
    .setLngLat([region.lon, region.lat])
    .setPopup(new mapboxgl.Popup({ offset: 28 }).setHTML(popupHtml))
    .addTo(map);

  markers.set(region.id, marker);
}

function renderRegionCards(results) {
  regionsEl.innerHTML = results.map(({ region, forecast, error }) => {
    if (error) {
      return `
        <article class="region clear">
          <strong>${escapeHtml(region.name)}</strong>
          <span class="badge">Unavailable</span>
          <span>${escapeHtml(error.message)}</span>
        </article>
      `;
    }

    return `
      <article class="region ${forecast.status}">
        <strong>${escapeHtml(region.name)}</strong>
        <span class="badge">${escapeHtml(statusLabel(forecast.status))}</span>
        <span>${escapeHtml(forecast.selectedTime ? formatTime(forecast.selectedTime) : "Selected hour")}: ${forecast.selectedChance}% chance</span>
        <span>${escapeHtml(forecast.condition)}</span>
      </article>
    `;
  }).join("");
}

function renderRainWindows(periods) {
  const windows = groupRainWindows(periods);

  if (!windows.length) {
    windowsEl.innerHTML = `<div class="empty">No likely rain windows in the next day and a half.</div>`;
    return;
  }

  windowsEl.innerHTML = windows.map((window) => {
    const conditions = [...window.conditions].slice(0, 2).join(", ");
    const chance = window.maxChance ? `Peak chance around ${window.maxChance}%.` : "Rain mentioned in the forecast.";

    return `
      <article class="window">
        <strong>${escapeHtml(formatWindow(window.start, window.end))}</strong>
        <span>${escapeHtml(chance)}</span>
        <span>${escapeHtml(conditions)}</span>
      </article>
    `;
  }).join("");
}

function renderHourly(periods) {
  hourlyEl.innerHTML = periods.slice(0, 12).map((period) => {
    const chance = period.probabilityOfPrecipitation?.value ?? 0;
    const rainy = isRainy(period);

    return `
      <article class="hour ${rainy ? "rain" : ""}">
        <div class="time">${escapeHtml(formatTime(period.startTime))}</div>
        <div class="chance">${chance}%</div>
        <div class="condition">${escapeHtml(period.shortForecast)}</div>
      </article>
    `;
  }).join("");
}

async function loadForecast() {
  refreshBtn.disabled = true;
  summaryEl.textContent = "Checking the latest hourly forecasts across New York...";
  windowsEl.innerHTML = `<div class="loading">Loading forecast windows...</div>`;
  regionsEl.innerHTML = `<div class="loading">Loading regional forecasts...</div>`;

  try {
    const results = await Promise.all(REGIONS.map(async (region) => {
      try {
        const periods = await fetchHourlyForecast(region);
        const forecast = summarizeRegion(periods);
        renderMapMarker(region, forecast);
        return { region, periods, forecast };
      } catch (error) {
        return { region, error };
      }
    }));
    latestResults = results;
    renderRegionCards(results);

    const nyc = results.find((result) => result.region.id === "nyc");
    if (nyc?.periods) {
      renderRainWindows(nyc.periods);
      renderHourly(nyc.periods);
    } else {
      windowsEl.innerHTML = `<div class="empty">NYC forecast unavailable right now.</div>`;
      hourlyEl.innerHTML = "";
    }

    const likely = results.filter((result) => result.forecast?.status === "likely").length;
    const possible = results.filter((result) => result.forecast?.status === "possible").length;
    summaryEl.textContent = `${likely} New York region${likely === 1 ? "" : "s"} show likely rain, and ${possible} show possible rain in the next 12 to 24 hours.`;
    updatedEl.textContent = dateFormatter.format(new Date());
  } catch (error) {
    summaryEl.textContent = "I could not load the live forecast. Check your connection and try refreshing.";
    regionsEl.innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`;
    windowsEl.innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`;
    hourlyEl.innerHTML = "";
    updatedEl.textContent = "--";
  } finally {
    refreshBtn.disabled = false;
  }
}

initMap();
refreshBtn.addEventListener("click", loadForecast);
loadForecast();
