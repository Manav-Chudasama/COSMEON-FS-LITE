// ============================================
// Docker Container Control Utility
// ============================================
// Allows the orchestrator to physically stop/start
// sibling Docker containers (storage nodes) via the
// Docker socket mounted at /var/run/docker.sock.
// ============================================

import Docker from "dockerode";

const STORAGE_MODE = process.env.STORAGE_MODE || "local";

// Only create Docker client in docker mode
const docker =
  STORAGE_MODE === "docker"
    ? new Docker({ socketPath: "/var/run/docker.sock" })
    : null;

// Map node names to their Docker container names
// These must match the `container_name` values in docker-compose.yml
const NODE_CONTAINER_MAP: Record<string, string> = {
  "ORBIT-1": "fs-lite-node-1",
  "ORBIT-2": "fs-lite-node-2",
  "ORBIT-3": "fs-lite-node-3",
  "ORBIT-4": "fs-lite-node-4",
  "ORBIT-5": "fs-lite-node-5",
};

/**
 * Stop a Docker container for the given node.
 * Returns true if the container was successfully stopped.
 */
export async function stopNodeContainer(nodeName: string): Promise<boolean> {
  if (!docker) {
    console.log(`[DOCKER-CTL] Skipping stop — not in Docker mode`);
    return false;
  }

  const containerName = NODE_CONTAINER_MAP[nodeName];
  if (!containerName) {
    console.error(`[DOCKER-CTL] No container mapping for node: ${nodeName}`);
    return false;
  }

  try {
    const container = docker.getContainer(containerName);
    await container.stop();
    console.log(`[DOCKER-CTL] ✗ Container "${containerName}" STOPPED`);
    return true;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    // If already stopped, treat as success
    if (msg.includes("is not running") || msg.includes("already stopped")) {
      console.log(
        `[DOCKER-CTL] Container "${containerName}" was already stopped`,
      );
      return true;
    }
    console.error(`[DOCKER-CTL] Failed to stop "${containerName}":`, msg);
    return false;
  }
}

/**
 * Start a Docker container for the given node.
 * Returns true if the container was successfully started.
 */
export async function startNodeContainer(nodeName: string): Promise<boolean> {
  if (!docker) {
    console.log(`[DOCKER-CTL] Skipping start — not in Docker mode`);
    return false;
  }

  const containerName = NODE_CONTAINER_MAP[nodeName];
  if (!containerName) {
    console.error(`[DOCKER-CTL] No container mapping for node: ${nodeName}`);
    return false;
  }

  try {
    const container = docker.getContainer(containerName);
    await container.start();
    console.log(`[DOCKER-CTL] ✓ Container "${containerName}" STARTED`);
    return true;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    // If already running, treat as success
    if (msg.includes("is already running") || msg.includes("already started")) {
      console.log(
        `[DOCKER-CTL] Container "${containerName}" was already running`,
      );
      return true;
    }
    console.error(`[DOCKER-CTL] Failed to start "${containerName}":`, msg);
    return false;
  }
}

/**
 * Check if a Docker container is running.
 */
export async function isNodeContainerRunning(
  nodeName: string,
): Promise<boolean> {
  if (!docker) return false;

  const containerName = NODE_CONTAINER_MAP[nodeName];
  if (!containerName) return false;

  try {
    const container = docker.getContainer(containerName);
    const info = await container.inspect();
    return info.State.Running;
  } catch {
    return false;
  }
}

/**
 * Get the container name for a node name.
 */
export function getContainerName(nodeName: string): string | undefined {
  return NODE_CONTAINER_MAP[nodeName];
}

/**
 * Check if Docker mode is active.
 */
export function isDockerMode(): boolean {
  return STORAGE_MODE === "docker" && docker !== null;
}
