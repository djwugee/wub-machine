import { Github, Info } from "lucide-react";
import Link from "next/link";

export function Header() {
  return (
    <header className="relative z-10 w-full py-6 px-4">
      <div className="max-w-4xl mx-auto flex items-center justify-between">
        <Link href="/" className="flex items-center gap-3 group">
          <div className="relative">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[var(--primary)] to-[var(--secondary)] flex items-center justify-center text-[var(--primary-foreground)] font-bold text-xl">
              W
            </div>
            <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-[var(--primary)] to-[var(--secondary)] blur-lg opacity-50 group-hover:opacity-75 transition-opacity" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-[var(--foreground)]">
              The Wub Machine
            </h1>
            <p className="text-xs text-[var(--muted-foreground)]">
              Automagic Dubstep Remixer
            </p>
          </div>
        </Link>

        <nav className="flex items-center gap-2">
          <Link
            href="/about"
            className="p-2 rounded-lg text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors"
            title="About"
          >
            <Info className="w-5 h-5" />
          </Link>
          <a
            href="https://github.com/psobot/wub-machine"
            target="_blank"
            rel="noopener noreferrer"
            className="p-2 rounded-lg text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors"
            title="GitHub"
          >
            <Github className="w-5 h-5" />
          </a>
        </nav>
      </div>
    </header>
  );
}
