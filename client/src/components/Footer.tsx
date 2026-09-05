export function Footer({ className = "" }: { className?: string }) {
  const currentYear = new Date().getFullYear();

  return (
    <footer className={`w-full py-6 px-4 ${className}`}>
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col items-center justify-center gap-2 animate-fade-in">
          <div className="text-sm text-gray-600 dark:text-gray-400">
            <span>© {currentYear} SnapVault. All rights reserved.</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
