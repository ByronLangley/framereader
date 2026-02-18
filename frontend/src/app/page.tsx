import { Header } from "@/components/layout/Header";
import { InputPanel } from "@/components/input/InputPanel";
import { QueuePanel } from "@/components/queue/QueuePanel";
import { ScriptPanel } from "@/components/script/ScriptPanel";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 p-4 lg:flex-row lg:p-6">
        {/* Left column: Input + Queue */}
        <div className="flex flex-col gap-6 lg:w-80 lg:shrink-0">
          <InputPanel />
          <QueuePanel />
        </div>
        {/* Right column: Script display */}
        <div className="flex-1">
          <ScriptPanel />
        </div>
      </main>
    </div>
  );
}
