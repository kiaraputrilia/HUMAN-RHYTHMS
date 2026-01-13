// --------------------
// SUPABASE SCORE
// --------------------
const SUPABASE_URL = "https://ryasxjrqxkjyukxdgfsu.supabase.co";
const SUPABASE_ANON_KEY = "YOUR_ANON_KEY";

const supabaseClient =
  window.supabase?.createClient?.(SUPABASE_URL, SUPABASE_ANON_KEY) ?? null;

let didIncrementScore = false;

async function incrementScoreOncePerSession() {
  const scoreEl = document.getElementById("score-value");
  if (!scoreEl) return;
  if (didIncrementScore) return;

  if (!supabaseClient) return;

  try {
    const { data, error } = await supabaseClient.rpc("increment_counter");
    if (error) throw error;

    scoreEl.textContent = String(data);
    didIncrementScore = true;
  } catch (err) {
    console.error(err);
  }
}

// --------------------
// AUDIO + ASSETS
// --------------------
const S3_BASE = "https://desireinabowlofrice.s3.us-east-2.amazonaws.com/";
const sounds = {
  "beep.png": S3_BASE + "beep.mp3",
  "car.png": S3_BASE + "car.mp3",
  "carHorn.png": S3_BASE + "carHorn.mp3",
  "chatter.png": S3_BASE + "chatter1.mp3",
  "construction.png": S3_BASE + "construction.mp3",
  "dog.png": S3_BASE + "dog.mp3",
  "drilling.png": S3_BASE + "drilling.mp3",
  "keys.png": S3_BASE + "keys.mp3",
  "motorcycle.png": S3_BASE + "motorcycle.mp3",
  "siren.png": S3_BASE + "siren.mp3",
  "truck.png": S3_BASE + "truck.mp3",
  "upstairs.png": S3_BASE + "upstairs.mp3"
};

const images = Object.keys(sounds);
const activeTouches = {};
const maxSize = 1000;
const growthRate = 80;

let audioContext = null;
const audioBuffers = {};
let audioLoadPromise = null;

async function ensureAudioContextAndBuffers() {
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioLoadPromise) return audioLoadPromise;

  audioLoadPromise = Promise.all(
    Object.values(sounds).map(async (src) => {
      if (audioBuffers[src]) return;
      const res = await fetch(src);
      const buf = await res.arrayBuffer();
      audioBuffers[src] = await audioContext.decodeAudioData(buf);
    })
  );

  return audioLoadPromise;
}

function resumeAudio() {
  if (audioContext?.state === "suspended") {
    audioContext.resume();
  }
}

function createPlayingSource(src) {
  const source = audioContext.createBufferSource();
  source.buffer = audioBuffers[src];
  source.loop = true;

  const gain = audioContext.createGain();
  gain.gain.value = 0.2;

  source.connect(gain).connect(audioContext.destination);

  return {
    source,
    gain,
    start: () => source.start(),
    stop: () => {
      try { source.stop(); } catch {}
    }
  };
}

// --------------------
// TOUCH SURFACE
// --------------------
const touchArea = document.getElementById("touch-area");

touchArea.addEventListener(
  "touchstart",
  async (event) => {
    event.preventDefault();

    incrementScoreOncePerSession();

    await ensureAudioContextAndBuffers();
    resumeAudio();

    for (const touch of event.changedTouches) {
      const id = touch.identifier;
      if (activeTouches[id]) continue;

      const x = touch.clientX;
      const y = touch.clientY;

      const imgSrc = images[Math.floor(Math.random() * images.length)];
      const audioSrc = sounds[imgSrc];

      const img = document.createElement("img");
      img.src = imgSrc;
      img.className = "touch-image";
      img.style.width = "40px";
      img.style.left = `${x - 20}px`;
      img.style.top = `${y - 20}px`;
      document.body.appendChild(img);

      const audio = createPlayingSource(audioSrc);
      audio.start();

      const startTime = Date.now();
      const spin = Math.random() * 6 + 2;

      const interval = setInterval(() => {
        const t = (Date.now() - startTime) / 1000;
        const size = Math.min(40 + t * growthRate, maxSize);

        img.style.width = `${size}px`;
        img.style.left = `${x - size / 2}px`;
        img.style.top = `${y - size / 2}px`;
        img.style.transform = `rotate(${spin * t}deg)`;
        audio.gain.gain.value = Math.min(1, 0.2 + t * 0.1);
      }, 50);

      activeTouches[id] = { img, audio, interval };
    }
  },
  { passive: false }
);

touchArea.addEventListener("touchend", (event) => {
  for (const touch of event.changedTouches) {
    const entry = activeTouches[touch.identifier];
    if (!entry) continue;

    clearInterval(entry.interval);
    entry.audio.stop();
    delete activeTouches[touch.identifier];
  }
});

touchArea.addEventListener("touchcancel", (event) => {
  for (const touch of event.changedTouches) {
    const entry = activeTouches[touch.identifier];
    if (!entry) continue;

    clearInterval(entry.interval);
    entry.audio.stop();
    delete activeTouches[touch.identifier];
  }
});

// --------------------
// CLEAR SOUNDS (DISSOLVE)
// --------------------
const clearBtn = document.querySelector(".clear-btn");

function clearVisualsDissolve(duration = 12000) {
  const imgs = Array.from(document.querySelectorAll(".touch-image"));
  if (!imgs.length) return;

  Object.values(activeTouches).forEach((t) => {
    clearInterval(t.interval);
    t.audio.stop();
  });

  imgs.sort(() => Math.random() - 0.5);
  const step = Math.max(40, duration / imgs.length);

  imgs.forEach((img, i) => {
    setTimeout(() => {
      img.classList.add("is-fading");
      setTimeout(() => img.remove(), 900);
    }, i * step);
  });
}

if (clearBtn) {
  clearBtn.addEventListener(
    "touchstart",
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      clearVisualsDissolve();
    },
    { passive: false }
  );
}


