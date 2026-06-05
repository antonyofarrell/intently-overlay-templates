const container = document.querySelector(".container");
const vertical = container.querySelector(".line.vertical");
const horizontal = container.querySelector(".line.horizontal");
const numRight = container.querySelector(".number-right");
const numBottom = container.querySelector(".number-bottom");
const crossPoint = container.querySelector(".cross-point");

// Replace 'cross-hair__column' with whatever class you want to trigger it
const TARGET_CLASS = "template-card";

document.addEventListener("mousemove", (e) => {
  // Check if the element under the cursor (or any of its parents) has the target class
  const isOverTarget = e.target.closest(`.${TARGET_CLASS}`);

  if (!isOverTarget) {
    container.style.opacity = "0";
    return;
  }

  container.style.opacity = "1";

  const x = e.clientX;
  const y = e.clientY;

  vertical.style.transform = `translateX(${x}px)`;
  horizontal.style.transform = `translateY(${y}px)`;

  numRight.style.transform = `translate(${x + 20}px, ${y - 30}px)`;
  numRight.textContent = `X: ${x}`;

  numBottom.style.transform = `translate(${x - 50}px, ${y + 10}px)`;
  numBottom.textContent = `Y: ${y}`;

  crossPoint.style.transform = `translate(${x}px, ${y}px)`;
});
