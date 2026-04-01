import { exec } from "node:child_process";

const _wait = (time: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, time));

const typeText = "npm run build -w packages/susee-types";

async function build() {
  exec(typeText);
  await _wait(500);
}

build();
