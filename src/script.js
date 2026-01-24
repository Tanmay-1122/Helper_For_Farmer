const form = document.getElementById("aiForm");
const chat = document.getElementById("chat");
const loading = document.getElementById("loading");

const WEBHOOK_URL = "https://tanmay96.app.n8n.cloud/webhook-test/Ask";

/* ============================
   DEFAULT FARM CONTEXT
   Used if farmer does not edit
============================ */
const DEFAULT_FARM_CONTEXT = {
  crop: "Tomato",
  growth_stage: "Vegetative",
  irrigation_type: "Drip",
  soil_moisture: 40,               // %
  temperature: 28,                 // °C
  humidity: 60,                    // %
  soil_ph: 6.5,
  soil_electrical_conductivity: 1.2,
  soil_nutrients: "Moderate"
};

/* ============================
   HUMAN → NUMERIC TRANSLATIONS
============================ */

// Soil moisture mapping
const SOIL_MOISTURE_MAP = {
  "crumbles": 15,        // Dry
  "forms_ball": 50,      // Ideal
  "water_squeezes": 85   // Saturated
};

// Temperature mapping
const TEMPERATURE_MAP = {
  "cool": 18,
  "normal_warm": 26,
  "hot": 35
};

// Humidity mapping
const HUMIDITY_MAP = {
  "low": 35,
  "comfortable": 60,
  "very_humid": 85
};

// Soil pH mapping
const SOIL_PH_MAP = {
  "acidic": 5.5,
  "neutral": 6.8,
  "alkaline": 7.8
};

// Soil EC (salinity) mapping
const SOIL_EC_MAP = {
  "low": 0.6,
  "moderate": 1.2,
  "high": 2.5
};

/* ============================
   FORM SUBMIT
============================ */
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  loading.hidden = false;

  const userMessage = document.getElementById("message").value.trim();
  if (!userMessage) return;

  appendMessage(userMessage, "user");

  // Start with defaults
  const farm_context = { ...DEFAULT_FARM_CONTEXT };

  // Direct text inputs
  setIfPresent("crop", farm_context);
  setIfPresent("growth_stage", farm_context);
  setIfPresent("irrigation_type", farm_context);
  setIfPresent("soil_nutrients", farm_context);

  // Translated selects
  mapSelect("soil_moisture_select", SOIL_MOISTURE_MAP, "soil_moisture", farm_context);
  mapSelect("temperature_select", TEMPERATURE_MAP, "temperature", farm_context);
  mapSelect("humidity_select", HUMIDITY_MAP, "humidity", farm_context);
  mapSelect("soil_ph_select", SOIL_PH_MAP, "soil_ph", farm_context);
  mapSelect("soil_ec_select", SOIL_EC_MAP, "soil_electrical_conductivity", farm_context);

  const payload = {
    user_id: document.getElementById("user_id").value.trim(),
    session_id: document.getElementById("session_id").value.trim(),
    message: userMessage,
    farm_context
  };

  try {
    const res = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    appendMessage(data.output || "No response from AI.", "ai");

  } catch (err) {
    appendMessage("Error contacting AI backend.", "ai");
  } finally {
    loading.hidden = true;
    document.getElementById("message").value = "";
  }
});

/* ============================
   HELPERS
============================ */

function setIfPresent(id, target) {
  const el = document.getElementById(id);
  if (el && el.value.trim() !== "") {
    target[id] = el.value.trim();
  }
}

function mapSelect(selectId, map, targetKey, target) {
  const el = document.getElementById(selectId);
  if (el && el.value && map[el.value] !== undefined) {
    target[targetKey] = map[el.value];
  }
}

function appendMessage(text, role) {
  const bubble = document.createElement("div");
  bubble.className = `message ${role}`;
  bubble.textContent = text;
  chat.appendChild(bubble);
  chat.scrollTop = chat.scrollHeight;
}

