const REGIONS = [
  { id: "nyc", name: "New York City", short: "NYC", lat: 40.7128, lon: -74.0060 },
  { id: "li", name: "Long Island", short: "LI", lat: 40.7891, lon: -73.1350 },
  { id: "hudson", name: "Hudson Valley", short: "HV", lat: 41.7004, lon: -73.9210 },
  { id: "capital", name: "Capital Region", short: "ALB", lat: 42.6526, lon: -73.7562 },
  { id: "catskills", name: "Catskills", short: "CAT", lat: 42.1930, lon: -74.5199 },
  { id: "adirondacks", name: "Adirondacks", short: "ADK", lat: 43.9695, lon: -74.1646 },
  { id: "north", name: "North Country", short: "NC", lat: 44.6995, lon: -73.4529 },
  { id: "central", name: "Central NY", short: "CNY", lat: 43.0481, lon: -76.1474 },
  { id: "southern", name: "Southern Tier", short: "ST", lat: 42.0987, lon: -75.9180 },
  { id: "finger", name: "Finger Lakes", short: "FLX", lat: 42.8864, lon: -77.2810 },
  { id: "western", name: "Western NY", short: "BUF", lat: 42.8864, lon: -78.8784 }
];

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
  const windows = groupRainWindows(periods, 24);
  const maxChance = Math.max(...next12.map((period) => period.probabilityOfPrecipitation?.value ?? 0), 0);
  const mentionsRain = next12.some((period) => rainWords.test(period.shortForecast));
  const firstWindow = windows[0];

  let status = "clear";
  if (maxChance >= 50 || (firstWindow && firstWindow.maxChance >= 40)) {
    status = "likely";
  } else if (maxChance >= 25 || mentionsRain || firstWindow) {
    status = "possible";
  }

  return {
    status,
    maxChance,
    window: firstWindow ? formatWindow(firstWindow.start, firstWindow.end) : "No likely rain window in the next 24 hours",
    condition: next12[0]?.shortForecast ?? "Forecast unavailable"
  };
}

function statusLabel(status) {
  if (status === "likely") return "Likely rain";
  if (status === "possible") return "Possible rain";
  return "Not likely";
}

function markerIcon(region, forecast) {
  return L.divIcon({
    className: "",
    html: `<div class="marker-pin ${forecast.status}">${escapeHtml(region.short)}</div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    popupAnchor: [0, -14]
  });
}

function initMap() {
  if (!window.L) {
    mapEl.textContent = "Map library could not load. Regional forecast cards are still available below.";
    return;
  }

  map = L.map("map", {
    scrollWheelZoom: false,
    zoomControl: true
  }).setView([42.95, -75.6], 6);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 11,
    attribution: "&copy; OpenStreetMap contributors"
  }).addTo(map);

  map.fitBounds([
    [40.45, -79.9],
    [45.05, -71.75]
  ]);
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
  if (!map || !window.L) return;

  const popup = `
    <strong class="popup-title">${escapeHtml(region.name)}</strong>
    <p class="popup-detail">${escapeHtml(statusLabel(forecast.status))}</p>
    <p class="popup-detail">${escapeHtml(forecast.window)}</p>
    <p class="popup-detail">Peak next 12 hours: ${forecast.maxChance}%</p>
  `;

  const existing = markers.get(region.id);
  if (existing) {
    existing.setIcon(markerIcon(region, forecast));
    existing.setPopupContent(popup);
    return;
  }

  const marker = L.marker([region.lat, region.lon], {
    icon: markerIcon(region, forecast),
    title: region.name
  }).addTo(map);

  marker.bindPopup(popup);
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
        <span>${escapeHtml(forecast.window)}</span>
        <span>Peak next 12 hours: ${forecast.maxChance}%</span>
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
