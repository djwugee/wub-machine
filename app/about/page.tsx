import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { ArrowLeft, Music, Cpu, Waves, Zap } from "lucide-react";
import Link from "next/link";

export default function AboutPage() {
  return (
    <main className="min-h-screen flex flex-col">
      <Header />

      <div className="relative z-10 flex-1 px-4 py-12">
        <div className="max-w-3xl mx-auto">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors mb-8"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to remixer
          </Link>

          <h1 className="text-4xl font-bold text-[var(--foreground)] mb-6">
            About The Wub Machine
          </h1>

          <div className="prose prose-invert max-w-none space-y-8">
            <div className="bg-[var(--card)] rounded-xl p-6 border border-[var(--border)]">
              <p className="text-lg text-[var(--muted-foreground)] leading-relaxed">
                The Wub Machine is an automagic music remixer that takes any song and 
                transforms it into dubstep or electro house - all running entirely 
                in your browser using the Web Audio API!
              </p>
            </div>

            <section>
              <h2 className="text-2xl font-semibold text-[var(--foreground)] mb-4">
                How It Works
              </h2>
              <div className="grid gap-4">
                <div className="bg-[var(--card)] rounded-xl p-5 border border-[var(--border)] flex gap-4">
                  <div className="p-3 rounded-lg bg-[var(--primary)]/10 h-fit">
                    <Music className="w-5 h-5 text-[var(--primary)]" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-[var(--foreground)] mb-1">
                      1. Audio Analysis
                    </h3>
                    <p className="text-sm text-[var(--muted-foreground)]">
                      Your song is analyzed to detect beats, tempo, key, and musical sections 
                      using digital signal processing techniques.
                    </p>
                  </div>
                </div>

                <div className="bg-[var(--card)] rounded-xl p-5 border border-[var(--border)] flex gap-4">
                  <div className="p-3 rounded-lg bg-[var(--secondary)]/10 h-fit">
                    <Cpu className="w-5 h-5 text-[var(--secondary)]" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-[var(--foreground)] mb-1">
                      2. Beat Matching
                    </h3>
                    <p className="text-sm text-[var(--muted-foreground)]">
                      The tempo is adjusted to match the target genre (140 BPM for dubstep, 
                      128 BPM for electro house) using time-stretching algorithms.
                    </p>
                  </div>
                </div>

                <div className="bg-[var(--card)] rounded-xl p-5 border border-[var(--border)] flex gap-4">
                  <div className="p-3 rounded-lg bg-[var(--accent)]/10 h-fit">
                    <Waves className="w-5 h-5 text-[var(--accent)]" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-[var(--foreground)] mb-1">
                      3. Sample Layering
                    </h3>
                    <p className="text-sm text-[var(--muted-foreground)]">
                      Genre-specific samples (wubs, synths, drums) are mixed with your 
                      original track based on the detected key and dynamics.
                    </p>
                  </div>
                </div>

                <div className="bg-[var(--card)] rounded-xl p-5 border border-[var(--border)] flex gap-4">
                  <div className="p-3 rounded-lg bg-green-500/10 h-fit">
                    <Zap className="w-5 h-5 text-green-500" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-[var(--foreground)] mb-1">
                      4. Final Mix
                    </h3>
                    <p className="text-sm text-[var(--muted-foreground)]">
                      Everything is mixed together with proper gain staging and 
                      exported as a downloadable WAV file.
                    </p>
                  </div>
                </div>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-[var(--foreground)] mb-4">
                Privacy
              </h2>
              <div className="bg-[var(--card)] rounded-xl p-6 border border-[var(--border)]">
                <p className="text-[var(--muted-foreground)]">
                  <strong className="text-[var(--foreground)]">Your music stays on your device.</strong>{" "}
                  All audio processing happens entirely in your browser using the Web Audio API. 
                  Your files are never uploaded to any server - they go directly from your 
                  computer to your speakers (and optionally, your downloads folder).
                </p>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-[var(--foreground)] mb-4">
                Credits
              </h2>
              <div className="bg-[var(--card)] rounded-xl p-6 border border-[var(--border)]">
                <p className="text-[var(--muted-foreground)] mb-4">
                  The Wub Machine was originally created by{" "}
                  <a
                    href="https://petersobot.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[var(--primary)] hover:underline"
                  >
                    Peter Sobot
                  </a>{" "}
                  in 2011 as a Python web application using the Echo Nest Remix API.
                </p>
                <p className="text-[var(--muted-foreground)]">
                  This version has been rebuilt as a fully client-side Next.js application, 
                  porting the original audio processing logic to run entirely in the browser 
                  using the Web Audio API.
                </p>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-[var(--foreground)] mb-4">
                Remix Styles
              </h2>
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="bg-[var(--card)] rounded-xl p-6 border border-[var(--border)]">
                  <h3 className="text-lg font-semibold text-[var(--foreground)] mb-2 flex items-center gap-2">
                    <Waves className="w-5 h-5 text-[var(--primary)]" />
                    Dubstep
                  </h3>
                  <ul className="text-sm text-[var(--muted-foreground)] space-y-1">
                    <li>140 BPM tempo</li>
                    <li>Heavy wobble bass (wubs)</li>
                    <li>Rhythmic build-ups and drops</li>
                    <li>Half-time drum patterns</li>
                  </ul>
                </div>

                <div className="bg-[var(--card)] rounded-xl p-6 border border-[var(--border)]">
                  <h3 className="text-lg font-semibold text-[var(--foreground)] mb-2 flex items-center gap-2">
                    <Zap className="w-5 h-5 text-[var(--secondary)]" />
                    Electro House
                  </h3>
                  <ul className="text-sm text-[var(--muted-foreground)] space-y-1">
                    <li>128 BPM tempo</li>
                    <li>Driving four-on-the-floor beats</li>
                    <li>Punchy synth bass lines</li>
                    <li>High-energy builds</li>
                  </ul>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>

      <Footer />
    </main>
  );
}
