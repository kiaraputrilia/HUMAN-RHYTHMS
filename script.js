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
let audioLoadPromise = null;

async function ensureAudioContextAndBuffers() {
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioLoadPromise) return audioLoadPromise;

    const loadPromises = Object.values(sounds).map(async (src) => {
        if (audioBuffers[src]) return;
        try {
            const res = await fetch(src);
            const arrayBuffer = await res.arrayBuffer();
            // decodeAudioData returns a Promise in modern browsers
            audioBuffers[src] = await audioContext.decodeAudioData(arrayBuffer);
        } catch (err) {
            console.error('Failed to load or decode', src, err);
        }
    });
    audioLoadPromise = Promise.all(loadPromises);
    return audioLoadPromise;
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

    // ensure context and buffers exist (user gesture)
    await ensureAudioContextAndBuffers();
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

        // create and start Web Audio source for this touch
        let audioNode = null;
        if (audioBuffers[audioSrc]) {
            audioNode = createPlayingSource(audioSrc, 0.2, true);
            if (audioNode) audioNode.start();
        } else {
            // If buffer isn't ready for some reason, wait and then start
            await ensureAudioContextAndBuffers();
            if (audioBuffers[audioSrc]) {
                audioNode = createPlayingSource(audioSrc, 0.2, true);
                if (audioNode) audioNode.start();
            }
        }

        let rotationAngle = 0;
        const spinSpeed = Math.random() * 6 + 2;

        const touchRecord = {
            img,
            audioNode,
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