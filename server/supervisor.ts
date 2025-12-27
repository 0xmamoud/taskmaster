import type { Service, Config } from "./types";
import { ServiceGroup } from "./serviceGroup.js";
export class Supervisor {
  private readonly serviceGroups: Map<string, ServiceGroup> = new Map();
  private config: Config;

  constructor(config: Config) {
    this.config = config;
    for (const [name, service] of Object.entries(config.services)) {
      const serviceGroup = new ServiceGroup(name, service);
      this.serviceGroups.set(name, serviceGroup);
    }
  }

  // Start all services with autostart = true
  async start(): Promise<void> {
    const autoStartPromises = Array.from(this.serviceGroups.entries())
      .filter(([_, group]) => group.config.autostart)
      .map(([_, group]) => group.start());

    await Promise.all(autoStartPromises);
  }

  getStates(): string {
    let result = "";
    for (const [name, group] of this.serviceGroups) {
      const states = group.getStates();
      for (const state of states) {
        result += `${name}#${state.instanceId} ${state.state}\n`;
      }
    }
    return result;
  }

  async startService(
    serviceName: string
  ): Promise<{ name: string; instances: number } | null> {
    const group = this.serviceGroups.get(serviceName);
    if (!group) return null;

    await group.start();
    return {
      name: serviceName,
      instances: group.getStates().length,
    };
  }

  async stopService(serviceName: string): Promise<string | null> {
    const group = this.serviceGroups.get(serviceName);
    if (!group) return null;

    await group.stop();
    return serviceName;
  }

  async restartService(
    serviceName: string
  ): Promise<{ name: string; instances: number } | null> {
    const group = this.serviceGroups.get(serviceName);
    if (!group) return null;

    await group.restart();
    return {
      name: serviceName,
      instances: group.getStates().length,
    };
  }

  async reloadConfig(newConfig: Config): Promise<{
    removed: string[];
    modified: string[];
    added: string[];
  }> {
    const oldServices = this.config.services;
    const newServices = newConfig.services;

    const { removed, modified, added } = this.identifyChanges(
      oldServices,
      newServices
    );

    this.config = newConfig;

    await this.stopServices([...removed, ...modified]);

    removed.forEach((name) => this.serviceGroups.delete(name));

    await this.createAndStartServices([...modified, ...added], newServices);

    return { removed, modified, added };
  }

  private identifyChanges(
    oldServices: Record<string, Service>,
    newServices: Record<string, Service>
  ) {
    const removed = Object.keys(oldServices).filter(
      (name) => !(name in newServices)
    );

    const modified = Object.keys(newServices).filter((name) => {
      if (!(name in oldServices)) return false;
      return (
        JSON.stringify(oldServices[name]) !== JSON.stringify(newServices[name])
      );
    });

    const added = Object.keys(newServices).filter(
      (name) => !(name in oldServices)
    );

    return { removed, modified, added };
  }

  private async stopServices(serviceNames: string[]): Promise<void> {
    await Promise.all(
      serviceNames.map(async (name) => {
        const group = this.serviceGroups.get(name);
        if (group) {
          await group.stop();
        }
      })
    );
  }

  private async createAndStartServices(
    serviceNames: string[],
    services: Record<string, Service>
  ): Promise<void> {
    await Promise.all(
      serviceNames.map(async (name) => {
        const serviceConfig = services[name];
        if (!serviceConfig) return;

        const serviceGroup = new ServiceGroup(name, serviceConfig);
        this.serviceGroups.set(name, serviceGroup);

        if (serviceConfig.autostart) {
          await serviceGroup.start();
        }
      })
    );
  }

  exit(): void {}
}
