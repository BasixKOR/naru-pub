import { config } from "./config.js";
export async function connect() {
  const sdk = await import("https://naru.pub/sdk/1/naru.js");
  return sdk.createNaru({ site: config.site });
}
