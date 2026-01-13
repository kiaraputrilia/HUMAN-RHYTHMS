const sounds = {
    "beep.png": "beep.mp3",
    "car.png": "car.mp3",
    "carHorn.png": "carHorn.mp3",
    "chatter.png": "chatter1.mp3",
    "construction.png": "construction.mp3",
    "dog.png": "dog.mp3",
    "drilling.png": "drilling.mp3",
    "keys.png": "keys.mp3",
    "motorcycle.png": "motorcycle.mp3",
    "siren.png": "siren.mp3",
    "truck.png": "truck.mp3",
    "upstairs.png": "upstairs.mp3"
};

const images = Object.keys(sounds);
const activeTouches = {};
const maxSize = 1000;
const growthRate = 80;

// Web Audio API setup & preload
let audioContext = null;
const audioBuffers = {};
const audioLoadPromises = {}; // per-src promises

function ensureAudioContext() {
    if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
}

// Ensure a single audio buffer is loaded/decoded for given src
function ensureBufferFor(src) {
    ensureAudioContext();
    if (audioBuffers[src]) return Promise.resolve(audioBuffers[src]);
    if (audioLoadPromises[src]) return audioLoadPromises[src];

    audioLoadPromises[src] = fetch(src)
        .then(res => {
            if (!res.ok) throw new Error('Fetch failed: ' + res.status);
            return res.arrayBuffer();
        })
        .then(arrayBuffer => audioContext.decodeAudioData(arrayBuffer))
        .then(decoded => {
            audioBuffers[src] = decoded;
            delete audioLoadPromises[src];
            return decoded;
        })
        .catch(err => {
            console.error('Error loading audio', src, err);
            delete audioLoadPromises[src];
            throw err;
        });

    return audioLoadPromises[src];
}

// Ensure audio context can be resumed on first user gesture (some platforms require it)
function resumeAudioContextIfNeeded() {
    if (!audioContext) return;
    if (audioContext.state === 'suspended') {
        audioContext.resume().catch((e) => console.warn('AudioContext resume failed:', e));
    }
}

const touchArea = document.getElementById("touch-area");
if (!touchArea) {
    console.error('Element with id "touch-area" not found.');
}

// Create audio source + gain for a given audio file (returns an object with stop method)
function createPlayingSource(audioSrc, initialGain = 0.2, loop = true) {
    if (!audioContext) return null;
    const source = audioContext.createBufferSource();
    source.buffer = audioBuffers[audioSrc] || null;
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
                console.warn('BufferSource start failed:', err);
            }
        },
        stop: () => {
            try {
                source.stop && source.stop(0);
            } catch (err) {
                // ignore if already stopped
            }
            try {
                source.disconnect && source.disconnect();
                gainNode.disconnect && gainNode.disconnect();
            } catch (e) {}
        }
    };
}

// Touch handlers
touchArea && touchArea.addEventListener("touchstart", async (event) => {
    event.preventDefault();

    // make sure AudioContext exists and is resumed on user gesture
    ensureAudioContext();
    resumeAudioContextIfNeeded();

    for (let touch of event.changedTouches) {
        const id = touch.identifier;
        const x = touch.clientX;
        const y = touch.clientY;

        if (activeTouches[id]) continue;

        const index = Math.floor(Math.random() * images.length);
        const imgSrc = images[index];
        const audioSrc = sounds[imgSrc];

        const img = document.createElement("img");
        img.src = imgSrc;
        img.classList.add("touch-image");
        img.style.position = "absolute";
        img.style.width = "40px";
        img.style.height = "auto";
        img.style.left = `${x - 20}px`;
        img.style.top = `${y - 20}px`;
        document.body.appendChild(img);

        let rotationAngle = 0;
        const spinSpeed = Math.random() * 6 + 2;

        const touchRecord = {
            img,
            audioNode: null,
            startTime: Date.now(),
            rotationAngle,
            interval: null,
            x,
            y
        };

        touchRecord.interval = setInterval(() => {
            const duration = (Date.now() - touchRecord.startTime) / 1000;
            const newSize = Math.min(40 + duration * growthRate, maxSize);

            if (touchRecord.audioNode && touchRecord.audioNode.gainNode) {
                touchRecord.audioNode.gainNode.gain.value = Math.min(1, 0.2 + duration * 0.1);
            }

            touchRecord.rotationAngle += spinSpeed;
            img.style.transform = `rotate(${touchRecord.rotationAngle}deg)`;
            img.style.width = `${newSize}px`;
            img.style.left = `${x - newSize / 2}px`;
            img.style.top = `${y - newSize / 2}px`;
        }, 50);

        // start loading the audio for this touch (non-blocking)
        ensureBufferFor(audioSrc)
            .then(() => {
                // only start audio if the touch is still active
                if (!activeTouches[id]) return;
                const node = createPlayingSource(audioSrc, 0.2, true);
                if (node) {
                    try { node.start(); } catch (e) { console.warn('start failed', e); }
                    activeTouches[id].audioNode = node;
                }
            })
            .catch(() => {
                // audio failed — leave visual only
            });

        activeTouches[id] = touchRecord;
    }
}, { passive: false });

touchArea && touchArea.addEventListener("touchend", (event) => {
    for (let touch of event.changedTouches) {
        const id = touch.identifier;
        const entry = activeTouches[id];
        if (!entry) continue;

        clearInterval(entry.interval);
        if (entry.audioNode) {
            try { entry.audioNode.stop(); } catch (e) {}
        }
        // keep the image on screen, just remove active touch bookkeeping
        delete activeTouches[id];
    }
});

// Also handle touchcancel similar to touchend
touchArea && touchArea.addEventListener("touchcancel", (event) => {
    for (let touch of event.changedTouches) {
        const id = touch.identifier;
        const entry = activeTouches[id];
        if (!entry) continue;
        clearInterval(entry.interval);
        if (entry.audioNode) {
            try { entry.audioNode.stop(); } catch (e) {}
        }
        delete activeTouches[id];
    }
});