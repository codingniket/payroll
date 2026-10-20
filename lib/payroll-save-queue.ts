import type { PayrollJob } from "@/types/payroll";

export class PayrollSaveQueue {
  job: PayrollJob | null = null;
  private tail: Promise<unknown> = Promise.resolve();
  private failures = new Map<string, Error>();

  reset(job: PayrollJob) { this.job = job; this.failures.clear(); }
  enqueue(key: string, operation: (job: PayrollJob) => Promise<PayrollJob>) {
    const result = this.tail.then(async () => {
      if (!this.job) throw new Error("No payroll is loaded.");
      try {
        this.job = await operation(this.job);
        this.failures.delete(key);
        return this.job;
      } catch (error) {
        this.failures.set(key, error instanceof Error ? error : new Error("The change could not be saved."));
        throw error;
      }
    });
    this.tail = result.catch(() => undefined);
    return result;
  }
  async flush() {
    await this.tail;
    if (this.failures.size) throw this.failures.values().next().value;
    if (!this.job) throw new Error("No payroll is loaded.");
    return this.job;
  }
}
