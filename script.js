// =============================
// SUPABASE (global score counter)
// =============================
const SUPABASE_URL = "https://ryasxjrqxkjyukxdgfsu.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ5YXN4anJxeGtqeXVreGRnZnN1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgzMjIxMTQsImV4cCI6MjA4Mzg5ODExNH0.Jl1XlUojJEbZ9m8pQ33yocDFfC0CZSMhppSk5BI-a9g";

const supabaseClient =
  window.supabase?.createClient?.(SUPABASE_URL, SUPABASE_ANON_KEY) ?? null;

const scoreEl = document.getElementById("score-value");

async function loadScoreOnPageLoad() {
  if (!scoreEl) return;

  if (!supabaseClient) {
    console.warn(
      "Supabase client not available (did you include the CDN script?)"
    );
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
    console.warn(
      "Supabase client not available (CDN script not loaded?)"
    );
    return;
  }

  try {
    // Atomic increment via RPC
    const { data, error } = await supabaseClient.rpc("increment_counter");
    if (error) throw error;

    scoreEl.textContent = String(data);
    sessionStorage.setItem("hr_scored", "1");
  } catch (err) {
    console.error("Failed to increment score:", err);
  }
}

// Load score ASAP (works whether script is at bottom or not)
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", loadScoreOnPageLoad);
} else {
  loadScoreOnPageLoad();
}

// =============================
// ASSETS
// =============================
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

// =============================
// WEB AUDIO SETUP
// =============================
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
      try {
        const res = await fetch(src);
        const buf = await res.arrayBuffer();
        audioBuffers[src] = await audioContext.decodeAudioData(buf);
      } catch (err) {
        console.error("Failed to load/decode audio:", src, err);
      }
    })
  );

  return audioLoadPromise;
}

function resumeAudio() {
  if (!audioContext) return;
  if (audioContext.state === "suspended") {
    audioContext.resume().catch((e) =>
      console.warn("AudioContext resume failed:", e)
    );
  }
}

function createPlayingSource(audioSrc, initialGain = 0.2, loop = true) {
  if (!audioContext) return null;

  const buffer = audioBuffers[audioSrc];
  if (!buffer) {
    console.warn("Audio buffer missing for:", audioSrc);
    return null;
  }

  const source = audioContext.createBufferSource();
  source.buffer = buffer;
  source.loop = loop;

  const gainNode = audioContext.createGain();
  gainNode.gain.value = initialGain;

  source.connect(gainNode).connect(audioContext.destination);

  return {
    source,
    gainNode,
    start: () => {
      try {
        source.start(0);
      } catch (err) {
        console.warn("BufferSource start failed:", err);
      }
    },
    stop: () => {
      try { source.stop(0); } catch {}
      try {
        source.disconnect();
        gainNode.disconnect();
      } catch {}
    }
  };
}

// =============================
// TOUCH / VISUALS LOGIC
// =============================
const touchArea = document.getElementById("touch-area");
if (!touchArea) console.error('Element with id "touch-area" not found.');

const activeTouches = {};
const maxSize = 1000;
const growthRate = 80;

// ✅ ONE-TIME INIT (prevents “works once then stops”)
let initPromise = null;
function initOnceOnFirstTouch() {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    // increment score on first interaction (once per tab session)
    await incrementScoreOncePerSession();

    // load audio buffers + resume context
    await ensureAudioContextAndBuffers();
    resumeAudio();
  })();

  return initPromise;
}

// =============================
// BUTTON SAFETY (Back + Clear)
// =============================
function protectLinkFromCanvas(selector) {
  const el = document.querySelector(selector);
  if (!el) return;

  // stop touch from triggering the canvas logic
  el.addEventListener(
    "touchstart",
    (e) => {
      e.stopPropagation();
    },
    { passive: true }
  );

  // also stop pointer/mouse bubbling if it ever happens
  el.addEventListener("pointerdown", (e) => {
    e.stopPropagation();
  });

  // stop click bubble on desktop
  el.addEventListener("click", (e) => {
    e.stopPropagation();
  });
}

protectLinkFromCanvas(".back-btn");
protectLinkFromCanvas(".clear-btn");

// =============================
// CLEAR (dissolve visuals)
// =============================
function clearVisualsDissolve(durationMs = 8000) {
  const imgs = Array.from(document.querySelectorAll(".touch-image"));
  if (!imgs.length) return;

  // stop all active audio + timers
  Object.keys(activeTouches).forEach((id) => {
    const entry = activeTouches[id];
    if (!entry) return;
    clearInterval(entry.interval);
    entry.audioNode?.stop();
    delete activeTouches[id];
  });

  // randomize removal order
  imgs.sort(() => Math.random() - 0.5);

  // spread fades across total duration
  const step = Math.max(40, Math.floor(durationMs / imgs.length));

  imgs.forEach((img, i) => {
    setTimeout(() => {
      img.classList.add("is-fading");
      setTimeout(() => img.remove(), 950); // matches CSS transition (~900ms)
    }, i * step);
  });
}

const clearBtn = document.querySelector(".clear-btn");
if (clearBtn) {
  // mobile-first: touchstart
  clearBtn.addEventListener(
    "touchstart",
    (e) => {
      e.preventDefault();
      e.stopPropagation();

      const randomMs = Math.floor(5000 + Math.random() * 5000); // 5–10s
      clearVisualsDissolve(randomMs);
    },
    { passive: false }
  );

  // desktop fallback
  clearBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();

    const randomMs = Math.floor(5000 + Math.random() * 5000);
    clearVisualsDissolve(randomMs);
    });
}

// =============================
// TOUCH HANDLERS
// =============================
touchArea &&
  touchArea.addEventListener(
    "touchstart",
    async (event) => {
      event.preventDefault();

      // ✅ Make sure audio is ready (loads once, never gets stuck)
      try {
        await initOnceOnFirstTouch();
      } catch (e) {
        console.error("Init failed:", e);
        return;
      }

      for (const touch of event.changedTouches) {
        const id = touch.identifier;
        if (activeTouches[id]) continue;

        const x = touch.clientX;
        const y = touch.clientY;

        const imgSrc = images[Math.floor(Math.random() * images.length)];
        const audioSrc = sounds[imgSrc];

        // create visual
        const img = document.createElement("img");
        img.src = imgSrc;
        img.className = "touch-image";
        img.style.width = "40px";
        img.style.left = `${x - 20}px`;
        img.style.top = `${y - 20}px`;
        document.body.appendChild(img);

        // create audio
        const audioNode = createPlayingSource(audioSrc, 0.2, true);
        audioNode?.start();

        // animate / grow
        let rotationAngle = 0;
        const spinSpeed = Math.random() * 6 + 2;
        const startTime = Date.now();

        const interval = setInterval(() => {
          const t = (Date.now() - startTime) / 1000;
          const size = Math.min(40 + t * growthRate, maxSize);

          rotationAngle += spinSpeed;

          img.style.width = `${size}px`;
          img.style.left = `${x - size / 2}px`;
          img.style.top = `${y - size / 2}px`;
          img.style.transform = `rotate(${rotationAngle}deg)`;

          if (audioNode?.gainNode) {
            audioNode.gainNode.gain.value = Math.min(1, 0.2 + t * 0.1);
          }
        }, 50);

        activeTouches[id] = { img, audioNode, interval };
      }
    },
    { passive: false }
  );

touchArea &&
  touchArea.addEventListener("touchend", (event) => {
    for (const touch of event.changedTouches) {
      const entry = activeTouches[touch.identifier];
      if (!entry) continue;

      clearInterval(entry.interval);
      entry.audioNode?.stop();
      delete activeTouches[touch.identifier];
    }
  });

touchArea &&
  touchArea.addEventListener("touchcancel", (event) => {
    for (const touch of event.changedTouches) {
      const entry = activeTouches[touch.identifier];
      if (!entry) continue;

      clearInterval(entry.interval);
      entry.audioNode?.stop();
      delete activeTouches[touch.identifier];
    }
  });




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