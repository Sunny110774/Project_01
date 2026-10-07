import { closeResolvedAlerts } from "./src/lib/close-resolved-alerts";

export async function register() {
  if (process.env.NODE_ENV !== "development" || process.env.NEXT_RUNTIME !== "nodejs") return;

  const { generateDummyAlerts } = await import("./src/lib/dummy-alert-generator");
  const globalState = globalThis as typeof globalThis & { synopseDummyAlertTimer?: NodeJS.Timeout };
  if (globalState.synopseDummyAlertTimer) return;

  globalState.synopseDummyAlertTimer = setInterval(() => {
    void Promise.all([closeResolvedAlerts(), generateDummyAlerts(1)])
      .then(([, alerts]) => console.info("Hourly alert maintenance completed.", alerts[0]?.id))
      .catch((error: unknown) => console.error("Hourly development alert generation failed.", error));
  }, 60 * 60 * 1000);
  globalState.synopseDummyAlertTimer.unref();
  console.info("Hourly dummy alert generation enabled for development.");
}