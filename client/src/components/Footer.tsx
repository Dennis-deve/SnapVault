import { Phone } from "lucide-react";

export function Footer({ className = "" }: { className?: string }) {
  const currentYear = new Date().getFullYear();

  return (
    <footer className={`w-full py-6 px-4 ${className}`}>
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col items-center justify-center gap-2 animate-fade-in">
          <div className="text-sm text-gray-600 dark:text-gray-400">
            <span>© {currentYear} DESTECH SOLUTIONS. All rights reserved.</span>
          </div>
          <a 
            href="tel:+233544216532" 
            className="inline-flex flex-row items-center flex-nowrap gap-2 text-sm text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
          >
            <Phone className="h-[18px] w-[18px] flex-shrink-0 inline-block" />
            <span className="whitespace-nowrap inline-block">+233 544 216 532</span>
          </a>
        </div>
      </div>
    </footer>
  );
}
