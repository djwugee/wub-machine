import { Heart } from "lucide-react";

export function Footer() {
  return (
    <footer className="relative z-10 w-full py-8 px-4 mt-auto">
      <div className="max-w-4xl mx-auto text-center">
        <div className="text-sm text-[var(--muted-foreground)]">
          <p className="flex items-center justify-center gap-1">
            Crafted with <Heart className="w-4 h-4 text-[var(--secondary)]" /> by{" "}
            <a
              href="https://petersobot.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--foreground)] hover:text-[var(--primary)] transition-colors"
            >
              Peter Sobot
            </a>
          </p>
          <p className="mt-2 text-xs">
            Ported to Next.js with client-side Web Audio processing
          </p>
        </div>
      </div>
    </footer>
  );
}
