import type { PostHog } from "posthog-js";

export function setupCounter(element: HTMLButtonElement, posthog?: PostHog) {
  let counter = 0;
  const setCounter = (count: number) => {
    counter = count;
    element.innerHTML = `Count is ${counter}`;
  };
  element.addEventListener("click", () => {
    setCounter(counter + 1);
    posthog?.capture("counter_incremented", {
      counter_value: counter,
      interaction_source: "starter_counter",
    });
  });
  setCounter(0);
}
