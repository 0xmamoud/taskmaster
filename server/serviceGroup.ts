import { ServiceInstance } from "./serviceInstance";
import type { Service } from "./types";

export class ServiceGroup {
  private instances: ServiceInstance[] = [];
  constructor(public serviceName: string, public config: Service) {
    for (let i = 0; i < config.numprocs; i++) {
      const instance = new ServiceInstance(serviceName, i + 1, config);
      this.instances.push(instance);
    }
  }

  async start(): Promise<void> {
    await Promise.all(this.instances.map((instance) => instance.start()));
  }

  async stop(): Promise<void> {
    await Promise.all(this.instances.map((instance) => instance.stop()));
  }

  async restart(): Promise<void> {
    await Promise.all(this.instances.map((instance) => instance.restart()));
  }

  getStates() {
    return this.instances.map((instance) => ({
      instanceId: instance.instanceId,
      state: instance.getState(),
    }));
  }
}
