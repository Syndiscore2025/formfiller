import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="min-h-screen flex items-center justify-center p-4">
      <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-10 text-center max-w-lg w-full">
        <h1 className="text-3xl font-bold text-white mb-3">Business Funding</h1>
        <p className="text-violet-200 mb-8 text-sm leading-relaxed">
          Fast, secure, and paperless funding for your business.
          Get started in minutes.
        </p>
        <div className="flex flex-col gap-3">
          <Link
            href="/apply"
            className="w-full bg-violet-600 hover:bg-violet-500 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
          >
            Apply For Funding
          </Link>
          <Link
            href="/login"
            className="w-full bg-white/20 hover:bg-white/30 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
          >
            Agent Login
          </Link>
        </div>
      </div>
    </main>
  );
}

