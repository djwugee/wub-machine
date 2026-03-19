import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { WubMachine } from "@/components/wub-machine";

export default function HomePage() {
  return (
    <main className="min-h-screen flex flex-col">
      <Header />
      <WubMachine />
      <Footer />
    </main>
  );
}
