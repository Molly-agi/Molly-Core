export default function PersonalityVideoPage() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <section className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6 sm:py-10">
        <header className="space-y-2">
          <p className="text-xs uppercase tracking-[0.2em] text-cyan-300">
            Personality Media
          </p>
          <h1 className="text-2xl font-semibold sm:text-3xl">
            Uploaded Video Preview
          </h1>
          <p className="text-sm text-slate-300">
            Web-optimized playback package generated from your uploaded clip.
          </p>
        </header>

        <div className="overflow-hidden rounded-2xl border border-slate-700 bg-black shadow-2xl">
          <video
            className="h-auto w-full"
            controls
            preload="metadata"
            playsInline
            poster="/molly-media/personality/poster.webp"
          >
            <source
              src="/molly-media/personality/grok-optimized.mp4"
              type="video/mp4"
            />
            <source
              src="/molly-media/personality/grok-optimized.webm"
              type="video/webm"
            />
            Your browser does not support embedded video.
          </video>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
          <p className="text-sm text-slate-300">
            Route: <span className="text-slate-100">/personality-video</span>
          </p>
          <p className="text-sm text-slate-300">
            Manifest:{' '}
            <span className="text-slate-100">
              /molly-media/personality/asset-manifest.json
            </span>
          </p>
          <a
            className="mt-2 inline-block text-sm text-cyan-300 underline underline-offset-2"
            href="/molly-media/personality/audio.m4a"
          >
            Download extracted audio
          </a>
        </div>
      </section>
    </main>
  );
}
