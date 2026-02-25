/* ═══════════════════════════════════════════════
   FARMER AI ASSISTANT — script.js (FINAL v4)
   Features: Voice input, Photo upload, IoT mock dashboard
═══════════════════════════════════════════════ */

const WEBHOOK_URL = "http://localhost:5678/webhook/46a07f8c-92e1-4838-827b-960416c16ed4";
const OPENWEATHER_API_KEY = "c20cd2aa7895603c5a8ea2a5115aa939";
const DEFAULT_LOCATION = { lat: 18.5246, lon: 73.8567, name: "Pune, Maharashtra" };

let userLocation = null;
let currentPhoto = null; // { base64, name, type }
let iotInterval = null;
let iotData = null; // latest sensor readings
let isRecording = false;
let recognition = null;
let voiceTimer = null;
let voiceSeconds = 0;
let inputMode = "text"; // "text" | "voice"
let targetLanguage = "en"; // "en", "hi", "mr", etc.
let translationsCache = new Map(); // Store translations to avoid redundant API calls

/* ══════════════════════════════════
   DEBUG
══════════════════════════════════ */
function createDebugPanel() {
  const panel = document.createElement('div');
  panel.id = 'debugPanel';
  panel.style.cssText = `
    position: fixed;
    bottom: 70px;
    left: 20px;
    width: 320px;
    max-height: 350px;
    background: rgba(26, 26, 46, 0.95);
    backdrop-filter: blur(8px);
    color: #00ff88;
    font-family: 'Outfit', monospace;
    font-size: 11px;
    border-radius: 12px;
    overflow: hidden;
    z-index: 9999;
    border: 1px solid rgba(0, 255, 136, 0.3);
    display: none;
    flex-direction: column;
    box-shadow: 0 8px 32px rgba(0,0,0,0.4);
  `;

  panel.innerHTML = `
    <div style="padding: 10px; background: rgba(0,0,0,0.3); display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(0,255,136,0.1)">
      <b style="color: #fff; font-size: 12px;">🔍 SYSTEM LOGS</b>
      <div style="display: flex; gap: 8px;">
        <span id="clearDebug" style="cursor: pointer; opacity: 0.7; hover: {opacity: 1}">🧹</span>
        <span id="closeDebug" style="cursor: pointer; opacity: 0.7;">✕</span>
      </div>
    </div>
    <div id="debugContent" style="padding: 10px; overflow-y: auto; flex-grow: 1; line-height: 1.5;"></div>
  `;
  document.body.appendChild(panel);

  const btn = document.createElement('button');
  btn.id = 'debugToggleBtn';
  btn.innerHTML = '🔍';
  btn.title = 'Toggle Debug Logs';
  btn.style.cssText = `
    position: fixed;
    bottom: 20px;
    left: 20px;
    z-index: 10000;
    background: #1a1a2e;
    color: #00ff88;
    border: 1px solid rgba(0, 255, 136, 0.5);
    width: 36px;
    height: 36px;
    border-radius: 50%;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
    box-shadow: 0 4px 12px rgba(0,0,0,0.2);
  `;
  btn.onclick = () => {
    const isHidden = panel.style.display === 'none';
    panel.style.display = isHidden ? 'flex' : 'none';
    btn.style.background = isHidden ? '#00ff88' : '#1a1a2e';
    btn.style.color = isHidden ? '#1a1a2e' : '#00ff88';
  };
  document.body.appendChild(btn);

  document.getElementById('clearDebug').onclick = () => {
    document.getElementById('debugContent').innerHTML = '';
  };
  document.getElementById('closeDebug').onclick = () => {
    panel.style.display = 'none';
    btn.style.background = '#1a1a2e';
    btn.style.color = '#00ff88';
  };

  dbg(`🚀 System Initialized | Webhook: ${WEBHOOK_URL.substring(0, 30)}...`);
}

function dbg(msg, color = '#00ff88') {
  const content = document.getElementById('debugContent');
  if (!content) {
    console.log('[DBG-Early]', msg);
    return;
  }
  const d = document.createElement('div');
  d.style.cssText = `color: ${color}; margin-bottom: 4px; border-left: 2px solid ${color}; padding-left: 6px;`;
  d.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
  content.appendChild(d);
  const p = document.getElementById('debugPanel');
  if (p) p.scrollTop = p.scrollHeight;
  console.log('[DBG]', msg);
}

/* ══════════════════════════════════
   THEME
══════════════════════════════════ */
function applyTheme(t) {
  document.documentElement.setAttribute("data-theme", t);
  const i = document.getElementById("themeIcon");
  if (i) i.textContent = t === "dark" ? "☀️" : "🌙";
  localStorage.setItem("krishi-theme", t);
}

/* ══════════════════════════════════
   DRAWER
══════════════════════════════════ */
function openDrawer() {
  document.getElementById("contextDrawer")?.classList.add("open");
  document.getElementById("drawerOverlay")?.classList.add("active");
  document.body.style.overflow = "hidden";
}
function closeDrawer() {
  document.getElementById("contextDrawer")?.classList.remove("open");
  document.getElementById("drawerOverlay")?.classList.remove("active");
  document.body.style.overflow = "";
}

/* ══════════════════════════════════
   DASHBOARD
══════════════════════════════════ */
function setMoisture(value, statusText) {
  const fill = document.getElementById("gaugeFill");
  const valEl = document.getElementById("moistureValue");
  const statEl = document.getElementById("moistureStatus");
  if (!fill || !valEl || !statEl) return;
  const pct = Math.max(0, Math.min(1, value / 100)) * 157;
  fill.setAttribute("stroke-dasharray", `${pct} 157`);
  fill.style.stroke = value < 25 ? "var(--neon-red)" : value < 40 ? "var(--neon-amber)" : "var(--neon-green)";
  valEl.textContent = value;
  statEl.textContent = statusText || getSoilMoistureInterpretation(value).split(" - ")[0];
}

function setHealthScore(score) {
  const n = document.getElementById("healthNum");
  const b = document.getElementById("healthBarFill");
  const s = document.getElementById("healthStatus");
  if (!n || !b || !s) return;
  n.textContent = score;
  b.style.width = `${score}%`;
  if (score >= 75) { n.style.color = "var(--neon-green)"; s.textContent = "Protocol: Optimal Growth"; }
  else if (score >= 50) { n.style.color = "var(--neon-amber)"; s.textContent = "Caution: Resource Drift"; }
  else { n.style.color = "var(--neon-red)"; s.textContent = "Warning: System Failure"; }
}

function calculateHealthScore(ctx) {
  let s = 50;
  if (ctx.soil_moisture >= 40 && ctx.soil_moisture <= 70) s += 15; else if (ctx.soil_moisture < 20 || ctx.soil_moisture > 85) s -= 20;
  if (ctx.temperature < 38) s += 10; else s -= 15;
  if (ctx.soil_electrical_conductivity < 1.5) s += 10; else if (ctx.soil_electrical_conductivity > 2.5) s -= 20;
  if (ctx.soil_ph >= 6.0 && ctx.soil_ph <= 7.5) s += 15; else if (ctx.soil_ph < 5.0 || ctx.soil_ph > 8.0) s -= 15;
  return Math.max(0, Math.min(100, s));
}

const STAGE_MAP = {
  baby: { icon: "🌱", label: "Baby Plant", step: 1 }, seedling: { icon: "🌱", label: "Seedling", step: 1 },
  vegetative: { icon: "🌿", label: "Vegetative", step: 2 }, flowering: { icon: "🌸", label: "Flowering", step: 3 },
  flower: { icon: "🌸", label: "Flowering", step: 3 }, fruiting: { icon: "🍅", label: "Fruiting", step: 4 },
  fruit: { icon: "🍅", label: "Fruit Ready", step: 4 }, harvest: { icon: "🌾", label: "Harvest Ready", step: 4 },
  grain: { icon: "🌾", label: "Grain Filling", step: 4 },
};

function setStage(text) {
  if (!text || text === "Not specified") return;
  const ie = document.getElementById("stageIcon"), le = document.getElementById("stageName");
  if (!ie || !le) return;
  const key = Object.keys(STAGE_MAP).find(k => text.toLowerCase().includes(k));
  const cfg = key ? STAGE_MAP[key] : null;
  if (cfg) {
    ie.textContent = cfg.icon; le.textContent = cfg.label;
    [1, 2, 3, 4].forEach(i => { const p = document.getElementById(`pip${i}`); if (!p) return; p.classList.toggle("done", i < cfg.step); p.classList.toggle("active", i === cfg.step); });
  } else { ie.textContent = "🌿"; le.textContent = text; }
}

function setAlerts(warnings) {
  const l = document.getElementById("alertsList"), c = document.getElementById("alertsCard");
  if (!l) return;
  if (!warnings || warnings.length === 0) {
    l.innerHTML = `<div class="alert-clear"><span class="alert-clear-icon">✓</span><span>Security Protocol Active</span></div>`;
    c?.classList.remove("has-alerts");
    return;
  }
  c?.classList.add("has-alerts");
  const items = Array.isArray(warnings) ? warnings : warnings.split("|").map(s => s.trim()).filter(Boolean);
  l.innerHTML = items.map(w => `<div class="alert-item"><span>⚠️</span><span>${w}</span></div>`).join("");
}

/* ══════════════════════════════════
   IOT MOCK DASHBOARD
══════════════════════════════════ */
const IOT_MOCK_BASE = { moisture: 52, temp: 27, hum: 64, ph: 6.7, ec: 1.1 };

function startIoTMock() {
  const panel = document.getElementById("iotLivePanel");
  const demoBtn = document.getElementById("iotDemoBtn");
  const trigBtn = document.getElementById("iotTriggerBtn");
  const liveTag = document.getElementById("moistureLiveTag");

  if (panel) panel.style.display = "block";
  if (demoBtn) { demoBtn.textContent = "⏹ Stop Mock IoT"; demoBtn.classList.add("running"); }
  if (trigBtn) trigBtn.classList.add("active");
  if (liveTag) { liveTag.textContent = "LIVE"; liveTag.classList.add("live"); }

  // update immediately then every 5s
  updateIoTReading();
  iotInterval = setInterval(updateIoTReading, 5000);

  dbg("📡 IoT Mock started");
}

function stopIoTMock() {
  if (iotInterval) { clearInterval(iotInterval); iotInterval = null; }
  const demoBtn = document.getElementById("iotDemoBtn");
  const trigBtn = document.getElementById("iotTriggerBtn");
  const liveTag = document.getElementById("moistureLiveTag");
  if (demoBtn) { demoBtn.textContent = "▶ Start Mock IoT"; demoBtn.classList.remove("running"); }
  if (trigBtn) trigBtn.classList.remove("active");
  if (liveTag) { liveTag.textContent = "MANUAL"; liveTag.classList.remove("live"); }
  iotData = null;
  dbg("📡 IoT Mock stopped");
}

function updateIoTReading() {
  // Realistic fluctuations
  const rand = (base, range) => Math.round((base + (Math.random() - 0.5) * range * 2) * 10) / 10;
  iotData = {
    soil_moisture: Math.round(rand(IOT_MOCK_BASE.moisture, 3)),
    temperature: Math.round(rand(IOT_MOCK_BASE.temp, 1.5) * 10) / 10,
    humidity: Math.round(rand(IOT_MOCK_BASE.hum, 3)),
    soil_ph: Math.round(rand(IOT_MOCK_BASE.ph, 0.1) * 10) / 10,
    soil_electrical_conductivity: Math.round(rand(IOT_MOCK_BASE.ec, 0.08) * 100) / 100,
  };

  // Update sensor panel
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  set("iotMoistureVal", `${iotData.soil_moisture}%`);
  set("iotTempVal", `${iotData.temperature}°C`);
  set("iotHumVal", `${iotData.humidity}%`);
  set("iotPhVal", iotData.soil_ph);
  set("iotEcVal", `${iotData.soil_electrical_conductivity} dS/m`);
  set("iotLastUpdate", `Updated ${new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`);

  // Update main dashboard gauge with live data
  setMoisture(iotData.soil_moisture, "IoT sensor — live");
  setHealthScore(calculateHealthScore({
    soil_moisture: iotData.soil_moisture,
    temperature: iotData.temperature,
    soil_ph: iotData.soil_ph,
    soil_electrical_conductivity: iotData.soil_electrical_conductivity,
  }));

  // Animate value changes
  ["iotMoistureVal", "iotTempVal", "iotHumVal", "iotPhVal", "iotEcVal"].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.style.transition = "color .3s";
    el.style.color = "var(--green)";
    setTimeout(() => el.style.color = "", 600);
  });
}

/* ══════════════════════════════════
   PHOTO UPLOAD
══════════════════════════════════ */
function handlePhotoSelect(file) {
  if (!file || !file.type.startsWith("image/")) return;
  const maxMB = 4;
  if (file.size > maxMB * 1024 * 1024) {
    alert(`Image too large. Please use an image under ${maxMB}MB.`);
    return;
  }
  const reader = new FileReader();
  reader.onload = (e) => {
    const base64 = e.target.result.split(",")[1]; // strip data:image/...;base64,
    currentPhoto = { base64, name: file.name, type: file.type };

    // Show preview bar
    const bar = document.getElementById("photoPreviewBar");
    const img = document.getElementById("photoPreviewImg");
    const name = document.getElementById("photoPreviewName");
    const btn = document.querySelector(".photo-btn");
    if (bar) bar.style.display = "block";
    if (img) img.src = e.target.result;
    if (name) name.textContent = file.name;
    if (btn) btn.classList.add("has-photo");

    dbg(`📸 Photo ready: ${file.name} (${(file.size / 1024).toFixed(0)}KB)`);
  };
  reader.readAsDataURL(file);
}

function clearPhoto() {
  currentPhoto = null;
  const bar = document.getElementById("photoPreviewBar");
  const img = document.getElementById("photoPreviewImg");
  const inp = document.getElementById("photoInput");
  const btn = document.querySelector(".photo-btn");
  if (bar) bar.style.display = "none";
  if (img) img.src = "";
  if (inp) inp.value = "";
  if (btn) btn.classList.remove("has-photo");
}

/* ══════════════════════════════════
   VOICE INPUT
══════════════════════════════════ */
function startVoiceRecording() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    alert("Voice input is not supported in this browser. Please use Chrome or Edge.");
    return;
  }

  recognition = new SpeechRecognition();
  // Determine recognition language (STT)
  const langMap = { 'hi': 'hi-IN', 'mr': 'mr-IN', 'gu': 'gu-IN', 'ta': 'ta-IN', 'en': 'en-IN' };
  recognition.lang = langMap[targetLanguage] || 'en-IN';
  recognition.continuous = true;
  recognition.interimResults = true;

  const micBtn = document.getElementById("micBtn");
  const recBar = document.getElementById("voiceRecordingBar");
  const textarea = document.getElementById("message");

  micBtn?.classList.add("recording");
  if (recBar) recBar.style.display = "flex";
  isRecording = true;

  // Timer
  voiceSeconds = 0;
  updateVoiceTimer();
  voiceTimer = setInterval(() => { voiceSeconds++; updateVoiceTimer(); }, 1000);

  recognition.onresult = (e) => {
    let transcript = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      transcript += e.results[i][0].transcript;
    }
    if (textarea) textarea.value = transcript;
  };

  recognition.onerror = (e) => {
    dbg(`Voice error: ${e.error}`, '#ffaa00');
    stopVoiceRecording(false);
  };

  recognition.onend = () => {
    if (isRecording) stopVoiceRecording(true);
  };

  recognition.start();
  dbg("🎤 Voice recording started");
}

function stopVoiceRecording(autoSend = true) {
  isRecording = false;
  if (voiceTimer) { clearInterval(voiceTimer); voiceTimer = null; }
  if (recognition) { try { recognition.stop(); } catch (e) { } recognition = null; }

  const micBtn = document.getElementById("micBtn");
  const recBar = document.getElementById("voiceRecordingBar");
  micBtn?.classList.remove("recording");
  if (recBar) recBar.style.display = "none";

  dbg("🎤 Voice recording stopped");

  // Auto-send if there's text
  if (autoSend) {
    const textarea = document.getElementById("message");
    if (textarea?.value?.trim()) {
      setTimeout(() => sendMessage(), 200);
    }
  }
}

function updateVoiceTimer() {
  const el = document.getElementById("voiceTimer");
  if (!el) return;
  const m = Math.floor(voiceSeconds / 60);
  const s = voiceSeconds % 60;
  el.textContent = `${m}:${s.toString().padStart(2, "0")}`;
}

/* ══════════════════════════════════
   LOCATION & WEATHER
══════════════════════════════════ */
async function getUserLocation() {
  return new Promise(resolve => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        pos => { userLocation = { lat: pos.coords.latitude, lon: pos.coords.longitude }; dbg(`📍 ${userLocation.lat.toFixed(4)},${userLocation.lon.toFixed(4)}`); resolve(userLocation); },
        err => { dbg(`Geo failed: ${err.message}`, '#ffaa00'); userLocation = DEFAULT_LOCATION; resolve(DEFAULT_LOCATION); },
        { enableHighAccuracy: true, timeout: 5000, maximumAge: 300000 }
      );
    } else { userLocation = DEFAULT_LOCATION; resolve(DEFAULT_LOCATION); }
  });
}

async function getWeatherForecast(location = userLocation || DEFAULT_LOCATION) {
  try {
    const res = await fetch(`https://api.openweathermap.org/data/2.5/forecast?lat=${location.lat}&lon=${location.lon}&appid=${OPENWEATHER_API_KEY}&units=metric`);
    if (!res.ok) throw new Error(`${res.status}`);
    const data = await res.json();
    dbg(`✅ Weather: ${data.city.name}`);
    return processWeatherData(data);
  } catch (err) { dbg(`Weather failed: ${err.message}`, '#ffaa00'); return null; }
}

function processWeatherData(data) {
  const daily = {};
  data.list.forEach(item => {
    const key = new Date(item.dt * 1000).toISOString().split('T')[0];
    if (!daily[key]) daily[key] = { temps: [], humidity: [], rainfall: 0, conditions: [], wind_speed: [] };
    daily[key].temps.push(item.main.temp);
    daily[key].humidity.push(item.main.humidity);
    daily[key].rainfall += (item.rain?.['3h'] || 0);
    daily[key].conditions.push(item.weather[0].main);
    daily[key].wind_speed.push(item.wind.speed);
  });
  const forecast = Object.values(daily).slice(0, 5).map(day => {
    const avg = arr => Math.round(arr.reduce((a, b) => a + b) / arr.length);
    const cnt = {}; day.conditions.forEach(c => { cnt[c] = (cnt[c] || 0) + 1; });
    const mainC = Object.keys(cnt).reduce((a, b) => cnt[a] > cnt[b] ? a : b);
    return {
      temp_avg: avg(day.temps), temp_max: Math.round(Math.max(...day.temps)), temp_min: Math.round(Math.min(...day.temps)),
      humidity_avg: avg(day.humidity), rainfall_mm: Math.round(day.rainfall * 10) / 10, condition: mainC,
      irrigation_recommendation: getIrrigationRec(day.rainfall, avg(day.temps), avg(day.humidity))
    };
  });
  updateWeatherCard(forecast[0], data.city.name);
  return { location: data.city.name, forecast, summary: buildWeatherSummary(forecast) };
}

function getIrrigationRec(rain, temp, hum) {
  if (rain > 10) return "Skip irrigation - expect significant rain";
  if (rain > 3) return "Light rain expected - reduce irrigation by 50%";
  if (temp > 35 && hum < 40) return "Hot and dry - increase irrigation by 30%";
  if (temp > 35) return "Hot conditions - monitor soil moisture closely";
  if (temp < 15) return "Cool conditions - reduce irrigation frequency";
  return "Normal irrigation as per soil moisture";
}

function buildWeatherSummary(forecast) {
  const total = forecast.reduce((s, d) => s + d.rainfall_mm, 0);
  const maxT = Math.max(...forecast.map(d => d.temp_max));
  const minT = Math.min(...forecast.map(d => d.temp_min));
  const avgT = Math.round(forecast.reduce((s, d) => s + d.temp_avg, 0) / forecast.length);
  const rDays = forecast.filter(d => d.rainfall_mm > 1).length;
  let s = `Next 5 days: ${minT}-${maxT}°C (avg ${avgT}°C)`;
  if (total > 25) s += `, heavy rainfall (${Math.round(total)}mm, ${rDays} days) - postpone irrigation`;
  else if (total > 10) s += `, moderate rain (${Math.round(total)}mm, ${rDays} days) - reduce irrigation`;
  else if (total > 3) s += `, light rain possible (${Math.round(total)}mm)`;
  else s += `, mostly dry - maintain regular irrigation`;
  if (maxT > 40) s += `. ⚠️ EXTREME HEAT`; else if (maxT > 38) s += `. ⚠️ Heatwave expected`;
  if (minT < 10) s += `. ⚠️ COLD WARNING`;
  return s;
}

const WICONS = { Clear: "☀️", Clouds: "⛅", Rain: "🌧️", Drizzle: "🌦️", Thunderstorm: "⛈️", Snow: "❄️", Mist: "🌫️", Fog: "🌫️", default: "⛅" };

function updateWeatherCard(today, city) {
  if (!today) return;
  const s = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
  s("weatherIcon", WICONS[today.condition] || WICONS.default);
  s("weatherTemp", `${today.temp_min}-${today.temp_max}°C`);
  s("weatherHumidity", `💧 ${today.humidity_avg}%`);
  s("weatherRain", `🌧 ${today.rainfall_mm}mm`);
  s("weatherStatus", city || "Location detected");
}

/* ══════════════════════════════════
   FARM CONTEXT
══════════════════════════════════ */
const DEFAULT_FARM_CONTEXT = {
  crop: "", growth_stage: "Vegetative", irrigation_type: "Drip",
  soil_moisture: 40, temperature: 28, humidity: 60,
  soil_ph: 6.5, soil_electrical_conductivity: 1.2, soil_nutrients: "Moderate"
};
const SOIL_MOISTURE_MAP = { crumbles: 15, ball: 50, water: 85 };
const TEMPERATURE_MAP = { cool: 18, pleasant: 26, hot: 35, very_hot: 42 };
const HUMIDITY_MAP = { dry_air: 30, comfortable: 60, sticky: 75, very_humid: 90 };
const SOIL_PH_MAP = { acidic: 5.5, neutral: 6.8, alkaline: 7.8 };
const SOIL_EC_MAP = { low_salinity: 0.6, moderate_salinity: 1.2, high_salinity: 2.5 };

function setIfPresent(id, target) { const el = document.getElementById(id); if (el?.value?.trim()) target[id] = el.value.trim(); }
function mapSelect(sid, map, key, target) { const el = document.getElementById(sid); if (el?.value && map[el.value] !== undefined) target[key] = map[el.value]; }

function buildFarmContext() {
  const ctx = { ...DEFAULT_FARM_CONTEXT };
  // If IoT is live, use sensor data
  if (iotData) {
    ctx.soil_moisture = iotData.soil_moisture;
    ctx.temperature = iotData.temperature;
    ctx.humidity = iotData.humidity;
    ctx.soil_ph = iotData.soil_ph;
    ctx.soil_electrical_conductivity = iotData.soil_electrical_conductivity;
  }
  ["crop", "growth_stage", "irrigation_type", "soil_nutrients"].forEach(id => setIfPresent(id, ctx));
  if (!iotData) {
    mapSelect("soil_moisture_state", SOIL_MOISTURE_MAP, "soil_moisture", ctx);
    mapSelect("temperature_state", TEMPERATURE_MAP, "temperature", ctx);
    mapSelect("humidity_state", HUMIDITY_MAP, "humidity", ctx);
    mapSelect("soil_ph_state", SOIL_PH_MAP, "soil_ph", ctx);
    mapSelect("soil_ec_state", SOIL_EC_MAP, "soil_electrical_conductivity", ctx);
  }
  return ctx;
}

function buildWarnings(ctx) {
  const w = [];
  if (ctx.temperature > 38) w.push("EXTREME HEAT WARNING - Risk of severe crop damage");
  if (ctx.soil_electrical_conductivity > 2.5) w.push("HIGH SALINITY WARNING - Immediate action needed");
  if (ctx.soil_moisture < 20) w.push("SEVERE DROUGHT STRESS - Urgent irrigation required");
  if (ctx.soil_moisture > 85) w.push("WATERLOGGING RISK - Stop irrigation immediately");
  if (ctx.soil_ph > 7.8 || ctx.soil_ph < 5.5) w.push("EXTREME pH - Nutrient availability severely compromised");
  return w;
}

function saveFarmContext() {
  const ctx = buildFarmContext(), warnings = buildWarnings(ctx);
  setMoisture(ctx.soil_moisture); setStage(ctx.growth_stage);
  setAlerts(warnings); setHealthScore(calculateHealthScore(ctx));
  const btn = document.getElementById("saveContextBtn");
  if (btn) { const orig = btn.textContent; btn.textContent = "✓ Saved!"; btn.style.background = "var(--green)"; setTimeout(() => { btn.textContent = orig; btn.style.background = ""; }, 1500); }
  closeDrawer();
}


/* ══════════════════════════════════
   INTERPRETATIONS
══════════════════════════════════ */
function getSoilMoistureInterpretation(v) { if (v < 20) return "Very dry - urgent irrigation needed"; if (v < 35) return "Dry - irrigation recommended within 24 hours"; if (v < 45) return "Slightly dry - monitor closely"; if (v < 70) return "Optimal moisture - good for most crops"; if (v < 85) return "Moist - reduce irrigation"; return "Saturated - stop irrigation immediately"; }
function getTemperatureInterpretation(v) { if (v < 10) return "Very cold - frost risk"; if (v < 20) return "Cool - slow growth for warm crops"; if (v < 28) return "Optimal temperature range"; if (v < 35) return "Warm - increased water demand"; if (v < 40) return "Hot - heat stress likely"; return "Extreme heat - severe stress risk"; }
function getHumidityInterpretation(v) { if (v < 30) return "Very low - rapid water loss"; if (v < 50) return "Low - monitor soil moisture"; if (v < 70) return "Comfortable - ideal conditions"; if (v < 85) return "High - monitor for fungal diseases"; return "Very high - fungal disease risk"; }
function getSoilPHInterpretation(v) { if (v < 5.0) return "Strongly acidic - lime urgently needed"; if (v < 6.0) return "Acidic - affects nutrient availability"; if (v < 6.5) return "Slightly acidic - good for most crops"; if (v < 7.3) return "Neutral - ideal pH range"; if (v < 7.8) return "Slightly alkaline - monitor iron"; return "Alkaline - micronutrient deficiency risk"; }
function getSalinityInterpretation(v) { if (v < 0.8) return "Low salinity - safe for all crops"; if (v < 1.5) return "Moderate - suitable for most crops"; if (v < 2.0) return "Moderately high - some restrictions"; if (v < 3.0) return "High - yield reduction likely"; return "Very high - severe crop damage likely"; }
function getCropSpecificAdvice(crop, stage) {
  const db = { wheat: { baby: "Critical establishment - consistent moisture needed", vegetative: "Active tillering - high water and nitrogen demand", flowering: "Most sensitive stage - consistent moisture critical", "grain filling": "Moderate water needs - avoid lodging" }, rice: { baby: "Keep soil saturated but not waterlogged", vegetative: "Maintain standing water 2-5 cm", flowering: "Consistent water depth essential", "grain filling": "Reduce water gradually" }, tomato: { baby: "Moderate moisture, avoid overwatering", vegetative: "Consistent moisture for strong development", flowering: "Critical for fruit set - avoid water stress", fruiting: "High water demand for fruit quality" }, default: { baby: "Consistent moisture without waterlogging", vegetative: "Regular watering and nutrients needed", flowering: "Avoid water and heat stress", fruiting: "Maintain consistent moisture" } };
  const cd = db[(crop || "").toLowerCase()] || db.default, sl = (stage || "").toLowerCase();
  for (let s in cd) { if (sl.includes(s)) return cd[s]; } return cd[Object.keys(cd)[0]];
}

/* ══════════════════════════════════
   RESPONSE EXTRACTOR
══════════════════════════════════ */
function extractAIResponse(raw) {
  if (!raw?.trim()) return "No response from AI.";
  try {
    const d = JSON.parse(raw);
    if (Array.isArray(d)) return d[0]?.output || d[0]?.text || d[0]?.response || raw;
    return d.output || d.text || d.response || d.message || raw;
  } catch { return raw.replace(/\\n/g, "\n").replace(/\\"/g, '"').trim(); }
}

/* ══════════════════════════════════
   CHAT
══════════════════════════════════ */
function getTime() { return new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }); }
function escHtml(t) { return t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

function appendMessage(text, role, photoSrc = null) {
  const chat = document.getElementById("chat");
  if (!chat) return;
  const row = document.createElement("div");
  if (role === "system") {
    row.className = "msg-row msg-system";
    row.innerHTML = `<div class="bubble bubble-system">${text}</div>`;
    chat.appendChild(row); chat.scrollTop = chat.scrollHeight; return;
  }
  row.className = `msg-row msg-${role}`;
  const av = role === "ai" ? `<div class="av av-ai">🌾</div>` : `<div class="av av-user">👤</div>`;
  const imgHTML = photoSrc ? `<img class="bubble-img" src="${photoSrc}" alt="Crop photo" />` : "";
  const content = role === "ai"
    ? text.replace(/\\n/g, "\n").replace(/\n/g, "<br>").replace(/(⚠️[^<\n]*)/g, '<span class="resp-warning">$1</span>')
    : escHtml(text);

  const translateBtnHTML = role === "ai" ? `
    <div class="translate-trigger" title="Toggle Translation">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M5 8l6 6M4 14l6-6 2-3M2 5h12M7 2h1M22 22l-5-10-5 10M14 18h6" />
      </svg>
    </div>
  ` : "";

  row.innerHTML = `
    ${av}
    <div class="bubble bubble-${role}">
      ${translateBtnHTML}
      <div class="bubble-content">
        ${imgHTML}${role === "ai" ? content : `<p>${content}</p>`}
      </div>
      <span class="msg-time">${getTime()}</span>
    </div>
  `;

  // Safely store the original text to avoid HTML attribute corruption
  if (role === "ai") {
    row.querySelector('.bubble-content').setAttribute('data-original-text', text);
  }

  // Safely store the original text
  if (role === "ai") {
    const contentEl = row.querySelector('.bubble-content');
    contentEl.setAttribute('data-original-text', text);

    // Attach event listener directly instead of using onclick
    const tBtn = row.querySelector(".translate-trigger");
    if (tBtn) {
      tBtn.addEventListener('click', () => handleTranslation(tBtn));
    }
  }

  chat.appendChild(row); chat.scrollTop = chat.scrollHeight;

  // Auto-translate if a target language is selected
  if (role === "ai" && targetLanguage !== "en") {
    const btn = row.querySelector(".translate-trigger");
    if (btn) handleTranslation(btn, targetLanguage);
  }
}

// Export to window to ensure accessibility if needed
window.handleTranslation = handleTranslation;

/* ── TRANSLATION HANDLER ── */
async function handleTranslation(btn, forceLang = null) {
  const bubble = btn.closest('.bubble');
  const contentEl = bubble.querySelector('.bubble-content');
  const originalText = contentEl.getAttribute('data-original-text') || contentEl.getAttribute('data-original');

  if (!originalText) {
    dbg("❌ Translation failed: originalText missing", "#ff4444");
    return;
  }

  const lang = forceLang || (targetLanguage === 'en' ? 'hi' : targetLanguage);
  dbg(`🌐 Translating message to: ${lang}...`);

  // Toggle back to English if clicking the button while already in that language
  if (!forceLang && contentEl.getAttribute('data-translated-lang') === lang) {
    dbg("🔄 Reverting to English");
    contentEl.innerHTML = originalText.replace(/\\n/g, "\n").replace(/\n/g, "<br>").replace(/(⚠️[^<\n]*)/g, '<span class="resp-warning">$1</span>');
    contentEl.removeAttribute('data-translated-lang');
    btn.classList.remove('active');
    return;
  }

  // Skip if already translated to the target language (for batch updates)
  if (forceLang && contentEl.getAttribute('data-translated-lang') === lang) return;

  btn.classList.add('loading');
  contentEl.classList.add('translating');

  try {
    const cacheKey = `${lang}:${originalText.substring(0, 100)}`;
    let translated;

    if (translationsCache.has(cacheKey)) {
      translated = translationsCache.get(cacheKey);
      dbg("✨ Using cached translation");
    } else {
      translated = await translateText(originalText, lang);
      translationsCache.set(cacheKey, translated);
    }

    if (translated && translated !== originalText) {
      contentEl.innerHTML = translated.replace(/\n/g, "<br>").replace(/(⚠️[^<\n]*)/g, '<span class="resp-warning">$1</span>');
      contentEl.setAttribute('data-translated-lang', lang);
      btn.classList.add('active');
      dbg("✅ Translation complete");
    } else {
      dbg("⚠️ Translation returned original text (check API)", "#ffaa00");
      // Add a subtle system hint if it failed
      if (!translationsCache.has('hint_shown')) {
        appendMessage("💡 Public translation service is restricted or offline. Very long messages may also fail to translate fully.", "system");
        translationsCache.set('hint_shown', true);
      }
    }
  } catch (err) {
    dbg(`❌ Translation UI error: ${err.message}`, '#ff4444');
    appendMessage("❌ Translation failed. Check your internet connection.", "system");
  } finally {
    contentEl.classList.remove('translating');
    btn.classList.remove('loading');
  }
}

function showTyping() { const t = document.getElementById("typingIndicator"), c = document.getElementById("chat"); if (t) { t.hidden = false; if (c) c.scrollTop = c.scrollHeight; } }
function hideTyping() { const t = document.getElementById("typingIndicator"); if (t) t.hidden = true; }

/* ══════════════════════════════════
   TRANSLATION & TTS
══════════════════════════════════ */
async function translateText(text, lang = "hi") {
  if (!text || text.trim() === "") return "";

  const langMap = { 'hi': 'hi-IN', 'mr': 'mr-IN', 'gu': 'gu-IN', 'ta': 'ta-IN', 'en': 'en-GB' };
  const target = langMap[lang] || lang;

  // MyMemory has a ~1000 symbol limit per request. 
  // We split text into chunks to handle long AI responses.
  const chunks = text.match(/[^.!?\n]+[.!?\n]*/g) || [text];
  let fullTranslated = "";
  let currentGroup = "";
  const MAX_CHUNK = 800; // conservative limit

  dbg(`🛰️ Translating ${text.length} chars to ${target} in chunks...`);

  try {
    for (let chunk of chunks) {
      if ((currentGroup + chunk).length > MAX_CHUNK) {
        fullTranslated += await fetchTranslationChunk(currentGroup, lang);
        currentGroup = chunk;
      } else {
        currentGroup += chunk;
      }
    }
    if (currentGroup) {
      fullTranslated += await fetchTranslationChunk(currentGroup, lang);
    }
    return fullTranslated;
  } catch (err) {
    dbg(`❌ Public Translation Error: ${err.message}`, '#ff4444');
    return text; // fallback to original
  }
}

async function fetchTranslationChunk(text, lang) {
  if (!text.trim()) return "";
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|${lang}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (data.responseStatus !== 200) throw new Error(data.responseDetails);
  return data.responseData.translatedText || text;
}

function speakText(text, lang = "hi-IN") {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel(); // Stop current speech

  const utterance = new SpeechSynthesisUtterance(text);

  // Mapping for TTS
  const langMap = { 'hi': 'hi-IN', 'mr': 'mr-IN', 'gu': 'gu-IN', 'ta': 'ta-IN', 'en': 'en-IN' };
  const targetCode = langMap[lang] || lang;
  utterance.lang = targetCode;

  // Attempt to find a high-quality Indian voice
  const voices = window.speechSynthesis.getVoices();
  const indianVoice = voices.find(v => v.lang.startsWith(targetCode.substring(0, 2)) &&
    (v.name.includes("India") || v.name.includes("Google") || v.name.includes("Microsoft")));

  if (indianVoice) {
    utterance.voice = indianVoice;
    dbg(`🎙️ Using voice: ${indianVoice.name}`);
  }

  utterance.rate = 0.95; // Slightly slower for clarity
  utterance.pitch = 1.0;

  window.speechSynthesis.speak(utterance);
  dbg(`🔊 Playing voice (${targetCode}): ${text.substring(0, 30)}...`);
}

/* ══════════════════════════════════
   MAIN SEND
══════════════════════════════════ */
async function sendMessage() {
  const textarea = document.getElementById("message");
  const sendBtn = document.getElementById("sendBtn");
  const userMessage = textarea?.value?.trim();

  if (!userMessage && !currentPhoto) return;

  if (sendBtn) sendBtn.disabled = true;

  // Show user message (with photo if present)
  const photoPreviewSrc = currentPhoto ? document.getElementById("photoPreviewImg")?.src : null;
  appendMessage(userMessage || "📸 Please analyze this crop photo for diseases.", "user", photoPreviewSrc);

  if (textarea) { textarea.value = ""; textarea.style.height = "auto"; }

  const farm_context = buildFarmContext();
  const warnings = buildWarnings(farm_context);
  setMoisture(farm_context.soil_moisture);
  if (farm_context.growth_stage) setStage(farm_context.growth_stage);
  setAlerts(warnings);
  setHealthScore(calculateHealthScore(farm_context));

  // Fetch weather silently
  const weatherData = await getWeatherForecast();

  // Show typing ONLY now — just before hitting n8n
  showTyping();

  const payload = {
    chatInput: userMessage || "Please analyze the uploaded crop photo for diseases and provide treatment advice.",
    user_id: document.getElementById("user_id")?.value.trim() || "1",
    session_id: document.getElementById("session_id")?.value.trim() || "1",

    crop: farm_context.crop || "Not specified",
    stage: farm_context.growth_stage || "Vegetative",
    irrigation_type: farm_context.irrigation_type || "Drip",
    soil_moisture: farm_context.soil_moisture,
    temperature: farm_context.temperature,
    humidity: farm_context.humidity,
    ph: farm_context.soil_ph,
    ec: farm_context.soil_electrical_conductivity,
    soil_nutrients: farm_context.soil_nutrients,
    warnings: warnings.length > 0 ? warnings.join(" | ") : null,
    iot_live: !!iotData, // tells AI if data is from live sensors

    soil_moisture_status: getSoilMoistureInterpretation(farm_context.soil_moisture),
    temperature_status: getTemperatureInterpretation(farm_context.temperature),
    humidity_status: getHumidityInterpretation(farm_context.humidity),
    ph_status: getSoilPHInterpretation(farm_context.soil_ph),
    salinity_status: getSalinityInterpretation(farm_context.soil_electrical_conductivity),
    crop_stage_context: getCropSpecificAdvice(farm_context.crop, farm_context.growth_stage),

    today_weather: weatherData?.forecast?.[0]
      ? `${weatherData.forecast[0].temp_min}-${weatherData.forecast[0].temp_max}°C, Rain: ${weatherData.forecast[0].rainfall_mm}mm → ${weatherData.forecast[0].irrigation_recommendation}`
      : "Weather data unavailable",
    forecast: weatherData?.summary || "Forecast unavailable",
    location: userLocation,

    // Photo for disease detection (base64)
    image_data: currentPhoto?.base64 || null,
    image_type: currentPhoto?.type || null,
    image_filename: currentPhoto?.name || null,
    has_image: !!currentPhoto,
  };

  // Clear photo after attaching to payload
  const hadPhoto = !!currentPhoto;
  clearPhoto();

  dbg(`📤 → ${WEBHOOK_URL} | photo=${hadPhoto} | iot=${payload.iot_live}`);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 90000); // 90s for image processing

  try {
    const res = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    dbg(`📥 ${res.status} ${res.statusText}`, res.ok ? '#00ff88' : '#ff4444');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const raw = await res.text();
    dbg(`Body: ${raw.substring(0, 150)}`);
    const aiResponse = extractAIResponse(raw);
    appendMessage(aiResponse, "ai");

    // Input-aware behavior: if voice mode, translate and speak
    if (inputMode === "voice") {
      dbg(`🎤 Voice input detected - triggering translation and TTS in ${targetLanguage}`);
      const translated = await translateText(aiResponse, targetLanguage);
      speakText(translated, targetLanguage);
    }
  } catch (err) {
    clearTimeout(timeoutId);
    dbg(`❌ ${err.name}: ${err.message}`, '#ff4444');
    if (err.name === "AbortError") {
      appendMessage("⏱️ Request timed out. Image analysis can take longer — please try again.", "ai");
    } else if (err.message.includes('Failed to fetch') || err.message.includes('NetworkError')) {
      appendMessage(`❌ Cannot reach n8n.\n\n1. Is your workflow Active on n8n.cloud?\n2. Webhook: ${WEBHOOK_URL}`, "ai");
    } else {
      appendMessage(`❌ Error: ${err.message}`, "ai");
    }
  } finally {
    hideTyping();
    if (sendBtn) sendBtn.disabled = false;
  }
}

/* ══════════════════════════════════
   INIT
══════════════════════════════════ */
window.addEventListener("DOMContentLoaded", async () => {
  createDebugPanel();
  console.log("🌱 Farmer AI Assistant v4 initializing...");

  // Theme
  applyTheme(localStorage.getItem("krishi-theme") || "light");
  document.getElementById("themeToggle")?.addEventListener("click", () => {
    applyTheme(document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark");
  });

  // Drawer
  document.getElementById("contextToggleBtn")?.addEventListener("click", openDrawer);
  document.getElementById("drawerClose")?.addEventListener("click", closeDrawer);
  document.getElementById("drawerOverlay")?.addEventListener("click", closeDrawer);
  document.getElementById("saveContextBtn")?.addEventListener("click", saveFarmContext);

  // ── LANGUAGE SELECTOR ──
  const langBtn = document.getElementById("langBtn");
  const langDropdown = document.getElementById("langDropdown");
  const activeLangEl = document.getElementById("activeLang");

  langBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    langDropdown?.classList.toggle("active");
  });

  document.querySelectorAll(".lang-option").forEach(opt => {
    opt.addEventListener("click", () => {
      const lang = opt.getAttribute("data-lang");
      targetLanguage = lang;

      // Update UI
      document.querySelectorAll(".lang-option").forEach(o => o.classList.remove("active"));
      opt.classList.add("active");
      if (activeLangEl) activeLangEl.textContent = opt.textContent.split(' (')[0].substring(0, 3);

      langDropdown?.classList.remove("active");
      dbg(`🌍 Language changed to: ${lang}`);

      // Auto-translate all existing AI messages to the new language
      if (lang !== 'en') {
        document.querySelectorAll('.bubble-ai').forEach(bubble => {
          const btn = bubble.querySelector('.translate-trigger');
          if (btn) handleTranslation(btn, lang);
        });
      } else {
        // If switching back to English, reset all
        document.querySelectorAll('.bubble-ai').forEach(bubble => {
          const contentEl = bubble.querySelector('.bubble-content');
          const originalText = contentEl.getAttribute('data-original-text') || contentEl.getAttribute('data-original');
          const btn = bubble.querySelector('.translate-trigger');
          if (contentEl && originalText) {
            contentEl.innerHTML = originalText.replace(/\\n/g, "\n").replace(/\n/g, "<br>").replace(/(⚠️[^<\n]*)/g, '<span class="resp-warning">$1</span>');
            contentEl.removeAttribute('data-translated-lang');
            if (btn) btn.classList.remove('active');
          }
        });
      }
    });
  });

  window.addEventListener("click", () => {
    langDropdown?.classList.remove("active");
  });

  // Location + weather
  await getUserLocation();
  const weather = await getWeatherForecast();
  if (weather) {
    const el = document.getElementById("weatherStatus");
    if (el) el.textContent = `${weather.location} — Live`;
  }

  // Default dashboard
  setMoisture(40);
  setHealthScore(65);
  const hS = document.getElementById("healthStatus"), mS = document.getElementById("moistureStatus");
  if (hS) hS.textContent = "Fill farm context to calculate";
  if (mS) mS.textContent = "Using manual context";

  // ── PHOTO UPLOAD ──
  document.getElementById("photoInput")?.addEventListener("change", (e) => {
    if (e.target.files?.[0]) handlePhotoSelect(e.target.files[0]);
  });
  document.getElementById("photoRemoveBtn")?.addEventListener("click", clearPhoto);

  // Drag & drop photo onto chat
  const chatPanel = document.querySelector(".chat-panel");
  chatPanel?.addEventListener("dragover", (e) => { e.preventDefault(); chatPanel.style.outline = "2px dashed var(--accent)"; });
  chatPanel?.addEventListener("dragleave", () => { chatPanel.style.outline = ""; });
  chatPanel?.addEventListener("drop", (e) => {
    e.preventDefault(); chatPanel.style.outline = "";
    const file = e.dataTransfer.files?.[0];
    if (file?.type.startsWith("image/")) handlePhotoSelect(file);
  });

  // ── VOICE INPUT ──
  document.getElementById("micBtn")?.addEventListener("click", () => {
    if (isRecording) {
      stopVoiceRecording(true);
    } else {
      inputMode = "voice";
      startVoiceRecording();
    }
  });

  // ── IOT PANEL TOGGLE ──
  const iotPanel = document.getElementById("iotLivePanel");
  document.getElementById("iotTriggerBtn")?.addEventListener("click", () => {
    if (!iotPanel) return;
    const visible = iotPanel.style.display !== "none";
    iotPanel.style.display = visible ? "none" : "block";
    if (!visible && !iotInterval) { } // panel opened but mock not started yet
  });

  document.getElementById("iotDemoBtn")?.addEventListener("click", () => {
    if (iotInterval) stopIoTMock();
    else startIoTMock();
  });

  document.getElementById("iotStopBtn")?.addEventListener("click", () => {
    stopIoTMock();
    if (iotPanel) iotPanel.style.display = "none";
  });

  // ── SEND / ENTER ──
  const textarea = document.getElementById("message");
  if (textarea) {
    textarea.addEventListener("input", () => {
      textarea.style.height = "auto";
      textarea.style.height = Math.min(textarea.scrollHeight, 140) + "px";
    });
    textarea.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        inputMode = "text";
        sendMessage();
      }
    });
  }

  document.getElementById("sendBtn")?.addEventListener("click", (e) => {
    e.preventDefault();
    inputMode = "text";
    sendMessage();
  });
  document.getElementById("aiForm")?.addEventListener("submit", (e) => {
    e.preventDefault();
    inputMode = "text";
    sendMessage();
  });

  console.log("✅ Ready — Voice, Photo, IoT all initialized");
});