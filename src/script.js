const form = document.getElementById("aiForm");
const chat = document.getElementById("chat");
const loading = document.getElementById("loading");

const WEBHOOK_URL = "https://tanmay96.app.n8n.cloud/webhook-test/Ask";

// Default farm context (used ONLY if user never edits)
const DEFAULT_FARM_CONTEXT = {
  crop: "Tomato",
  growth_stage: "Vegetative",
  irrigation_type: "Drip",
  soil_moisture: 30,
  temperature: 28,
  humidity: 60,
  soil_ph: 6.5,
  soil_electrical_conductivity: 1.2,
  soil_nutrients: "Moderate"
};

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  loading.hidden = false;

  const userMessage = document.getElementById("message").value.trim();
  if (!userMessage) return;

  appendMessage(userMessage, "user");

  // Merge defaults + user overrides
  const farm_context = { ...DEFAULT_FARM_CONTEXT };

  Object.keys(farm_context).forEach((key) => {
    const el = document.getElementById(key);
    if (el && el.value !== "") {
      farm_context[key] = isNaN(el.value)
        ? el.value
        : Number(el.value);
    }
  });

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
    appendMessage(data.output || "No response.", "ai");

  } catch (err) {
    appendMessage("Error contacting AI.", "ai");
  } finally {
    loading.hidden = true;
    document.getElementById("message").value = ""; // ✅ only clear chat
  }
});

function appendMessage(text, role) {
  const bubble = document.createElement("div");
  bubble.className = `message ${role}`;
  bubble.textContent = text;
  chat.appendChild(bubble);
  chat.scrollTop = chat.scrollHeight;
}

