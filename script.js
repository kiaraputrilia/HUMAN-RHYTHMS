// --- SUPABASE (global score counter) ---
const SUPABASE_URL = "https://ryasxjrqxkjyukxdgfsu.supabase.co";
const SUPABASE_ANON_KEY = "YOUR_ANON_KEY_HERE";

const supabaseClient =
  window.supabase?.createClient?.(SUPABASE_URL, SUPABASE_ANON_KEY) ?? null;

const scoreEl = document.getElementById("score-value");

async function loadScoreOnPageLoad() {
  if (!scoreEl) return;

  if (!supabaseClient) {
    console.warn("Supabase client not available (CDN script not loaded?)");
    scoreEl.textContent = "—";
    return;
  }

  try {
    const { data, error } = await supabaseClient
      .from("counter")
      .select("value")
      .eq("id", 1)
      .single();

    if (error) throw error;
    scoreEl.textContent = String(data.value);
  } catch (err) {
    console.error("Failed to load score:", err);
    scoreEl.textContent = "—";
  }
}

async function incrementScoreOncePerSession() {
  if (!scoreEl) return;
  if (sessionStorage.getItem("hr_scored") === "1") return;

  if (!supabaseClient) {
    console.warn("Supabase client not available (CDN script not loaded?)");
    return;
  }

  try {
    const { data, error } = await supabaseClient.rpc("increment_counter");
    if (error) throw error;

    scoreEl.textContent = String(data);
    sessionStorage.setItem("hr_scored", "1");
  } catch (err) {
    console.error("Failed to increment score:", err);
  }
}


// LOADING OVERLAY 

const loadingOverlay = document.getElementById("loading-overlay");

// Preload the PNGs so first touch shows visuals faster
function preloadImages() {
  const imgPromises = images.map((src) => {
    return new Promise((resolve) => {
      const im = new Image();
      im.onload = resolve;
      im.onerror = resolve; // don't block forever
      im.src = src;
    });
  });
  return Promise.all(imgPromises);
}

// Show loading immediately
if (loadingOverlay) loadingOverlay.classList.remove("hidden");

// Preload images on load
preloadImages().then(() => {
  // We *can* hide after images, but audio still loads on first tap.
  // So keep overlay until the first touch initializes audio.
  // (We'll hide it right after audio buffers finish loading.)
});


// Load score as soon as the page is ready
document.addEventListener("DOMContentLoaded", loadScoreOnPageLoad);


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
// LOADING OVERLAY HELPERS
// --------------------
const loadingEl = document.getElementById("loading"); // your overlay element
let isLoadingAudio = false;

function showLoading() {
  if (loadingEl) loadingEl.classList.remove("hidden");
}

function hideLoading() {
  if (loadingEl) loadingEl.classList.add("hidden");
}


// --------------------
// TOUCH SURFACE
// --------------------
const touchArea = document.getElementById("touch-area");

touchArea.addEventListener(
  "touchstart",
  async (event) => {
    event.preventDefault();

     // ✅ if we’re already loading, ignore touches
    if (isLoadingAudio) return;

    incrementScoreOncePerSession();

        // ✅ start loading UI BEFORE awaiting
    isLoadingAudio = true;
    showLoading();

        try {
        await ensureAudioContextAndBuffers();
    resumeAudio();

    } finally {
      // ✅ always hide even if something errors
      hideLoading();
      isLoadingAudio = false;
    }

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

if (clearBtn) {
  clearBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();

    const randomMs = Math.floor(5000 + Math.random() * 5000); // 5–10 seconds
    clearVisualsDissolve(randomMs);
  });
}

function clearVisualsDissolve(duration = 8000) {
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



// const sounds = {
//     "beep.png": "beep.mp3",
//     "car.png": "car.mp3",
//     "carforn.png": "carHorn.mp3",
//     "chatter.png": "chatter1.mp3",
//     "construction.png": "construction.mp3",
//     "dog.png": "dog.mp3",
//     "drilling.png": "drilling.mp3",
//     "keys.png": "keys.mp3",
//     "motorcycle.png": "motorcycle.mp3",
//     "siren.png": "siren.mp3",
//     "truck.png": "truck.mp3",
//     "upstairs.png": "upstairs.mp3"
// };

// const images = Object.keys(sounds);
// const activeTouches = {};
// const maxSize = 1000;
// const growthRate = 80;

// document.getElementById("touch-area").addEventListener("touchstart", (event) => {
//     event.preventDefault(); // Prevent default touch behaviors like scrolling
//     for (let touch of event.touches) {
//         const id = touch.identifier;
//         const x = touch.clientX;
//         const y = touch.clientY;

//         if (!activeTouches[id]) {
//             const index = Math.floor(Math.random() * images.length);
//             const imgSrc = images[index];
//             const audioSrc = sounds[imgSrc];

//             const img = document.createElement("img");
//             img.src = imgSrc;
//             img.classList.add("touch-image");

//             img.style.position = "absolute";
//             img.style.width = "40px";
//             img.style.height = "auto"; // Keeps aspect ratio
//             img.style.left = `${x - 20}px`; // Center it
//             img.style.top = `${y - 20}px`; // Center it
//             document.body.appendChild(img);

//             const audio = new Audio(audioSrc); // Create a new audio instance for each touch
//             audio.loop = true;
//             audio.volume = 0.2;

//             let rotationAngle = 0;
//             const spinSpeed = Math.random() * 6 + 2;

//             activeTouches[id] = {
//                 img,
//                 audio,
//                 startTime: Date.now(),
//                 rotationAngle,
//                 interval: setInterval(() => {
//                     let duration = (Date.now() - activeTouches[id].startTime) / 1000;
//                     let newSize = Math.min(40 + duration * growthRate, maxSize);
//                     audio.volume = Math.min(1, 0.2 + duration * 0.1);

//                     rotationAngle += spinSpeed;
//                     img.style.transform = `rotate(${rotationAngle}deg)`;

//                     img.style.width = `${newSize}px`;
//                     img.style.left = `${x - newSize / 2}px`;
//                     img.style.top = `${y - newSize / 2}px`;
//                 }, 50),
//             };

//             audio.play(); // Play the audio for this touch
//         }
//     }
// });

// document.getElementById("touch-area").addEventListener("touchend", (event) => {
//     for (let touch of event.changedTouches) {
//         const id = touch.identifier;
//         if (activeTouches[id]) {
//             clearInterval(activeTouches[id].interval);
//             activeTouches[id].audio.pause();
//             delete activeTouches[id]; // Only delete the touch entry, keep the image on the screen
//         }
//     }
// });



// const sounds = {
//     "beep.png": "beep.mp3",
//     "car.png": "car.mp3",
//     "carHorn.png": "carHorn.mp3",
//     "chatter.png": "chatter1.mp3",
//     "construction.png": "construction.mp3",
//     "dog.png": "dog.mp3",
//     "drilling.png": "drilling.mp3",
//     "keys.png": "keys.mp3",
//     "motorcycle.png": "motorcycle.mp3",
//     "siren.png": "siren.mp3",
//     "truck.png": "truck.mp3",
//     "upstairs.png": "upstairs.mp3"
// };

// const images = Object.keys(sounds);
// const activeTouches = {};
// const drawnImages = [];
// const maxSize = 1000;
// const growthRate = 80;

// const canvas = document.getElementById('touch-area');
// const ctx = canvas.getContext('2d');

// canvas.width = window.innerWidth;
// canvas.height = window.innerHeight;

// const resizeCanvas = () => {
//     canvas.width = window.innerWidth;
//     canvas.height = window.innerHeight;
//     redraw();
// };
// window.addEventListener('resize', resizeCanvas);

// const drawImage = (img, x, y, size, rotation) => {
//     ctx.save();
//     ctx.translate(x, y);
//     ctx.rotate(rotation * Math.PI / 180);
//     ctx.drawImage(img, -size / 2, -size / 2, size, size * img.height / img.width); // Maintain aspect ratio
//     ctx.restore();
// };

// const redraw = () => {
//     ctx.clearRect(0, 0, canvas.width, canvas.height);
//     for (const { img, x, y, size, rotation } of drawnImages) {
//         drawImage(img, x, y, size, rotation);
//     }
// };

// let audioContext;
// document.body.addEventListener('click', () => {
//     if (!audioContext) {
//         audioContext = new (window.AudioContext || window.webkitAudioContext)();
//     }
// }, { once: true });

// document.getElementById('touch-area').addEventListener('touchstart', (event) => {
//     event.preventDefault(); // Prevent default touch behaviors like scrolling
//     for (let touch of event.touches) {
//         const id = touch.identifier;
//         const x = touch.clientX;
//         const y = touch.clientY;

//         if (!activeTouches[id]) {
//             const index = Math.floor(Math.random() * images.length);
//             const imgSrc = images[index];
//             const audioSrc = sounds[imgSrc];

//             const img = new Image();
//             img.src = imgSrc;

//             const audio = new Audio(audioSrc); // Create a new audio instance for each touch
//             audio.loop = true;
//             audio.volume = 0.2;

//             let rotationAngle = 0;
//             const spinSpeed = Math.random() * 6 + 2;

//             activeTouches[id] = {
//                 img,
//                 audio,
//                 x,
//                 y,
//                 startTime: Date.now(),
//                 rotationAngle,
//                 spinSpeed,
//                 interval: setInterval(() => {
//                     let duration = (Date.now() - activeTouches[id].startTime) / 1000;
//                     let newSize = Math.min(40 + duration * growthRate, maxSize);
//                     activeTouches[id].rotationAngle += spinSpeed;
//                     audio.volume = Math.min(1, 0.2 + duration * 0.1);
//                     redraw();
//                     drawImage(img, x, y, newSize, activeTouches[id].rotationAngle);
//                 }, 50),
//             };

//             audio.play().catch(error => {
//                 console.log('Audio play failed:', error);
//             }); // Play the audio for this touch
//         }
//     }
// });

// document.getElementById('touch-area').addEventListener('touchend', (event) => {
//     for (let touch of event.changedTouches) {
//         const id = touch.identifier;
//         if (activeTouches[id]) {
//             clearInterval(activeTouches[id].interval);
//             activeTouches[id].audio.pause();
//             let duration = (Date.now() - activeTouches[id].startTime) / 1000;
//             let finalSize = Math.min(40 + duration * growthRate, maxSize);
//             drawnImages.push({
//                 img: activeTouches[id].img,
//                 x: activeTouches[id].x,
//                 y: activeTouches[id].y,
//                 size: finalSize,
//                 rotation: activeTouches[id].rotationAngle,
//             });
//             delete activeTouches[id]; // Only delete the touch entry, keep the image on the screen
//         }
//     }
//     redraw();
// });

// document.getElementById('mute').addEventListener('click', () => {
//     for (let id in activeTouches) {
//         if (activeTouches[id]) {
//             clearInterval(activeTouches[id].interval);
//             activeTouches[id].audio.pause();
//             delete activeTouches[id];
//         }
//     }
//     drawnImages.length = 0;
//     ctx.clearRect(0, 0, canvas.width, canvas.height); // Clear the canvas
// });

// document.getElementById('save-recording').addEventListener('click', () => {
//     const link = document.createElement('a');
//     link.download = 'human_rhythms.png';
//     link.href = canvas.toDataURL();
//     link.click();
// });

// // Initial draw
// resizeCanvas();