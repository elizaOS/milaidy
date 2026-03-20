import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BUILD_CLOUD_IMAGE_WORKFLOW = path.join(
  ROOT,
  ".github/workflows/build-cloud-image.yml",
);
const CLOUD_IMAGE_DOCKERFILE = path.join(ROOT, "deploy/Dockerfile");
const DEBIAN_CONTROL = path.join(ROOT, "packaging/debian/control");
const DEBIAN_COMPAT = path.join(ROOT, "packaging/debian/compat");
const ANDROID_RELEASE_WORKFLOW = path.join(
  ROOT,
  ".github/workflows/android-release.yml",
);
const APPLE_STORE_RELEASE_WORKFLOW = path.join(
  ROOT,
  ".github/workflows/apple-store-release.yml",
);
const UPDATE_HOMEBREW_WORKFLOW = path.join(
  ROOT,
  ".github/workflows/update-homebrew.yml",
);

describe("release support workflow drift", () => {
  it("builds the cloud full-ui image from the checked-in full app Dockerfile", () => {
    const workflow = fs.readFileSync(BUILD_CLOUD_IMAGE_WORKFLOW, "utf8");

    expect(workflow).toContain("type=raw,value=cloud-full-ui");
    expect(workflow).toContain("file: ./deploy/Dockerfile");
    expect(workflow).not.toContain("Dockerfile.cloud-full-ui");
  });

  it("does not require a checked-in .npmrc for the cloud image build", () => {
    const dockerfile = fs.readFileSync(CLOUD_IMAGE_DOCKERFILE, "utf8");

    expect(dockerfile).toContain("COPY package.json bun.lock* ./");
    expect(dockerfile).toContain(
      "COPY apps/app/electrobun/package.json ./apps/app/electrobun/package.json",
    );
    expect(dockerfile).toContain(
      "COPY deploy/cloud-agent-template/package.json ./deploy/cloud-agent-template/package.json",
    );
    expect(dockerfile).not.toContain("COPY package.json bun.lock* .npmrc ./");
  });

  it("declares the Debian debhelper compat level exactly once", () => {
    const control = fs.readFileSync(DEBIAN_CONTROL, "utf8");

    expect(control).toContain("debhelper-compat (= 13)");
    expect(fs.existsSync(DEBIAN_COMPAT)).toBe(false);
  });

  it("syncs Android Capacitor via the repo-supported app script", () => {
    const workflow = fs.readFileSync(ANDROID_RELEASE_WORKFLOW, "utf8");

    expect(workflow).toContain("working-directory: apps/app");
    expect(workflow).toContain("run: bun run cap:sync:android");
    expect(workflow).not.toContain("run: npx cap sync android");
  });

  it("syncs iOS Capacitor via the repo-supported app script", () => {
    const workflow = fs.readFileSync(APPLE_STORE_RELEASE_WORKFLOW, "utf8");

    expect(workflow).toContain("working-directory: apps/app");
    expect(workflow).toContain("run: bun run cap:sync:ios");
    expect(workflow).not.toContain("run: npx cap sync ios");
  });

  it("dispatches Homebrew updates to the actual tap repository", () => {
    const workflow = fs.readFileSync(UPDATE_HOMEBREW_WORKFLOW, "utf8");

    expect(workflow).toContain("repository: milady-ai/homebrew-tap");
    expect(workflow).not.toContain("repository: milady-ai/homebrew-milady");
  });
});
