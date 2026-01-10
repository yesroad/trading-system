import { PriceTape } from "@/components/PriceTape";
import { SystemGuardStatus } from "@/components/SystemGuardStatus";
import { TrackedSymbols } from "@/components/TrackedSymbols";

export default function Home() {
  return (
    <main className="mx-auto max-w-3xl p-6 space-y-6">
      <PriceTape />
      <TrackedSymbols />
      <SystemGuardStatus />
    </main>
  );
}