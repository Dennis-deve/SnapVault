import { Phone } from "lucide-react";

export function Footer({ className = "" }: { className?: string }) {
  const currentYear = new Date().getFullYear();

  return (
    <footer className={`w-full py-6 px-4 ${className}`}>
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col items-center justify-center gap-2 animate-fade-in">
          <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
            <span>© {currentYear} DESTECH SOLUTIONS. All rights reserved.</span>
          </div>
          <div className="flex flex-row items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
            <Phone className="h-[18px] w-[18px] flex-shrink-0" />
            <a 
              href="tel:+233544216532" 
              className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors whitespace-nowrap"
            >
              +233 544 216 532
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
