const spawnBtn = document.getElementById("spawn");
const clearBtn = document.getElementById("clear");

spawnBtn.onclick = () => {
  for (let i = 0; i < 15; i++) {
    const div = document.createElement("div");
    div.className = "touch-image";
    div.style.left = Math.random() * (window.innerWidth - 60) + "px";
    div.style.top = Math.random() * (window.innerHeight - 100) + "px";
    document.body.appendChild(div);
  }
};

clearBtn.onclick = () => {
  const imgs = [...document.querySelectorAll(".touch-image")];

  imgs.forEach((img, i) => {
    setTimeout(() => {
      img.classList.add("is-fading");
      setTimeout(() => img.remove(), 950);
    }, i * 200); // stagger = dissolve feeling
  });
};
