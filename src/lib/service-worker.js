let registrationPromise;

function serviceWorkerAddress() {
  const workerUrl = new URL(
    `${import.meta.env.BASE_URL}sw.js`,
    window.location.origin,
  );
  const buildId = new URL(import.meta.url).pathname.split("/").at(-1);
  workerUrl.searchParams.set("build", buildId || "app");
  return workerUrl;
}

function waitForActivation(registration) {
  const worker = registration.installing || registration.waiting;
  if (!worker || worker.state === "activated") return Promise.resolve();

  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(
      () => reject(new Error("The RainFlix service worker did not start.")),
      10000,
    );
    const handleState = () => {
      if (worker.state === "activated") {
        window.clearTimeout(timeout);
        worker.removeEventListener("statechange", handleState);
        resolve();
      } else if (worker.state === "redundant") {
        window.clearTimeout(timeout);
        worker.removeEventListener("statechange", handleState);
        reject(new Error("The RainFlix service worker could not activate."));
      }
    };
    worker.addEventListener("statechange", handleState);
    handleState();
  });
}

export function registerRainFlixServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    return Promise.reject(
      new Error("This browser does not support the WebTorrent player."),
    );
  }

  if (!registrationPromise) {
    registrationPromise = navigator.serviceWorker
      .register(serviceWorkerAddress(), {
        scope: import.meta.env.BASE_URL,
        updateViaCache: "none",
      })
      .then(async (registration) => {
        await waitForActivation(registration);
        return registration.active
          ? registration
          : navigator.serviceWorker.ready;
      })
      .catch((error) => {
        registrationPromise = undefined;
        throw error;
      });
  }

  return registrationPromise;
}
